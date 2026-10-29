import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApi } from '../../src/main/api';
import { pickSource } from '../../src/main/api/sync-api';
import type { Runner, RunResult } from '../../src/main/sync/git';
import { DEFAULT_SYNC_SETTINGS, saveSyncSettings, syncMain, syncStatus, updateWorktree, type KeyValue, type MainSyncPorts } from '../../src/main/sync/main-sync';
import { dryRun, preparePr, publishPr } from '../../src/main/sync/pr-export';
import { UpdateFailedError, applyPlan, collectUpdateFiles, ensureWorldFromBase, type SyncDb } from '../../src/main/sync/world-sync';
import { planUpdates } from '../../src/core/sync/updates';
import { openStore } from '../../src/main/store/store';
import { createProjectSession } from '../../src/main/project/session';
import { defaultProjectMeta } from '../../src/main/project/project-file';
import type { ProjectController } from '../../src/main/project/controller';
import type { ProfileRecord } from '../../src/shared/ipc';

const memory = (): KeyValue => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void (v === null ? m.delete(k) : m.set(k, v)) };
};

/** Answers git by the first words of the command; records every command */
function fakeRunner(answers: Record<string, Partial<RunResult> | ((args: string[], cwd?: string) => Partial<RunResult>)>): Runner & { calls: string[] } {
  const calls: string[] = [];
  const run = (async (cmd, args, opts) => {
    const line = `${cmd} ${args.join(' ')}`;
    calls.push(line);
    const key = Object.keys(answers).find((k) => line.includes(k));
    const answer = key ? answers[key]! : {};
    const r = typeof answer === 'function' ? answer([...args], opts?.cwd) : answer;
    return { code: 0, stdout: '', stderr: '', ...r };
  }) as Runner & { calls: string[] };
  run.calls = calls;
  return run;
}

const SHA = 'a'.repeat(40);

function fakeDb(handler: (sql: string, params?: unknown[]) => unknown[] | Error = () => []): SyncDb & { sql: string[] } {
  const sql: string[] = [];
  return {
    sql,
    async query(text, params) {
      sql.push(text);
      const out = handler(text, params);
      if (out instanceof Error) throw out;
      return out as never;
    },
    close: async () => undefined,
  };
}

describe('collecting update files', () => {
  it('walks the release, pending and custom folders and every module db-world folder, base included', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awe-sync-'));
    const put = async (rel: string): Promise<void> => {
      await mkdir(join(root, rel, '..'), { recursive: true });
      await writeFile(join(root, rel), 'select 1;');
    };
    await put('data/sql/updates/db_world/2026_01_01_00.sql');
    await put('data/sql/updates/pending_db_world/rev_1.sql');
    await put('data/sql/custom/db_world/c.sql');
    await put('data/sql/updates/db_auth/other.sql');
    await put('modules/mod-a/data/sql/db-world/base/01_base.sql');
    await put('modules/mod-a/data/sql/db-world/2026_x.sql');
    await put('modules/mod-a/data/sql/db-characters/ignored.sql');
    await put('modules/mod-a/data/sql/db-world/readme.md');
    const files = await collectUpdateFiles(root);
    expect(files.map((x) => [x.name, x.state]).sort()).toEqual([
      ['01_base.sql', 'MODULE'], ['2026_01_01_00.sql', 'RELEASED'], ['2026_x.sql', 'MODULE'], ['c.sql', 'CUSTOM'], ['rev_1.sql', 'PENDING'],
    ]);
  });
});

describe('applying updates', () => {
  const files = ['a.sql', 'b.sql', 'c.sql'].map((name) => ({ name, path: `/${name}`, state: 'PENDING' as const }));

  it('runs each file in order and records it in updates', async () => {
    const db = fakeDb();
    const plan = planUpdates(files, new Map(), (x) => `H${x.name}`);
    const out = await applyPlan(db, 'awe_world', plan, async (p) => `-- ${p}`);
    expect(out.applied).toEqual(['a.sql', 'b.sql', 'c.sql']);
    expect(db.sql.filter((s) => s.startsWith('--'))).toEqual(['-- /a.sql', '-- /b.sql', '-- /c.sql']);
    expect(db.sql.filter((s) => s.startsWith('REPLACE INTO updates'))).toHaveLength(3);
  });

  it('stops at the first failing file and names it with the MySQL error', async () => {
    const db = fakeDb((sql) => (sql === '-- /b.sql' ? new Error("Table 'x' doesn't exist") : []));
    const plan = planUpdates(files, new Map(), (x) => `H${x.name}`);
    const error = await applyPlan(db, 'awe_world', plan, async (p) => `-- ${p}`).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpdateFailedError);
    expect((error as Error).message).toBe("b.sql: Table 'x' doesn't exist");
    expect(db.sql.filter((s) => s.startsWith('--'))).toEqual(['-- /a.sql', '-- /b.sql']);
    expect(db.sql.filter((s) => s.startsWith('REPLACE INTO updates'))).toHaveLength(1);
  });
});

describe('building awe_world from the base SQL', () => {
  const server = { host: 'h', port: 3307, user: 'u', password: 'secret-pw' };
  const baseDir = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'awe-base-'));
    const dir = join(root, 'data', 'sql', 'base', 'db_world');
    await mkdir(dir, { recursive: true });
    for (const n of ['b.sql', 'a.sql', 'c.sql', 'notes.md']) await writeFile(join(dir, n), '-- x');
    return root;
  };
  const absent = (): unknown[] => [];
  const ok = { code: 0, stdout: '', stderr: '' };

  it('does nothing when it exists, unless rebuilding', async () => {
    const settings = { worktreeDir: await baseDir(), mysqlBin: 'mysql' };
    const present = (sql: string): unknown[] => (sql.includes('SCHEMATA') ? [{ 1: 1 }] : []);
    const run = fakeRunner({});
    expect(await ensureWorldFromBase(fakeDb(present), run, settings, server, 'awe_world')).toBe(false);
    expect(run.calls).toEqual([]);
    const again = fakeDb(present);
    expect(await ensureWorldFromBase(again, run, settings, server, 'awe_world', true)).toBe(true);
    expect(again.sql.slice(1)).toEqual(['DROP DATABASE IF EXISTS `awe_world`', 'CREATE DATABASE `awe_world` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci']);
    expect(run.calls).toHaveLength(3);
  });

  it('imports the base files in name order, with the password only in the environment', async () => {
    const seen: { args: readonly string[]; env?: Record<string, string>; stdinFile?: string }[] = [];
    const run: Runner = async (_c, args, opts) => {
      seen.push({ args, env: opts?.env, stdinFile: opts?.stdinFile });
      return ok;
    };
    expect(await ensureWorldFromBase(fakeDb(absent), run, { worktreeDir: await baseDir(), mysqlBin: 'mysql' }, server, 'awe_world')).toBe(true);
    expect(seen.map((x) => x.stdinFile?.split(/[\\/]/).pop())).toEqual(['a.sql', 'b.sql', 'c.sql']);
    expect(seen.every((x) => x.env?.MYSQL_PWD === 'secret-pw')).toBe(true);
    expect(JSON.stringify(seen.map((x) => x.args))).not.toContain('secret-pw');
    expect(seen[0]!.args).toEqual(['--host=h', '--port=3307', '--user=u', '--default-character-set=utf8mb4', '--init-command=SET collation_connection = utf8mb4_unicode_ci', '--max-allowed-packet=1G', 'awe_world']);
  });

  it('stops at the first failing file and drops the database', async () => {
    const run: Runner = async (_c, _a, opts) => (opts?.stdinFile?.endsWith('b.sql') ? { code: 1, stdout: '', stderr: 'ERROR 1064\n' } : ok);
    const db = fakeDb(absent);
    await expect(ensureWorldFromBase(db, run, { worktreeDir: await baseDir(), mysqlBin: 'mysql' }, server, 'awe_world')).rejects.toThrow('b.sql: ERROR 1064');
    expect(db.sql.at(-1)).toBe('DROP DATABASE IF EXISTS `awe_world`');
  });
});

describe('syncing with main', () => {
  const ports = (run: Runner, kv = memory(), hasCheckout = false): MainSyncPorts => ({ kv, run, now: () => new Date('2026-10-29T10:00:00Z'), hasCheckout: async () => hasCheckout, collect: async () => [] });

  it('adds the worktree the first time and moves it to main afterwards', async () => {
    const first = fakeRunner({ 'rev-parse': { stdout: `${SHA}\n` } });
    await updateWorktree(ports(first), DEFAULT_SYNC_SETTINGS);
    expect(first.calls).toEqual([`git -C G:\\Coa\\wt-main worktree add --detach G:\\Coa\\awe-main coa/main`]);
    const again = fakeRunner({});
    await updateWorktree(ports(again, memory(), true), DEFAULT_SYNC_SETTINGS);
    expect(again.calls).toEqual([`git -C G:\\Coa\\awe-main checkout --detach coa/main`]);
  });

  it('fetches, aligns, and then reports aligned; a moved main shows a warning', async () => {
    const kv = memory();
    const db = fakeDb((sql) => (sql.includes('SCHEMATA') ? [{ 1: 1 }] : []));
    const run = fakeRunner({ 'rev-parse': { stdout: `${SHA}\n` } });
    const out = await syncMain(ports(run, kv), db, { host: 'h', port: 1, user: 'u', password: 'p' });
    expect(out).toMatchObject({ sha: SHA, created: false, applied: [] });
    expect(run.calls[0]).toBe('git -C G:\\Coa\\wt-main fetch coa');
    expect((await syncStatus(ports(run, kv), false)).message).toBe('Aligned with main @ aaaaaaaa');
    const moved = fakeRunner({ 'rev-parse': { stdout: `${'b'.repeat(40)}\n` } });
    const status = await syncStatus(ports(moved, kv), false);
    expect(status).toMatchObject({ behind: true, aligned: false });
    expect(status.message).toContain('has moved');
  });

  it('is not aligned before the first sync', async () => {
    const status = await syncStatus(ports(fakeRunner({ 'rev-parse': { stdout: SHA } })), false);
    expect(status).toMatchObject({ aligned: false, syncedSha: null });
  });
});

describe('Export as PR', () => {
  const alignedPorts = async (run: Runner) => {
    const kv = memory();
    const parent = await mkdtemp(join(tmpdir(), 'awe-pr-'));
    saveSyncSettings(kv, { prWorktreeParent: parent });
    kv.set('sync.state', JSON.stringify({ sha: SHA, at: 'now' }));
    return { parent, ports: { kv, run, now: () => new Date() } as MainSyncPorts };
  };
  const input = { title: 'Pickups', slug: 'pickups', date: '20261030', sql: 'INSERT INTO t VALUES (1);\n', ids: [], body: 'body' };
  const gitAnswers = (lint: Partial<RunResult> = {}) => ({
    'rev-parse HEAD': { stdout: 'c0ffee\n' },
    'rev-parse coa/main': { stdout: `${SHA}\n` },
    'ls-tree': { stdout: 'data/sql/updates/pending_db_world/rev_20261030_40_a.sql\ndata/sql/updates/pending_db_world/rev_20261030_41_a_revert.sql\n' },
    'codestyle-sql.py': lint,
  });

  it('refuses when awe_world is not on the current main', async () => {
    const { ports } = await alignedPorts(fakeRunner({ ...gitAnswers(), 'rev-parse coa/main': { stdout: `${'b'.repeat(40)}\n` } }));
    await expect(preparePr(ports, fakeDb(), input)).rejects.toThrow(/not aligned/);
  });

  it('writes rev_<date>_<next nn>_<slug>.sql in a worktree from main, runs the checks and commits without attribution', async () => {
    const run = fakeRunner(gitAnswers());
    const { ports, parent } = await alignedPorts(run);
    await mkdir(join(parent, 'awe-pr-pickups', 'apps', 'codestyle'), { recursive: true });
    await writeFile(join(parent, 'awe-pr-pickups', 'apps', 'codestyle', 'codestyle-sql.py'), '');
    const db = fakeDb();
    const preview = await preparePr(ports, db, input);
    expect(preview).toMatchObject({ ok: true, commit: 'c0ffee', branch: 'awe/pickups', file: 'data/sql/updates/pending_db_world/rev_20261030_42_pickups.sql' });
    expect(await readFile(join(parent, 'awe-pr-pickups', preview.file), 'utf8')).toBe(input.sql);
    expect(run.calls).toContain(`git -C G:\\Coa\\wt-main worktree add -b awe/pickups ${join(parent, 'awe-pr-pickups')} coa/main`);
    expect(run.calls.some((c) => c.startsWith('python apps/codestyle/codestyle-sql.py --files data/sql/updates/pending_db_world/rev_20261030_42_pickups.sql'))).toBe(true);
    const commit = run.calls.find((c) => c.includes(' commit '))!;
    expect(commit).toContain('-m feat(DB/CoA): Pickups');
    expect(commit).not.toMatch(/claude|co-authored|generated/i);
    expect(db.sql).toEqual(['USE `awe_world`', 'START TRANSACTION', input.sql, 'ROLLBACK']);
    expect(run.calls.some((c) => c.includes('push'))).toBe(false);
  });

  it('fails the check and commits nothing when the lint fails', async () => {
    const run = fakeRunner(gitAnswers({ code: 1, stdout: 'bad style' }));
    const { ports, parent } = await alignedPorts(run);
    await mkdir(join(parent, 'awe-pr-pickups', 'apps', 'codestyle'), { recursive: true });
    await writeFile(join(parent, 'awe-pr-pickups', 'apps', 'codestyle', 'codestyle-sql.py'), '');
    const preview = await preparePr(ports, fakeDb(), input);
    expect(preview.ok).toBe(false);
    expect(preview.commit).toBeNull();
    expect(preview.checks.find((c) => c.name === 'Repo SQL lint')!.errors).toEqual(['bad style']);
    expect(run.calls.some((c) => c.includes(' commit '))).toBe(false);
  });

  it('fails the dry run on a MySQL error and always rolls back', async () => {
    const db = fakeDb((sql) => (sql.startsWith('INSERT') ? new Error('Duplicate entry') : []));
    const check = await dryRun(db, 'INSERT INTO t VALUES (1);');
    expect(check).toMatchObject({ ok: false, errors: ['Duplicate entry'] });
    expect(db.sql.at(-1)).toBe('ROLLBACK');
  });

  it('pushes to the fork and opens the PR against the upstream repo, with no footer, only for a prepared passing branch', async () => {
    const run = fakeRunner({ 'pr create': { stdout: 'https://github.com/o/r/pull/9\n' } });
    const { ports } = await alignedPorts(run);
    const preview = { slug: 'pickups', branch: 'awe/pickups', worktree: '/wt', file: 'f', title: 'Pickups', body: 'the body', sql: '', commit: 'c0ffee', checks: [], ok: true };
    expect(await publishPr(ports, preview)).toBe('https://github.com/o/r/pull/9');
    expect(run.calls[0]).toBe('git -C /wt push -u fork awe/pickups');
    expect(run.calls[1]).toBe('gh pr create -R Conquest-of-AzerothCore/azerothcore-wotlk-coa --head Mrpirolito:awe/pickups --base main --title feat(DB/CoA): Pickups --body the body');
    await expect(publishPr(ports, { ...preview, ok: false, commit: null })).rejects.toThrow(/failing checks/);
  });

  it('the API refuses to publish without an explicit confirm', async () => {
    const box = { encrypt: (s: string) => Uint8Array.from(Buffer.from(s)), decrypt: (b: Uint8Array) => Buffer.from(b).toString() };
    const api = createApi({
      store: openStore(':memory:', box), openWorldDb: async () => { throw new Error('x'); }, openDevDb: async () => { throw new Error('x'); },
      fs: { writeFile: async () => {}, ensureDir: async () => {}, listDir: async () => [] }, now: () => new Date(),
      session: createProjectSession(defaultProjectMeta('P', 'C:/out')), projects: {} as ProjectController,
    });
    const out = await api.exportPrPublish({ slug: 'pickups', confirm: false });
    expect(out).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } });
  });
});

describe('choosing the source database', () => {
  const p = (id: number, database: string, lastConnectedAt: string | null, role: 'world' | 'dev' = 'world'): ProfileRecord => ({ id, name: `p${id}`, role, host: 'h', port: 1, user: 'u', database, dbcDir: '', clientDir: '', exportDir: '', lastConnectedAt });
  it('prefers the open connection, never awe_world or a dev profile, else the latest used', () => {
    const profiles = [p(1, 'acore_world', '2026-01-01'), p(2, 'other_world', '2026-02-01'), p(3, 'awe_world', '2026-03-01'), p(4, 'dev', '2026-04-01', 'dev')];
    expect(pickSource(profiles, 1)?.id).toBe(1);
    expect(pickSource(profiles, 3)?.id).toBe(2);
    expect(pickSource(profiles, null)?.id).toBe(2);
    expect(pickSource([profiles[2]!], null)).toBeNull();
  });
});
