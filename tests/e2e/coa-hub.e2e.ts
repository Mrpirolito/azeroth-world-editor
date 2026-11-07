import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../helpers/env';

// The app connects on launch from the repo's .env ("World (.env)" profile)
const cleanEnv = (env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE'));

let running: ElectronApplication | undefined;
test.afterEach(async () => {
  if (!running) return;
  await running.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as never;
  });
  await running.close();
  running = undefined;
});

/** Tiny fake model files: MD20 + version 264, SKIN and BLP2 headers */
function fixtureFiles(): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'acqc-model-'));
  const m2 = Buffer.alloc(64);
  m2.write('MD20', 0, 'ascii');
  m2.writeUInt32LE(264, 4);
  const skin = Buffer.alloc(32);
  skin.write('SKIN', 0, 'ascii');
  const blp = Buffer.alloc(32);
  blp.write('BLP2', 0, 'ascii');
  mkdirSync(dir, { recursive: true });
  const paths = [join(dir, 'ghost.m2'), join(dir, 'ghost00.skin'), join(dir, 'ghost.blp')];
  [m2, skin, blp].forEach((b, i) => writeFileSync(paths[i]!, b));
  return paths;
}

test('the CoA hub lists its cards, opens world bosses and walks the model wizard to review', async () => {
  test.setTimeout(120_000);
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...cleanEnv(process.env),
      ACQC_USER_DATA: mkdtempSync(join(tmpdir(), 'acqc-ud-')),
      ACQC_OUTPUT_DIR: mkdtempSync(join(tmpdir(), 'acqc-out-')),
    },
  });
  running = app;
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // The form is prefilled from .env; connect if the app did not do it on launch
  const connect = page.getByRole('button', { name: 'Connect', exact: true });
  if (await connect.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) {
    await page.getByLabel('Password').fill(process.env['ACQC_WORLD_DB_PASSWORD'] ?? '');
    await connect.click();
  }
  await page.getByRole('button', { name: 'CoA content' }).click();
  const hub = page.getByRole('dialog', { name: /^CoA content/ });
  for (const label of ['Tier Sets', 'World bosses', 'Scaling & Runes', 'Pools & gathering nodes', 'Model wizard', 'Quest / boss checklist']) {
    await expect(hub.getByRole('button', { name: new RegExp(`^${label.replace(/[&/]/g, '\$&')}`) })).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/coa-hub-home.png' });

  await hub.getByRole('button', { name: /^World bosses/ }).click();
  await expect(hub.getByRole('heading', { name: /World bosses/ })).toBeVisible();
  await expect(hub.getByRole('region', { name: 'World bosses' })).toBeVisible();
  await page.screenshot({ path: 'test-results/coa-hub-bosses.png' });
  await hub.getByRole('button', { name: 'All CoA content' }).click();

  await hub.getByRole('button', { name: /^Model wizard/ }).click();
  const steps = hub.getByRole('navigation', { name: 'Wizard steps' });
  await steps.getByRole('button', { name: /^1\. Type/ }).waitFor();
  await hub.getByRole('button', { name: /Mount/i }).first().click();
  await hub.getByRole('button', { name: 'Next' }).click();
  await hub.getByLabel(/^Name/).fill('Ghost');
  await hub.locator('input[type=file]').setInputFiles(fixtureFiles());
  await expect(hub.getByText(/ghost\.m2/)).toBeVisible();
  await expect(hub.getByText(/not an M2|not a \.skin|not a BLP2/)).toHaveCount(0);
  for (let i = 0; i < 5; i++) await hub.getByRole('button', { name: 'Next' }).click();
  await expect(steps.getByRole('button', { name: /^7\. Review/ })).toHaveAttribute('aria-current', 'true');
  await expect(hub.getByRole('button', { name: 'Add to project' })).toBeVisible();
  await expect(hub.getByText(/^Ids: creature/)).toBeVisible();
  await page.screenshot({ path: 'test-results/coa-hub-wizard-review.png' });
  expect(errors).toEqual([]);
});
