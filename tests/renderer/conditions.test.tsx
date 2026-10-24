// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConditionsEditor } from '../../src/renderer/tables/ConditionsEditor';
import { Sheet } from '../../src/renderer/tables/Sheet';
import { VendorList } from '../../src/renderer/entities/VendorList';
import { NpcEditor } from '../../src/renderer/entities/npc/NpcEditor';
import { ObjectEditor } from '../../src/renderer/entities/object/ObjectEditor';
import { NamesProvider } from '../../src/renderer/state/names';
import { ProjectEntitiesProvider, type ProjectEntitiesValue } from '../../src/renderer/state/project-entities';
import { makeMockApi, okv } from './mock-api';
import { EMPTY_ENTITIES, newNpc, newObject, type CustomNpc, type CustomObject, type ProjectEntities } from '../../src/core/entities/model';
import { specOf } from '../../src/core/tables/specs';
import { EMPTY_WORLD } from '../../src/core/world/layer';
import type { Row } from '../../src/core/tables/types';

afterEach(cleanup);

let store: ProjectEntities = EMPTY_ENTITIES;
const db: Record<string, Row[]> = {};
const tableRows = vi.fn(async (table: string, scope: Record<string, string>) =>
  okv({ exists: true, columns: [], rows: (db[table] ?? []).filter((r) => Object.entries(scope).every(([c, v]) => r[c] === v)) }));
const api = () => makeMockApi({ tableRows });

function Project({ children }: { children: React.ReactNode }) {
  const [entities, setEntities] = useState<ProjectEntities>(store);
  const value = { entities, setEntities: (next: ProjectEntities) => { store = next; setEntities(next); }, quests: [], layer: EMPTY_WORLD, setLayer: () => {}, tracked: [], create: vi.fn(), remove: vi.fn(), adopt: vi.fn(), ensure: vi.fn() } as unknown as ProjectEntitiesValue;
  return <NamesProvider api={api()}><ProjectEntitiesProvider value={value}>{children}</ProjectEntitiesProvider></NamesProvider>;
}
const reset = (): void => {
  store = EMPTY_ENTITIES;
  for (const k of Object.keys(db)) delete db[k];
};
const cond = () => (store.rowsets ?? []).find((s) => s.table === 'conditions');

describe('the condition builder', () => {
  it('starts with no conditions, and says so in a sentence', async () => {
    reset();
    render(<Project><ConditionsEditor source={{ type: 15, group: 2000, entry: 1 }} idPrefix="t" /></Project>);
    expect(await screen.findByText('No conditions: it always applies.')).toBeTruthy();
  });

  it('adds conditions with named types and fields for what each reads, joined by and / or', async () => {
    reset();
    render(<Project><ConditionsEditor source={{ type: 15, group: 2000, entry: 1 }} owner={{ kind: 'creature', entry: 5 }} idPrefix="t" /></Project>);
    await userEvent.click(await screen.findByRole('button', { name: 'Add a condition' }));
    // A quest in the log, the first thing most gossip options need
    expect(screen.getByLabelText('Condition 1')).toHaveValue('9');
    expect(cond()).toMatchObject({ scope: { SourceTypeOrReferenceId: '15', SourceGroup: '2000', SourceEntry: '1', SourceId: '0' }, owner: { kind: 'creature', entry: 5 } });
    await userEvent.selectOptions(screen.getByLabelText('Condition 1'), 'Class');
    expect(screen.getByRole('button', { name: 'Warrior' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Paladin' }));
    await userEvent.click(screen.getByLabelText('Must NOT hold'));
    expect(cond()!.rows[0]).toMatchObject({ ConditionTypeOrReference: '15', ConditionValue1: '2', NegativeCondition: '1', ElseGroup: '0' });
    expect(screen.getByText('Applies when (not (the player is of class paladin)).')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Add a condition (and)' }));
    expect(cond()!.rows[1]).toMatchObject({ ElseGroup: '0', ConditionTypeOrReference: '9' });
    await userEvent.click(screen.getByRole('button', { name: 'Add an alternative (or)' }));
    expect(cond()!.rows[2]).toMatchObject({ ElseGroup: '1' });
    expect(screen.getByText('Either all of')).toBeTruthy();
    expect(screen.getByText('Or all of')).toBeTruthy();
    expect(screen.getByText(/Applies when \(not \(the player is of class paladin\) and the player has quest 0 in the log\) or \(the player has quest 0 in the log\)\./)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Remove condition 3' }));
    expect(cond()!.rows).toHaveLength(2);
  });

  it('shows conditions the database already has, and changing the type starts its values over', async () => {
    reset();
    db.conditions = [{ SourceTypeOrReferenceId: '15', SourceGroup: '2000', SourceEntry: '1', SourceId: '0', ElseGroup: '0', ConditionTypeOrReference: '8', ConditionTarget: '0', ConditionValue1: '25', ConditionValue2: '0', ConditionValue3: '0', NegativeCondition: '0', ErrorType: '0', ErrorTextId: '0', ScriptName: '', Comment: '' }];
    render(<Project><ConditionsEditor source={{ type: 15, group: 2000, entry: 1 }} idPrefix="t" /></Project>);
    expect(await screen.findByText('Applies when (the player has completed quest 25).')).toBeTruthy();
    expect(cond()).toBeUndefined();
    await userEvent.selectOptions(screen.getByLabelText('Condition 1'), 'Level');
    expect(cond()!.rows[0]).toMatchObject({ ConditionTypeOrReference: '27', ConditionValue1: '0', ConditionValue2: '0' });
  });

  it('keys a SmartAI event by its row id and script, in source 22', async () => {
    reset();
    render(<Project><ConditionsEditor source={{ type: 22, group: 4, entry: 1423, id: 0 }} idPrefix="t" /></Project>);
    await userEvent.click(await screen.findByRole('button', { name: 'Add a condition' }));
    expect(cond()!.scope).toEqual({ SourceTypeOrReferenceId: '22', SourceGroup: '4', SourceEntry: '1423', SourceId: '0' });
  });
});

describe('where the builder is offered', () => {
  it('under every loot row that has an item, keyed by the loot table\'s source and the list id', async () => {
    reset();
    db.pickpocketing_loot_template = [{ Entry: '77', Item: '2589', Reference: '0', Chance: '35', QuestRequired: '0', LootMode: '1', GroupId: '0', MinCount: '1', MaxCount: '1', Comment: null }];
    render(<Project><Sheet spec={specOf('pickpocketing_loot_template')!} scope={{ Entry: '77' }} idPrefix="p" /></Project>);
    const summary = await screen.findByText('Only drops when');
    await userEvent.click(summary);
    await userEvent.click(await screen.findByRole('button', { name: 'Add a condition' }));
    expect(cond()!.scope).toEqual({ SourceTypeOrReferenceId: '8', SourceGroup: '77', SourceEntry: '2589', SourceId: '0' });
  });

  it('under a vendor item, as source 23 with the vendor\'s entry', async () => {
    reset();
    render(<Project><VendorList idPrefix="v" vendor={[{ item: 2589, maxCount: 0, restockSecs: 0, extendedCost: 0 }]} onChange={() => {}} hasServerData={false} npcEntry={1423} /></Project>);
    await userEvent.click(screen.getByText('Only sold when'));
    await userEvent.click(await screen.findByRole('button', { name: 'Add a condition' }));
    expect(cond()!.scope).toMatchObject({ SourceTypeOrReferenceId: '23', SourceGroup: '1423', SourceEntry: '2589' });
  });

  it('under a gossip option, as source 15 with the menu and the option', async () => {
    reset();
    const start: CustomNpc = { ...newNpc(12000001), gossip: true, gossipMenu: { menus: [{ menuId: 60001, textId: 60001, greeting: [{ text: 'Hello', textFemale: '', probability: 1 }], options: [{ optionId: 3, icon: 0, text: 'Hi', action: { kind: 'close' }, kept: false }], locked: false }] } };
    function Gossip() {
      const [npc, setNpc] = useState(start);
      return <Project><NpcEditor npc={npc} onChange={setNpc} allocateSpawn={async () => 1} tab="gossip" /></Project>;
    }
    render(<Gossip />);
    await userEvent.click(await screen.findByText('Only shown when'));
    await userEvent.click(await screen.findByRole('button', { name: 'Add a condition' }));
    expect(cond()!.scope).toEqual({ SourceTypeOrReferenceId: '15', SourceGroup: '60001', SourceEntry: '3', SourceId: '0' });
    expect(cond()!.owner).toEqual({ kind: 'creature', entry: 12000001 });
    void within;
  });
  it('under the drops of an NPC made here, as source 1 with its own loot list', async () => {
    reset();
    const start: CustomNpc = { ...newNpc(12000001), loot: [{ item: 2589, chance: 50, min: 1, max: 1, questOnly: false }, { item: 0, chance: 100, min: 1, max: 1, questOnly: false }] };
    function Drops() {
      const [npc, setNpc] = useState(start);
      return <Project><NpcEditor npc={npc} onChange={setNpc} allocateSpawn={async () => 1} tab="loot" /></Project>;
    }
    render(<Drops />);
    // A row with no item yet has nothing to attach conditions to
    expect(screen.getAllByText('Only drops when')).toHaveLength(1);
    await userEvent.click(screen.getByText('Only drops when'));
    await userEvent.click(await screen.findByRole('button', { name: 'Add a condition' }));
    expect(cond()!.scope).toEqual({ SourceTypeOrReferenceId: '1', SourceGroup: '12000001', SourceEntry: '2589', SourceId: '0' });
    expect(cond()!.owner).toEqual({ kind: 'creature', entry: 12000001 });
  });

  it('under the drops of an existing NPC, keyed by the loot list its template names', async () => {
    reset();
    const existing: CustomNpc = {
      ...newNpc(1423), origin: { kind: 'existing', original: { creature_template: [{ entry: '1423', lootid: '1500' }] }, locked: [], sharedLoot: 0, spawnCount: 0, sharedTrainer: 0, sharedMenus: 0, sharedTexts: 0, databaseScripts: 0 } as never,
      loot: [{ item: 2589, chance: 50, min: 1, max: 1, questOnly: false }],
    };
    render(<Project><NpcEditor npc={existing} onChange={() => {}} allocateSpawn={async () => 1} tab="loot" /></Project>);
    await userEvent.click(await screen.findByText('Only drops when'));
    await userEvent.click(await screen.findByRole('button', { name: 'Add a condition' }));
    expect(cond()!.scope).toMatchObject({ SourceTypeOrReferenceId: '1', SourceGroup: '1500', SourceEntry: '2589' });
  });

  it('under the contents of a chest, as source 4', async () => {
    reset();
    const chest: CustomObject = { ...newObject(9100001), type: 'chest', loot: [{ item: 118, chance: 100, min: 1, max: 2, questOnly: false }] };
    render(<Project><ObjectEditor object={chest} onChange={() => {}} allocateSpawn={async () => 1} allocatePage={async () => 1} tab="contents" /></Project>);
    await userEvent.click(await screen.findByText('Only drops when'));
    await userEvent.click(await screen.findByRole('button', { name: 'Add a condition' }));
    expect(cond()!.scope).toEqual({ SourceTypeOrReferenceId: '4', SourceGroup: '9100001', SourceEntry: '118', SourceId: '0' });
    expect(cond()!.owner).toEqual({ kind: 'gameobject', entry: 9100001 });
  });
});
