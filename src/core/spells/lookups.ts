import type { DbcValue } from '../game/dbc-file';

/**
 * The small tables a spell points at (cast times, ranges, durations, radii, icons), as maps by id with readable
 * labels. Each row is the values its layout reads (`dbc-formats.ts`).
 */

export interface DbcRow {
  id: number;
  values: DbcValue[];
}

export interface CastTime { base: number; perLevel: number; minimum: number }
export interface Range { minHostile: number; minFriendly: number; maxHostile: number; maxFriendly: number; flags: number; name: string }
export interface Duration { base: number; perLevel: number; maximum: number }
export interface Radius { radius: number; perLevel: number; maximum: number }

export interface SpellLookups {
  castTimes: ReadonlyMap<number, CastTime>;
  ranges: ReadonlyMap<number, Range>;
  durations: ReadonlyMap<number, Duration>;
  radii: ReadonlyMap<number, Radius>;
  icons: ReadonlyMap<number, string>;
}

const n = (row: DbcRow, i: number): number => Number(row.values[i] ?? 0);

export interface LookupTables {
  castTimes?: readonly DbcRow[];
  ranges?: readonly DbcRow[];
  durations?: readonly DbcRow[];
  radii?: readonly DbcRow[];
  icons?: readonly DbcRow[];
}

export function buildLookups(tables: LookupTables): SpellLookups {
  const map = <T>(rows: readonly DbcRow[] | undefined, make: (row: DbcRow) => T): Map<number, T> => new Map((rows ?? []).map((r) => [r.id, make(r)]));
  return {
    castTimes: map(tables.castTimes, (r) => ({ base: n(r, 1), perLevel: n(r, 2), minimum: n(r, 3) })),
    ranges: map(tables.ranges, (r) => ({ minHostile: n(r, 1), minFriendly: n(r, 2), maxHostile: n(r, 3), maxFriendly: n(r, 4), flags: n(r, 5), name: String(r.values[6] ?? '') })),
    durations: map(tables.durations, (r) => ({ base: n(r, 1), perLevel: n(r, 2), maximum: n(r, 3) })),
    radii: map(tables.radii, (r) => ({ radius: n(r, 1), perLevel: n(r, 2), maximum: n(r, 3) })),
    icons: map(tables.icons, (r) => String(r.values[1] ?? '')),
  };
}

const round = (x: number): string => String(Math.round(x * 100) / 100);

/** Milliseconds as "1.5 s", "2 min" */
export function timeLabel(ms: number): string {
  if (ms >= 60000 && ms % 1000 === 0) return `${round(ms / 60000)} min`;
  if (ms >= 1000 || ms === 0) return `${round(ms / 1000)} s`;
  return `${ms} ms`;
}

export function castTimeLabel(l: SpellLookups, id: number): string {
  const c = l.castTimes.get(id);
  if (!c) return id === 0 ? 'None' : `Unknown (${id})`;
  return c.base === 0 && c.perLevel === 0 ? 'Instant' : `${timeLabel(c.base)} cast`;
}

export function durationLabel(l: SpellLookups, id: number): string {
  const d = l.durations.get(id);
  if (!d) return id === 0 ? 'None' : `Unknown (${id})`;
  if (d.base === -1) return 'Until cancelled';
  return d.base === 0 ? 'Instant' : timeLabel(d.base);
}

export function rangeLabel(l: SpellLookups, id: number): string {
  const r = l.ranges.get(id);
  if (!r) return id === 0 ? 'None' : `Unknown (${id})`;
  const hostile = r.minHostile > 0 ? `${round(r.minHostile)}-${round(r.maxHostile)} yd` : `${round(r.maxHostile)} yd`;
  const friendly = r.maxFriendly !== r.maxHostile || r.minFriendly !== r.minHostile ? `, friendly ${r.minFriendly > 0 ? `${round(r.minFriendly)}-` : ''}${round(r.maxFriendly)} yd` : '';
  return `${r.name ? `${r.name} · ` : ''}${hostile}${friendly}`;
}

export function radiusLabel(l: SpellLookups, id: number): string {
  const r = l.radii.get(id);
  if (!r) return id === 0 ? 'None' : `Unknown (${id})`;
  return `${round(r.radius)} yd${r.perLevel > 0 ? ` (+${round(r.perLevel)} per level, up to ${round(r.maximum)})` : ''}`;
}

/** An icon's file name without folders or extension */
export function iconName(l: SpellLookups, id: number): string {
  const path = l.icons.get(id);
  if (path === undefined) return id === 0 ? 'None' : `Unknown (${id})`;
  return path.slice(path.lastIndexOf('\\') + 1).replace(/\.blp$/i, '') || path;
}

/** The icon's path in the client's archives, with the folder and extension a bare name lacks */
export function iconClientPath(l: SpellLookups, id: number): string | null {
  const path = l.icons.get(id);
  if (!path) return null;
  const p = path.replace(/\//g, '\\');
  return /\.blp$/i.test(p) ? p : `${p}.blp`;
}
