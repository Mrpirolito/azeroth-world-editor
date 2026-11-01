import { findRecord, withRecord, withoutRecord } from '../dbc/edits';
import type { DbcValue } from '../game/dbc-file';
import { newItem, newNpc, type CustomItem, type CustomNpc, type ProjectEntities, type VendorItem } from '../entities/model';
import type { IdUse } from '../sync/pr-checks';
import { findSet, withoutOwner, withSet } from '../tables/rowset';
import type { Row } from '../tables/types';
import { classMask, className, PIECES, PIECE_INFO, type PieceKey, type TierSet } from './model';
import { DIFFICULTIES, DIFFICULTY_LABEL, tokenGroupName, type Difficulty, type TokenGroup, type VendorConfig } from './token-model';

export * from './token-model';

/** Tokens, their drops and the vendor that exchanges them for a set's pieces */

export const COST_FILE = 'ItemExtendedCost.dbc';
export const COST_TABLE = 'itemextendedcost_dbc';
const LOOT_TABLE = 'creature_loot_template';
const CONDITIONS = 'conditions';
/** `conditions.SourceTypeOrReferenceId` of a vendor's item (CONDITION_SOURCE_TYPE_NPC_VENDOR) */
const SOURCE_NPC_VENDOR = '23';
/** `conditions.ConditionTypeOrReference` of the player's class (CONDITION_CLASS: ConditionValue1 is a class mask) */
const CONDITION_CLASS = '15';
/** `item_template.Flags` of Blizzard's tier tokens (Chestguard of the Lost Conqueror, 40610) */
const TOKEN_FLAGS = '4096';
const TOKEN_SELL_PRICE = 50000;
const VENDOR_LEVEL = 80;

const TOKEN_WORD: Record<PieceKey, string> = { head: 'Helm', shoulders: 'Mantle', chest: 'Chestguard', hands: 'Gloves', legs: 'Leggings' };

export const tokenItemName = (g: TokenGroup, key: PieceKey): string => `${TOKEN_WORD[key]} of the ${tokenGroupName(g)}`;

export const findGroup = (groups: readonly TokenGroup[] | undefined, name: string): TokenGroup | undefined => (groups ?? []).find((g) => tokenGroupName(g).toLowerCase() === name.trim().toLowerCase());

/** The `AllowableClass` mask of a token: every class it serves */
export const tokenClassMask = (g: TokenGroup): number => g.classIds.reduce((mask, id) => (mask | classMask(id)) >>> 0, 0);

const usersOf = (g: TokenGroup, sets: readonly TierSet[] | undefined): TierSet[] => (sets ?? []).filter((s) => s.obtain && s.obtain.tokenGroup.trim().toLowerCase() === tokenGroupName(g).toLowerCase());

/** "Can be exchanged for ..." from the pieces of the sets that use the token */
export function tokenDescription(g: TokenGroup, key: PieceKey, sets: readonly TierSet[] | undefined): string {
  const names = usersOf(g, sets).map((s) => s.pieces[key].name);
  const text = names.length > 0 ? `Can be exchanged for ${names.join(', ')}.` : `Can be exchanged for the ${PIECE_INFO[key].label.toLowerCase()} piece of a tier set.`;
  return text.length <= 255 ? text : `${text.slice(0, 252)}...`;
}

/** The `item_template` item of a token (class 15 miscellaneous, bind on pickup, stacking, with the flags of Blizzard's tier tokens) */
export function buildToken(g: TokenGroup, key: PieceKey, sets: readonly TierSet[] | undefined): CustomItem {
  return {
    ...newItem(g.entries[key]),
    name: tokenItemName(g, key), description: tokenDescription(g, key, sets), quality: g.quality, itemClass: 15, subclass: 0, inventoryType: 0, displayId: g.displayId,
    itemLevel: g.itemLevel, requiredLevel: g.requiredLevel, stackable: 1, maxCount: 0, bonding: 'pickup', sellPrice: TOKEN_SELL_PRICE,
    advanced: { AllowableClass: String(tokenClassMask(g)), Flags: TOKEN_FLAGS },
  };
}

/** The `item_dbc` row of a token */
export function buildTokenDbc(g: TokenGroup, key: PieceKey): Row {
  return { ID: String(g.entries[key]), ClassID: '15', SubclassID: '0', Sound_Override_Subclassid: '-1', Material: '0', DisplayInfoID: String(g.displayId), InventoryType: '0', SheatheType: '0' };
}

/** An `ItemExtendedCost.dbc` record that asks for `count` of one item and nothing else */
export const costRecord = (id: number, token: number, count = 1): DbcValue[] => [id, 0, 0, 0, token, 0, 0, 0, 0, count, 0, 0, 0, 0, 0, 0];

/** The `itemextendedcost_dbc` row of the same cost */
export function costRow(id: number, token: number, count = 1): Row {
  return {
    ID: String(id), HonorPoints: '0', ArenaPoints: '0', ArenaBracket: '0', ItemID_1: String(token), ItemID_2: '0', ItemID_3: '0', ItemID_4: '0', ItemID_5: '0',
    ItemCount_1: String(count), ItemCount_2: '0', ItemCount_3: '0', ItemCount_4: '0', ItemCount_5: '0', RequiredArenaRating: '0', ItemPurchaseGroup: '0',
  };
}

/** The id of a record in `candidates` that costs exactly `count` of `token`, if there is one: it is reused instead of making a twin */
export function findCost(token: number, candidates: Iterable<{ id: number; values: readonly DbcValue[] }>, count = 1): number | undefined {
  const same = costRecord(0, token, count);
  for (const c of candidates) if (c.values.every((v, i) => i === 0 || v === same[i])) return c.id;
  return undefined;
}

// ---- Drops

/** What the bosses' rows say, from `creature_template` */
export interface BossInfo {
  entry: number;
  name: string;
  /** `lootid` (0 when it has none) */
  lootId: number;
  /** `difficulty_entry_1..3` (0 when absent) */
  diff: readonly [number, number, number];
}
export type BossLookup = (entry: number) => BossInfo | undefined;

/** The creature a difficulty is played against: the boss itself for 10 normal, else its difficulty entry, else the boss */
export function difficultyEntry(info: BossInfo, d: Difficulty): number {
  const at = DIFFICULTIES.indexOf(d);
  return at === 0 ? info.entry : info.diff[at - 1] || info.entry;
}

export interface BossLine { difficulty: Difficulty; creature: number; lootId: number; tokens: string[]; chance: number; groupId: number }
export interface BossSummary { entry: number; name: string; lines: BossLine[] }
export interface DropPlan {
  /** Our `creature_loot_template` rows, by loot id */
  targets: Map<number, Row[]>;
  /** Per boss, what drops where */
  summary: BossSummary[];
  notes: string[];
}

/** Where a group's tokens drop: the rows for each loot table, one table per creature that plays a chosen difficulty */
export function dropPlan(group: TokenGroup, lookup: BossLookup): DropPlan {
  const targets = new Map<number, Map<number, Row>>();
  const summary: BossSummary[] = [];
  const notes: string[] = [];
  for (const drop of group.drops) {
    const boss = lookup(drop.boss);
    if (!boss) { notes.push(`Boss ${drop.boss} is not in the database, so its drop is not written.`); continue; }
    const line: BossSummary = { entry: boss.entry, name: boss.name || drop.bossName || `Creature ${boss.entry}`, lines: [] };
    for (const difficulty of drop.difficulties) {
      const creature = difficultyEntry(boss, difficulty);
      const info = lookup(creature);
      const lootId = info?.lootId ?? 0;
      if (!info) { notes.push(`${line.name} (${DIFFICULTY_LABEL[difficulty]}): creature ${creature} is not in the database.`); continue; }
      if (lootId === 0) notes.push(`${line.name} (${DIFFICULTY_LABEL[difficulty]}): creature ${creature} has no loot id, so the drop never happens until it has one.`);
      const id = lootId || creature;
      const rows = targets.get(id) ?? new Map<number, Row>();
      for (const key of drop.tokens) {
        rows.set(group.entries[key], {
          Entry: String(id), Item: String(group.entries[key]), Reference: '0', Chance: String(drop.chance), QuestRequired: '0', LootMode: '1',
          GroupId: String(drop.groupId), MinCount: String(drop.min), MaxCount: String(drop.max), Comment: tokenGroupName(group),
        });
      }
      targets.set(id, rows);
      line.lines.push({ difficulty, creature, lootId: id, tokens: drop.tokens.map((k) => tokenItemName(group, k)), chance: drop.chance, groupId: drop.groupId });
    }
    summary.push(line);
  }
  return { targets: new Map([...targets].map(([id, rows]) => [id, [...rows.values()]])), summary, notes };
}

// ---- Token groups in the project

const entriesOf = (g: TokenGroup | undefined): number[] => (g ? PIECES.map((k) => g.entries[k]).filter((e) => e > 0) : []);
const costsOf = (g: TokenGroup | undefined): number[] => (g ? PIECES.map((k) => g.costs[k]).filter((e) => e > 0) : []);

/** The store without the rows of tokens: their items, client rows, costs and the loot rows that drop them */
function stripTokens(store: ProjectEntities, entries: ReadonlySet<number>, costs: ReadonlySet<number>): ProjectEntities {
  let dbcEdits = store.dbcEdits;
  for (const id of costs) dbcEdits = withoutRecord(dbcEdits, COST_FILE, id);
  let rowsets = (store.rowsets ?? []).filter((s) => !(s.table === 'item_dbc' && entries.has(Number(s.scope.ID))) && !(s.table === COST_TABLE && costs.has(Number(s.scope.ID))));
  for (const s of rowsets.filter((x) => x.table === LOOT_TABLE)) {
    const rows = s.rows.filter((r) => !entries.has(Number(r.Item)));
    if (rows.length !== s.rows.length) rowsets = withSet(rowsets, { ...s, rows });
  }
  const { rowsets: _r, dbcEdits: _d, ...rest } = store;
  return { ...rest, items: store.items.filter((i) => !entries.has(i.entry)), ...(rowsets.length > 0 ? { rowsets } : {}), ...(dbcEdits && dbcEdits.length > 0 ? { dbcEdits } : {}) };
}

const withGroups = (store: ProjectEntities, tokenGroups: TokenGroup[]): ProjectEntities => {
  const { tokenGroups: _t, ...rest } = store;
  return { ...rest, ...(tokenGroups.length > 0 ? { tokenGroups } : {}) };
};

/**
 * The project with a saved token group in it: five token items with their client rows, an ItemExtendedCost record for each
 * (in the client file and the server's table), and the loot rows of its drops laid over the bosses' loot tables. `group`
 * carries every id; `fresh` lists the cost ids made now (an id kept from an earlier save is ours again if the project
 * holds its record); `lootBase` has the loot rows the database has for each loot id of the plan, for a table the project
 * does not hold yet. Saving again replaces what the earlier save made.
 */
export function applyTokenGroup(store: ProjectEntities, group: TokenGroup, prev: TokenGroup | undefined, plan: DropPlan, lootBase: ReadonlyMap<number, readonly Row[]>, fresh: ReadonlySet<number> = new Set()): ProjectEntities {
  const costs = new Set([...costsOf(group), ...costsOf(prev)]);
  const mine = (id: number): boolean => fresh.has(id) || findRecord(store.dbcEdits, COST_FILE, id)?.was === null;
  const ownedCosts = new Set([...costs].filter(mine));
  const base = stripTokens(store, new Set([...entriesOf(group), ...entriesOf(prev)]), ownedCosts);

  const items = [...base.items, ...PIECES.map((k) => buildToken(group, k, store.tierSets))];
  let rowsets = base.rowsets ?? [];
  let dbcEdits = base.dbcEdits;
  for (const k of PIECES) {
    const row = buildTokenDbc(group, k);
    rowsets = withSet(rowsets, { table: 'item_dbc', scope: { ID: row.ID! }, original: [], rows: [row] });
    const id = group.costs[k];
    if (id > 0 && mine(id)) {
      dbcEdits = withRecord(dbcEdits, COST_FILE, id, costRecord(id, group.entries[k]), null);
      rowsets = withSet(rowsets, { table: COST_TABLE, scope: { ID: String(id) }, original: [], rows: [costRow(id, group.entries[k])] });
    }
  }
  for (const [lootId, ours] of plan.targets) {
    const held = findSet(rowsets, LOOT_TABLE, { Entry: String(lootId) });
    const original = held?.original ?? [...(lootBase.get(lootId) ?? [])];
    rowsets = withSet(rowsets, { table: LOOT_TABLE, scope: { Entry: String(lootId) }, original, rows: [...(held?.rows ?? original), ...ours] });
  }

  const tokenGroups = [...(store.tokenGroups ?? []).filter((g) => tokenGroupName(g).toLowerCase() !== tokenGroupName(group).toLowerCase() && (!prev || tokenGroupName(g).toLowerCase() !== tokenGroupName(prev).toLowerCase())), group];
  const { rowsets: _r, dbcEdits: _d, ...rest } = base;
  return withGroups({ ...rest, items, ...(rowsets.length > 0 ? { rowsets } : {}), ...(dbcEdits && dbcEdits.length > 0 ? { dbcEdits } : {}) }, tokenGroups);
}

/** The project without a token group and everything its save made (the sets that named it keep the name and are told by their issues) */
export function removeTokenGroup(store: ProjectEntities, group: TokenGroup): ProjectEntities {
  const costs = new Set(costsOf(group).filter((id) => findRecord(store.dbcEdits, COST_FILE, id)?.was === null));
  const stripped = stripTokens(store, new Set(entriesOf(group)), costs);
  return withGroups(stripped, (store.tokenGroups ?? []).filter((g) => tokenGroupName(g).toLowerCase() !== tokenGroupName(group).toLowerCase()));
}

/** The token items again, so their text names the sets that use them now */
export function refreshTokens(store: ProjectEntities): ProjectEntities {
  const groups = store.tokenGroups ?? [];
  if (groups.length === 0) return store;
  const entries = new Set(groups.flatMap((g) => entriesOf(g)));
  const items = [...store.items.filter((i) => !entries.has(i.entry)), ...groups.flatMap((g) => (entriesOf(g).length === PIECES.length ? PIECES.map((k) => buildToken(g, k, store.tierSets)) : []))];
  return { ...store, items };
}

// ---- Vendors

function vendorNpc(cfg: VendorConfig, npc?: CustomNpc): CustomNpc {
  const base = npc ?? newNpc(cfg.entry);
  return {
    ...base, name: cfg.name, subname: cfg.subname, displayId: cfg.displayId, minLevel: VENDOR_LEVEL, maxLevel: VENDOR_LEVEL, faction: 35,
    spawns: cfg.spawn ? [{ guid: cfg.spawn.guid, map: cfg.spawn.map, x: cfg.spawn.x, y: cfg.spawn.y, z: cfg.spawn.z, o: cfg.spawn.o, respawnSecs: 300, wander: 0, patrol: null, rotation: null, events: 'npc' }] : [],
  };
}

const pieceEntries = (set: TierSet): number[] => PIECES.map((k) => set.pieces[k].entry).filter((e) => e > 0);

/**
 * The vendors of the project's tier sets: each sells every piece of the sets that name it, for one token of the piece's slot
 * (an ItemExtendedCost), and, when asked, shows each class only the pieces of its own set. A vendor made for a set is a new NPC
 * of the project with its name, look and spawn; one that was there keeps all it has and only gets the pieces. `removed` is a
 * set that left: its rows go, and the NPC it made goes if nothing else uses it.
 */
export function syncVendors(store: ProjectEntities, removed?: TierSet): ProjectEntities {
  const sets = store.tierSets ?? [];
  const managed = new Set([...sets, ...(removed ? [removed] : [])].flatMap(pieceEntries));
  const vendors = new Set([...sets, ...(removed ? [removed] : [])].flatMap((s) => (s.obtain?.vendor && s.obtain.vendor.entry > 0 ? [s.obtain.vendor.entry] : [])));
  let npcs = store.npcs;
  let rowsets = store.rowsets ?? [];
  rowsets = rowsets.filter((s) => !(s.table === CONDITIONS && s.scope.SourceTypeOrReferenceId === SOURCE_NPC_VENDOR && vendors.has(Number(s.scope.SourceGroup)) && managed.has(Number(s.scope.SourceEntry))));

  for (const entry of vendors) {
    const users = sets.filter((s) => s.obtain?.vendor?.entry === entry);
    const creator = users.find((s) => s.obtain!.vendor!.created);
    const had = npcs.find((n) => n.entry === entry);
    if (users.length === 0 && removed?.obtain?.vendor?.created && had?.origin.kind === 'new') {
      npcs = npcs.filter((n) => n.entry !== entry);
      rowsets = withoutOwner(rowsets, 'creature', entry);
      continue;
    }
    let npc = had ?? (creator ? vendorNpc(creator.obtain!.vendor!) : undefined);
    if (!npc) continue;
    if (creator && npc.origin.kind === 'new') npc = vendorNpc(creator.obtain!.vendor!, npc);
    const stock: VendorItem[] = npc.vendor.filter((v) => !managed.has(v.item));
    for (const set of users) {
      const group = findGroup(store.tokenGroups, set.obtain!.tokenGroup);
      if (!group) continue;
      for (const k of PIECES) {
        const item = set.pieces[k].entry;
        if (item <= 0 || group.costs[k] <= 0) continue;
        stock.push({ item, maxCount: 0, restockSecs: 0, extendedCost: group.costs[k] });
        if (set.obtain!.vendor!.classFilter) {
          const scope = { SourceTypeOrReferenceId: SOURCE_NPC_VENDOR, SourceGroup: String(entry), SourceEntry: String(item), SourceId: '0' };
          const row: Row = { ...scope, ElseGroup: '0', ConditionTypeOrReference: CONDITION_CLASS, ConditionTarget: '0', ConditionValue1: String(classMask(set.classId)), ConditionValue2: '0', ConditionValue3: '0', NegativeCondition: '0', ErrorType: '0', ErrorTextId: '0', ScriptName: '', Comment: `${set.name}: only ${className(set.classId)}` };
          rowsets = withSet(rowsets, { table: CONDITIONS, scope, original: [], rows: [row] });
        }
      }
    }
    const next = { ...npc, vendor: stock };
    npcs = had ? npcs.map((n) => (n.entry === entry ? next : n)) : [...npcs, next];
  }
  const { rowsets: _r, ...rest } = store;
  return { ...rest, npcs, ...(rowsets.length > 0 ? { rowsets } : {}) };
}

// ---- Checks and ids

export interface ObtainIssue { severity: 'error' | 'warning'; message: string }

/** What is wrong with how a set is obtained */
export function obtainIssues(set: TierSet, store: ProjectEntities): ObtainIssue[] {
  const o = set.obtain;
  if (!o) return [];
  const out: ObtainIssue[] = [];
  const add = (severity: ObtainIssue['severity'], message: string): void => { out.push({ severity, message }); };
  const group = findGroup(store.tokenGroups, o.tokenGroup);
  if (o.tokenGroup.trim() === '') add('error', 'Obtain: pick the token group.');
  else if (!group) add('error', `Obtain: the token group "${o.tokenGroup}" is not in the project; save it first.`);
  else {
    if (!group.classIds.includes(set.classId)) add('error', `Obtain: the "${tokenGroupName(group)}" tokens do not serve ${className(set.classId)}; add the class to the group.`);
    if (PIECES.some((k) => group.entries[k] === 0 || group.costs[k] === 0)) add('error', `Obtain: the token group "${tokenGroupName(group)}" was never saved.`);
  }
  const v = o.vendor;
  if (v) {
    if (!v.created && v.entry <= 0) add('error', 'Vendor: pick the NPC that sells the set.');
    if (v.created && v.name.trim() === '') add('error', 'Vendor: the new NPC needs a name.');
    if (v.created && v.displayId <= 0) add('error', 'Vendor: pick a model for the new NPC.');
    if (v.created && v.spawn === null) add('warning', 'Vendor: the NPC has no spawn, so no one can buy the set until it is placed.');
    if (!v.created && v.spawn) add('warning', 'Vendor: an NPC that was already there is not moved by the set.');
    for (const other of store.tierSets ?? []) {
      if (other.name.toLowerCase() !== set.name.toLowerCase() && v.entry > 0 && other.obtain?.vendor?.entry === v.entry && other.obtain.vendor.created && v.created) {
        add('error', `Vendor: ${other.name} already made NPC ${v.entry}; pick it as an existing NPC.`);
      }
    }
  }
  return out;
}

/** What is wrong with a token group */
export function tokenGroupIssues(g: TokenGroup): ObtainIssue[] {
  const out: ObtainIssue[] = [];
  const add = (severity: ObtainIssue['severity'], message: string): void => { out.push({ severity, message }); };
  if (tokenGroupName(g) === '') add('error', 'The group needs a name.');
  if (g.displayId <= 0) add('error', 'Pick the tokens\' look.');
  const seen = new Map<string, number>();
  g.drops.forEach((d, i) => {
    const label = `Drop ${i + 1} (${d.bossName || `boss ${d.boss}`})`;
    if (d.min > d.max) add('error', `${label}: "least" is more than "most".`);
    for (const diff of d.difficulties) for (const t of d.tokens) {
      const key = `${d.boss}/${diff}/${t}`;
      if (seen.has(key)) add('error', `${label}: the ${PIECE_INFO[t].label.toLowerCase()} token already drops from this boss in ${DIFFICULTY_LABEL[diff]} (drop ${seen.get(key)! + 1}).`);
      seen.set(key, i);
    }
    if (d.groupId > 0 && d.chance * d.tokens.length > 100.0001) add('warning', `${label}: ${d.tokens.length} tokens at ${d.chance}% in one group add up to more than 100%.`);
  });
  return out;
}

/** Every item entry the set and token items of the project use: the ones the server's C++ must register for the client */
export function tierItemEntries(store: Pick<ProjectEntities, 'tierSets' | 'tokenGroups'>): number[] {
  return [...(store.tierSets ?? []).flatMap(pieceEntries), ...(store.tokenGroups ?? []).flatMap(entriesOf)];
}

/** The ids the tokens claim, for the PR export's check against main: the token items and the costs made here */
export function tierObtainIds(store: Pick<ProjectEntities, 'tokenGroups' | 'dbcEdits'>): IdUse[] {
  const out: IdUse[] = [];
  for (const g of store.tokenGroups ?? []) {
    for (const e of entriesOf(g)) out.push({ table: 'item_template', id: String(e) });
    for (const c of costsOf(g)) if (findRecord(store.dbcEdits, COST_FILE, c)?.was === null) out.push({ table: COST_TABLE, id: String(c) });
  }
  return out;
}

