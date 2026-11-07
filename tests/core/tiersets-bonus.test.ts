import { describe, expect, it } from 'vitest';
import { findRecord } from '../../src/core/dbc/edits';
import { EMPTY_ENTITIES } from '../../src/core/entities/model';
import { layoutOf } from '../../src/core/game/dbc-formats';
import { blankSpell, effectOf, effectRange, spellNum, spellText, withSpell } from '../../src/core/spells/model';
import { applyTierSet, removeTierSet, settleBonuses } from '../../src/core/tiersets/apply';
import { bonusPending, bonusSlots, bonusTooltip, buildBonusSpell, pendingNotes, type Bonus, type BonusEnv, type BonusTemplate } from '../../src/core/tiersets/bonus';
import { parseBonusText, resolveBonus } from '../../src/core/tiersets/bonus-text';
import { tierSetIds } from '../../src/core/tiersets/ids';
import { newTierSet, PIECES, type TierSet } from '../../src/core/tiersets/model';
import { buildItemSet, setIssues } from '../../src/core/tiersets/rows';

const FIREBALL = { id: 133, name: 'Fireball', icon: 185, classSet: 3, mask: [1, 0, 0] } as const;
const PYRO = { id: 11366, name: 'Pyroblast', icon: 1000, classSet: 3, mask: [0x400000, 0, 0] } as const;
const SMITE = { id: 585, name: 'Smite', icon: 2, classSet: 6, mask: [0x80, 0, 0] } as const;
const PLAIN = { id: 9, name: 'Plain Hit', icon: 3, classSet: 0, mask: [0, 0, 0] } as const;
const PROC_BUFF = { id: 5000, name: 'Surge', icon: 77, classSet: 0, mask: [0, 0, 0] } as const;
const known = [FIREBALL, PYRO, SMITE, PLAIN, PROC_BUFF];
const env: BonusEnv = { spell: (id) => known.find((s) => s.id === id) };

const bonus = (template: BonusTemplate, threshold = 2, spellId = 0): Bonus => ({ threshold, template, text: '', spellId });
const build = (template: BonusTemplate, id = 90001) => {
  const out = buildBonusSpell('Tier 1 Mage', bonus(template), id, env);
  if ('pending' in out) throw new Error(out.pending);
  return out;
};

describe('bonus templates become passive aura spells', () => {
  it('stat: one aura effect on the caster, or two for spell power', () => {
    const { record } = build({ kind: 'stat', stat: 'crit', value: 30 });
    expect(spellNum(record, 'ID')).toBe(90001);
    expect(spellNum(record, 'Attributes') & 0x40).toBe(0x40);
    expect(spellNum(record, 'DurationIndex')).toBe(21);
    const e = effectOf(record, 0);
    expect([e.effect, e.aura, e.miscValue, e.targetA, effectRange(e).min]).toEqual([6, 189, 0x700, 1, 30]);
    expect(effectOf(record, 1).effect).toBe(0);

    const sp = build({ kind: 'stat', stat: 'spellPower', value: 50 }).record;
    expect([effectOf(sp, 0).aura, effectOf(sp, 1).aura, effectRange(effectOf(sp, 1)).min]).toEqual([13, 135, 50]);
    expect(effectOf(build({ kind: 'stat', stat: 'strength', value: 12 }).record, 0)).toMatchObject({ aura: 29, miscValue: 0 });
    expect(effectOf(build({ kind: 'stat', stat: 'attackPower', value: 80 }).record, 0).aura).toBe(99);
    expect(effectOf(build({ kind: 'stat', stat: 'haste', value: 20 }).record, 0).miscValue).toBe(0xe0000);
  });

  it('damage of a spell: percent modifier on damage with the spell family and mask', () => {
    const { record } = build({ kind: 'damagePct', spells: [FIREBALL.id, PYRO.id], value: 10 });
    expect(spellNum(record, 'SpellClassSet')).toBe(3);
    expect(spellNum(record, 'SpellIconID')).toBe(185);
    const e = effectOf(record, 0);
    expect([e.aura, e.miscValue, effectRange(e).min]).toEqual([108, 0, 10]);
    expect(spellNum(record, 'EffectSpellClassMaskA1')).toBe(0x400001);
    expect(spellNum(record, 'EffectSpellClassMaskB1')).toBe(0);
  });

  it('cooldown, cost and crit chance of a spell', () => {
    const cd = effectOf(build({ kind: 'cooldown', spells: [FIREBALL.id], seconds: 3 }).record, 0);
    expect([cd.aura, cd.miscValue, effectRange(cd).min]).toEqual([107, 11, -3000]);
    const cost = effectOf(build({ kind: 'costPct', spells: [FIREBALL.id], value: 15 }).record, 0);
    expect([cost.aura, cost.miscValue, effectRange(cost).min]).toEqual([108, 14, -15]);
    const crit = effectOf(build({ kind: 'critChance', spells: [FIREBALL.id], value: 5 }).record, 0);
    expect([crit.aura, crit.miscValue, effectRange(crit).min]).toEqual([107, 7, 5]);
  });

  it('proc: trigger spell, flags, chance, the icon of the trigger and a spell_proc row', () => {
    const out = build({ kind: 'proc', event: 'meleeHit', chance: 15, triggerSpell: PROC_BUFF.id });
    const e = effectOf(out.record, 0);
    expect([e.aura, e.triggerSpell]).toEqual([42, 5000]);
    expect([spellNum(out.record, 'ProcChance'), spellNum(out.record, 'ProcTypeMask'), spellNum(out.record, 'SpellIconID')]).toEqual([15, 0x14, 77]);
    expect(out.proc).toEqual({ SpellId: '90001', ProcFlags: String(0x14), Chance: '15' });
    expect(build({ kind: 'stat', stat: 'crit', value: 1 }).proc).toBeNull();
  });

  it('healing done and damage taken', () => {
    expect(effectOf(build({ kind: 'healingPct', value: 5 }).record, 0)).toMatchObject({ aura: 136 });
    const taken = effectOf(build({ kind: 'damageTakenPct', value: 4 }).record, 0);
    expect([taken.aura, taken.miscValue, effectRange(taken).min]).toEqual([87, 127, -4]);
  });

  it('copies the flags of a Blizzard bonus spell when the client has one', () => {
    const base = withSpell(blankSpell(37594), { Attributes: 0x10000040, SpellVisual1: 7, Name: 'Old', Description: 'Old' });
    const out = buildBonusSpell('S', bonus({ kind: 'healingPct', value: 5 }), 91000, { ...env, base });
    if ('pending' in out) throw new Error(out.pending);
    expect(spellNum(out.record, 'Attributes')).toBe(0x10000040);
    expect(spellNum(out.record, 'SpellVisual1')).toBe(7);
    expect([spellNum(out.record, 'ID'), spellText(out.record, 'Name')]).toEqual([91000, 'S 2-Piece Bonus']);
  });
});

describe('bonus tooltips', () => {
  it.each([
    [{ kind: 'stat', stat: 'crit', value: 30 }, 'Increases your critical strike rating by 30.'],
    [{ kind: 'stat', stat: 'mp5', value: 12 }, 'Restores 12 mana per 5 sec.'],
    [{ kind: 'damagePct', spells: [FIREBALL.id], value: 10 }, 'Increases the damage of Fireball by 10%.'],
    [{ kind: 'damagePct', spells: [FIREBALL.id, PYRO.id], value: 10 }, 'Increases the damage of Fireball and Pyroblast by 10%.'],
    [{ kind: 'cooldown', spells: [FIREBALL.id], seconds: 2 }, 'Reduces the cooldown of Fireball by 2 sec.'],
    [{ kind: 'costPct', spells: [SMITE.id], value: 10 }, 'Reduces the cost of Smite by 10%.'],
    [{ kind: 'critChance', spells: [SMITE.id], value: 5 }, 'Increases the critical strike chance of Smite by 5%.'],
    [{ kind: 'proc', event: 'spellDamage', chance: 10, triggerSpell: PROC_BUFF.id }, 'Your damaging spells have a 10% chance to cast Surge.'],
    [{ kind: 'healingPct', value: 5 }, 'Increases your healing done by 5%.'],
    [{ kind: 'damageTakenPct', value: 3 }, 'Reduces damage taken by 3%.'],
  ] as [BonusTemplate, string][])('%j', (template, text) => {
    expect(bonusTooltip(template, env)).toBe(text);
    const out = build(template);
    expect(spellText(out.record, 'Description')).toBe(text);
    expect(spellText(out.record, 'ToolTip')).toBe(text);
  });
});

describe('bonuses that cannot be a spell are pending', () => {
  it('a pending template, a spell without a family mask, mixed families and unknown spells', () => {
    const cases: BonusTemplate[] = [
      { kind: 'pending', reason: 'Needs server code.' },
      { kind: 'damagePct', spells: [PLAIN.id], value: 10 },
      { kind: 'damagePct', spells: [FIREBALL.id, SMITE.id], value: 10 },
      { kind: 'cooldown', spells: [424242], seconds: 1 },
      { kind: 'damagePct', spells: [], value: 10 },
      { kind: 'proc', event: 'meleeHit', chance: 10, triggerSpell: 0 },
    ];
    for (const t of cases) {
      expect(bonusPending(bonus(t), env), JSON.stringify(t)).not.toBeNull();
      expect('pending' in buildBonusSpell('S', bonus(t), 1, env)).toBe(true);
    }
  });

  it('is listed in the summary and left out of the ItemSet record', () => {
    const set = newTierSet('Tier 1 Mage', 8, 'cloth');
    set.bonuses = [{ ...bonus({ kind: 'healingPct', value: 5 }, 4, 90002), text: '' }, { ...bonus({ kind: 'pending', reason: 'Needs server code.' }, 2, 0), text: 'Meteor leaves a burning field' }];
    const notes = pendingNotes([set]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('2-piece bonus is pending server code');
    expect(notes[0]).toContain('Meteor leaves a burning field');
    expect(bonusSlots(set.bonuses)).toEqual([{ spellId: 90002, threshold: 4 }]);
    expect(setIssues(set).some((i) => i.severity === 'warning' && i.message.includes('pending'))).toBe(true);
  });
});

const savedSet = (bonuses: Bonus[]): TierSet => {
  const set = newTierSet('Tier 1 Mage', 8, 'cloth');
  PIECES.forEach((k, i) => { set.pieces[k].entry = 900000 + i; set.pieces[k].look = { kind: 'existing', displayId: 5000 + i }; });
  set.itemSetId = 7000;
  set.bonuses = bonuses;
  return set;
};

describe('ItemSet slots', () => {
  it('fills SetSpellID and SetThreshold by threshold, up to 8', () => {
    const fields = layoutOf('ItemSet.dbc')!.fields;
    const at = (n: string): number => fields.findIndex((f) => f.name === n);
    const row = buildItemSet(savedSet([bonus({ kind: 'healingPct', value: 5 }, 4, 90002), bonus({ kind: 'healingPct', value: 5 }, 2, 90001)]), 7000);
    expect([row[at('SetSpellID1')], row[at('SetThreshold1')], row[at('SetSpellID2')], row[at('SetThreshold2')], row[at('SetSpellID3')], row[at('SetThreshold3')]]).toEqual([90001, 2, 90002, 4, 0, 0]);
    const eight = Array.from({ length: 10 }, (_, i) => bonus({ kind: 'healingPct', value: 1 }, (i % 5) + 1, 91000 + i));
    const full = buildItemSet(savedSet(eight), 7000);
    expect(full[at('SetSpellID8')]).not.toBe(0);
    expect(setIssues(savedSet(eight)).some((i) => i.severity === 'error')).toBe(true);
  });
});

describe('spell ids of a saved set', () => {
  const settle = (set: TierSet, from: number) => settleBonuses(set, env, (n) => Array.from({ length: n }, (_, i) => from + i));
  const spellIds = (set: TierSet): number[] => set.bonuses.map((b) => b.spellId);

  it('allocates once and keeps the ids on a later save; pending bonuses get none', () => {
    const first = settle(savedSet([bonus({ kind: 'healingPct', value: 5 }, 2), bonus({ kind: 'pending', reason: 'x' }, 3), bonus({ kind: 'stat', stat: 'crit', value: 3 }, 4)]), 90100);
    expect(spellIds(first)).toEqual([90100, 0, 90101]);
    const edited = structuredClone(first);
    edited.bonuses[0]!.template = { kind: 'healingPct', value: 9 };
    edited.bonuses.push(bonus({ kind: 'damageTakenPct', value: 3 }, 5));
    expect(spellIds(settle(edited, 95000))).toEqual([90100, 0, 90101, 95000]);
  });

  it('writes the spells and procs into the project and removes them with the bonus', () => {
    const set = settle(savedSet([bonus({ kind: 'healingPct', value: 5 }, 2), bonus({ kind: 'proc', event: 'meleeHit', chance: 10, triggerSpell: PROC_BUFF.id }, 4)]), 90200);
    let store = applyTierSet(EMPTY_ENTITIES, set, undefined, new Map(), env);
    expect(findRecord(store.dbcEdits, 'Spell.dbc', 90200)).toBeDefined();
    expect(findRecord(store.dbcEdits, 'Spell.dbc', 90201)).toBeDefined();
    expect(store.rowsets?.filter((s) => s.table === 'spell_proc').map((s) => s.scope.SpellId)).toEqual(['90201']);
    const itemSet = findRecord(store.dbcEdits, 'ItemSet.dbc', 7000)!.values;
    expect(itemSet).toContain(90200);

    const again = applyTierSet(store, set, set, new Map(), env);
    expect(again.dbcEdits).toEqual(store.dbcEdits);
    expect(again.rowsets?.filter((s) => s.table === 'spell_proc')).toHaveLength(1);

    const fewer = structuredClone(set);
    fewer.bonuses.pop();
    store = applyTierSet(store, fewer, set, new Map(), env);
    expect(findRecord(store.dbcEdits, 'Spell.dbc', 90200)).toBeDefined();
    expect(findRecord(store.dbcEdits, 'Spell.dbc', 90201)).toBeUndefined();
    expect(store.rowsets?.some((s) => s.table === 'spell_proc')).toBeFalsy();

    const gone = removeTierSet(store, fewer);
    expect(findRecord(gone.dbcEdits, 'Spell.dbc', 90200)).toBeUndefined();
  });
});

describe('bonus text', () => {
  const spellsByName: Record<string, number> = { fireball: FIREBALL.id, pyroblast: PYRO.id, smite: SMITE.id, surge: PROC_BUFF.id };
  const read = (text: string) => resolveBonus(parseBonusText(text), (n) => spellsByName[n.toLowerCase()]);

  it.each([
    ['Increases the damage of Fireball by 10%.', { kind: 'damagePct', spells: [133], value: 10 }],
    ['Increases the damage of Fireball and Pyroblast by 8%', { kind: 'damagePct', spells: [133, 11366], value: 8 }],
    ['Fireball deals 15% more damage', { kind: 'damagePct', spells: [133], value: 15 }],
    ['Reduces the cooldown of Smite by 2 sec.', { kind: 'cooldown', spells: [585], seconds: 2 }],
    ['Fireball cooldown reduced by 3 seconds', { kind: 'cooldown', spells: [133], seconds: 3 }],
    ['Reduces the mana cost of Fireball by 10%.', { kind: 'costPct', spells: [133], value: 10 }],
    ['Increases the critical strike chance of Smite by 5%.', { kind: 'critChance', spells: [585], value: 5 }],
    ['Your melee attacks have a 10% chance to cast Surge.', { kind: 'proc', event: 'meleeHit', chance: 10, triggerSpell: 5000 }],
    ['Your healing spells have a 20% chance to cast Surge', { kind: 'proc', event: 'spellHeal', chance: 20, triggerSpell: 5000 }],
    ['Increases your healing done by 5%.', { kind: 'healingPct', value: 5 }],
    ['Reduces damage taken by 3%.', { kind: 'damageTakenPct', value: 3 }],
    ['+20 Strength', { kind: 'stat', stat: 'strength', value: 20 }],
    ['Increases your critical strike rating by 35.', { kind: 'stat', stat: 'crit', value: 35 }],
    ['Increases attack power by 60.', { kind: 'stat', stat: 'attackPower', value: 60 }],
    ['2 pieces: +45 spell power', { kind: 'stat', stat: 'spellPower', value: 45 }],
  ] as [string, BonusTemplate][])('%s', (text, template) => {
    const out = read(text);
    expect(out.template).toEqual(template);
    expect(out.notes).toEqual([]);
  });

  it('marks what it cannot map as needing manual review and server code', () => {
    const out = read('Meteor now leaves a burning field behind for 6 sec.');
    expect(out.template.kind).toBe('pending');
    expect(out.notes[0]).toContain('manual review');
    expect(out.template.kind === 'pending' && out.template.reason).toContain('server code');
  });

  it('notes a spell name it cannot find and leaves it out', () => {
    const out = read('Increases the damage of Moonblast by 10%.');
    expect(out.template).toMatchObject({ kind: 'damagePct', spells: [], value: 10 });
    expect(out.notes[0]).toContain('Moonblast');
  });
});

describe('ids a tier set claims for the PR check', () => {
  it('lists bonus spells, items, the item set and new looks once', () => {
    const set = savedSet([bonus({ kind: 'healingPct', value: 5 }, 2, 90001), bonus({ kind: 'pending', reason: 'x' }, 4, 0)]);
    set.pieces.head.look = { kind: 'new', baseDisplayId: 1, displayId: 80002, textures: {}, model: false, icon: '' };
    const ids = tierSetIds([set]);
    expect(ids).toContainEqual({ table: 'spell_dbc', id: '90001' });
    expect(ids.filter((i) => i.table === 'spell_dbc')).toHaveLength(1);
    expect(ids).toContainEqual({ table: 'item_template', id: '900000' });
    expect(ids).toContainEqual({ table: 'ItemSet.dbc', id: '7000' });
    expect(ids).toContainEqual({ table: 'ItemDisplayInfo.dbc', id: '80002' });
  });
});
