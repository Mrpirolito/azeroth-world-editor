import { z } from 'zod';
import { bonusSchema } from './bonus';
import { obtainSchema } from './token-model';

/** A tier set: five armor pieces of one class, and everything the server and the client need to know about them */

export const PIECES = ['head', 'shoulders', 'chest', 'hands', 'legs'] as const;
export type PieceKey = (typeof PIECES)[number];

export const PIECE_INFO: Record<PieceKey, { label: string; code: string; inventoryType: number; /** Inventory types the piece may have */ types: readonly number[]; /** Weight in the stat budget */ weight: number }> = {
  head: { label: 'Head', code: 'Head', inventoryType: 1, types: [1], weight: 1 },
  shoulders: { label: 'Shoulders', code: 'Shoulders', inventoryType: 3, types: [3], weight: 0.75 },
  chest: { label: 'Chest', code: 'Chest', inventoryType: 5, types: [5, 20], weight: 1 },
  hands: { label: 'Hands', code: 'Hands', inventoryType: 10, types: [10], weight: 0.75 },
  legs: { label: 'Legs', code: 'Legs', inventoryType: 7, types: [7], weight: 1 },
};

/** Armor material by name: the `subclass` of an armor item, and the `Material` of its client row */
export const ARMOR_TYPES = {
  cloth: { subclass: 1, material: 7, label: 'Cloth' },
  leather: { subclass: 2, material: 8, label: 'Leather' },
  mail: { subclass: 3, material: 5, label: 'Mail' },
  plate: { subclass: 4, material: 6, label: 'Plate' },
} as const;
export type ArmorType = keyof typeof ARMOR_TYPES;

export const QUALITIES = ['uncommon', 'rare', 'epic', 'legendary'] as const;

/** The classes by `ChrClasses.dbc` id: the vanilla ones and CoA's own (the server's `SharedDefines.h` names them) */
export const TIER_CLASSES: readonly { id: number; name: string; custom: boolean }[] = [
  [1, 'Warrior'], [2, 'Paladin'], [3, 'Hunter'], [4, 'Rogue'], [5, 'Priest'], [6, 'Death Knight'], [7, 'Shaman'], [8, 'Mage'], [9, 'Warlock'], [11, 'Druid'],
  [12, 'Barbarian'], [13, 'Witch Doctor'], [14, 'Felsworn'], [15, 'Witch Hunter'], [16, 'Stormbringer'], [17, 'Knight of Xoroth'], [18, 'Guardian'], [19, 'Templar'],
  [20, 'Bloodmage'], [21, 'Ranger'], [22, 'Chronomancer'], [23, 'Necromancer'], [24, 'Pyromancer'], [25, 'Cultist'], [26, 'Starcaller'], [27, 'Sun Cleric'],
  [28, 'Tinker'], [29, 'Venomancer'], [30, 'Reaper'], [31, 'Primalist'], [32, 'Runemaster'],
].map(([id, name]) => ({ id: id as number, name: name as string, custom: (id as number) >= 12 }));

/** The `AllowableClass` mask of a class (bit id-1), as the unsigned number the column holds */
export const classMask = (classId: number): number => (2 ** (classId - 1)) >>> 0;

export const className = (classId: number): string => TIER_CLASSES.find((c) => c.id === classId)?.name ?? `Class ${classId}`;

/** The 8 body texture regions of `ItemDisplayInfo.Texture[0..7]` */
export const REGIONS = [
  { index: 0, code: 'AU', label: 'Upper arm', folder: 'ArmUpperTexture', width: 256, height: 128 },
  { index: 1, code: 'AL', label: 'Lower arm', folder: 'ArmLowerTexture', width: 256, height: 128 },
  { index: 2, code: 'HA', label: 'Hand', folder: 'HandTexture', width: 256, height: 64 },
  { index: 3, code: 'TU', label: 'Upper torso', folder: 'TorsoUpperTexture', width: 256, height: 128 },
  { index: 4, code: 'TL', label: 'Lower torso', folder: 'TorsoLowerTexture', width: 256, height: 64 },
  { index: 5, code: 'LU', label: 'Upper leg', folder: 'LegUpperTexture', width: 256, height: 128 },
  { index: 6, code: 'LL', label: 'Lower leg', folder: 'LegLowerTexture', width: 256, height: 128 },
  { index: 7, code: 'FO', label: 'Foot', folder: 'FootTexture', width: 256, height: 64 },
] as const;

/** The regions each piece paints */
export const PIECE_REGIONS: Record<PieceKey, readonly number[]> = { head: [], shoulders: [], chest: [0, 1, 3, 4], hands: [1, 2], legs: [5, 6] };

/** Head and shoulders are 3D models; the others are textures on the body */
export const MODEL_PIECES: readonly PieceKey[] = ['head', 'shoulders'];

export const SUFFIXES = ['U', 'M', 'F'] as const;
export type Suffix = (typeof SUFFIXES)[number];

const int = z.number().int();
const statSchema = z.object({ type: int.min(0).max(100), value: int.min(-10000).max(100000) });

/** What a new piece looks like: an existing display, or a copy of a base display with files of its own */
export const lookSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), displayId: int.min(0) }),
  z.object({
    kind: z.literal('new'),
    /** The display the new one is copied from */
    baseDisplayId: int.min(0),
    /** The display made for this piece (0 until saved) */
    displayId: int.min(0),
    /** Per region index, the sexes a texture was given for */
    textures: z.record(z.string(), z.array(z.enum(SUFFIXES))),
    /** Whether the piece has its own model (head and shoulders): the files hold it */
    model: z.boolean(),
    icon: z.string().max(200),
  }),
]);
export type Look = z.infer<typeof lookSchema>;

export const pieceSchema = z.object({
  name: z.string().max(100),
  /** The item's entry (0 until saved) */
  entry: int.min(0),
  inventoryType: int.min(0).max(28),
  armor: int.min(0).max(100000),
  stats: z.array(statSchema).max(10),
  look: lookSchema,
});
export type Piece = z.infer<typeof pieceSchema>;

export const tierSetSchema = z.object({
  name: z.string().min(1).max(60),
  classId: int.min(1).max(32),
  armorType: z.enum(['cloth', 'leather', 'mail', 'plate']),
  itemLevel: int.min(1).max(1000),
  requiredLevel: int.min(1).max(255),
  quality: z.enum(QUALITIES),
  raid: z.string().max(80),
  difficulty: z.string().max(40),
  /** The ItemSet.dbc id (0 until saved) */
  itemSetId: int.min(0),
  /** The set bonuses (up to the 8 slots of ItemSet.dbc) */
  bonuses: z.array(bonusSchema).max(8).default([]),
  pieces: z.object({ head: pieceSchema, shoulders: pieceSchema, chest: pieceSchema, hands: pieceSchema, legs: pieceSchema }),
  /** How the set is obtained: its token group and the vendor that sells it; absent: not set up */
  obtain: obtainSchema.optional(),
});
export type TierSet = z.infer<typeof tierSetSchema>;

/** A file the project carries into the client patch: its place(s) in the archive and its bytes (base64) */
export const clientFileSchema = z.object({ paths: z.array(z.string().min(1).max(260)).min(1).max(64), data: z.string() });
export type ClientFile = z.infer<typeof clientFileSchema>;

export const pieceName = (set: string, piece: PieceKey): string => `${set.trim()} ${PIECE_INFO[piece].label}`;

export function emptyPiece(set: string, piece: PieceKey): Piece {
  return { name: pieceName(set, piece), entry: 0, inventoryType: PIECE_INFO[piece].inventoryType, armor: 0, stats: [], look: { kind: 'existing', displayId: 0 } };
}

export function newTierSet(name: string, classId: number, armorType: ArmorType): TierSet {
  const piece = (k: PieceKey): Piece => emptyPiece(name, k);
  return {
    name, classId, armorType, itemLevel: 213, requiredLevel: 80, quality: 'epic', raid: '', difficulty: '', itemSetId: 0, bonuses: [],
    pieces: { head: piece('head'), shoulders: piece('shoulders'), chest: piece('chest'), hands: piece('hands'), legs: piece('legs') },
  };
}
