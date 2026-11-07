import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import type { SyncSettings } from '../../shared/ipc';
import type { Runner } from './git';
import { STATE_OF_DIR, hashOf, planUpdates, type UpdateFile, type UpdatePlan } from '../../core/sync/updates';

/** AzerothCore walks included folders to this depth */
const MAX_DEPTH = 10;

async function walk(dir: string, state: UpdateFile['state'], depth: number, out: UpdateFile[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      if (depth < MAX_DEPTH) await walk(path, state, depth + 1, out);
    } else if (e.name.toLowerCase().endsWith('.sql')) out.push({ name: e.name, path, state });
  }
}

/**
 * Every update file the server would see for the world database: the release, pending and custom folders,
 * and any folder named `db-world` directly under a module's `data/sql` (its base, updates and loose files).
 */
export async function collectUpdateFiles(repoDir: string): Promise<UpdateFile[]> {
  const out: UpdateFile[] = [];
  for (const [rel, state] of Object.entries(STATE_OF_DIR)) await walk(join(repoDir, rel), state, 1, out);
  let modules: string[] = [];
  try {
    modules = (await readdir(join(repoDir, 'modules'), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    // no modules folder
  }
  for (const m of modules.sort()) {
    const sql = join(repoDir, 'modules', m, 'data', 'sql');
    let dirs: string[] = [];
    try {
      dirs = (await readdir(sql, { withFileTypes: true })).filter((e) => e.isDirectory() && e.name.includes('db-world')).map((e) => e.name);
    } catch {
      continue;
    }
    for (const d of dirs.sort()) await walk(join(sql, d), 'MODULE', 1, out);
  }
  return out;
}

/** The part of a MySQL connection the sync uses; tests answer it from memory */
export interface SyncDb {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface SyncServer {
  host: string;
  port: number;
  user: string;
  password: string;
}

/** One connection to the server, no default database, several statements per query allowed */
export async function openSyncDb(s: SyncServer): Promise<SyncDb> {
  const conn = await mysql.createConnection({ ...s, multipleStatements: true, connectTimeout: 5_000, charset: 'UTF8MB4_GENERAL_CI' });
  return {
    async query(sql, params) {
      const [rows] = await conn.query(sql, params);
      return (Array.isArray(rows) ? rows : []) as never;
    },
    close: () => conn.end(),
  };
}

const q = (name: string): string => `\`${name.replace(/`/g, '``')}\``;

const UPDATES_TABLE = `CREATE TABLE IF NOT EXISTS \`updates\` (
  \`name\` varchar(200) NOT NULL,
  \`hash\` char(40) DEFAULT '',
  \`state\` enum('RELEASED','ARCHIVED','CUSTOM','MODULE','PENDING') NOT NULL DEFAULT 'RELEASED',
  \`timestamp\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`speed\` int unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

/** Runs one SQL file into `database` with the MySQL CLI, which handles DELIMITER blocks and big files; the password goes through the environment only */
export function cliImporter(run: Runner, mysqlBin: string, server: SyncServer, database: string): (path: string) => Promise<void> {
  const args = [`--host=${server.host}`, `--port=${server.port}`, `--user=${server.user}`, '--default-character-set=utf8mb4', '--init-command=SET collation_connection = utf8mb4_unicode_ci', '--max-allowed-packet=1G', database];
  return async (path) => {
    const r = await run(mysqlBin, args, { env: { MYSQL_PWD: server.password }, stdinFile: path });
    if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
  };
}

/**
 * Builds `target` like a fresh AzerothCore install: the database is created and every file of
 * data/sql/base/db_world is imported with the MySQL CLI (the files are too big for mysql2). With `rebuild` an
 * existing database is dropped first. A failed import drops the database, so the next sync starts again.
 * The password reaches the CLI only through its environment. Returns whether it was built now.
 */
export async function ensureWorldFromBase(db: SyncDb, run: Runner, settings: Pick<SyncSettings, 'worktreeDir' | 'mysqlBin'>, server: SyncServer, target: string, rebuild = false): Promise<boolean> {
  const exists = (await db.query('SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [target])).length > 0;
  if (exists && !rebuild) return false;
  const dir = join(settings.worktreeDir, 'data', 'sql', 'base', 'db_world');
  const files = (await readdir(dir)).filter((n) => n.toLowerCase().endsWith('.sql')).sort();
  if (files.length === 0) throw new Error(`No base SQL files in ${dir}.`);
  await db.query(`DROP DATABASE IF EXISTS ${q(target)}`);
  await db.query(`CREATE DATABASE ${q(target)} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const importFile = cliImporter(run, settings.mysqlBin, server, target);
  try {
    for (const name of files) await importFile(join(dir, name)).catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
  } catch (e) {
    await db.query(`DROP DATABASE IF EXISTS ${q(target)}`).catch(() => undefined);
    throw e;
  }
  return true;
}

/** Tables the seed never copies: the update bookkeeping of the target */
export const SEED_SKIP = new Set(['updates', 'updates_include']);

/** One INSERT IGNORE copying the columns both databases have; null when nothing is shared or the table is skipped */
export function seedStatement(seed: string, target: string, table: string, columns: readonly string[]): string | null {
  if (SEED_SKIP.has(table.toLowerCase()) || columns.length === 0) return null;
  const cols = columns.map(q).join(', ');
  return `INSERT IGNORE INTO ${q(target)}.${q(table)} (${cols}) SELECT ${cols} FROM ${q(seed)}.${q(table)}`;
}

/**
 * Copies into the freshly built `target` every row of `seed` (the live world, which holds imports the repo does not)
 * that is missing there, table by table over the columns both share. Only reads `seed`. Returns the rows added per table.
 */
export async function seedWorld(db: SyncDb, seed: string, target: string): Promise<{ table: string; rows: number }[]> {
  const shared = await db.query<{ t: string; c: string }>(
    `SELECT s.TABLE_NAME AS t, s.COLUMN_NAME AS c FROM information_schema.COLUMNS s
     JOIN information_schema.COLUMNS d ON d.TABLE_SCHEMA = ? AND d.TABLE_NAME = s.TABLE_NAME AND d.COLUMN_NAME = s.COLUMN_NAME AND d.EXTRA NOT LIKE '%GENERATED%'
     JOIN information_schema.TABLES st ON st.TABLE_SCHEMA = s.TABLE_SCHEMA AND st.TABLE_NAME = s.TABLE_NAME AND st.TABLE_TYPE = 'BASE TABLE'
     JOIN information_schema.TABLES dt ON dt.TABLE_SCHEMA = d.TABLE_SCHEMA AND dt.TABLE_NAME = d.TABLE_NAME AND dt.TABLE_TYPE = 'BASE TABLE'
     WHERE s.TABLE_SCHEMA = ? AND s.EXTRA NOT LIKE '%GENERATED%' ORDER BY s.TABLE_NAME, s.ORDINAL_POSITION`,
    [target, seed],
  );
  const byTable = new Map<string, string[]>();
  for (const r of shared) byTable.set(r.t, [...(byTable.get(r.t) ?? []), r.c]);
  const out: { table: string; rows: number }[] = [];
  await db.query("SET SESSION sql_mode = '', foreign_key_checks = 0");
  try {
    for (const [table, cols] of byTable) {
      const sql = seedStatement(seed, target, table, cols);
      if (!sql) continue;
      await db.query(sql);
      const [n] = await db.query<{ n: number | string }>('SELECT ROW_COUNT() AS n');
      const rows = Number(n?.n ?? 0);
      if (rows > 0) out.push({ table, rows });
    }
  } finally {
    await db.query('SET SESSION sql_mode = DEFAULT, foreign_key_checks = 1').catch(() => undefined);
  }
  return out;
}

/** What `updates` records now: name to hash */
export async function appliedUpdates(db: SyncDb, database: string): Promise<Map<string, string>> {
  await db.query(UPDATES_TABLE.replace('`updates`', `${q(database)}.\`updates\``));
  const rows = await db.query<{ name: string; hash: string }>(`SELECT name, hash FROM ${q(database)}.updates`);
  return new Map(rows.map((r) => [r.name, r.hash]));
}

/** A file of the plan was refused by MySQL; nothing after it ran */
export class UpdateFailedError extends Error {
  constructor(readonly file: string, reason: string) {
    super(`${file}: ${reason}`);
    this.name = 'UpdateFailedError';
  }
}

export interface ApplyResult {
  applied: string[];
  renamed: string[];
  /** Files that failed with keepGoing; left unrecorded so the next sync tries them again */
  failed: { name: string; error: string }[];
}

/** Runs the plan in order on `database`, recording each file in `updates` as AzerothCore does; stops at the first failure */
export async function applyPlan(
  db: SyncDb,
  database: string,
  plan: UpdatePlan,
  read: (path: string) => Promise<string> = (p) => readFile(p, 'utf8'),
  exec?: (path: string) => Promise<void>,
  keepGoing = false,
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], renamed: [], failed: [] };
  await db.query(`USE ${q(database)}`);
  for (const r of plan.renames) {
    await db.query('UPDATE updates SET name = ? WHERE name = ?', [r.file.name, r.from]);
    result.renamed.push(r.file.name);
  }
  for (const { file, hash } of plan.apply) {
    const started = Date.now();
    try {
      if (exec) await exec(file.path);
      else await db.query(await read(file.path));
    } catch (e) {
      const error = new UpdateFailedError(file.name, e instanceof Error ? e.message : String(e));
      if (!keepGoing) throw error;
      result.failed.push({ name: file.name, error: error.message });
      continue;
    }
    await db.query('REPLACE INTO updates (name, hash, state, speed) VALUES (?, ?, ?, ?)', [file.name, hash, file.state, Date.now() - started]);
    result.applied.push(file.name);
  }
  return result;
}

/** Plans what `database` is missing from the repo's update files, reading each file once to hash it */
export async function planFor(db: SyncDb, database: string, files: readonly UpdateFile[]): Promise<UpdatePlan> {
  const applied = await appliedUpdates(db, database);
  const hashes = new Map<string, string>();
  for (const f of files) hashes.set(f.path, hashOf(await readFile(f.path)));
  return planUpdates(files, applied, (f) => hashes.get(f.path)!);
}
