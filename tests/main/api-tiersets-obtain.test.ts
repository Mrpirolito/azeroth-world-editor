import { describe, expect, it } from 'vitest';
import { createApi } from '../../src/main/api';
import { openStore } from '../../src/main/store/store';
import { createProjectSession } from '../../src/main/project/session';
import { defaultProjectMeta } from '../../src/main/project/project-file';
import type { ProjectController } from '../../src/main/project/controller';
import type { ServerDataFiles } from '../../src/main/server-data';
import { Dbc, type DbcValue } from '../../src/core/game/dbc-file';
import { layoutOf } from '../../src/core/game/dbc-formats';
import { findRecord } from '../../src/core/dbc/edits';
import { findSet } from '../../src/core/tables/rowset';
import { classMask, newTierSet, PIECES, type TierSet } from '../../src/core/tiersets/model';
import { costRecord, type TokenGroup } from '../../src/core/tiersets/obtain';
import { forkDbWith } from '../helpers/fixtures';

const box = { encrypt: (s: string) => Uint8Array.from(Buffer.from(s)), decrypt: (b: Uint8Array) => Buffer.from(b).toString() };

const dbcFile = (file: string, rows: DbcValue[][]): Uint8Array => {
  const l = layoutOf(file)!;
  const d = Dbc.empty(l.fields.length);
  for (const r of rows) d.append(r, l.format);
  return d.serialize();
};

const DBC: Record<string, Uint8Array> = {
  'Spell.dbc': dbcFile('Spell.dbc', []),
  'ItemDisplayInfo.dbc': dbcFile('ItemDisplayInfo.dbc', []),
  'ItemSet.dbc': dbcFile('ItemSet.dbc', []),
  // 5000 asks for 2 of item 912000, 5001 for one of 912001 and nothing else: the second is what the first token's cost looks like
  'ItemExtendedCost.dbc': dbcFile('ItemExtendedCost.dbc', [costRecord(5000, 912000, 2), costRecord(5001, 912001)]),
};
const files: ServerDataFiles = {
  isDir: async (d) => d === '/data',
  read: async (d, name) => (d.replace(/\\/g, '/') === '/data/dbc' ? (DBC[name] ?? null) : null),
};

async function setup() {
  const db = forkDbWith(['item_dbc', 'itemextendedcost_dbc', 'creature_loot_template', 'conditions', 'spell_dbc']);
  db.insert('item_template', { entry: '900000', name: 'Old', class: '2', subclass: '0' });
  db.insert('creature_template', { entry: '36000', name: 'Lord Marrowgar', lootid: '36000', difficulty_entry_1: '36001', difficulty_entry_2: '0', difficulty_entry_3: '0' });
  db.insert('creature_template', { entry: '36001', name: 'Lord Marrowgar', lootid: '36001', difficulty_entry_1: '0', difficulty_entry_2: '0', difficulty_entry_3: '0' });
  db.insert('creature_template', { entry: '50000', name: 'Last', lootid: '0' });
  db.insert('creature', { guid: '700', id1: '50000' });
  db.insert('creature_loot_template', { Entry: '36000', Item: '45000', Reference: '0', Chance: '10', QuestRequired: '0', LootMode: '1', GroupId: '0', MinCount: '1', MaxCount: '1' });
  const session = createProjectSession(defaultProjectMeta('P', 'C:\\out'));
  const api = createApi({
    store: openStore(':memory:', box), openWorldDb: async () => db, openDevDb: async () => { throw new Error('x'); },
    fs: { writeFile: async () => {}, writeBytes: async () => {}, ensureDir: async () => {}, listDir: async () => [] },
    now: () => new Date('2026-10-23T10:00:00Z'), session, projects: {} as ProjectController, serverDataFiles: files,
  });
  const rec: any = await api.saveProfile({ name: 'w', role: 'world', host: 'h', port: 1, user: 'u', database: 'd', password: 'p', dbcDir: '/data' });
  await api.connect(rec.value.id);
  return { api, session };
}

const none = { head: 0, shoulders: 0, chest: 0, hands: 0, legs: 0 };
const group = (over: Partial<TokenGroup> = {}): TokenGroup => ({
  prefix: 'Lost', group: 'Conqueror', classIds: [2, 5], quality: 'epic', itemLevel: 213, requiredLevel: 80, displayId: 41438, entries: { ...none }, costs: { ...none },
  drops: [{ boss: 36000, bossName: '', tokens: ['head', 'chest'], difficulties: ['10n', '25n'], chance: 30, groupId: 1, min: 1, max: 1 }], ...over,
});

const set = (name: string, classId: number, vendor: NonNullable<TierSet['obtain']>['vendor']): TierSet => {
  const s = newTierSet(name, classId, 'plate');
  PIECES.forEach((k, i) => { s.pieces[k].look = { kind: 'existing', displayId: 5000 + i }; });
  s.obtain = { tokenGroup: 'Lost Conqueror', vendor };
  return s;
};
const newVendor = { entry: 0, created: true, name: 'Tier Vendor', subname: 'Tier sets', displayId: 1234, spawn: { guid: 0, map: 0, x: 1, y: 2, z: 3, o: 0 }, classFilter: true };

describe('tier set tokens, drops and vendor through the API', () => {
  it('saves a token group with items, costs and drops per difficulty, and keeps the ids when saved again', async () => {
    const { api, session } = await setup();
    const saved: any = await api.tierTokenGroupSave(group());
    expect(saved.ok).toBe(true);
    const g: TokenGroup = saved.value.group;
    expect(PIECES.map((k) => g.entries[k])).toEqual([900001, 900002, 900003, 900004, 900005]);
    // The costs are new records above the file's (5001 is not the right cost: it asks for another item)
    expect(PIECES.map((k) => g.costs[k])).toEqual([5002, 5003, 5004, 5005, 5006]);
    const store = session.entities.get();
    expect(store.items.map((i) => i.name)).toContain('Gloves of the Lost Conqueror');
    expect(findRecord(store.dbcEdits, 'ItemExtendedCost.dbc', 5004)!.values.slice(0, 10)).toEqual([5004, 0, 0, 0, 900003, 0, 0, 0, 0, 1]);
    expect(findSet(store.rowsets, 'itemextendedcost_dbc', { ID: '5004' })!.rows[0]).toMatchObject({ ItemID_1: '900003', ItemCount_1: '1' });
    const loot36000 = findSet(store.rowsets, 'creature_loot_template', { Entry: '36000' })!;
    expect(loot36000.original.map((r) => r.Item)).toEqual(['45000']);
    expect(loot36000.rows.map((r) => r.Item)).toEqual(['45000', '900001', '900003']);
    expect(findSet(store.rowsets, 'creature_loot_template', { Entry: '36001' })!.rows).toHaveLength(2);
    expect(saved.value.summary[0]).toMatchObject({ entry: 36000, name: 'Lord Marrowgar' });
    expect(saved.value.summary[0].lines.map((l: any) => [l.difficulty, l.creature])).toEqual([['10n', 36000], ['25n', 36001]]);
    expect(saved.value.warnings.join(' ')).toContain('900001');

    const again: any = await api.tierTokenGroupSave(g);
    expect(again.value.group).toEqual(g);
    expect(session.entities.get()).toEqual(store);
  });

  it('reuses a cost the game already has for the same token', async () => {
    const { api } = await setup();
    DBC['ItemExtendedCost.dbc'] = dbcFile('ItemExtendedCost.dbc', [costRecord(5000, 900001)]);
    try {
      const saved: any = await api.tierTokenGroupSave(group({ drops: [] }));
      expect(saved.value.group.costs.head).toBe(5000);
      expect(saved.value.group.costs.shoulders).toBe(5001);
    } finally {
      DBC['ItemExtendedCost.dbc'] = dbcFile('ItemExtendedCost.dbc', [costRecord(5000, 912000, 2), costRecord(5001, 912001)]);
    }
  });

  it('saves sets of two classes that share the tokens: one new vendor NPC with class conditions, and cleans up after them', async () => {
    const { api, session } = await setup();
    await api.tierTokenGroupSave(group({ drops: [] }));
    const paladin: any = await api.tierSetSave(set('Tier 1 Paladin', 2, newVendor));
    expect(paladin.ok).toBe(true);
    const vendor = paladin.value.set.obtain.vendor;
    expect(vendor).toMatchObject({ entry: 50001, created: true });
    expect(vendor.spawn.guid).toBe(701);
    const priest: any = await api.tierSetSave(set('Tier 1 Priest', 5, { ...newVendor, entry: 50001, created: false, spawn: null }));
    expect(priest.ok).toBe(true);

    const store = session.entities.get();
    const npc = store.npcs.find((n) => n.entry === 50001)!;
    expect(npc).toMatchObject({ name: 'Tier Vendor', displayId: 1234 });
    expect(npc.spawns).toHaveLength(1);
    const costs = store.tokenGroups![0]!.costs;
    expect(npc.vendor).toHaveLength(10);
    expect(npc.vendor.map((v) => v.extendedCost)).toEqual([...PIECES.map((k) => costs[k]), ...PIECES.map((k) => costs[k])]);
    expect(npc.vendor.map((v) => v.item)).toEqual([...paladin.value.set.pieces ? PIECES.map((k) => paladin.value.set.pieces[k].entry) : [], ...PIECES.map((k) => priest.value.set.pieces[k].entry)]);
    const cond = findSet(store.rowsets, 'conditions', { SourceTypeOrReferenceId: '23', SourceGroup: '50001', SourceEntry: String(priest.value.set.pieces.legs.entry), SourceId: '0' })!;
    expect(cond.rows[0]).toMatchObject({ ConditionTypeOrReference: '15', ConditionValue1: String(classMask(5)) });
    expect(store.items.find((i) => i.entry === store.tokenGroups![0]!.entries.head)!.description).toBe('Can be exchanged for Tier 1 Paladin Head, Tier 1 Priest Head.');

    // Saving again changes nothing; the ids stay
    const before = JSON.stringify(session.entities.get());
    await api.tierSetSave(paladin.value.set);
    await api.tierSetSave(priest.value.set);
    expect(JSON.parse(JSON.stringify(session.entities.get()))).toEqual(JSON.parse(before));

    // The group cannot go while a set uses it; the priests leave, then the paladins take the NPC with them
    expect(((await api.tierTokenGroupDelete('Lost Conqueror')) as any).error.message).toContain('Tier 1 Paladin');
    await api.tierSetDelete('Tier 1 Priest');
    expect(session.entities.get().npcs.find((n) => n.entry === 50001)!.vendor).toHaveLength(5);
    await api.tierSetDelete('Tier 1 Paladin');
    expect(session.entities.get().npcs).toHaveLength(0);
    expect(session.entities.get().rowsets?.some((s) => s.table === 'conditions')).toBeFalsy();
    expect(((await api.tierTokenGroupDelete('Lost Conqueror')) as any).ok).toBe(true);
    expect(session.entities.get().items).toHaveLength(0);
    expect(session.entities.get().dbcEdits?.some((e) => e.file === 'ItemExtendedCost.dbc')).toBeFalsy();
  });

  it('adds the pieces to the stock of an NPC that exists, bringing it into the project', async () => {
    const { api, session } = await setup();
    await api.tierTokenGroupSave(group({ drops: [] }));
    const saved: any = await api.tierSetSave(set('Tier 1 Paladin', 2, { ...newVendor, entry: 50000, created: false, spawn: null }));
    expect(saved.ok).toBe(true);
    const npc = session.entities.get().npcs.find((n) => n.entry === 50000)!;
    expect(npc.origin.kind).toBe('existing');
    expect(npc.vendor.map((v) => v.item)).toEqual(PIECES.map((k) => saved.value.set.pieces[k].entry));
    expect(((await api.tierSetSave(set('Tier 1 Priest', 5, { ...newVendor, entry: 49999, created: false, spawn: null }))) as any).error.message).toContain('not in the database');
  });

  it('refuses a set whose group is missing or does not serve its class', async () => {
    const { api } = await setup();
    expect(((await api.tierSetSave(set('Tier 1 Paladin', 2, null))) as any).error.message).toContain('not in the project');
    await api.tierTokenGroupSave(group({ drops: [] }));
    expect(((await api.tierSetSave(set('Tier 1 Warrior', 1, null))) as any).error.message).toContain('do not serve');
  });
});
