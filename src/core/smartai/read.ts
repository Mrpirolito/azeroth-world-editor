import { rowsOrNone } from '../db/rows-or-none';
import type { WorldDb } from '../db/world-db';
import { listsCalled, numberOf, fromRaw, SOURCE_CREATURE, SOURCE_OBJECT, SOURCE_TIMED_LIST, type SmartRow } from './row';

type Reader = Pick<WorldDb, 'selectRows'>;
const LIST_SLOTS = 100;
const MAX_PASSES = 4;

/** The kind of owner a script belongs to, as the editors name them */
export type OwnerKind = 'creature' | 'gameobject';

/** A script owner's `source_type` */
export const sourceOf = (kind: OwnerKind): number => (kind === 'creature' ? SOURCE_CREATURE : SOURCE_OBJECT);

/** The spawn guids of an object entry, ascending; empty when the database has no `gameobject` table */
export async function objectSpawnGuids(db: Reader, entry: number): Promise<number[]> {
  const rows = await rowsOrNone(db, 'gameobject', { id: String(entry) });
  return [...new Set(rows.map((r) => Number(r.guid)).filter(Number.isFinite))].sort((a, b) => a - b);
}

/**
 * Everything the database runs for one creature or object: its own script (`entryorguid` = entry),
 * the scripts of its spawns (the negative guid), and every timed action list those scripts call
 * (its own `entry * 100 + n` range, and any other list named by a call action), however deep.
 */
export async function readSmartScripts(db: Reader, kind: OwnerKind, entry: number, spawnGuids: readonly number[] = []): Promise<SmartRow[]> {
  const source = sourceOf(kind);
  const owners = [entry, ...spawnGuids.map((g) => -g)].map(String);
  const found: SmartRow[] = (await rowsOrNone(db, 'smart_scripts', { entryorguid: owners, source_type: String(source) })).map(fromRaw);
  const range = Array.from({ length: LIST_SLOTS }, (_, i) => entry * LIST_SLOTS + i);
  const have = new Set<number>();
  let want = new Set<number>([...range, ...listsCalled(found)]);
  for (let pass = 0; pass < MAX_PASSES && want.size > 0; pass += 1) {
    const rows = (await rowsOrNone(db, 'smart_scripts', { entryorguid: [...want].map(String), source_type: String(SOURCE_TIMED_LIST) })).map(fromRaw);
    for (const id of want) have.add(id);
    found.push(...rows);
    want = new Set(listsCalled(rows).filter((id) => !have.has(id)));
  }
  const negative = (r: SmartRow): number => (numberOf(r, 'entryorguid') < 0 ? 1 : 0);
  return found.sort((a, b) => numberOf(a, 'source_type') - numberOf(b, 'source_type') || negative(a) - negative(b) || numberOf(a, 'entryorguid') - numberOf(b, 'entryorguid') || numberOf(a, 'id') - numberOf(b, 'id'));
}

/** One line of a creature's `creature_text`, for previewing what a text group says */
export interface TextLine {
  group: number;
  id: number;
  text: string;
}

export async function readTexts(db: Reader, creature: number): Promise<TextLine[]> {
  const rows = await rowsOrNone(db, 'creature_text', { CreatureID: String(creature) });
  return rows.map((r) => ({ group: Number(r.GroupID), id: Number(r.ID), text: r.Text ?? '' })).sort((a, b) => a.group - b.group || a.id - b.id);
}
