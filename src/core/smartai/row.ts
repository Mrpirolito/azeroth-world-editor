import type { RawRow } from '../db/types';
import { COLUMNS } from './catalogue';

/**
 * A `smart_scripts` row as the database has it: column to text, with columns this editor does not
 * know kept as they were, so a row read and written back is the same row. The editor reads and sets
 * columns through `numberOf` and `withNumber`.
 */
export type SmartRow = Record<string, string | null>;

export const EVENT_LINK = 61;
export const SOURCE_TIMED_LIST = 9;
export const SOURCE_CREATURE = 0;
export const SOURCE_OBJECT = 1;

const num = (raw: string | null | undefined): number => {
  if (raw === null || raw === undefined) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

export const numberOf = (row: Readonly<SmartRow>, column: string): number => num(row[column]);

export const textOf = (row: Readonly<SmartRow>, column: string): string => row[column] ?? '';

/** The row with a column set; a number is written the way MySQL would print it */
export function withColumn(row: Readonly<SmartRow>, column: string, value: number | string): SmartRow {
  return { ...row, [column]: typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '0') : value };
}

export function withColumns(row: Readonly<SmartRow>, values: Readonly<Record<string, number | string>>): SmartRow {
  let out: SmartRow = { ...row };
  for (const [column, value] of Object.entries(values)) out = withColumn(out, column, value);
  return out;
}

/** A row as the database returned it, kept whole (a NULL stays NULL) */
export const fromRaw = (row: RawRow): SmartRow => ({ ...row });

/** Where the row lives: its script, and its place in it */
export const ownerKey = (row: Readonly<SmartRow>): string => `${numberOf(row, 'entryorguid')}/${numberOf(row, 'source_type')}`;
export const rowKey = (row: Readonly<SmartRow>): string => `${ownerKey(row)}/${numberOf(row, 'id')}`;

/** A fresh row with every column the editor knows at its default */
export function blankRow(entryorguid: number, sourceType: number, id: number): SmartRow {
  const row: SmartRow = {};
  for (const column of COLUMNS) row[column] = column === 'comment' ? '' : '0';
  return withColumns(row, { entryorguid, source_type: sourceType, id, event_chance: 100, target_type: 1 });
}

/** The rows of one script (an `entryorguid` and a `source_type`), by id */
export function rowsOfOwner(rows: readonly SmartRow[], entryorguid: number, sourceType: number): SmartRow[] {
  return rows.filter((r) => numberOf(r, 'entryorguid') === entryorguid && numberOf(r, 'source_type') === sourceType).sort((a, b) => numberOf(a, 'id') - numberOf(b, 'id'));
}

export interface ScriptOwner {
  entryorguid: number;
  sourceType: number;
}

/** The scripts the rows make up, the creature or object itself first, then spawn scripts, then action lists */
export function ownersOf(rows: readonly SmartRow[]): ScriptOwner[] {
  const seen = new Map<string, ScriptOwner>();
  for (const r of rows) seen.set(ownerKey(r), { entryorguid: numberOf(r, 'entryorguid'), sourceType: numberOf(r, 'source_type') });
  const rank = (o: ScriptOwner): number => (o.sourceType === SOURCE_TIMED_LIST ? 2 : o.entryorguid < 0 ? 1 : 0);
  return [...seen.values()].sort((a, b) => rank(a) - rank(b) || a.entryorguid - b.entryorguid);
}

/** One step chain: the row that has the event, then the rows its `link` leads to, in order */
export interface Card {
  rows: SmartRow[];
}

/**
 * The rows of one script as cards. A card starts at a row no other row links to and follows `link`
 * through the rows it names. A row reached twice is shown once, in the first card; a loop stops.
 */
export function cardsOf(scriptRows: readonly SmartRow[]): Card[] {
  const byId = new Map<number, SmartRow>();
  for (const r of scriptRows) if (!byId.has(numberOf(r, 'id'))) byId.set(numberOf(r, 'id'), r);
  const linked = new Set<number>();
  for (const r of scriptRows) {
    const link = numberOf(r, 'link');
    if (link > 0 && link !== numberOf(r, 'id') && byId.has(link)) linked.add(link);
  }
  const shown = new Set<SmartRow>();
  const cards: Card[] = [];
  const follow = (head: SmartRow): void => {
    const chain: SmartRow[] = [];
    for (let at: SmartRow | undefined = head; at && !shown.has(at); at = byId.get(numberOf(at, 'link'))) {
      shown.add(at);
      chain.push(at);
    }
    cards.push({ rows: chain });
  };
  const sorted = [...scriptRows].sort((a, b) => numberOf(a, 'id') - numberOf(b, 'id'));
  for (const r of sorted) if (!linked.has(numberOf(r, 'id')) && !shown.has(r)) follow(r);
  // Whatever is left is in a loop or reachable only through one: show each as a card of its own
  for (const r of sorted) if (!shown.has(r)) follow(r);
  return cards;
}

/** The lowest id above every id the script uses (and every id a row links to) */
export function nextId(rows: readonly SmartRow[], entryorguid: number, sourceType: number): number {
  let top = -1;
  for (const r of rowsOfOwner(rows, entryorguid, sourceType)) top = Math.max(top, numberOf(r, 'id'), numberOf(r, 'link'));
  return top + 1;
}

/**
 * The timed action list ids an owner calls: its own `entry * 100 + n` range plus every list a
 * call-action-list action names.
 */
export function listsCalled(rows: readonly SmartRow[]): number[] {
  const ids = new Set<number>();
  for (const r of rows) {
    const action = numberOf(r, 'action_type');
    if (action === 80) ids.add(numberOf(r, 'action_param1'));
    else if (action === 87) for (let i = 1; i <= 6; i += 1) ids.add(numberOf(r, `action_param${i}`));
    else if (action === 88) for (let id = numberOf(r, 'action_param1'); id <= numberOf(r, 'action_param2') && id - numberOf(r, 'action_param1') < 100; id += 1) ids.add(id);
  }
  ids.delete(0);
  return [...ids].sort((a, b) => a - b);
}

/** Two row lists hold the same rows (any order), comparing every column as text */
export function sameRowSets(a: readonly Readonly<SmartRow>[], b: readonly Readonly<SmartRow>[]): boolean {
  const norm = (row: Readonly<SmartRow>): string => JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k] ?? null]));
  const left = a.map(norm).sort();
  const right = b.map(norm).sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

/** Add a row that starts a new card, with the first free id of the script */
export function addCard(rows: readonly SmartRow[], entryorguid: number, sourceType: number): { rows: SmartRow[]; added: SmartRow } {
  const id = nextId(rows, entryorguid, sourceType);
  const fresh = blankRow(entryorguid, sourceType, id);
  // A timed list row ticks on its own timer; a creature or object script waits for something to happen
  const first = sourceType === SOURCE_TIMED_LIST ? { event_type: 0 } : sourceType === SOURCE_OBJECT ? { event_type: 64 } : { event_type: 4 };
  const added = withColumns(fresh, first);
  return { rows: [...rows, added], added };
}

/** Add a row to an action list, after the others */
export function addListRow(rows: readonly SmartRow[], listId: number): { rows: SmartRow[]; added: SmartRow } {
  const added = withColumns(blankRow(listId, SOURCE_TIMED_LIST, nextId(rows, listId, SOURCE_TIMED_LIST)), { event_type: 0 });
  return { rows: [...rows, added], added };
}

/** Add a step after the last row of a card: a linked row in an ordinary script, a row of its own in a list */
export function addStep(rows: readonly SmartRow[], last: Readonly<SmartRow>): { rows: SmartRow[]; added: SmartRow } {
  const entryorguid = numberOf(last, 'entryorguid');
  const sourceType = numberOf(last, 'source_type');
  if (sourceType === SOURCE_TIMED_LIST) return addListRow(rows, entryorguid);
  const id = nextId(rows, entryorguid, sourceType);
  const added = withColumns(blankRow(entryorguid, sourceType, id), { event_type: EVENT_LINK });
  const next = rows.map((r) => (r === last ? withColumn(r, 'link', id) : r));
  return { rows: [...next, added], added };
}

/** Remove a row; the row that linked to it links to what it linked to, so the chain stays whole */
export function removeRow(rows: readonly SmartRow[], row: Readonly<SmartRow>): SmartRow[] {
  const owner = ownerKey(row);
  const id = numberOf(row, 'id');
  const onward = numberOf(row, 'link');
  return rows
    .filter((r) => r !== row)
    .map((r) => (ownerKey(r) === owner && numberOf(r, 'link') === id && r !== row ? withColumn(r, 'link', onward === id ? 0 : onward) : r));
}

/** Start a new, empty timed action list for an owner: the id the call names, with one row */
export function addList(rows: readonly SmartRow[], listId: number): { rows: SmartRow[]; added: SmartRow } {
  const added = withColumns(blankRow(listId, SOURCE_TIMED_LIST, 0), { event_type: 0 });
  return { rows: [...rows, added], added };
}

/** The columns an event, an action and a target keep their type and parameters in */
export const TYPE_COLUMNS = {
  event: { type: 'event_type', params: 'event_param', count: 6 },
  action: { type: 'action_type', params: 'action_param', count: 6 },
  target: { type: 'target_type', params: 'target_param', count: 4 },
} as const;

/** The row with another event, action or target type; its parameters go back to 0, as they meant something else */
export function withType(row: Readonly<SmartRow>, kind: keyof typeof TYPE_COLUMNS, id: number): SmartRow {
  const { type, params, count } = TYPE_COLUMNS[kind];
  const values: Record<string, number> = { [type]: id };
  for (let i = 1; i <= count; i += 1) values[`${params}${i}`] = 0;
  return withColumns(row, values);
}

export function withParam(row: Readonly<SmartRow>, kind: keyof typeof TYPE_COLUMNS, index: number, value: number): SmartRow {
  return withColumn(row, `${TYPE_COLUMNS[kind].params}${index + 1}`, value);
}

export function paramsOf(row: Readonly<SmartRow>, kind: keyof typeof TYPE_COLUMNS): number[] {
  const { params, count } = TYPE_COLUMNS[kind];
  return Array.from({ length: count }, (_, i) => numberOf(row, `${params}${i + 1}`));
}
