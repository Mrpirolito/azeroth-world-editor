import { describe, expect, it } from 'vitest';
import { allTools } from '../../src/main/mcp/tools';
import { Dbc, type DbcValue } from '../../src/core/game/dbc-file';
import { layoutOf } from '../../src/core/game/dbc-formats';
import { blankSpell, spellNum, withEffect, withSpell } from '../../src/core/spells/model';
import { mcpFixture } from '../helpers/mcp-fixture';
import type { ServerDataFiles } from '../../src/main/server-data';

const dbcFile = (file: string, rows: DbcValue[][]): Uint8Array => {
  const l = layoutOf(file)!;
  const d = Dbc.empty(l.fields.length);
  for (const r of rows) d.append(r, l.format);
  return d.serialize();
};
const fireball = withEffect(withSpell(blankSpell(133), { Name: 'Fireball', Rank: 'Rank 1', SchoolMask: 4, CastingTimeIndex: 4, RangeIndex: 2, SpellIconID: 136, ManaCost: 30 }), 0, { effect: 2, basePoints: 13, dieSides: 6, targetA: 6 });
const DBC: Record<string, Uint8Array> = {
  'Spell.dbc': dbcFile('Spell.dbc', [fireball]),
  'SpellIcon.dbc': dbcFile('SpellIcon.dbc', [[136, 'Interface\\Icons\\Spell_Fire_FlameBolt']]),
  'SpellCastTimes.dbc': dbcFile('SpellCastTimes.dbc', [[1, 0, 0, 0], [4, 1500, 0, 1000]]),
  'SpellRange.dbc': dbcFile('SpellRange.dbc', [[2, 0, 0, 30, 30, 0, 'Long Range', ...Array(33).fill(0)]]),
  'SpellDuration.dbc': dbcFile('SpellDuration.dbc', [[5, 300000, 0, 300000]]),
  'SpellRadius.dbc': dbcFile('SpellRadius.dbc', [[7, 8, 0, 8]]),
};
const serverDataFiles: ServerDataFiles = {
  isDir: async (d) => d === '/data',
  read: async (d, name) => (d.replace(/\\/g, '/') === '/data/dbc' ? (DBC[name] ?? null) : null),
};
const written = new Map<string, Uint8Array | string>();
const fixture = () => mcpFixture(allTools, {
  tables: ['spell_dbc'], profile: { dbcDir: '/data' },
  deps: {
    serverDataFiles,
    fs: { writeFile: async (p: string, t: string) => { written.set(p, t); }, writeBytes: async (p: string, b: Uint8Array) => { written.set(p, b); }, ensureDir: async () => {}, listDir: async () => [] },
  },
});

describe('spell tools', () => {
  it('search_spells and read_spell give names, fields by name and a summary in words', async () => {
    const { call } = await fixture();
    const found = await call('search_spells', { text: 'fire' });
    expect(found.value).toEqual({ total: 1, spells: [{ id: 133, name: 'Fireball', rank: 'Rank 1', icon: 136, state: 'file' }] });
    const read = await call('read_spell', { id: 133 });
    expect(read.isError).toBe(false);
    expect(read.value.fields).toMatchObject({ ID: 133, Name: 'Fireball', SchoolMask: 4, Effect1: 2, EffectBasePoints1: 13, EffectDieSides1: 6, CastingTimeIndex: 4 });
    expect(read.value.summary.effects).toEqual(['Effect 1: Deals 14 to 19 fire damage to the enemy target.']);
    expect(read.value.summary.cast).toBe('30 mana · 1.5 s cast · 30 yd range');
    expect((await call('read_spell', { id: 9999 })).isError).toBe(true);
  });

  it('clone_spell makes a copy on a free id as one undoable step, and edit_spell changes it by field name', async () => {
    const { call, session, changes } = await fixture();
    const cloned = await call('clone_spell', { baseId: 133 });
    expect(cloned.isError).toBe(false);
    const id = cloned.value.id as number;
    expect(id).toBe(134);
    expect(changes.at(-1)!.step!.label).toBe('AI: clone spell 133');
    const edited = await call('edit_spell', { id, changes: { Name: 'Meteor', ManaCost: 120, EffectBasePoints1: 299, EffectDieSides1: 1 } });
    expect(edited.isError).toBe(false);
    const read = await call('read_spell', { id });
    expect(read.value.state).toBe('new');
    expect(read.value.fields).toMatchObject({ Name: 'Meteor', ManaCost: 120 });
    expect(read.value.summary.effects[0]).toBe('Effect 1: Deals 300 fire damage to the enemy target.');
    expect(spellNum(session.entities.get().dbcEdits![0]!.records[0]!.values, 'EffectBasePoints1')).toBe(299);
    await call('undo');
    expect((await call('read_spell', { id })).value.fields.ManaCost).toBe(30);
  });

  it('edit_spell refuses unknown fields, the id, and values that break the spell, saying why', async () => {
    const { call } = await fixture();
    expect((await call('edit_spell', { id: 133, changes: { Nme: 'x' } })).value.message).toMatch(/no field Nme/);
    expect((await call('edit_spell', { id: 133, changes: { ID: 5 } })).value.message).toMatch(/cloning/);
    const bad = await call('edit_spell', { id: 133, changes: { SpellIconID: 999 } });
    expect(bad.isError).toBe(true);
    expect(bad.value.message).toMatch(/Icon 999/);
    expect((await call('edit_spell', { id: 777, changes: { Name: 'x' } })).isError).toBe(true);
    expect((await call('clone_spell', { baseId: 133, id: 133 })).value.code).toBe('ID_COLLISION');
  });

  it('works on the other client tables: list, search, set a record, put it back', async () => {
    const { call } = await fixture();
    const tables = await call('dbc_tables');
    expect(tables.value.files.map((f: any) => f.file)).toContain('SpellIcon.dbc');
    expect((await call('dbc_search', { file: 'SpellIcon.dbc', text: 'flame' })).value.rows).toHaveLength(1);
    expect((await call('dbc_search', { file: 'SpellIcon.dbc', text: '136' })).value.rows[0].values[1]).toMatch(/FlameBolt/);
    const free = await call('dbc_free_id', { file: 'SpellIcon.dbc' });
    expect(free.value.id).toBe(137);
    expect((await call('set_dbc_record', { file: 'SpellIcon.dbc', values: [137, 'Interface\\Icons\\Mine'] })).value.id).toBe(137);
    expect((await call('dbc_record', { file: 'SpellIcon.dbc', id: 137 })).value.row.state).toBe('new');
    expect((await call('put_back_dbc_record', { file: 'SpellIcon.dbc', id: 137 })).isError).toBe(false);
    expect((await call('dbc_record', { file: 'SpellIcon.dbc', id: 137 })).value.row).toBeNull();
  });

  it('export_client_patch writes the files and tells where, and refuses a bad patch name', async () => {
    written.clear();
    const { call } = await fixture();
    await call('clone_spell', { baseId: 133 });
    const bad = await call('export_client_patch', { folder: 'C:/patches/a', patchName: 'patch-A.MPQ' });
    expect(bad.isError).toBe(true);
    expect(written.size).toBe(0);
    const out = await call('export_client_patch', { folder: 'C:/patches/a' });
    expect(out.isError).toBe(false);
    expect(out.value.patchName).toBe('patch-CZZZ.MPQ');
    expect(out.value.dbcFiles[0]).toMatchObject({ file: 'Spell.dbc', added: 1, changed: 0, records: 2 });
    expect([...written.keys()].some((k) => /patch-CZZZ\.MPQ$/.test(k))).toBe(true);
  });
});
