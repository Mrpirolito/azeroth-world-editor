import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DbcFormatError } from '../../src/core/game/dbc';
import { Dbc, formatKinds } from '../../src/core/game/dbc-file';
import { DBC_LAYOUTS, fieldIndex, layoutOf, SPELL_FIELDS, SPELL_INDEX } from '../../src/core/game/dbc-formats';
import { buildDbcWithStrings, f32 } from '../helpers/dbc';

describe('Dbc', () => {
  const FORMAT = 'nsifx';
  const file = (): Uint8Array => buildDbcWithStrings([[1, 'Fireball', -5, f32(1.5), 7], [2, 'Frostbolt', 10, f32(0), 0], [3, '', 0, 0, 0]], 5);

  it('writes an untouched file back byte for byte', () => {
    const bytes = file();
    expect(Dbc.parse(bytes).serialize()).toEqual(bytes);
  });

  it('decodes strings, signed numbers and floats by the format', () => {
    const dbc = Dbc.parse(file());
    expect(dbc.decode(0, FORMAT)).toEqual([1, 'Fireball', -5, 1.5, 7]);
    expect(dbc.decode(2, FORMAT)).toEqual([3, '', 0, 0, 0]);
    expect(dbc.count).toBe(3);
  });

  it('changes a record, reusing a string the block already holds', () => {
    const dbc = Dbc.parse(file());
    const before = dbc.serialize().length;
    dbc.encode(1, [2, 'Fireball', 10, 2.25, 9], FORMAT);
    expect(dbc.serialize().length).toBe(before);
    expect(dbc.decode(1, FORMAT)).toEqual([2, 'Fireball', 10, 2.25, 9]);
    expect(dbc.word(0, 1)).toBe(dbc.word(1, 1));
  });

  it('adds records and strings, and reads them back after a save and a load', () => {
    const dbc = Dbc.parse(file());
    expect(dbc.upsert(9, [9, 'Pyroblast', 3, 0.5, 1], FORMAT)).toBe(true);
    expect(dbc.upsert(3, [3, 'Frostbolt', 4, 0, 0], FORMAT)).toBe(false);
    const again = Dbc.parse(dbc.serialize());
    expect(again.count).toBe(4);
    expect(again.decode(again.rowOfId(9)!, FORMAT)).toEqual([9, 'Pyroblast', 3, 0.5, 1]);
    expect(again.decode(again.rowOfId(3)!, FORMAT)).toEqual([3, 'Frostbolt', 4, 0, 0]);
    expect(again.rowOfId(77)).toBeUndefined();
  });

  it('puts a string in the block once and the empty string at offset 0', () => {
    const dbc = Dbc.empty(2);
    dbc.append([1, 'a'], 'ns');
    dbc.append([2, 'a'], 'ns');
    dbc.append([3, ''], 'ns');
    expect([dbc.word(0, 1), dbc.word(1, 1), dbc.word(2, 1)]).toEqual([1, 1, 0]);
    expect(dbc.serialize().length).toBe(20 + 3 * 8 + 3);
  });

  it('handles accents and a long run of additions', () => {
    const dbc = Dbc.empty(2);
    for (let i = 1; i <= 500; i += 1) dbc.append([i, `Llama ${i} ñ`], 'ns');
    const again = Dbc.parse(dbc.serialize());
    expect(again.decode(499, 'ns')).toEqual([500, 'Llama 500 ñ']);
  });

  it('compact rebuilds the block: each text once, in order of first use, empty at 0', () => {
    const messy = buildDbcWithStrings([[1, 'b'], [2, 'a'], [3, 'b']], 2);
    const dbc = Dbc.parse(messy);
    dbc.encode(1, [2, 'zz'], 'ns');
    dbc.compact('ns');
    expect(Dbc.parse(dbc.serialize()).decode(1, 'ns')).toEqual([2, 'zz']);
    expect(dbc.serialize().length).toBe(20 + 3 * 8 + 1 + 2 + 3);
    expect(dbc.word(0, 1)).toBe(dbc.word(2, 1));
  });

  it('refuses a wrong format, a wrong record length and files it cannot edit', () => {
    const dbc = Dbc.parse(file());
    expect(() => dbc.decode(0, 'nsi')).toThrow(DbcFormatError);
    expect(() => dbc.encode(0, [1], FORMAT)).toThrow(DbcFormatError);
    expect(() => formatKinds('nq')).toThrow(/not a DBC field letter/);
    const odd = file().slice();
    new DataView(odd.buffer).setUint32(12, 24, true);
    expect(() => Dbc.parse(odd)).toThrow(/only 4-byte fields/);
  });
});

describe('the layouts', () => {
  it('have a format letter for every field, ids first', () => {
    for (const l of DBC_LAYOUTS) {
      expect(l.format).toHaveLength(l.fields.length);
      expect(l.fields[0]!.kind).toBe('n');
      expect(new Set(l.fields.map((f) => f.name)).size).toBe(l.fields.length);
      expect(layoutOf(l.file.toUpperCase())).toBe(l);
    }
  });
  it('place the spell fields where the server reads them', () => {
    expect(SPELL_FIELDS).toHaveLength(234);
    expect(SPELL_INDEX).toMatchObject({ ID: 0, Attributes: 4, AttributesEx7: 11, CastingTimeIndex: 28, RangeIndex: 46, Speed: 47, Effect1: 71, EffectBasePoints1: 80, EffectImplicitTargetA1: 86, EffectTriggerSpell3: 118, SpellIconID: 133, Name: 136, Rank: 153, Description: 170, ToolTip: 187, SchoolMask: 225, SpellDifficultyID: 233 });
    expect(fieldIndex(SPELL_FIELDS, 'Mechanic')).toBe(3);
    expect(() => fieldIndex(SPELL_FIELDS, 'Nope')).toThrow(/No field/);
  });
});

const dbcDir = process.env.ACQC_WORLD_DB_DBC_DIR;
const serverSrc = process.env.ACQC_AC_SQL_DIR ? resolve(process.env.ACQC_AC_SQL_DIR, '..', '..', 'src', 'server', 'shared', 'DataStores', 'DBCfmt.h') : null;
const FILES = ['Spell', 'SpellIcon', 'SpellRange', 'SpellCastTimes', 'SpellDuration', 'SpellRadius', 'Item', 'ItemDisplayInfo', 'Faction', 'AreaTable'];

describe.skipIf(!dbcDir || !existsSync(join(dbcDir, 'Spell.dbc')))('the server files', () => {
  // The files are copied to a temp folder first: nothing is ever written next to the server's own
  const temp = mkdtempSync(join(tmpdir(), 'awe-dbc-'));
  afterAll(() => rmSync(temp, { recursive: true, force: true }));
  const copy = (name: string): Uint8Array => {
    copyFileSync(join(dbcDir!, `${name}.dbc`), join(temp, `${name}.dbc`));
    return new Uint8Array(readFileSync(join(temp, `${name}.dbc`)));
  };

  it.each(FILES)('%s.dbc matches its layout and is written back byte for byte', (name) => {
    const bytes = copy(name);
    const l = layoutOf(`${name}.dbc`)!;
    const dbc = Dbc.parse(bytes, name);
    expect(dbc.fieldCount).toBe(l.fields.length);
    const out = dbc.serialize();
    expect(out.length).toBe(bytes.length);
    expect(Buffer.compare(Buffer.from(out), Buffer.from(bytes))).toBe(0);
  }, 120_000);

  it('Spell.dbc keeps every other record when one is changed and one is added', () => {
    const bytes = copy('Spell');
    const dbc = Dbc.parse(bytes, 'Spell.dbc');
    const l = layoutOf('Spell.dbc')!;
    const row = dbc.rowOfId(133)!;
    const original = dbc.decode(row, l.format);
    expect(typeof original[SPELL_INDEX.Name!]).toBe('string');
    const edited = [...original];
    edited[SPELL_INDEX.Name!] = 'Fireball of Tests';
    edited[SPELL_INDEX.EffectBasePoints1!] = -7;
    dbc.upsert(133, edited, l.format);
    const clone = [...edited];
    clone[0] = 99999999;
    dbc.upsert(99999999, clone, l.format);
    const again = Dbc.parse(dbc.serialize(), 'Spell.dbc');
    expect(again.count).toBe(dbc.count);
    expect(again.decode(again.rowOfId(133)!, l.format)).toEqual(edited);
    expect(again.decode(again.rowOfId(99999999)!, l.format)[SPELL_INDEX.Name!]).toBe('Fireball of Tests');
    const other = Dbc.parse(bytes, 'Spell.dbc');
    expect(again.decode(again.rowOfId(134)!, l.format)).toEqual(other.decode(other.rowOfId(134)!, l.format));
  }, 120_000);

  it.skipIf(!serverSrc || !existsSync(serverSrc))('the layouts agree with the server format strings', () => {
    const source = readFileSync(serverSrc!, 'utf8');
    const fmt = (name: string): string => new RegExp(`${name}\\[\\] = "([^"]+)"`).exec(source)![1]!;
    const pairs: [string, string][] = [['Spell.dbc', 'SpellEntryfmt'], ['SpellRange.dbc', 'SpellRangefmt'], ['SpellCastTimes.dbc', 'SpellCastTimefmt'], ['SpellDuration.dbc', 'SpellDurationfmt'],
      ['SpellRadius.dbc', 'SpellRadiusfmt'], ['Item.dbc', 'Itemfmt'], ['ItemDisplayInfo.dbc', 'ItemDisplayTemplateEntryfmt'], ['Faction.dbc', 'FactionEntryfmt'], ['AreaTable.dbc', 'AreaTableEntryfmt']];
    for (const [file, name] of pairs) {
      const server = fmt(name);
      const mine = layoutOf(file)!.format;
      expect(mine).toHaveLength(server.length);
      // Where the server reads a float, a string or the id, the layout does too
      for (let i = 0; i < server.length; i += 1) {
        if (server[i] === 'f') expect(mine[i], `${file} field ${i}`).toBe('f');
        if (server[i] === 'n') expect(mine[i], `${file} field ${i}`).toBe('n');
        // The server skips what only the client shows (descriptions), so a string of ours may be an x of theirs
        if (mine[i] === 's') expect('sx', `${file} field ${i}`).toContain(server[i]);
      }
    }
  });
});
