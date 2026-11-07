import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeBlp } from '../../src/core/client/blp';
import { EMPTY_ENTITIES } from '../../src/core/entities/model';
import { itemRow } from '../../src/core/entities/item-columns';
import { layoutOf } from '../../src/core/game/dbc-formats';
import { rowsetStatements } from '../../src/core/tables/rowset';
import { applyTierSet, expectedPaths, removeTierSet } from '../../src/core/tiersets/apply';
import { statBudget, suggestStats } from '../../src/core/tiersets/budget';
import { composeSet } from '../../src/core/tiersets/compose';
import { fromBase64, prepareFile } from '../../src/core/tiersets/files';
import { decodePng, encodeBlp, isBlp } from '../../src/core/tiersets/image';
import { classMask, newTierSet, PIECES, type TierSet } from '../../src/core/tiersets/model';
import { buildItem, buildItemDbc, buildItemSet, clientItemPatchWarning, cloneDisplay, setIssues } from '../../src/core/tiersets/rows';
import { modelPaths, regionProblem, textureBase, textureFileName, texturePath } from '../../src/core/tiersets/textures';

const display = layoutOf('ItemDisplayInfo.dbc')!;
const at = (name: string): number => display.fields.findIndex((f) => f.name === name);
const baseDisplay = (): (number | string)[] => display.fields.map((f) => (f.kind === 's' ? '' : 0)).map((v, i) => (i === 0 ? 100 : v));

/** A saved-looking set: ids filled in, chest and head with new looks */
function savedSet(): TierSet {
  const set = newTierSet('Tier 1 Warrior', 1, 'plate');
  PIECES.forEach((k, i) => { set.pieces[k].entry = 900000 + i; set.pieces[k].look = { kind: 'existing', displayId: 5000 + i }; });
  set.itemSetId = 7000;
  set.pieces.chest.look = { kind: 'new', baseDisplayId: 100, displayId: 80001, textures: { '3': ['U'], '0': ['M', 'F'] }, model: false, icon: 'INV_Chest_Plate07' };
  set.pieces.head.look = { kind: 'new', baseDisplayId: 100, displayId: 80002, textures: {}, model: true, icon: '' };
  return set;
}

const png = (width: number, height: number, rgba: (x: number, y: number) => number[]): Uint8Array => {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) Buffer.from(rgba(x, y)).copy(raw, y * (width * 4 + 1) + 1 + x * 4);
  const chunk = (name: string, data: Buffer): Buffer => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(name, 4, 'ascii');
    data.copy(out, 8);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 6;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
};

describe('stat budget', () => {
  it('scales with item level, slot weight and quality', () => {
    const chest = statBudget({ itemLevel: 200, quality: 'epic', piece: 'chest' });
    expect(chest).toBe(280);
    expect(statBudget({ itemLevel: 200, quality: 'epic', piece: 'hands' })).toBe(210);
    expect(statBudget({ itemLevel: 200, quality: 'rare', piece: 'chest' })).toBeLessThan(chest);
    expect(statBudget({ itemLevel: 100, quality: 'epic', piece: 'chest' })).toBe(140);
  });
  it('spends exactly the budget, on stamina, the class main stat and two secondary stats', () => {
    const { stats, armor } = suggestStats({ classId: 1, armorType: 'plate', itemLevel: 200, quality: 'epic', piece: 'chest' });
    expect(stats.reduce((n, s) => n + s.value, 0)).toBe(280);
    expect(stats.map((s) => s.type)).toEqual([7, 4, 32, 37]);
    expect(armor).toBe(1100);
  });
  it('gives casters intellect and spell power, and cloth little armor', () => {
    const mage = suggestStats({ classId: 8, armorType: 'cloth', itemLevel: 200, quality: 'epic', piece: 'head' });
    expect(mage.stats.map((s) => s.type)).toEqual([7, 5, 45, 32]);
    expect(mage.armor).toBeLessThan(150);
  });
  it('falls back to a melee role for a class it does not know', () => {
    expect(suggestStats({ classId: 99, armorType: 'mail', itemLevel: 100, quality: 'rare', piece: 'legs' }).stats[1]!.type).toBe(4);
  });
});

describe('rows of a set', () => {
  it('builds an armor item_template row with class mask, set id and material', () => {
    const set = savedSet();
    const item = buildItem(set, 'chest', 7000);
    const row = itemRow(item);
    expect(row).toMatchObject({
      entry: '900002', name: 'Tier 1 Warrior Chest', class: '4', subclass: '4', InventoryType: '5', displayid: '80001', Quality: '4', ItemLevel: '213',
      RequiredLevel: '80', bonding: '1', AllowableClass: '1', itemset: '7000', Material: '6',
    });
    expect(Number(row.armor)).toBe(set.pieces.chest.armor);
  });
  it('uses the class bit, also for the classes above 31 bits of the old masks', () => {
    expect(classMask(1)).toBe(1);
    expect(classMask(11)).toBe(1024);
    expect(classMask(32)).toBe(2 ** 31);
  });
  it('uses the subclass of the armor type and the stats given', () => {
    const set = savedSet();
    set.armorType = 'cloth';
    set.pieces.legs.stats = [{ type: 5, value: 40 }];
    const row = itemRow(buildItem(set, 'legs', 7000));
    expect(row).toMatchObject({ subclass: '1', InventoryType: '7', StatsCount: '1', stat_type1: '5', stat_value1: '40', Material: '7' });
  });
  it('builds the item_dbc row the client is sent', () => {
    expect(buildItemDbc(savedSet(), 'head')).toEqual({
      ID: '900000', ClassID: '4', SubclassID: '4', Sound_Override_Subclassid: '-1', Material: '6', DisplayInfoID: '80002', InventoryType: '1', SheatheType: '0',
    });
  });
  it('builds an ItemSet.dbc record with the name and the five items, and no bonuses', () => {
    const fields = layoutOf('ItemSet.dbc')!.fields;
    const values = buildItemSet(savedSet(), 7000);
    expect(values).toHaveLength(fields.length);
    expect(values[0]).toBe(7000);
    expect(values[1]).toBe('Tier 1 Warrior');
    const first = fields.findIndex((f) => f.name === 'ItemID1');
    expect(values.slice(first, first + 6)).toEqual([900000, 900001, 900002, 900003, 900004, 0]);
    const spell = fields.findIndex((f) => f.name === 'SetSpellID1');
    expect(values.slice(spell, spell + 16).every((v) => v === 0)).toBe(true);
  });
  it('asks for the ClientItemPatches registration of the item ids', () => {
    expect(clientItemPatchWarning([])).toBeNull();
    expect(clientItemPatchWarning([900000, 900001])).toContain('900000, 900001');
    expect(clientItemPatchWarning([900000])).toContain('ClientItemPatches');
  });
  it('flags a missing look, an unnamed set and stats far above the budget', () => {
    const set = newTierSet('', 1, 'plate');
    expect(setIssues(set).filter((i) => i.severity === 'error').length).toBeGreaterThan(5);
    const ok = savedSet();
    expect(setIssues(ok).filter((i) => i.severity === 'error')).toEqual([]);
    ok.pieces.legs.stats = [{ type: 7, value: 5000 }];
    expect(setIssues(ok).some((i) => i.severity === 'warning' && i.message.includes('Legs'))).toBe(true);
  });
});

describe('texture names and sizes', () => {
  it('names a body texture CoA_<Set>_<Piece>_<Region>_<U|M|F>', () => {
    expect(textureBase('Tier 1 Warrior', 'chest', 3)).toBe('CoA_Tier1Warrior_Chest_TU');
    expect(textureFileName('Tier 1 Warrior', 'chest', 3, 'M')).toBe('CoA_Tier1Warrior_Chest_TU_M.blp');
    expect(texturePath('Tier 1 Warrior', 'hands', 2, 'U')).toBe('Item\\TextureComponents\\HandTexture\\CoA_Tier1Warrior_Hands_HA_U.blp');
  });
  it('checks the size of each region', () => {
    expect(regionProblem(3, 256, 128)).toBeNull();
    expect(regionProblem(2, 256, 64)).toBeNull();
    expect(regionProblem(2, 256, 128)).toContain('256x64');
    expect(regionProblem(0, 128, 128)).toContain('Upper arm');
  });
  it('puts a head model in every race and sex, and a shoulder model on its side', () => {
    const head = modelPaths('Tier 1', 'head', 'head', 'm2');
    expect(head).toHaveLength(20);
    expect(head[0]).toBe('Item\\ObjectComponents\\Head\\CoA_Tier1_Head_HuM.m2');
    expect(modelPaths('Tier 1', 'head', 'head', 'skin')[1]).toBe('Item\\ObjectComponents\\Head\\CoA_Tier1_Head_HuF00.skin');
    expect(modelPaths('Tier 1', 'shoulders', 'right', 'm2')).toEqual(['Item\\ObjectComponents\\Shoulder\\CoA_Tier1_Shoulders_R.m2']);
    expect(modelPaths('Tier 1', 'shoulders', 'left', 'blp')).toEqual(['Item\\ObjectComponents\\Shoulder\\CoA_Tier1_Shoulders.blp']);
  });
});

describe('display cloning', () => {
  it('copies the base and replaces only the textures, model and icon given', () => {
    const base = baseDisplay();
    base[at('Texture1')] = 'Old_AU';
    base[at('Texture7')] = 'Old_LL';
    base[at('Flags')] = 3;
    const out = cloneDisplay(base, 80001, 'Tier 1', 'chest', { textures: { '3': ['U'], '0': ['M'] }, model: false, icon: 'INV_Chest' });
    expect(out[0]).toBe(80001);
    expect(out[at('Texture1')]).toBe('CoA_Tier1_Chest_AU');
    expect(out[at('Texture4')]).toBe('CoA_Tier1_Chest_TU');
    expect(out[at('Texture7')]).toBe('Old_LL');
    expect(out[at('InventoryIcon1')]).toBe('INV_Chest');
    expect(out[at('Flags')]).toBe(3);
    expect(base[0]).toBe(100);
  });
  it('sets the model names and texture of a head or shoulders', () => {
    const head = cloneDisplay(baseDisplay(), 9, 'Tier 1', 'head', { textures: {}, model: true, icon: '' });
    expect(head[at('ModelName1')]).toBe('CoA_Tier1_Head.m2');
    expect(head[at('ModelTexture1')]).toBe('CoA_Tier1_Head');
    const shoulders = cloneDisplay(baseDisplay(), 9, 'Tier 1', 'shoulders', { textures: {}, model: true, icon: '' });
    expect([shoulders[at('ModelName1')], shoulders[at('ModelName2')]]).toEqual(['CoA_Tier1_Shoulders_L.m2', 'CoA_Tier1_Shoulders_R.m2']);
    expect([shoulders[at('ModelTexture1')], shoulders[at('ModelTexture2')]]).toEqual(['CoA_Tier1_Shoulders', 'CoA_Tier1_Shoulders']);
  });
  it('keeps the base model when the new look has no model of its own', () => {
    const base = baseDisplay();
    base[at('ModelName1')] = 'Helm_Plate.m2';
    expect(cloneDisplay(base, 9, 'Tier 1', 'head', { textures: {}, model: false, icon: '' })[at('ModelName1')]).toBe('Helm_Plate.m2');
  });
});

describe('saving a set into the project', () => {
  const bases = new Map([[100, baseDisplay()]]);

  it('writes five items, five item_dbc sheets, the ItemSet record and a display per new look', () => {
    const out = applyTierSet(structuredClone(EMPTY_ENTITIES), savedSet(), undefined, bases);
    expect(out.items.map((i) => i.entry)).toEqual([900000, 900001, 900002, 900003, 900004]);
    expect(out.rowsets!.filter((s) => s.table === 'item_dbc')).toHaveLength(5);
    expect(rowsetStatements(out.rowsets).apply.filter((s) => s.kind === 'insert' && s.table === 'item_dbc')).toHaveLength(5);
    const edits = Object.fromEntries(out.dbcEdits!.map((e) => [e.file, e.records.map((r) => r.id)]));
    expect(edits).toEqual({ 'ItemDisplayInfo.dbc': [80001, 80002], 'ItemSet.dbc': [7000] });
    expect(out.tierSets).toHaveLength(1);
  });
  it('replaces what an earlier save made instead of adding to it', () => {
    const first = applyTierSet(structuredClone(EMPTY_ENTITIES), savedSet(), undefined, bases);
    const changed = savedSet();
    changed.pieces.chest.look = { kind: 'existing', displayId: 1234 };
    const second = applyTierSet(first, changed, first.tierSets![0], bases);
    expect(second.items).toHaveLength(5);
    expect(second.items.find((i) => i.entry === 900002)!.displayId).toBe(1234);
    expect(second.dbcEdits!.find((e) => e.file === 'ItemDisplayInfo.dbc')!.records.map((r) => r.id)).toEqual([80002]);
    expect(second.tierSets).toHaveLength(1);
  });
  it('drops the files no look uses any more and keeps the others', () => {
    const set = savedSet();
    const kept = { paths: [texturePath(set.name, 'chest', 3, 'U')], data: 'AA==' };
    const stale = { paths: [texturePath(set.name, 'chest', 3, 'F')], data: 'AA==' };
    const other = { paths: [texturePath('Other Set', 'chest', 3, 'F')], data: 'AA==' };
    const out = applyTierSet({ ...EMPTY_ENTITIES, clientFiles: [kept, stale, other] }, set, undefined, bases);
    expect(out.clientFiles!.map((f) => f.paths[0])).toEqual([kept.paths[0], other.paths[0]]);
    expect([...expectedPaths(set)]).toContain(kept.paths[0]);
  });
  it('refuses a base look the DBC does not have', () => {
    expect(() => applyTierSet(structuredClone(EMPTY_ENTITIES), savedSet(), undefined, new Map())).toThrow(/base look/);
  });
  it('removes everything a set made', () => {
    const set = savedSet();
    const made = applyTierSet({ ...EMPTY_ENTITIES, clientFiles: [{ paths: [texturePath(set.name, 'chest', 3, 'U')], data: 'AA==' }] }, set, undefined, bases);
    const gone = removeTierSet(made, set);
    expect(gone).toEqual({ npcs: [], objects: [], items: [] });
  });
});

describe('composing a set (the MCP tool)', () => {
  it('makes a new set with suggested stats on every piece', () => {
    const set = composeSet('Frost', undefined, { classId: 8, armorType: 'cloth', itemLevel: 226 }, false);
    expect(set.itemLevel).toBe(226);
    expect(PIECES.every((k) => set.pieces[k].stats.length === 4 && set.pieces[k].armor > 0)).toBe(true);
    expect(set.pieces.legs.name).toBe('Frost Legs');
  });
  it('keeps the stats of an update unless asked to suggest again', () => {
    const base = composeSet('Frost', undefined, { classId: 8, armorType: 'cloth' }, false);
    const kept = composeSet('Frost', base, { itemLevel: 300, pieces: { head: { name: 'Frost Crown' } } }, false);
    expect(kept.pieces.chest.stats).toEqual(base.pieces.chest.stats);
    expect(kept.pieces.head.name).toBe('Frost Crown');
    const redone = composeSet('Frost', base, { itemLevel: 300 }, true);
    expect(redone.pieces.chest.stats).not.toEqual(base.pieces.chest.stats);
  });
  it('needs a class and an armor type for a new set', () => {
    expect(() => composeSet('Frost', undefined, {}, false)).toThrow(/classId/);
  });
});

describe('PNG to BLP', () => {
  it('reads a PNG', () => {
    const img = decodePng(png(2, 2, (x, y) => [x * 100, y * 100, 7, 255]));
    expect([img.width, img.height]).toEqual([2, 2]);
    expect(Array.from(img.rgba.subarray(4, 8))).toEqual([100, 0, 7, 255]);
  });
  it('writes a BLP2 with every mip level that the decoder reads back', () => {
    const blp = encodeBlp(decodePng(png(16, 8, () => [200, 40, 40, 255])));
    expect(isBlp(blp)).toBe(true);
    const back = decodeBlp(blp);
    expect([back.width, back.height]).toEqual([16, 8]);
    const [r, g, b, a] = Array.from(back.rgba.subarray(0, 4)) as [number, number, number, number];
    expect(Math.abs(r - 200)).toBeLessThan(10);
    expect(Math.abs(g - 40)).toBeLessThan(10);
    expect(Math.abs(b - 40)).toBeLessThan(10);
    expect(a).toBe(255);
    const view = new DataView(blp.buffer, blp.byteOffset);
    expect(view.getUint32(20 + 4 * 4, true)).toBeGreaterThan(0);
  });
  it('keeps transparency with DXT5', () => {
    const back = decodeBlp(encodeBlp(decodePng(png(8, 8, (x) => [10, 200, 10, x < 4 ? 0 : 255]))));
    expect(back.rgba[3]).toBe(0);
    expect(back.rgba[7 * 4 + 3]).toBe(255);
  });
});

describe('dropped files', () => {
  it('converts a PNG of the right size and names it for its region', () => {
    const file = prepareFile('Tier 1', 'chest', { kind: 'texture', region: 3, suffix: 'M' }, png(256, 128, () => [30, 30, 30, 255]));
    expect(file.paths).toEqual(['Item\\TextureComponents\\TorsoUpperTexture\\CoA_Tier1_Chest_TU_M.blp']);
    expect(isBlp(fromBase64(file.data))).toBe(true);
  });
  it('refuses a texture of the wrong size, for the wrong piece, or that is not an image', () => {
    expect(() => prepareFile('Tier 1', 'chest', { kind: 'texture', region: 3, suffix: 'U' }, png(128, 128, () => [0, 0, 0, 255]))).toThrow('256x128');
    expect(() => prepareFile('Tier 1', 'legs', { kind: 'texture', region: 3, suffix: 'U' }, png(256, 128, () => [0, 0, 0, 255]))).toThrow(/no Upper torso/);
    expect(() => prepareFile('Tier 1', 'chest', { kind: 'texture', region: 3, suffix: 'U' }, new Uint8Array([1, 2, 3]))).toThrow(/PNG or a BLP/);
  });
  it('tells the files of a model apart by their headers', () => {
    const m2 = new Uint8Array([0x4d, 0x44, 0x32, 0x30, 1, 2, 3]);
    expect(prepareFile('Tier 1', 'head', { kind: 'model', slot: 'head', file: 'm2' }, m2).paths).toHaveLength(20);
    expect(() => prepareFile('Tier 1', 'head', { kind: 'model', slot: 'head', file: 'skin' }, m2)).toThrow(/skin/);
    expect(() => prepareFile('Tier 1', 'chest', { kind: 'model', slot: 'head', file: 'm2' }, m2)).toThrow(/head and the shoulders/);
    expect(() => prepareFile('Tier 1', 'shoulders', { kind: 'model', slot: 'left', file: 'blp' }, png(100, 100, () => [0, 0, 0, 255]))).toThrow(/power-of-two/);
    expect(prepareFile('Tier 1', 'shoulders', { kind: 'model', slot: 'left', file: 'blp' }, png(64, 64, () => [0, 0, 0, 255])).paths).toEqual(['Item\\ObjectComponents\\Shoulder\\CoA_Tier1_Shoulders.blp']);
  });
});
