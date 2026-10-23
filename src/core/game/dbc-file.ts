import { DbcFormatError } from './dbc';

/**
 * A WDBC file held for editing: records can be changed and added and the file written back. Records are kept as
 * one flat `Uint32Array` (the 200 MB `Spell.dbc` stays one allocation). A record is read and written by a format
 * string with one letter per field: `n` the id (first field), `u` unsigned, `i` signed, `f` float, `s` string
 * (an offset into the string block) and `x` a field kept as the raw number it holds.
 *
 * Writing keeps the string block the file came with and appends the strings it is given, so a file that was not
 * touched is written back byte for byte, and fields no format knows about (the other languages of a text, whose
 * offsets are not always valid) are never disturbed. `compact` rebuilds the block when the format knows every string.
 */

const HEADER_SIZE = 20;
const FIELD_SIZE = 4;

export type DbcValue = number | string;

const KINDS = new Set(['n', 'u', 'i', 'f', 's', 'x']);

/** Checks a format string and returns its letters; throws on one that is not a format */
export function formatKinds(format: string): string[] {
  const kinds = [...format];
  const bad = kinds.find((k) => !KINDS.has(k));
  if (bad !== undefined) throw new DbcFormatError(`"${bad}" is not a DBC field letter (use n, u, i, f, s or x).`);
  return kinds;
}

export class Dbc {
  readonly fieldCount: number;
  private words: Uint32Array;
  private rows: number;
  private block: Uint8Array;
  private blockLength: number;
  /** String to the first offset holding it; built the first time a string is looked up */
  private known: Map<string, number> | null = null;
  private ids: Map<number, number> | null = null;
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  private constructor(fieldCount: number, words: Uint32Array, rows: number, block: Uint8Array) {
    this.fieldCount = fieldCount;
    this.words = words;
    this.rows = rows;
    this.block = block;
    this.blockLength = block.length;
  }

  /** Reads a file; only records of 4-byte fields are supported (every file of 3.3.5a is) */
  static parse(bytes: Uint8Array, name = 'file'): Dbc {
    if (bytes.length < HEADER_SIZE) throw new DbcFormatError(`${name} is too short to be a DBC file.`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    if (magic !== 'WDBC') throw new DbcFormatError(`${name} is not a WDBC file (it starts with "${magic}").`);
    const count = view.getUint32(4, true);
    const fieldCount = view.getUint32(8, true);
    const recordSize = view.getUint32(12, true);
    const stringSize = view.getUint32(16, true);
    if (recordSize !== fieldCount * FIELD_SIZE) throw new DbcFormatError(`${name} has ${fieldCount} fields in ${recordSize} bytes per record; only 4-byte fields can be edited.`);
    if (HEADER_SIZE + count * recordSize + stringSize !== bytes.length) throw new DbcFormatError(`${name} is ${bytes.length} bytes, which does not match its header.`);
    const words = new Uint32Array(count * fieldCount);
    // Copied through bytes so the offset of `bytes` in its buffer need not be a multiple of 4
    new Uint8Array(words.buffer).set(bytes.subarray(HEADER_SIZE, HEADER_SIZE + count * recordSize));
    return new Dbc(fieldCount, words, count, bytes.slice(HEADER_SIZE + count * recordSize));
  }

  /** An empty file with the given number of fields per record */
  static empty(fieldCount: number): Dbc {
    return new Dbc(fieldCount, new Uint32Array(0), 0, new Uint8Array([0]));
  }

  get count(): number {
    return this.rows;
  }

  /** The raw word of a field */
  word(row: number, field: number): number {
    return this.words[row * this.fieldCount + field]!;
  }

  setWord(row: number, field: number, value: number): void {
    this.words[row * this.fieldCount + field] = value >>> 0;
  }

  /** The string at an offset of the block; empty for one outside it */
  stringAt(offset: number): string {
    if (offset >= this.blockLength) return '';
    let end = offset;
    while (end < this.blockLength && this.block[end] !== 0) end += 1;
    return this.decoder.decode(this.block.subarray(offset, end));
  }

  /** The offset of a string, appended to the block when it is not there yet. The empty string is the first empty one. */
  stringOffset(text: string): number {
    if (!this.known) {
      const known = new Map<string, number>();
      let start = 0;
      for (let i = 0; i < this.blockLength; i += 1) {
        if (this.block[i] !== 0) continue;
        const s = this.decoder.decode(this.block.subarray(start, i));
        if (!known.has(s)) known.set(s, start);
        start = i + 1;
      }
      this.known = known;
    }
    const have = this.known.get(text);
    if (have !== undefined) return have;
    const bytes = this.encoder.encode(text);
    const need = this.blockLength + bytes.length + 1;
    if (need > this.block.length) {
      const grown = new Uint8Array(Math.max(need, this.block.length * 2));
      grown.set(this.block.subarray(0, this.blockLength));
      this.block = grown;
    }
    const at = this.blockLength;
    this.block.set(bytes, at);
    this.block[at + bytes.length] = 0;
    this.blockLength = need;
    this.known.set(text, at);
    return at;
  }

  /** The row of each id (field 0); the last row wins for a repeated id */
  rowOfId(id: number): number | undefined {
    if (!this.ids) {
      const ids = new Map<number, number>();
      for (let r = 0; r < this.rows; r += 1) ids.set(this.word(r, 0), r);
      this.ids = ids;
    }
    return this.ids.get(id >>> 0);
  }

  /** A record as values: numbers, floats as floats, strings as text */
  decode(row: number, format: string): DbcValue[] {
    const kinds = formatKinds(format);
    if (kinds.length !== this.fieldCount) throw new DbcFormatError(`The format has ${kinds.length} fields; the file has ${this.fieldCount}.`);
    const view = new DataView(this.words.buffer, this.words.byteOffset, this.words.byteLength);
    return kinds.map((kind, f): DbcValue => {
      const at = (row * this.fieldCount + f) * FIELD_SIZE;
      if (kind === 'i') return view.getInt32(at, true);
      if (kind === 'f') return view.getFloat32(at, true);
      if (kind === 's') return this.stringAt(view.getUint32(at, true));
      return view.getUint32(at, true);
    });
  }

  /** Writes values into a record, strings into the block */
  encode(row: number, values: readonly DbcValue[], format: string): void {
    const kinds = formatKinds(format);
    if (kinds.length !== this.fieldCount || values.length !== this.fieldCount) {
      throw new DbcFormatError(`A record has ${this.fieldCount} fields; the format has ${kinds.length} and ${values.length} values were given.`);
    }
    // Strings first: adding one may grow the block, never the records
    const offsets = kinds.map((kind, f) => (kind === 's' ? this.stringOffset(String(values[f])) : 0));
    const view = new DataView(this.words.buffer, this.words.byteOffset, this.words.byteLength);
    kinds.forEach((kind, f) => {
      const at = (row * this.fieldCount + f) * FIELD_SIZE;
      const value = values[f]!;
      if (kind === 'f') view.setFloat32(at, Number(value), true);
      else if (kind === 's') view.setUint32(at, offsets[f]!, true);
      else view.setUint32(at, Number(value) >>> 0, true);
    });
  }

  /** Adds a record at the end and returns its row */
  append(values: readonly DbcValue[], format: string): number {
    const need = (this.rows + 1) * this.fieldCount;
    if (need > this.words.length) {
      const grown = new Uint32Array(Math.max(need, this.words.length * 2));
      grown.set(this.words);
      this.words = grown;
    }
    const row = this.rows;
    this.rows += 1;
    this.encode(row, values, format);
    this.ids?.set(this.word(row, 0), row);
    return row;
  }

  /** Changes the record with this id, or adds it; returns whether it was added */
  upsert(id: number, values: readonly DbcValue[], format: string): boolean {
    const row = this.rowOfId(id);
    if (row === undefined) {
      this.append(values, format);
      return true;
    }
    this.encode(row, values, format);
    return false;
  }

  /**
   * Rebuilds the string block from the fields the format calls strings: each distinct text once, in order of first
   * use, the empty string at offset 0. Only for a format that names every string field of the file, since a field it
   * leaves as `x` keeps its old offset.
   */
  compact(format: string): void {
    const kinds = formatKinds(format);
    if (kinds.length !== this.fieldCount) throw new DbcFormatError(`The format has ${kinds.length} fields; the file has ${this.fieldCount}.`);
    const offsets = new Map<string, number>([['', 0]]);
    const parts: Uint8Array[] = [new Uint8Array([0])];
    let length = 1;
    for (let r = 0; r < this.rows; r += 1) {
      kinds.forEach((kind, f) => {
        if (kind !== 's') return;
        const text = this.stringAt(this.word(r, f));
        let offset = offsets.get(text);
        if (offset === undefined) {
          const bytes = this.encoder.encode(text);
          offset = length;
          offsets.set(text, offset);
          parts.push(bytes, new Uint8Array([0]));
          length += bytes.length + 1;
        }
        this.setWord(r, f, offset);
      });
    }
    const block = new Uint8Array(length);
    let at = 0;
    for (const part of parts) {
      block.set(part, at);
      at += part.length;
    }
    this.block = block;
    this.blockLength = length;
    this.known = null;
  }

  /** The file as bytes */
  serialize(): Uint8Array {
    const recordBytes = this.rows * this.fieldCount * FIELD_SIZE;
    const out = new Uint8Array(HEADER_SIZE + recordBytes + this.blockLength);
    const view = new DataView(out.buffer);
    out.set([0x57, 0x44, 0x42, 0x43], 0);
    view.setUint32(4, this.rows, true);
    view.setUint32(8, this.fieldCount, true);
    view.setUint32(12, this.fieldCount * FIELD_SIZE, true);
    view.setUint32(16, this.blockLength, true);
    out.set(new Uint8Array(this.words.buffer, this.words.byteOffset, recordBytes), HEADER_SIZE);
    out.set(this.block.subarray(0, this.blockLength), HEADER_SIZE + recordBytes);
    return out;
  }
}
