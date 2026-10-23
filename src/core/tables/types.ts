import { z } from 'zod';
import type { Bit, Choice } from '../smartai/types';

/**
 * Table editors that need no code of their own: a table is described as data (`TableSpec`), and one
 * sheet, one writer and one validator work for all of them. The columns, flags and enums come from
 * AzerothCore's schema; the wording is this project's own.
 */

/** One database row as text (`null` is SQL NULL) */
export type Row = Record<string, string | null>;

/** What a field holds, which decides the control it gets */
export type FieldType =
  | { type: 'int'; min?: number; max?: number; zero?: string }
  | { type: 'float'; min?: number; max?: number; zero?: string }
  | { type: 'text'; long?: boolean }
  | { type: 'enum'; options: readonly Choice[] }
  | { type: 'flags'; bits: readonly Bit[] }
  /** An id picked by name: an item, creature, object, quest or spell */
  | { type: 'ref'; kind: 'item' | 'creature' | 'gameobject' | 'quest' | 'spell' }
  | { type: 'bool' }
  /** A few bits of a packed number column (a byte of `bytes1`), as a number or a named choice */
  | { type: 'part'; shift: number; width: number; options?: readonly Choice[] };

export type Field = FieldType & {
  column: string;
  label: string;
  help?: string;
  /** The column may be NULL: left empty it is written as NULL, the server's own default */
  nullable?: boolean;
  /** Shown only while another column of the row holds one of these values (a game object's type) */
  when?: { column: string; in: readonly number[] };
  /** The section of the sheet it sits in; the first group is shown, `Advanced` is folded away */
  group?: string;
};

/** Who owns the rows: an NPC, an object, an item, or nobody (a table browsed on its own) */
export type TableOwner = 'creature' | 'gameobject' | 'item' | 'standalone';

export interface TableSpec {
  table: string;
  /** What it is called in the editor */
  title: string;
  /** One sentence on what the table does */
  blurb: string;
  owner: TableOwner;
  /** The columns that say whose rows these are: the owner's entry under the first, or what the author picks */
  scope: readonly string[];
  /** The columns that identify one row, scope included; a row is deleted and written by these */
  pk: readonly string[];
  /** Many rows under one scope, or exactly one */
  multi: boolean;
  /** Columns that are changed on the owner's own template row instead of written as rows of their own (`creature_template`) */
  overlay?: boolean;
  fields: readonly Field[];
  /** The columns a text search looks in, besides the id; standalone tables only */
  search?: readonly string[];
  /** The column that names a row in a list, standalone tables only */
  nameColumn?: string;
  /** Loot tables: rows have chance, group and item columns the loot editor understands */
  loot?: boolean;
  /** A row's default values for a new row under a scope */
  blank?: Row;
  /** The next new row, given the rows held; the columns of the scope are filled in after */
  next?(rows: readonly Row[]): Row;
  /** Buttons that take a line from the game's broadcast texts and set the columns it fills (all rows of the sheet, each its own) */
  pickText?: readonly { label: string; fill(picked: Row): Row }[];
  /** The rows this sheet owns: others under the same scope belong to another editor and are neither shown nor written */
  own?(row: Row): boolean;
  /** Rows are made for something that already exists (a spawn's guid), not for a new id */
  existingOnly?: boolean;
  /** For a loot table of an owner: the template column that holds the loot id, which is the owner's entry when it is 0 */
  via?: { table: string; column: string };
}

/**
 * Rows the project holds for one table under one scope: what the database had (`original`, put back on
 * revert) and what the author wants (`rows`). Written as the rows of the scope replaced.
 */
export const rowSchema = z.record(z.string(), z.string().nullable());
export const rowSetSchema = z.object({
  table: z.string(),
  scope: z.record(z.string(), z.string()),
  original: z.array(rowSchema),
  rows: z.array(rowSchema),
  /** The NPC, object or item whose editor holds it, so it leaves with it; absent for a table browsed on its own */
  owner: z.object({ kind: z.enum(['creature', 'gameobject', 'item']), entry: z.number().int() }).optional(),
});
export type RowSet = z.infer<typeof rowSetSchema>;

/** Stable identity of a set: its table and scope */
export const setKey = (table: string, scope: Readonly<Record<string, string>>): string =>
  `${table}:${Object.keys(scope).sort().map((c) => `${c}=${scope[c]}`).join(',')}`;
