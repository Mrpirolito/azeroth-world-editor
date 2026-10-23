import { beforeEach, describe, expect, it, vi } from 'vitest';
import { limitedSql, NotReadOnlyError, readOnlySql, SQL_ROW_LIMIT, SqlQueryError } from '../../src/core/db/read-only-sql';

const queries: unknown[] = [];
let failWith: (Error & { sqlMessage?: string }) | null = null;
vi.mock('mysql2/promise', () => {
  const connection = {
    query: vi.fn(async (q: unknown) => {
      queries.push(q);
      const sql = typeof q === 'string' ? q : (q as { sql: string }).sql;
      if (sql.startsWith('SELECT') && failWith) throw failWith;
      if (sql.startsWith('SELECT')) {
        return [Array.from({ length: SQL_ROW_LIMIT + 1 }, (_, i) => ({ id: String(i), name: i === 0 ? null : 'x' })), [{ name: 'id' }, { name: 'name' }]];
      }
      return [[], []];
    }),
    release: vi.fn(),
  };
  const pool = { getConnection: vi.fn(async () => connection), query: vi.fn(), end: vi.fn() };
  return { default: { createPool: () => pool } };
});

describe('readOnlySql', () => {
  it.each([
    'SELECT * FROM creature_template',
    '  select entry, name from creature_template where name like \'%;%\' ;',
    'SELECT a.entry FROM creature_template a JOIN creature b ON b.id = a.entry UNION SELECT 1',
    'SHOW TABLES',
    'DESCRIBE creature_template',
    'desc creature_template',
    'EXPLAIN SELECT 1',
    'SELECT "a -- b", \'c # d\', `x;y` FROM t',
    "SELECT 'it''s' FROM t",
  ])('lets %s through', (sql) => {
    expect(() => readOnlySql(sql)).not.toThrow();
  });

  it.each([
    ['', 'Type a SELECT query.'],
    ['DELETE FROM creature_template', 'Only SELECT'],
    ['UPDATE creature_template SET name = \'x\'', 'Only SELECT'],
    ['INSERT INTO game_tele VALUES (1)', 'Only SELECT'],
    ['DROP TABLE creature_template', 'Only SELECT'],
    ['TRUNCATE creature', 'Only SELECT'],
    ['SET @a = 1', 'Only SELECT'],
    ['SELECT 1; DELETE FROM creature', 'one statement'],
    ['SELECT 1 /* x */', 'Comments'],
    ['SELECT 1 -- x', 'Comments'],
    ['SELECT 1 # x', 'Comments'],
    ['SELECT /*! 1; DELETE FROM creature */ 1', 'Comments'],
    ["SELECT * FROM creature INTO OUTFILE 'x'", 'write'],
    ['SELECT * FROM creature INTO @v', 'write'],
    ['SELECT * FROM creature FOR UPDATE', 'write'],
    ['SELECT * FROM creature LOCK IN SHARE MODE', 'write'],
    ["SELECT LOAD_FILE('/etc/passwd')", 'write'],
    ['SELECT SLEEP(100)', 'write'],
    ['SELECT BENCHMARK(1000000000, MD5(1))', 'write'],
    ['SELECT @a := 1', 'write'],
    ['EXPLAIN ANALYZE SELECT 1', 'ANALYZE'],
    ["SELECT 'open", 'quote'],
    ['WITH x AS (SELECT 1) DELETE FROM creature', 'Only SELECT'],
  ])('refuses %j', (sql, why) => {
    expect(() => readOnlySql(sql)).toThrowError(NotReadOnlyError);
    expect(() => readOnlySql(sql)).toThrow(why);
  });

  it('is not fooled by a keyword inside a string or an identifier', () => {
    expect(() => readOnlySql("SELECT 'INTO OUTFILE', `into`, 'sleep(1)' FROM t")).not.toThrow();
  });

  it('strips the closing semicolon', () => {
    expect(readOnlySql(' SELECT 1 ; ')).toBe('SELECT 1');
  });
});

describe('limitedSql', () => {
  it('adds a LIMIT to a SELECT without one, and leaves the rest', () => {
    expect(limitedSql('SELECT * FROM t')).toBe(`SELECT * FROM t LIMIT ${SQL_ROW_LIMIT + 1}`);
    expect(limitedSql('SELECT * FROM t LIMIT 5')).toBe('SELECT * FROM t LIMIT 5');
    expect(limitedSql("SELECT 'limit' FROM t")).toBe(`SELECT 'limit' FROM t LIMIT ${SQL_ROW_LIMIT + 1}`);
    expect(limitedSql('SHOW TABLES')).toBe('SHOW TABLES');
  });
});

describe('the MySQL layer', () => {
  beforeEach(() => {
    queries.length = 0;
    failWith = null;
  });
  const open = async () => (await import('../../src/core/db/mysql-world-db')).openMysqlWorldDb({ host: 'h', port: 1, user: 'u', password: 'p', database: 'd' });

  it('runs a SELECT in a read-only transaction, caps its rows and rolls back', async () => {
    const db = await open();
    const out = await db.selectRaw!('SELECT id, name FROM t');
    expect(queries).toEqual(['START TRANSACTION READ ONLY', { sql: `SELECT id, name FROM t LIMIT ${SQL_ROW_LIMIT + 1}`, timeout: 10_000 }, 'ROLLBACK']);
    expect(out.columns).toEqual(['id', 'name']);
    expect(out.rows).toHaveLength(SQL_ROW_LIMIT);
    expect(out.rows[0]).toEqual({ id: '0', name: null });
    expect(out.truncated).toBe(true);
  });

  it('never sends a statement that could write to the database', async () => {
    const db = await open();
    await expect(db.selectRaw!('DELETE FROM creature')).rejects.toBeInstanceOf(NotReadOnlyError);
    await expect(db.selectRaw!('SELECT 1; DROP TABLE creature')).rejects.toBeInstanceOf(NotReadOnlyError);
    expect(queries).toEqual([]);
  });

  it('gives back the database\'s own words for a query it refuses', async () => {
    const db = await open();
    failWith = Object.assign(new Error('x'), { sqlMessage: "Unknown column 'nope' in 'field list'", code: 'ER_BAD_FIELD_ERROR' });
    const error = await db.selectRaw!('SELECT nope FROM t').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SqlQueryError);
    expect((error as Error).message).toContain("Unknown column 'nope'");
    expect(queries.at(-1)).toBe('ROLLBACK');
  });
});
