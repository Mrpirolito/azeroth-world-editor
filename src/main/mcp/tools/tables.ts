import { z } from 'zod';
import { defineTool } from '../tool';

const table = z.string().min(1).max(64);
/** The columns a table is looked up by, with a value each: an entry, a spell id, a menu id */
const scope = z.record(z.string(), z.union([z.string(), z.number()]));
const cell = z.union([z.string(), z.number(), z.null()]);
const text = (v: string | number): string => String(v);
const scopeText = (s: Record<string, string | number>): Record<string, string> => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, text(v)]));
const where = (t: string, s: Record<string, string | number>): string => `${t} ${Object.values(s).join('/')}`;

/** The table sheets: every table the editor has a sheet for, read, changed through the project, previewed as SQL */
export const tableTools = [
  defineTool({
    name: 'table_specs',
    title: 'The tables with a sheet',
    description:
      'The tables the editor has a sheet for (loot lists, texts, creature extras, spells, teleports, formations, conditions...): what each is for, the columns that say whose rows these are (scope) and that key a row (pk), whether it holds one row or many, and every column with its label, type, named choices or bits and help. Give a table to read just that one. Use it before set_table_rows.',
    input: { table: table.optional() },
    write: false,
    run: ({ table }, ctx) => ctx.call('tableSpecs', table),
  }),
  defineTool({
    name: 'table_rows',
    title: 'Rows of a table: database and project',
    description:
      "A table's rows under a scope (for example creature_template_addon with scope {entry: 1423}) as the world database has them, as the project holds them (null when it holds none) and the problems found in the held ones. What the project holds is not in the database until it is exported as SQL.",
    input: { table, scope },
    write: false,
    run: ({ table, scope }, ctx) => ctx.call('tableHeld', table, scopeText(scope)),
  }),
  defineTool({
    name: 'search_table',
    title: 'Find rows of a table by id or words',
    description: 'Rows of a table with a sheet found by their id (a whole number) or by the words in their name or text columns, at most 30.',
    input: { table, text: z.string().max(200) },
    write: false,
    run: ({ table, text }, ctx) => ctx.call('searchTable', table, text),
  }),
  defineTool({
    name: 'set_table_rows',
    title: 'Set the rows of a table in the project',
    description:
      "Holds the rows a table should have under a scope (all of them: a sheet replaces the scope's rows) in the project, as one undo step. Columns left out take the table's blank defaults; the scope columns are filled in for you. Rows the same as the database's drop the change; rows with errors are refused with what to fix. Nothing is written to the database: export_project turns it into SQL. Use table_specs for the columns.",
    input: { table, scope, rows: z.array(z.record(z.string(), cell)).max(500) },
    write: { kind: 'step', label: ({ table, scope }: { table: string; scope: Record<string, string | number> }) => `AI: edit ${where(table, scope)}` },
    run: ({ table, scope, rows }, ctx) =>
      ctx.call('tableSet', table, scopeText(scope), rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? null : text(v)])))),
  }),
  defineTool({
    name: 'table_sql',
    title: 'The SQL a table sheet will write',
    description:
      "The SQL that writing a table's rows under a scope would run (deletes by key, then inserts) and the SQL that puts the database's rows back. Without `rows` it shows the rows the project holds; with them it shows what those rows would write. Nothing is run.",
    input: { table, scope, rows: z.array(z.record(z.string(), cell)).max(500).optional() },
    write: false,
    run: ({ table, scope, rows }, ctx) =>
      ctx.call('tableSql', table, scopeText(scope), rows?.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? null : text(v)])))),
  }),
  defineTool({
    name: 'sql_query',
    title: 'Read-only SQL on the world database',
    description:
      'Runs one SELECT, SHOW, DESCRIBE or EXPLAIN on the world database and answers its rows (at most 500). Anything that could change data is refused by the database layer. Use it to look at tables that have no sheet or to check what exists before building content.',
    input: { sql: z.string().min(1).max(20000) },
    write: false,
    run: ({ sql }, ctx) => ctx.call('sqlQuery', sql),
  }),
  defineTool({
    name: 'free_table_ids',
    title: 'Unused ids of a table column',
    description: 'The first `count` values of a column from `from` up that no row of the table holds yet (a gossip menu, a teleport, a pool...).',
    input: { table, column: z.string().min(1).max(64), from: z.number().int().min(0), count: z.number().int().min(1).max(100) },
    write: false,
    run: ({ table, column, from, count }, ctx) => ctx.call('freeIds', table, column, from, count),
  }),
];
