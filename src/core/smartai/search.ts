import type { RawRow } from '../db/types';
import { rowsOrNone } from '../db/rows-or-none';
import type { WorldDb } from '../db/world-db';
import { ACTIONS, EVENTS, TARGETS } from './catalogue';
import { sentenceOf } from './describe';
import { fromRaw, numberOf, rowKey } from './row';
import type { ParamKind, TypeDef } from './types';

/**
 * "Who uses this?": the script rows that run an action, or that name a spell, creature, quest, item,
 * object or text group in any event, action or target parameter. Filters are ANDed.
 */
export interface ScriptSearch {
  /** `action_type` */
  action?: number;
  /** `event_type` */
  event?: number;
  spell?: number;
  creature?: number;
  gameobject?: number;
  quest?: number;
  item?: number;
  /** A `creature_text` group; pair with `entry` to say whose */
  textGroup?: number;
  /** Only scripts of this creature or object (also its action lists and spawn scripts) */
  entry?: number;
}

export interface ScriptHit {
  entryorguid: number;
  sourceType: number;
  id: number;
  eventType: number;
  actionType: number;
  targetType: number;
  comment: string;
  /** The row as a sentence */
  sentence: string;
  /** The creature or object the script belongs to, when it can be told (not for an action list of another owner's range) */
  owner: { kind: 'creature' | 'gameobject'; entry: number } | null;
}

export const SEARCH_LIMIT = 300;
const VALUE_KINDS = ['spell', 'creature', 'gameobject', 'quest', 'item', 'textGroup'] as const satisfies readonly ParamKind[];

type Reader = Pick<WorldDb, 'selectRows'>;

/** The (column, type) pairs where a parameter of this kind sits, over every event, action and target */
function placesOf(kind: ParamKind): { typeColumn: string; type: number; column: string }[] {
  const places: { typeColumn: string; type: number; column: string }[] = [];
  const scan = (list: readonly TypeDef[], typeColumn: string, prefix: string): void => {
    for (const def of list) def.params.forEach((p, i) => { if (p.kind === kind) places.push({ typeColumn, type: def.id, column: `${prefix}${i + 1}` }); });
  };
  scan(EVENTS, 'event_type', 'event_param');
  scan(ACTIONS, 'action_type', 'action_param');
  scan(TARGETS, 'target_type', 'target_param');
  return places;
}

const ownerOf = (entryorguid: number, sourceType: number): ScriptHit['owner'] =>
  sourceType === 0 && entryorguid > 0 ? { kind: 'creature', entry: entryorguid } : sourceType === 1 && entryorguid > 0 ? { kind: 'gameobject', entry: entryorguid } : sourceType === 9 && entryorguid >= 100 ? { kind: 'creature', entry: Math.floor(entryorguid / 100) } : null;

/** True when a search has at least one filter besides `entry` */
export const hasFilter = (q: ScriptSearch): boolean => Object.entries(q).some(([k, v]) => k !== 'entry' && v !== undefined);

export async function searchSmartScripts(db: Reader, q: ScriptSearch): Promise<{ hits: ScriptHit[]; capped: boolean }> {
  const sets: Map<string, RawRow>[] = [];
  const add = (rows: RawRow[]): void => {
    const seen = new Map<string, RawRow>();
    for (const r of rows) seen.set(rowKey(fromRaw(r)) + `/${numberOf(r, 'link')}`, r);
    sets.push(seen);
  };
  if (q.action !== undefined) add(await rowsOrNone(db, 'smart_scripts', { action_type: String(q.action) }));
  if (q.event !== undefined) add(await rowsOrNone(db, 'smart_scripts', { event_type: String(q.event) }));
  for (const kind of VALUE_KINDS) {
    const value = q[kind];
    if (value === undefined) continue;
    const rows: RawRow[] = [];
    for (const place of placesOf(kind)) rows.push(...(await rowsOrNone(db, 'smart_scripts', { [place.typeColumn]: String(place.type), [place.column]: String(value) })));
    add(rows);
  }
  if (sets.length === 0) return { hits: [], capped: false };
  const [first, ...rest] = sets;
  let rows = [...first!.entries()].filter(([key]) => rest.every((s) => s.has(key))).map(([, r]) => r);
  if (q.entry !== undefined) {
    const e = q.entry;
    rows = rows.filter((r) => {
      const id = numberOf(r, 'entryorguid');
      return numberOf(r, 'source_type') === 9 ? Math.floor(id / 100) === e : id === e;
    });
  }
  rows.sort((a, b) => numberOf(a, 'source_type') - numberOf(b, 'source_type') || numberOf(a, 'entryorguid') - numberOf(b, 'entryorguid') || numberOf(a, 'id') - numberOf(b, 'id'));
  const capped = rows.length > SEARCH_LIMIT;
  const hits = rows.slice(0, SEARCH_LIMIT).map((r): ScriptHit => {
    const row = fromRaw(r);
    const entryorguid = numberOf(row, 'entryorguid');
    const sourceType = numberOf(row, 'source_type');
    return {
      entryorguid, sourceType, id: numberOf(row, 'id'), eventType: numberOf(row, 'event_type'), actionType: numberOf(row, 'action_type'), targetType: numberOf(row, 'target_type'),
      comment: row.comment ?? '', sentence: sentenceOf(row), owner: ownerOf(entryorguid, sourceType),
    };
  });
  return { hits, capped };
}
