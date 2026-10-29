import type { ConnectSummary } from './connection';
import type { Result } from './result';

/** Where the server repo lives and how a pull request is made from it; each is a setting with a default for this machine */
export interface SyncSettings {
  /** The server repo clone that is fetched */
  repoDir: string;
  /** The worktree AWE owns, kept on main */
  worktreeDir: string;
  /** The folder the `awe-pr-<slug>` worktrees are made in */
  prWorktreeParent: string;
  /** The Python that runs the repo's SQL lint */
  python: string;
  /** The ref of main in the repo, such as `origin/main` */
  mainRef: string;
  /** The remote a pull request branch is pushed to */
  forkRemote: string;
  /** `owner/name` of the repo the pull request is made against */
  prRepo: string;
  /** The owner of the fork the branch is pushed to */
  prHeadOwner: string;
  /** The mysql client that imports the base SQL */
  mysqlBin: string;
}

export interface SyncStatus {
  settings: SyncSettings;
  /** The main commit awe_world was last aligned with; null before the first sync */
  syncedSha: string | null;
  syncedAt: string | null;
  /** Main now (as last fetched); null when the repo cannot be read */
  originSha: string | null;
  /** Main has moved since the last sync */
  behind: boolean;
  aligned: boolean;
  /** "Aligned with main @ <sha>", or what is wrong */
  message: string;
}

export interface SyncResult {
  sha: string;
  /** awe_world was made by this sync */
  created: boolean;
  /** The update files that ran, in order */
  applied: string[];
  renamed: string[];
  /** AWE is connected to awe_world now */
  connect: ConnectSummary;
  status: SyncStatus;
}

export interface PrCheck {
  name: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** A pull request made ready (branch and commit) but not pushed */
export interface PrPreview {
  slug: string;
  branch: string;
  worktree: string;
  /** Path inside the repo: `data/sql/updates/pending_db_world/rev_…sql` */
  file: string;
  title: string;
  body: string;
  sql: string;
  commit: string | null;
  checks: PrCheck[];
  /** Every check passed and the commit exists: it can be published */
  ok: boolean;
}

/** Syncing the editor with the server's main branch, and turning the project into a pull request against it */
export interface SyncApi {
  syncSettings(): Promise<Result<SyncSettings>>;
  syncSetSettings(patch: Partial<SyncSettings>): Promise<Result<SyncSettings>>;
  syncStatus(refresh?: boolean): Promise<Result<SyncStatus>>;
  /** Fetches main, applies its SQL updates to awe_world (built from the base SQL if missing or `rebuild`) and connects to it. */
  syncMain(rebuild?: boolean): Promise<Result<SyncResult>>;
  /** Writes the project's patch into a branch of a fresh worktree from main and commits it. Nothing is pushed. */
  exportPrPrepare(input: { title: string; slug?: string }): Promise<Result<PrPreview>>;
  /** Pushes the prepared branch and opens the pull request. Refused unless `confirm` is true. */
  exportPrPublish(input: { slug: string; confirm: boolean }): Promise<Result<{ url: string }>>;
}
