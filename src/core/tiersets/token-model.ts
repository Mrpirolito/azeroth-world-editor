import { z } from 'zod';

/** How a tier set is obtained: tokens (shared by sets of different classes) that bosses drop and a vendor turns into the armor */

const int = z.number().int();
const PIECE_KEYS = ['head', 'shoulders', 'chest', 'hands', 'legs'] as const;
const pieceKey = z.enum(PIECE_KEYS);
const perPiece = z.object({ head: int.min(0), shoulders: int.min(0), chest: int.min(0), hands: int.min(0), legs: int.min(0) });

/** Raid difficulties in the order of a boss's rows: the entry itself, then `difficulty_entry_1..3` */
export const DIFFICULTIES = ['10n', '25n', '10h', '25h'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { '10n': '10 players', '25n': '25 players', '10h': '10 players Heroic', '25h': '25 players Heroic' };

/** Tokens that one boss drops: which slots, in which difficulties, how likely */
export const dropSchema = z.object({
  /** The boss's creature entry (its normal-mode row) */
  boss: int.min(1),
  bossName: z.string().max(100).default(''),
  tokens: z.array(pieceKey).min(1).default([...PIECE_KEYS]),
  difficulties: z.array(z.enum(DIFFICULTIES)).min(1).default(['10n']),
  /** Per row; with a group the chances share one pick (0 splits it equally) */
  chance: z.number().min(0).max(100),
  /** A loot group of the boss: rows in one group give one item per kill. 0: each row rolls on its own */
  groupId: int.min(0).max(255).default(0),
  min: int.min(1).max(255).default(1),
  max: int.min(1).max(255).default(1),
});
export type Drop = z.infer<typeof dropSchema>;

export const tokenGroupSchema = z.object({
  /** "Lost" in "Chestguard of the Lost Conqueror" */
  prefix: z.string().max(40),
  /** "Conqueror" */
  group: z.string().min(1).max(40),
  /** The classes whose sets this token buys */
  classIds: z.array(int.min(1).max(32)).min(1),
  quality: z.enum(['uncommon', 'rare', 'epic', 'legendary']),
  itemLevel: int.min(1).max(1000),
  requiredLevel: int.min(1).max(255),
  /** The look of the tokens' icon (an ItemDisplayInfo id); 0 until picked */
  displayId: int.min(0),
  /** The token items' entries (0 until saved) */
  entries: perPiece,
  /** The ItemExtendedCost ids of "one of this token" (0 until saved) */
  costs: perPiece,
  drops: z.array(dropSchema).default([]),
});
export type TokenGroup = z.infer<typeof tokenGroupSchema>;

export const spawnSchema = z.object({ guid: int.min(0), map: int.min(0), x: z.number().finite(), y: z.number().finite(), z: z.number().finite(), o: z.number().finite() });

/** The vendor that turns tokens into a set's pieces */
export const vendorSchema = z.object({
  /** The NPC's entry. 0: a new one is made on save */
  entry: int.min(0),
  /** Whether the editor made the NPC for this set (it then writes its name, look and spawn) or it is an NPC that was there */
  created: z.boolean(),
  name: z.string().max(100),
  subname: z.string().max(100),
  displayId: int.min(0),
  /** Where it stands (made NPCs only); null leaves it unplaced */
  spawn: spawnSchema.nullable().default(null),
  /** Each class sees only the pieces of its own set (condition rows on the vendor's items) */
  classFilter: z.boolean().default(true),
});
export type VendorConfig = z.infer<typeof vendorSchema>;

export const obtainSchema = z.object({
  /** The token group (its prefix and group name) that buys this set's pieces */
  tokenGroup: z.string().max(100),
  vendor: vendorSchema.nullable().default(null),
});
export type Obtain = z.infer<typeof obtainSchema>;

/** A group's name as the sets name it: "Lost Conqueror" */
export const tokenGroupName = (g: Pick<TokenGroup, 'prefix' | 'group'>): string => [g.prefix, g.group].map((t) => t.trim()).filter((t) => t !== '').join(' ');
