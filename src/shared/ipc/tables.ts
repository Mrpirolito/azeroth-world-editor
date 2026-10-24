import type { SqlResult } from '@core/db/read-only-sql';
import type { Row } from '@core/tables/types';
import type { Result } from './result';

export type { SqlResult } from '@core/db/read-only-sql';

/** One column of a sheet as its spec describes it, for a client that builds rows without the window */
export interface TableFieldInfo {
  column: string;
  label: string;
  /** int, float, text, enum, flags, ref, bool or part */
  type: string;
  help?: string;
  group?: string;
  /** The named choices of an enum, or the named bits of a flags column, as value and label */
  options?: { value: number; label: string }[];
  /** For a ref: what it names (item, creature, gameobject, quest or spell) */
  refKind?: string;
}

export interface TableSpecInfo {
  table: string;
  title: string;
  blurb: string;
  owner: 'creature' | 'gameobject' | 'item' | 'standalone';
  /** The columns that say whose rows these are */
  scope: string[];
  /** The columns that identify one row */
  pk: string[];
  /** Many rows under one scope, or exactly one */
  multi: boolean;
  fields: TableFieldInfo[];
}

/** The rows of the tables the sheets edit, read from the world database */
export interface TablesApi {
  /** A table's rows under a scope as the database has them now, and the columns it has; `exists` is false for a table this database lacks */
  tableRows(table: string, scope: Record<string, string>): Promise<Result<{ exists: boolean; columns: string[]; rows: Row[] }>>;
  /** Rows of a table found by id or by their words, at most 30 */
  searchTable(table: string, text: string): Promise<Result<{ rows: Row[] }>>;
  /** The first `count` values of a column from `from` up that no row holds yet: the unused ids and guids */
  freeIds(table: string, column: string, from: number, count: number): Promise<Result<{ ids: number[] }>>;
  /** The sheets: each table's columns with labels, named choices and help (one table, or all of them) */
  tableSpecs(table?: string): Promise<Result<{ specs: TableSpecInfo[] }>>;
  /** A table's rows under a scope as the database has them and as the project holds them (null when it holds none), with the problems found in the held rows */
  tableHeld(table: string, scope: Record<string, string>): Promise<Result<{ exists: boolean; columns: string[]; database: Row[]; project: Row[] | null; issues: string[] }>>;
  /** Holds rows for a table under a scope in the project, as one undo step; rows the same as the database's drop the change. Rows with errors are refused. */
  tableSet(table: string, scope: Record<string, string>, rows: Row[]): Promise<Result<{ changed: boolean; issues: string[] }>>;
  /** The SQL that writing these rows (else the rows the project holds) would run, and the SQL that puts the database's rows back; empty when nothing changes */
  tableSql(table: string, scope: Record<string, string>, rows?: Row[]): Promise<Result<{ sql: string; revert: string; note: string | null }>>;
  /** Runs one query that only reads and returns its rows (at most 500); anything else is refused */
  sqlQuery(sql: string): Promise<Result<SqlResult>>;
}
