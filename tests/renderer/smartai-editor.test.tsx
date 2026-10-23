// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NpcEditor } from '../../src/renderer/entities/npc/NpcEditor';
import { ObjectEditor } from '../../src/renderer/entities/object/ObjectEditor';
import { NamesProvider } from '../../src/renderer/state/names';
import { makeMockApi, okv } from './mock-api';
import { newNpc, newObject, type CustomNpc, type CustomObject } from '../../src/core/entities/model';
import { SMART_ROWS_KEY } from '../../src/core/smartai/lock';
import { blankRow, withColumns, type SmartRow } from '../../src/core/smartai/row';
import { blankNpcScene } from '../../src/core/scripts/npc-scenes';

afterEach(cleanup);

const ENTRY = 12000001;
const LIST = ENTRY * 100;
const row = (over: Record<string, number | string>, owner = ENTRY, source = 0): SmartRow => withColumns(blankRow(owner, source, 0), over);
const ROWS: SmartRow[] = [
  row({ id: 0, event_type: 4, action_type: 1, action_param1: 0, target_type: 1, comment: 'On aggro say' }),
  row({ id: 1, event_type: 0, event_param1: 2000, event_param2: 4000, event_param3: 8000, event_param4: 9000, event_phase_mask: 1, action_type: 11, action_param1: 116, target_type: 2 }),
  row({ id: 2, link: 3, event_type: 2, event_param2: 30, action_type: 11, action_param1: 133, target_type: 2 }),
  row({ id: 3, event_type: 61, action_type: 80, action_param1: LIST, action_param2: 2, target_type: 7 }),
  row({ id: 0, event_type: 0, action_type: 1, action_param1: 2, target_type: 1, comment: 'list step' }, LIST, 9),
];
const existing = (over: object = {}) =>
  ({ kind: 'existing' as const, original: { creature_template: [{ entry: String(ENTRY), AIName: 'SmartAI', ScriptName: '' }], [SMART_ROWS_KEY]: ROWS }, sharedLoot: 0, spawnCount: 1, locked: [], ...over }) as CustomNpc['origin'];

let current: CustomNpc = newNpc(ENTRY);
function Live({ start }: { start: CustomNpc }) {
  const [npc, setNpc] = useState(start);
  current = npc;
  const api = makeMockApi({
    smartScripts: vi.fn(async () => okv({ rows: [], texts: [{ group: 0, id: 0, text: 'Grrr, me smash' }] })),
    lookupNames: vi.fn(async (kind: string, ids: number[]) => okv(kind === 'creature' || kind === 'quest' ? {} : Object.fromEntries(ids.map((id) => [id, `${kind} ${id}`])))),
  });
  return (
    <NamesProvider api={api}>
      <NpcEditor npc={npc} onChange={(n) => { current = n; setNpc(n); }} allocateSpawn={async () => 900} tab="scripts" />
    </NamesProvider>
  );
}
const npcWith = (over: Partial<CustomNpc> = {}): CustomNpc => ({ ...newNpc(ENTRY), name: 'Hogger', origin: existing(), ...over });
const open = async () => {
  render(<Live start={npcWith()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Edit the SmartAI rows' }));
};

describe('the SmartAI editor in the NPC Scripts tab', () => {
  it('leaves the database rows alone until they are opened, and says how many there are', () => {
    render(<Live start={npcWith()} />);
    expect(screen.getByText(/runs 5 SmartAI rows on this NPC/)).toBeInTheDocument();
    expect(current.smartScripts).toBeNull();
  });

  it('opens the rows as ordered cards with a plain sentence for each, linked steps chained under their card', async () => {
    await open();
    expect(current.smartScripts).toHaveLength(5);
    const cards = screen.getAllByRole('article');
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(['Card 1', 'Card 2', 'Card 3']);
    expect(within(cards[0]!).getByText('When it enters combat')).toBeInTheDocument();
    expect(within(cards[0]!).getByText(/say text group 0/)).toBeInTheDocument();
    expect(within(cards[1]!).getByText(/in phase 1/)).toBeInTheDocument();
    // Row 2 links to row 3: one card, the second step "Then"
    expect(within(cards[2]!).getAllByText('Then').length).toBeGreaterThan(0);
    expect(within(cards[2]!).getByText(/run action list 1200000100/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('5 rows in 2 scripts');
  });

  it('names a text group with what it says, and a spell by the name it was looked up under', async () => {
    await open();
    await waitFor(() => expect(screen.getAllByText(/"Grrr, me smash"/).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText(/cast spell 116 \(116\)/)).toBeInTheDocument());
  });

  it('changes an action with a searchable picker, and the parameters start over for the new action', async () => {
    await open();
    const [action] = screen.getAllByRole('combobox', { name: 'Action' });
    await userEvent.click(action!);
    await userEvent.type(action!, 'despawn');
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Action choices' })).getByRole('option', { name: /^Despawn/ }));
    expect(current.smartScripts![0]).toMatchObject({ action_type: '41', action_param1: '0' });
    expect(screen.getAllByRole('article')[0]).toHaveTextContent('despawn');
    // The other rows are as they were
    expect(current.smartScripts![1]).toMatchObject({ action_type: '11', action_param1: '116' });
  });

  it('shows the parameters of a type by meaning, with phases and flags as named toggles', async () => {
    await open();
    const timer = screen.getAllByRole('article')[1]!;
    expect(within(timer).getByRole('spinbutton', { name: 'First fire: at least (ms)' })).toHaveValue(2000);
    expect(within(timer).getByRole('spinbutton', { name: 'Repeat: at most (ms)' })).toHaveValue(9000);
    await userEvent.clear(within(timer).getByRole('spinbutton', { name: 'Repeat: at most (ms)' }));
    await userEvent.type(within(timer).getByRole('spinbutton', { name: 'Repeat: at most (ms)' }), '12000');
    expect(current.smartScripts![1]).toMatchObject({ event_param4: '12000' });
    await userEvent.click(within(timer).getByRole('button', { name: 'Phase 2' }));
    expect(current.smartScripts![1]).toMatchObject({ event_phase_mask: '3' });
    await userEvent.click(within(timer).getByRole('button', { name: 'Run only once' }));
    expect(current.smartScripts![1]).toMatchObject({ event_flags: '1' });
    await userEvent.clear(within(timer).getByRole('spinbutton', { name: 'Chance it fires (%)' }));
    await userEvent.type(within(timer).getByRole('spinbutton', { name: 'Chance it fires (%)' }), '40');
    expect(current.smartScripts![1]).toMatchObject({ event_chance: '40' });
    expect(within(timer).getByText(/in phase 1 or 2, 40% of the time, only once/)).toBeInTheDocument();
  });

  it('keeps every raw column in a folded Advanced section', async () => {
    await open();
    const first = screen.getAllByRole('article')[0]!;
    await userEvent.type(within(first).getByLabelText('comment'), '!');
    expect(current.smartScripts![0]).toMatchObject({ comment: 'On aggro say!' });
    expect(within(first).getByLabelText('target_o')).toHaveValue('0');
  });

  it('adds a card, adds a step after one, and removes one', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
    expect(current.smartScripts).toHaveLength(6);
    expect(current.smartScripts![5]).toMatchObject({ entryorguid: String(ENTRY), source_type: '0', id: '4', event_type: '4', event_chance: '100' });
    await userEvent.click(within(screen.getAllByRole('article')[0]!).getByRole('button', { name: 'Then do something else' }));
    expect(current.smartScripts![0]).toMatchObject({ link: '5' });
    expect(current.smartScripts![6]).toMatchObject({ id: '5', event_type: '61' });
    await userEvent.click(within(screen.getAllByRole('article')[0]!).getAllByRole('button', { name: 'Remove step' })[1]!);
    expect(current.smartScripts).toHaveLength(6);
    expect(current.smartScripts![0]).toMatchObject({ id: '0', link: '0' });
  });

  it('opens the action list an action calls, edits it as steps, and can make a list that is missing', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: `Open action list ${LIST}` }));
    expect(screen.getByRole('tab', { name: `Action list ${LIST}` })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('article', { name: 'Card 1' })).toHaveTextContent('say text group 2');
    // Only the events a timed list supports are offered
    const [event] = screen.getAllByRole('combobox', { name: 'Event' });
    await userEvent.click(event!);
    expect(within(screen.getByRole('listbox', { name: 'Event choices' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['Timer, in combat0']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Add step' }));
    expect(current.smartScripts![5]).toMatchObject({ entryorguid: String(LIST), source_type: '9', id: '1', event_type: '0' });
    await userEvent.click(screen.getByRole('tab', { name: 'Hogger' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add action list' }));
    expect(current.smartScripts!.at(-1)).toMatchObject({ entryorguid: String(LIST + 1), source_type: '9', id: '0' });
  });

  it('points at rows that cannot work, next to the row', async () => {
    await open();
    const first = screen.getAllByRole('article')[0]!;
    const [action] = within(first).getAllByRole('combobox', { name: 'Action' });
    await userEvent.click(action!);
    await userEvent.type(action!, '80');
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Action choices' })).getByRole('option'));
    await userEvent.clear(within(first).getByRole('spinbutton', { name: 'Action list' }));
    await userEvent.type(within(first).getByRole('spinbutton', { name: 'Action list' }), '777');
    expect(within(first).getByRole('list', { name: 'Problems with this row' })).toHaveTextContent('Warning: Action list 777 has no rows here.');
    expect(screen.getByRole('status')).toHaveTextContent('1 warning');
    await userEvent.clear(within(first).getByRole('spinbutton', { name: 'Chance it fires (%)' }));
    await userEvent.type(within(first).getByRole('spinbutton', { name: 'Chance it fires (%)' }), '250');
    expect(within(first).getByRole('list', { name: 'Problems with this row' })).toHaveTextContent('Error: The chance must be from 0 to 100.');
    expect(screen.getByRole('status')).toHaveTextContent('1 error');
  });

  it('gives the rows back to the database when the author leaves them alone', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Leave the database rows as they are' }));
    expect(current.smartScripts).toBeNull();
  });
});

describe('when the rows cannot be edited', () => {
  it('says why for an NPC with scenes, a fight, another AI, or rows that were never read', () => {
    const scene = { ...blankNpcScene('s1'), name: 'Hello' };
    render(<Live start={npcWith({ scenes: [scene] })} />);
    expect(screen.getByRole('button', { name: 'Edit the SmartAI rows' })).toBeDisabled();
    expect(screen.getByText(/has scenes, which write SmartAI rows of their own/)).toBeInTheDocument();
    cleanup();
    render(<Live start={npcWith({ origin: existing({ original: { creature_template: [{ entry: String(ENTRY), AIName: 'ReactorAI', ScriptName: '' }], [SMART_ROWS_KEY]: ROWS } }) })} />);
    expect(screen.getByRole('button', { name: 'Edit the SmartAI rows' })).toBeDisabled();
    expect(screen.getByText(/Its AI is not SmartAI/)).toBeInTheDocument();
    cleanup();
    render(<Live start={npcWith({ origin: existing({ original: { creature_template: [{ entry: String(ENTRY), AIName: 'SmartAI', ScriptName: '' }] } }) })} />);
    expect(screen.getByRole('button', { name: 'Write SmartAI rows' })).toBeDisabled();
    expect(screen.getByText(/before its SmartAI rows were read/)).toBeInTheDocument();
  });

  it('lets a new NPC write rows from nothing', async () => {
    render(<Live start={{ ...newNpc(ENTRY), name: 'Scout' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write SmartAI rows' }));
    expect(current.smartScripts).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
    expect(current.smartScripts).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'Card 1' })).toBeInTheDocument();
  });
});

describe('the SmartAI editor in the object Scripts tab', () => {
  it('opens the rows of an existing object', async () => {
    let object: CustomObject = newObject(2000);
    function Host() {
      const [o, setO] = useState<CustomObject>({
        ...newObject(2000), name: 'Lever',
        origin: { kind: 'existing', original: { gameobject_template: [{ entry: '2000', AIName: 'SmartGameObjectAI', ScriptName: '' }], [SMART_ROWS_KEY]: [row({ event_type: 64, action_type: 9 }, 2000, 1)] }, sharedLoot: 0, spawnCount: 0, locked: [] },
      });
      object = o;
      return <NamesProvider api={makeMockApi()}><ObjectEditor object={o} onChange={(n) => { object = n; setO(n); }} allocateSpawn={async () => 1} allocatePage={async () => 1} tab="scripts" /></NamesProvider>;
    }
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit the SmartAI rows' }));
    expect(object.smartScripts).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'Card 1' })).toHaveTextContent('When a player talks to it');
    expect(screen.getByRole('article', { name: 'Card 1' })).toHaveTextContent('use the target object');
  });
});
