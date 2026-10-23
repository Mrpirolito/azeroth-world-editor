// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TablesDialog } from '../../src/renderer/tables/TablesDialog';
import { NamesProvider } from '../../src/renderer/state/names';
import { ProjectEntitiesProvider, type ProjectEntitiesValue } from '../../src/renderer/state/project-entities';
import { makeMockApi, okv, errv } from './mock-api';
import { EMPTY_ENTITIES, type ProjectEntities } from '../../src/core/entities/model';
import { EMPTY_WORLD } from '../../src/core/world/layer';
import type { Row } from '../../src/core/tables/types';

afterEach(cleanup);

let store: ProjectEntities = EMPTY_ENTITIES;
const TELE: Row[] = [
  { id: '1', name: 'Stormwind', map: '0', position_x: '-8913', position_y: '554', position_z: '94', orientation: '0.6' },
  { id: '2', name: 'Orgrimmar', map: '1', position_x: '1629', position_y: '-4373', position_z: '31', orientation: '3.6' },
];
const tableRows = vi.fn(async (table: string, scope: Record<string, string>) => {
  const rows = table === 'game_tele' ? TELE.filter((r) => Object.entries(scope).every(([c, v]) => r[c] === v)) : [];
  return okv({ exists: true, columns: ['id', 'name', 'map', 'position_x', 'position_y', 'position_z', 'orientation', 'Entry', 'Item', 'Chance', 'MinCount', 'MaxCount', 'GroupId', 'QuestRequired', 'Reference', 'LootMode', 'Comment'], rows });
});
const searchTable = vi.fn(async (_t: string, text: string) => okv({ rows: TELE.filter((r) => r.name!.toLowerCase().includes(text.toLowerCase())) }));

function Dialog({ api }: { api: ReturnType<typeof makeMockApi> }) {
  const [entities, setEntities] = useState<ProjectEntities>(store);
  const value = { entities, setEntities: (next: ProjectEntities) => { store = next; setEntities(next); }, quests: [], layer: EMPTY_WORLD, setLayer: () => {}, tracked: [], create: vi.fn(), remove: vi.fn(), adopt: vi.fn(), ensure: vi.fn() } as unknown as ProjectEntitiesValue;
  return <NamesProvider api={api}><ProjectEntitiesProvider value={value}><TablesDialog onClose={() => {}} /></ProjectEntitiesProvider></NamesProvider>;
}
const mockApi = (more: Record<string, unknown> = {}) => makeMockApi({ tableRows, searchTable, freeIds: vi.fn(async () => okv({ ids: [3, 4, 5] })), ...more });
const nav = (name: string | RegExp) => userEvent.click(within(screen.getByRole('navigation', { name: 'Tables' })).getByRole('button', { name }));

describe('Database tables dialog', () => {
  it('groups the tables and the tools, and opens on the first loot list', () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    const buttons = within(screen.getByRole('navigation', { name: 'Tables' })).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Reference loot lists', 'Fishing loot', 'Mail loot', 'Spell loot', 'Broadcast texts', 'Gossip texts', 'Book pages', 'Server strings', 'Teleport places', 'Formations', 'Immunity sets', 'Random enchantments', 'Spawn appearance and auras', 'Object spawn extras', 'Server spell copy', 'Custom flags', 'Proc rules', 'Spell power scaling', 'Stacking groups', 'Linked spells', 'Teleport destinations', 'Where it applies', 'C++ scripts', 'Changed here', 'Free ids', 'SQL console']);
    expect(screen.getByRole('heading', { name: 'Reference loot lists' })).toBeTruthy();
  });

  it('finds a teleport by its words, opens it as a sheet, and keeps an edit in the project', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await nav('Teleport places');
    await userEvent.type(screen.getByLabelText(/Find by id/), 'orgri');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    await userEvent.click(await screen.findByRole('button', { name: '2 · Orgrimmar' }));
    const sheet = await screen.findByRole('region', { name: 'Teleport places: id 2' });
    expect(within(sheet).getByLabelText('Name')).toHaveValue('Orgrimmar');
    expect(within(sheet).getByLabelText('X')).toHaveValue(1629);
    await userEvent.type(within(sheet).getByLabelText('Name'), '!');
    expect(store.rowsets).toEqual([expect.objectContaining({ table: 'game_tele', scope: { id: '2' }, original: [TELE[1]], rows: [{ ...TELE[1], name: 'Orgrimmar!' }] })]);
    // It is listed as changed, and the nav says so
    expect(screen.getByRole('list', { name: 'Changed in this project' })).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Tables' })).getByRole('button', { name: 'Teleport places (1 changed)' })).toBeTruthy();
  });

  it('starts a new row on the first free id', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await nav('Teleport places');
    await userEvent.click(screen.getByRole('button', { name: 'New with the first free id' }));
    const sheet = await screen.findByRole('region', { name: 'Teleport places: id 3' });
    await userEvent.type(within(sheet).getByLabelText('Name'), 'Ironforge');
    expect(store.rowsets![0]).toMatchObject({ table: 'game_tele', scope: { id: '3' }, original: [], rows: [expect.objectContaining({ id: '3', name: 'Ironforge' })] });
  });

  it('opens a placed spawn by its guid, and does not offer a new id for what must already exist', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi()} />);
    await nav('Spawn appearance and auras');
    expect(screen.queryByRole('button', { name: 'New with the first free id' })).toBeNull();
    await userEvent.type(screen.getByLabelText(/Find by id/), '51234');
    await userEvent.click(screen.getByRole('button', { name: 'Open guid 51234' }));
    expect(await screen.findByRole('region', { name: 'Spawn appearance and auras: guid 51234' })).toBeTruthy();
  });

  it('edits a reference loot list with the loot sheet', async () => {
    store = EMPTY_ENTITIES;
    render(<Dialog api={mockApi({ freeIds: vi.fn(async () => okv({ ids: [200] })) })} />);
    await userEvent.click(screen.getByRole('button', { name: 'New with the first free id' }));
    const sheet = await screen.findByRole('region', { name: 'Reference loot lists: Entry 200' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add item' }));
    expect(store.rowsets![0]).toMatchObject({ table: 'reference_loot_template', scope: { Entry: '200' } });
    expect(store.rowsets![0]!.rows[0]).toMatchObject({ Entry: '200', Chance: '100', MinCount: '1' });
  });

  it('lists every set of rows the project holds, and puts one back', async () => {
    store = { ...EMPTY_ENTITIES, rowsets: [
      { table: 'creature_template_addon', scope: { entry: '5' }, original: [], rows: [{ entry: '5', emote: '1' }], owner: { kind: 'creature', entry: 5 } },
      { table: 'game_tele', scope: { id: '9' }, original: [], rows: [{ id: '9', name: 'Here' }, ] },
    ] };
    render(<Dialog api={mockApi()} />);
    await nav('Changed here');
    const list = screen.getByRole('list', { name: 'Changed rows' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Appearance and auras · 5 · NPC 5 · 1 rowPut back', 'Teleport places · 9 · 1 rowPut back',
    ]);
    await userEvent.click(within(list).getByRole('button', { name: 'Put back Appearance and auras 5' }));
    expect(store.rowsets!.map((s) => s.table)).toEqual(['game_tele']);
    store = EMPTY_ENTITIES;
  });

  it('lists free ids for what the author is making', async () => {
    store = EMPTY_ENTITIES;
    const freeIds = vi.fn(async () => okv({ ids: [100003, 100004] }));
    render(<Dialog api={mockApi({ freeIds })} />);
    await nav('Free ids');
    await userEvent.selectOptions(screen.getByLabelText('What for'), 'Creature spawn guid');
    await userEvent.click(screen.getByRole('button', { name: 'Find free ids' }));
    expect(freeIds).toHaveBeenCalledWith('creature', 'guid', 1000000, 10);
    expect(await screen.findByLabelText('Found ids')).toHaveTextContent('100003, 100004');
  });

  it('runs a query and shows the rows; says why when the query is refused', async () => {
    store = EMPTY_ENTITIES;
    const sqlQuery = vi.fn(async (sql: string) =>
      sql.startsWith('DELETE') ? errv('BAD_REQUEST', 'Only SELECT, SHOW, DESCRIBE and EXPLAIN are allowed: the world database is read-only here.') : okv({ columns: ['entry', 'name'], rows: [{ entry: '68', name: 'Stormwind City Guard' }, { entry: '69', name: null }], truncated: false }));
    render(<Dialog api={mockApi({ sqlQuery })} />);
    await nav('SQL console');
    expect(screen.getByText(/Read-only: one SELECT/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Run/ }));
    const table = await screen.findByRole('table', { name: 'Result' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['entry', 'name']);
    expect(within(table).getByText('Stormwind City Guard')).toBeTruthy();
    expect(within(table).getByText('NULL')).toBeTruthy();
    expect(screen.getByText('2 rows.')).toBeTruthy();

    const box = screen.getByLabelText('Query');
    await userEvent.clear(box);
    await userEvent.type(box, 'DELETE FROM creature');
    await userEvent.click(screen.getByRole('button', { name: /Run/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('read-only here');
    await waitFor(() => expect(screen.queryByRole('table', { name: 'Result' })).toBeNull());
  });
});
