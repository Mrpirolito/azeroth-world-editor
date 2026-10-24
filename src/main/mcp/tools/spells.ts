import { z } from 'zod';
import { spellNum, spellText } from '../../../core/spells/model';
import type { DbcRowView } from '../../../shared/ipc';
import { defineTool } from '../tool';

const id = z.number().int().min(1);
const value = z.union([z.number(), z.string()]);
const file = z.string().min(5).max(64);

const SPELL_NOTE =
  ' Spells live in Spell.dbc; the project holds changes as records and export_client_patch writes the server file and a client patch. The spell_dbc, spell_proc, spell_linked_spell and other spell tables are separate (table_specs, set_table_rows).';

/** Spells and the other client tables (DBC files): read, change in the project, and export as files */
export const spellTools = [
  defineTool({
    name: 'search_spells',
    title: 'Search spells in Spell.dbc',
    description: 'Spells of Spell.dbc found by id or by the words in their name or rank, best matches first, with the project\'s edits laid over the file. state: file, changed (edited here) or new (made here).' + SPELL_NOTE,
    input: { text: z.string().max(200), limit: z.number().int().min(1).max(50).optional() },
    write: false,
    run: ({ text, limit }, ctx) => ctx.call('dbcSearch', 'Spell.dbc', text, limit ?? 20),
    present: (out: { rows: DbcRowView[]; total: number }) => ({
      total: out.total,
      spells: out.rows.map((r) => ({ id: r.id, name: spellText(r.values, 'Name'), rank: spellText(r.values, 'Rank'), icon: spellNum(r.values, 'SpellIconID'), state: r.state })),
    }),
  }),
  defineTool({
    name: 'read_spell',
    title: 'Read a spell',
    description:
      "One spell with every Spell.dbc field by name (effect fields end in 1, 2 or 3: Effect1, EffectBasePoints1, EffectImplicitTargetA1, EffectAura1...), a summary in plain words (how it is cast, one sentence per effect) and the problems found. EffectBasePoints is one less than the value shown to players; with EffectDieSides 1 a base of 99 is 100. Icons, cast times, ranges, durations and radii are ids of the small tables (dbc_search SpellIcon.dbc, SpellCastTimes.dbc, SpellRange.dbc, SpellDuration.dbc, SpellRadius.dbc)." + SPELL_NOTE,
    input: { id },
    write: false,
    run: ({ id }, ctx) => ctx.call('spellRead', id),
  }),
  defineTool({
    name: 'clone_spell',
    title: 'Clone a spell to a new id',
    description:
      'Makes a new spell as a copy of an existing one (in Spell.dbc or made in the project) under `id`, or under the first free id after the highest one of Spell.dbc, spell_dbc and the project when none is given. The copy is named "<name> (copy)" unless `name` is given. Change it afterwards with edit_spell.' + SPELL_NOTE,
    input: { baseId: id, id: id.optional(), name: z.string().max(100).optional() },
    write: { kind: 'step', label: ({ baseId, id }: { baseId: number; id?: number }) => `AI: clone spell ${baseId}${id ? ` to ${id}` : ''}` },
    run: ({ baseId, id, name }, ctx) => ctx.call('spellClone', baseId, id, name),
  }),
  defineTool({
    name: 'edit_spell',
    title: 'Change fields of a spell',
    description:
      'Changes fields of a spell by name and holds it in the project, for example {"Name": "Meteor", "ManaCost": 120, "EffectBasePoints1": 299, "EffectDieSides1": 1, "Effect2": 6, "EffectAura2": 3}. Numbers for numbers, text for Name, Rank, Description and ToolTip. The spell is checked first and refused with what is wrong (an unknown icon, cast time, range, duration or radius id; an aura effect without an aura type; a school mask over 127).' + SPELL_NOTE,
    input: { id, changes: z.record(z.string(), value) },
    write: { kind: 'step', label: ({ id }: { id: number }) => `AI: edit spell ${id}` },
    run: ({ id, changes }, ctx) => ctx.call('spellEdit', id, changes),
  }),
  defineTool({
    name: 'put_back_dbc_record',
    title: 'Put a client-table record back',
    description: 'Drops the project\'s change to a record of a DBC file (a spell, an icon...): it goes back to what the server file has, or disappears when the project made it.',
    input: { file, id: z.number().int().min(0) },
    write: { kind: 'step', label: ({ file, id }: { file: string; id: number }) => `AI: put back ${file} ${id}` },
    run: ({ file, id }, ctx) => ctx.call('dbcRemoveRecord', file, id),
  }),
  defineTool({
    name: 'dbc_tables',
    title: 'The client tables the editor opens',
    description: 'The DBC files the editor can read and change (Spell.dbc, SpellIcon.dbc, SpellRange.dbc, SpellCastTimes.dbc, SpellDuration.dbc, SpellRadius.dbc, Item.dbc, ItemDisplayInfo.dbc, Faction.dbc, AreaTable.dbc) with every field of a record in order.',
    input: {},
    write: false,
    run: (_args, ctx) => ctx.call('dbcFiles'),
  }),
  defineTool({
    name: 'dbc_search',
    title: 'Search a client table',
    description: 'Records of a DBC file found by id or by the words in their text fields (with no text, the first records), with the project\'s changes laid over the file. Values come in the order dbc_tables gives the fields.',
    input: { file, text: z.string().max(200), limit: z.number().int().min(1).max(100).optional() },
    write: false,
    run: ({ file, text, limit }, ctx) => ctx.call('dbcSearch', file, text, limit ?? 20),
  }),
  defineTool({
    name: 'dbc_record',
    title: 'Read a client-table record',
    description: 'One record of a DBC file by id, with the project\'s change laid over it, or null.',
    input: { file, id: z.number().int().min(0) },
    write: false,
    run: ({ file, id }, ctx) => ctx.call('dbcRecord', file, id),
  }),
  defineTool({
    name: 'set_dbc_record',
    title: 'Set a client-table record',
    description:
      'Holds a whole record of a DBC file in the project: `values` in the order dbc_tables gives the fields (numbers; text for string fields), the id first. Changes an existing record or adds a new one (use dbc_free_id for the id). Spells are better changed with edit_spell.',
    input: { file, values: z.array(value).min(1).max(300) },
    write: { kind: 'step', label: ({ file, values }: { file: string; values: unknown[] }) => `AI: set ${file} ${String(values[0])}` },
    run: ({ file, values }, ctx) => ctx.call('dbcSetRecord', file, values),
  }),
  defineTool({
    name: 'dbc_free_id',
    title: 'A free id in a client table',
    description: 'An id no record of the DBC file uses (for Spell.dbc: also no spell_dbc row and no project spell), the first free one from `from`, else after the highest.',
    input: { file, from: z.number().int().min(0).optional() },
    write: false,
    run: ({ file, from }, ctx) => ctx.call('dbcFreeId', file, from),
  }),
  defineTool({
    name: 'export_client_patch',
    title: 'Export the client patch',
    description:
      "Writes what the project changes in the client tables: the server's DBC files (to copy over the server's own by hand, keeping the originals as .bak), a client patch archive named patch-CZZZ.MPQ by default (it must load after patch-CZZ), an INSTALL.txt, and the SQL patch when the project has table rows. Files go to a new folder in the export folder, or to `folder`; never into the server's data folder. Records with errors stop the export and are listed.",
    input: { folder: z.string().max(500).optional(), patchName: z.string().max(40).optional(), mpq: z.boolean().optional() },
    write: { kind: 'step', label: () => 'AI: export client patch' },
    run: ({ folder, patchName, mpq }, ctx) => ctx.call('exportClientPatch', { ...(folder ? { folder } : {}), ...(patchName ? { patchName } : {}), ...(mpq !== undefined ? { mpq } : {}) }),
  }),
];
