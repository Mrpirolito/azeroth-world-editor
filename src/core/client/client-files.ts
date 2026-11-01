import { archiveOrder } from './archive-order';
import { openMpq, type ByteSource, type MpqArchive } from './mpq';

export { archiveOrder };

/**
 * A game client's files, read through its MPQ archives in the order the client loads them: the
 * base archives, the locale's, then the patches by their suffix, the locale's patch of a suffix just
 * after the general one (patch-3, patch-enUS-3, patch-4 … patch-M), so a file comes from the
 * highest-priority archive that has it, as in game. Custom patches therefore outrank the stock locale
 * patches: Ascension and CoA ship their display tables in patch-M, over the stock ones in
 * patch-enUS-3. Patches in folders below `Data` (Ascension and CoA ship some there) sort among the
 * others by name.
 */

export interface ClientFs {
  /** A folder's entries; empty when it cannot be read. */
  list(dir: string): Promise<{ name: string; isDir: boolean }[]>;
  /** Throws when the file cannot be opened. */
  open(path: string): Promise<ByteSource>;
  readText(path: string): Promise<string | null>;
}

export interface ClientFiles {
  dataDir: string;
  locale: string;
  /** The archives that opened, relative to `dataDir`, lowest priority first. */
  archives: string[];
  /** The archives' names, sizes and times: another value means the client was patched. */
  fingerprint: string;
  read(path: string): Promise<Uint8Array | null>;
  close(): Promise<void>;
}


const isMpq = (name: string): boolean => name.toLowerCase().endsWith('.mpq');
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function openClient(dir: string, fs: ClientFs, onProblem?: (message: string) => void): Promise<ClientFiles | null> {
  const root = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  let dataDir: string;
  let clientDir: string;
  if ((await fs.list(`${root}/Data`)).length > 0) {
    dataDir = `${root}/Data`;
    clientDir = root;
  } else if ((await fs.list(root)).some((e) => !e.isDir && isMpq(e.name))) {
    dataDir = root;
    clientDir = root.slice(0, Math.max(0, root.lastIndexOf('/')));
  } else {
    return null;
  }

  const config = await fs.readText(`${clientDir}/WTF/Config.wtf`);
  const locale = /SET\s+locale\s+"([A-Za-z]{4})"/i.exec(config ?? '')?.[1] ?? 'enUS';

  const found: string[] = [];
  for (const entry of await fs.list(dataDir)) {
    if (!entry.isDir) {
      if (isMpq(entry.name)) found.push(entry.name);
      continue;
    }
    for (const inner of await fs.list(`${dataDir}/${entry.name}`)) if (!inner.isDir && isMpq(inner.name)) found.push(`${entry.name}/${inner.name}`);
  }

  const opened: { path: string; mpq: MpqArchive; stamp: string }[] = [];
  for (const path of archiveOrder(found, locale)) {
    let source: ByteSource | null = null;
    try {
      source = await fs.open(`${dataDir}/${path}`);
      opened.push({ path, mpq: await openMpq(source, path), stamp: `${path}:${source.size}:${source.modified ?? 0}` });
    } catch (error) {
      await source?.close?.().catch(() => {});
      onProblem?.(`${path} could not be opened: ${message(error)}`);
    }
  }
  if (opened.length === 0) return null;

  // Highest priority first, for lookups.
  const byPriority = [...opened].reverse();
  const reported = new Set<string>();
  return {
    dataDir,
    locale,
    archives: opened.map((o) => o.path),
    fingerprint: opened.map((o) => o.stamp).join('|'),
    async read(path) {
      for (const { path: archive, mpq } of byPriority) {
        const entry = mpq.find(path);
        if (entry === 'deleted') return null;
        if (!entry) continue;
        try {
          return await mpq.read(entry, path);
        } catch (error) {
          const key = path.toLowerCase();
          if (!reported.has(key)) {
            reported.add(key);
            onProblem?.(`${path} in ${archive} could not be read: ${message(error)}`);
          }
          return null;
        }
      }
      return null;
    },
    async close() {
      await Promise.all(opened.map((o) => o.mpq.close()));
    },
  };
}
