// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoaHub } from '../../src/renderer/coa/CoaHub';
import { NamesProvider } from '../../src/renderer/state/names';
import { ProjectEntitiesProvider, type ProjectEntitiesValue } from '../../src/renderer/state/project-entities';
import { EMPTY_ENTITIES } from '../../src/core/entities/model';
import { EMPTY_WORLD } from '../../src/core/world/layer';
import { errv, makeMockApi, okv } from './mock-api';

afterEach(cleanup);

const value = { entities: EMPTY_ENTITIES, setEntities: vi.fn(), quests: [], layer: EMPTY_WORLD, setLayer: vi.fn(), tracked: [], create: vi.fn(), remove: vi.fn(), adopt: vi.fn(), ensure: vi.fn() } as unknown as ProjectEntitiesValue;
const hub = (api: ReturnType<typeof makeMockApi>) => (
  <NamesProvider api={api}><ProjectEntitiesProvider value={value}><CoaHub onClose={() => {}} /></ProjectEntitiesProvider></NamesProvider>
);

describe('CoA content hub', () => {
  it('lists a card for every feature', () => {
    render(hub(makeMockApi()));
    for (const name of ['Tier Sets', 'World bosses', 'Scaling & Runes', 'Pools & gathering nodes', 'Model wizard', 'Quest / boss checklist']) {
      expect(screen.getByRole('button', { name: new RegExp(name.replace(/[/&]/g, '.')) })).toBeTruthy();
    }
  });

  it('shows a notice instead of failing when a table is missing', async () => {
    const api = makeMockApi({ sqlQuery: vi.fn(async () => errv('BAD_REQUEST', "Table 'x.coa_world_boss_level' doesn't exist")) });
    render(hub(api));
    await userEvent.click(screen.getByRole('button', { name: /World bosses/ }));
    await waitFor(() => expect(screen.getAllByText(/coa_world_boss_level/).length).toBeGreaterThan(1));
  });

  it('walks the model wizard to a review with the ids the server settled', async () => {
    const modelWizard = vi.fn(async () => okv({ ids: { modelData: 1, display: 2, creature: 3, spell: 4, item: 5 }, records: [], paths: [], issues: [], warnings: [], saved: false }));
    const api = makeMockApi({ modelWizard });
    render(hub(api));
    await userEvent.click(screen.getByRole('button', { name: /Model wizard/ }));
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await userEvent.type(screen.getByLabelText(/Name/), 'Sun Charger');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(modelWizard).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: /7\. Review/ }));
    expect(await screen.findByRole('button', { name: 'Add to project' })).toBeTruthy();
  });
});
