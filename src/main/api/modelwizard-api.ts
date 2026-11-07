import { findRecord } from '../../core/dbc/edits';
import type { DbcValue } from '../../core/game/dbc-file';
import { SPELL_FORMAT } from '../../core/game/dbc-formats';
import { idsAbove } from '../../core/ids/free';
import { applyPlan } from '../../core/modelwizard/apply';
import { checkModelFile, placeFiles } from '../../core/modelwizard/model';
import { buildPlan, DISPLAY_FILE, draftIssues, MODEL_FILE, PATTERN_SPELL, type Ids } from '../../core/modelwizard/rows';
import { SPELL_FILE_NAME } from '../../core/spells/model';
import { fromBase64 } from '../../core/tiersets/files';
import type { ClientFile } from '../../core/tiersets/model';
import type { SetIssue } from '../../core/tiersets/rows';
import type { ModelWizardApi } from '../../shared/ipc';
import { createAllocators } from './allocators';
import { fail, run } from './errors';
import type { Services } from './services';

/** The custom model wizard: ids from the shared allocators, rows from `core/modelwizard`, saved as one undo step */
export function createModelWizardApi(s: Services): ModelWizardApi {
  const { connected, projectEntities, putEntities, asOneStep } = s.ctx;
  const { fileFor, freeIds, itemEntries, spellHigh, creatureEntry } = createAllocators(s);

  return {
    modelWizard: (draft, files, save) =>
      run(async () => {
        const live = connected();
        const issues: SetIssue[] = draftIssues(draft).map((message) => ({ severity: 'error', message }));
        files.forEach((f) => issues.push(...checkModelFile(f.name, fromBase64(f.data))));
        const placed = placeFiles(draft.name, files);
        issues.push(...placed.issues);

        const wantsSpell = draft.kind !== 'npc';
        const spells = await fileFor(live, SPELL_FILE_NAME);
        const heldSpells = projectEntities().dbcEdits?.find((e) => e.file.toLowerCase() === SPELL_FILE_NAME.toLowerCase())?.records.map((r) => r.id) ?? [];
        const sheetSpells = (projectEntities().rowsets ?? []).filter((r) => r.table === 'spell_dbc').flatMap((r) => r.rows.map((row) => Number(row.ID ?? r.scope.ID)));
        const ids: Ids = {
          modelData: freeIds(await fileFor(live, MODEL_FILE), MODEL_FILE, 1, new Set())[0]!,
          display: freeIds(await fileFor(live, DISPLAY_FILE), DISPLAY_FILE, 1, new Set())[0]!,
          creature: await creatureEntry(live),
          spell: wantsSpell ? idsAbove(await spellHigh(live, spells), [...heldSpells, ...sheetSpells], 1)[0]! : 0,
          item: wantsSpell ? (await itemEntries(live, 1))[0]! : 0,
        };

        const pattern = wantsSpell ? PATTERN_SPELL[draft.kind as 'mount' | 'companion'] : 0;
        const held = pattern ? findRecord(projectEntities().dbcEdits, SPELL_FILE_NAME, pattern) : undefined;
        const row = pattern ? spells.rowOfId(pattern) : undefined;
        const spellBase: readonly DbcValue[] | undefined = held ? held.values : row !== undefined ? spells.decode(row, SPELL_FORMAT) : undefined;
        const warnings: string[] = [];
        if (wantsSpell && !spellBase) warnings.push(`Spell ${pattern} (the pattern for a ${draft.kind} spell) is not in Spell.dbc, so the spell starts blank: check its cast time, flags and duration in the spell editor.`);
        if (wantsSpell) warnings.push('The item needs an Item.dbc row in the client patch and a ClientItemPatches entry in the server; export the client patch after saving.');
        if (wantsSpell && draft.itemDisplayId === 0) warnings.push('The item has no look yet (ItemDisplayInfo id 0); set its display id in the item editor.');

        const plan = buildPlan(draft, ids, { ...(spellBase ? { spell: spellBase } : {}) }, placed.textures);
        const clientFiles: ClientFile[] = files.flatMap((f, i) => (placed.paths[i] ? [{ paths: [placed.paths[i]!], data: f.data }] : []));
        const result = { ids, records: plan.dbc.map(({ file, id }) => ({ file, id })), paths: clientFiles.flatMap((f) => f.paths), issues, warnings };
        if (!save) return { ...result, saved: false };
        const errors = issues.filter((i) => i.severity === 'error');
        if (errors.length > 0) throw fail('BAD_REQUEST', `The model has problems: ${errors.map((e) => e.message).join(' ')}`);
        await asOneStep(async () => putEntities(applyPlan(projectEntities(), plan, clientFiles)), `Model ${draft.name}`);
        return { ...result, saved: true };
      }),
  };
}
