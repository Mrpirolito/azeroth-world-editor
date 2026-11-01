import { MODEL_PIECES, REGIONS, type ClientFile, type PieceKey, type Suffix } from './model';
import { textureSize, toBlp } from './image';
import { modelPaths, modelTextureProblem, pieceHasRegion, regionProblem, texturePath, type ModelFile, type ModelSlot } from './textures';

/** A dropped file's place in a piece: a body texture region (with a sex), or a part of the head or shoulder model */
export type FileTarget =
  | { kind: 'texture'; region: number; suffix: Suffix }
  | { kind: 'model'; slot: ModelSlot; file: ModelFile };

const toBase64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');
export const fromBase64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

const startsWith = (b: Uint8Array, text: string): boolean => text.split('').every((c, i) => b[i] === c.charCodeAt(0));

/**
 * A file dropped on a piece, checked and made ready for the client: a PNG becomes a BLP, a texture must have its
 * region's size, and the files of a model are told apart by their headers. Throws a message the author can act on.
 */
export function prepareFile(set: string, piece: PieceKey, target: FileTarget, bytes: Uint8Array): ClientFile {
  if (target.kind === 'texture') {
    const region = REGIONS[target.region];
    if (!region || !pieceHasRegion(piece, target.region)) throw new Error(`A ${piece} piece has no ${region?.label ?? target.region} texture.`);
    const size = textureSize(bytes);
    const problem = regionProblem(target.region, size.width, size.height);
    if (problem) throw new Error(problem);
    return { paths: [texturePath(set, piece, target.region, target.suffix)], data: toBase64(toBlp(bytes).blp) };
  }
  if (!MODEL_PIECES.includes(piece)) throw new Error('Only the head and the shoulders have a model.');
  if (target.slot === 'head' ? piece !== 'head' : piece !== 'shoulders') throw new Error(`The ${target.slot} model does not belong to the ${piece} piece.`);
  const p = piece as 'head' | 'shoulders';
  if (target.file === 'm2') {
    if (!startsWith(bytes, 'MD20')) throw new Error('That is not an M2 model (it must start with MD20).');
  } else if (target.file === 'skin') {
    if (!startsWith(bytes, 'SKIN')) throw new Error('That is not a .skin file.');
  } else {
    const size = textureSize(bytes);
    const problem = modelTextureProblem(size.width, size.height);
    if (problem) throw new Error(problem);
    return { paths: modelPaths(set, p, target.slot, 'blp'), data: toBase64(toBlp(bytes).blp) };
  }
  return { paths: modelPaths(set, p, target.slot, target.file), data: toBase64(bytes) };
}

/** The project's client files with this one in place of any that has its first path */
export function withClientFile(files: readonly ClientFile[] | undefined, file: ClientFile): ClientFile[] {
  return [...(files ?? []).filter((f) => f.paths[0] !== file.paths[0]), file];
}
