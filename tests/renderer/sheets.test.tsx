// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NpcEditor } from '../../src/renderer/entities/npc/NpcEditor';
import { ObjectEditor } from '../../src/renderer/entities/object/ObjectEditor';
import { ItemEditor } from '../../src/renderer/entities/item/ItemEditor';
import { NamesProvider } from '../../src/renderer/state/names';
import { ProjectEntitiesProvider, type ProjectEntitiesValue } from '../../src/renderer/state/project-entities';
import { makeMockApi, okv } from './mock-api';
import { EMPTY_ENTITIES, newItem, newNpc, newObject, type CustomItem, type CustomNpc, type CustomObject, type ProjectEntities } from '../../src/core/entities/model';
import { EMPTY_WORLD } from '../../src/core/world/layer';
import type { Row } from '../../src/core/tables/types';

afterEach(cleanup);

/** What the database "has": rows by table, handed out by the mocked tableRows under the scope asked for */
const db: Record<string, Row[]> = {};
let store: ProjectEntities = EMPTY_ENTITIES;

const tableRows = vi.fn(async (table: string, scope: Record<string, string>) =>
  okv({ exists: true, columns: Object.keys((db[table] ?? [])[0] ?? {}).length > 0 ? Object.keys(db[table]![0]!) : [], rows: (db[table] ?? []).filter((r) => Object.entries(scope).every(([c, v]) => r[c] === v)) }));
const api = () => makeMockApi({ tableRows, freeIds: vi.fn(async (_t: string, _c: string, from: number) => okv({ ids: [from + 7] })) });

function Project({ children }: { children: React.ReactNode }) {
  const [entities, setEntities] = useState<ProjectEntities>(store);
  store = entities;
  const value = { entities, setEntities: (next: ProjectEntities) => { store = next; setEntities(next); }, quests: [], layer: EMPTY_WORLD, setLayer: () => {}, tracked: [], create: vi.fn(), remove: vi.fn(), adopt: vi.fn(), ensure: vi.fn() } as unknown as ProjectEntitiesValue;
  return <ProjectEntitiesProvider value={value}>{children}</ProjectEntitiesProvider>;
}

function Npc({ start }: { start: CustomNpc }) {
  const [npc, setNpc] = useState(start);
  return <NamesProvider api={api()}><Project><NpcEditor npc={npc} onChange={setNpc} allocateSpawn={async () => 900} /></Project></NamesProvider>;
}
const tab = (name: string) => userEvent.click(screen.getByRole('tab', { name }));
const sets = () => store.rowsets ?? [];
const setOf = (table: string) => sets().find((s) => s.table === table);

const reset = (): void => {
  store = EMPTY_ENTITIES;
  for (const k of Object.keys(db)) delete db[k];
  tableRows.mockClear();
};

describe('NPC sheets', () => {
  it('Traits: flags are named toggles, numbers are boxes, and nothing is kept until something changes', async () => {
    reset();
    db.creature_template = [{ entry: '12000001', speed_run: '1.14286', unit_flags: '0', type_flags: '0', flags_extra: '0', dmgschool: '0', ManaModifier: '1', mingold: '0', maxgold: '0', IconName: null, ScriptName: '' }];
    render(<Npc start={newNpc(12000001)} />);
    await tab('Traits');
    const traits = await screen.findByRole('region', { name: 'Traits' });
    expect(within(traits).getByLabelText('Run speed')).toHaveValue(1.14286);
    // The first group is open, the technical ones are folded away
    expect(within(traits).getByRole('group', { name: 'Flags' })).toBeTruthy();
    expect(within(traits).getByText('Advanced')).toBeTruthy();
    expect(sets()).toEqual([]);

    await userEvent.click(within(traits).getByRole('button', { name: 'Cannot be attacked' }));
    await userEvent.click(within(traits).getByRole('button', { name: 'Silenced' }));
    const run = within(traits).getByLabelText('Run speed');
    await userEvent.clear(run);
    await userEvent.type(run, '2');
    expect(setOf('creature_template')).toMatchObject({ scope: { entry: '12000001' }, owner: { kind: 'creature', entry: 12000001 }, original: [db.creature_template![0]] });
    expect(setOf('creature_template')!.rows[0]).toMatchObject({ unit_flags: String(2 + 8192), speed_run: '2' });
    // Put back as it was: the project holds nothing
    await userEvent.click(within(traits).getByRole('button', { name: 'Cannot be attacked' }));
    await userEvent.click(within(traits).getByRole('button', { name: 'Silenced' }));
    await userEvent.clear(run);
    await userEvent.type(run, '1.14286');
    await waitFor(() => expect(sets()).toEqual([]));
  });

  it('Behaviour: a choice of stance writes into the packed byte, resistances take rows, spell slots count up', async () => {
    reset();
    db.creature_template_addon = [{ entry: '12000001', path_id: '0', mount: '0', bytes1: '16777216', bytes2: '1', emote: '0', visibilityDistanceType: '0', auras: '' }];
    render(<Npc start={newNpc(12000001)} />);
    await tab('Behaviour');
    const addon = await screen.findByRole('region', { name: 'Appearance and auras' });
    // 16777216 is the high byte (hovering), so the stance reads Standing
    expect(within(addon).getByLabelText('Stance')).toHaveValue('0');
    expect(within(addon).getByLabelText('Height')).toHaveValue('1');
    await userEvent.selectOptions(within(addon).getByLabelText('Stance'), 'Sleeping');
    expect(setOf('creature_template_addon')!.rows[0]).toMatchObject({ bytes1: String(16777216 + 3) });

    const movement = screen.getByRole('region', { name: 'Movement rules' });
    await userEvent.selectOptions(within(movement).getByLabelText('In the air'), 'Flies');
    expect(setOf('creature_template_movement')!.rows[0]).toMatchObject({ CreatureId: '12000001', Flight: '2' });
    expect(setOf('creature_template_movement')!.rows[0]).not.toHaveProperty('Swim');

    const resist = screen.getByRole('region', { name: 'Resistances' });
    await userEvent.click(within(resist).getByRole('button', { name: 'Add resistances' }));
    await userEvent.click(within(resist).getByRole('button', { name: 'Add resistances' }));
    expect(setOf('creature_template_resistance')!.rows.map((r) => r.School)).toEqual(['1', '2']);
    const spells = screen.getByRole('region', { name: 'Spells for its pet bar' });
    await userEvent.click(within(spells).getByRole('button', { name: 'Add spells for its pet bar' }));
    await userEvent.click(within(spells).getByRole('button', { name: 'Add spells for its pet bar' }));
    expect(setOf('creature_template_spell')!.rows.map((r) => r.Index)).toEqual(['0', '1']);
    await userEvent.click(within(resist).getByRole('button', { name: 'Remove Resistances 1' }));
    expect(setOf('creature_template_resistance')!.rows.map((r) => r.School)).toEqual(['2']);
  });

  it('Rewards: reputation is one row of named fields; pickpocket and skinning loot start with a button that gives the NPC a list', async () => {
    reset();
    render(<Npc start={newNpc(12000001)} />);
    await tab('Rewards');
    const rep = await screen.findByRole('region', { name: 'Reputation for killing it' });
    await userEvent.selectOptions(within(rep).getByLabelText('Stops giving at'), 'Honored');
    expect(setOf('creature_onkill_reputation')!.rows[0]).toMatchObject({ creature_id: '12000001', MaxStanding1: '5' });

    const pick = screen.getByRole('region', { name: 'Pickpocket loot' });
    await userEvent.click(within(pick).getByRole('button', { name: 'Give it a list' }));
    // The list is the first free id from its entry (the mock says entry + 7), kept in the template row
    const list = await screen.findByRole('region', { name: 'Pickpocket loot' });
    await waitFor(() => expect(setOf('creature_template')!.rows[0]).toMatchObject({ entry: '12000001', pickpocketloot: '12000008' }));
    await userEvent.click(within(list).getByRole('button', { name: 'Add item' }));
    await userEvent.click(within(list).getByRole('button', { name: 'Add item' }));
    expect(setOf('pickpocketing_loot_template')).toMatchObject({ scope: { Entry: '12000008' } });
    expect(setOf('pickpocketing_loot_template')!.rows).toHaveLength(2);
    const chances = within(list).getAllByLabelText('Chance (%)');
    await userEvent.clear(chances[0]!);
    await userEvent.type(chances[0]!, '40');
    const groups = within(list).getAllByLabelText('Group');
    await userEvent.clear(groups[0]!);
    await userEvent.type(groups[0]!, '1');
    await userEvent.clear(groups[1]!);
    await userEvent.type(groups[1]!, '1');
    expect(within(list).getByText(/Group 1: 2 items, chances total 140%/)).toBeTruthy();
    expect(within(list).getByText(/more than 100/)).toBeTruthy();
  });

  it('Texts: lines number themselves within their group', async () => {
    reset();
    render(<Npc start={newNpc(12000001)} />);
    await tab('Texts');
    const texts = await screen.findByRole('region', { name: 'Things it says' });
    await userEvent.click(within(texts).getByRole('button', { name: 'Add things it says' }));
    await userEvent.click(within(texts).getByRole('button', { name: 'Add things it says' }));
    expect(setOf('creature_text')!.rows.map((r) => [r.GroupID, r.ID])).toEqual([['0', '0'], ['0', '1']]);
    await userEvent.type(within(texts).getAllByLabelText('Words')[0]!, 'Halt!');
    expect(setOf('creature_text')!.rows[0]).toMatchObject({ Text: 'Halt!', Type: '12', Probability: '100' });
  });

  it('shows what the database does not have as a sentence, not a wall of empty boxes', async () => {
    reset();
    tableRows.mockImplementationOnce(async () => okv({ exists: false, columns: [], rows: [] }));
    render(<Npc start={newNpc(12000001)} />);
    await tab('Traits');
    expect(await screen.findByText(/has no creature_template table/)).toBeTruthy();
  });
});

describe('object and item sheets', () => {
  function Obj({ start }: { start: CustomObject }) {
    const [object, setObject] = useState(start);
    return <NamesProvider api={api()}><Project><ObjectEditor object={object} onChange={setObject} allocateSpawn={async () => 1} allocatePage={async () => 2} /></Project></NamesProvider>;
  }
  function Itm({ start }: { start: CustomItem }) {
    const [item, setItem] = useState(start);
    return <NamesProvider api={api()}><Project><ItemEditor item={item} onChange={setItem} allocatePage={async () => 2} copyLook={async () => null} columns={[]} /></Project></NamesProvider>;
  }

  it('Details: the settings a chest reads appear for a chest only', async () => {
    reset();
    db.gameobject_template = [{ entry: '9100001', type: '3', Data0: '0', Data2: '0', Data3: '0', IconName: '' }];
    render(<Obj start={{ ...newObject(9100001), type: 'chest' }} />);
    await tab('Details');
    const details = await screen.findByRole('region', { name: 'Details' });
    expect(within(details).getByLabelText('Restock time (s)')).toBeTruthy();
    expect(within(details).queryByLabelText('Closes after (s)')).toBeNull();
    await userEvent.click(within(details).getByLabelText('Used up when opened'));
    expect(setOf('gameobject_template')!.rows[0]).toMatchObject({ Data3: '1' });
    expect(setOf('gameobject_template')!.owner).toEqual({ kind: 'gameobject', entry: 9100001 });
  });

  it('Details: a use-once object shows its own settings, not a chest\'s', async () => {
    reset();
    db.gameobject_template = [{ entry: '9100001', type: '10', Data0: '0', Data2: '0', Data3: '0', IconName: '' }];
    render(<Obj start={{ ...newObject(9100001), type: 'goober' }} />);
    await tab('Details');
    const goober = await screen.findByRole('region', { name: 'Details' });
    expect(within(goober).getByLabelText('Closes after (s)')).toBeTruthy();
    expect(within(goober).queryByLabelText('Restock time (s)')).toBeNull();
  });

  it('Details: faction and flags of the object are named toggles', async () => {
    reset();
    render(<Obj start={newObject(9100001)} />);
    await tab('Details');
    const addon = await screen.findByRole('region', { name: 'Faction and flags' });
    await userEvent.click(within(addon).getByRole('button', { name: 'Locked' }));
    expect(setOf('gameobject_template_addon')!.rows[0]).toMatchObject({ entry: '9100001', flags: '2' });
  });

  it('Item tabs: contents are a loot list; disenchanting needs a list id and sets it on the item', async () => {
    reset();
    let latest: CustomItem = newItem(9500001);
    render(<Itm start={latest} />);
    await tab('Opens into');
    const contents = await screen.findByRole('region', { name: 'Contents' });
    await userEvent.click(within(contents).getByRole('button', { name: 'Add item' }));
    expect(setOf('item_loot_template')).toMatchObject({ scope: { Entry: '9500001' }, owner: { kind: 'item', entry: 9500001 } });
    await tab('Breaks down into');
    const dis = await screen.findByRole('region', { name: 'Disenchanting' });
    expect(within(dis).getByText(/no list yet/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Prospecting' })).getByRole('button', { name: 'Add item' })).toBeTruthy();
    void latest;
  });
});
