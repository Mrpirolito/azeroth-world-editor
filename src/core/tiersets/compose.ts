import { suggestStats } from './budget';
import { emptyPiece, newTierSet, PIECES, type ArmorType, type Look, type Piece, type PieceKey, type TierSet } from './model';

/** What a client may change about a set; anything left out stays */
export interface SetPatch {
  classId?: number;
  armorType?: ArmorType;
  itemLevel?: number;
  requiredLevel?: number;
  quality?: TierSet['quality'];
  raid?: string;
  difficulty?: string;
  pieces?: Partial<Record<PieceKey, Partial<Pick<Piece, 'name' | 'inventoryType' | 'armor' | 'stats'>> & { look?: Look }>>;
}

/** Stats and armor suggested for every piece from the set's class, armor type, item level and quality */
export function withSuggestedStats(set: TierSet, only?: readonly PieceKey[]): TierSet {
  const next = structuredClone(set);
  for (const key of only ?? PIECES) {
    const { stats, armor } = suggestStats({ classId: set.classId, armorType: set.armorType, itemLevel: set.itemLevel, quality: set.quality, piece: key });
    next.pieces[key] = { ...next.pieces[key], stats, armor };
  }
  return next;
}

/** A set with a patch laid over it. A new set takes suggested stats for the pieces the patch gives none; `autoStats` suggests them again for every piece. */
export function composeSet(name: string, base: TierSet | undefined, patch: SetPatch, autoStats: boolean): TierSet {
  const classId = patch.classId ?? base?.classId;
  const armorType = patch.armorType ?? base?.armorType;
  if (classId === undefined || armorType === undefined) throw new Error('A new set needs a classId and an armorType.');
  const set = base ? structuredClone(base) : newTierSet(name, classId, armorType);
  Object.assign(set, {
    classId, armorType,
    ...(patch.itemLevel !== undefined ? { itemLevel: patch.itemLevel } : {}), ...(patch.requiredLevel !== undefined ? { requiredLevel: patch.requiredLevel } : {}),
    ...(patch.quality !== undefined ? { quality: patch.quality } : {}), ...(patch.raid !== undefined ? { raid: patch.raid } : {}), ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {}),
  });
  const given = new Set<PieceKey>();
  for (const key of PIECES) {
    const p = patch.pieces?.[key];
    if (!p) continue;
    if (p.stats || p.armor !== undefined) given.add(key);
    set.pieces[key] = { ...(set.pieces[key] ?? emptyPiece(name, key)), ...p, look: p.look ?? set.pieces[key].look };
  }
  return autoStats || !base ? withSuggestedStats(set, autoStats ? PIECES : PIECES.filter((k) => !given.has(k))) : set;
}
