import { AURAS, EFFECTS, nameOf, POWER_TYPES, SCHOOL_BITS, maskLabel, TARGETS } from './catalogue';
import { durationLabel, radiusLabel, timeLabel, type SpellLookups } from './lookups';
import { effectOf, effectRange, spellNum, type SpellEffect, type SpellRecord } from './model';

/** Plain-language sentences about a spell and its effects, for the cards of the editor */

export interface DescribeContext {
  lookups: SpellLookups;
  /** A spell's name by id, for effects that cast or teach another spell; undefined when unknown */
  spellName?(id: number): string | undefined;
}

const TARGET_WORDS: Readonly<Record<number, string>> = {
  1: 'the caster', 2: 'a nearby enemy', 3: 'a nearby ally', 4: 'a nearby party member', 5: "the caster's pet", 6: 'the enemy target',
  15: 'every enemy around the caster', 16: 'every enemy around the target spot', 18: "the caster's position", 20: "the caster's party", 21: 'the friendly target',
  22: "the caster's position", 24: 'enemies in front of the caster', 25: 'the target', 30: 'every ally around the caster', 31: 'every ally around the target spot',
  35: 'the party member target', 53: 'the enemy target spot', 54: 'enemies in front of the caster', 56: "the caster's raid", 57: 'the raid member target', 59: 'allies in front of the caster',
};

const STATS = ['Strength', 'Agility', 'Stamina', 'Intellect', 'Spirit'];

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** Who an effect aims at, from its two target slots */
export function targetWords(effect: Pick<SpellEffect, 'targetA' | 'targetB'>): string {
  const word = (id: number): string | undefined => TARGET_WORDS[id] ?? (id > 0 ? nameOf(TARGETS, id).toLowerCase() : undefined);
  const a = word(effect.targetA);
  const b = word(effect.targetB);
  if (a && b && a !== b) return `${a} (${b})`;
  return a ?? b ?? 'the target';
}

function valueWords(effect: SpellEffect): string {
  const { min, max } = effectRange(effect);
  const base = min === max ? String(min) : `${min} to ${max}`;
  return effect.perLevel !== 0 ? `${base} (${effect.perLevel > 0 ? '+' : ''}${Math.round(effect.perLevel * 100) / 100} per level)` : base;
}

const spellWords = (ctx: DescribeContext, id: number): string => (id === 0 ? 'no spell' : (ctx.spellName?.(id) ? `${ctx.spellName(id)} (${id})` : `spell ${id}`));

function auraSentence(effect: SpellEffect, who: string, ctx: DescribeContext, school: string): string {
  const v = valueWords(effect);
  const every = effect.period > 0 ? `Every ${timeLabel(effect.period)}, ` : '';
  const { min } = effectRange(effect);
  switch (effect.aura) {
    case 3: return `${every || 'Over time, '}deals ${v} ${school} damage to ${who}.`;
    case 8: return `${every || 'Over time, '}heals ${who} for ${v}.`;
    case 4: return 'Does nothing by itself; a script or another spell reacts to this aura.';
    case 5: return `Disorients ${who}.`;
    case 7: return `Makes ${who} flee in fear.`;
    case 12: return `Stuns ${who}.`;
    case 26: return `Roots ${who} in place.`;
    case 27: return `Silences ${who}.`;
    case 25: return `Pacifies ${who}: it cannot attack.`;
    case 13: return `Changes damage done by ${who} by ${v}${effect.miscValue ? ` (${maskLabel(SCHOOL_BITS, effect.miscValue)})` : ''}.`;
    case 14: return `Changes damage taken by ${who} by ${v}${effect.miscValue ? ` (${maskLabel(SCHOOL_BITS, effect.miscValue)})` : ''}.`;
    case 79: return `Changes damage done by ${who} by ${v}%${effect.miscValue ? ` (${maskLabel(SCHOOL_BITS, effect.miscValue)})` : ''}.`;
    case 22: return `Changes ${maskLabel(SCHOOL_BITS, effect.miscValue)} resistance of ${who} by ${v}.`;
    case 29: return `Changes ${effect.miscValue < 0 ? 'every stat' : (STATS[effect.miscValue] ?? `stat ${effect.miscValue}`)} of ${who} by ${v}.`;
    case 31: return `Raises the movement speed of ${who} by ${v}%.`;
    case 33: return `Slows ${who} by ${Math.abs(min)}%.`;
    case 23: return `${every || 'Repeatedly, '}casts ${spellWords(ctx, effect.triggerSpell)} on ${who}.`;
    case 42: return `When it procs, casts ${spellWords(ctx, effect.triggerSpell)}.`;
    case 16: return `Makes ${who} stealthy.`;
    case 18: return `Makes ${who} invisible.`;
    case 20: return `Heals ${who} for ${v}% of its health each tick.`;
    default: return `Applies "${nameOf(AURAS, effect.aura)}" to ${who} (value ${v}).`;
  }
}

/** One effect in a sentence */
export function effectSentence(effect: SpellEffect, record: SpellRecord, ctx: DescribeContext): string {
  if (effect.effect === 0) return 'Unused.';
  const who = targetWords(effect);
  const v = valueWords(effect);
  const school = maskLabel(SCHOOL_BITS, spellNum(record, 'SchoolMask')).toLowerCase();
  const area = effect.radiusIndex > 0 ? ` within ${radiusLabel(ctx.lookups, effect.radiusIndex)}` : '';
  const power = nameOf(POWER_TYPES, effect.miscValue).toLowerCase();
  switch (effect.effect) {
    case 1: return `Kills ${who} instantly.`;
    case 2: return `Deals ${v} ${school} damage to ${who}${area}.`;
    case 3: return 'Does nothing by itself; a script (dummy effect) reacts to it.';
    case 6: case 27: case 35: case 65: case 119: case 128: case 129: case 143: return `${auraSentence(effect, who, ctx, school)}${area ? ` Affects those${area}.` : ''}`;
    case 8: return `Drains ${v} ${power} from ${who}.`;
    case 10: return `Heals ${who} for ${v}${area}.`;
    case 18: return `Resurrects ${who}.`;
    case 24: return `Creates ${count(Math.max(1, effectRange(effect).min), 'copy', 'copies')} of item ${effect.itemType}.`;
    case 28: return `Summons creature ${effect.miscValue}.`;
    case 30: return `Gives ${who} ${v} ${power}.`;
    case 36: return `Teaches ${spellWords(ctx, effect.triggerSpell)}.`;
    case 32: case 64: case 85: case 140: return `Casts ${spellWords(ctx, effect.triggerSpell)} on ${who}.`;
    case 77: return 'Runs a script when it takes effect.';
    default: return `${nameOf(EFFECTS, effect.effect)} (${v}) on ${who}${area}.`;
  }
}

/** The spell's three effects, one sentence each; unused ones are left out */
export function effectSentences(record: SpellRecord, ctx: DescribeContext): string[] {
  return [0, 1, 2].flatMap((i) => {
    const effect = effectOf(record, i);
    return effect.effect === 0 ? [] : [`Effect ${i + 1}: ${effectSentence(effect, record, ctx)}`];
  });
}

/** One line on how the spell is cast: cost, cast time, range and cooldown */
export function castSentence(record: SpellRecord, ctx: DescribeContext): string {
  const parts: string[] = [];
  const cost = spellNum(record, 'ManaCost');
  const percent = spellNum(record, 'ManaCostPercentage');
  const power = nameOf(POWER_TYPES, spellNum(record, 'PowerType')).toLowerCase();
  if (cost > 0) parts.push(`${cost} ${power}`);
  else if (percent > 0) parts.push(`${percent}% of base ${power}`);
  const cast = ctx.lookups.castTimes.get(spellNum(record, 'CastingTimeIndex'));
  parts.push(cast && cast.base > 0 ? `${timeLabel(cast.base)} cast` : 'instant');
  const range = ctx.lookups.ranges.get(spellNum(record, 'RangeIndex'));
  if (range && range.maxHostile > 0 && range.maxHostile < 50000) parts.push(`${Math.round(range.maxHostile * 100) / 100} yd range`);
  const cooldown = Math.max(spellNum(record, 'RecoveryTime'), spellNum(record, 'CategoryRecoveryTime'));
  if (cooldown > 0) parts.push(`${timeLabel(cooldown)} cooldown`);
  const duration = spellNum(record, 'DurationIndex');
  if (duration > 0) parts.push(`lasts ${durationLabel(ctx.lookups, duration).toLowerCase()}`);
  return parts.join(' · ');
}
