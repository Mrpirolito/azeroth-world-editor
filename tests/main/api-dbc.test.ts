import { describe, expect, it } from 'vitest';
import { createApi } from '../../src/main/api';
import { openStore } from '../../src/main/store/store';
import { createProjectSession } from '../../src/main/project/session';
import { defaultProjectMeta } from '../../src/main/project/project-file';
import type { ProjectController } from '../../src/main/project/controller';
import type { ServerDataFiles } from '../../src/main/server-data';
import { openMpq } from '../../src/core/client/mpq';
import { Dbc, type DbcValue } from '../../src/core/game/dbc-file';
import { layoutOf, SPELL_FORMAT } from '../../src/core/game/dbc-formats';
import { blankSpell, spellNum, spellText, withEffect, withSpell } from '../../src/core/spells/model';
import { forkDbWith } from '../helpers/fixtures';
import { bytesSource } from '../helpers/mpq-file';

const box = { encrypt: (s: string) => Uint8Array.from(Buffer.from(s)), decrypt: (b: Uint8Array) => Buffer.from(b).toString() };

const dbcFile = (file: string, rows: DbcValue[][]): Uint8Array => {
  const l = layoutOf(file)!;
  const d = Dbc.empty(l.fields.length);
  for (const r of rows) d.append(r, l.format);
  return d.serialize();
};
const fireball = (id: number, name: string): DbcValue[] =>
  withEffect(withSpell(blankSpell(id), { Name: name, Rank: 'Rank 1', SchoolMask: 4, CastingTimeIndex: 4, RangeIndex: 2, SpellIconID: 136, DurationIndex: 5, ManaCost: 30 }), 0, { effect: 2, basePoints: 13, dieSides: 6, targetA: 6 });

const DBC: Record<string, Uint8Array> = {
  'Spell.dbc': dbcFile('Spell.dbc', [fireball(133, 'Fireball'), fireball(143, 'Fireball Two'), fireball(500, 'Frostbolt')]),
  'SpellIcon.dbc': dbcFile('SpellIcon.dbc', [[136, 'Interface\\Icons\\Spell_Fire_FlameBolt'], [137, 'Interface\\Icons\\Spell_Frost_FrostBolt02']]),
  'SpellCastTimes.dbc': dbcFile('SpellCastTimes.dbc', [[1, 0, 0, 0], [4, 1500, 0, 1000]]),
  'SpellRange.dbc': dbcFile('SpellRange.dbc', [[2, 0, 0, 30, 30, 0, 'Long Range', ...Array(33).fill(0)]]),
  'SpellDuration.dbc': dbcFile('SpellDuration.dbc', [[5, 300000, 0, 300000]]),
  'SpellRadius.dbc': dbcFile('SpellRadius.dbc', [[7, 8, 0, 8]]),
};
const dbcFiles = (): ServerDataFiles => ({
  isDir: async (d) => d === '/data',
  read: async (d, name) => (d.replace(/\\/g, '/') === '/data/dbc' ? (DBC[name] ?? null) : null),
});

async function setup(options: { spellDbcIds?: number[] } = {}) {
  const db = forkDbWith(['spell_dbc']);
  for (const id of options.spellDbcIds ?? []) db.insert('spell_dbc', { ID: String(id), Name_Lang_enUS: 'Server only' });
  const written = new Map<string, Uint8Array | string>();
  const session = createProjectSession(defaultProjectMeta('P', 'C:\\out'));
  const api = createApi({
    store: openStore(':memory:', box), openWorldDb: async () => db, openDevDb: async () => { throw new Error('x'); },
    fs: {
      writeFile: async (p: string, t: string) => { written.set(p, t); },
      writeBytes: async (p: string, b: Uint8Array) => { written.set(p, b); },
      ensureDir: async () => {},
      listDir: async () => [],
    },
    now: () => new Date('2026-10-23T10:00:00Z'), session, projects: {} as ProjectController, serverDataFiles: dbcFiles(),
  });
  const rec: any = await api.saveProfile({ name: 'w', role: 'world', host: 'h', port: 1, user: 'u', database: 'd', password: 'p', dbcDir: '/data' });
  await api.connect(rec.value.id);
  return { api, written, session };
}

describe('the DBC editor through the API', () => {
  it('lists the tables and counts the ones already read', async () => {
    const { api } = await setup();
    const before: any = await api.dbcFiles();
    expect(before.value.dir).toBe('/data');
    expect(before.value.files.map((f: any) => f.file)).toContain('SpellIcon.dbc');
    expect(before.value.files.find((f: any) => f.file === 'Spell.dbc').count).toBeNull();
    await api.dbcSearch('Spell.dbc', 'fire', 10);
    expect(((await api.dbcFiles()) as any).value.files.find((f: any) => f.file === 'Spell.dbc').count).toBe(3);
  });

  it('searches by id and by words, best matches first, and reads one record', async () => {
    const { api } = await setup();
    const byName: any = await api.dbcSearch('Spell.dbc', 'fireball', 10);
    expect(byName.value.rows.map((r: any) => r.id)).toEqual([133, 143]);
    expect(byName.value.total).toBe(2);
    expect(((await api.dbcSearch('Spell.dbc', '500', 10)) as any).value.rows[0].values[136]).toBe('Frostbolt');
    expect(((await api.dbcSearch('Spell.dbc', 'nope', 10)) as any).value.rows).toEqual([]);
    expect(((await api.dbcRecord('Spell.dbc', 133)) as any).value.row).toMatchObject({ id: 133, state: 'file' });
    expect(((await api.dbcRecord('Spell.dbc', 9)) as any).value.row).toBeNull();
    expect(((await api.dbcSearch('Nothing.dbc', 'x', 10)) as any).error.code).toBe('BAD_REQUEST');
    expect(((await api.dbcSearch('Faction.dbc', 'x', 10)) as any).error.message).toMatch(/not in/);
  });

  it('gives a small table whole, and refuses nothing it holds', async () => {
    const { api } = await setup();
    const icons: any = await api.dbcTable('SpellIcon.dbc');
    expect(icons.value.rows).toEqual([
      { id: 136, values: [136, 'Interface\\Icons\\Spell_Fire_FlameBolt'], state: 'file' },
      { id: 137, values: [137, 'Interface\\Icons\\Spell_Frost_FrostBolt02'], state: 'file' },
    ]);
  });

  it('finds a free spell id: not in the file, not in spell_dbc, not in the project', async () => {
    const { api } = await setup({ spellDbcIds: [501, 502] });
    expect(((await api.dbcFreeId('Spell.dbc')) as any).value.id).toBe(503);
    expect(((await api.dbcFreeId('Spell.dbc', 133)) as any).value.id).toBe(134);
    expect(((await api.dbcFreeId('Spell.dbc', 500)) as any).value.id).toBe(503);
    const cloned: any = await api.spellClone(133);
    expect(cloned.value.id).toBe(503);
    expect(((await api.dbcFreeId('Spell.dbc')) as any).value.id).toBe(504);
  });

  it('clones a spell into the project as one undo step, named as a copy, and shows it as new', async () => {
    const { api, session } = await setup();
    const out: any = await api.spellClone(133, 90001);
    expect(out.value).toEqual({ id: 90001, issues: [] });
    const stored = session.entities.get().dbcEdits![0]!;
    expect(stored.file).toBe('Spell.dbc');
    expect(spellText(stored.records[0]!.values, 'Name')).toBe('Fireball (copy)');
    expect(stored.records[0]!.was).toBeNull();
    expect(((await api.dbcRecord('Spell.dbc', 90001)) as any).value.row.state).toBe('new');
    expect(((await api.dbcSearch('Spell.dbc', 'copy', 5)) as any).value.rows.map((r: any) => r.id)).toEqual([90001]);
    expect(((await api.spellClone(133, 133)) as any).error.code).toBe('ID_COLLISION');
    expect(((await api.spellClone(777)) as any).error.message).toMatch(/not in Spell.dbc/);
    expect(((await api.historyUndo()) as any).value.step).not.toBeNull();
    expect(session.entities.get().dbcEdits).toBeUndefined();
  });

  it('holds an edited record with the file record kept, and puts it back', async () => {
    const { api, session } = await setup();
    const row: any = (await api.dbcRecord('Spell.dbc', 133) as any).value.row;
    const edited = withSpell(row.values, { Name: 'Fireball!', ManaCost: 45 });
    expect(((await api.dbcSetRecord('Spell.dbc', edited)) as any).value.id).toBe(133);
    const held = session.entities.get().dbcEdits![0]!.records[0]!;
    expect(spellNum(held.values, 'ManaCost')).toBe(45);
    expect(spellText(held.was!, 'Name')).toBe('Fireball');
    expect(((await api.dbcRecord('Spell.dbc', 133)) as any).value.row.state).toBe('changed');
    expect(((await api.dbcRemoveRecord('Spell.dbc', 133)) as any).value).toBe(true);
    expect(session.entities.get().dbcEdits).toBeUndefined();
    expect(((await api.dbcRemoveRecord('Spell.dbc', 133)) as any).error.code).toBe('BAD_REQUEST');
  });

  it('refuses a record with a bad value or a spell with errors, saying what is wrong', async () => {
    const { api, session } = await setup();
    const base: any = (await api.dbcRecord('Spell.dbc', 133) as any).value.row.values;
    expect(((await api.dbcSetRecord('Spell.dbc', base.slice(0, 10))) as any).error.message).toMatch(/has 234 values/);
    expect(((await api.dbcSetRecord('Spell.dbc', withSpell(base, { ManaCost: -3 }))) as any).error.message).toMatch(/ManaCost is out of range/);
    const badIcon: any = await api.dbcSetRecord('Spell.dbc', withSpell(base, { SpellIconID: 4242 }));
    expect(badIcon.error.message).toMatch(/Icon 4242 is not in the client's tables/);
    expect(session.entities.get().dbcEdits).toBeUndefined();
    const checked: any = await api.dbcCheck('Spell.dbc', withSpell(base, { SpellIconID: 4242, Name: '' }));
    expect(checked.value.issues.map((i: any) => i.code)).toEqual(['SPELL_NAME', 'SPELL_REF']);
  });

  it('edits the other tables with the same machinery', async () => {
    const { api, session } = await setup();
    const out: any = await api.dbcSetRecord('SpellIcon.dbc', [999, 'Interface\\Icons\\New']);
    expect(out.value.id).toBe(999);
    const table: any = await api.dbcTable('SpellIcon.dbc');
    expect(table.value.rows.map((r: any) => [r.id, r.state])).toEqual([[136, 'file'], [137, 'file'], [999, 'new']]);
    expect(session.entities.get().dbcEdits![0]!.file).toBe('SpellIcon.dbc');
  });
});

describe('exporting a client patch', () => {
  it('writes the server files, an archive the client reads, and a note', async () => {
    const { api, written } = await setup();
    await api.spellClone(133, 90001);
    const row: any = (await api.dbcRecord('Spell.dbc', 143) as any).value.row;
    await api.dbcSetRecord('Spell.dbc', withSpell(row.values, { ManaCost: 99 }));
    const out: any = await api.exportClientPatch({ folder: 'C:\\patches\\one' });
    expect(out.ok).toBe(true);
    const r = out.value;
    expect(r.dbcFiles).toEqual([{ file: 'Spell.dbc', path: expect.stringMatching(/server-dbc[\\/]Spell\.dbc$/), records: 4, changed: 1, added: 1 }]);
    expect(r.patchName).toBe('patch-CZZZ.MPQ');
    expect(r.sql).toBeNull();
    expect(r.notes.join(' ')).toMatch(/\.bak/);

    const server = Dbc.parse(written.get(r.dbcFiles[0].path) as Uint8Array);
    expect(server.count).toBe(4);
    expect(spellText(server.decode(server.rowOfId(90001)!, SPELL_FORMAT), 'Name')).toBe('Fireball (copy)');
    expect(spellNum(server.decode(server.rowOfId(143)!, SPELL_FORMAT), 'ManaCost')).toBe(99);

    const mpq = await openMpq(bytesSource(written.get(r.mpqPath) as Uint8Array), 'patch');
    const entry = mpq.find('DBFilesClient\\Spell.dbc');
    expect(entry && entry !== 'deleted').toBeTruthy();
    expect(await mpq.read(entry as never, 'DBFilesClient\\Spell.dbc')).toEqual(written.get(r.dbcFiles[0].path));
    expect([...written.keys()].some((k) => /INSTALL\.txt$/.test(k))).toBe(true);
  });

  it('puts the files in a folder of the export folder by default, and can leave the archive out', async () => {
    const { api, written } = await setup();
    await api.spellClone(133, 90001);
    const out: any = await api.exportClientPatch({ mpq: false });
    expect(out.value.folder).toMatch(/out[\\/]client-patch[\\/]20261023-100000$/);
    expect(out.value.mpqPath).toBeNull();
    expect([...written.keys()].some((k) => /\.MPQ$/i.test(k))).toBe(false);
  });

  it('refuses a patch name the client would load too early, and the server data folder', async () => {
    const { api } = await setup();
    await api.spellClone(133, 90001);
    expect(((await api.exportClientPatch({ patchName: 'patch-A.MPQ' })) as any).error.message).toMatch(/before patch-CZZ/);
    expect(((await api.exportClientPatch({ patchName: 'mine.mpq' })) as any).error.message).toMatch(/must look like/);
    expect(((await api.exportClientPatch({ folder: '/data/dbc' })) as any).error.message).toMatch(/outside the server/);
    expect(((await api.exportClientPatch({ folder: '/data' })) as any).error.code).toBe('BAD_REQUEST');
  });

  it('has nothing to do for a project without edits, and stops at errors before writing anything', async () => {
    const { api, written, session } = await setup();
    expect(((await api.exportClientPatch()) as any).error.message).toMatch(/nothing to export/);
    // An edit made before the icon table lost the icon: saved by the window, checked again at export
    const base: any = (await api.dbcRecord('Spell.dbc', 133) as any).value.row.values;
    session.entities.put({ npcs: [], objects: [], items: [], dbcEdits: [{ file: 'Spell.dbc', records: [{ id: 133, values: withSpell(base, { SpellIconID: 4242 }), was: base }] }] });
    const refused: any = await api.exportClientPatch({ folder: 'C:\\patches\\two' });
    expect(refused.error.message).toMatch(/Fix these first: Spell\.dbc 133: Icon 4242/);
    expect(written.size).toBe(0);
  });
});
