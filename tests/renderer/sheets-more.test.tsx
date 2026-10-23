// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NpcEditor } from '../../src/renderer/entities/npc/NpcEditor';
import { ItemEditor } from '../../src/renderer/entities/item/ItemEditor';
import { ObjectEditor } from '../../src/renderer/entities/object/ObjectEditor';
import { NamesProvider } from '../../src/renderer/state/names';
import { ProjectEntitiesProvider, type ProjectEntitiesValue } from '../../src/renderer/state/project-entities';
import { makeMockApi, okv } from './mock-api';
import { EMPTY_ENTITIES, newItem, newNpc, newObject, type CustomItem, type CustomNpc, type CustomObject, type ProjectEntities } from '../../src/core/entities/model';
import { rowsetStatements } from '../../src/core/tables/rowset';
import { EMPTY_WORLD } from '../../src/core/world/layer';
import type { Row } from '../../src/core/tables/types';

afterEach(cleanup);

const db: Record<string, Row[]> = {};
let store: ProjectEntities = EMPTY_ENTITIES;
const BROADCAST: Row[] = [
  { ID: '2104', LanguageID: '7', MaleText: 'Greetings, $n. Welcome to my shop.', FemaleText: 'Greetings, $n. Welcome to my shop.', EmoteID1: '3', SoundEntriesId: '6094' },
];
const tableRows = vi.fn(async (table: string, scope: Record<string, string>) =>
  okv({ exists: true, columns: [], rows: (db[table] ?? []).filter((r) => Object.entries(scope).every(([c, v]) => r[c] === v)) }));
const searchTable = vi.fn(async (table: string, text: string) => okv({ rows: table === 'broadcast_text' ? BROADCAST.filter((r) => r.MaleText!.toLowerCase().includes(text.toLowerCase()) || r.ID === text) : [] }));
const api = () => makeMockApi({ tableRows, searchTable });

function Project({ children }: { children: React.ReactNode }) {
  const [entities, setEntities] = useState<ProjectEntities>(store);
  const value = { entities, setEntities: (next: ProjectEntities) => { store = next; setEntities(next); }, quests: [], layer: EMPTY_WORLD, setLayer: () => {}, tracked: [], create: vi.fn(), remove: vi.fn(), adopt: vi.fn(), ensure: vi.fn() } as unknown as ProjectEntitiesValue;
  return <NamesProvider api={api()}><ProjectEntitiesProvider value={value}>{children}</ProjectEntitiesProvider></NamesProvider>;
}
const reset = (): void => {
  store = EMPTY_ENTITIES;
  for (const k of Object.keys(db)) delete db[k];
};
const tab = (name: string) => userEvent.click(screen.getByRole('tab', { name }));
const setOf = (table: string) => (store.rowsets ?? []).find((s) => s.table === table);

function Npc({ start }: { start: CustomNpc }) {
  const [npc, setNpc] = useState(start);
  return <Project><NpcEditor npc={npc} onChange={setNpc} allocateSpawn={async () => 1} /></Project>;
}

describe('summary cards', () => {
  it('say in a line what the NPC, object and item is, and follow the edits', async () => {
    reset();
    render(<Npc start={{ ...newNpc(12000001), minLevel: 5, maxLevel: 7, type: 'beast' }} />);
    expect(screen.getByLabelText('Summary')).toHaveTextContent('Level 5-7 beast. 0 spawns.');
    await tab('Basics');
    await userEvent.click(screen.getByLabelText('Gives quests'));
    expect(screen.getByLabelText('Summary')).toHaveTextContent('Level 5-7 beast, gives quests.');
    cleanup();
    function Obj() {
      const [object, setObject] = useState<CustomObject>({ ...newObject(9100001), type: 'chest' });
      return <Project><ObjectEditor object={object} onChange={setObject} allocateSpawn={async () => 1} allocatePage={async () => 2} /></Project>;
    }
    render(<Obj />);
    expect(screen.getByLabelText('Summary')).toHaveTextContent('Chest, holds nothing yet. 0 spawns.');
  });
});

describe('more looks and equipment sets', () => {
  it('shows only the looks after the first, numbers new ones, and writes only their keys', async () => {
    reset();
    db.creature_template_model = [
      { CreatureID: '12000001', Idx: '0', CreatureDisplayID: '3167', DisplayScale: '1', Probability: '1', VerifiedBuild: null },
      { CreatureID: '12000001', Idx: '1', CreatureDisplayID: '3168', DisplayScale: '1', Probability: '1', VerifiedBuild: null },
    ];
    render(<Npc start={newNpc(12000001)} />);
    await tab('Look & gear');
    const more = await screen.findByRole('region', { name: 'More looks' });
    expect(within(more).getAllByLabelText('Display id')).toHaveLength(1);
    expect(within(more).getByLabelText('Display id')).toHaveValue(3168);
    await userEvent.click(within(more).getByRole('button', { name: 'Add more looks' }));
    expect(setOf('creature_template_model')!.rows.map((r) => r.Idx)).toEqual(['1', '2']);
    const { apply } = rowsetStatements(store.rowsets);
    expect(apply.filter((s) => s.kind === 'delete').map((s) => (s as any).key.Idx)).toEqual(['1', '2']);
    expect(JSON.stringify(apply)).not.toContain('"Idx":"0"');
  });
});

describe('the one text picker', () => {
  it('takes a broadcast text into a creature text line with its language, emote and sound', async () => {
    reset();
    render(<Npc start={newNpc(12000001)} />);
    await tab('Texts');
    const texts = await screen.findByRole('region', { name: 'Things it says' });
    await userEvent.click(within(texts).getByRole('button', { name: 'Add things it says' }));
    await userEvent.click(within(texts).getByRole('button', { name: 'Take a line the game has' }));
    await userEvent.type(within(texts).getByLabelText("Search the game's texts"), 'welcome{Enter}');
    await userEvent.click(await within(texts).findByRole('button', { name: /2104 · Greetings/ }));
    expect(setOf('creature_text')!.rows[0]).toMatchObject({ Text: 'Greetings, $n. Welcome to my shop.', BroadcastTextId: '2104', Language: '7', Emote: '3', Sound: '6094' });
    expect(within(texts).getByLabelText('Words')).toHaveValue('Greetings, $n. Welcome to my shop.');
  });

  it('says nothing found, and fills a gossip greeting', async () => {
    reset();
    const start: CustomNpc = { ...newNpc(12000001), gossip: true, gossipMenu: { menus: [{ menuId: 60001, textId: 60001, greeting: [{ text: '', textFemale: '', probability: 1 }], options: [], locked: false }] } };
    function Gossip() {
      const [npc, setNpc] = useState(start);
      return <Project><NpcEditor npc={npc} onChange={setNpc} allocateSpawn={async () => 1} tab="gossip" /></Project>;
    }
    render(<Gossip />);
    await userEvent.click(await screen.findByRole('button', { name: 'Take a line the game has' }));
    await userEvent.type(screen.getByLabelText("Search the game's texts"), 'zzz{Enter}');
    expect(await screen.findByText('Nothing found.')).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("Search the game's texts"));
    await userEvent.type(screen.getByLabelText("Search the game's texts"), 'shop{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /2104/ }));
    expect(screen.getAllByLabelText('Text').some((box) => (box as HTMLTextAreaElement).value.startsWith('Greetings'))).toBe(true);
  });
});

describe('item flags and sockets', () => {
  function Itm({ start }: { start: CustomItem }) {
    const [item, setItem] = useState(start);
    latest = item;
    return <Project><ItemEditor item={item} onChange={setItem} allocatePage={async () => 2} copyLook={async () => null} columns={[]} /></Project>;
  }
  let latest: CustomItem = newItem(1);

  it('toggles a flag by name, keeping the rest, and switches it off by writing 0', async () => {
    reset();
    render(<Itm start={{ ...newItem(9500001), advanced: { Flags: '2048', BuyCount: '1' } }} />);
    await tab('Flags & sockets');
    const flags = screen.getByRole('group', { name: 'Item flags' });
    expect(within(flags).getByRole('button', { name: 'Stays in the loot when looted' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(flags).getByRole('button', { name: 'Conjured' }));
    expect(latest.advanced).toEqual({ Flags: '2050', BuyCount: '1' });
    await userEvent.click(within(flags).getByRole('button', { name: 'Conjured' }));
    await userEvent.click(within(flags).getByRole('button', { name: 'Stays in the loot when looted' }));
    // Off is written as 0, not dropped: an existing item\'s flag could not be cleared otherwise
    expect(latest.advanced.Flags).toBe('0');
  });

  it('names the sockets and who can use the item', async () => {
    reset();
    render(<Itm start={newItem(9500001)} />);
    await tab('Flags & sockets');
    await userEvent.selectOptions(screen.getByLabelText('Socket 1'), 'Red');
    await userEvent.selectOptions(screen.getByLabelText('Socket 2'), 'Blue');
    await userEvent.click(within(screen.getByRole('group', { name: 'Classes that can use it' })).getByRole('button', { name: 'Paladin' }));
    expect(latest.advanced).toMatchObject({ socketColor_1: '2', socketColor_2: '8', AllowableClass: '2' });
  });
});

describe('problems under a sheet', () => {
  it('names a loot row that drops nothing', async () => {
    reset();
    render(<Npc start={newNpc(12000001)} />);
    await tab('Rewards');
    const pick = await screen.findByRole('region', { name: 'Skinning loot' });
    await userEvent.click(within(pick).getByRole('button', { name: 'Give it a list' }));
    const list = await screen.findByRole('region', { name: 'Skinning loot' });
    await userEvent.click(within(list).getByRole('button', { name: 'Add item' }));
    expect(await within(list).findByRole('list', { name: 'Problems' })).toHaveTextContent('row 1 has no item and no reference list');
  });
});
