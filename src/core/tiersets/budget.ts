import { ARMOR_TYPES, PIECE_INFO, type ArmorType, type PieceKey } from './model';

/** Item stat types (ItemModType) the budget uses */
export const STAT = { agility: 3, strength: 4, intellect: 5, spirit: 6, stamina: 7, defense: 12, hit: 31, crit: 32, resilience: 35, haste: 36, expertise: 37, spellPower: 45 } as const;

/** What a class wants: its main stat and two secondary ratings. A guess for a class the game does not define; the author edits it. */
const ROLE: Record<number, readonly [number, number, number]> = {
  1: [STAT.strength, STAT.crit, STAT.expertise], 2: [STAT.strength, STAT.crit, STAT.haste], 3: [STAT.agility, STAT.crit, STAT.hit], 4: [STAT.agility, STAT.crit, STAT.haste],
  5: [STAT.intellect, STAT.haste, STAT.spirit], 6: [STAT.strength, STAT.crit, STAT.expertise], 7: [STAT.intellect, STAT.spellPower, STAT.haste], 8: [STAT.intellect, STAT.spellPower, STAT.crit],
  9: [STAT.intellect, STAT.spellPower, STAT.haste], 11: [STAT.intellect, STAT.spellPower, STAT.haste],
  12: [STAT.strength, STAT.crit, STAT.expertise], 13: [STAT.intellect, STAT.spellPower, STAT.haste], 14: [STAT.agility, STAT.crit, STAT.haste], 15: [STAT.agility, STAT.crit, STAT.hit],
  16: [STAT.agility, STAT.crit, STAT.haste], 17: [STAT.strength, STAT.crit, STAT.expertise], 18: [STAT.strength, STAT.defense, STAT.expertise], 19: [STAT.agility, STAT.crit, STAT.haste],
  20: [STAT.agility, STAT.crit, STAT.haste], 21: [STAT.agility, STAT.crit, STAT.hit], 22: [STAT.intellect, STAT.spellPower, STAT.haste], 23: [STAT.intellect, STAT.spellPower, STAT.haste],
  24: [STAT.intellect, STAT.spellPower, STAT.crit], 25: [STAT.intellect, STAT.spellPower, STAT.haste], 26: [STAT.intellect, STAT.spellPower, STAT.crit], 27: [STAT.intellect, STAT.spellPower, STAT.haste],
  28: [STAT.agility, STAT.crit, STAT.haste], 29: [STAT.agility, STAT.crit, STAT.haste], 30: [STAT.strength, STAT.crit, STAT.expertise], 31: [STAT.agility, STAT.crit, STAT.haste],
  32: [STAT.intellect, STAT.spellPower, STAT.haste],
};
const DEFAULT_ROLE = [STAT.strength, STAT.crit, STAT.haste] as const;

const QUALITY_FACTOR = { uncommon: 0.75, rare: 0.87, epic: 1, legendary: 1.15 } as const;
/** Armor per item level for a piece of weight 1 */
const ARMOR_PER_LEVEL: Record<ArmorType, number> = { cloth: 0.55, leather: 2.7, mail: 4.1, plate: 5.5 };
/** Stat points per item level for a piece of weight 1 and epic quality */
const POINTS_PER_LEVEL = 1.4;

/** The share of the budget each stat gets: stamina, the main stat, then the two secondary ones */
const SHARES = [0.35, 0.3, 0.2, 0.15] as const;

export interface BudgetInput {
  classId: number;
  armorType: ArmorType;
  itemLevel: number;
  quality: keyof typeof QUALITY_FACTOR;
  piece: PieceKey;
}

/** The stat points a piece may hold in all */
export function statBudget(input: Pick<BudgetInput, 'itemLevel' | 'quality' | 'piece'>): number {
  return Math.round(input.itemLevel * PIECE_INFO[input.piece].weight * QUALITY_FACTOR[input.quality] * POINTS_PER_LEVEL);
}

/** A first set of stats and the armor value for a piece, from its item level, quality, slot and the class's role. Always at most the budget. */
export function suggestStats(input: BudgetInput): { stats: { type: number; value: number }[]; armor: number } {
  const budget = statBudget(input);
  const [main, second, third] = ROLE[input.classId] ?? DEFAULT_ROLE;
  const types = [STAT.stamina, main, second, third];
  // Rounded down, and the rest goes to stamina so the points add up to the budget
  const values = SHARES.map((s) => Math.floor(budget * s));
  values[0] = budget - values.slice(1).reduce((a, b) => a + b, 0);
  const stats = types.map((type, i) => ({ type, value: values[i]! })).filter((s) => s.value > 0);
  const armor = Math.round(input.itemLevel * PIECE_INFO[input.piece].weight * ARMOR_PER_LEVEL[input.armorType]);
  return { stats, armor };
}

/** Whether the armor type exists */
export const isArmorType = (v: string): v is ArmorType => v in ARMOR_TYPES;
