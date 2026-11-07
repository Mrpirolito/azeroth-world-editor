import { describe, expect, it } from 'vitest';
import { itemRow } from '../../src/core/entities/item-columns';
import { EMPTY_ENTITIES, type ProjectEntities } from '../../src/core/entities/model';
import { findRecord } from '../../src/core/dbc/edits';
import { layoutOf } from '../../src/core/game/dbc-formats';
import { findSet, rowsetStatements } from '../../src/core/tables/rowset';
import { classMask, newTierSet, PIECES, type TierSet } from '../../src/core/tiersets/model';
import {
  applyTokenGroup, buildToken, buildTokenDbc, COST_FILE, COST_TABLE, costRecord, dropPlan, findCost, obtainIssues, refreshTokens, removeTokenGroup, syncVendors,
  tierItemEntries, tierObtainIds, tokenClassMask, tokenGroupIssues, tokenGroupName, tokenItemName, type BossInfo, type TokenGroup,
} from '../../src/core/tiersets/obtain';

const group = (over: Partial<TokenGroup> = {}): TokenGroup => ({
  prefix: 'Lost', group: 'Conqueror', classIds: [2, 5, 9], quality: 'epic', itemLevel: 213, requiredLevel: 80, displayId: 41438,
  entries: { head: 910000, shoulders: 910001, chest: 910002, hands: 910003, legs: 910004 },
  costs: { head: 7001, shoulders: 7002, chest: 7003, hands: 7004, legs: 7005 }, drops: [], ...over,
});

function savedSet(name: string, classId: number, base: number, vendor: TierSet['obtain'] extends infer O ? O : never): TierSet {
  const set = newTierSet(name, classId, 'plate');
  PIECES.forEach((k, i) => { set.pieces[k].entry = base + i; set.pieces[k].look = { kind: 'existing', displayId: 5000 + i }; });
  set.itemSetId = base;
  set.obtain = vendor;
  return set;
}

const vendorCfg = { entry: 920000, created: true, name: 'Tier Vendor', subname: 'Tier sets', displayId: 1234, spawn: { guid: 930000, map: 0, x: 1, y: 2, z: 3, o: 0.5 }, classFilter: true };
const paladin = (): TierSet => savedSet('Tier 1 Paladin', 2, 900000, { tokenGroup: 'Lost Conqueror', vendor: vendorCfg });
const priest = (): TierSet => savedSet('Tier 1 Priest', 5, 900100, { tokenGroup: 'Lost Conqueror', vendor: { ...vendorCfg, created: false } });

const withSets = (sets: TierSet[], g: TokenGroup = group()): ProjectEntities => ({ ...EMPTY_ENTITIES, tierSets: sets, tokenGroups: [g] });

/** The boss 36000 plays 25 normal as 36001 and has no 10 heroic; 36003 is 25 heroic */
const bosses: Record<number, BossInfo> = {
  36000: { entry: 36000, name: 'Lord Marrowgar', lootId: 36000, diff: [36001, 0, 36003] },
  36001: { entry: 36001, name: 'Lord Marrowgar', lootId: 36001, diff: [0, 0, 0] },
  36003: { entry: 36003, name: 'Lord Marrowgar', lootId: 36003, diff: [0, 0, 0] },
  40000: { entry: 40000, name: 'Lone Boss', lootId: 40000, diff: [0, 0, 0] },
};
const lookup = (entry: number): BossInfo | undefined => bosses[entry];

describe('token items', () => {
  it('names the tokens like Blizzard, class 15, bind on pickup, with the flags of tier tokens and the classes it serves', () => {
    const g = group();
    expect(PIECES.map((k) => tokenItemName(g, k))).toEqual([
      'Helm of the Lost Conqueror', 'Mantle of the Lost Conqueror', 'Chestguard of the Lost Conqueror', 'Gloves of the Lost Conqueror', 'Leggings of the Lost Conqueror',
    ]);
    const item = buildToken(g, 'chest', undefined);
    expect(item).toMatchObject({ entry: 910002, itemClass: 15, subclass: 0, inventoryType: 0, bonding: 'pickup', stackable: 1, maxCount: 0, quality: 'epic', itemLevel: 213, displayId: 41438 });
    expect(item.advanced).toEqual({ AllowableClass: String(classMask(2) | classMask(5) | classMask(9)), Flags: '4096' });
    const row = itemRow(item);
    expect(row).toMatchObject({ class: '15', subclass: '0', bonding: '1', stackable: '1', Flags: '4096' });
    expect(tokenClassMask(g)).toBe(classMask(2) | classMask(5) | classMask(9));
  });
  it('masks custom classes beyond bit 30 as unsigned numbers', () => {
    expect(tokenClassMask(group({ classIds: [1, 32] }))).toBe((1 + 2 ** 31) >>> 0);
  });
  it('describes the exchange from the sets that use the token, and the client row', () => {
    expect(buildToken(group(), 'head', undefined).description).toBe('Can be exchanged for the head piece of a tier set.');
    expect(buildToken(group(), 'head', [paladin(), priest()]).description).toBe('Can be exchanged for Tier 1 Paladin Head, Tier 1 Priest Head.');
    expect(buildTokenDbc(group(), 'legs')).toMatchObject({ ID: '910004', ClassID: '15', SubclassID: '0', DisplayInfoID: '41438', InventoryType: '0' });
  });
  it('shares one group between the sets of different classes and refreshes the text when they change', () => {
    const applied = applyTokenGroup(withSets([paladin(), priest()]), group(), undefined, { targets: new Map(), summary: [], notes: [] }, new Map());
    expect(applied.items.map((i) => i.name)).toHaveLength(5);
    const fewer = refreshTokens({ ...applied, tierSets: [paladin()] });
    expect(fewer.items.find((i) => i.entry === 910000)!.description).toBe('Can be exchanged for Tier 1 Paladin Head.');
  });
});

describe('drops', () => {
  it('writes a row per difficulty entry, the same entry when the boss has none, and one table per creature', () => {
    const g = group({ drops: [{ boss: 36000, bossName: '', tokens: ['head', 'chest'], difficulties: ['10n', '25n', '10h', '25h'], chance: 40, groupId: 1, min: 1, max: 1 }] });
    const plan = dropPlan(g, lookup);
    expect([...plan.targets.keys()].sort()).toEqual([36000, 36001, 36003]);
    expect(plan.targets.get(36001)!.map((r) => r.Item)).toEqual(['910000', '910002']);
    expect(plan.targets.get(36000)![0]).toMatchObject({ Entry: '36000', Chance: '40', GroupId: '1', MinCount: '1', MaxCount: '1', LootMode: '1', Reference: '0' });
    expect(plan.summary[0]!.lines.map((l) => [l.difficulty, l.creature])).toEqual([['10n', 36000], ['25n', 36001], ['10h', 36000], ['25h', 36003]]);
    expect(plan.targets.get(36000)).toHaveLength(2);
  });
  it('lays our rows over the loot the boss has and keeps them stable and removable', () => {
    const g = group({ drops: [{ boss: 40000, bossName: '', tokens: ['legs'], difficulties: ['10n', '25n'], chance: 25, groupId: 0, min: 1, max: 2 }] });
    const plan = dropPlan(g, lookup);
    const theirs = { Entry: '40000', Item: '12345', Reference: '0', Chance: '10', QuestRequired: '0', LootMode: '1', GroupId: '0', MinCount: '1', MaxCount: '1', Comment: null };
    const base = new Map([[40000, [theirs]]]);
    const once = applyTokenGroup(EMPTY_ENTITIES, g, undefined, plan, base);
    const twice = applyTokenGroup(once, g, g, plan, base);
    expect(twice).toEqual(once);
    const loot = findSet(once.rowsets, 'creature_loot_template', { Entry: '40000' })!;
    expect(loot.original).toEqual([theirs]);
    expect(loot.rows.map((r) => r.Item)).toEqual(['12345', '910004']);
    expect(loot.rows[1]).toMatchObject({ Chance: '25', MaxCount: '2' });
    const statements = rowsetStatements(once.rowsets);
    expect(statements.apply.filter((s) => s.kind === 'insert' && s.table === 'creature_loot_template')).toHaveLength(2);
    // Dropping the boss from the group takes our rows away and leaves the others
    const without = applyTokenGroup(once, { ...g, drops: [] }, g, dropPlan({ ...g, drops: [] }, lookup), base);
    expect(findSet(without.rowsets, 'creature_loot_template', { Entry: '40000' })).toBeUndefined();
    expect(removeTokenGroup(once, g).rowsets?.some((s) => s.table === 'creature_loot_template')).toBeFalsy();
  });
  it('warns of a boss with no loot id or no row', () => {
    const plan = dropPlan(group({ drops: [{ boss: 40000, bossName: '', tokens: ['head'], difficulties: ['10n'], chance: 100, groupId: 0, min: 1, max: 1 }, { boss: 5, bossName: '', tokens: ['head'], difficulties: ['10n'], chance: 100, groupId: 0, min: 1, max: 1 }] }), (e) => (e === 40000 ? { ...bosses[40000]!, lootId: 0 } : undefined));
    expect(plan.notes.join(' ')).toContain('no loot id');
    expect(plan.notes.join(' ')).toContain('Boss 5 is not in the database');
    expect([...plan.targets.keys()]).toEqual([40000]);
  });
  it('rejects a token twice from one boss and a group that adds up past 100', () => {
    const d = { boss: 40000, bossName: 'Lone Boss', tokens: ['head' as const], difficulties: ['10n' as const], chance: 100, groupId: 0, min: 1, max: 1 };
    expect(tokenGroupIssues(group({ drops: [d, d] })).some((i) => i.severity === 'error')).toBe(true);
    expect(tokenGroupIssues(group({ drops: [{ ...d, tokens: [...PIECES], chance: 40, groupId: 2 }] })).some((i) => i.severity === 'warning')).toBe(true);
    expect(tokenGroupIssues(group({ displayId: 0 })).some((i) => i.severity === 'error')).toBe(true);
  });
});

describe('extended costs', () => {
  it('writes one record per token in the client file and the server table, owned by the project', () => {
    const store = applyTokenGroup(withSets([]), group(), undefined, { targets: new Map(), summary: [], notes: [] }, new Map(), new Set([7001, 7002, 7003, 7004, 7005]));
    const layout = layoutOf(COST_FILE)!;
    expect(layout.fields).toHaveLength(16);
    expect(findRecord(store.dbcEdits, COST_FILE, 7003)).toEqual({ id: 7003, values: costRecord(7003, 910002), was: null });
    const row = findSet(store.rowsets, COST_TABLE, { ID: '7003' })!.rows[0]!;
    expect(row).toMatchObject({ ID: '7003', ItemID_1: '910002', ItemCount_1: '1', HonorPoints: '0' });
    expect(store.rowsets!.filter((s) => s.table === 'item_dbc')).toHaveLength(5);
    expect(removeTokenGroup(store, group()).dbcEdits).toBeUndefined();
    expect(removeTokenGroup(store, group()).rowsets).toBeUndefined();
  });
  it('reuses an identical cost and not a different one', () => {
    expect(findCost(910000, [{ id: 5, values: costRecord(5, 910000) }, { id: 6, values: costRecord(6, 910000, 2) }])).toBe(5);
    expect(findCost(910000, [{ id: 6, values: costRecord(6, 910000, 2) }, { id: 7, values: [7, 100, 0, 0, 910000, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0] }])).toBeUndefined();
    expect(findCost(910000, [{ id: 8, values: costRecord(8, 910001) }])).toBeUndefined();
  });
  it('writes no record for a cost the game already has', () => {
    const store = applyTokenGroup(withSets([]), group(), undefined, { targets: new Map(), summary: [], notes: [] }, new Map());
    expect(store.dbcEdits).toBeUndefined();
    expect(store.rowsets!.some((s) => s.table === COST_TABLE)).toBe(false);
  });
});

describe('vendor', () => {
  const full = (): ProjectEntities => applyTokenGroup(withSets([paladin(), priest()]), group(), undefined, { targets: new Map(), summary: [], notes: [] }, new Map(), new Set([7001, 7002, 7003, 7004, 7005]));

  it('makes the NPC with a vendor row per piece costing the token of its slot, and spawns it', () => {
    const store = syncVendors(full());
    const npc = store.npcs.find((n) => n.entry === 920000)!;
    expect(npc).toMatchObject({ name: 'Tier Vendor', subname: 'Tier sets', displayId: 1234, origin: { kind: 'new' } });
    expect(npc.spawns).toEqual([expect.objectContaining({ guid: 930000, map: 0, x: 1, y: 2, z: 3 })]);
    expect(npc.vendor).toHaveLength(10);
    expect(npc.vendor.slice(0, 5)).toEqual(PIECES.map((k, i) => ({ item: 900000 + i, maxCount: 0, restockSecs: 0, extendedCost: 7001 + i })));
    expect(npc.vendor[7]).toEqual({ item: 900102, maxCount: 0, restockSecs: 0, extendedCost: 7003 });
  });
  it('limits each class to its own pieces with vendor conditions (source 23, class mask)', () => {
    const store = syncVendors(full());
    const sets = store.rowsets!.filter((s) => s.table === 'conditions');
    expect(sets).toHaveLength(10);
    const chest = findSet(store.rowsets, 'conditions', { SourceTypeOrReferenceId: '23', SourceGroup: '920000', SourceEntry: '900102', SourceId: '0' })!;
    expect(chest.rows[0]).toMatchObject({ ConditionTypeOrReference: '15', ConditionValue1: String(classMask(5)), ConditionTarget: '0', ElseGroup: '0', NegativeCondition: '0' });
    expect(rowsetStatements(store.rowsets).apply.filter((s) => s.kind === 'insert' && s.table === 'conditions')).toHaveLength(10);
    const open = syncVendors({ ...full(), tierSets: [{ ...paladin(), obtain: { tokenGroup: 'Lost Conqueror', vendor: { ...vendorCfg, classFilter: false } } }] });
    expect(open.rowsets?.some((s) => s.table === 'conditions')).toBeFalsy();
  });
  it('is stable when saved again and keeps stock that is not ours', () => {
    const once = syncVendors(full());
    expect(syncVendors(once)).toEqual(once);
    const extra = { ...once, npcs: once.npcs.map((n) => (n.entry === 920000 ? { ...n, vendor: [{ item: 777, maxCount: 0, restockSecs: 0, extendedCost: 0 }, ...n.vendor] } : n)) };
    const again = syncVendors(extra);
    expect(again.npcs[0]!.vendor[0]).toMatchObject({ item: 777 });
    expect(again.npcs[0]!.vendor).toHaveLength(11);
  });
  it('removes a set\'s rows when it goes, and the NPC with the last set that uses it', () => {
    const once = syncVendors(full());
    const afterPriest = syncVendors({ ...once, tierSets: [paladin()] }, priest());
    expect(afterPriest.npcs[0]!.vendor).toHaveLength(5);
    expect(afterPriest.rowsets!.filter((s) => s.table === 'conditions')).toHaveLength(5);
    const gone = syncVendors({ ...afterPriest, tierSets: [] }, paladin());
    expect(gone.npcs).toHaveLength(0);
    expect(gone.rowsets?.some((s) => s.table === 'conditions')).toBeFalsy();
  });
  it('adds to an NPC that was there without renaming or moving it', () => {
    const was = { ...syncVendors(full()).npcs[0]!, entry: 555, name: 'Old Vendor', vendor: [], spawns: [], origin: { kind: 'new' } as const };
    const store = syncVendors({ ...full(), npcs: [was], tierSets: [{ ...priest(), obtain: { tokenGroup: 'Lost Conqueror', vendor: { ...vendorCfg, entry: 555, created: false, name: 'Ignored' } } }] });
    expect(store.npcs[0]).toMatchObject({ entry: 555, name: 'Old Vendor' });
    expect(store.npcs[0]!.vendor).toHaveLength(5);
  });
});

describe('checks and ids', () => {
  it('needs a saved group that serves the set\'s class', () => {
    const lonely = (g: TokenGroup): ProjectEntities => withSets([paladin()], g);
    expect(obtainIssues(paladin(), lonely(group()))).toEqual([]);
    expect(obtainIssues(paladin(), lonely(group({ classIds: [5] })))[0]!.message).toContain('do not serve');
    expect(obtainIssues(paladin(), EMPTY_ENTITIES)[0]!.message).toContain('not in the project');
    expect(obtainIssues(paladin(), lonely(group({ entries: { head: 0, shoulders: 0, chest: 0, hands: 0, legs: 0 } }))).some((i) => i.message.includes('never saved'))).toBe(true);
    const nameless = { ...paladin(), obtain: { tokenGroup: 'Lost Conqueror', vendor: { ...vendorCfg, name: '', displayId: 0 } } };
    expect(obtainIssues(nameless, lonely(group())).filter((i) => i.severity === 'error')).toHaveLength(2);
    const noSpawn = { ...paladin(), obtain: { tokenGroup: 'Lost Conqueror', vendor: { ...vendorCfg, spawn: null } } };
    expect(obtainIssues(noSpawn, lonely(group())).map((i) => i.severity)).toEqual(['warning']);
  });
  it('lists the token ids with the set ids for the client warning, and claims the new ones for the PR check', () => {
    const store = applyTokenGroup(withSets([paladin()]), group(), undefined, { targets: new Map(), summary: [], notes: [] }, new Map(), new Set([7001, 7002, 7003, 7004, 7005]));
    expect(tierItemEntries(store)).toEqual([900000, 900001, 900002, 900003, 900004, 910000, 910001, 910002, 910003, 910004]);
    expect(tierObtainIds(store)).toEqual([
      ...[910000, 910001, 910002, 910003, 910004].map((id) => ({ table: 'item_template', id: String(id) })),
      ...[7001, 7002, 7003, 7004, 7005].map((id) => ({ table: 'itemextendedcost_dbc', id: String(id) })),
    ]);
    expect(tokenGroupName(group())).toBe('Lost Conqueror');
  });
});
