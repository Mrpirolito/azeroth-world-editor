import { describe, expect, it } from 'vitest';
import { archiveOrder } from '../../src/core/client/client-files';
import { openMpq } from '../../src/core/client/mpq';
import { buildMpqArchive } from '../../src/main/mpq-writer';
import { bytesSource } from '../helpers/mpq-file';

const bytesOf = (n: number, seed = 1): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * seed + (i >> 3)) & 0xff);
const text = (s: string): Uint8Array => new TextEncoder().encode(s);

async function readBack(archive: Uint8Array, path: string): Promise<Uint8Array | null> {
  const mpq = await openMpq(bytesSource(archive), 'test.mpq');
  const entry = mpq.find(path);
  if (!entry || entry === 'deleted') return null;
  return mpq.read(entry, path);
}

describe('buildMpqArchive', () => {
  const files = [
    { path: 'DBFilesClient\\Spell.dbc', data: bytesOf(50_000, 3) },
    { path: 'DBFilesClient\\SpellIcon.dbc', data: new Uint8Array(20_000) },
    { path: 'DBFilesClient\\Tiny.dbc', data: text('WDBC') },
    { path: 'DBFilesClient\\Empty.dbc', data: new Uint8Array(0) },
  ];

  it.each([true, false])('is read back by the client reader, compressed %s', async (compress) => {
    const archive = await buildMpqArchive(files, { compress });
    for (const f of files) expect(await readBack(archive, f.path)).toEqual(f.data);
  });

  it('finds files by any case or slash, and lists them in (listfile)', async () => {
    const archive = await buildMpqArchive(files);
    expect(await readBack(archive, 'dbfilesclient/spell.DBC')).toEqual(files[0]!.data);
    expect(await readBack(archive, 'DBFilesClient\\Nope.dbc')).toBeNull();
    const list = new TextDecoder().decode((await readBack(archive, '(listfile)'))!);
    expect(list.split('\r\n').filter(Boolean)).toEqual(files.map((f) => f.path));
  });

  it('compresses what repeats and keeps what does not shrink as it is', async () => {
    const zeros = { path: 'a.dbc', data: new Uint8Array(100_000) };
    const noise = { path: 'b.dbc', data: Uint8Array.from({ length: 3000 }, (_, i) => (i * 2654435761) >>> 24) };
    const packed = await buildMpqArchive([zeros, noise]);
    const plain = await buildMpqArchive([zeros, noise], { compress: false });
    expect(packed.length).toBeLessThan(plain.length / 4);
    expect(await readBack(packed, 'a.dbc')).toEqual(zeros.data);
    expect(await readBack(packed, 'b.dbc')).toEqual(noise.data);
  });

  it('works for an archive of one file and for many (the hash table grows)', async () => {
    const one = await buildMpqArchive([{ path: 'x', data: text('hi') }]);
    expect(await readBack(one, 'x')).toEqual(text('hi'));
    const many = Array.from({ length: 200 }, (_, i) => ({ path: `DBFilesClient\\F${i}.dbc`, data: text(`file ${i}`) }));
    const archive = await buildMpqArchive(many);
    expect(await readBack(archive, 'DBFilesClient\\F123.dbc')).toEqual(text('file 123'));
  });

  it('refuses a name twice and a listfile of the caller', async () => {
    await expect(buildMpqArchive([{ path: 'a', data: text('1') }, { path: 'A', data: text('2') }])).rejects.toThrow(/twice/);
    await expect(buildMpqArchive([{ path: '(listfile)', data: text('1') }])).rejects.toThrow(/listfile/);
  });

  it('a patch named patch-CZZZ.MPQ loads after patch-CZZ and patch-C', () => {
    const order = archiveOrder(['patch-CZZZ.MPQ', 'patch-CZZ.MPQ', 'patch-C.MPQ', 'patch-3.MPQ', 'lichking.MPQ'], 'enUS');
    expect(order.at(-1)).toBe('patch-CZZZ.MPQ');
    expect(order.indexOf('patch-CZZ.MPQ')).toBeLessThan(order.indexOf('patch-CZZZ.MPQ'));
  });
});
