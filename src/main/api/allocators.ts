import { findEdit } from '../../core/dbc/edits';
import type { Dbc } from '../../core/game/dbc-file';
import { idsAbove } from '../../core/ids/free';
import type { Session } from './connection';
import { fail } from './errors';
import type { Services } from './services';

/** The ids authoring features hand out: above the database, the client files and what the project already holds */
export function createAllocators(s: Services) {
  const { projectEntities, deps } = s.ctx;
  const { dbcOf } = s.files;

  const fileFor = async (live: Session, file: string): Promise<Dbc> => {
    const d = await dbcOf(live, file);
    if ('reason' in d) throw fail('BAD_REQUEST', d.reason);
    return d;
  };

  /** A DBC id no record of the file or the project's edits uses, from the highest up */
  const freeIds = (d: Dbc, file: string, count: number, taken: Set<number>, floor = 0): number[] => {
    const held = new Set((findEdit(projectEntities().dbcEdits, file)?.records ?? []).map((r) => r.id));
    let high = floor;
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

  const tableMax = async (live: Session, table: string, column: string): Promise<number> => {
    try {
      return (await live.db.selectMax?.(table, column)) ?? 0;
    } catch {
      return 0;
    }
  };

  /** A made-up NPC entry or spawn guid above the database and the project (and the spawns placed in the 3D view) */
  const creatureEntry = async (live: Session): Promise<number> => idsAbove(await tableMax(live, 'creature_template', 'entry'), projectEntities().npcs.map((n) => n.entry), 1)[0]!;
  const creatureGuid = async (live: Session): Promise<number> =>
    idsAbove(await tableMax(live, 'creature', 'guid'), [...projectEntities().npcs.flatMap((n) => n.spawns.map((sp) => sp.guid)), ...deps.session.world.get().added.filter((a) => a.kind === 'creature').map((a) => a.guid)], 1)[0]!;

  return { fileFor, freeIds, itemEntries, spellHigh, tableMax, creatureEntry, creatureGuid };
}
