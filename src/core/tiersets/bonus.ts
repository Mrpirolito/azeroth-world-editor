import { z } from 'zod';
import type { DbcValue } from '../game/dbc-file';
import { blankSpell, EFFECT_KEYS, pointsFor, spellNum, withEffect, withSpell, type SpellRecord } from '../spells/model';
import type { Row } from '../tables/types';

/** Set bonuses: a passive aura spell per bonus, built from a template of auras the server already has */

const int = z.number().int();

/** A stat bonus: the aura effects that give it (`Mod stat`, `Mod rating`, ...) */
export const BONUS_STATS = {
  strength: { label: 'Strength', effects: [{ aura: 29, misc: 0 }] },
  agility: { label: 'Agility', effects: [{ aura: 29, misc: 1 }] },
  stamina: { label: 'Stamina', effects: [{ aura: 29, misc: 2 }] },
  intellect: { label: 'Intellect', effects: [{ aura: 29, misc: 3 }] },
  spirit: { label: 'Spirit', effects: [{ aura: 29, misc: 4 }] },
  attackPower: { label: 'attack power', effects: [{ aura: 99, misc: 0 }] },
  spellPower: { label: 'spell power', effects: [{ aura: 13, misc: 126 }, { aura: 135, misc: 126 }] },
  crit: { label: 'critical strike rating', effects: [{ aura: 189, misc: 0x700 }] },
  haste: { label: 'haste rating', effects: [{ aura: 189, misc: 0xe0000 }] },
  hit: { label: 'hit rating', effects: [{ aura: 189, misc: 0xe0 }] },
  expertise: { label: 'expertise rating', effects: [{ aura: 189, misc: 1 << 23 }] },
  armorPen: { label: 'armor penetration rating', effects: [{ aura: 189, misc: 1 << 24 }] },
  mp5: { label: 'mana per 5 sec', effects: [{ aura: 85, misc: 0 }] },
} as const;
export type BonusStat = keyof typeof BONUS_STATS;
export const BONUS_STAT_KEYS = Object.keys(BONUS_STATS) as [BonusStat, ...BonusStat[]];

/** What starts a proc: the `PROC_FLAG_*` bits and how the tooltip names the cause */
export const PROC_EVENTS = {
  meleeHit: { flags: 0x14, subject: 'Your melee attacks', label: 'melee hit' },
  rangedHit: { flags: 0x140, subject: 'Your ranged attacks', label: 'ranged hit' },
  spellDamage: { flags: 0x11000, subject: 'Your damaging spells', label: 'damaging spell' },
  spellHeal: { flags: 0x4400, subject: 'Your healing spells', label: 'healing spell' },
  periodic: { flags: 0x40000, subject: 'Your periodic damage and healing', label: 'periodic tick' },
  damageTaken: { flags: 0x100000, subject: 'Attacks against you', label: 'damage taken' },
} as const;
export type ProcEvent = keyof typeof PROC_EVENTS;
export const PROC_EVENT_KEYS = Object.keys(PROC_EVENTS) as [ProcEvent, ...ProcEvent[]];

/** The spells a modifier aims at (empty while a draft waits for them) */
const spells = z.array(int.min(1)).max(8);

export const templateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stat'), stat: z.enum(BONUS_STAT_KEYS), value: int.min(-10000).max(100000) }),
  z.object({ kind: z.literal('damagePct'), spells, value: int.min(-1000).max(1000) }),
  z.object({ kind: z.literal('cooldown'), spells, seconds: int.min(1).max(3600) }),
  z.object({ kind: z.literal('costPct'), spells, value: int.min(1).max(100) }),
  z.object({ kind: z.literal('critChance'), spells, value: int.min(1).max(100) }),
  z.object({ kind: z.literal('proc'), event: z.enum(PROC_EVENT_KEYS), chance: int.min(1).max(100), triggerSpell: int.min(0) }),
  z.object({ kind: z.literal('healingPct'), value: int.min(-1000).max(1000) }),
  z.object({ kind: z.literal('damageTakenPct'), value: int.min(1).max(100) }),
  /** Nothing the existing auras express: kept as text, no spell is made */
  z.object({ kind: z.literal('pending'), reason: z.string().max(300) }),
]);
export type BonusTemplate = z.infer<typeof templateSchema>;

export const MAX_BONUSES = 8;

export const bonusSchema = z.object({
  /** Pieces worn for the bonus */
  threshold: int.min(1).max(8),
  template: templateSchema,
  /** What the author wrote, if the template came from text */
  text: z.string().max(500).default(''),
  /** The spell made for it (0 until saved, and for a pending bonus) */
  spellId: int.min(0).default(0),
});
export type Bonus = z.infer<typeof bonusSchema>;

/** What a bonus needs to know about a spell it aims at */
export interface SpellRef {
  id: number;
  name: string;
  icon: number;
  classSet: number;
  mask: readonly [number, number, number];
}

export interface BonusEnv {
  spell(id: number): SpellRef | undefined;
  /** A Blizzard set-bonus spell (37594) to copy flags from, if the client has it */
  base?: readonly DbcValue[];
}

export const NO_SPELLS: BonusEnv = { spell: () => undefined };

const SPELLMOD = { damage: 0, crit: 7, cooldown: 11, cost: 14 } as const;
const AURA = { proc: 42, flat: 107, pct: 108, healingPct: 136, damageTaken: 87 } as const;
const ATTR_PASSIVE = 0x40;
const ATTR_HIDDEN = 0x80;
const DURATION_INFINITE = 21;
const RANGE_SELF = 1;

const list = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const nameOf = (id: number, env: BonusEnv): string => env.spell(id)?.name ?? `spell ${id}`;

/** The tooltip a player reads for a bonus */
export function bonusTooltip(t: BonusTemplate, env: BonusEnv): string {
  const of = (ids: readonly number[]): string => list(ids.map((id) => nameOf(id, env))) || 'a spell';
  switch (t.kind) {
    case 'stat': {
      if (t.stat === 'mp5') return `Restores ${t.value} mana per 5 sec.`;
      const label = BONUS_STATS[t.stat].label;
      return t.value >= 0 ? `Increases your ${label} by ${t.value}.` : `Decreases your ${label} by ${-t.value}.`;
    }
    case 'damagePct': return `${t.value >= 0 ? 'Increases' : 'Decreases'} the damage of ${of(t.spells)} by ${Math.abs(t.value)}%.`;
    case 'cooldown': return `Reduces the cooldown of ${of(t.spells)} by ${t.seconds} sec.`;
    case 'costPct': return `Reduces the cost of ${of(t.spells)} by ${t.value}%.`;
    case 'critChance': return `Increases the critical strike chance of ${of(t.spells)} by ${t.value}%.`;
    case 'proc': return `${PROC_EVENTS[t.event].subject} have a ${t.chance}% chance to cast ${t.triggerSpell > 0 ? nameOf(t.triggerSpell, env) : 'a spell'}.`;
    case 'healingPct': return `${t.value >= 0 ? 'Increases' : 'Decreases'} your healing done by ${Math.abs(t.value)}%.`;
    case 'damageTakenPct': return `Reduces damage taken by ${t.value}%.`;
    case 'pending': return '';
  }
}

interface Effect { aura: number; misc: number; points: number; masks?: readonly [number, number, number]; trigger?: number }
interface Plan { effects: Effect[]; classSet: number; icon: number; procFlags: number; procChance: number }

/** The family and mask that cover every spell given, or why they cannot */
function family(ids: readonly number[], env: BonusEnv): { classSet: number; mask: [number, number, number]; icon: number } | string {
  if (ids.length === 0) return 'Pick the spell this bonus changes.';
  let classSet = -1;
  const mask: [number, number, number] = [0, 0, 0];
  let icon = 0;
  for (const id of ids) {
    const s = env.spell(id);
    if (!s) return `Spell ${id} is not in Spell.dbc or the project.`;
    if (s.mask.every((m) => m === 0)) return `${s.name} (${id}) has no spell family mask, so no aura can modify it alone; it needs server code.`;
    if (classSet !== -1 && classSet !== s.classSet) return 'The spells belong to different spell families; make one bonus per family.';
    classSet = s.classSet;
    s.mask.forEach((m, i) => { mask[i] = (mask[i]! | m) >>> 0; });
    if (icon === 0) icon = s.icon;
  }
  return { classSet, mask, icon };
}

function planOf(t: BonusTemplate, env: BonusEnv): Plan | string {
  const none = { classSet: 0, icon: 0, procFlags: 0, procChance: 0 };
  const mod = (ids: readonly number[], aura: number, op: number, points: number): Plan | string => {
    const f = family(ids, env);
    if (typeof f === 'string') return f;
    return { effects: [{ aura, misc: op, points, masks: f.mask }], classSet: f.classSet, icon: f.icon, procFlags: 0, procChance: 0 };
  };
  switch (t.kind) {
    case 'stat': return { ...none, effects: BONUS_STATS[t.stat].effects.map((e) => ({ ...e, points: t.value })) };
    case 'damagePct': return mod(t.spells, AURA.pct, SPELLMOD.damage, t.value);
    case 'cooldown': return mod(t.spells, AURA.flat, SPELLMOD.cooldown, -t.seconds * 1000);
    case 'costPct': return mod(t.spells, AURA.pct, SPELLMOD.cost, -t.value);
    case 'critChance': return mod(t.spells, AURA.flat, SPELLMOD.crit, t.value);
    case 'proc': {
      if (t.triggerSpell <= 0) return 'Pick the spell that is cast.';
      const trigger = env.spell(t.triggerSpell);
      if (!trigger) return `Spell ${t.triggerSpell} is not in Spell.dbc or the project.`;
      return { effects: [{ aura: AURA.proc, misc: 0, points: 0, trigger: t.triggerSpell }], classSet: 0, icon: trigger.icon, procFlags: PROC_EVENTS[t.event].flags, procChance: t.chance };
    }
    case 'healingPct': return { ...none, effects: [{ aura: AURA.healingPct, misc: 0, points: t.value }] };
    case 'damageTakenPct': return { ...none, effects: [{ aura: AURA.damageTaken, misc: 127, points: -t.value }] };
    case 'pending': return t.reason || 'Needs server code.';
  }
}

/** Why a bonus cannot become a spell, or null when it can */
export function bonusPending(bonus: Bonus, env: BonusEnv): string | null {
  const p = planOf(bonus.template, env);
  return typeof p === 'string' ? p : null;
}

export const bonusSpellName = (setName: string, bonus: Pick<Bonus, 'threshold'>): string => `${setName.trim()} ${bonus.threshold}-Piece Bonus`;

export type BuiltBonus = { record: SpellRecord; proc: Row | null } | { pending: string };

/** The passive spell of a bonus under `id`, and the `spell_proc` row it needs, or why there is none */
export function buildBonusSpell(setName: string, bonus: Bonus, id: number, env: BonusEnv): BuiltBonus {
  const p = planOf(bonus.template, env);
  if (typeof p === 'string') return { pending: p };
  const text = bonusTooltip(bonus.template, env);
  let record: SpellRecord = withSpell(env.base ?? blankSpell(id), { ID: id });
  for (let i = 0; i < 3; i += 1) {
    record = withEffect(record, i, Object.fromEntries(EFFECT_KEYS.map((k) => [k, 0])));
    record = withSpell(record, { [`EffectSpellClassMaskA${i + 1}`]: 0, [`EffectSpellClassMaskB${i + 1}`]: 0, [`EffectSpellClassMaskC${i + 1}`]: 0 });
  }
  record = withSpell(record, {
    Name: bonusSpellName(setName, bonus), Rank: '', Description: text, ToolTip: text,
    Attributes: (spellNum(record, 'Attributes') | ATTR_PASSIVE | (env.base ? 0 : ATTR_HIDDEN)) >>> 0,
    Category: 0, RecoveryTime: 0, CategoryRecoveryTime: 0, StartRecoveryCategory: 0, StartRecoveryTime: 0,
    CastingTimeIndex: 1, DurationIndex: DURATION_INFINITE, RangeIndex: RANGE_SELF, PowerType: 0, ManaCost: 0, ManaCostPercentage: 0,
    SpellIconID: p.icon || spellNum(record, 'SpellIconID'), SpellClassSet: p.classSet, SpellClassMask1: 0, SpellClassMask2: 0, SpellClassMask3: 0,
    ProcTypeMask: p.procFlags, ProcChance: p.procChance, ProcCharges: 0,
  });
  p.effects.forEach((e, i) => {
    record = withEffect(record, i, { effect: 6, targetA: 1, aura: e.aura, miscValue: e.misc, triggerSpell: e.trigger ?? 0, ...pointsFor(e.points, e.points) });
    if (e.masks) record = withSpell(record, { [`EffectSpellClassMaskA${i + 1}`]: e.masks[0], [`EffectSpellClassMaskB${i + 1}`]: e.masks[1], [`EffectSpellClassMaskC${i + 1}`]: e.masks[2] });
  });
  const proc: Row | null = bonus.template.kind === 'proc' ? { SpellId: String(id), ProcFlags: String(p.procFlags), Chance: String(p.procChance) } : null;
  return { record, proc };
}

/** The bonuses that have a spell, by threshold: what fills the ItemSet record (`SetSpellID`, `SetThreshold`) */
export const bonusSlots = (bonuses: readonly Bonus[]): { spellId: number; threshold: number }[] =>
  bonuses.filter((b) => b.spellId > 0 && b.template.kind !== 'pending').map((b) => ({ spellId: b.spellId, threshold: b.threshold })).sort((a, b) => a.threshold - b.threshold || a.spellId - b.spellId).slice(0, MAX_BONUSES);

/** What each bonus without a spell needs, for the export summary and the PR body */
export function pendingNotes(sets: readonly { name: string; bonuses: readonly Bonus[] }[]): string[] {
  return sets.flatMap((s) => s.bonuses.filter((b) => b.spellId === 0).map((b) => (
    `${s.name}, ${b.threshold}-piece bonus is pending server code${b.text ? ` ("${b.text}")` : ''}: ${b.template.kind === 'pending' ? b.template.reason : 'its spell could not be built'}.`
  )));
}
