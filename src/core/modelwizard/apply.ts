import { withRecord } from '../dbc/edits';
import type { ProjectEntities } from '../entities/model';
import type { IdUse } from '../sync/pr-checks';
import { withSet } from '../tables/rowset';
import type { ClientFile } from '../tiersets/model';
import { withClientFile } from '../tiersets/files';
import type { Plan } from './rows';

/** The project with a wizard's plan in it: its client records (new here, so no `was`), its creature, its item with the client row, and its files */
export function applyPlan(store: ProjectEntities, plan: Plan, files: readonly ClientFile[]): ProjectEntities {
  let dbcEdits = store.dbcEdits;
  for (const r of plan.dbc) dbcEdits = withRecord(dbcEdits, r.file, r.id, r.values, null);
  let rowsets = store.rowsets ?? [];
  if (plan.item) rowsets = withSet(rowsets, { table: 'item_dbc', scope: { ID: plan.item.dbcRow.ID! }, original: [], rows: [plan.item.dbcRow] });
  let clientFiles = store.clientFiles;
  for (const f of files) clientFiles = withClientFile(clientFiles, f);
  const { rowsets: _r, dbcEdits: _d, clientFiles: _c, ...rest } = store;
  return {
    ...rest,
    npcs: [...store.npcs.filter((n) => n.entry !== plan.npc.entry), plan.npc],
    items: plan.item ? [...store.items.filter((i) => i.entry !== plan.item!.item.entry), plan.item.item] : store.items,
    ...(rowsets.length > 0 ? { rowsets } : {}),
    ...(dbcEdits && dbcEdits.length > 0 ? { dbcEdits } : {}),
    ...(clientFiles && clientFiles.length > 0 ? { clientFiles } : {}),
  };
}

/** The ids of the client records the project made (not changed), for the PR export's check against main */
export function newDbcIds(edits: ProjectEntities['dbcEdits']): IdUse[] {
  return (edits ?? []).flatMap((e) => e.records.filter((r) => r.was === null).map((r) => ({ table: e.file, id: String(r.id) })));
}
