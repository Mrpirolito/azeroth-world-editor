import { access, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { IdHit, IdSearch, IdUse } from '../../core/sync/pr-checks';
import { idCollisions } from '../../core/sync/pr-checks';
import { prFilePath, PENDING_DIR } from '../../core/sync/pr-name';
import type { PrCheck, PrPreview, SyncSettings } from '../../shared/ipc';
import { fail } from '../api/errors';
import { gitIn, type Runner } from './git';
import { AWE_DB, loadSyncSettings, syncStatus, type MainSyncPorts } from './main-sync';
import type { SyncDb } from './world-sync';

const LINT = 'apps/codestyle/codestyle-sql.py';
/** Trees of main where an id can already be in use */
const SEARCHED = ['data/sql', 'modules', 'src'];

export interface PrInput {
  title: string;
  slug: string;
  /** The date part of the file name, yyyymmdd */
  date: string;
  sql: string;
  ids: readonly IdUse[];
  body: string;
}

/** `git grep` over main for the ids and for the files that name a table; "no match" is an answer, not an error */
export function gitIdSearch(run: Runner, settings: SyncSettings): IdSearch {
  const prefix = `${settings.mainRef}:`;
  const files = (out: string): string[] => out.split('\n').filter(Boolean).map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l));
  const grep = async (args: string[]): Promise<string> => {
    const r = await run('git', ['-C', settings.repoDir, 'grep', '-I', ...args, settings.mainRef, '--', ...SEARCHED]);
    if (r.code > 1) throw new Error(`git grep failed: ${r.stderr.trim()}`);
    return r.stdout;
  };
  return {
    async grep(ids) {
      const out = await grep(['-n', '-w', '-F', ...ids.flatMap((id) => ['-e', id])]);
      const hits: IdHit[] = [];
      for (const line of files(out)) {
        const file = line.split(':')[0]!;
        const text = line.split(':').slice(2).join(':');
        for (const id of ids) if (new RegExp(`(?<![\\w.])${id}(?![\\w.])`).test(text)) hits.push({ file, id });
      }
      return hits;
    },
    async mentioning(table) {
      const out = await grep(['-l', '-w', '-F', '-e', table]);
      return new Set(files(out).filter((f) => !f.startsWith('src/')));
    },
  };
}

const check = (name: string, errors: string[], warnings: string[] = []): PrCheck => ({ name, ok: errors.length === 0, errors, warnings });

/** The patch applied inside a transaction on awe_world, then rolled back; any error is a failed check */
export async function dryRun(db: SyncDb, sql: string): Promise<PrCheck> {
  await db.query(`USE \`${AWE_DB}\``);
  await db.query('START TRANSACTION');
  try {
    await db.query(sql);
    return check('Applies cleanly to awe_world (rolled back)', []);
  } catch (e) {
    return check('Applies cleanly to awe_world (rolled back)', [e instanceof Error ? e.message : String(e)]);
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
  }
}

const pathExists = (p: string): Promise<boolean> => access(p).then(() => true, () => false);

/**
 * Makes the pull request ready and stops before anything leaves the machine: refuses unless awe_world is on
 * the current main, checks the patch (dry run, ids, the repo's SQL lint), then commits it on `awe/<slug>` in a
 * fresh worktree from main. A failed check leaves the branch uncommitted and says which.
 */
export async function preparePr(ports: MainSyncPorts, db: SyncDb, input: PrInput): Promise<PrPreview> {
  const status = await syncStatus(ports, true);
  if (!status.aligned) throw fail('VALIDATION', `awe_world is not aligned with ${status.settings.mainRef} (${status.message}). Sync with main first.`);
  const s = status.settings;
  const git = gitIn(ports.run, s.repoDir);
  const existing = (await git('ls-tree', '--name-only', s.mainRef, `${PENDING_DIR}/`)).split('\n').filter(Boolean).map((p) => basename(p));
  const target = prFilePath(existing, input.date, input.slug);

  const checks: PrCheck[] = [check(`awe_world is on ${s.mainRef} @ ${status.syncedSha!.slice(0, 8)}`, [])];
  checks.push(await dryRun(db, input.sql));
  const found = await idCollisions(input.ids, gitIdSearch(ports.run, s));
  checks.push(check('No id is already used in main', found.errors, found.warnings));

  const branch = `awe/${input.slug}`;
  const worktree = join(s.prWorktreeParent, `awe-pr-${input.slug}`);
  // A branch left by an earlier prepare of this slug is replaced; it never went anywhere without a confirm
  await ports.run('git', ['-C', s.repoDir, 'worktree', 'remove', '--force', worktree]);
  await git('worktree', 'prune');
  await ports.run('git', ['-C', s.repoDir, 'branch', '-D', branch]);
  await git('worktree', 'add', '-b', branch, worktree, s.mainRef);
  const file = target.path;
  await mkdir(join(worktree, PENDING_DIR), { recursive: true });
  await writeFile(join(worktree, file), input.sql, 'utf8');

  if (await pathExists(join(worktree, LINT))) {
    const lint = await ports.run(s.python, [LINT, '--files', file], { cwd: worktree, env: { PYTHONUTF8: '1' } });
    checks.push(check('Repo SQL lint', lint.code === 0 ? [] : [(lint.stdout + lint.stderr).trim() || `lint exited ${lint.code}`]));
  } else checks.push(check('Repo SQL lint', [], [`${LINT} is not in main; the lint was skipped.`]));

  const ok = checks.every((c) => c.ok);
  let commit: string | null = null;
  if (ok) {
    const wt = gitIn(ports.run, worktree);
    await wt('add', file);
    await wt('commit', '-m', `feat(DB/CoA): ${input.title}`);
    commit = await wt('rev-parse', 'HEAD');
  }
  return { slug: input.slug, branch, worktree, file, title: input.title, body: input.body, sql: input.sql, commit, checks, ok };
}

/** Pushes the prepared branch to the fork and opens the pull request; answers its URL */
export async function publishPr(ports: MainSyncPorts, preview: PrPreview): Promise<string> {
  if (!preview.ok || !preview.commit) throw fail('VALIDATION', 'The prepared pull request has failing checks; fix them and prepare it again.');
  const s = loadSyncSettings(ports.kv);
  await gitIn(ports.run, preview.worktree)('push', '-u', s.forkRemote, preview.branch);
  const r = await ports.run('gh', ['pr', 'create', '-R', s.prRepo, '--head', `${s.prHeadOwner}:${preview.branch}`, '--base', 'main', '--title', `feat(DB/CoA): ${preview.title}`, '--body', preview.body]);
  if (r.code !== 0) throw fail('UNKNOWN', `gh pr create failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim().split('\n').pop()!.trim();
}
