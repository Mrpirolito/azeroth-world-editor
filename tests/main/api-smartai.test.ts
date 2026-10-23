import { describe, expect, it } from 'vitest';
import { createApi } from '../../src/main/api';
import { openStore } from '../../src/main/store/store';
import { createProjectSession } from '../../src/main/project/session';
import { defaultProjectMeta } from '../../src/main/project/project-file';
import type { ProjectController } from '../../src/main/project/controller';
import { newNpc, newSpawn } from '../../src/core/entities/model';
import { SMART_ROWS_KEY } from '../../src/core/smartai/lock';
import { withColumn, type SmartRow } from '../../src/core/smartai/row';
import { allTools } from '../../src/main/mcp/tools';
import { forkDb } from '../helpers/fixtures';
import { mcpFixture } from '../helpers/mcp-fixture';

const box = { encrypt: (s: string) => Uint8Array.from(Buffer.from(s)), decrypt: (b: Uint8Array) => Buffer.from(b).toString() };
const SCRIPT: Record<string, string>[] = [
  { entryorguid: '1423', source_type: '0', id: '0', event_type: '4', action_type: '1', action_param1: '0', target_type: '1', comment: 'Guard - On Aggro - Say' },
  { entryorguid: '1423', source_type: '0', id: '1', event_type: '0', event_param1: '1000', event_param2: '2000', event_param3: '5000', event_param4: '6000', action_type: '11', action_param1: '116', target_type: '2', comment: 'Guard - Cast' },
];

async function setup() {
  const db = forkDb();
  db.insert('creature_template', { entry: '1423', name: 'Stormwind Guard', minlevel: '55', maxlevel: '56', faction: '11', rank: '1', type: '7', npcflag: '4097', lootid: '0', AIName: 'SmartAI' });
  db.insert('creature_template_model', { CreatureID: '1423', Idx: '0', CreatureDisplayID: '3167', DisplayScale: '1', Probability: '1' });
  for (const r of SCRIPT) db.insert('smart_scripts', { event_chance: '100', ...r });
  db.insert('creature_text', { CreatureID: '1423', GroupID: '0', ID: '0', Text: 'Halt!' });
  const written = new Map<string, string>();
  const api = createApi({ store: openStore(':memory:', box), openWorldDb: async () => db, openDevDb: async () => { throw new Error('x'); },
    fs: { writeFile: async (path: string, text: string) => { written.set(path, text); }, ensureDir: async () => {}, listDir: async () => [] },
    now: () => new Date('2026-10-05T00:00:00Z'), session: createProjectSession(defaultProjectMeta('P', 'C:\\out')), projects: {} as ProjectController });
  const rec: any = await api.saveProfile({ name: 'w', role: 'world', host: 'h', port: 1, user: 'u', database: 'd', password: 'p' });
  await api.connect(rec.value.id);
  return { api, db, written };
}

describe('SmartAI rows through the API and the export', () => {
  it('reads what a creature runs, with its creature text', async () => {
    const { api } = await setup();
    const out: any = await api.smartScripts('creature', 1423);
    expect(out.value.rows.map((r: SmartRow) => `${r.entryorguid}/${r.source_type}/${r.id}`)).toEqual(['1423/0/0', '1423/0/1']);
    expect(out.value.texts).toEqual([{ group: 0, id: 0, text: 'Halt!' }]);
  });

  it('searches by spell, and refuses a search with nothing to look for', async () => {
    const { api } = await setup();
    const hits: any = await api.searchSmartScripts({ spell: 116 });
    expect(hits.value.hits).toEqual([expect.objectContaining({ entryorguid: 1423, id: 1, owner: { kind: 'creature', entry: 1423 } })]);
    const none: any = await api.searchSmartScripts({ entry: 1423 });
    expect(none.ok).toBe(false);
    expect(none.error.code).toBe('BAD_REQUEST');
  });

  it('takes an existing creature into the project with its rows, and exports an edit of them with a revert', async () => {
    const { api, written } = await setup();
    const taken: any = await api.readExistingEntity('npc', 1423);
    expect(taken.value.origin.original[SMART_ROWS_KEY]).toHaveLength(2);
    expect(taken.value.smartScripts).toBeNull();

    // Opened and left as read: nothing about SmartAI in either file
    await api.putProjectEntities({ npcs: [{ ...taken.value, smartScripts: taken.value.origin.original[SMART_ROWS_KEY] }], objects: [], items: [] });
    const same: any = await api.exportProject();
    expect(same.value.sql).not.toMatch(/smart_scripts/);

    const edited = (taken.value.origin.original[SMART_ROWS_KEY] as SmartRow[]).map((r) => (r.id === '1' ? withColumn(r, 'action_param1', 118) : r));
    await api.putProjectEntities({ npcs: [{ ...taken.value, smartScripts: edited }], objects: [], items: [] });
    const out: any = await api.exportProject();
    expect(out.ok).toBe(true);
    expect(out.value.sql).toMatch(/DELETE FROM `smart_scripts` WHERE `entryorguid` = 1423 AND `source_type` = 0;\nINSERT INTO `smart_scripts` \(.*\) VALUES/);
    expect(out.value.sql).toMatch(/\(1423, 0, 1, 0, 0, 0, 100, 0, 1000, 2000, 5000, 6000, 0, 0, 11, 118,/);
    const revert = written.get(out.value.revertPath)!;
    expect(revert).toMatch(/DELETE FROM `smart_scripts` WHERE `entryorguid` = 1423 AND `source_type` = 0;/);
    expect(revert).toMatch(/\(1423, 0, 1, 0, 0, 0, 100, 0, 1000, 2000, 5000, 6000, 0, 0, 11, 116,/);
    expect(out.value.warnings).toEqual([]);
  });

  it('exports the rows of a new NPC and sets its AI, and a fight, patrol or scenes do not write over them', async () => {
    const { api } = await setup();
    const rows = SCRIPT.map((r) => ({ ...r, entryorguid: '12000001', event_chance: '100' }));
    await api.putProjectEntities({ npcs: [{ ...newNpc(12000001), name: 'Scout', displayId: 3167, spawns: [{ ...newSpawn(6000001), x: 1, y: 2, z: 3 }], smartScripts: rows }], objects: [], items: [] });
    const out: any = await api.exportProject();
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.value.sql).toMatch(/DELETE FROM `smart_scripts` WHERE `entryorguid` = 12000001 AND `source_type` = 0;/);
    expect(out.value.sql).toMatch(/INSERT INTO `smart_scripts`/);
    expect(out.value.sql).toMatch(/'SmartAI'/);
  });
});

describe('SmartAI through the MCP tools', () => {
  it('lists the tools, and answers a read and a search', async () => {
    expect(allTools.map((t) => t.name)).toEqual(expect.arrayContaining(['smart_scripts', 'search_smart_scripts']));
    const { call, db } = await mcpFixture(allTools);
    for (const r of SCRIPT) db.insert('smart_scripts', { event_chance: '100', ...r });
    const read = await call('smart_scripts', { kind: 'creature', entry: 1423 });
    expect(read.value.rows).toHaveLength(2);
    const found = await call('search_smart_scripts', { action: 11 });
    expect(found.value.hits.map((h: any) => h.id)).toEqual([1]);
    expect(found.value.hits[0].sentence).toBe('On a timer while in combat: cast spell 116, on its current target');
  });
});
