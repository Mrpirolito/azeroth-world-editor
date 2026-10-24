import { NotReadOnlyError, SqlQueryError } from '../../core/db/read-only-sql';
import { rowsOrNone } from '../../core/db/rows-or-none';
import { renderStatement } from '../../core/export/render-patch';
import { defaultColumnValues } from '../../core/import/importer';
import { findSet, rowsetIssues, rowsetStatements, sameRowList, withSet } from '../../core/tables/rowset';
import { SPECS, specOf } from '../../core/tables/specs';
import type { Row, RowSet, TableSpec } from '../../core/tables/types';
import type { TableSpecInfo, TablesApi } from '../../shared/ipc';
import type { Services } from './services';
import { fail, run } from './errors';

const SEARCH_LIMIT = 30;
/** Rows read per step while looking for gaps, and the steps taken before giving up (20,000 rows) */
const STEP = 500;
const STEPS = 40;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A spec as a client without the window reads it */
function specInfo(spec: TableSpec): TableSpecInfo {
  return {
    table: spec.table, title: spec.title, blurb: spec.blurb, owner: spec.owner, scope: [...spec.scope], pk: [...spec.pk], multi: spec.multi,
    fields: spec.fields.map((f) => ({
      column: f.column, label: f.label, type: f.type, ...(f.help ? { help: f.help } : {}), ...(f.group ? { group: f.group } : {}),
      ...(f.type === 'enum' ? { options: f.options.map(([value, label]) => ({ value, label })) } : {}),
      ...(f.type === 'flags' ? { options: f.bits.map((b) => ({ value: b.value, label: b.label })) } : {}),
      ...(f.type === 'ref' ? { refKind: f.kind } : {}),
    })),
  };
}

/** The rows of the tables the sheets edit, a table's free ids and the read-only SQL console */
export function createTablesApi(s: Services): TablesApi {
  const { connected, projectEntities, putEntities, asOneStep, exportSchema } = s.ctx;

  const specFor = (table: string): TableSpec => {
    const spec = specOf(table);
    if (!spec) throw fail('BAD_REQUEST', `${table} has no editor. Tables with one: ${SPECS.map((x) => x.table).join(', ')}.`);
    return spec;
  };
  /** The scope must name every column the table is looked up by, and nothing else */
  const wholeScope = (spec: TableSpec, scope: Record<string, string>): void => {
    if (spec.scope.some((c) => scope[c] === undefined || scope[c] === '') || Object.keys(scope).some((c) => !spec.scope.includes(c))) {
      throw fail('BAD_REQUEST', `${spec.table} rows are found by ${spec.scope.join(' and ')}; give a value for each.`);
    }
  };
  /** The rows the database has under a scope that this sheet owns */
  const databaseRows = async (live: ReturnType<typeof connected>, spec: TableSpec, scope: Record<string, string>): Promise<Row[]> => {
    const rows = (await rowsOrNone(live.db, spec.table, scope)).map((r): Row => ({ ...r }));
    return spec.own ? rows.filter(spec.own) : rows;
  };
  const ownerOf = (spec: TableSpec, scope: Record<string, string>): RowSet['owner'] =>
    spec.owner === 'standalone' ? undefined : { kind: spec.owner, entry: Number(scope[spec.scope[0]!]) };
  const inStore = (owner: NonNullable<RowSet['owner']>): boolean => {
    const store = projectEntities();
    const list = owner.kind === 'creature' ? store.npcs : owner.kind === 'gameobject' ? store.objects : store.items;
    return list.some((e) => e.entry === owner.entry);
  };

  return {
    tableRows: (table, scope) =>
      run(async () => {
        const spec = specOf(table);
        if (!spec) throw fail('BAD_REQUEST', `${table} has no editor.`);
        if (Object.keys(scope).some((c) => !spec.scope.includes(c))) throw fail('BAD_REQUEST', 'That is not how this table is looked up.');
        const { db } = connected();
        const columns = (await db.columns(table)).map((c) => c.name);
        if (columns.length === 0) return { exists: false, columns, rows: [] };
        return { exists: true, columns, rows: (await rowsOrNone(db, table, scope)).map((r) => ({ ...r })) };
      }),

    tableSpecs: (table) =>
      run(async () => ({ specs: table ? [specInfo(specFor(table))] : SPECS.map(specInfo) })),

    tableHeld: (table, scope) =>
      run(async () => {
        const spec = specFor(table);
        if (Object.keys(scope).some((c) => !spec.scope.includes(c))) throw fail('BAD_REQUEST', 'That is not how this table is looked up.');
        const live = connected();
        const columns = (await live.db.columns(table)).map((c) => c.name);
        const held = findSet(projectEntities().rowsets, table, scope);
        return {
          exists: columns.length > 0, columns, database: columns.length > 0 ? await databaseRows(live, spec, scope) : [],
          project: held ? held.rows : null, issues: held ? rowsetIssues([held]).map((i) => i.message) : [],
        };
      }),

    tableSet: (table, scope, rows) =>
      run(async () => {
        const spec = specFor(table);
        wholeScope(spec, scope);
        const live = connected();
        if ((await live.db.columns(table)).length === 0) throw fail('BAD_REQUEST', `The world database has no ${table} table, so rows for it could not be exported.`);
        const owner = ownerOf(spec, scope);
        if (spec.overlay && owner && !inStore(owner)) {
          throw fail('BAD_REQUEST', `${spec.title} changes columns of the template row of the ${spec.owner === 'creature' ? 'NPC' : 'object'} itself, so take it into the project first (read_existing_entity then upsert_entity).`);
        }
        const original = await databaseRows(live, spec, scope);
        const held = findSet(projectEntities().rowsets, table, scope);
        const next: Row[] = rows.map((r) => ({ ...spec.blank, ...scope, ...r }));
        const set: RowSet = { table, scope: { ...scope }, original: held?.original ?? original, rows: next, ...(owner ? { owner } : {}) };
        const found = rowsetIssues([set]);
        const errors = found.filter((i) => i.severity === 'error');
        if (errors.length > 0) throw fail('BAD_REQUEST', `The rows have problems: ${errors.map((e) => e.message.replace(/^[^:]*: /, '')).join(' ')}`);
        const store = projectEntities();
        const sets = withSet(store.rowsets, set);
        const { rowsets: _old, ...rest } = store;
        await asOneStep(async () => putEntities(sets.length > 0 ? { ...rest, rowsets: sets } : rest), `${spec.title} ${Object.values(scope).join('/')}`);
        return { changed: !sameRowList(set.original, set.rows), issues: found.map((i) => i.message.replace(/^[^:]*: /, '')) };
      }),

    tableSql: (table, scope, rows) =>
      run(async () => {
        const spec = specFor(table);
        wholeScope(spec, scope);
        const live = connected();
        const columns = await live.db.columns(table);
        if (columns.length === 0) throw fail('BAD_REQUEST', `The world database has no ${table} table.`);
        if (spec.overlay) return { sql: '', revert: '', note: 'These columns are written inside the template row of the NPC or object itself; see Export project.' };
        const held = findSet(projectEntities().rowsets, table, scope);
        const next = rows ? rows.map((r): Row => ({ ...spec.blank, ...scope, ...r })) : held?.rows;
        if (!next) return { sql: '', revert: '', note: 'The project holds no rows for this, so nothing would be written.' };
        const set: RowSet = { table, scope: { ...scope }, original: held?.original ?? (await databaseRows(live, spec, scope)), rows: next };
        const base = exportSchema(live);
        const schema = { ...base, tables: { ...base.tables, [table]: columns } };
        const statements = rowsetStatements([set]);
        // A row the sheet writes new takes the table's defaults for the columns it does not set, as the project patch does
        const filled = statements.apply.map((st) => (st.kind === 'insert' ? { ...st, row: { ...defaultColumnValues(table, schema), ...st.row } } : st));
        const render = (list: typeof filled): string => list.map((st) => renderStatement(st, schema)).join('\n');
        return { sql: render(filled), revert: render(statements.revert), note: statements.apply.length === 0 ? 'The rows are the same as the database has, so nothing would be written.' : null };
      }),

    searchTable: (table, text) =>
      run(async () => {
        const spec = specOf(table);
        if (!spec) throw fail('BAD_REQUEST', `${table} has no editor.`);
        const { db } = connected();
        const needle = text.trim();
        if (needle === '') return { rows: [] };
        const id = spec.scope[0]!;
        if (/^\d+$/.test(needle)) return { rows: (await rowsOrNone(db, table, { [id]: [needle] })).map((r) => ({ ...r })) };
        if (!db.searchText || !spec.search) return { rows: [] };
        return { rows: (await db.searchText(table, spec.search, needle, SEARCH_LIMIT)).map((r) => ({ ...r })) };
      }),

    freeIds: (table, column, from, count) =>
      run(async () => {
        const { db } = connected();
        if (!db.selectRaw) throw fail('BAD_REQUEST', 'This connection cannot search for free ids.');
        if (!IDENTIFIER.test(table) || !IDENTIFIER.test(column)) throw fail('BAD_REQUEST', 'That is not a table and column name.');
        const known = await db.columns(table);
        if (!known.some((c) => c.name === column)) throw fail('BAD_REQUEST', `${table} has no column ${column}.`);
        const ids: number[] = [];
        let next = Math.max(0, Math.trunc(from));
        for (let step = 0; step < STEPS && ids.length < count; step++) {
          const found = await db.selectRaw(`SELECT DISTINCT \`${column}\` AS v FROM \`${table}\` WHERE \`${column}\` >= ${next} ORDER BY \`${column}\` LIMIT ${STEP}`);
          const used = found.rows.map((r) => Number(r.v));
          for (const v of used) {
            while (next < v && ids.length < count) ids.push(next++);
            if (ids.length >= count) break;
            next = v + 1;
          }
          if (used.length < STEP) break;
        }
        while (ids.length < count) ids.push(next++);
        return { ids };
      }),

    sqlQuery: (sql) =>
      run(async () => {
        const { db } = connected();
        if (!db.selectRaw) throw fail('BAD_REQUEST', 'This connection cannot run queries.');
        try {
          return await db.selectRaw(sql);
        } catch (error) {
          if (error instanceof NotReadOnlyError || error instanceof SqlQueryError) throw fail('BAD_REQUEST', error.message);
          throw error;
        }
      }),
  };
}
