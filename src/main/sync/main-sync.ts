import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { SyncSettings, SyncStatus } from '../../shared/ipc';
import { gitIn, type Runner } from './git';
import { applyPlan, cliImporter, collectUpdateFiles, ensureWorldFromBase, planFor, type SyncDb, type SyncServer } from './world-sync';

/** The database AWE works in when it is aligned with main; never the user's own world database */
export const AWE_DB = 'awe_world';

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  repoDir: 'G:\\Coa\\wt-main',
  worktreeDir: 'G:\\Coa\\awe-main',
  prWorktreeParent: 'G:\\Coa',
  python: 'python',
  mainRef: 'coa/main',
  forkRemote: 'fork',
  prRepo: 'Conquest-of-AzerothCore/azerothcore-wotlk-coa',
  prHeadOwner: 'Mrpirolito',
  mysqlBin: 'G:/Coa/CoA-Repack/mysql/bin/mysql.exe',
};

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

const SETTINGS_KEY = 'sync.settings';
const STATE_KEY = 'sync.state';

export function loadSyncSettings(kv: KeyValue): SyncSettings {
  try {
    return { ...DEFAULT_SYNC_SETTINGS, ...(JSON.parse(kv.get(SETTINGS_KEY) ?? '{}') as Partial<SyncSettings>) };
  } catch {
    return { ...DEFAULT_SYNC_SETTINGS };
  }
}

export function saveSyncSettings(kv: KeyValue, patch: Partial<SyncSettings>): SyncSettings {
  const next = { ...loadSyncSettings(kv), ...patch };
  kv.set(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

interface SyncState {
  sha: string;
  at: string;
}

export const loadSyncState = (kv: KeyValue): SyncState | null => {
  try {
    const s = JSON.parse(kv.get(STATE_KEY) ?? 'null') as SyncState | null;
    return s?.sha ? s : null;
  } catch {
    return null;
  }
};

const short = (sha: string): string => sha.slice(0, 8);

export interface MainSyncPorts {
  kv: KeyValue;
  run: Runner;
  now(): Date;
  /** Whether a folder holds a git checkout; the real one looks for `.git` */
  hasCheckout?(dir: string): Promise<boolean>;
  collect?: typeof collectUpdateFiles;
}

const nodeHasCheckout = (dir: string): Promise<boolean> => access(join(dir, '.git')).then(() => true, () => false);

/** The sha of the main ref in the server repo, after an optional fetch */
export async function mainSha(ports: MainSyncPorts, settings: SyncSettings, fetch: boolean): Promise<string> {
  const git = gitIn(ports.run, settings.repoDir);
  if (fetch) await git('fetch', settings.mainRef.split('/')[0] ?? 'origin');
  return git('rev-parse', settings.mainRef);
}

/** Puts the AWE-owned worktree on main: added the first time, moved to the new main afterwards */
export async function updateWorktree(ports: MainSyncPorts, settings: SyncSettings): Promise<void> {
  const exists = await (ports.hasCheckout ?? nodeHasCheckout)(settings.worktreeDir);
  if (exists) await gitIn(ports.run, settings.worktreeDir)('checkout', '--detach', settings.mainRef);
  else await gitIn(ports.run, settings.repoDir)('worktree', 'add', '--detach', settings.worktreeDir, settings.mainRef);
}

export async function syncStatus(ports: MainSyncPorts, refresh: boolean): Promise<SyncStatus> {
  const settings = loadSyncSettings(ports.kv);
  const state = loadSyncState(ports.kv);
  let origin: string | null = null;
  let problem: string | null = null;
  try {
    origin = await mainSha(ports, settings, refresh);
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }
  const behind = state !== null && origin !== null && origin !== state.sha;
  const message = problem
    ? `Cannot read ${settings.mainRef}: ${problem}`
    : state === null
      ? 'Not synced with main yet.'
      : behind
        ? `Aligned with main @ ${short(state.sha)}, but ${settings.mainRef} has moved to ${short(origin!)}. Sync again.`
        : `Aligned with main @ ${short(state.sha)}`;
  return { settings, syncedSha: state?.sha ?? null, syncedAt: state?.at ?? null, originSha: origin, behind, aligned: state !== null && !behind && origin !== null, message };
}

export interface SyncOutcome {
  sha: string;
  created: boolean;
  applied: string[];
  renamed: string[];
  failed: { name: string; error: string }[];
}

/**
 * Sync with main: fetch, move the AWE worktree to main, build `awe_world` from the base SQL if it is
 * missing (or `rebuild`), then run what main's update files add, in the order the server runs them. The state (sha) is
 * recorded only when every file ran; a failure names the file and leaves the files before it applied.
 */
export async function syncMain(ports: MainSyncPorts, db: SyncDb, server: SyncServer, rebuild = false): Promise<SyncOutcome> {
  const settings = loadSyncSettings(ports.kv);
  const sha = await mainSha(ports, settings, true);
  await updateWorktree(ports, settings);
  const created = await ensureWorldFromBase(db, ports.run, settings, server, AWE_DB, rebuild);
  const files = await (ports.collect ?? collectUpdateFiles)(settings.worktreeDir);
  const plan = await planFor(db, AWE_DB, files);
  const { applied, renamed, failed } = await applyPlan(db, AWE_DB, plan, undefined, cliImporter(ports.run, settings.mysqlBin, server, AWE_DB), true);
  ports.kv.set(STATE_KEY, JSON.stringify({ sha, at: ports.now().toISOString() } satisfies SyncState));
  return { sha, created, applied, renamed, failed };
}
