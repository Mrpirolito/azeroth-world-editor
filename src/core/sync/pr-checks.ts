import type { PatchStatement } from '../export/build-patch';
import type { Difference } from '../roundtrip/compare';

export interface IdUse {
  table: string;
  id: string;
}

export interface IdHit {
  file: string;
  id: string;
}

/** Looks for ids in the tree of origin/main; `mentioning` lists the files that name a table at all */
export interface IdSearch {
  grep(ids: readonly string[]): Promise<IdHit[]>;
  mentioning(table: string): Promise<ReadonlySet<string>>;
}

export interface CheckOutcome {
  errors: string[];
  warnings: string[];
}

/** Ids below this are too common as numbers to mean anything when they turn up in a file that does not name the table */
const DISTINCT_ID = 100000;

/**
 * The ids a patch inserts, for tables keyed by one column (a composite key such as a script line is
 * not an id of its own). `keys` is the registry's key columns per table.
 */
export function insertedIds(statements: readonly PatchStatement[], keys: Readonly<Record<string, readonly string[]>>): IdUse[] {
  const seen = new Set<string>();
  const out: IdUse[] = [];
  for (const s of statements) {
    if (s.kind !== 'insert') continue;
    const cols = keys[s.table];
    if (!cols || cols.length !== 1) continue;
    const id = s.row[cols[0]!];
    if (id === null || id === undefined || !/^\d+$/.test(id)) continue;
    const k = `${s.table}:${id}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ table: s.table, id });
    }
  }
  return out;
}

/**
 * An id found in a file of main that also names the table is a collision (error); one found elsewhere
 * is only noted when it is distinctive enough to mean something (warning).
 */
export async function idCollisions(ids: readonly IdUse[], search: IdSearch): Promise<CheckOutcome> {
  const out: CheckOutcome = { errors: [], warnings: [] };
  const byTable = new Map<string, string[]>();
  for (const { table, id } of ids) byTable.set(table, [...(byTable.get(table) ?? []), id]);
  for (const [table, list] of byTable) {
    const hits = await search.grep(list);
    if (hits.length === 0) continue;
    const named = await search.mentioning(table);
    const seen = new Set<string>();
    for (const { file, id } of hits) {
      const k = `${id}@${file}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (named.has(file)) out.errors.push(`${table} id ${id} is already used in ${file}`);
      else if (Number(id) >= DISTINCT_ID) out.warnings.push(`${table} id ${id} also appears in ${file}`);
    }
  }
  return out;
}

const listOf = (xs: readonly string[], max = 12): string => (xs.length > max ? `${xs.slice(0, max).join(', ')} (+${xs.length - max} more)` : xs.join(', '));

/** The PR description: what the patch writes by table, the new ids, and the row changes the preview found */
export function prBody(args: { title: string; statements: readonly PatchStatement[]; ids: readonly IdUse[]; differences: readonly Difference[]; warnings: readonly string[] }): string {
  const tables = new Map<string, { insert: number; update: number; delete: number }>();
  for (const s of args.statements) {
    const t = tables.get(s.table) ?? { insert: 0, update: 0, delete: 0 };
    if (s.kind === 'insert') t.insert++;
    else if (s.kind === 'delete') t.delete++;
    else t.update++;
    tables.set(s.table, t);
  }
  const lines = [`## ${args.title}`, '', '### Tables', '', '| Table | Inserted | Updated | Deleted |', '|---|---|---|---|'];
  for (const [table, t] of [...tables].sort(([a], [b]) => a.localeCompare(b))) lines.push(`| \`${table}\` | ${t.insert} | ${t.update} | ${t.delete} |`);
  if (args.ids.length > 0) {
    lines.push('', '### Ids');
    const byTable = new Map<string, string[]>();
    for (const { table, id } of args.ids) byTable.set(table, [...(byTable.get(table) ?? []), id]);
    for (const [table, list] of byTable) lines.push(`- \`${table}\`: ${listOf(list)}`);
  }
  if (args.differences.length > 0) {
    const rows = new Map<string, { added: number; changed: Set<string>; removed: number }>();
    for (const d of args.differences) {
      const r = rows.get(d.table) ?? { added: 0, changed: new Set<string>(), removed: 0 };
      if (d.column === null) {
        if (d.kind === 'added') r.added++;
        else if (d.kind === 'removed') r.removed++;
      } else r.changed.add(d.key);
      rows.set(d.table, r);
    }
    lines.push('', '### Row changes against the database', '');
    for (const [table, r] of rows) lines.push(`- \`${table}\`: ${r.added} added, ${r.changed.size} changed, ${r.removed} removed`);
  }
  if (args.warnings.length > 0) lines.push('', '### Notes', ...args.warnings.map((w) => `- ${w}`));
  return lines.join('\n') + '\n';
}
