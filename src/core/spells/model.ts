import type { DbcValue } from '../game/dbc-file';
import { SPELL_FIELDS, SPELL_INDEX } from '../game/dbc-formats';

/**
 * A spell as `Spell.dbc` holds it: one record of 234 values read by the spell layout (`dbc-formats.ts`). The editor
 * reads and changes it by field name; effects are the three groups of fields that end in 1, 2 and 3.
 */

export type SpellRecord = DbcValue[];

export const SPELL_FILE_NAME = 'Spell.dbc';

const at = (name: string): number => {
  const i = SPELL_INDEX[name];
  if (i === undefined) throw new Error(`Spell.dbc has no field ${name}.`);
  return i;
};

export const spellNum = (record: readonly DbcValue[], name: string): number => Number(record[at(name)] ?? 0);
export const spellText = (record: readonly DbcValue[], name: string): string => String(record[at(name)] ?? '');

/** The record with fields changed, by name */
export function withSpell(record: readonly DbcValue[], changes: Readonly<Record<string, DbcValue>>): SpellRecord {
  const next = [...record];
  for (const [name, value] of Object.entries(changes)) next[at(name)] = value;
  return next;
}

/** A new spell: everything empty or zero, instant, physical, for a name to be given */
export function blankSpell(id: number): SpellRecord {
  const record: SpellRecord = SPELL_FIELDS.map((f) => (f.kind === 's' ? '' : 0));
  return withSpell(record, { ID: id, CastingTimeIndex: 1, SchoolMask: 1, StartRecoveryCategory: 133, StartRecoveryTime: 1500 });
}

/** A copy of a spell under a new id; the name gets "(copy)" unless one is given */
export function cloneSpell(base: readonly DbcValue[], id: number, name?: string): SpellRecord {
  return withSpell(base, { ID: id, Name: name ?? `${spellText(base, 'Name')} (copy)` });
}

/** The fields of one effect, by the part of the name before its number */
const EFFECT_FIELDS = {
  effect: 'Effect',
  dieSides: 'EffectDieSides',
  perLevel: 'EffectRealPointsPerLevel',
  basePoints: 'EffectBasePoints',
  mechanic: 'EffectMechanic',
  targetA: 'EffectImplicitTargetA',
  targetB: 'EffectImplicitTargetB',
  radiusIndex: 'EffectRadiusIndex',
  aura: 'EffectAura',
  period: 'EffectAuraPeriod',
  amplitude: 'EffectAmplitude',
  chainTargets: 'EffectChainTargets',
  itemType: 'EffectItemType',
  miscValue: 'EffectMiscValue',
  miscValueB: 'EffectMiscValueB',
  triggerSpell: 'EffectTriggerSpell',
  pointsPerCombo: 'EffectPointsPerCombo',
} as const;

export type EffectKey = keyof typeof EFFECT_FIELDS;
export type SpellEffect = Record<EffectKey, number>;

export const EFFECT_KEYS = Object.keys(EFFECT_FIELDS) as EffectKey[];
export const EFFECT_COUNT = 3;

const effectField = (key: EffectKey, index: number): string => `${EFFECT_FIELDS[key]}${index + 1}`;

export function effectOf(record: readonly DbcValue[], index: number): SpellEffect {
  return Object.fromEntries(EFFECT_KEYS.map((key) => [key, spellNum(record, effectField(key, index))])) as SpellEffect;
}

export function withEffect(record: readonly DbcValue[], index: number, changes: Partial<SpellEffect>): SpellRecord {
  return withSpell(record, Object.fromEntries(Object.entries(changes).map(([key, value]) => [effectField(key as EffectKey, index), value as number])));
}

/**
 * What an effect's base points and dice come to: the file stores one less than the value, and dice add 1 to `dieSides`
 * on top of it, so 99 with 1 die side is 100, and 49 with 11 die sides is 50 to 60.
 */
export function effectRange(effect: Pick<SpellEffect, 'basePoints' | 'dieSides'>): { min: number; max: number } {
  const base = effect.basePoints;
  if (effect.dieSides > 1) return { min: base + 1, max: base + effect.dieSides };
  const value = base + (effect.dieSides === 1 ? 1 : 0);
  return { min: value, max: value };
}

/** Base points and dice that give a range (`min` to `max`; a single value when equal) */
export function pointsFor(min: number, max: number): { basePoints: number; dieSides: number } {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return hi === lo ? { basePoints: lo - 1, dieSides: 1 } : { basePoints: lo - 1, dieSides: hi - lo + 1 };
}

/** The icons, cast times and so on a spell points at, by field */
export const SPELL_REFS = {
  icon: 'SpellIconID',
  castTime: 'CastingTimeIndex',
  range: 'RangeIndex',
  duration: 'DurationIndex',
} as const;
