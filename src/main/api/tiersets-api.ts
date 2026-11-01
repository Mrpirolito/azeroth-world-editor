import { findEdit, findRecord } from '../../core/dbc/edits';
import type { Dbc, DbcValue } from '../../core/game/dbc-file';
import { layoutOf } from '../../core/game/dbc-formats';
import { idsAbove } from '../../core/ids/free';
import type { TierSetsApi } from '../../shared/ipc';
import { SPELL_INDEX } from '../../core/game/dbc-formats';
import { SPELL_FILE_NAME, spellNum, spellText } from '../../core/spells/model';
import { applyTierSet, DISPLAY_FILE, ITEMSET_FILE, removeTierSet, settleBonuses } from '../../core/tiersets/apply';
import { pendingNotes, type BonusEnv, type SpellRef } from '../../core/tiersets/bonus';
import { parseBonusText, resolveBonus } from '../../core/tiersets/bonus-text';
import { fromBase64, prepareFile, withClientFile } from '../../core/tiersets/files';
import { PIECES, PIECE_INFO, type TierSet } from '../../core/tiersets/model';
import { clientItemPatchWarning, setIssues } from '../../core/tiersets/rows';
import { cleanName } from '../../core/tiersets/textures';
import type { Session } from './connection';
import { fail, run } from './errors';
import type { Services } from './services';

const LOOK_LIMIT = 30;
const SPELL_FORMAT = layoutOf(SPELL_FILE_NAME)!.format;
/** Blizzard set-bonus spells: the first the client has is the pattern for the flags of a new bonus spell */
const PATTERN_SPELLS = [37594, 70805];
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

  /** Spells as the bonuses see them: the project's version of a record over the file's */
  const spellEnv = (spells: Dbc): BonusEnv => {
    const values = (id: number): readonly DbcValue[] | undefined => {
      const held = findRecord(projectEntities().dbcEdits, SPELL_FILE_NAME, id);
      if (held) return held.values;
      const row = spells.rowOfId(id);
      return row === undefined ? undefined : spells.decode(row, SPELL_FORMAT);
    };
    const spell = (id: number): SpellRef | undefined => {
      const v = values(id);
      return v && { id, name: spellText(v, 'Name'), icon: spellNum(v, 'SpellIconID'), classSet: spellNum(v, 'SpellClassSet'), mask: [spellNum(v, 'SpellClassMask1'), spellNum(v, 'SpellClassMask2'), spellNum(v, 'SpellClassMask3')] };
    };
    const base = PATTERN_SPELLS.map(values).find((v) => v !== undefined);
    return { spell, ...(base ? { base } : {}) };
  };

  /** The spell called this, preferring one with a family mask (the ranks share their name) */
  const spellByName = (spells: Dbc, env: BonusEnv, name: string): number | undefined => {
    const want = name.trim().toLowerCase();
    const ids: number[] = [];
    for (let r = 0; r < spells.count; r += 1) if (spells.stringAt(spells.word(r, SPELL_INDEX.Name!)).toLowerCase() === want) ids.push(spells.word(r, 0));
    for (const rec of findEdit(projectEntities().dbcEdits, SPELL_FILE_NAME)?.records ?? []) if (spellText(rec.values, 'Name').toLowerCase() === want && !ids.includes(rec.id)) ids.push(rec.id);
    return ids.find((id) => env.spell(id)?.mask.some((m) => m !== 0)) ?? ids[0];
  };

  /** The highest spell id of the file and the spell_dbc table */
  const spellHigh = async (live: Session, spells: Dbc): Promise<number> => {
    let max = 0;
    for (let r = 0; r < spells.count; r += 1) max = Math.max(max, spells.word(r, 0));
    try {
      max = Math.max(max, (await live.db.selectMax?.('spell_dbc', 'ID')) ?? 0);
    } catch {
      // A fork without the table has none
    }
    return max;
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

        // Bonus spells: each keeps the id it has; a new one takes the next above the file, spell_dbc and the project
        const spells = await fileFor(live, SPELL_FILE_NAME);
        const env = spellEnv(spells);
        const high = await spellHigh(live, spells);
        const used = [
          ...(findEdit(projectEntities().dbcEdits, SPELL_FILE_NAME)?.records ?? []).map((r) => r.id),
          ...(projectEntities().rowsets ?? []).filter((r) => r.table === 'spell_dbc').flatMap((r) => r.rows.map((row) => Number(row.ID ?? r.scope.ID))),
          ...set.bonuses.map((b) => b.spellId), ...(prev?.bonuses ?? []).map((b) => b.spellId),
        ];
        const settled = settleBonuses(set, env, (n) => idsAbove(high, used, n));

        const stored = await asOneStep(async () => {
          putEntities(applyTierSet(projectEntities(), settled, prev, bases, env));
          return settled;
        }, `Tier set ${settled.name}`);
        const warning = clientItemPatchWarning(PIECES.map((k) => stored.pieces[k].entry));
        return { set: stored, issues, warnings: [...(warning ? [warning] : []), ...pendingNotes([stored])] };
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

    tierSetBonusDraft: (text) =>
      run(async () => {
        const spells = await fileFor(connected(), SPELL_FILE_NAME);
        const env = spellEnv(spells);
        return resolveBonus(parseBonusText(text), (name) => spellByName(spells, env, name));
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
