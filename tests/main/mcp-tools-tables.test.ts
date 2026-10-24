import { describe, expect, it } from 'vitest';
import { allTools } from '../../src/main/mcp/tools';
import { NotReadOnlyError } from '../../src/core/db/read-only-sql';
import { mcpFixture } from '../helpers/mcp-fixture';

const fixture = async () => {
  const f = await mcpFixture(allTools, { tables: ['game_tele', 'spell_group', 'creature_template_addon'] });
  f.db.insert('game_tele', { id: '1', position_x: '1', position_y: '2', position_z: '3', orientation: '0', map: '0', name: 'Stormwind' });
  f.db.insert('creature_template_addon', { entry: '1423', path_id: '0', mount: '0', bytes1: '0', bytes2: '1', emote: '0', auras: '25' });
  // The console and the free-id search read through this; the real one refuses what could write
  (f.db as unknown as { selectRaw: (sql: string) => Promise<unknown> }).selectRaw = async (sql) => {
    if (/^s*(DELETE|INSERT|UPDATE)/i.test(sql)) throw new NotReadOnlyError('Only SELECT, SHOW, DESCRIBE and EXPLAIN are allowed.');
    return { columns: ['v'], rows: [{ v: '1' }], truncated: false };
  };
  return f;
};

describe('table tools', () => {
  it('table_specs says what each table is and its columns, with named choices', async () => {
    const { call } = await fixture();
    const all = await call('table_specs');
    expect(all.value.specs.length).toBeGreaterThan(30);
    const group = (await call('table_specs', { table: 'spell_group' })).value.specs[0];
    expect(group).toMatchObject({ table: 'spell_group', scope: ['spell_id'], pk: ['id', 'spell_id'], multi: true });
    const linked = (await call('table_specs', { table: 'spell_linked_spell' })).value.specs[0];
    expect(linked.fields.find((f: any) => f.column === 'type').options).toHaveLength(3);
    expect(linked.fields.find((f: any) => f.column === 'spell_effect').refKind).toBe('spell');
    expect((await call('table_specs', { table: 'quest_template' })).isError).toBe(true);
  });

  it('table_rows shows the database rows and the project rows apart', async () => {
    const { call } = await fixture();
    const before = await call('table_rows', { table: 'game_tele', scope: { id: 1 } });
    expect(before.value.database).toEqual([expect.objectContaining({ id: '1', name: 'Stormwind' })]);
    expect(before.value.project).toBeNull();
    await call('set_table_rows', { table: 'game_tele', scope: { id: 1 }, rows: [{ name: 'Stormwind City', map: 0, position_x: 1, position_y: 2, position_z: 3, orientation: 0 }] });
    const after = await call('table_rows', { table: 'game_tele', scope: { id: 1 } });
    expect(after.value.project).toEqual([expect.objectContaining({ id: '1', name: 'Stormwind City' })]);
    expect(after.value.database[0].name).toBe('Stormwind');
  });

  it('set_table_rows is one undo step labelled for the table, and is undone with undo', async () => {
    const { call, changes, session } = await fixture();
    const out = await call('set_table_rows', { table: 'spell_group', scope: { spell_id: 100 }, rows: [{ id: 5 }, { id: 9 }] });
    expect(out.isError).toBe(false);
    expect(out.value.changed).toBe(true);
    expect(changes.at(-1)!.step!.label).toBe('AI: edit spell_group 100');
    expect(session.entities.get().rowsets![0]).toMatchObject({ table: 'spell_group', scope: { spell_id: '100' }, original: [], rows: [{ spell_id: '100', id: '5' }, { spell_id: '100', id: '9' }] });
    await call('undo');
    expect(session.entities.get().rowsets).toBeUndefined();
  });

  it('set_table_rows refuses rows with errors and scopes that are not whole, and says why', async () => {
    const { call, session } = await fixture();
    const twice = await call('set_table_rows', { table: 'spell_group', scope: { spell_id: 100 }, rows: [{ id: 5 }, { id: 5 }] });
    expect(twice.isError).toBe(true);
    expect(twice.value.message).toMatch(/repeats another row/);
    expect((await call('set_table_rows', { table: 'spell_group', scope: {}, rows: [] })).value.message).toMatch(/rows are found by spell_id/);
    expect((await call('set_table_rows', { table: 'spell_proc', scope: { SpellId: 5 }, rows: [{ Chance: 5 }] })).value.message).toMatch(/no spell_proc table/);
    expect(session.entities.get().rowsets).toBeUndefined();
  });

  it('a template column sheet needs the NPC in the project first', async () => {
    const { call } = await fixture();
    const out = await call('set_table_rows', { table: 'creature_template', scope: { entry: 1423 }, rows: [{ unit_class: 2 }] });
    expect(out.isError).toBe(true);
    expect(out.value.message).toMatch(/take it into the project first/);
  });

  it('table_sql shows the deletes and inserts a sheet will write, and the revert', async () => {
    const { call } = await fixture();
    const preview = await call('table_sql', { table: 'game_tele', scope: { id: 1 }, rows: [{ name: 'Stormwind City', map: 0, position_x: 1, position_y: 2, position_z: 3, orientation: 0 }] });
    expect(preview.value.sql).toMatch(/DELETE FROM `game_tele` WHERE `id` = 1;/);
    expect(preview.value.sql).toMatch(/INSERT INTO `game_tele`[\s\S]*'Stormwind City'/);
    expect(preview.value.revert).toMatch(/'Stormwind'/);
    expect(preview.value.note).toBeNull();
    const none = await call('table_sql', { table: 'game_tele', scope: { id: 1 } });
    expect(none.value.sql).toBe('');
    expect(none.value.note).toMatch(/holds no rows/);
    const same = await call('table_sql', { table: 'game_tele', scope: { id: 1 }, rows: [{ name: 'Stormwind', map: 0, position_x: 1, position_y: 2, position_z: 3, orientation: 0 }] });
    expect(same.value.note).toMatch(/same as the database/);
  });

  it('search_table, free ids and the read-only SQL console are reachable', async () => {
    const { call } = await fixture();
    expect((await call('search_table', { table: 'game_tele', text: '1' })).value.rows).toHaveLength(1);
    expect((await call('free_table_ids', { table: 'game_tele', column: 'id', from: 1, count: 2 })).value.ids).toEqual([2, 3]);
    const bad = await call('sql_query', { sql: 'DELETE FROM game_tele' });
    expect(bad.isError).toBe(true);
    expect(bad.value.message).toMatch(/Only SELECT/);
    expect((await call('sql_query', { sql: 'SELECT 1' })).value.rows).toEqual([{ v: '1' }]);
  });
});
