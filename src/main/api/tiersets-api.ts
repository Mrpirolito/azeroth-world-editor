import { findEdit, findRecord } from '../../core/dbc/edits';
import type { Dbc, DbcValue } from '../../core/game/dbc-file';
import { layoutOf } from '../../core/game/dbc-formats';
import { idsAbove } from '../../core/ids/free';
import type { TierSetsApi } from '../../shared/ipc';
import { applyTierSet, DISPLAY_FILE, ITEMSET_FILE, removeTierSet } from '../../core/tiersets/apply';
import { fromBase64, prepareFile, withClientFile } from '../../core/tiersets/files';
import { PIECES, PIECE_INFO, type TierSet } from '../../core/tiersets/model';
import { clientItemPatchWarning, setIssues } from '../../core/tiersets/rows';
import { cleanName } from '../../core/tiersets/textures';
import type { Session } from './connection';
import { fail, run } from './errors';
import type { Services } from './services';

const LOOK_LIMIT = 30;
const DISPLAY_FORMAT = layoutOf(DISPLAY_FILE)!.format;

/** The look search escapes what LIKE reads as its own */
const likeText = (text: string): string => text.replace(/[\\'%_]/g, (c) => `\\${c}`);

/** Tier sets: saved into the project as items, client rows, an item set and client files, all in one undo step */
export function createTierSetsApi(s: Services): TierSetsApi {
  const { connected, projectEntities, putEntities, asOneStep } = s.ctx;
  const { dbcOf } = s.files;

  const fileFor = async (live: Session, file: string): Promise<Dbc> => {
    const d = await dbcOf(live, file);
    if ('reason' in d) throw fail('BAD_REQUEST', d.reason);
    return d;
  };

  /** A DBC id no record of the file or the project's edits uses, from the highest up */
  const freeIds = (d: Dbc, file: string, count: number, taken: Set<number>): number[] => {
    const held = new Set((findEdit(projectEntities().dbcEdits, file)?.records ?? []).map((r) => r.id));
    let high = 0;
    for (let r = 0; r < d.count; r += 1) high = Math.max(high, d.word(r, 0));
    for (const id of held) high = Math.max(high, id);
    const out: number[] = [];
    for (let id = high + 1; out.length < count; id += 1) if (!taken.has(id)) { taken.add(id); out.push(id); }
    return out;
  };

  const itemEntries = async (live: Session, count: number): Promise<number[]> => {
    let max = 0;
    for (const [table, column] of [['item_template', 'entry'], ['item_dbc', 'ID']] as const) {
      try {
        max = Math.max(max, (await live.db.selectMax?.(table, column)) ?? 0);
      } catch {
        // A fork without the table has none
      }
    }
    const used = [...projectEntities().items.map((i) => i.entry), ...(projectEntities().rowsets ?? []).filter((r) => r.table === 'item_dbc').map((r) => Number(r.scope.ID))];
    return idsAbove(max, used, count);
  };

  const find = (name: string): TierSet | undefined => (projectEntities().tierSets ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase());

  return {
    tierSets: () => run(async () => projectEntities().tierSets ?? []),

    tierSetSave: (input) =>
      run(async () => {
        const live = connected();
        const issues = setIssues(input);
        const errors = issues.filter((i) => i.severity === 'error');
        if (errors.length > 0) throw fail('BAD_REQUEST', `The set has problems: ${errors.map((e) => e.message).join(' ')}`);
        const prev = find(input.name);
        const clash = (projectEntities().tierSets ?? []).find((t) => t.name.toLowerCase() !== input.name.toLowerCase() && cleanName(t.name) === cleanName(input.name));
        if (clash) throw fail('BAD_REQUEST', `The set "${clash.name}" gives the same file names; pick a different name.`);
        if (cleanName(input.name) === '') throw fail('BAD_REQUEST', 'The name needs letters or digits.');

        const set: TierSet = structuredClone(input);
        const needEntries = PIECES.filter((k) => set.pieces[k].entry === 0);
        const entries = await itemEntries(live, needEntries.length);
        needEntries.forEach((k, i) => { set.pieces[k].entry = entries[i]!; });

        const displays = await fileFor(live, DISPLAY_FILE);
        const newLooks = PIECES.filter((k) => { const l = set.pieces[k].look; return l.kind === 'new' && l.displayId === 0; });
        const taken = new Set<number>();
        const ids = freeIds(displays, DISPLAY_FILE, newLooks.length, taken);
        newLooks.forEach((k, i) => { const l = set.pieces[k].look; if (l.kind === 'new') l.displayId = ids[i]!; });

        if (set.itemSetId === 0) set.itemSetId = freeIds(await fileFor(live, ITEMSET_FILE), ITEMSET_FILE, 1, new Set())[0]!;

        // The records the new looks are copied from: the project's version of a base if it changed it, else the file's
        const bases = new Map<number, DbcValue[]>();
        for (const k of PIECES) {
          const l = set.pieces[k].look;
          if (l.kind !== 'new') continue;
          const held = findRecord(projectEntities().dbcEdits, DISPLAY_FILE, l.baseDisplayId);
          const row = displays.rowOfId(l.baseDisplayId);
          if (held) bases.set(l.baseDisplayId, held.values);
          else if (row !== undefined) bases.set(l.baseDisplayId, displays.decode(row, DISPLAY_FORMAT));
          else throw fail('BAD_REQUEST', `${PIECE_INFO[k].label}: the base look ${l.baseDisplayId} is not in ItemDisplayInfo.dbc.`);
        }

        const stored = await asOneStep(async () => {
          putEntities(applyTierSet(projectEntities(), set, prev, bases));
          return set;
        }, `Tier set ${set.name}`);
        const warning = clientItemPatchWarning(PIECES.map((k) => stored.pieces[k].entry));
        return { set: stored, issues, warnings: warning ? [warning] : [] };
      }),

    tierSetDelete: (name) =>
      run(async () => {
        const set = find(name);
        if (!set) throw fail('BAD_REQUEST', `The project has no tier set "${name}".`);
        await asOneStep(async () => putEntities(removeTierSet(projectEntities(), set)), `Remove tier set ${set.name}`);
        return true as const;
      }),

    tierSetFile: (name, piece, target, data) =>
      run(async () => {
        const set = find(name);
        if (!set) throw fail('BAD_REQUEST', `Save the tier set "${name}" before adding files to it.`);
        let file;
        try {
          file = prepareFile(set.name, piece, target, fromBase64(data));
        } catch (error) {
          throw fail('BAD_REQUEST', error instanceof Error ? error.message : String(error));
        }
        await asOneStep(async () => putEntities({ ...projectEntities(), clientFiles: withClientFile(projectEntities().clientFiles, file) }), `${set.name} ${piece}: file`);
        return { paths: file.paths };
      }),

    tierSetLooks: (piece, text) =>
      run(async () => {
        const { db } = connected();
        if (!db.selectRaw) throw fail('BAD_REQUEST', 'This connection cannot run queries.');
        const types = PIECE_INFO[piece].types.join(',');
        const needle = text.trim();
        const where = /^\d+$/.test(needle) ? `(displayid = ${Number(needle)} OR entry = ${Number(needle)})` : needle === '' ? '1' : `name LIKE '%${likeText(needle)}%'`;
        const result = await db.selectRaw(
          `SELECT displayid, MIN(name) AS name, COUNT(*) AS items FROM item_template WHERE class = 4 AND InventoryType IN (${types}) AND displayid > 0 AND ${where} GROUP BY displayid ORDER BY items DESC, displayid LIMIT ${LOOK_LIMIT}`,
        );
        return { looks: result.rows.map((r) => ({ displayId: Number(r.displayid), name: r.name ?? '', items: Number(r.items) })) };
      }),
  };
}
