import { inflateSync } from 'node:zlib';
import { decodeBlp, type RgbaImage } from '../client/blp';

/** PNG in, BLP2 out: the texture files of a tier set, made without a library (the client reads BLP, never PNG) */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export const isPng = (b: Uint8Array): boolean => PNG_MAGIC.every((v, i) => b[i] === v);
export const isBlp = (b: Uint8Array): boolean => b.length > 4 && String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) === 'BLP2';

/** A PNG as RGBA: 8-bit grey, RGB, palette, grey+alpha and RGBA, not interlaced */
export function decodePng(bytes: Uint8Array): RgbaImage {
  if (!isPng(bytes)) throw new Error('Not a PNG file.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette: Uint8Array = new Uint8Array(0);
  let trns: Uint8Array = new Uint8Array(0);
  const parts: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    const name = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (name === 'IHDR') { width = view.getUint32(at + 8); height = view.getUint32(at + 12); depth = data[8]!; type = data[9]!; interlace = data[12]!; }
    else if (name === 'PLTE') palette = data;
    else if (name === 'tRNS') trns = data;
    else if (name === 'IDAT') parts.push(data);
    else if (name === 'IEND') break;
    at += 12 + length;
  }
  if (width === 0 || height === 0) throw new Error('The PNG has no image header.');
  if (depth !== 8 || CHANNELS[type] === undefined) throw new Error('Only 8-bit PNG files are supported; export it as 8-bit RGB or RGBA.');
  if (interlace !== 0) throw new Error('Interlaced PNG files are not supported.');
  const raw = inflateSync(Buffer.concat(parts));
  const channels = CHANNELS[type]!;
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error('The PNG ends before its image.');
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = y * stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= channels ? pixels[line + x - channels]! : 0;
      const b = y > 0 ? pixels[line - stride + x]! : 0;
      const c = x >= channels && y > 0 ? pixels[line - stride + x - channels]! : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error('The PNG uses an unknown filter.');
      pixels[line + x] = (cur + add) & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    let r: number, g: number, b: number, a = 255;
    if (type === 0) { r = g = b = pixels[s]!; }
    else if (type === 2) { r = pixels[s]!; g = pixels[s + 1]!; b = pixels[s + 2]!; }
    else if (type === 3) { const p = pixels[s]!; r = palette[p * 3]!; g = palette[p * 3 + 1]!; b = palette[p * 3 + 2]!; a = trns[p] ?? 255; }
    else if (type === 4) { r = g = b = pixels[s]!; a = pixels[s + 1]!; }
    else { r = pixels[s]!; g = pixels[s + 1]!; b = pixels[s + 2]!; a = pixels[s + 3]!; }
    rgba.set([r, g, b, a], i * 4);
  }
  return { width, height, rgba };
}

/** The size of a PNG or BLP texture; throws for anything else */
export function textureSize(bytes: Uint8Array): { width: number; height: number; format: 'png' | 'blp' } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (isPng(bytes) && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20), format: 'png' };
  if (isBlp(bytes) && bytes.length >= 148) return { width: view.getUint32(12, true), height: view.getUint32(16, true), format: 'blp' };
  throw new Error('The file is not a PNG or a BLP texture.');
}

const to565 = (r: number, g: number, b: number): number => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
const from565 = (c: number): number[] => [((c >> 11) * 255 / 31) | 0, (((c >> 5) & 63) * 255 / 63) | 0, ((c & 31) * 255 / 31) | 0];

/** One 4x4 block of colour (8 bytes): the endpoints are the box of the block's colours, ordered so the 4-colour mode is used */
function colourBlock(px: Uint8Array, out: Uint8Array, at: number): void {
  const lo = [255, 255, 255], hi = [0, 0, 0];
  for (let i = 0; i < 16; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, px[i * 4 + k]!); hi[k] = Math.max(hi[k]!, px[i * 4 + k]!); }
  let c0 = to565(hi[0]!, hi[1]!, hi[2]!), c1 = to565(lo[0]!, lo[1]!, lo[2]!);
  if (c0 < c1) [c0, c1] = [c1, c0];
  out[at] = c0 & 255; out[at + 1] = c0 >> 8; out[at + 2] = c1 & 255; out[at + 3] = c1 >> 8;
  if (c0 === c1) { out.fill(0, at + 4, at + 8); return; }
  const e0 = from565(c0), e1 = from565(c1);
  const palette = [e0, e1, e0.map((v, k) => ((2 * v + e1[k]!) / 3) | 0), e0.map((v, k) => ((v + 2 * e1[k]!) / 3) | 0)];
  let bits = 0;
  for (let i = 15; i >= 0; i--) {
    let best = 0, bestD = Infinity;
    for (let p = 0; p < 4; p++) {
      const d = (px[i * 4]! - palette[p]![0]!) ** 2 + (px[i * 4 + 1]! - palette[p]![1]!) ** 2 + (px[i * 4 + 2]! - palette[p]![2]!) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    bits = ((bits << 2) | best) >>> 0;
  }
  out[at + 4] = bits & 255; out[at + 5] = (bits >> 8) & 255; out[at + 6] = (bits >> 16) & 255; out[at + 7] = (bits >>> 24) & 255;
}

/** One DXT5 alpha block (8 bytes): the block's highest and lowest alpha as endpoints and 3-bit indexes between */
function alphaBlock(px: Uint8Array, out: Uint8Array, at: number): void {
  let lo = 255, hi = 0;
  for (let i = 0; i < 16; i++) { lo = Math.min(lo, px[i * 4 + 3]!); hi = Math.max(hi, px[i * 4 + 3]!); }
  out[at] = hi; out[at + 1] = lo;
  out.fill(0, at + 2, at + 8);
  if (hi === lo) return;
  const levels = [hi, lo];
  for (let i = 2; i < 8; i++) levels.push(Math.floor(((8 - i) * hi + (i - 1) * lo) / 7));
  let bits = 0n;
  for (let i = 15; i >= 0; i--) {
    let best = 0, bestD = Infinity;
    for (let p = 0; p < 8; p++) { const d = Math.abs(px[i * 4 + 3]! - levels[p]!); if (d < bestD) { bestD = d; best = p; } }
    bits = (bits << 3n) | BigInt(best);
  }
  for (let k = 0; k < 6; k++) out[at + 2 + k] = Number((bits >> BigInt(8 * k)) & 255n);
}

const halve = (img: RgbaImage): RgbaImage => {
  const width = Math.max(1, img.width >> 1), height = Math.max(1, img.height >> 1);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let k = 0; k < 4; k++) {
    let sum = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) sum += img.rgba[(Math.min(img.height - 1, y * 2 + dy) * img.width + Math.min(img.width - 1, x * 2 + dx)) * 4 + k]!;
    rgba[(y * width + x) * 4 + k] = sum >> 2;
  }
  return { width, height, rgba };
};

function compress(img: RgbaImage, alpha: boolean): Uint8Array {
  const out = new Uint8Array(Math.ceil(img.width / 4) * Math.ceil(img.height / 4) * (alpha ? 16 : 8));
  const block = new Uint8Array(64);
  let at = 0;
  for (let by = 0; by < img.height; by += 4) for (let bx = 0; bx < img.width; bx += 4) {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const s = (Math.min(img.height - 1, by + y) * img.width + Math.min(img.width - 1, bx + x)) * 4;
      block.set(img.rgba.subarray(s, s + 4), (y * 4 + x) * 4);
    }
    if (alpha) { alphaBlock(block, out, at); at += 8; }
    colourBlock(block, out, at);
    at += 8;
  }
  return out;
}

/** A BLP2 file with every mip level: DXT1 when the image is opaque, DXT5 when it has any transparency */
export function encodeBlp(image: RgbaImage): Uint8Array {
  const alpha = image.rgba.some((v, i) => i % 4 === 3 && v < 255);
  const levels: Uint8Array[] = [];
  for (let level: RgbaImage = image; ; level = halve(level)) {
    levels.push(compress(level, alpha));
    if (level.width === 1 && level.height === 1) break;
  }
  const start = 148 + 1024;
  const out = new Uint8Array(start + levels.reduce((n, l) => n + l.length, 0));
  const view = new DataView(out.buffer);
  out.set([66, 76, 80, 50]);
  view.setUint32(4, 1, true);
  out[8] = 2; out[9] = alpha ? 8 : 0; out[10] = alpha ? 7 : 0; out[11] = 1;
  view.setUint32(12, image.width, true);
  view.setUint32(16, image.height, true);
  let offset = start;
  levels.forEach((l, i) => { view.setUint32(20 + i * 4, offset, true); view.setUint32(84 + i * 4, l.length, true); out.set(l, offset); offset += l.length; });
  return out;
}

/** A texture file as the client's BLP: a PNG is converted, a BLP is kept as it is */
export function toBlp(bytes: Uint8Array): { blp: Uint8Array; width: number; height: number } {
  if (isBlp(bytes)) { const { width, height } = decodeBlp(bytes); return { blp: bytes, width, height }; }
  const image = decodePng(bytes);
  return { blp: encodeBlp(image), width: image.width, height: image.height };
}
