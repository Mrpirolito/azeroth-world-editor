const BASE = ['common', 'common-2', 'expansion', 'lichking'];
const LOCALE_BASE = ['backup', 'base', 'locale', 'speech', 'expansion-locale', 'expansion-speech', 'lichking-locale', 'lichking-speech'];
const LOCALE_FOLDER = /^[a-z]{2}[A-Z]{2}$/;

interface Ranked {
  path: string;
  group: number;
  /** Within the group: a known name's place, or a patch suffix. */
  key: string | number;
  sub: number;
}

/** The archives the client loads, lowest priority first; `paths` are relative to `Data`, with '/'. */
export function archiveOrder(paths: string[], locale: string): string[] {
  const loc = locale.toLowerCase();
  const ranked: Ranked[] = [];
  for (const path of paths) {
    const parts = path.split('/');
    if (parts.length > 2) continue;
    const folder = parts.length === 2 ? parts[0]! : '';
    const lower = parts.at(-1)!.toLowerCase();
    if (!lower.endsWith('.mpq')) continue;
    const stem = lower.slice(0, -4);
    if (folder === '') {
      if (stem === 'patch') ranked.push({ path, group: 2, key: '', sub: 0 });
      else if (stem.startsWith('patch-')) ranked.push({ path, group: 2, key: stem.slice(6).toUpperCase(), sub: 0 });
      else ranked.push({ path, group: 0, key: BASE.indexOf(stem), sub: 0 });
    } else if (folder.toLowerCase() === loc) {
      if (stem === `patch-${loc}`) ranked.push({ path, group: 2, key: '', sub: 2 });
      else if (stem.startsWith(`patch-${loc}-`)) ranked.push({ path, group: 2, key: stem.slice(`patch-${loc}-`.length).toUpperCase(), sub: 2 });
      else if (!stem.startsWith('patch')) ranked.push({ path, group: 1, key: LOCALE_BASE.indexOf(stem.endsWith(`-${loc}`) ? stem.slice(0, -loc.length - 1) : stem), sub: 0 });
    } else if (!LOCALE_FOLDER.test(folder) && (stem === 'patch' || stem.startsWith('patch-'))) {
      ranked.push({ path, group: 2, key: stem === 'patch' ? '' : stem.slice(6).toUpperCase(), sub: 1 });
    }
  }
  const compare = (a: Ranked, b: Ranked): number => {
    if (a.group !== b.group) return a.group - b.group;
    if (typeof a.key === 'number' && typeof b.key === 'number') {
      // Unknown names (-1) come first, by name.
      if (a.key !== b.key) return a.key - b.key;
    } else if (a.key !== b.key) {
      return String(a.key) < String(b.key) ? -1 : 1;
    }
    if (a.sub !== b.sub) return a.sub - b.sub;
    return a.path.toLowerCase() < b.path.toLowerCase() ? -1 : a.path.toLowerCase() > b.path.toLowerCase() ? 1 : 0;
  };
  return ranked.sort(compare).map((r) => r.path);
}
