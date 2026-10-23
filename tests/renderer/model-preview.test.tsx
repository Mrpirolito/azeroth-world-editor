// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ModelPreview } from '../../src/renderer/world3d/ModelPreview';
import { ShowInWorldProvider } from '../../src/renderer/world3d/ShowInWorldContext';

afterEach(cleanup);

describe('the model preview', () => {
  it('asks for the game client when there is none', () => {
    render(<ModelPreview kind="creature" displayId={10} />);
    expect(screen.getByText(/Set the game client folder in Settings/)).toBeTruthy();
  });

  it('says so when no display is chosen, and when an item has no model of its own', () => {
    const { rerender } = render(<ShowInWorldProvider value={() => {}}><ModelPreview kind="object" displayId={0} /></ShowInWorldProvider>);
    expect(screen.getByText('No display chosen.')).toBeTruthy();
    rerender(<ShowInWorldProvider value={() => {}}><ModelPreview kind="item" displayId={5} inventoryType={7} /></ShowInWorldProvider>);
    expect(screen.getByText(/no standalone model/)).toBeTruthy();
  });
});
