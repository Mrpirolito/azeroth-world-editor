import { z } from 'zod';
import type { SetIssue } from '../tiersets/rows';

export const MODEL_KINDS = ['mount', 'companion', 'npc'] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

export const KIND_INFO: Record<ModelKind, { label: string; blurb: string }> = {
  mount: { label: 'Mount', blurb: 'A rideable creature: a learn-on-use item teaches a mount spell that mounts the player on it.' },
  companion: { label: 'Companion pet', blurb: 'A non-combat pet: a learn-on-use item teaches a summon spell for it.' },
  npc: { label: 'NPC', blurb: 'A creature that only needs the new look: no spell or item.' },
};

export const wizardSchema = z.object({
  kind: z.enum(MODEL_KINDS),
  name: z.string().min(1).max(60),
  scale: z.number().positive().max(50),
  /** Mount: extra ground speed in percent (aura 32); 0 adds none */
  speed: z.number().int().min(0).max(1000),
  /** Mount: flying (aura 207) at `flightSpeed` percent */
  flying: z.boolean(),
  flightSpeed: z.number().int().min(0).max(1000),
  /** The look of the item in the bags (ItemDisplayInfo); 0 until picked */
  itemDisplayId: z.number().int().min(0),
});
export type WizardDraft = z.infer<typeof wizardSchema>;

export const wizardFilesSchema = z.array(z.object({ name: z.string().min(1).max(260), data: z.string().max(40_000_000) })).max(40);
export type WizardFile = z.infer<typeof wizardFilesSchema>[number];

export const newDraft = (kind: ModelKind): WizardDraft => ({ kind, name: '', scale: 1, speed: 60, flying: false, flightSpeed: 0, itemDisplayId: 0 });

export const WOTLK_M2_VERSION = 264;
export const MAX_TEXTURES = 3;

export const cleanName = (name: string): string => name.replace(/[^A-Za-z0-9]+/g, '');
export const filePrefix = (name: string): string => `CoA_${cleanName(name)}`;
export const modelDir = (name: string): string => `Creature\\${filePrefix(name)}`;

const word = (b: Uint8Array, at: number): number => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
const magic = (b: Uint8Array, text: string): boolean => b.length >= text.length && [...text].every((c, i) => b[i] === c.charCodeAt(0));
const ext = (file: string): string => /\.([^.\\/]+)$/.exec(file)?.[1]?.toLowerCase() ?? '';

/** What is wrong with one picked file: its extension, and for the formats the client reads, its header */
export function checkModelFile(file: string, bytes: Uint8Array): SetIssue[] {
  const e = ext(file);
  const err = (message: string): SetIssue[] => [{ severity: 'error', message: `${file}: ${message}` }];
  if (e === 'm2') {
    if (!magic(bytes, 'MD20')) return err('not an M2 model (it must start with MD20).');
    const v = bytes.length >= 8 ? word(bytes, 4) : 0;
    return v === WOTLK_M2_VERSION ? [] : [{ severity: 'warning', message: `${file}: M2 version ${v}; the 3.3.5a client reads version ${WOTLK_M2_VERSION}.` }];
  }
  if (e === 'skin') return magic(bytes, 'SKIN') ? [] : err('not a .skin file.');
  if (e === 'blp') return magic(bytes, 'BLP2') ? [] : err('not a BLP2 texture.');
  return err('only .m2, .skin and .blp files are used.');
}

/** The archive path each picked file is stored under (null: not used), and the texture names CreatureDisplayInfo uses for the BLPs */
export function placeFiles(name: string, files: readonly { name: string }[]): { paths: (string | null)[]; textures: string[]; issues: SetIssue[] } {
  const dir = modelDir(name);
  const base = filePrefix(name);
  const issues: SetIssue[] = [];
  const textures: string[] = [];
  const paths = files.map((f) => {
    const e = ext(f.name);
    if (e === 'm2') return `${dir}\\${base}.m2`;
    if (e === 'skin') return `${dir}\\${base}${/(\d{2})\.skin$/i.exec(f.name)?.[1] ?? '00'}.skin`;
    if (e !== 'blp') return null;
    if (textures.length >= MAX_TEXTURES) {
      issues.push({ severity: 'error', message: `${f.name}: a look has at most ${MAX_TEXTURES} textures.` });
      return null;
    }
    textures.push(`${base}_Tex${textures.length + 1}`);
    return `${dir}\\${textures[textures.length - 1]}.blp`;
  });
  const count = (e: string): number => files.filter((f) => ext(f.name) === e).length;
  if (count('m2') !== 1) issues.push({ severity: 'error', message: `Pick exactly one .m2 model (${count('m2')} picked).` });
  if (count('skin') === 0) issues.push({ severity: 'warning', message: 'No .skin file picked: the client needs <model>00.skin next to the model.' });
  if (textures.length === 0) issues.push({ severity: 'warning', message: 'No .blp texture picked: the model must carry its own textures.' });
  return { paths, textures, issues };
}
