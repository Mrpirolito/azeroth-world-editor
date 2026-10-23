import { promisify } from 'node:util';
import { deflate } from 'node:zlib';
import { encryptBlock, hashString, HASH_FILE_KEY, HASH_NAME_A, HASH_NAME_B, HASH_OFFSET } from '../core/client/mpq-crypto';
import { MPQ_FILE } from '../core/client/mpq';

/**
 * Writes a new MPQ archive (format 0, the one the 3.3.5a client reads): files stored whole or in zlib sectors, the
 * hash and block tables, and a `(listfile)` naming the files. Only creating an archive is supported, not editing
 * one: a client patch is always written fresh, and the client's own archives are never touched.
 */

const deflateAsync = promisify(deflate);
const HEADER_SIZE = 32;
const LISTFILE = '(listfile)';
const ZLIB_MASK = 0x02;

export interface MpqFile {
  /** Path inside the archive; either slash, any case */
  path: string;
  data: Uint8Array;
}

export interface MpqWriteOptions {
  /** Store files in zlib-compressed sectors where that is smaller (default); false stores them as they are */
  compress?: boolean;
  /** Sector size is 512 << this; the client's own archives use 3 (4096) */
  sectorShift?: number;
}

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** One file as the archive stores it: sectors behind a sector table when compressed, the bytes as they are otherwise */
async function storeFile(data: Uint8Array, sectorSize: number, compress: boolean): Promise<{ body: Uint8Array; flags: number }> {
  if (!compress || data.length === 0) return { body: data, flags: MPQ_FILE.EXISTS };
  const sectors: Uint8Array[] = [];
  for (let at = 0; at < data.length; at += sectorSize) {
    const plain = data.subarray(at, at + sectorSize);
    const packed = await deflateAsync(plain);
    sectors.push(packed.length + 1 < plain.length ? Uint8Array.from([ZLIB_MASK, ...packed]) : plain);
  }
  const table = new Uint8Array((sectors.length + 1) * 4);
  const view = new DataView(table.buffer);
  let at = table.length;
  sectors.forEach((s, i) => {
    view.setUint32(i * 4, at, true);
    at += s.length;
  });
  view.setUint32(sectors.length * 4, at, true);
  return { body: concat([table, ...sectors]), flags: (MPQ_FILE.EXISTS | MPQ_FILE.COMPRESS) >>> 0 };
}

/** An archive holding the files, plus a `(listfile)` of their names */
export async function buildMpqArchive(files: readonly MpqFile[], options: MpqWriteOptions = {}): Promise<Uint8Array> {
  const shift = options.sectorShift ?? 3;
  const sectorSize = 512 << shift;
  const names = new Set<string>();
  for (const f of files) {
    const key = f.path.toUpperCase().replace(/\//g, '\\');
    if (names.has(key)) throw new Error(`${f.path} is listed twice.`);
    if (key === LISTFILE.toUpperCase()) throw new Error(`${LISTFILE} is written by the archive itself.`);
    names.add(key);
  }
  const listing = new TextEncoder().encode(`${files.map((f) => f.path.replace(/\//g, '\\')).join('\r\n')}\r\n`);
  const all: MpqFile[] = [...files, { path: LISTFILE, data: listing }];

  const chunks: Uint8Array[] = [];
  const blocks: [number, number, number, number][] = [];
  let at = HEADER_SIZE;
  for (const f of all) {
    const { body, flags } = await storeFile(f.data, sectorSize, options.compress ?? true);
    chunks.push(body);
    blocks.push([at, body.length, f.data.length, flags]);
    at += body.length;
  }

  let hashCount = 16;
  while (hashCount < all.length * 2) hashCount *= 2;
  const hash = new Uint8Array(hashCount * 16).fill(0xff);
  const hv = new DataView(hash.buffer);
  all.forEach((f, i) => {
    let slot = hashString(f.path, HASH_OFFSET) % hashCount;
    while (hv.getUint32(slot * 16 + 12, true) !== 0xffffffff) slot = (slot + 1) % hashCount;
    hv.setUint32(slot * 16, hashString(f.path, HASH_NAME_A), true);
    hv.setUint32(slot * 16 + 4, hashString(f.path, HASH_NAME_B), true);
    hv.setUint16(slot * 16 + 8, 0, true);
    hv.setUint16(slot * 16 + 10, 0, true);
    hv.setUint32(slot * 16 + 12, i, true);
  });
  const block = new Uint8Array(blocks.length * 16);
  const bv = new DataView(block.buffer);
  blocks.forEach((b, i) => b.forEach((v, k) => bv.setUint32(i * 16 + k * 4, v >>> 0, true)));

  const hashPos = at;
  const blockPos = hashPos + hash.length;
  const archiveSize = blockPos + block.length;
  if (archiveSize > 0xffffffff) throw new Error('An archive of format 0 cannot hold more than 4 GB.');
  const header = new Uint8Array(HEADER_SIZE);
  const h = new DataView(header.buffer);
  header.set([0x4d, 0x50, 0x51, 0x1a]);
  h.setUint32(4, HEADER_SIZE, true);
  h.setUint32(8, archiveSize, true);
  h.setUint16(12, 0, true);
  h.setUint16(14, shift, true);
  h.setUint32(16, hashPos, true);
  h.setUint32(20, blockPos, true);
  h.setUint32(24, hashCount, true);
  h.setUint32(28, blocks.length, true);
  return concat([header, ...chunks, encryptBlock(hash, hashString('(hash table)', HASH_FILE_KEY)), encryptBlock(block, hashString('(block table)', HASH_FILE_KEY))]);
}
