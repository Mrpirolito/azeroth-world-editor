import type { PatchStatement } from '../export/build-patch';
import type { Issue } from '../validate/validate';
import { specOf } from './specs';
import { setKey, type Row, type RowSet, type TableSpec } from './types';

/** The rows the project holds for tables that have a spec: finding, changing, writing and checking them */

type Sets = readonly RowSet[] | undefined;
type Statements = { apply: PatchStatement[]; revert: PatchStatement[] };

const norm = (row: Readonly<Row>): string => JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k] ?? null]));

/** Whether two lists hold the same rows in any order, values compared as text */
export function sameRowList(a: readonly Row[], b: readonly Row[]): boolean {
  const left = a.map(norm).sort();
  const right = b.map(norm).sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

export function findSet(sets: Sets, table: string, scope: Readonly<Record<string, string>>): RowSet | undefined {
  const key = setKey(table, scope);
  return sets?.find((s) => setKey(s.table, s.scope) === key);
}

/** The sets with `next` in place of the one of its table and scope; a set left as the database has it is dropped */
export function withSet(sets: Sets, next: RowSet): RowSet[] {
  const key = setKey(next.table, next.scope);
  const rest = (sets ?? []).filter((s) => setKey(s.table, s.scope) !== key);
  return sameRowList(next.original, next.rows) ? rest : [...rest, next];
}

/** The sets without those an entity owns: it left the project */
export function withoutOwner(sets: Sets, kind: 'creature' | 'gameobject' | 'item', entry: number): RowSet[] {
  return (sets ?? []).filter((s) => !(s.owner?.kind === kind && s.owner.entry === entry));
}

/** The scope of an owner's rows under a spec: its entry under the spec's first scope column */
export const scopeOf = (spec: TableSpec, id: number): Record<string, string> => ({ [spec.scope[0]!]: String(id) });

/**
 * The columns an owner's template row is to change, as the project holds them: the ones that differ from the row
 * the database had, or every one of a template made in the project.
 */
export function overlayColumns(sets: Sets, table: string, entry: number): Row {
  const spec = specOf(table);
  if (!spec?.overlay) return {};
  const set = findSet(sets, table, scopeOf(spec, entry));
  const held = set?.rows[0];
  if (!set || !held) return {};
  const was = set.original[0];
  return Object.fromEntries(Object.entries(held).filter(([column, value]) => column !== spec.scope[0] && (!was || (was[column] ?? null) !== value)));
}

const keyOf = (spec: TableSpec, row: Row): Record<string, string> => Object.fromEntries(spec.pk.map((c) => [c, String(row[c] ?? '')]));

/**
 * One statement per row, by key: each key of the original and of the held rows is deleted, the held rows
 * written, and the revert deletes the same keys and writes the originals. Sets left as read write nothing.
 * Rows of other writers under the same scope (scene texts of a creature) are never touched: only keys are.
 */
export function rowsetStatements(sets: Sets): Statements {
  const out: Statements = { apply: [], revert: [] };
  for (const set of sets ?? []) {
    const spec = specOf(set.table);
    if (!spec || spec.overlay || sameRowList(set.original, set.rows)) continue;
    const rows = set.rows.map((row) => ({ ...row, ...set.scope }));
    const keys = new Map<string, Record<string, string>>();
    for (const row of [...set.original, ...rows]) {
      const key = keyOf(spec, row);
      keys.set(JSON.stringify(key), key);
    }
    for (const key of keys.values()) {
      out.apply.push({ kind: 'delete', table: set.table, key });
      out.revert.push({ kind: 'delete', table: set.table, key });
    }
    for (const row of rows) out.apply.push({ kind: 'insert', table: set.table, row });
    for (const row of set.original) out.revert.push({ kind: 'insert', table: set.table, row });
  }
  return out;
}

const NUMBER = /^-?\d+(\.\d+)?$/;
const INTEGER = /^-?\d+$/;

export interface RowsetFacts {
  /** Whether an id exists in the database or the project; null skips the check */
  exists?: ((kind: 'item' | 'creature' | 'gameobject' | 'quest' | 'spell', id: number) => boolean) | null;
}

/** What is wrong with the rows the project holds, one message per problem, each about its table and scope */
export function rowsetIssues(sets: Sets, facts: RowsetFacts = {}): Issue[] {
  const issues: Issue[] = [];
  for (const set of sets ?? []) {
    const spec = specOf(set.table);
    if (!spec || sameRowList(set.original, set.rows)) continue;
    const where = `${spec.title} of ${Object.values(set.scope).join('/')}`;
    const add = (severity: Issue['severity'], code: string, message: string): void => {
      issues.push({ severity, code, fieldId: 'entities', message: `${where}: ${message}`, ...(set.owner ? { about: set.owner } : {}) });
    };
    const seen = new Set<string>();
    set.rows.forEach((row, i) => {
      const n = i + 1;
      const key = JSON.stringify(keyOf(spec, { ...row, ...set.scope }));
      if (seen.has(key)) add('error', 'ROWSET_DUPLICATE', `row ${n} repeats another row's key; the database can only hold one of them.`);
      seen.add(key);
      for (const f of spec.fields) {
        const value = row[f.column];
        if (value === undefined || value === null || value === '') continue;
        if (f.type === 'int' || f.type === 'ref' || f.type === 'enum' || f.type === 'flags' || f.type === 'bool' || f.type === 'part') {
          if (!INTEGER.test(value)) add('error', 'ROWSET_TYPE', `row ${n}: ${f.label} must be a whole number, not "${value}".`);
          else if (f.type === 'int' && ((f.min !== undefined && Number(value) < f.min) || (f.max !== undefined && Number(value) > f.max))) {
            add('error', 'ROWSET_RANGE', `row ${n}: ${f.label} must be ${f.min !== undefined && f.max !== undefined ? `from ${f.min} to ${f.max}` : f.min !== undefined ? `at least ${f.min}` : `at most ${f.max}`}.`);
          } else if (f.type === 'ref' && Number(value) > 0 && facts.exists && !facts.exists(f.kind, Number(value))) {
            add('warning', 'ROWSET_UNKNOWN_REF', `row ${n}: ${f.label} ${value} is not in the database or this project.`);
          }
        } else if (f.type === 'float' && !NUMBER.test(value)) add('error', 'ROWSET_TYPE', `row ${n}: ${f.label} must be a number, not "${value}".`);
      }
      if (spec.loot) {
        if (Number(row.Item ?? 0) === 0 && Number(row.Reference ?? 0) === 0) add('error', 'LOOT_EMPTY', `row ${n} has no item and no reference list.`);
        if (Number(row.MinCount ?? 1) > Number(row.MaxCount ?? 1)) add('error', 'LOOT_COUNT', `row ${n}: "least" is more than "most".`);
        if (Number(row.Chance ?? 0) < 0 || Number(row.Chance ?? 0) > 100) add('error', 'LOOT_CHANCE', `row ${n}: chance must be between 0 and 100.`);
      }
    });
    if (spec.loot) {
      const groups = new Map<number, number>();
      for (const row of set.rows) {
        const group = Number(row.GroupId ?? 0);
        if (group > 0) groups.set(group, (groups.get(group) ?? 0) + Number(row.Chance ?? 0));
      }
      for (const [group, total] of groups) if (total > 100.0001) add('warning', 'LOOT_GROUP_SUM', `group ${group} adds up to ${Math.round(total * 100) / 100}%: the chances in a group should total 100 or less.`);
    }
    if (!spec.multi && set.rows.length > 1) add('error', 'ROWSET_ONE', 'it can only have one row.');
  }
  return issues;
}

/** A plain sentence about what the rows hold, for the summary card */
export function setSummary(spec: TableSpec, rows: readonly Row[]): string {
  if (rows.length === 0) return 'Nothing set.';
  if (spec.loot) {
    const items = rows.filter((r) => Number(r.Item ?? 0) > 0).length;
    const groups = new Set(rows.map((r) => Number(r.GroupId ?? 0)).filter((g) => g > 0)).size;
    return `${items} ${items === 1 ? 'item' : 'items'}${groups > 0 ? ` in ${groups} ${groups === 1 ? 'group' : 'groups'}` : ''}${rows.length > items ? `, ${rows.length - items} ${rows.length - items === 1 ? 'reference' : 'references'}` : ''}.`;
  }
  return spec.multi ? `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}.` : 'Set.';
}
