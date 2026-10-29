import { createHash } from 'node:crypto';

/** The state AzerothCore records for an update, by the folder it came from */
export type UpdateState = 'RELEASED' | 'PENDING' | 'CUSTOM' | 'MODULE';

export interface UpdateFile {
  /** The file name: the key of the `updates` table, unique across every folder */
  name: string;
  path: string;
  state: UpdateState;
}

export interface Planned {
  file: UpdateFile;
  hash: string;
  why: 'new' | 'changed';
}

export interface UpdatePlan {
  apply: Planned[];
  /** Files that are an applied update under a new name (same hash, old file gone): only the record moves */
  renames: { from: string; file: UpdateFile; hash: string }[];
}

/** AzerothCore's hash of an update: SHA1 of the file, upper-case hex */
export const hashOf = (content: string | Uint8Array): string => createHash('sha1').update(content).digest('hex').toUpperCase();

/** Two folders hold a file of one name, which AzerothCore refuses because updates are ordered by name */
export class DuplicateUpdateError extends Error {
  constructor(readonly name: string, readonly paths: [string, string]) {
    super(`Duplicate update file name "${name}": ${paths[0]} and ${paths[1]}. Updates are ordered by name, so every name must be unique.`);
    this.name = 'DuplicateUpdateError';
  }
}

/** The order AzerothCore applies updates in: by file name over all folders together (a std::set keyed by name) */
export function orderUpdates(files: readonly UpdateFile[]): UpdateFile[] {
  const seen = new Map<string, UpdateFile>();
  for (const f of files) {
    const other = seen.get(f.name);
    if (other) throw new DuplicateUpdateError(f.name, [other.path, f.path]);
    seen.set(f.name, f);
  }
  return [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * What to run, as AzerothCore's updater decides: a file not recorded is new; one recorded under another
 * hash is run again; a new name whose hash is a recorded update whose own file is gone is a rename.
 */
export function planUpdates(files: readonly UpdateFile[], applied: ReadonlyMap<string, string>, hashFile: (f: UpdateFile) => string): UpdatePlan {
  const ordered = orderUpdates(files);
  const present = new Set(ordered.map((f) => f.name));
  const nameByHash = new Map<string, string>();
  for (const [name, hash] of applied) nameByHash.set(hash, name);
  const plan: UpdatePlan = { apply: [], renames: [] };
  for (const file of ordered) {
    const recorded = applied.get(file.name);
    const hash = hashFile(file);
    if (recorded === hash) continue;
    if (recorded !== undefined) {
      plan.apply.push({ file, hash, why: 'changed' });
      continue;
    }
    const from = nameByHash.get(hash);
    if (from !== undefined && !present.has(from)) {
      plan.renames.push({ from, file, hash });
      nameByHash.delete(hash);
    } else plan.apply.push({ file, hash, why: 'new' });
  }
  return plan;
}

/** The state AzerothCore gives each folder; module folders are any `db-world` under `modules/*\/data/sql` */
export const STATE_OF_DIR: Readonly<Record<string, UpdateState>> = {
  'data/sql/updates/db_world': 'RELEASED',
  'data/sql/updates/pending_db_world': 'PENDING',
  'data/sql/custom/db_world': 'CUSTOM',
};
