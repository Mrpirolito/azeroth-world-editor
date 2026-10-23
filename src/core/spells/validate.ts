import type { Issue } from '../validate/validate';
import { AURA_EFFECTS, AURAS, EFFECTS, hasValue, POWER_TYPES, TARGETS } from './catalogue';
import type { SpellLookups } from './lookups';
import { effectOf, spellNum, spellText, type SpellRecord } from './model';

/** What is wrong with a spell record: ids that lead nowhere, an id already taken, values out of range */

export interface SpellCheckContext {
  lookups: SpellLookups;
  /** Whether a spell exists in the files, the database or the project; null skips the check */
  spellExists: ((id: number) => boolean) | null;
  /** Whether another spell already uses this id (the record is new, so any use is a clash) */
  idTaken?: ((id: number) => boolean) | null;
  /** The record is one made in the project, not an edit of one the file has */
  isNew: boolean;
}

const MAX_ID = 0xffffffff;
const SCHOOL_ALL = 127;

/** Issues of one spell record, each with the field it is about as `fieldId` */
export function spellIssues(record: SpellRecord, ctx: SpellCheckContext): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, fieldId: string, message: string): void => {
    issues.push({ severity, code, fieldId, message });
  };
  const id = spellNum(record, 'ID');
  if (!Number.isInteger(id) || id < 1 || id > MAX_ID) add('error', 'SPELL_ID', 'ID', `The spell id must be a whole number from 1 to ${MAX_ID}.`);
  else if (ctx.isNew && ctx.idTaken?.(id)) add('error', 'SPELL_ID_TAKEN', 'ID', `Spell id ${id} is already used by another spell.`);
  if (spellText(record, 'Name').trim() === '') add('warning', 'SPELL_NAME', 'Name', 'The spell has no name; the client shows it blank.');

  const ref = (field: string, label: string, known: ReadonlyMap<number, unknown>): void => {
    const value = spellNum(record, field);
    if (value !== 0 && !known.has(value)) add('error', 'SPELL_REF', field, `${label} ${value} is not in the client's tables.`);
  };
  if (ctx.lookups.icons.size > 0) ref('SpellIconID', 'Icon', ctx.lookups.icons);
  if (ctx.lookups.castTimes.size > 0) ref('CastingTimeIndex', 'Cast time', ctx.lookups.castTimes);
  if (ctx.lookups.ranges.size > 0) ref('RangeIndex', 'Range', ctx.lookups.ranges);
  if (ctx.lookups.durations.size > 0) ref('DurationIndex', 'Duration', ctx.lookups.durations);

  const school = spellNum(record, 'SchoolMask');
  if (school < 0 || school > SCHOOL_ALL) add('error', 'SPELL_SCHOOL', 'SchoolMask', `The school mask must be from 0 to ${SCHOOL_ALL} (seven schools).`);
  if (!hasValue(POWER_TYPES, spellNum(record, 'PowerType'))) add('error', 'SPELL_POWER', 'PowerType', `Power type ${spellNum(record, 'PowerType')} does not exist.`);
  const procChance = spellNum(record, 'ProcChance');
  if (procChance > 100) add('error', 'SPELL_PROC', 'ProcChance', 'The proc chance is a percentage, 0 to 100.');
  if (spellNum(record, 'MaxLevel') > 0 && spellNum(record, 'MaxLevel') < spellNum(record, 'BaseLevel')) add('warning', 'SPELL_LEVELS', 'MaxLevel', 'The highest level is below the base level.');
  for (const field of ['RecoveryTime', 'CategoryRecoveryTime', 'StartRecoveryTime']) {
    if (spellNum(record, field) > 86_400_000) add('warning', 'SPELL_TIME', field, `${field} is over a day.`);
  }

  for (let i = 0; i < 3; i += 1) {
    const e = effectOf(record, i);
    const n = i + 1;
    if (e.effect !== 0 && !hasValue(EFFECTS, e.effect)) add('error', 'SPELL_EFFECT', `Effect${n}`, `Effect ${n}: effect type ${e.effect} does not exist.`);
    if (e.aura !== 0 && !hasValue(AURAS, e.aura)) add('error', 'SPELL_AURA', `EffectAura${n}`, `Effect ${n}: aura type ${e.aura} does not exist.`);
    if (AURA_EFFECTS.has(e.effect) && e.aura === 0) add('error', 'SPELL_AURA_MISSING', `EffectAura${n}`, `Effect ${n} applies an aura but names no aura type.`);
    if (e.aura !== 0 && !AURA_EFFECTS.has(e.effect)) add('warning', 'SPELL_AURA_UNUSED', `EffectAura${n}`, `Effect ${n} has an aura type but its effect does not apply an aura, so it is ignored.`);
    for (const [field, value] of [[`EffectImplicitTargetA${n}`, e.targetA], [`EffectImplicitTargetB${n}`, e.targetB]] as const) {
      if (value !== 0 && !hasValue(TARGETS, value)) add('error', 'SPELL_TARGET', field, `Effect ${n}: target ${value} does not exist.`);
    }
    if (e.dieSides < 0) add('error', 'SPELL_DICE', `EffectDieSides${n}`, `Effect ${n}: the dice cannot be negative.`);
    if (e.radiusIndex !== 0 && ctx.lookups.radii.size > 0 && !ctx.lookups.radii.has(e.radiusIndex)) add('error', 'SPELL_REF', `EffectRadiusIndex${n}`, `Effect ${n}: radius ${e.radiusIndex} is not in the client's tables.`);
    if (e.triggerSpell !== 0 && ctx.spellExists && !ctx.spellExists(e.triggerSpell)) add('warning', 'SPELL_TRIGGER', `EffectTriggerSpell${n}`, `Effect ${n}: the spell it casts (${e.triggerSpell}) is not in the files, the database or this project.`);
    if (e.period < 0) add('error', 'SPELL_PERIOD', `EffectAuraPeriod${n}`, `Effect ${n}: the tick time cannot be negative.`);
  }
  return issues;
}
