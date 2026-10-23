import { describe, expect, it } from 'vitest';
import { rowsetIssues, rowsetStatements } from '../../src/core/tables/rowset';
import { SPECS, specOf } from '../../src/core/tables/specs';
import type { Row, RowSet } from '../../src/core/tables/types';

const SPELL_TABLES = ['spell_dbc', 'spell_custom_attr', 'spell_proc', 'spell_bonus_data', 'spell_group', 'spell_linked_spell', 'spell_target_position', 'spell_area', 'spell_script_names'];
const set = (table: string, scope: Record<string, string>, original: Row[], rows: Row[]): RowSet => ({ table, scope, original, rows });

describe('the spell tables as sheets', () => {
  it('are all standalone tables with a sheet, found by the spell id', () => {
    for (const table of SPELL_TABLES) {
      const spec = specOf(table)!;
      expect(spec, table).toBeDefined();
      expect(spec.owner).toBe('standalone');
    }
    expect(SPECS.filter((s) => SPELL_TABLES.includes(s.table))).toHaveLength(9);
  });

  it('write a stacking group by (group, spell) and put the old rows back on revert', () => {
    const was: Row[] = [{ spell_id: '100', id: '5' }];
    const { apply, revert } = rowsetStatements([set('spell_group', { spell_id: '100' }, was, [{ id: '5' }, { id: '9' }])]);
    expect(apply).toEqual([
      { kind: 'delete', table: 'spell_group', key: { id: '5', spell_id: '100' } },
      { kind: 'delete', table: 'spell_group', key: { id: '9', spell_id: '100' } },
      { kind: 'insert', table: 'spell_group', row: { id: '5', spell_id: '100' } },
      { kind: 'insert', table: 'spell_group', row: { id: '9', spell_id: '100' } },
    ]);
    expect(revert.at(-1)).toEqual({ kind: 'insert', table: 'spell_group', row: was[0] });
  });

  it('write linked spells under the trigger and teleport destinations per effect', () => {
    const linked = rowsetStatements([set('spell_linked_spell', { spell_trigger: '7' }, [], [{ spell_effect: '8', type: '0', comment: 'x' }])]);
    expect(linked.apply[1]).toEqual({ kind: 'insert', table: 'spell_linked_spell', row: { spell_effect: '8', type: '0', comment: 'x', spell_trigger: '7' } });
    const spec = specOf('spell_target_position')!;
    expect(spec.next!([])).toEqual({ EffectIndex: '0' });
    expect(spec.next!([{ EffectIndex: '0' }, { EffectIndex: '1' }, { EffectIndex: '2' }])).toEqual({ EffectIndex: '2' });
  });

  it('check ranges and refuse a repeated key', () => {
    const bad = rowsetIssues([
      set('spell_dbc', { ID: '5' }, [], [{ ID: '5', ProcChance: '150' }]),
      set('spell_group', { spell_id: '100' }, [], [{ id: '5' }, { id: '5' }]),
      set('spell_proc', { SpellId: '100' }, [], [{ Chance: 'lots' }]),
    ]);
    expect(bad.map((i) => i.code).sort()).toEqual(['ROWSET_DUPLICATE', 'ROWSET_RANGE', 'ROWSET_TYPE']);
  });

  it('warn about a linked spell the files and database do not know', () => {
    const issues = rowsetIssues(
      [set('spell_linked_spell', { spell_trigger: '7' }, [], [{ spell_effect: '8', type: '0' }])],
      { exists: (kind, id) => kind !== 'spell' || id !== 8 },
    );
    expect(issues.map((i) => i.code)).toEqual(['ROWSET_UNKNOWN_REF']);
  });
});
