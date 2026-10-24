import type { Issue } from '@core/validate/validate';
import type { Result } from './result';

/** One field of a DBC record: its name and the letter that says how it is read (see `core/game/dbc-file.ts`) */
export interface DbcFieldInfo {
  name: string;
  kind: 'n' | 'u' | 'i' | 'f' | 's' | 'x';
}

/** A record as the editor sees it: the project's version if it changed or made it, else the file's */
export interface DbcRowView {
  id: number;
  values: (number | string)[];
  state: 'file' | 'changed' | 'new';
}

export interface DbcFileInfo {
  file: string;
  title: string;
  fields: DbcFieldInfo[];
  /** Records in the server's copy; null when the file was not found */
  count: number | null;
}

export interface ClientPatchOptions {
  /** Where the files go; by default a new folder inside the export folder. Never the server's own dbc folder. */
  folder?: string;
  /** The client patch archive's name; `patch-CZZZ.MPQ` by default. It must load after `patch-CZZ`. */
  patchName?: string;
  /** Write the client patch archive too (default), or only the server files */
  mpq?: boolean;
}

export interface ClientPatchResult {
  folder: string;
  /** The server DBC files written, to copy over the server's own (keep the originals as .bak) */
  dbcFiles: { file: string; path: string; records: number; changed: number; added: number }[];
  /** The client patch archive; null when it was not asked for */
  mpqPath: string | null;
  patchName: string;
  /** The project's SQL patch, written beside the usual patches; null when the project has no rows to write */
  sql: { applyPath: string; revertPath: string; warnings: string[] } | null;
  /** What to do with the files, one line each */
  notes: string[];
  /** Problems found in the edited records that did not stop the export */
  issues: Issue[];
}

/** A spell as an AI client or a script sees it: every field by name, and what it does in words */
export interface SpellReading {
  id: number;
  state: 'file' | 'changed' | 'new';
  /** Every field of the record by name; effect fields end in 1, 2 or 3 */
  fields: Record<string, number | string>;
  summary: { name: string; rank: string; cast: string; effects: string[] };
  issues: Issue[];
}

/** The DBC files the editor changes: read the server's copy, hold edits in the project, and write them out as files */
export interface DbcApi {
  /** The tables the editor opens, with the number of records the server's copy has */
  dbcFiles(): Promise<Result<{ dir: string | null; reason: string | null; files: DbcFileInfo[] }>>;
  /** Records found by id or by the words in their text (project edits laid over the file), best matches first; `total` counts all matches */
  dbcSearch(file: string, text: string, limit: number): Promise<Result<{ rows: DbcRowView[]; total: number }>>;
  /** One record by id, or null */
  dbcRecord(file: string, id: number): Promise<Result<{ row: DbcRowView | null }>>;
  /** Every record of a small file (at most 20,000); the large ones are searched instead */
  dbcTable(file: string): Promise<Result<{ rows: DbcRowView[] }>>;
  /** An id that no record of the file, no `spell_dbc` row (spells) and no edit of the project uses: the first free one from `from`, else after the highest */
  dbcFreeId(file: string, from?: number): Promise<Result<{ id: number }>>;
  /** Holds a record in the project (one undo step); spells are checked first and refused with their problems when one is an error */
  dbcSetRecord(file: string, values: (number | string)[]): Promise<Result<{ id: number; issues: Issue[] }>>;
  /** Puts a record back as the file has it, or drops one made in the project */
  dbcRemoveRecord(file: string, id: number): Promise<Result<true>>;
  /** Checks a record without holding it: the problems found, for spells with their ids, tables and ranges */
  dbcCheck(file: string, values: (number | string)[]): Promise<Result<{ issues: Issue[] }>>;
  /** A spell by id (the project's version if it changed it) with every field by name, a summary in words and its problems */
  spellRead(id: number): Promise<Result<SpellReading>>;
  /** Changes fields of a spell by name (for example Name, ManaCost, EffectBasePoints1) and holds it in the project; the spell is checked and refused with its problems when one is an error */
  spellEdit(id: number, changes: Record<string, number | string>): Promise<Result<{ id: number; issues: Issue[] }>>;
  /** Makes a new spell from an existing one, under `id` or the first free id after the highest, and holds it in the project */
  spellClone(baseId: number, id?: number, name?: string): Promise<Result<{ id: number; issues: Issue[] }>>;
  /** Writes the project's DBC edits as server files and a client patch archive, plus the SQL patch when the project has rows */
  exportClientPatch(options?: ClientPatchOptions): Promise<Result<ClientPatchResult>>;
}
