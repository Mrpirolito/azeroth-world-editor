import { typeOf } from './catalogue';
import type { ParamDef, ParamKind, TypeKind } from './types';

/** Reads a parameter or a whole type as words. No imports from the scripts module, so it can be used by it. */

/** Names of things in the database, when the caller has them; `undefined` when it does not */
export type NameLookup = (kind: ParamKind, id: number) => string | undefined;

/** The kinds that name a row of the database: shown as their name, or as the kind and its id */
const NOUNS: Partial<Record<ParamKind, string>> = { spell: 'spell', creature: 'creature', gameobject: 'object', item: 'item', quest: 'quest' };

const trim = (n: number): string => String(Math.round(n * 100) / 100);

/** Milliseconds as the shortest honest time */
export const timeText = (ms: number): string => (ms >= 1000 && ms % 100 === 0 ? `${trim(ms / 1000)}s` : `${ms} ms`);

/** The bits of a flag value as their names, with any bit the list does not name left as a number */
export function flagNames(def: ParamDef, value: number): string[] {
  const names: string[] = [];
  let rest = value >>> 0;
  for (const bit of def.bits ?? []) {
    if ((rest & bit.value) === bit.value && bit.value !== 0) {
      names.push(bit.label);
      rest &= ~bit.value;
    }
  }
  if (rest !== 0) names.push(`0x${rest.toString(16)}`);
  return names;
}

/** The phases of a phase mask, as numbers */
export function phasesOf(mask: number): number[] {
  const phases: number[] = [];
  for (let i = 0; i < 12; i += 1) if (mask & (1 << i)) phases.push(i + 1);
  return phases;
}

export function formatParam(def: ParamDef | undefined, value: number, names?: NameLookup): string {
  if (!def) return String(value);
  const noun = NOUNS[def.kind];
  if (value === 0 && def.zero !== undefined && def.kind !== 'flags' && def.kind !== 'enum') return noun && def.zero === 'any' ? `any ${noun}` : def.zero;
  switch (def.kind) {
    case 'bool':
      return value !== 0 ? 'yes' : 'no';
    case 'ms':
      return timeText(value);
    case 'sec':
      return `${value}s`;
    case 'enum':
      return def.options?.find(([v]) => v === value)?.[1].toLowerCase() ?? `#${value}`;
    case 'flags': {
      const set = flagNames(def, value);
      return set.length === 0 ? (def.zero ?? 'nothing') : set.join(' + ').toLowerCase();
    }
    case 'phaseMask':
      return value === 0 ? 'any phase' : `phase ${phasesOf(value).join(' or ')}`;
    case 'spell':
    case 'creature':
    case 'gameobject':
    case 'item':
    case 'quest': {
      const name = names?.(def.kind, value);
      return name ? `${name} (${value})` : `${noun} ${value}`;
    }
    default:
      return String(value);
  }
}

/** A type's sentence with its parameters filled in */
export function say(kind: TypeKind, id: number, params: readonly number[], names?: NameLookup): string {
  const def = typeOf(kind, id);
  if (!def) return `${kind} ${id}`;
  return def.say.replace(/\{(\d)\}/g, (_, n: string) => formatParam(def.params[Number(n) - 1], params[Number(n) - 1] ?? 0, names));
}
