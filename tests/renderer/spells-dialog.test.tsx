// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpellsDialog } from '../../src/renderer/spells/SpellsDialog';
import { NamesProvider } from '../../src/renderer/state/names';
import { ProjectEntitiesProvider, type ProjectEntitiesValue } from '../../src/renderer/state/project-entities';
import { makeMockApi, okv } from './mock-api';
import { EMPTY_ENTITIES, type ProjectEntities } from '../../src/core/entities/model';
import { EMPTY_WORLD } from '../../src/core/world/layer';
import { blankSpell, spellNum, spellText, withEffect, withSpell } from '../../src/core/spells/model';
import { findRecord } from '../../src/core/dbc/edits';
import type { DbcRowView } from '../../src/shared/ipc';

afterEach(cleanup);

let store: ProjectEntities = EMPTY_ENTITIES;

const fireball = withEffect(
  withSpell(blankSpell(133), { Name: 'Fireball', Rank: 'Rank 1', SchoolMask: 4, CastingTimeIndex: 4, RangeIndex: 2, SpellIconID: 136, DurationIndex: 5, ManaCost: 30, Description: 'Hurls a fiery ball.' }),
  0, { effect: 2, basePoints: 13, dieSides: 6, targetA: 6 },
);
const row = (id: number, values: (number | string)[], state: DbcRowView['state'] = 'file'): DbcRowView => ({ id, values, state });
const TABLES: Record<string, DbcRowView[]> = {
  'SpellCastTimes.dbc': [row(1, [1, 0, 0, 0]), row(4, [4, 1500, 0, 1000])],
  'SpellRange.dbc': [row(2, [2, 0, 0, 30, 30, 0, 'Long Range', ...Array(33).fill(0)])],
  'SpellDuration.dbc': [row(5, [5, 300000, 0, 300000])],
  'SpellRadius.dbc': [row(7, [7, 8, 0, 8])],
  'SpellIcon.dbc': [row(136, [136, 'Interface\\Icons\\Spell_Fire_FlameBolt']), row(137, [137, 'Interface\\Icons\\Spell_Frost_FrostBolt02'])],
};

const dbcTable = vi.fn(async (file: string) => okv({ rows: TABLES[file] ?? [] }));
const dbcSearch = vi.fn(async (file: string, text: string) => {
  if (file === 'Spell.dbc') return okv({ rows: /fire/i.test(text) ? [row(133, fireball)] : [], total: 1 });
  if (file === 'SpellIcon.dbc') return okv({ rows: TABLES['SpellIcon.dbc']!, total: 2 });
  return okv({ rows: [], total: 0 });
});
const dbcRecord = vi.fn(async (file: string, id: number) => {
  if (file === 'Spell.dbc' && id === 133) return okv({ row: row(133, fireball) });
  const found = (TABLES[file] ?? []).find((r) => r.id === id);
  return okv({ row: found ?? null });
});

function Dialog({ api, project = true }: { api: ReturnType<typeof makeMockApi>; project?: boolean }) {
  const [entities, setEntities] = useState<ProjectEntities>(store);
  const value = { entities, setEntities: (next: ProjectEntities) => { store = next; setEntities(next); }, quests: [], layer: EMPTY_WORLD, setLayer: () => {}, tracked: [], create: vi.fn(), remove: vi.fn(), adopt: vi.fn(), ensure: vi.fn() } as unknown as ProjectEntitiesValue;
  const dialog = <SpellsDialog onClose={() => {}} />;
  return <NamesProvider api={api}>{project ? <ProjectEntitiesProvider value={value}>{dialog}</ProjectEntitiesProvider> : dialog}</NamesProvider>;
}
const mockApi = (more: Record<string, unknown> = {}) => makeMockApi({
  dbcTable, dbcSearch, dbcRecord, dbcFreeId: vi.fn(async () => okv({ id: 900001 })),
  spellFacts: vi.fn(async () => okv({ available: false, reason: 'none', spells: {} })), ...more,
});
const view = (name: string) => userEvent.click(within(screen.getByRole('navigation', { name: 'Spell views' })).getByRole('button', { name }));

async function openFireball() {
  await userEvent.type(screen.getByLabelText(/Find a spell by name or id/), 'fire');
  await userEvent.click(screen.getByRole('button', { name: 'Find' }));
  await userEvent.click(await screen.findByRole('button', { name: /Fireball/ }));
  return screen.findByRole('heading', { name: /Fireball · Rank 1/ });
}

describe('the spell editor screen', () => {
  it('finds a spell, shows it in tabs with its icon name, and keeps an edit in the project with the file record', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await openFireball();
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Fireball');
    expect(screen.getByText('Spell_Fire_FlameBolt')).toBeTruthy();
    expect(screen.getByLabelText('How it is cast')).toHaveTextContent('30 mana · 1.5 s cast · 30 yd range · lasts 5 min');
    await userEvent.type(name, '!');
    const held = findRecord(store.dbcEdits, 'Spell.dbc', 133)!;
    expect(spellText(held.values, 'Name')).toBe('Fireball!');
    expect(spellText(held.was!, 'Name')).toBe('Fireball');
    expect(screen.getByRole('list', { name: 'Spells changed in this project' })).toBeTruthy();
  });

  it('changes the cost, the cast time by name, and the school by a toggle', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await openFireball();
    await userEvent.clear(screen.getByLabelText('Cost'));
    await userEvent.type(screen.getByLabelText('Cost'), '45');
    expect(spellNum(findRecord(store.dbcEdits, 'Spell.dbc', 133)!.values, 'ManaCost')).toBe(45);
    await userEvent.click(screen.getByRole('button', { name: 'Frost' }));
    expect(spellNum(findRecord(store.dbcEdits, 'Spell.dbc', 133)!.values, 'SchoolMask')).toBe(20);
    await userEvent.click(screen.getByRole('tab', { name: 'Casting' }));
    await userEvent.selectOptions(screen.getByLabelText('Cast time'), '1');
    expect(spellNum(findRecord(store.dbcEdits, 'Spell.dbc', 133)!.values, 'CastingTimeIndex')).toBe(1);
    expect(screen.getByRole('option', { name: '1.5 s cast (#4)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Long Range · 30 yd (#2)' })).toBeTruthy();
  });

  it('shows each effect as a sentence and edits its value as a range', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await openFireball();
    await userEvent.click(screen.getByRole('tab', { name: 'Effects' }));
    const card = screen.getByRole('region', { name: 'Effect 1' });
    expect(within(card).getByText('Deals 14 to 19 fire damage to the enemy target.')).toBeTruthy();
    await userEvent.clear(within(card).getByLabelText('Value to'));
    await userEvent.type(within(card).getByLabelText('Value to'), '30');
    expect(within(card).getByText('Deals 14 to 30 fire damage to the enemy target.')).toBeTruthy();
    const values = findRecord(store.dbcEdits, 'Spell.dbc', 133)!.values;
    expect([spellNum(values, 'EffectBasePoints1'), spellNum(values, 'EffectDieSides1')]).toEqual([13, 17]);
    // An unused effect is a single dropdown
    expect(within(screen.getByRole('region', { name: 'Effect 2' })).queryByLabelText('Aims at (A)')).toBeNull();
    await userEvent.selectOptions(within(screen.getByRole('region', { name: 'Effect 2' })).getByLabelText('What it does'), 'Heal');
    expect(within(screen.getByRole('region', { name: 'Effect 2' })).getByLabelText('Aims at (A)')).toBeTruthy();
  });

  it('toggles attributes by name, bit 31 included', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await openFireball();
    await userEvent.click(screen.getByRole('tab', { name: 'Attributes' }));
    await userEvent.type(screen.getByLabelText('Find a switch'), 'passive');
    await userEvent.click(screen.getByRole('button', { name: 'Passive spell' }));
    expect(spellNum(findRecord(store.dbcEdits, 'Spell.dbc', 133)!.values, 'Attributes')).toBe(0x40);
    await userEvent.clear(screen.getByLabelText('Find a switch'));
    await userEvent.type(screen.getByLabelText('Find a switch'), 'cancelled');
    await userEvent.click(screen.getByRole('button', { name: /Aura cannot be cancelled/ }));
    expect(spellNum(findRecord(store.dbcEdits, 'Spell.dbc', 133)!.values, 'Attributes')).toBe(0x40 + 2 ** 31);
  });

  it('searches the icons by name and picks one', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await openFireball();
    await userEvent.click(screen.getByRole('button', { name: 'Change icon' }));
    await userEvent.type(screen.getByLabelText(/Search icons/), 'frost');
    await userEvent.click(screen.getByRole('button', { name: 'Spell_Frost_FrostBolt02 #137' }));
    expect(spellNum(findRecord(store.dbcEdits, 'Spell.dbc', 133)!.values, 'SpellIconID')).toBe(137);
    expect(screen.getByText('Spell_Frost_FrostBolt02')).toBeTruthy();
  });

  it('clones to the free id the API gives, opens the copy, and can delete it again', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await openFireball();
    await userEvent.click(screen.getByRole('button', { name: 'Clone to a new spell' }));
    expect(await screen.findByRole('heading', { name: /Fireball \(copy\)/ })).toBeTruthy();
    const copy = findRecord(store.dbcEdits, 'Spell.dbc', 900001)!;
    expect(copy.was).toBeNull();
    expect(spellNum(copy.values, 'ID')).toBe(900001);
    expect(screen.getByText(/Spell #900001 · new/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Delete this new spell' }));
    expect(store.dbcEdits).toBeUndefined();
  });

  it('lists the spell tables of the database as tabs, each a sheet for this spell', async () => {
    store = EMPTY_ENTITIES;
    const tableRows = vi.fn(async () => okv({ exists: true, columns: ['SpellId', 'ProcFlags', 'Chance'], rows: [] }));
    render(<Dialog api={mockApi({ tableRows })} />);
    await openFireball();
    const tabs = within(screen.getByRole('tablist', { name: 'Spell' })).getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Basics', 'Casting', 'Effects', 'Attributes', 'Advanced', 'DB: Server spell copy', 'DB: Custom flags', 'DB: Proc rules', 'DB: Spell power scaling', 'DB: Stacking groups', 'DB: Linked spells', 'DB: Teleport destinations', 'DB: Where it applies', 'DB: C++ scripts']);
    await userEvent.click(screen.getByRole('tab', { name: 'DB: Proc rules' }));
    await waitFor(() => expect(tableRows).toHaveBeenCalledWith('spell_proc', { SpellId: '133' }));
    expect(await screen.findByRole('region', { name: 'Proc rules' })).toBeTruthy();
  });

  it('shows the problems the main process finds', async () => {
    store = EMPTY_ENTITIES;
    const dbcCheck = vi.fn(async () => okv({ issues: [{ severity: 'error' as const, code: 'SPELL_REF', fieldId: 'SpellIconID', message: "Icon 4242 is not in the client's tables." }] }));
    render(<Dialog api={mockApi({ dbcCheck })} />);
    await openFireball();
    expect(await screen.findByText(/Problem: Icon 4242/)).toBeTruthy();
  });

  it('explains that a project is needed to change anything', async () => {
    render(<Dialog api={mockApi()} project={false} />);
    await openFireball();
    expect(screen.getByText('Open a project to change spells.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clone to a new spell' })).toBeDisabled();
  });
});

describe('the client tables screen', () => {
  it('opens a table, finds a record, edits a field and keeps it in the project', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await view('Client tables');
    await userEvent.selectOptions(screen.getByLabelText('Table'), 'SpellIcon.dbc');
    const found = await screen.findByRole('table', { name: 'Records found' });
    expect(within(found).getByText('Interface\\Icons\\Spell_Frost_FrostBolt02')).toBeTruthy();
    await userEvent.click(within(found).getByRole('button', { name: 'Open 137' }));
    const form = await screen.findByRole('region', { name: 'Spell icons 137' });
    const path = within(form).getByLabelText('TextureFilename');
    await userEvent.type(path, 'X');
    const held = findRecord(store.dbcEdits, 'SpellIcon.dbc', 137)!;
    expect(held.values).toEqual([137, 'Interface\\Icons\\Spell_Frost_FrostBolt02X']);
    expect(held.was).toEqual([137, 'Interface\\Icons\\Spell_Frost_FrostBolt02']);
    expect(screen.getByText('1 record of SpellIcon.dbc changed in this project.')).toBeTruthy();
    expect(within(form).getByLabelText('ID')).toBeDisabled();
  });

  it('offers the other tables the roadmap names', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await view('Client tables');
    const options = within(screen.getByLabelText('Table')).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(options).toEqual(expect.arrayContaining(['SpellIcon.dbc', 'Item.dbc', 'ItemDisplayInfo.dbc', 'Faction.dbc', 'AreaTable.dbc']));
  });

  it('copies a record to the next free id', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await view('Client tables');
    await userEvent.selectOptions(screen.getByLabelText('Table'), 'SpellIcon.dbc');
    await userEvent.click(await screen.findByRole('button', { name: 'Open 136' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Copy to a new record' }));
    await screen.findByRole('region', { name: 'Spell icons 900001' });
    expect(findRecord(store.dbcEdits, 'SpellIcon.dbc', 900001)).toMatchObject({ was: null, values: [900001, 'Interface\\Icons\\Spell_Fire_FlameBolt'] });
  });
});

describe('the export screen', () => {
  it('lists the changed files with the .bak reminder and writes the patch with the name given', async () => {
    store = { ...EMPTY_ENTITIES, dbcEdits: [{ file: 'Spell.dbc', records: [{ id: 133, values: fireball, was: fireball }, { id: 900001, values: fireball, was: null }] }] };
    const exportClientPatch = vi.fn(async () => okv({
      folder: 'C:\\out\\client-patch\\x', dbcFiles: [{ file: 'Spell.dbc', path: 'C:\\out\\client-patch\\x\\server-dbc\\Spell.dbc', records: 5, changed: 1, added: 1 }],
      mpqPath: 'C:\\out\\client-patch\\x\\patch-CZZZ.MPQ', patchName: 'patch-CZZZ.MPQ', sql: null, notes: ['Copy the files into the server.'], issues: [],
    }));
    render(<Dialog api={mockApi({ exportClientPatch })} />);
    await view('Export');
    expect(screen.getByText(/Spell\.dbc: 2 records \(1 new\)\. Keep a copy of the server's Spell\.dbc as Spell\.dbc\.bak/)).toBeTruthy();
    expect(screen.getByLabelText(/Client patch name/)).toHaveValue('patch-CZZZ.MPQ');
    await userEvent.click(screen.getByRole('button', { name: 'Export client patch' }));
    const done = await screen.findByRole('status', { name: 'Exported' });
    expect(exportClientPatch).toHaveBeenCalledWith({ patchName: 'patch-CZZZ.MPQ', mpq: true });
    expect(within(done).getByText(/server-dbc\\Spell\.dbc: 1 changed, 1 added, 5 records/)).toBeTruthy();
    expect(within(done).getByText('Copy the files into the server.')).toBeTruthy();
  });

  it('will not export a patch name that loads too early, and shows the error the export gives', async () => {
    store = { ...EMPTY_ENTITIES, dbcEdits: [{ file: 'Spell.dbc', records: [{ id: 133, values: fireball, was: fireball }] }] };
    const exportClientPatch = vi.fn(async () => ({ ok: false as const, error: { code: 'BAD_REQUEST' as const, message: 'Fix these first: Spell.dbc 133: x' } }));
    render(<Dialog api={mockApi({ exportClientPatch })} />);
    await view('Export');
    const name = screen.getByLabelText(/Client patch name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'patch-3.MPQ');
    expect(screen.getByRole('button', { name: 'Export client patch' })).toBeDisabled();
    expect(screen.getByText(/loads patch-3\.MPQ before patch-CZZ/)).toBeTruthy();
    await userEvent.clear(name);
    await userEvent.type(name, 'patch-DAA.MPQ');
    await userEvent.click(screen.getByRole('button', { name: 'Export client patch' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Fix these first/);
  });

  it('says there is nothing changed when the project has no records', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await view('Export');
    expect(screen.getByText(/No client table records are changed/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export client patch' })).toBeDisabled();
  });
});
