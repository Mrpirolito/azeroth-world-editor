import { join, relative, resolve, isAbsolute } from 'node:path';
import { applyEdit, findEdit, findRecord, withRecord, withoutRecord, type DbcEdit } from '../../core/dbc/edits';
import { patchNameIssue, DEFAULT_PATCH_NAME } from '../../core/dbc/patch-name';
import { storeSize, type ProjectEntities } from '../../core/entities/model';
import { rowsOrNone } from '../../core/links/context';
import type { Dbc, DbcValue } from '../../core/game/dbc-file';
import { DBC_LAYOUTS, layoutOf, SPELL_FIELDS, SPELL_INDEX, type DbcLayout } from '../../core/game/dbc-formats';
import { buildLookups, type DbcRow, type SpellLookups } from '../../core/spells/lookups';
import { castSentence, effectSentences } from '../../core/spells/describe';
import { cloneSpell, spellText, withSpell } from '../../core/spells/model';
import { spellIssues } from '../../core/spells/validate';
import type { Issue } from '../../core/validate/validate';
import { hasWorldChanges } from '../../core/world/layer';
import type { ClientPatchResult, DbcApi, DbcRowView, ExportApi } from '../../shared/ipc';
import { buildMpqArchive } from '../mpq-writer';
import { fail, run } from './errors';
import type { Session } from './connection';
import type { Services } from './services';

/** Files this small are sent whole; the others are searched */
const SMALL_TABLE_LIMIT = 20_000;
const SPELL_FILE = 'Spell.dbc';
/** The small files the spell editor's pickers read */
const LOOKUP_FILES = { castTimes: 'SpellCastTimes.dbc', ranges: 'SpellRange.dbc', durations: 'SpellDuration.dbc', radii: 'SpellRadius.dbc', icons: 'SpellIcon.dbc' } as const;

/** A record's values checked against its layout: whole numbers in range, floats finite, text for strings */
export function coerceRecord(layout: DbcLayout, values: readonly DbcValue[]): DbcValue[] {
  if (values.length !== layout.fields.length) throw fail('BAD_REQUEST', `A ${layout.file} record has ${layout.fields.length} values, not ${values.length}.`);
  return layout.fields.map((f, i) => {
    const v = values[i]!;
    if (f.kind === 's') {
      if (typeof v !== 'string') throw fail('BAD_REQUEST', `${f.name} must be text.`);
      return v;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) throw fail('BAD_REQUEST', `${f.name} must be a number.`);
    if (f.kind === 'f') return v;
    if (!Number.isInteger(v)) throw fail('BAD_REQUEST', `${f.name} must be a whole number.`);
    if (f.kind === 'i' ? v < -(2 ** 31) || v > 2 ** 31 - 1 : v < 0 || v > 2 ** 32 - 1) throw fail('BAD_REQUEST', `${f.name} is out of range.`);
    return v;
  });
}

/** Whether `child` is `parent` or inside it */
const isInside = (child: string, parent: string): boolean => {
  const rel = relative(resolve(parent).toLowerCase(), resolve(child).toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

export function createDbcApi(s: Services, exportSql: ExportApi['exportProject']): DbcApi {
  const { deps, connected, projectEntities, putEntities, asOneStep } = s.ctx;
  const { dbcOf, readDbc } = s.files;

  const layoutFor = (file: string): DbcLayout => {
    const l = layoutOf(file);
    if (!l) throw fail('BAD_REQUEST', `${file} has no layout in the editor. Open one of: ${DBC_LAYOUTS.map((x) => x.file).join(', ')}.`);
    return l;
  };
  const fileFor = async (live: Session, l: DbcLayout): Promise<Dbc> => {
    const d = await dbcOf(live, l.file);
    if ('reason' in d) throw fail('BAD_REQUEST', d.reason);
    return d;
  };
  const editsOf = (): readonly DbcEdit[] => projectEntities().dbcEdits ?? [];
  const store = (edits: DbcEdit[]): ProjectEntities => {
    const { dbcEdits: _old, ...rest } = projectEntities();
    return edits.length > 0 ? { ...rest, dbcEdits: edits } : rest;
  };

  const view = (l: DbcLayout, d: Dbc, row: number): DbcRowView => {
    const id = d.word(row, 0);
    const held = findRecord(editsOf(), l.file, id);
    return held ? { id, values: held.values, state: held.was ? 'changed' : 'new' } : { id, values: d.decode(row, l.format), state: 'file' };
  };
  const heldView = (r: { id: number; values: DbcValue[]; was: DbcValue[] | null }): DbcRowView => ({ id: r.id, values: r.values, state: r.was ? 'changed' : 'new' });

  /** Every record of a file with the project's edits laid over it, by id */
  const allRows = (l: DbcLayout, d: Dbc): DbcRowView[] => {
    const held = new Map((findEdit(editsOf(), l.file)?.records ?? []).map((r) => [r.id, r]));
    const rows: DbcRowView[] = [];
    for (let r = 0; r < d.count; r += 1) {
      const id = d.word(r, 0);
      const h = held.get(id);
      rows.push(h ? heldView(h) : { id, values: d.decode(r, l.format), state: 'file' });
      held.delete(id);
    }
    for (const h of held.values()) rows.push(heldView(h));
    return rows;
  };

  const rowsFor = async (live: Session, file: string): Promise<DbcRow[]> => {
    const l = layoutFor(file);
    const d = await dbcOf(live, l.file);
    if ('reason' in d) return [];
    return allRows(l, d).map((r) => ({ id: r.id, values: r.values }));
  };

  const lookupsOf = async (live: Session): Promise<SpellLookups> => {
    const [castTimes, ranges, durations, radii, icons] = await Promise.all(Object.values(LOOKUP_FILES).map((f) => rowsFor(live, f)));
    return buildLookups({ castTimes, ranges, durations, radii, icons });
  };

  /** Ids of `spell_dbc` rows, in the database and in the project's sheets */
  const spellDbcIds = async (live: Session): Promise<Set<number>> => {
    const ids = new Set<number>();
    for (const row of await rowsOrNone(live.db, 'spell_dbc', {})) ids.add(Number(row.ID));
    for (const set of projectEntities().rowsets ?? []) {
      if (set.table !== 'spell_dbc') continue;
      for (const row of set.rows) ids.add(Number(row.ID ?? set.scope.ID));
    }
    return ids;
  };

  const spellContext = async (live: Session, id: number, wasInFile: boolean) => {
    const spells = await fileFor(live, layoutFor(SPELL_FILE));
    const extra = await spellDbcIds(live);
    const held = findEdit(editsOf(), SPELL_FILE);
    const exists = (n: number): boolean => spells.rowOfId(n) !== undefined || extra.has(n) || (held?.records.some((r) => r.id === n) ?? false);
    return {
      lookups: await lookupsOf(live),
      spellExists: exists,
      // A record made here clashes with a spell of the file or of spell_dbc; the project's own record of this id is itself
      idTaken: (n: number): boolean => spells.rowOfId(n) !== undefined || extra.has(n),
      isNew: !wasInFile && id > 0,
    };
  };

  const check = async (live: Session, l: DbcLayout, values: DbcValue[]): Promise<Issue[]> => {
    if (l.file !== SPELL_FILE) return [];
    const d = await fileFor(live, l);
    const id = Number(values[0]);
    return spellIssues(values, await spellContext(live, id, d.rowOfId(id) !== undefined));
  };

  const maxIdCache = new WeakMap<Dbc, number>();
  const maxId = (d: Dbc): number => {
    let max = maxIdCache.get(d);
    if (max === undefined) {
      max = 0;
      for (let r = 0; r < d.count; r += 1) max = Math.max(max, d.word(r, 0));
      maxIdCache.set(d, max);
    }
    return max;
  };

  const freeId = async (live: Session, l: DbcLayout, from?: number): Promise<number> => {
    const d = await fileFor(live, l);
    const taken = l.file === SPELL_FILE ? await spellDbcIds(live) : new Set<number>();
    const held = new Set((findEdit(editsOf(), l.file)?.records ?? []).map((r) => r.id));
    const high = Math.max(maxId(d), ...taken, ...held);
    let id = Math.max(1, from ?? high + 1);
    while (d.rowOfId(id) !== undefined || taken.has(id) || held.has(id)) id += 1;
    if (id > 0xffffffff) throw fail('RANGE_EXHAUSTED', `${l.file} has no free id from ${from ?? high + 1} up.`);
    return id;
  };

  const hold = async (live: Session, l: DbcLayout, values: DbcValue[]): Promise<{ id: number; issues: Issue[] }> => {
    const d = await fileFor(live, l);
    const clean = coerceRecord(l, values);
    const id = Number(clean[0]);
    if (id < 1) throw fail('BAD_REQUEST', 'The id must be at least 1.');
    const issues = await check(live, l, clean);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) throw fail('BAD_REQUEST', `The record has problems: ${errors.map((e) => e.message).join(' ')}`);
    const row = d.rowOfId(id);
    const was = row === undefined ? null : d.decode(row, l.format);
    putEntities(store(withRecord(editsOf(), l.file, id, clean, was)));
    return { id, issues };
  };

  const nameOf = (l: DbcLayout, values: readonly DbcValue[]): string => (l.file === SPELL_FILE ? spellText(values, 'Name') : '');

  /** Fields searched by words: a spell's name and rank, else every string */
  const searchFields = (l: DbcLayout): number[] => {
    if (l.file === SPELL_FILE) return [SPELL_INDEX.Name!, SPELL_INDEX.Rank!];
    return l.fields.flatMap((f, i) => (f.kind === 's' ? [i] : []));
  };

  const rank = (needle: string, texts: readonly string[]): number => {
    let best = 3;
    for (const t of texts) {
      const lower = t.toLowerCase();
      if (lower === needle) return 0;
      if (lower.startsWith(needle)) best = Math.min(best, 1);
      else if (lower.includes(needle)) best = Math.min(best, 2);
    }
    return best;
  };

  return {
    dbcFiles: () =>
      run(async () => {
        const live = connected();
        const dir = live.serverData?.status.dir ?? null;
        const files = await Promise.all(
          DBC_LAYOUTS.map(async (l) => {
            // Only files already read are counted: reading all of them would load hundreds of megabytes to draw a list
            const d = live.dbcFiles?.get(l.file.toLowerCase());
            const read = d ? await d : null;
            return { file: l.file, title: l.title, fields: l.fields.map((f) => ({ name: f.name, kind: f.kind })), count: read && !('reason' in read) ? read.count : null };
          }),
        );
        return { dir, reason: dir ? null : 'Set the server data folder in the connection profile to open the DBC files.', files };
      }),

    dbcSearch: (file, text, limit) =>
      run(async () => {
        const live = connected();
        const l = layoutFor(file);
        const d = await fileFor(live, l);
        const needle = text.trim().toLowerCase();
        const held = new Map((findEdit(editsOf(), l.file)?.records ?? []).map((r) => [r.id, r]));
        if (/^\d+$/.test(needle)) {
          const id = Number(needle);
          const h = held.get(id);
          const row = d.rowOfId(id);
          const found = h ? heldView(h) : row !== undefined ? view(l, d, row) : null;
          return { rows: found ? [found] : [], total: found ? 1 : 0 };
        }
        if (needle === '') {
          const rows: DbcRowView[] = [...held.values()].map(heldView);
          for (let r = 0; r < d.count && rows.length < limit; r += 1) if (!held.has(d.word(r, 0))) rows.push({ id: d.word(r, 0), values: d.decode(r, l.format), state: 'file' });
          return { rows: rows.slice(0, limit), total: d.count + [...held.values()].filter((h) => !h.was).length };
        }
        const fields = searchFields(l);
        const hits: { rank: number; id: number; row: number | null; edit: DbcEdit['records'][number] | null }[] = [];
        for (let r = 0; r < d.count; r += 1) {
          const id = d.word(r, 0);
          if (held.has(id)) continue;
          const q = rank(needle, fields.map((f) => d.stringAt(d.word(r, f))));
          if (q < 3) hits.push({ rank: q, id, row: r, edit: null });
        }
        for (const h of held.values()) {
          const q = rank(needle, fields.map((f) => String(h.values[f] ?? '')));
          if (q < 3) hits.push({ rank: q, id: h.id, row: null, edit: h });
        }
        hits.sort((a, b) => a.rank - b.rank || a.id - b.id);
        const rows = hits.slice(0, limit).map((h) => (h.edit ? heldView(h.edit) : view(l, d, h.row!)));
        return { rows, total: hits.length };
      }),

    dbcRecord: (file, id) =>
      run(async () => {
        const live = connected();
        const l = layoutFor(file);
        const d = await fileFor(live, l);
        const h = findRecord(editsOf(), l.file, id);
        if (h) return { row: heldView(h) };
        const row = d.rowOfId(id);
        return { row: row === undefined ? null : view(l, d, row) };
      }),

    dbcTable: (file) =>
      run(async () => {
        const live = connected();
        const l = layoutFor(file);
        const d = await fileFor(live, l);
        if (d.count > SMALL_TABLE_LIMIT) throw fail('BAD_REQUEST', `${l.file} has ${d.count} records, too many to list; search it.`);
        return { rows: allRows(l, d) };
      }),

    dbcFreeId: (file, from) =>
      run(async () => {
        const live = connected();
        return { id: await freeId(live, layoutFor(file), from) };
      }),

    dbcCheck: (file, values) =>
      run(async () => {
        const live = connected();
        const l = layoutFor(file);
        return { issues: await check(live, l, coerceRecord(l, values)) };
      }),

    dbcSetRecord: (file, values) =>
      run(async () => {
        const live = connected();
        const l = layoutFor(file);
        return asOneStep(() => hold(live, l, [...values]), `${l.file} ${values[0]}${nameOf(l, values) ? `: ${nameOf(l, values)}` : ''}`);
      }),

    dbcRemoveRecord: (file, id) =>
      run(async () => {
        const l = layoutFor(file);
        if (!findRecord(editsOf(), l.file, id)) throw fail('BAD_REQUEST', `The project holds no record ${id} of ${l.file}.`);
        await asOneStep(async () => putEntities(store(withoutRecord(editsOf(), l.file, id))), `${l.file} ${id}: put back`);
        return true as const;
      }),

    spellRead: (id) =>
      run(async () => {
        const live = connected();
        const l = layoutFor(SPELL_FILE);
        const d = await fileFor(live, l);
        const held = findRecord(editsOf(), SPELL_FILE, id);
        const row = d.rowOfId(id);
        if (!held && row === undefined) throw fail('BAD_REQUEST', `Spell ${id} is not in ${SPELL_FILE} or the project.`);
        const values = held ? held.values : d.decode(row!, l.format);
        const index = await s.files.spellsOf(live);
        const describe = { lookups: await lookupsOf(live), spellName: (n: number) => ('reason' in index ? undefined : index.get(n)?.name) };
        return {
          id, state: held ? (held.was ? 'changed' : 'new') : 'file',
          fields: Object.fromEntries(SPELL_FIELDS.map((f, i) => [f.name, values[i]!])),
          summary: { name: spellText(values, 'Name'), rank: spellText(values, 'Rank'), cast: castSentence(values, describe), effects: effectSentences(values, describe) },
          issues: await check(live, l, values),
        };
      }),

    spellEdit: (id, changes) =>
      run(async () => {
        const live = connected();
        const l = layoutFor(SPELL_FILE);
        const d = await fileFor(live, l);
        const held = findRecord(editsOf(), SPELL_FILE, id);
        const row = d.rowOfId(id);
        if (!held && row === undefined) throw fail('BAD_REQUEST', `Spell ${id} is not in ${SPELL_FILE} or the project; clone one with spellClone first.`);
        const unknown = Object.keys(changes).filter((name) => !(name in SPELL_INDEX));
        if (unknown.length > 0) throw fail('BAD_REQUEST', `Spell.dbc has no field ${unknown.join(', ')}. Read the spell to see the field names.`);
        if ('ID' in changes) throw fail('BAD_REQUEST', 'The id of a spell is changed by cloning it to another id.');
        const base = held ? held.values : d.decode(row!, l.format);
        return asOneStep(() => hold(live, l, withSpell(base, changes)), `Spell ${id}: ${Object.keys(changes).join(', ')}`);
      }),

    spellClone: (baseId, id, name) =>
      run(async () => {
        const live = connected();
        const l = layoutFor(SPELL_FILE);
        const d = await fileFor(live, l);
        const held = findRecord(editsOf(), SPELL_FILE, baseId);
        const row = d.rowOfId(baseId);
        if (!held && row === undefined) throw fail('BAD_REQUEST', `Spell ${baseId} is not in ${SPELL_FILE} or the project (a spell only in spell_dbc cannot be cloned here).`);
        const base = held ? held.values : d.decode(row!, l.format);
        const newId = id ?? (await freeId(live, l));
        if (d.rowOfId(newId) !== undefined || findRecord(editsOf(), SPELL_FILE, newId) || (await spellDbcIds(live)).has(newId)) {
          throw fail('ID_COLLISION', `Spell id ${newId} is already used.`);
        }
        return asOneStep(() => hold(live, l, cloneSpell(base, newId, name)), `New spell ${newId} from ${baseId}`);
      }),

    exportClientPatch: (options) =>
      run(async () => {
        const live = connected();
        const edits = editsOf();
        const world = deps.session.world.get();
        const sqlNeeded = storeSize(projectEntities()) > 0 || hasWorldChanges(world);
        if (edits.length === 0 && !sqlNeeded) throw fail('BAD_REQUEST', 'The project changes no DBC record, table row or world detail, so there is nothing to export.');
        const patchName = options?.patchName ?? DEFAULT_PATCH_NAME;
        const wantMpq = (options?.mpq ?? true) && edits.length > 0;
        const nameProblem = wantMpq ? patchNameIssue(patchName) : null;
        if (nameProblem) throw fail('BAD_REQUEST', nameProblem);
        if (edits.length > 0 && !deps.fs.writeBytes) throw fail('BAD_REQUEST', 'This build cannot write binary files.');

        // Check every edited record first: nothing is written while one has an error
        const issues: Issue[] = [];
        for (const edit of edits) {
          const l = layoutFor(edit.file);
          for (const record of edit.records) {
            const found = await check(live, l, record.values);
            issues.push(...found.map((i) => ({ ...i, message: `${l.file} ${record.id}: ${i.message}` })));
          }
        }
        const errors = issues.filter((i) => i.severity === 'error');
        if (errors.length > 0) throw fail('BAD_REQUEST', `Fix these first: ${errors.slice(0, 5).map((e) => e.message).join(' ')}${errors.length > 5 ? ` (and ${errors.length - 5} more)` : ''}`);

        // Each file is read afresh and the edits put into the copy, so the session's own is never changed
        const built: { file: string; bytes: Uint8Array; changed: number; added: number; records: number }[] = [];
        for (const edit of edits) {
          const l = layoutFor(edit.file);
          const d = await readDbc(live, l.file);
          if ('reason' in d) throw fail('BAD_REQUEST', d.reason);
          const { changed, added } = applyEdit(d, l.format, edit);
          built.push({ file: l.file, bytes: d.serialize(), changed, added, records: d.count });
        }

        const outputDir = deps.exportDirOverride || live.exportDir || deps.defaultExportDir || deps.session.meta().outputDir;
        const stamp = deps.now().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
        const folder = options?.folder ? resolve(options.folder) : join(outputDir, 'client-patch', stamp);
        const serverDir = live.serverData?.status.dir;
        if (serverDir && (isInside(folder, join(serverDir, 'dbc')) || isInside(folder, serverDir))) {
          throw fail('BAD_REQUEST', "Pick a folder outside the server's data folder: the files are copied over the server's own by hand, after keeping the originals.");
        }

        const dbcFiles: ClientPatchResult['dbcFiles'] = [];
        const notes: string[] = [];
        if (built.length > 0) {
          await deps.fs.ensureDir(folder);
          const serverFolder = join(folder, 'server-dbc');
          await deps.fs.ensureDir(serverFolder);
          for (const b of built) {
            const path = join(serverFolder, b.file);
            await deps.fs.writeBytes!(path, b.bytes);
            dbcFiles.push({ file: b.file, path, records: b.records, changed: b.changed, added: b.added });
          }
          notes.push(`Copy the files of ${serverFolder} into the server's Data/dbc folder. First keep each original: rename it to <name>.dbc.bak (for example Spell.dbc.bak). Restart the world server afterwards.`);
        }
        let mpqPath: string | null = null;
        if (wantMpq) {
          const archive = await buildMpqArchive(built.map((b) => ({ path: `DBFilesClient\\${b.file}`, data: b.bytes })));
          mpqPath = join(folder, patchName);
          await deps.fs.writeBytes!(mpqPath, archive);
          notes.push(`Copy ${patchName} into each client's Data folder (keep any earlier ${patchName} as .bak). It loads after patch-CZZ, so its tables win. Close the client first.`);
        }
        if (built.length > 0) {
          const text = [
            'Client patch made by Azeroth World Editor',
            '',
            ...dbcFiles.map((f) => `${f.file}: ${f.changed} changed, ${f.added} added, ${f.records} records in all`),
            '',
            ...notes,
            '',
          ].join('\r\n');
          await deps.fs.writeFile(join(folder, 'INSTALL.txt'), text);
        }

        let sql: ClientPatchResult['sql'] = null;
        if (sqlNeeded) {
          const out = await exportSql();
          if (out.ok) {
            sql = { applyPath: out.value.applyPath, revertPath: out.value.revertPath, warnings: out.value.warnings };
            notes.push(`The SQL patch is ${out.value.applyPath}; apply it to the world database as usual.`);
          } else notes.push(`The SQL patch was not written: ${out.error.message}`);
        }
        return { folder, dbcFiles, mpqPath, patchName, sql, notes, issues };
      }),
  };
}
