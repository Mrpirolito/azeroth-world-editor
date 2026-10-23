import { describe, expect, it } from 'vitest';
import { applyEdit, changedFields, editCount, findRecord, withRecord, withoutRecord } from '../../src/core/dbc/edits';
import { Dbc } from '../../src/core/game/dbc-file';
import { SPELL_FORMAT, SPELL_INDEX } from '../../src/core/game/dbc-formats';
import { projectEntitiesSchema, readProjectEntities } from '../../src/core/entities/model';
import { ATTRIBUTE_WORDS, AURAS, EFFECTS, hasBit, maskLabel, SCHOOL_BITS, toggleBit } from '../../src/core/spells/catalogue';
import { castSentence, effectSentence, effectSentences, targetWords } from '../../src/core/spells/describe';
import { buildLookups, castTimeLabel, durationLabel, iconClientPath, iconName, radiusLabel, rangeLabel, timeLabel } from '../../src/core/spells/lookups';
import { blankSpell, cloneSpell, effectOf, effectRange, pointsFor, spellNum, spellText, withEffect, withSpell } from '../../src/core/spells/model';
import { spellIssues } from '../../src/core/spells/validate';

const lookups = buildLookups({
  castTimes: [{ id: 1, values: [1, 0, 0, 0] }, { id: 4, values: [4, 1500, 0, 1000] }],
  ranges: [{ id: 2, values: [2, 0, 0, 30, 30, 0, 'Long Range'] }, { id: 3, values: [3, 5, 0, 40, 45, 0, ''] }],
  durations: [{ id: 5, values: [5, 300000, 0, 300000] }, { id: 21, values: [21, -1, 0, -1] }],
  radii: [{ id: 7, values: [7, 8, 0.5, 20] }],
  icons: [{ id: 136, values: [136, 'Interface\\Icons\\Spell_Fire_FlameBolt'] }],
});

const fireball = (): ReturnType<typeof blankSpell> => {
  let r = withSpell(blankSpell(133), { Name: 'Fireball', Rank: 'Rank 1', SchoolMask: 4, CastingTimeIndex: 4, RangeIndex: 2, SpellIconID: 136, ManaCost: 30, DurationIndex: 5 });
  r = withEffect(r, 0, { effect: 2, basePoints: 13, dieSides: 6, targetA: 6 });
  return r;
};

describe('spell records', () => {
  it('blank spell has a value of the right kind in every field', () => {
    const r = blankSpell(5);
    expect(r).toHaveLength(234);
    expect(spellNum(r, 'ID')).toBe(5);
    expect(spellText(r, 'Name')).toBe('');
    expect(spellNum(r, 'CastingTimeIndex')).toBe(1);
  });
  it('clones under a new id and names the copy', () => {
    const c = cloneSpell(fireball(), 900001);
    expect(spellNum(c, 'ID')).toBe(900001);
    expect(spellText(c, 'Name')).toBe('Fireball (copy)');
    expect(spellNum(c, 'EffectBasePoints1')).toBe(13);
    expect(spellText(cloneSpell(fireball(), 2, 'Meteor'), 'Name')).toBe('Meteor');
  });
  it('reads and writes the three effects by number', () => {
    const r = withEffect(fireball(), 2, { effect: 6, aura: 3, period: 3000, triggerSpell: 77 });
    expect(effectOf(r, 2)).toMatchObject({ effect: 6, aura: 3, period: 3000, triggerSpell: 77 });
    expect(effectOf(r, 0)).toMatchObject({ effect: 2, basePoints: 13, dieSides: 6, targetA: 6 });
    expect(SPELL_INDEX.EffectAuraPeriod3).toBeDefined();
  });
  it('turns base points and dice into a range and back', () => {
    expect(effectRange({ basePoints: 99, dieSides: 1 })).toEqual({ min: 100, max: 100 });
    expect(effectRange({ basePoints: 49, dieSides: 11 })).toEqual({ min: 50, max: 60 });
    expect(effectRange({ basePoints: 5, dieSides: 0 })).toEqual({ min: 5, max: 5 });
    expect(pointsFor(100, 100)).toEqual({ basePoints: 99, dieSides: 1 });
    expect(pointsFor(50, 59)).toEqual({ basePoints: 49, dieSides: 10 });
    expect(effectRange(pointsFor(70, 90))).toEqual({ min: 70, max: 90 });
  });
});

describe('catalogue', () => {
  it('names the effects, auras and the eight attribute words', () => {
    expect(EFFECTS.find(([v]) => v === 2)![1]).toBe('School damage');
    expect(AURAS.find(([v]) => v === 3)![1]).toBe('Periodic damage');
    expect(ATTRIBUTE_WORDS).toHaveLength(8);
    expect(ATTRIBUTE_WORDS.map((w) => w.field)).toEqual(['Attributes', 'AttributesEx', 'AttributesEx2', 'AttributesEx3', 'AttributesEx4', 'AttributesEx5', 'AttributesEx6', 'AttributesEx7']);
    for (const w of ATTRIBUTE_WORDS) expect(w.field in SPELL_INDEX).toBe(true);
    expect(ATTRIBUTE_WORDS[0]!.bits.find((b) => b.value === 0x40)!.label).toBe('Passive spell');
  });
  it('sets and clears bits of an unsigned mask, bit 31 too', () => {
    expect(toggleBit(0, 2 ** 31, true)).toBe(2 ** 31);
    expect(hasBit(2 ** 31, 2 ** 31)).toBe(true);
    expect(toggleBit(2 ** 31 + 5, 2 ** 31, false)).toBe(5);
    expect(toggleBit(5, 2, true)).toBe(7);
    expect(maskLabel(SCHOOL_BITS, 6)).toBe('Holy, Fire');
    expect(maskLabel(SCHOOL_BITS, 0)).toBe('none');
  });
});

describe('lookups', () => {
  it('label cast times, durations, ranges, radii and icons', () => {
    expect(castTimeLabel(lookups, 1)).toBe('Instant');
    expect(castTimeLabel(lookups, 4)).toBe('1.5 s cast');
    expect(castTimeLabel(lookups, 99)).toBe('Unknown (99)');
    expect(durationLabel(lookups, 5)).toBe('5 min');
    expect(durationLabel(lookups, 21)).toBe('Until cancelled');
    expect(rangeLabel(lookups, 2)).toBe('Long Range · 30 yd');
    expect(rangeLabel(lookups, 3)).toBe('5-40 yd, friendly 45 yd');
    expect(radiusLabel(lookups, 7)).toBe('8 yd (+0.5 per level, up to 20)');
    expect(iconName(lookups, 136)).toBe('Spell_Fire_FlameBolt');
    expect(iconClientPath(lookups, 136)).toBe('Interface\\Icons\\Spell_Fire_FlameBolt.blp');
    expect(iconClientPath(lookups, 1)).toBeNull();
    expect(timeLabel(500)).toBe('500 ms');
    expect(timeLabel(3000)).toBe('3 s');
  });
});

describe('sentences', () => {
  const ctx = { lookups, spellName: (id: number) => (id === 77 ? 'Burn' : undefined) };
  it('says what an effect does', () => {
    const r = fireball();
    expect(effectSentence(effectOf(r, 0), r, ctx)).toBe('Deals 14 to 19 fire damage to the enemy target.');
    const dot = withEffect(r, 1, { effect: 6, aura: 3, basePoints: 4, dieSides: 1, period: 2000, targetA: 6 });
    expect(effectSentence(effectOf(dot, 1), dot, ctx)).toBe('Every 2 s, deals 5 fire damage to the enemy target.');
    const trig = withEffect(r, 2, { effect: 64, triggerSpell: 77, targetA: 1 });
    expect(effectSentence(effectOf(trig, 2), trig, ctx)).toBe('Casts Burn (77) on the caster.');
    expect(effectSentences(trig, ctx)).toHaveLength(2);
    expect(targetWords({ targetA: 0, targetB: 0 })).toBe('the target');
  });
  it('sums up how it is cast', () => {
    expect(castSentence(fireball(), ctx)).toBe('30 mana · 1.5 s cast · 30 yd range · lasts 5 min');
  });
});

describe('spellIssues', () => {
  const ok = { lookups, spellExists: (id: number) => id === 77, isNew: false };
  const codes = (r: ReturnType<typeof fireball>, ctx = ok): string[] => spellIssues(r, ctx).map((i) => i.code);
  it('passes a sound spell', () => {
    expect(codes(fireball())).toEqual([]);
  });
  it('finds ids that lead nowhere', () => {
    expect(codes(withSpell(fireball(), { SpellIconID: 9999 }))).toEqual(['SPELL_REF']);
    expect(codes(withSpell(fireball(), { CastingTimeIndex: 8 }))).toEqual(['SPELL_REF']);
    expect(codes(withEffect(fireball(), 1, { effect: 64, triggerSpell: 5 }))).toEqual(['SPELL_TRIGGER']);
    expect(codes(withEffect(fireball(), 1, { effect: 2, targetA: 500 }))).toEqual(['SPELL_TARGET']);
  });
  it('finds a clash of ids and a missing name', () => {
    expect(codes(fireball(), { ...ok, isNew: true, idTaken: () => true } as typeof ok)).toEqual(['SPELL_ID_TAKEN']);
    expect(codes(withSpell(fireball(), { Name: ' ' }))).toEqual(['SPELL_NAME']);
    expect(codes(withSpell(fireball(), { ID: 0 }))).toEqual(['SPELL_ID']);
  });
  it('finds values out of range and auras that cannot work', () => {
    expect(codes(withSpell(fireball(), { SchoolMask: 200, ProcChance: 120, PowerType: 9 }))).toEqual(['SPELL_SCHOOL', 'SPELL_POWER', 'SPELL_PROC']);
    expect(codes(withEffect(fireball(), 1, { effect: 6, aura: 0 }))).toEqual(['SPELL_AURA_MISSING']);
    expect(codes(withEffect(fireball(), 1, { effect: 2, aura: 3 }))).toEqual(['SPELL_AURA_UNUSED']);
    expect(codes(withEffect(fireball(), 1, { effect: 999 }))).toEqual(['SPELL_EFFECT']);
    expect(spellIssues(withSpell(fireball(), { RangeIndex: 77 }), ok)[0]).toMatchObject({ severity: 'error', fieldId: 'RangeIndex' });
  });
});

describe('DBC edits held by the project', () => {
  const was = [...fireball()];
  it('holds a record whole, keeps the first record the file had, and drops one put back', () => {
    let edits = withRecord(undefined, 'Spell.dbc', 133, withSpell(was, { Name: 'Fire' }), was);
    edits = withRecord(edits, 'spell.dbc', 133, withSpell(was, { Name: 'Fireb' }), withSpell(was, { Name: 'Fire' }));
    expect(edits).toHaveLength(1);
    expect(findRecord(edits, 'Spell.dbc', 133)!.was).toEqual(was);
    expect(editCount(edits)).toBe(1);
    expect(withRecord(edits, 'Spell.dbc', 133, was, was)).toEqual([]);
    expect(withoutRecord(edits, 'Spell.dbc', 133)).toEqual([]);
  });
  it('marks a record made here with no original and keeps records in id order', () => {
    let edits = withRecord(undefined, 'Spell.dbc', 900002, cloneSpell(was, 900002), null);
    edits = withRecord(edits, 'Spell.dbc', 900001, cloneSpell(was, 900001), null);
    expect(edits[0]!.records.map((r) => r.id)).toEqual([900001, 900002]);
    expect(edits[0]!.records[0]!.was).toBeNull();
    expect(changedFields(was, withSpell(was, { Name: 'x', ManaCost: 1 })).sort()).toEqual([SPELL_INDEX.ManaCost, SPELL_INDEX.Name].sort());
  });
  it('is saved with the project and read back, leaving out what is not valid', () => {
    const edits = withRecord(undefined, 'Spell.dbc', 133, withSpell(was, { Name: 'Fire' }), was);
    const store = { npcs: [], objects: [], items: [], dbcEdits: edits };
    expect(projectEntitiesSchema.safeParse(store).success).toBe(true);
    expect(readProjectEntities(JSON.parse(JSON.stringify(store))).dbcEdits).toEqual(edits);
    expect(readProjectEntities({ dbcEdits: [{ file: '', records: [] }, 5] }).dbcEdits).toBeUndefined();
  });
  it('is put into a file: changed records over the file, new ones at the end', () => {
    const dbc = Dbc.empty(234);
    dbc.append(was, SPELL_FORMAT);
    const edits = withRecord(withRecord(undefined, 'Spell.dbc', 133, withSpell(was, { Name: 'Fireball!' }), was), 'Spell.dbc', 900001, cloneSpell(was, 900001), null);
    const out = applyEdit(dbc, SPELL_FORMAT, edits[0]!);
    expect(out).toEqual({ changed: 1, added: 1 });
    const again = Dbc.parse(dbc.serialize());
    expect(again.count).toBe(2);
    expect(spellText(again.decode(again.rowOfId(133)!, SPELL_FORMAT), 'Name')).toBe('Fireball!');
    expect(spellText(again.decode(again.rowOfId(900001)!, SPELL_FORMAT), 'Name')).toBe('Fireball (copy)');
  });
});
