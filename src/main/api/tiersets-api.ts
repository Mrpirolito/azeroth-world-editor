import { findEdit, findRecord } from '../../core/dbc/edits';
import type { Dbc, DbcValue } from '../../core/game/dbc-file';
import { layoutOf } from '../../core/game/dbc-formats';
import { idsAbove } from '../../core/ids/free';
import { npcFromRows } from '../../core/entities/from-rows';
import { vendorUnread, type CustomNpc } from '../../core/entities/model';
import { rowsOrNone } from '../../core/links/context';
import { npcLootId } from '../../core/entities/existing';
import { readExistingRows } from '../entities/existing';
import type { Row } from '../../core/tables/types';
import type { TierSetsApi } from '../../shared/ipc';
import { SPELL_INDEX } from '../../core/game/dbc-formats';
import { SPELL_FILE_NAME, spellNum, spellText } from '../../core/spells/model';
import { applyTierSet, DISPLAY_FILE, ITEMSET_FILE, removeTierSet, settleBonuses } from '../../core/tiersets/apply';
import { pendingNotes, type BonusEnv, type SpellRef } from '../../core/tiersets/bonus';
import { parseBonusText, resolveBonus } from '../../core/tiersets/bonus-text';
import { fromBase64, prepareFile, withClientFile } from '../../core/tiersets/files';
import { PIECES, PIECE_INFO, type TierSet } from '../../core/tiersets/model';
import { applyTokenGroup, COST_FILE, COST_TABLE, dropPlan, findCost, findGroup, obtainIssues, refreshTokens, removeTokenGroup, syncVendors, tierItemEntries, tokenGroupIssues, tokenGroupName, type BossInfo, type TokenGroup } from '../../core/tiersets/obtain';
import { clientItemPatchWarning, setIssues } from '../../core/tiersets/rows';
import { cleanName } from '../../core/tiersets/textures';
import { createAllocators } from './allocators';
import type { Session } from './connection';
import { fail, run } from './errors';
import type { Services } from './services';

const LOOK_LIMIT = 30;
const SPELL_FORMAT = layoutOf(SPELL_FILE_NAME)!.format;
/** Blizzard set-bonus spells: the first the client has is the pattern for the flags of a new bonus spell */
const PATTERN_SPELLS = [37594, 70805];
const DISPLAY_FORMAT = layoutOf(DISPLAY_FILE)!.format;
const COST_FORMAT = layoutOf(COST_FILE)!.format;
/** The item whose look the tokens start with: Blizzard's Chestguard of the Lost Conqueror */
const PATTERN_TOKEN = 40610;

/** The look search escapes what LIKE reads as its own */
const likeText = (text: string): string => text.replace(/[\\'%_]/g, (c) => `\\${c}`);

/** Tier sets: saved into the project as items, client rows, an item set and client files, all in one undo step */
export function createTierSetsApi(s: Services): TierSetsApi {
  const { connected, projectEntities, putEntities, asOneStep, deps } = s.ctx;
  const { fileFor, freeIds, itemEntries, spellHigh, tableMax, creatureEntry, creatureGuid } = createAllocators(s);

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

  /** The vendor of a set made ready: a new NPC has its entry and spawn guid; one that was there is in the project with its stock read */
  const settleVendor = async (live: Session, set: TierSet, prev: TierSet | undefined): Promise<{ set: TierSet; npc?: CustomNpc }> => {
    const v = set.obtain?.vendor;
    if (!v) return { set };
    const next = structuredClone(set);
    const cfg = next.obtain!.vendor!;
    if (v.created) {
      if (cfg.entry === 0) cfg.entry = prev?.obtain?.vendor?.created && prev.obtain.vendor.entry > 0 ? prev.obtain.vendor.entry : await creatureEntry(live);
      if (cfg.spawn && cfg.spawn.guid === 0) {
        const old = projectEntities().npcs.find((n) => n.entry === cfg.entry)?.spawns[0]?.guid;
        cfg.spawn.guid = old ?? (await creatureGuid(live));
      }
      return { set: next };
    }
    if (projectEntities().npcs.some((n) => n.entry === v.entry)) return { set: next };
    const read = await readExistingRows(live.db, 'npc', v.entry);
    if (!read) throw fail('BAD_REQUEST', `Vendor: NPC ${v.entry} is not in the database.`);
    const npc = { ...npcFromRows(v.entry, read.rows, { sharedLoot: read.sharedLoot, spawnCount: read.spawnCount, sharedTrainer: read.sharedTrainer, sharedMenus: read.sharedMenus, sharedTexts: read.sharedTexts, databaseScripts: read.databaseScripts }), scenes: read.scenes };
    if (vendorUnread(npc)) throw fail('BAD_REQUEST', `Vendor: the stock of NPC ${v.entry} was not read from the database, so it cannot be added to.`);
    return { set: next, npc };
  };

  const find = (name: string): TierSet | undefined => (projectEntities().tierSets ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase());

  return {
    tierSets: () => run(async () => projectEntities().tierSets ?? []),

    tierSetSave: (input) =>
      run(async () => {
        const live = connected();
        const issues = [...setIssues(input), ...obtainIssues(input, projectEntities())];
        const errors = issues.filter((i) => i.severity === 'error');
        if (errors.length > 0) throw fail('BAD_REQUEST', `The set has problems: ${errors.map((e) => e.message).join(' ')}`);
        const prev = find(input.name);
        const clash = (projectEntities().tierSets ?? []).find((t) => t.name.toLowerCase() !== input.name.toLowerCase() && cleanName(t.name) === cleanName(input.name));
        if (clash) throw fail('BAD_REQUEST', `The set "${clash.name}" gives the same file names; pick a different name.`);
        if (cleanName(input.name) === '') throw fail('BAD_REQUEST', 'The name needs letters or digits.');

        const vendored = await settleVendor(live, input, find(input.name));
        const set: TierSet = structuredClone(vendored.set);
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
          const store = vendored.npc ? { ...projectEntities(), npcs: [...projectEntities().npcs, vendored.npc] } : projectEntities();
          putEntities(syncVendors(refreshTokens(applyTierSet(store, settled, prev, bases, env)), prev));
          return settled;
        }, `Tier set ${settled.name}`);
        const warning = clientItemPatchWarning(tierItemEntries(projectEntities()));
        return { set: stored, issues, warnings: [...(warning ? [warning] : []), ...pendingNotes([stored])] };
      }),

    tierSetDelete: (name) =>
      run(async () => {
        const set = find(name);
        if (!set) throw fail('BAD_REQUEST', `The project has no tier set "${name}".`);
        await asOneStep(async () => putEntities(syncVendors(refreshTokens(removeTierSet(projectEntities(), set)), set)), `Remove tier set ${set.name}`);
        return true as const;
      }),

    tierTokenGroups: () => run(async () => projectEntities().tokenGroups ?? []),

    tierTokenGroupSave: (input) =>
      run(async () => {
        const live = connected();
        const group: TokenGroup = structuredClone(input);
        const name = tokenGroupName(group);
        const prev = findGroup(projectEntities().tokenGroups, name);
        if (group.displayId === 0) {
          const pattern = await rowsOrNone(live.db, 'item_template', { entry: [String(PATTERN_TOKEN)] });
          group.displayId = Number(pattern[0]?.displayid ?? 0);
        }
        const issues = tokenGroupIssues(group);
        const errors = issues.filter((i) => i.severity === 'error');
        if (errors.length > 0) throw fail('BAD_REQUEST', `The token group has problems: ${errors.map((e) => e.message).join(' ')}`);

        const needEntries = PIECES.filter((k) => group.entries[k] === 0);
        const entries = await itemEntries(live, needEntries.length);
        needEntries.forEach((k, i) => { group.entries[k] = entries[i]!; });

        // A cost that already asks for one of the token and nothing else is reused; the rest are new records above the file, the table and the project
        const costs = await fileFor(live, COST_FILE);
        const fresh = new Set<number>();
        const lacking = PIECES.filter((k) => group.costs[k] === 0);
        const taken = new Set<number>();
        const floor = await tableMax(live, COST_TABLE, 'ID');
        for (const k of lacking) {
          const candidates: { id: number; values: DbcValue[] }[] = [];
          for (let r = 0; r < costs.count; r += 1) if (costs.word(r, 4) === group.entries[k]) candidates.push({ id: costs.word(r, 0), values: costs.decode(r, COST_FORMAT) });
          for (const rec of findEdit(projectEntities().dbcEdits, COST_FILE)?.records ?? []) candidates.push({ id: rec.id, values: rec.values });
          const reused = findCost(group.entries[k], candidates);
          if (reused !== undefined) group.costs[k] = reused;
          else {
            group.costs[k] = freeIds(costs, COST_FILE, 1, taken, floor)[0]!;
            fresh.add(group.costs[k]);
          }
        }

        // The bosses and the creatures of their other difficulties, then the loot rows the database has for the tables the drops write to
        const infoOf = (r: Record<string, string | null>): BossInfo => ({
          entry: Number(r.entry), name: r.name ?? '', lootId: Number(r.lootid ?? 0),
          diff: [Number(r.difficulty_entry_1 ?? 0), Number(r.difficulty_entry_2 ?? 0), Number(r.difficulty_entry_3 ?? 0)],
        });
        const known = new Map<number, BossInfo>();
        const load = async (ids: number[]): Promise<void> => {
          const want = [...new Set(ids)].filter((id) => id > 0 && !known.has(id));
          for (const r of await rowsOrNone(live.db, 'creature_template', { entry: want.map(String) })) known.set(Number(r.entry), infoOf(r));
        };
        await load(group.drops.map((d) => d.boss));
        await load([...known.values()].flatMap((b) => [...b.diff]));
        const plan = dropPlan(group, (entry) => known.get(entry));
        const lootBase = new Map<number, Row[]>();
        for (const r of await rowsOrNone(live.db, 'creature_loot_template', { Entry: [...plan.targets.keys()].map(String) })) {
          const id = Number(r.Entry);
          lootBase.set(id, [...(lootBase.get(id) ?? []), r]);
        }
        group.drops.forEach((d) => { d.bossName = known.get(d.boss)?.name ?? d.bossName; });

        await asOneStep(async () => {
          putEntities(syncVendors(applyTokenGroup(projectEntities(), group, prev, plan, lootBase, fresh)));
          return group;
        }, `Token group ${name}`);
        const warning = clientItemPatchWarning(tierItemEntries(projectEntities()));
        const shared = projectEntities().npcs.filter((n) => n.origin.kind === 'existing' && n.loot.length > 0 && plan.targets.has(npcLootId(n)));
        const sharing = shared.map((n) => `${n.name || n.entry} is also edited in the NPC editor, whose Loot tab writes the same loot list; keep that list in one place.`);
        return { group, issues, warnings: [...(warning ? [warning] : []), ...plan.notes, ...sharing], summary: plan.summary };
      }),

    tierTokenGroupDelete: (name) =>
      run(async () => {
        const group = findGroup(projectEntities().tokenGroups, name);
        if (!group) throw fail('BAD_REQUEST', `The project has no token group "${name}".`);
        const users = (projectEntities().tierSets ?? []).filter((t) => t.obtain?.tokenGroup.toLowerCase() === tokenGroupName(group).toLowerCase());
        if (users.length > 0) throw fail('BAD_REQUEST', `The set${users.length > 1 ? 's' : ''} ${users.map((u) => u.name).join(', ')} still use${users.length > 1 ? '' : 's'} these tokens; change their obtain settings first.`);
        await asOneStep(async () => putEntities(removeTokenGroup(projectEntities(), group)), `Remove token group ${tokenGroupName(group)}`);
        return true as const;
      }),

    tierTokenLooks: (text) =>
      run(async () => {
        const { db } = connected();
        if (!db.selectRaw) throw fail('BAD_REQUEST', 'This connection cannot run queries.');
        const needle = text.trim();
        const where = /^\d+$/.test(needle) ? `(displayid = ${Number(needle)} OR entry = ${Number(needle)})` : needle === '' ? '1' : `name LIKE '%${likeText(needle)}%'`;
        const result = await db.selectRaw(
          `SELECT displayid, MIN(name) AS name, COUNT(*) AS items FROM item_template WHERE class = 15 AND subclass = 0 AND displayid > 0 AND ${where} GROUP BY displayid ORDER BY items DESC, displayid LIMIT ${LOOK_LIMIT}`,
        );
        return { looks: result.rows.map((r) => ({ displayId: Number(r.displayid), name: r.name ?? '', items: Number(r.items) })) };
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
