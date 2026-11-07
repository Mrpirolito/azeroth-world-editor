import { nextExportSequence } from '../export/sequence';
import { patchFileName } from '../export/render-patch';

export const PENDING_DIR = 'data/sql/updates/pending_db_world';

/** `data/sql/updates/pending_db_world/rev_<yyyymmdd>_<nn>_<slug>.sql`: nn is one past the highest of that date already in main */
export function prFilePath(existingNames: readonly string[], date: string, slug: string): { name: string; path: string; sequence: number } {
  const sequence = nextExportSequence(existingNames, date);
  const name = patchFileName({ date, sequence, topic: slug });
  return { name, path: `${PENDING_DIR}/${name}`, sequence };
}
