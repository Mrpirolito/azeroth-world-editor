import type { PatchStatement } from '../../core/export/build-patch';
import { patchSlug, renderPatch } from '../../core/export/render-patch';
import type { Difference } from '../../core/roundtrip/compare';
import { hasWorldChanges } from '../../core/world/layer';
import { ENTITY_KEYS } from '../../core/entities/context';
import { storeSize } from '../../core/entities/model';
import { SCRIPT_KEYS } from '../../core/scripts/context';
import { insertedIds, prBody } from '../../core/sync/pr-checks';
import { tierSetIds } from '../../core/tiersets/ids';
import { tierObtainIds } from '../../core/tiersets/obtain';
import { TOOL_VERSION } from '../../core/version';
import type { ConnectionApi, ExportApi, PrPreview, ProfileRecord, SyncApi } from '../../shared/ipc';
import { AWE_DB, loadSyncSettings, saveSyncSettings, syncMain, syncStatus, type MainSyncPorts } from '../sync/main-sync';
import { preparePr, publishPr } from '../sync/pr-export';
import { UpdateFailedError, type SyncServer } from '../sync/world-sync';
import type { ApiDeps } from './deps';
import { fail, run } from './errors';
import { KEY_COLUMNS, patchDate } from './patches';
import type { Services } from './services';

export const AWE_PROFILE = 'AWE aligned with main';

/** The profile whose server hosts awe_world: the open connection when it is not awe_world itself, else the world profile used last */
export function pickSource(profiles: readonly ProfileRecord[], currentId: number | null): ProfileRecord | null {
  const real = profiles.filter((p) => p.role === 'world' && p.database !== AWE_DB);
  const current = real.find((p) => p.id === currentId);
  if (current) return current;
  return [...real].sort((a, b) => (b.lastConnectedAt ?? '').localeCompare(a.lastConnectedAt ?? '') || b.id - a.id)[0] ?? null;
}

/** Syncing with main and exporting pull requests; both need the app's git and MySQL, so they exist only where `deps.sync` does */
export function createSyncApi(s: Services, deps: ApiDeps, parts: { connect: ConnectionApi['connect']; previewChanges: ExportApi['previewChanges'] }): SyncApi {
  const { conn, connected, quests } = s.ctx;
  const { guardProject, guardWrite } = s.checks;
  const { projectPatch, patchFor } = s.patches;
  const prepared = new Map<string, PrPreview>();

  const ports = (): MainSyncPorts => {
    if (!deps.sync) throw fail('UNKNOWN', 'Syncing with main is not available in this build.');
    return { kv: deps.store.settings, run: deps.sync.run, now: deps.now, hasCheckout: deps.sync.hasCheckout, collect: deps.sync.collect };
  };
  const server = (profileId: number): SyncServer => {
    const p = deps.store.profiles.getWithPassword(profileId);
    return { host: p.host, port: p.port, user: p.user, password: p.password };
  };
  const withDb = async <T>(profileId: number, work: (db: Awaited<ReturnType<NonNullable<ApiDeps['sync']>['openSyncDb']>>) => Promise<T>): Promise<T> => {
    const db = await deps.sync!.openSyncDb(server(profileId));
    try {
      return await work(db);
    } finally {
      await db.close();
    }
  };

  return {
    syncSettings: () => run(async () => loadSyncSettings(deps.store.settings)),
    syncSetSettings: (patch) => run(async () => saveSyncSettings(deps.store.settings, patch)),
    syncStatus: (refresh) => run(async () => syncStatus(ports(), refresh === true)),

    syncMain: (rebuild) =>
      run(async () => {
        const p = ports();
        const base = pickSource(deps.store.profiles.list(), conn.current()?.profileId ?? null);
        if (!base) throw fail('NO_DEV_PROFILE', 'Save a connection to your world database first: its server hosts awe_world.');
        const full = deps.store.profiles.getWithPassword(base.id);
        let outcome;
        try {
          outcome = await withDb(base.id, (db) => syncMain(p, db, server(base.id), rebuild === true));
        } catch (e) {
          if (e instanceof UpdateFailedError) throw fail('QUERY', `Sync stopped at ${e.message}`);
          throw e;
        }
        const existing = deps.store.profiles.list().find((x) => x.name === AWE_PROFILE);
        const saved = deps.store.profiles.save({
          id: existing?.id, name: AWE_PROFILE, role: 'world', host: full.host, port: full.port, user: full.user, database: AWE_DB,
          password: full.password, dbcDir: full.dbcDir, clientDir: full.clientDir, exportDir: full.exportDir,
        });
        const joined = await parts.connect(saved.id);
        if (!joined.ok) throw fail(joined.error.code, joined.error.message);
        return { ...outcome, connect: joined.value, status: await syncStatus(p, false) };
      }),

    exportPrPrepare: ({ title, slug }) =>
      run(async () => {
        const p = ports();
        const live = connected();
        const store = deps.session.entities.get();
        if (storeSize(store) === 0 && !hasWorldChanges(deps.session.world.get()) && quests.list().length === 0) {
          throw fail('BAD_REQUEST', 'The project has nothing to export.');
        }
        await guardProject(live);
        const project = await projectPatch(live);
        const statements: PatchStatement[] = [...project.apply];
        for (const quest of quests.list()) {
          await guardWrite(live, quest);
          statements.push(...(await patchFor(live, quest)).statements);
        }
        const differences: Difference[] = [];
        for (const quest of quests.list()) {
          const d = await parts.previewChanges(quest.questId);
          if (d.ok) differences.push(...d.value);
        }
        const theSlug = slug ?? patchSlug(title);
        const date = patchDate(deps.now());
        const sql = renderPatch(statements, project.schema, { toolVersion: TOOL_VERSION, date, label: title, lint: true });
        const claimed = [...insertedIds(statements, { ...SCRIPT_KEYS, ...ENTITY_KEYS, ...KEY_COLUMNS }), ...tierSetIds(store.tierSets ?? []), ...tierObtainIds(store)];
        const ids = claimed.filter((u, i) => claimed.findIndex((o) => o.table === u.table && o.id === u.id) === i);
        const body = prBody({ title, statements, ids, differences, warnings: project.warnings });
        const preview = await withDb(live.profileId, (db) => preparePr(p, db, { title, slug: theSlug, date, sql, ids, body }));
        prepared.set(theSlug, preview);
        return preview;
      }),

    exportPrPublish: ({ slug, confirm }) =>
      run(async () => {
        if (confirm !== true) throw fail('CONFIRMATION_REQUIRED', 'Pushing the branch and opening the pull request is public; confirm it first.');
        const preview = prepared.get(slug);
        if (!preview) throw fail('BAD_REQUEST', `Nothing is prepared for "${slug}". Prepare the pull request first.`);
        const url = await publishPr(ports(), preview);
        prepared.delete(slug);
        return { url };
      }),
  };
}
