import { ACTIONS } from './actions';
import { EVENTS } from './events';
import { TARGETS } from './targets';
import type { TypeDef, TypeKind } from './types';

export { EVENTS, ACTIONS, TARGETS };
export { EVENT_FLAG_BITS, EVENT_FLAGS_ALL, PHASE_BITS, PHASE_MASK_ALL } from './flags';
export type { Bit, Choice, ParamDef, ParamKind, TypeDef, TypeKind } from './types';
export { SOURCE_MASK } from './types';

/** Every SmartAI type the server understands, by kind, in id order */
export const TYPES: Record<TypeKind, readonly TypeDef[]> = { event: EVENTS, action: ACTIONS, target: TARGETS };

const index = (list: readonly TypeDef[]): ReadonlyMap<number, TypeDef> => new Map(list.map((t) => [t.id, t]));
const BY_ID: Record<TypeKind, ReadonlyMap<number, TypeDef>> = { event: index(EVENTS), action: index(ACTIONS), target: index(TARGETS) };

/** The definition of a type, or undefined when the server has no such type */
export function typeOf(kind: TypeKind, id: number): TypeDef | undefined {
  return BY_ID[kind].get(id);
}

/** A name for a dropdown that never shows a bare number */
export function typeName(kind: TypeKind, id: number): string {
  return typeOf(kind, id)?.name ?? `Unknown ${kind} ${id}`;
}

/** The types a person can pick for a new row (not the hidden ones, unless it is the one already chosen) */
export function pickable(kind: TypeKind, current?: number): readonly TypeDef[] {
  return TYPES[kind].filter((t) => !t.hidden || t.id === current);
}

/** The columns of a SmartAI row, in table order: what the editor and the SQL both go by */
export const COLUMNS = [
  'entryorguid', 'source_type', 'id', 'link', 'event_type', 'event_phase_mask', 'event_chance', 'event_flags',
  'event_param1', 'event_param2', 'event_param3', 'event_param4', 'event_param5', 'event_param6',
  'action_type', 'action_param1', 'action_param2', 'action_param3', 'action_param4', 'action_param5', 'action_param6',
  'target_type', 'target_param1', 'target_param2', 'target_param3', 'target_param4', 'target_x', 'target_y', 'target_z', 'target_o', 'comment',
] as const;
export type Column = (typeof COLUMNS)[number];

/** What each `source_type` is, for the owner of a script */
export const SOURCE_TYPES: readonly { id: number; name: string }[] = [
  { id: 0, name: 'Creature' },
  { id: 1, name: 'Game object' },
  { id: 2, name: 'Area trigger' },
  { id: 3, name: 'Event' },
  { id: 4, name: 'Gossip' },
  { id: 5, name: 'Quest' },
  { id: 6, name: 'Spell' },
  { id: 7, name: 'Transport' },
  { id: 8, name: 'Instance' },
  { id: 9, name: 'Timed action list' },
];

/** `source_type` as the bit `SmartScriptType` masks use */
export const sourceBit = (sourceType: number): number => 1 << sourceType;
