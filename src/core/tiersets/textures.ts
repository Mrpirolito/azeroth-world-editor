import { PIECE_INFO, PIECE_REGIONS, REGIONS, type PieceKey, type Suffix } from './model';

/** Names and places of the files a tier set adds to the client, and the checks on what the author drops in */

/** A set's name as a file name part: letters and digits only */
export const cleanName = (name: string): string => name.replace(/[^A-Za-z0-9]+/g, '');

const prefix = (set: string, piece: PieceKey): string => `CoA_${cleanName(set)}_${PIECE_INFO[piece].code}`;

/** The base name in `ItemDisplayInfo.Texture[i]` (the client adds `_M`, `_F` or `_U` and `.blp`) */
export const textureBase = (set: string, piece: PieceKey, region: number): string => `${prefix(set, piece)}_${REGIONS[region]!.code}`;

/** The file name of a body texture: CoA_<Set>_<Piece>_<Region>_<U|M|F>.blp */
export const textureFileName = (set: string, piece: PieceKey, region: number, suffix: Suffix): string => `${textureBase(set, piece, region)}_${suffix}.blp`;

export const texturePath = (set: string, piece: PieceKey, region: number, suffix: Suffix): string =>
  `Item\\TextureComponents\\${REGIONS[region]!.folder}\\${textureFileName(set, piece, region, suffix)}`;

/** Client race and sex suffixes of head models: Human, Orc, Dwarf, Night elf, Undead (Scourge), Tauren, Gnome, Troll, Blood elf, Draenei */
export const RACE_CODES = ['Hu', 'Or', 'Dw', 'NI', 'Sc', 'Ta', 'Gn', 'Tr', 'BE', 'Dr'] as const;
export const RACE_SEX = RACE_CODES.flatMap((r) => [`${r}M`, `${r}F`]);

export type ModelFile = 'm2' | 'skin' | 'blp';
export type ModelSlot = 'head' | 'left' | 'right';

/** Where a model piece's files live and what `ItemDisplayInfo` calls them */
export function modelNames(set: string, piece: 'head' | 'shoulders'): { dir: string; modelName: [string, string]; modelTexture: [string, string]; texture: string } {
  const base = prefix(set, piece);
  if (piece === 'head') {
    return { dir: 'Item\\ObjectComponents\\Head', modelName: [`${base}.m2`, ''], modelTexture: [base, ''], texture: base };
  }
  return { dir: 'Item\\ObjectComponents\\Shoulder', modelName: [`${base}_L.m2`, `${base}_R.m2`], modelTexture: [base, base], texture: base };
}

/** The archive paths a dropped model file is written to. A head has a copy per race and sex; a shoulder one file for its side. */
export function modelPaths(set: string, piece: 'head' | 'shoulders', slot: ModelSlot, file: ModelFile): string[] {
  const n = modelNames(set, piece);
  if (file === 'blp') return [`${n.dir}\\${n.texture}.blp`];
  const ext = file === 'm2' ? '.m2' : '00.skin';
  if (piece === 'head') return RACE_SEX.map((r) => `${n.dir}\\${n.texture}_${r}${ext}`);
  const side = slot === 'right' ? 'R' : 'L';
  return [`${n.dir}\\${n.texture}_${side}${ext}`];
}

/** What is wrong with a texture of a size for a body region, or null */
export function regionProblem(region: number, width: number, height: number): string | null {
  const r = REGIONS[region];
  if (!r) return `There is no texture region ${region}.`;
  return width === r.width && height === r.height ? null : `${r.label} textures must be ${r.width}x${r.height}; this one is ${width}x${height}.`;
}

const isPow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;

/** What is wrong with the texture of a head or shoulder model: powers of two, at most 1024 */
export function modelTextureProblem(width: number, height: number): string | null {
  if (!isPow2(width) || !isPow2(height)) return `Model textures must have power-of-two sizes; this one is ${width}x${height}.`;
  return width > 1024 || height > 1024 ? 'Model textures can be at most 1024x1024.' : null;
}

/** Whether a piece paints this region */
export const pieceHasRegion = (piece: PieceKey, region: number): boolean => PIECE_REGIONS[piece].includes(region);
