import type { SqlResult } from '@core/db/read-only-sql';
import type { Row } from '@core/tables/types';
import type { Result } from './result';

export type { SqlResult } from '@core/db/read-only-sql';

/** The rows of the tables the sheets edit, read from the world database */
export interface TablesApi {
  /** A table's rows under a scope as the database has them now, and the columns it has; `exists` is false for a table this database lacks */
  tableRows(table: string, scope: Record<string, string>): Promise<Result<{ exists: boolean; columns: string[]; rows: Row[] }>>;
  /** Rows of a table found by id or by their words, at most 30 */
  searchTable(table: string, text: string): Promise<Result<{ rows: Row[] }>>;
  /** The first `count` values of a column from `from` up that no row holds yet: the unused ids and guids */
  freeIds(table: string, column: string, from: number, count: number): Promise<Result<{ ids: number[] }>>;
  /** Runs one query that only reads and returns its rows (at most 500); anything else is refused */
  sqlQuery(sql: string): Promise<Result<SqlResult>>;
}
