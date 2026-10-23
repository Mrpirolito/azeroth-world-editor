/**
 * What the SQL console may send to the world database: one statement that only reads. The check is the
 * database layer's own, so no caller can skip it; the MySQL layer also runs the statement in a read-only
 * transaction, which is the second lock.
 */

export class NotReadOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotReadOnlyError';
  }
}

/** The most rows the console returns */
export const SQL_ROW_LIMIT = 500;

const FIRST_WORDS = new Set(['select', 'show', 'describe', 'desc', 'explain']);
/** Words that read nothing but do something else: write a file, take a lock, set a variable, stall the server */
const FORBIDDEN = /\b(into|for\s+update|lock\s+in\s+share\s+mode|load_file|sleep|benchmark|get_lock|release_lock|is_free_lock|master_pos_wait)\b|:=/i;

/** The statement with its text and identifiers blanked, to look for words in the code alone; throws when quotes do not close */
function codeOf(sql: string): string {
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      for (; j < sql.length; j++) {
        if (sql[j] === '\\' && c !== '`') j++;
        else if (sql[j] === c) {
          if (sql[j + 1] === c) j++;
          else break;
        }
      }
      if (j >= sql.length) throw new NotReadOnlyError('A quote is not closed.');
      out += c === '`' ? 'x' : "''";
      i = j;
    } else out += c;
  }
  return out;
}

/**
 * The statement as it is to be sent: trimmed, without a closing semicolon. Throws `NotReadOnlyError` for anything that is not a
 * single SELECT, SHOW, DESCRIBE or EXPLAIN, that holds a comment (which can hide a second statement), or that could write.
 */
export function readOnlySql(raw: string): string {
  const sql = raw.replace(/[;\s]+$/, '').trim();
  if (sql === '') throw new NotReadOnlyError('Type a SELECT query.');
  const code = codeOf(sql);
  if (/--|#|\/\*/.test(code)) throw new NotReadOnlyError('Comments are not allowed.');
  if (code.includes(';')) throw new NotReadOnlyError('Only one statement at a time.');
  const first = /^\s*([a-z]+)/i.exec(code)?.[1]?.toLowerCase();
  if (!first || !FIRST_WORDS.has(first)) throw new NotReadOnlyError('Only SELECT, SHOW, DESCRIBE and EXPLAIN are allowed: the world database is read-only here.');
  if (FORBIDDEN.test(code)) throw new NotReadOnlyError('That query could write, lock or stall the database, so it is not allowed.');
  if (first === 'explain' && /\banalyze\b/i.test(code)) throw new NotReadOnlyError('EXPLAIN ANALYZE runs the statement, so it is not allowed.');
  return sql;
}

/** A SELECT with no LIMIT of its own gets one, so a whole table is never pulled into memory */
export function limitedSql(sql: string, limit: number = SQL_ROW_LIMIT): string {
  return /^\s*select\b/i.test(sql) && !/\blimit\b/i.test(codeOf(sql)) ? `${sql} LIMIT ${limit + 1}` : sql;
}

/** A read-only query the database refused, with its own message (a typo in a column name, say) */
export class SqlQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlQueryError';
  }
}

/** What a console query gives back: the column names in order, the rows (at most `SQL_ROW_LIMIT`) and whether more were left out */
export interface SqlResult {
  columns: string[];
  rows: Record<string, string | null>[];
  truncated: boolean;
}
