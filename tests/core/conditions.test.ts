import { describe, expect, it } from 'vitest';
import { CONDITIONS, CONDITION_SOURCES, LOOT_SOURCE, conditionOf, conditionSentence, valuesOf } from '../../src/core/conditions/catalogue';
import { rowsetIssues, rowsetStatements } from '../../src/core/tables/rowset';
import { SPECS, specOf } from '../../src/core/tables/specs';
import type { Row } from '../../src/core/tables/types';

/** Real-shaped rows: a gossip option shown only to players who took a quest, and a loot item that needs a reputation or a class */
const base = { SourceTypeOrReferenceId: '15', SourceGroup: '2000', SourceEntry: '1', SourceId: '0', ElseGroup: '0', ConditionTarget: '0', ConditionValue3: '0', NegativeCondition: '0', ErrorType: '0', ErrorTextId: '0', ScriptName: '', Comment: 'Only with the quest' };
const quest: Row = { ...base, ConditionTypeOrReference: '9', ConditionValue1: '25', ConditionValue2: '0' };

describe('the condition catalogue', () => {
  it('names every type once, with the values it reads', () => {
    expect(new Set(CONDITIONS.map((c) => c.id)).size).toBe(CONDITIONS.length);
    for (const c of CONDITIONS) {
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.params.length).toBeLessThanOrEqual(3);
      // The sentence only names values the type has

      const used = [...c.say.matchAll(/\{(\d)\}/g)].map((m) => Number(m[1]));
      expect(Math.max(0, ...used)).toBeLessThanOrEqual(c.params.length);
    }
    expect(conditionOf(9)?.name).toBe('Quest in the log');
    expect(conditionOf(9999)).toBeUndefined();
  });

  it('knows the loot tables\' source numbers, and every source has a name', () => {
    expect(LOOT_SOURCE.pickpocketing_loot_template).toBe(8);
    expect(LOOT_SOURCE.skinning_loot_template).toBe(11);
    expect(CONDITION_SOURCES.map((s) => s.id)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    for (const table of Object.keys(LOOT_SOURCE)) expect(specOf(table) ?? true).toBeTruthy();
  });

  it('says a condition as a sentence, negated or on another object', () => {
    expect(conditionSentence(quest)).toBe('the player has quest 25 in the log');
    expect(conditionSentence({ ...quest, NegativeCondition: '1' })).toBe('not (the player has quest 25 in the log)');
    expect(conditionSentence({ ...base, ConditionTypeOrReference: '27', ConditionValue1: '60', ConditionValue2: '3', ConditionTarget: '1' })).toBe('the second object has level at least 60');
    expect(conditionSentence({ ...base, ConditionTypeOrReference: '16', ConditionValue1: '1026' })).toBe('the player is of race orc or draenei');
    expect(conditionSentence({ ...base, ConditionTypeOrReference: '5', ConditionValue1: '72', ConditionValue2: '96' })).toBe('the player has standing honored or revered with faction 72');
    expect(conditionSentence({ ...base, ConditionTypeOrReference: '-3' })).toBe('the player meets the shared condition 3');
    expect(conditionSentence({ ...base, ConditionTypeOrReference: '77' })).toBe('the player meets unknown condition 77');
    expect(conditionSentence({ ...base, ConditionTypeOrReference: '36' })).toBe('the player is alive');
    expect(valuesOf({ ConditionValue1: '4', ConditionValue2: 'x' })).toEqual([4, 0, 0]);
  });
});

describe('conditions as a table with a sheet', () => {
  const spec = specOf('conditions')!;
  const scope = { SourceTypeOrReferenceId: '15', SourceGroup: '2000', SourceEntry: '1', SourceId: '0' };
  it('is listed, keyed by all ten columns, and scoped by its source', () => {
    expect(SPECS).toContain(spec);
    expect(spec.pk).toHaveLength(10);
    expect(spec.scope).toEqual(['SourceTypeOrReferenceId', 'SourceGroup', 'SourceEntry', 'SourceId']);
  });
  it('writes nothing for conditions left as read', () => {
    expect(rowsetStatements([{ table: 'conditions', scope, original: [quest], rows: [{ ...quest }] }])).toEqual({ apply: [], revert: [] });
  });
  it('deletes by the ten-column key and writes an alternative, with a revert', () => {
    const alt: Row = { ...quest, ElseGroup: '1', ConditionTypeOrReference: '15', ConditionValue1: '4', ConditionValue2: '0' };
    const { apply, revert } = rowsetStatements([{ table: 'conditions', scope, original: [quest], rows: [quest, alt] }]);
    const key = (r: Row) => ({ SourceTypeOrReferenceId: '15', SourceGroup: '2000', SourceEntry: '1', SourceId: '0', ElseGroup: r.ElseGroup, ConditionTypeOrReference: r.ConditionTypeOrReference, ConditionTarget: '0', ConditionValue1: r.ConditionValue1, ConditionValue2: r.ConditionValue2, ConditionValue3: '0' });
    expect(apply.filter((s) => s.kind === 'delete')).toEqual([{ kind: 'delete', table: 'conditions', key: key(quest) }, { kind: 'delete', table: 'conditions', key: key(alt) }]);
    expect(apply.filter((s) => s.kind === 'insert')).toHaveLength(2);
    expect(revert.filter((s) => s.kind === 'insert')).toEqual([{ kind: 'insert', table: 'conditions', row: quest }]);
  });
  it('refuses two identical conditions (the database could hold only one)', () => {
    const issues = rowsetIssues([{ table: 'conditions', scope, original: [], rows: [quest, { ...quest }] }]);
    expect(issues.map((i) => i.code)).toEqual(['ROWSET_DUPLICATE']);
  });
});
