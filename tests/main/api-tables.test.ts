import { describe, expect, it } from 'vitest';
import { createApi } from '../../src/main/api';
import { openStore } from '../../src/main/store/store';
import { createProjectSession } from '../../src/main/project/session';
import { defaultProjectMeta } from '../../src/main/project/project-file';
import type { ProjectController } from '../../src/main/project/controller';
import { newNpc, newSpawn } from '../../src/core/entities/model';
import { NotReadOnlyError, SqlQueryError } from '../../src/core/db/read-only-sql';
import { forkDbWith } from '../helpers/fixtures';

const box = { encrypt: (s: string) => Uint8Array.from(Buffer.from(s)), decrypt: (b: Uint8Array) => Buffer.from(b).toString() };
const TABLES = ['creature_template_addon', 'creature_template_resistance', 'pickpocketing_loot_template', 'game_tele', 'creature_text', 'broadcast_text'];

async function setup(raw?: (sql: string) => Promise<unknown>) {
  const db = forkDbWith(TABLES);
  db.insert('creature_template', { entry: '1423', name: 'Stormwind Guard', minlevel: '55', maxlevel: '56', faction: '11', rank: '1', type: '7', npcflag: '4097', lootid: '0', pickpocketloot: '0', speed_run: '1.14286' });
  db.insert('creature_template_model', { CreatureID: '1423', Idx: '0', CreatureDisplayID: '3167', DisplayScale: '1', Probability: '1' });
  db.insert('creature_template_addon', { entry: '1423', path_id: '0', mount: '0', bytes1: '0', bytes2: '1', emote: '0', auras: '25' });
  db.insert('game_tele', { id: '1', position_x: '1', position_y: '2', position_z: '3', orientation: '0', map: '0', name: 'Stormwind' });
  db.insert('game_tele', { id: '2', position_x: '1', position_y: '2', position_z: '3', orientation: '0', map: '1', name: 'Orgrimmar' });
  db.insert('broadcast_text', { ID: '5', MaleText: 'Hail, friend', FemaleText: 'Hail, friend' });
  if (raw) (db as any).selectRaw = raw;
  const written = new Map<string, string>();
  const api = createApi({ store: openStore(':memory:', box), openWorldDb: async () => db, openDevDb: async () => { throw new Error('x'); },
    fs: { writeFile: async (path: string, text: string) => { written.set(path, text); }, ensureDir: async () => {}, listDir: async () => [] },
    now: () => new Date('2026-10-05T00:00:00Z'), session: createProjectSession(defaultProjectMeta('P', 'C:\\out')), projects: {} as ProjectController });
  const rec: any = await api.saveProfile({ name: 'w', role: 'world', host: 'h', port: 1, user: 'u', database: 'd', password: 'p' });
  await api.connect(rec.value.id);
  return { api, db, written };
}

describe('the table sheets through the API', () => {
  it('reads a table under a scope with its columns, and says when the database lacks the table', async () => {
    const { api } = await setup();
    const out: any = await api.tableRows('creature_template_addon', { entry: '1423' });
    expect(out.value.exists).toBe(true);
    expect(out.value.rows).toEqual([expect.objectContaining({ entry: '1423', auras: '25' })]);
    expect(out.value.columns).toEqual(expect.arrayContaining(['entry', 'path_id', 'auras']));
    expect(((await api.tableRows('creature_text', { CreatureID: '9' })) as any).value.rows).toEqual([]);
    const lacking: any = await api.tableRows('creature_template_spell', { CreatureID: '1' });
    expect(lacking.value).toEqual({ exists: false, columns: [], rows: [] });
  });

  it('refuses a table with no sheet and a scope the sheet does not look up', async () => {
    const { api } = await setup();
    expect(((await api.tableRows('quest_template', { ID: '1' })) as any).error.code).toBe('BAD_REQUEST');
    expect(((await api.tableRows('creature_template_addon', { path_id: '1' })) as any).error.code).toBe('BAD_REQUEST');
  });

  it('finds rows by id and by their words', async () => {
    const { api } = await setup();
    expect(((await api.searchTable('game_tele', '2')) as any).value.rows.map((r: any) => r.name)).toEqual(['Orgrimmar']);
    expect(((await api.searchTable('game_tele', 'storm')) as any).value.rows.map((r: any) => r.name)).toEqual(['Stormwind']);
    expect(((await api.searchTable('broadcast_text', 'friend')) as any).value.rows.map((r: any) => r.ID)).toEqual(['5']);
    expect(((await api.searchTable('game_tele', '  ')) as any).value.rows).toEqual([]);
  });

  it('exports sheet rows of an existing NPC over its own, with a revert, and nothing for rows left as read', async () => {
    const { api, written } = await setup();
    const taken: any = await api.readExistingEntity('npc', 1423);
    const addon = { entry: '1423', path_id: '0', mount: '0', bytes1: '0', bytes2: '1', emote: '0', visibilityDistanceType: '0', auras: '25' };
    const unchanged = { npcs: [taken.value], objects: [], items: [], rowsets: [{ table: 'creature_template_addon', scope: { entry: '1423' }, original: [addon], rows: [addon] }] };
    await api.putProjectEntities(unchanged);
    expect(((await api.exportProject()) as any).value.sql).not.toMatch(/creature_template_addon/);

    await api.putProjectEntities({ ...unchanged, rowsets: [
      { table: 'creature_template_addon', scope: { entry: '1423' }, original: [addon], rows: [{ ...addon, auras: '25 8', bytes1: '8' }], owner: { kind: 'creature', entry: 1423 } },
      { table: 'creature_template', scope: { entry: '1423' }, original: [{ entry: '1423', pickpocketloot: '0' }], rows: [{ entry: '1423', pickpocketloot: '1423' }] },
      { table: 'pickpocketing_loot_template', scope: { Entry: '1423' }, original: [], rows: [{ Entry: '1423', Item: '2589', Reference: '0', Chance: '35', QuestRequired: '0', LootMode: '1', GroupId: '0', MinCount: '1', MaxCount: '2', Comment: null }] },
    ] });
    const out: any = await api.exportProject();
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.value.sql).toMatch(/DELETE FROM `creature_template_addon` WHERE `entry` = 1423;/);
    expect(out.value.sql).toMatch(/INSERT INTO `creature_template_addon` .*VALUES\s*\(1423, .*'25 8'/s);
    expect(out.value.sql).toMatch(/INSERT INTO `pickpocketing_loot_template`/);
    expect(out.value.sql).toMatch(/INSERT INTO `creature_template` .*1423/s);
    const revert = written.get(out.value.revertPath)!;
    expect(revert).toMatch(/DELETE FROM `pickpocketing_loot_template` WHERE `Entry` = 1423 AND `Item` = 2589;/);
    expect(revert).toMatch(/INSERT INTO `creature_template_addon` .*'25'/s);
  });

  it('exports the rows of a table that belongs to no one', async () => {
    const { api } = await setup();
    await api.putProjectEntities({ npcs: [], objects: [], items: [], rowsets: [
      { table: 'game_tele', scope: { id: '3' }, original: [], rows: [{ id: '3', name: 'Ironforge', map: '0', position_x: '1', position_y: '2', position_z: '3', orientation: '0' }] },
    ] });
    const out: any = await api.exportProject();
    expect(out.error).toBeUndefined();
    expect(out.value.sql).toMatch(/DELETE FROM `game_tele` WHERE `id` = 3;/);
    expect(out.value.sql).toMatch(/INSERT INTO `game_tele` .*'Ironforge'/s);
  });

  it('puts the sets of a new NPC beside its rows, and a deleted NPC takes its sets away', async () => {
    const { api } = await setup();
    const npc = { ...newNpc(12000001), name: 'Scout', displayId: 3167, spawns: [{ ...newSpawn(6000001), x: 1, y: 2, z: 3 }] };
    await api.putProjectEntities({ npcs: [npc], objects: [], items: [], rowsets: [
      { table: 'creature_template_resistance', scope: { CreatureID: '12000001' }, original: [], rows: [{ CreatureID: '12000001', School: '2', Resistance: '30' }], owner: { kind: 'creature', entry: 12000001 } },
    ] });
    expect(((await api.exportProject()) as any).value.sql).toMatch(/INSERT INTO `creature_template_resistance`/);
    await api.deleteEntity('npc', 12000001);
    expect(((await api.projectEntities()) as any).value.rowsets ?? []).toEqual([]);
  });
});

describe('free ids and the SQL console', () => {
  it('finds the first free ids from a start, skipping used ones, through a read-only query', async () => {
    const asked: string[] = [];
    const { api } = await setup(async (sql) => {
      asked.push(sql);
      return { columns: ['v'], rows: [{ v: '10' }, { v: '11' }, { v: '13' }], truncated: false };
    });
    const out: any = await api.freeIds('game_tele', 'id', 10, 3);
    expect(out.value.ids).toEqual([12, 14, 15]);
    expect(asked[0]).toMatch(/^SELECT DISTINCT `id` AS v FROM `game_tele` WHERE `id` >= 10 ORDER BY `id` LIMIT 500$/);
    expect(((await api.freeIds('game_tele', 'nope', 1, 1)) as any).error.code).toBe('BAD_REQUEST');
    expect(((await api.freeIds('game_tele; DROP', 'id', 1, 1)) as any).error.code).toBe('BAD_REQUEST');
  });

  it('runs what the database layer allows and says why when it refuses', async () => {
    const { api } = await setup(async (sql) => {
      if (sql.startsWith('DELETE')) throw new NotReadOnlyError('Only SELECT, SHOW, DESCRIBE and EXPLAIN are allowed.');
      if (sql.includes('nope')) throw new SqlQueryError("Unknown column 'nope' in 'field list'");
      return { columns: ['name'], rows: [{ name: 'Stormwind' }], truncated: false };
    });
    expect(((await api.sqlQuery('SELECT name FROM game_tele')) as any).value.rows).toEqual([{ name: 'Stormwind' }]);
    const refused: any = await api.sqlQuery('DELETE FROM game_tele');
    expect(refused.error).toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('Only SELECT') });
    expect(((await api.sqlQuery('SELECT nope FROM game_tele')) as any).error.message).toContain("Unknown column 'nope'");
  });

  it('is off where the connection cannot run queries', async () => {
    const { api } = await setup();
    expect(((await api.sqlQuery('SELECT 1')) as any).error.code).toBe('BAD_REQUEST');
  });
});
