import type { DbcValue } from '../game/dbc-file';
import { fieldIndex, layoutOf } from '../game/dbc-formats';
import { newItem, newNpc, type CustomItem, type CustomNpc } from '../entities/model';
import { SPELL_FILE_NAME, blankSpell, EFFECT_KEYS, pointsFor, withEffect, withSpell, type SpellRecord } from '../spells/model';
import type { Row } from '../tables/types';
import { filePrefix, modelDir, type ModelKind, type WizardDraft } from './model';

export const MODEL_FILE = 'CreatureModelData.dbc';
export const DISPLAY_FILE = 'CreatureDisplayInfo.dbc';

export const AURA_MOUNTED = 78;
export const AURA_MOUNTED_SPEED = 32;
export const AURA_MOUNTED_FLIGHT_SPEED = 207;
export const EFFECT_APPLY_AURA = 6;
export const EFFECT_SUMMON = 28;
/** The SummonProperties record of non-combat pets */
export const SUMMON_PROPERTIES_COMPANION = 41;
/** The "Learning" spell an item casts before it teaches its mount or companion spell on use */
export const SPELL_LEARNING = 483;
export const TRIGGER_USE = 0;
export const TRIGGER_LEARN = 6;
/** Spells whose records are the pattern for a new mount or companion spell */
export const PATTERN_SPELL = { mount: 23221, companion: 4055 } as const;

const MODEL_FIELDS = layoutOf(MODEL_FILE)!.fields;
const DISPLAY_FIELDS = layoutOf(DISPLAY_FILE)!.fields;
const blank = (fields: readonly { kind: string }[]): DbcValue[] => fields.map((f) => (f.kind === 's' ? '' : 0));

export interface Ids { modelData: number; display: number; creature: number; spell: number; item: number }
export interface Bases { modelData?: readonly DbcValue[]; display?: readonly DbcValue[]; spell?: readonly DbcValue[] }
type Learnable = WizardDraft & { kind: 'mount' | 'companion' };

/** A `CreatureModelData` record: the model path (the client reads `.mdx` for an M2), the scale and a collision box that fits a mount or a pet */
export function buildModelData(base: readonly DbcValue[] | undefined, id: number, draft: WizardDraft): DbcValue[] {
  const out = base ? [...base] : blank(MODEL_FIELDS);
  const set = (name: string, v: DbcValue): void => { out[fieldIndex(MODEL_FIELDS, name)] = v; };
  set('ID', id);
  set('ModelPath', `${modelDir(draft.name)}\\${filePrefix(draft.name)}.mdx`);
  set('ModelScale', 1);
  if (!base) {
    set('CollisionWidth', 0.5);
    set('CollisionHeight', draft.kind === 'mount' ? 2 : 1);
    set('MountHeight', draft.kind === 'mount' ? 2 : 0);
  }
  return out;
}

/** A `CreatureDisplayInfo` record: the model, the scale and up to three texture names (without folder or extension) */
export function buildDisplay(base: readonly DbcValue[] | undefined, id: number, modelId: number, textures: readonly string[], draft: WizardDraft): DbcValue[] {
  const out = base ? [...base] : blank(DISPLAY_FIELDS);
  const set = (name: string, v: DbcValue): void => { out[fieldIndex(DISPLAY_FIELDS, name)] = v; };
  set('ID', id);
  set('ModelID', modelId);
  set('ExtendedDisplayInfoID', 0);
  set('CreatureModelScale', draft.scale);
  set('CreatureModelAlpha', 255);
  for (let i = 0; i < 3; i += 1) set(`TextureVariation${i + 1}`, textures[i] ?? '');
  return out;
}

const describe = (draft: WizardDraft): string => (draft.kind === 'mount' ? `Summons and dismisses a rideable ${draft.name}.` : `Summons and dismisses your ${draft.name}.`);

/** The mount or companion spell: aura 78 on the creature (plus speed auras) for a mount, a summon effect with the companion properties for a pet */
export function buildSpell(base: readonly DbcValue[] | undefined, id: number, creature: number, draft: WizardDraft): SpellRecord {
  let record: SpellRecord = withSpell(base ?? blankSpell(id), { ID: id, Name: draft.name, Rank: '', Description: describe(draft), ToolTip: '' });
  for (let i = 0; i < 3; i += 1) record = withEffect(record, i, Object.fromEntries(EFFECT_KEYS.map((k) => [k, 0])));
  if (draft.kind === 'companion') return withEffect(record, 0, { effect: EFFECT_SUMMON, targetA: 1, miscValue: creature, miscValueB: SUMMON_PROPERTIES_COMPANION });
  record = withEffect(record, 0, { effect: EFFECT_APPLY_AURA, targetA: 1, aura: AURA_MOUNTED, miscValue: creature });
  let next = 1;
  if (draft.speed > 0) record = withEffect(record, next++, { effect: EFFECT_APPLY_AURA, targetA: 1, aura: AURA_MOUNTED_SPEED, ...pointsFor(draft.speed, draft.speed) });
  if (draft.flying) record = withEffect(record, next, { effect: EFFECT_APPLY_AURA, targetA: 1, aura: AURA_MOUNTED_FLIGHT_SPEED, ...pointsFor(draft.flightSpeed, draft.flightSpeed) });
  return record;
}

const NPC_TYPE: Record<ModelKind, CustomNpc['type']> = { mount: 'none', companion: 'critter', npc: 'humanoid' };

/** The `creature_template` (and its model) of the new look */
export function buildCreature(entry: number, displayId: number, draft: WizardDraft): CustomNpc {
  return { ...newNpc(entry), name: draft.name, displayId, type: NPC_TYPE[draft.kind], faction: 35 };
}

const ITEM_SUBCLASS = { mount: 5, companion: 2 } as const;

/** The item that teaches the spell: a mount or companion item (class 15) that casts "Learning" and learns the spell on use */
export function buildItem(entry: number, spell: number, draft: Learnable): CustomItem {
  const slot = (id: number, trigger: number) => ({ spell: id, trigger, charges: 0, cooldownMs: -1, category: 0, categoryCooldownMs: -1 });
  return {
    ...newItem(entry), name: draft.name, quality: 'epic', itemClass: 15, subclass: ITEM_SUBCLASS[draft.kind], bonding: 'pickup',
    displayId: draft.itemDisplayId, spells: [slot(SPELL_LEARNING, TRIGGER_USE), slot(spell, TRIGGER_LEARN)],
  };
}

/** The `item_dbc` row the client is sent for the item */
export function buildItemDbc(entry: number, draft: Learnable): Row {
  return { ID: String(entry), ClassID: '15', SubclassID: String(ITEM_SUBCLASS[draft.kind]), Sound_Override_Subclassid: '-1', Material: '-1', DisplayInfoID: String(draft.itemDisplayId), InventoryType: '0', SheatheType: '0' };
}

export interface Plan {
  dbc: { file: string; id: number; values: DbcValue[] }[];
  npc: CustomNpc;
  item?: { item: CustomItem; dbcRow: Row };
}

/** Every row the wizard writes for a draft, once its ids are settled */
export function buildPlan(draft: WizardDraft, ids: Ids, bases: Bases, textures: readonly string[]): Plan {
  const dbc = [
    { file: MODEL_FILE, id: ids.modelData, values: buildModelData(bases.modelData, ids.modelData, draft) },
    { file: DISPLAY_FILE, id: ids.display, values: buildDisplay(bases.display, ids.display, ids.modelData, textures, draft) },
  ];
  const npc = buildCreature(ids.creature, ids.display, draft);
  if (draft.kind === 'npc') return { dbc, npc };
  const learn = draft as Learnable;
  dbc.push({ file: SPELL_FILE_NAME, id: ids.spell, values: buildSpell(bases.spell, ids.spell, ids.creature, draft) });
  return { dbc, npc, item: { item: buildItem(ids.item, ids.spell, learn), dbcRow: buildItemDbc(ids.item, learn) } };
}

/** What a draft cannot be saved with */
export function draftIssues(draft: WizardDraft): string[] {
  const out: string[] = [];
  if (draft.name.replace(/[^A-Za-z0-9]+/g, '') === '') out.push('The name needs letters or digits (it names the files).');
  if (draft.kind === 'mount' && draft.flying && draft.flightSpeed === 0) out.push('A flying mount needs a flight speed.');
  return out;
}
