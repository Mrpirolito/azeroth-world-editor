import { withRecord, withoutRecord } from '../dbc/edits';
import type { DbcValue } from '../game/dbc-file';
import type { ProjectEntities } from '../entities/model';
import { withSet } from '../tables/rowset';
import type { RowSet } from '../tables/types';
import { SPELL_FILE_NAME } from '../spells/model';
import { bonusPending, buildBonusSpell, NO_SPELLS, type BonusEnv } from './bonus';
import { PIECES, REGIONS, type ClientFile, type TierSet } from './model';
import { buildItem, buildItemDbc, buildItemSet, cloneDisplay } from './rows';
import { cleanName, modelPaths, texturePath } from './textures';

export const DISPLAY_FILE = 'ItemDisplayInfo.dbc';
export const ITEMSET_FILE = 'ItemSet.dbc';

/** The archive paths a set's looks use: every texture and model file the saved set should carry */
export function expectedPaths(set: TierSet): Set<string> {
  const out = new Set<string>();
  for (const key of PIECES) {
    const look = set.pieces[key].look;
    if (look.kind !== 'new') continue;
    for (const region of REGIONS) for (const suffix of look.textures[String(region.index)] ?? []) out.add(texturePath(set.name, key, region.index, suffix));
    if (look.model && (key === 'head' || key === 'shoulders')) {
      const slots = key === 'head' ? (['head'] as const) : (['left', 'right'] as const);
      for (const slot of slots) for (const file of ['m2', 'skin', 'blp'] as const) for (const p of modelPaths(set.name, key, slot, file)) out.add(p);
    }
  }
  return out;
}

/** Whether a client file belongs to a set (its names start with CoA_<Set>_) */
export const ownedBy = (file: ClientFile, set: string): boolean => file.paths.some((p) => p.includes(`CoA_${cleanName(set)}_`));

const PROC_TABLE = 'spell_proc';

/**
 * The set with every bonus settled: a bonus that cannot become a spell has no spell id, one that can keeps the id it has
 * and takes the next of `alloc` when it has none (so saving again never moves a spell).
 */
export function settleBonuses(set: TierSet, env: BonusEnv, alloc: (count: number) => number[]): TierSet {
  const next = structuredClone(set);
  const open: number[] = [];
  next.bonuses.forEach((b, i) => {
    if (bonusPending(b, env) !== null) b.spellId = 0;
    else if (b.spellId === 0) open.push(i);
  });
  alloc(open.length).forEach((id, n) => { next.bonuses[open[n]!]!.spellId = id; });
  return next;
}

/** The spell records and proc rows of a set's bonuses laid into the edits and row sheets; the spells `prev` made that `set` no longer has are taken out */
function withBonusSpells(dbcEdits: ProjectEntities['dbcEdits'], rowsets: readonly RowSet[], set: TierSet, prev: TierSet | undefined, env: BonusEnv): { dbcEdits: ProjectEntities['dbcEdits']; rowsets: RowSet[] } {
  const ids = [...set.bonuses.map((b) => b.spellId), ...(prev?.bonuses ?? []).map((b) => b.spellId)].filter((id) => id > 0);
  let edits = dbcEdits;
  let sheets = rowsets.filter((s) => !(s.table === PROC_TABLE && ids.includes(Number(s.scope.SpellId))));
  for (const id of ids) edits = withoutRecord(edits, SPELL_FILE_NAME, id);
  for (const b of set.bonuses) {
    if (b.spellId <= 0) continue;
    const built = buildBonusSpell(set.name, b, b.spellId, env);
    if ('pending' in built) continue;
    edits = withRecord(edits, SPELL_FILE_NAME, b.spellId, built.record, null);
    if (built.proc) sheets = withSet(sheets, { table: PROC_TABLE, scope: { SpellId: String(b.spellId) }, original: [], rows: [built.proc] });
  }
  return { dbcEdits: edits, rowsets: sheets };
}

/**
 * The project with a saved tier set in it: its definition, its five items and their client rows, its ItemSet record, a
 * display record for every new look, and no file of its own that no look uses any more. `set` carries every id already;
 * `bases` has the records the new looks are copied from. Saving again replaces what the earlier save made.
 */
export function applyTierSet(store: ProjectEntities, set: TierSet, prev: TierSet | undefined, bases: ReadonlyMap<number, readonly DbcValue[]>, env: BonusEnv = NO_SPELLS): ProjectEntities {
  const entries = new Set([...PIECES.map((k) => set.pieces[k].entry), ...(prev ? PIECES.map((k) => prev.pieces[k].entry) : [])]);
  const items = [...store.items.filter((i) => !entries.has(i.entry)), ...PIECES.map((k) => buildItem(set, k, set.itemSetId))];

  let rowsets = (store.rowsets ?? []).filter((s) => !(s.table === 'item_dbc' && entries.has(Number(s.scope.ID))));
  for (const key of PIECES) {
    const row = buildItemDbc(set, key);
    rowsets = withSet(rowsets, { table: 'item_dbc', scope: { ID: row.ID! }, original: [], rows: [row] });
  }

  let dbcEdits = store.dbcEdits;
  const used = new Set<number>();
  for (const key of PIECES) {
    const look = set.pieces[key].look;
    if (look.kind !== 'new') continue;
    used.add(look.displayId);
    const base = bases.get(look.baseDisplayId);
    if (!base) throw new Error(`The base look ${look.baseDisplayId} of the ${key} is not in ItemDisplayInfo.dbc.`);
    dbcEdits = withRecord(dbcEdits, DISPLAY_FILE, look.displayId, cloneDisplay(base, look.displayId, set.name, key, look), null);
  }
  if (prev) {
    for (const key of PIECES) {
      const old = prev.pieces[key].look;
      if (old.kind === 'new' && old.displayId > 0 && !used.has(old.displayId)) dbcEdits = withoutRecord(dbcEdits, DISPLAY_FILE, old.displayId);
    }
    if (prev.itemSetId !== set.itemSetId) dbcEdits = withoutRecord(dbcEdits, ITEMSET_FILE, prev.itemSetId);
  }
  dbcEdits = withRecord(dbcEdits, ITEMSET_FILE, set.itemSetId, buildItemSet(set, set.itemSetId), null);
  ({ dbcEdits, rowsets } = withBonusSpells(dbcEdits, rowsets, set, prev, env));

  const wanted = expectedPaths(set);
  const clientFiles = (store.clientFiles ?? []).filter((f) => !ownedBy(f, set.name) || f.paths.some((p) => wanted.has(p)));
  const tierSets = [...(store.tierSets ?? []).filter((t) => t.name.toLowerCase() !== set.name.toLowerCase()), set];

  const { rowsets: _r, dbcEdits: _d, clientFiles: _c, tierSets: _t, ...rest } = store;
  return { ...rest, items, ...(rowsets.length > 0 ? { rowsets } : {}), ...(dbcEdits && dbcEdits.length > 0 ? { dbcEdits } : {}), tierSets, ...(clientFiles.length > 0 ? { clientFiles } : {}) };
}

/** The project without a tier set and everything its save made */
export function removeTierSet(store: ProjectEntities, set: TierSet): ProjectEntities {
  const entries = new Set(PIECES.map((k) => set.pieces[k].entry));
  let dbcEdits = store.dbcEdits;
  for (const key of PIECES) {
    const look = set.pieces[key].look;
    if (look.kind === 'new' && look.displayId > 0) dbcEdits = withoutRecord(dbcEdits, DISPLAY_FILE, look.displayId);
  }
  if (set.itemSetId > 0) dbcEdits = withoutRecord(dbcEdits, ITEMSET_FILE, set.itemSetId);
  const kept = (store.rowsets ?? []).filter((s) => !(s.table === 'item_dbc' && entries.has(Number(s.scope.ID))));
  const { dbcEdits: edits, rowsets } = withBonusSpells(dbcEdits, kept, { ...set, bonuses: [] }, set, NO_SPELLS);
  dbcEdits = edits;
  const clientFiles = (store.clientFiles ?? []).filter((f) => !ownedBy(f, set.name));
  const tierSets = (store.tierSets ?? []).filter((t) => t.name.toLowerCase() !== set.name.toLowerCase());
  const { rowsets: _r, dbcEdits: _d, clientFiles: _c, tierSets: _t, ...rest } = store;
  return {
    ...rest, items: store.items.filter((i) => !entries.has(i.entry)),
    ...(rowsets.length > 0 ? { rowsets } : {}), ...(dbcEdits && dbcEdits.length > 0 ? { dbcEdits } : {}),
    ...(tierSets.length > 0 ? { tierSets } : {}), ...(clientFiles.length > 0 ? { clientFiles } : {}),
  };
}
