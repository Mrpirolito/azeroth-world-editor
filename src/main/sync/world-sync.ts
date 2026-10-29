import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
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

/**
 * Creates `target` from `source` when it is missing: every base table, structure and rows, on the same
 * server (so nothing travels through this process). A copy that fails halfway is dropped, so the next
 * sync starts again instead of trusting half a database. Returns whether it was created now.
 */
export async function ensureWorldCopy(db: SyncDb, source: string, target: string): Promise<boolean> {
  if (source === target) throw new Error('The source and the sync database are the same database.');
  const exists = await db.query('SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [target]);
  if (exists.length > 0) return false;
  const [charset] = await db.query<{ cs: string; co: string }>('SELECT DEFAULT_CHARACTER_SET_NAME AS cs, DEFAULT_COLLATION_NAME AS co FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [source]);
  if (!charset) throw new Error(`The source database ${source} does not exist.`);
  await db.query(`CREATE DATABASE ${q(target)} DEFAULT CHARACTER SET ${charset.cs} COLLATE ${charset.co}`);
  try {
    const tables = await db.query<{ n: string }>("SELECT TABLE_NAME AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME", [source]);
    await db.query("SET SESSION sql_mode = '', foreign_key_checks = 0, unique_checks = 0");
    for (const { n } of tables) {
      await db.query(`CREATE TABLE ${q(target)}.${q(n)} LIKE ${q(source)}.${q(n)}`);
      await db.query(`INSERT INTO ${q(target)}.${q(n)} SELECT * FROM ${q(source)}.${q(n)}`);
    }
    await db.query('SET SESSION sql_mode = DEFAULT, foreign_key_checks = 1, unique_checks = 1');
  } catch (e) {
    await db.query(`DROP DATABASE IF EXISTS ${q(target)}`).catch(() => undefined);
    throw e;
  }
  return true;
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
}

/** Runs the plan in order on `database`, recording each file in `updates` as AzerothCore does; stops at the first failure */
export async function applyPlan(db: SyncDb, database: string, plan: UpdatePlan, read: (path: string) => Promise<string> = (p) => readFile(p, 'utf8')): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], renamed: [] };
  await db.query(`USE ${q(database)}`);
  for (const r of plan.renames) {
    await db.query('UPDATE updates SET name = ? WHERE name = ?', [r.file.name, r.from]);
    result.renamed.push(r.file.name);
  }
  for (const { file, hash } of plan.apply) {
    const started = Date.now();
    try {
      await db.query(await read(file.path));
    } catch (e) {
      throw new UpdateFailedError(file.name, e instanceof Error ? e.message : String(e));
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
