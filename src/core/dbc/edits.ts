import { z } from 'zod';
import type { Dbc, DbcValue } from '../game/dbc-file';

/**
 * Changes to the server's DBC files, held in the project beside its other changes (and so undone with them). A
 * record is held whole, as the values its file's layout reads (`Dbc.decode`), with the record the file had
 * (`was`, null for one made here) so it can be put back and shown as a difference.
 */

export const dbcValueSchema = z.union([z.number().finite(), z.string()]);
export const dbcRecordEditSchema = z.object({
  id: z.number().int().min(0).max(0xffffffff),
  values: z.array(dbcValueSchema),
  was: z.array(dbcValueSchema).nullable(),
});
export const dbcEditSchema = z.object({ file: z.string().min(1), records: z.array(dbcRecordEditSchema) });

export type DbcRecordEdit = z.infer<typeof dbcRecordEditSchema>;
export type DbcEdit = z.infer<typeof dbcEditSchema>;

const sameValues = (a: readonly DbcValue[], b: readonly DbcValue[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

const fileKey = (file: string): string => file.toLowerCase();

export function findEdit(edits: readonly DbcEdit[] | undefined, file: string): DbcEdit | undefined {
  return edits?.find((e) => fileKey(e.file) === fileKey(file));
}

/** The record the project holds for an id of a file, if it changed or made one */
export function findRecord(edits: readonly DbcEdit[] | undefined, file: string, id: number): DbcRecordEdit | undefined {
  return findEdit(edits, file)?.records.find((r) => r.id === id);
}

/**
 * The edits with this record held: `was` is the record the file has (null when it has none), kept from the first
 * edit. A record put back to what the file has is dropped, and so is a file left with no records.
 */
export function withRecord(edits: readonly DbcEdit[] | undefined, file: string, id: number, values: readonly DbcValue[], was: readonly DbcValue[] | null): DbcEdit[] {
  const held = findRecord(edits, file, id);
  const origin = held ? held.was : was;
  const rest = (edits ?? []).filter((e) => fileKey(e.file) !== fileKey(file));
  const mine = (findEdit(edits, file)?.records ?? []).filter((r) => r.id !== id);
  const records = origin && sameValues(origin, values) ? mine : [...mine, { id, values: [...values], was: origin ? [...origin] : null }].sort((a, b) => a.id - b.id);
  return records.length > 0 ? [...rest, { file: findEdit(edits, file)?.file ?? file, records }] : rest;
}

/** The edits without a record: it goes back to what the file has, or disappears when it was made here */
export function withoutRecord(edits: readonly DbcEdit[] | undefined, file: string, id: number): DbcEdit[] {
  const rest = (edits ?? []).filter((e) => fileKey(e.file) !== fileKey(file));
  const mine = (findEdit(edits, file)?.records ?? []).filter((r) => r.id !== id);
  return mine.length > 0 ? [...rest, { file: findEdit(edits, file)!.file, records: mine }] : rest;
}

/** How many records the project changes or adds, over all files */
export const editCount = (edits: readonly DbcEdit[] | undefined): number => (edits ?? []).reduce((n, e) => n + e.records.length, 0);

/** The values of the fields that differ between two records of one layout, by index */
export function changedFields(a: readonly DbcValue[], b: readonly DbcValue[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) if (a[i] !== b[i]) out.push(i);
  return out;
}

/** Puts a file's edits into the file: changed records over the ones it has, made ones at the end. Returns how many were added. */
export function applyEdit(dbc: Dbc, format: string, edit: DbcEdit): { changed: number; added: number } {
  let added = 0;
  for (const record of edit.records) {
    if (dbc.upsert(record.id, record.values, format)) added += 1;
  }
  return { changed: edit.records.length - added, added };
}
