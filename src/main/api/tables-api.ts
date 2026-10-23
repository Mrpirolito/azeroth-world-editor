import { NotReadOnlyError, SqlQueryError } from '../../core/db/read-only-sql';
import { rowsOrNone } from '../../core/db/rows-or-none';
import { specOf } from '../../core/tables/specs';
import type { TablesApi } from '../../shared/ipc';
import type { Services } from './services';
import { fail, run } from './errors';

const SEARCH_LIMIT = 30;
/** Rows read per step while looking for gaps, and the steps taken before giving up (20,000 rows) */
const STEP = 500;
const STEPS = 40;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The rows of the tables the sheets edit, a table's free ids and the read-only SQL console */
export function createTablesApi(s: Services): TablesApi {
  const { connected } = s.ctx;

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
