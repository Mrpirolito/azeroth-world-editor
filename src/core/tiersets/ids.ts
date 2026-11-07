import type { IdUse } from '../sync/pr-checks';
import { PIECES, type TierSet } from './model';

/** The ids a tier set claims, for the PR export's check against main: bonus spells, items, the item set and new looks */
export function tierSetIds(sets: readonly TierSet[]): IdUse[] {
  const out: IdUse[] = [];
  const add = (table: string, id: number): void => { if (id > 0) out.push({ table, id: String(id) }); };
  for (const set of sets) {
    for (const b of set.bonuses) add('spell_dbc', b.spellId);
    for (const key of PIECES) {
      const piece = set.pieces[key];
      add('item_template', piece.entry);
      if (piece.look.kind === 'new') add('ItemDisplayInfo.dbc', piece.look.displayId);
    }
    add('ItemSet.dbc', set.itemSetId);
  }
  return out;
}
