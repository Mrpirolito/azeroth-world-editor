import type { DbcValue } from '../game/dbc-file';
import { fieldIndex, layoutOf } from '../game/dbc-formats';
import { newItem, type CustomItem } from '../entities/model';
import type { Row } from '../tables/types';
import { statBudget } from './budget';
import { ARMOR_TYPES, classMask, PIECES, PIECE_INFO, REGIONS, type Piece, type PieceKey, type Suffix, type TierSet } from './model';
import { modelNames, textureBase } from './textures';

const DISPLAY_FIELDS = layoutOf('ItemDisplayInfo.dbc')!.fields;
const DI = {
  ModelName: fieldIndex(DISPLAY_FIELDS, 'ModelName1'),
  ModelTexture: fieldIndex(DISPLAY_FIELDS, 'ModelTexture1'),
  Icon: fieldIndex(DISPLAY_FIELDS, 'InventoryIcon1'),
  Texture: fieldIndex(DISPLAY_FIELDS, 'Texture1'),
};

/**
 * A new `ItemDisplayInfo` record copied from a base one: the id, the body textures the piece paints (by region), the
 * model and model texture of a head or shoulder, and the icon are replaced; everything else is the base's.
 */
export function cloneDisplay(base: readonly DbcValue[], id: number, set: string, piece: PieceKey, look: { textures: Record<string, readonly Suffix[]>; model: boolean; icon: string }): DbcValue[] {
  const out = [...base];
  out[0] = id;
  for (const region of REGIONS) {
    if ((look.textures[String(region.index)] ?? []).length > 0) out[DI.Texture + region.index] = textureBase(set, piece, region.index);
  }
  if (look.model && (piece === 'head' || piece === 'shoulders')) {
    const n = modelNames(set, piece);
    out[DI.ModelName] = n.modelName[0];
    out[DI.ModelName + 1] = n.modelName[1];
    out[DI.ModelTexture] = n.modelTexture[0];
    out[DI.ModelTexture + 1] = n.modelTexture[1];
  }
  if (look.icon) out[DI.Icon] = look.icon;
  return out;
}

/** The display id a piece uses, once it has one */
export const displayIdOf = (piece: Piece): number => piece.look.displayId;

/** The `item_template` item of a piece (a new item of the project, written as a row on export) */
export function buildItem(set: TierSet, key: PieceKey, itemSetId: number): CustomItem {
  const piece = set.pieces[key];
  const armor = ARMOR_TYPES[set.armorType];
  return {
    ...newItem(piece.entry),
    name: piece.name, quality: set.quality, itemClass: 4, subclass: armor.subclass, inventoryType: piece.inventoryType, displayId: displayIdOf(piece),
    itemLevel: set.itemLevel, requiredLevel: set.requiredLevel, bonding: 'pickup', armor: piece.armor, stats: piece.stats.map((s) => ({ ...s })),
    advanced: { AllowableClass: String(classMask(set.classId)), itemset: String(itemSetId), Material: String(armor.material) },
  };
}

/** The `item_dbc` row of a piece: what the client is sent for an item its own files do not have */
export function buildItemDbc(set: TierSet, key: PieceKey): Row {
  const piece = set.pieces[key];
  const armor = ARMOR_TYPES[set.armorType];
  return {
    ID: String(piece.entry), ClassID: '4', SubclassID: String(armor.subclass), Sound_Override_Subclassid: '-1', Material: String(armor.material),
    DisplayInfoID: String(displayIdOf(piece)), InventoryType: String(piece.inventoryType), SheatheType: '0',
  };
}

/** The `ItemSet.dbc` record: the name and the five items; the bonus spells and thresholds stay empty (phase 2) */
export function buildItemSet(set: TierSet, itemSetId: number): DbcValue[] {
  const fields = layoutOf('ItemSet.dbc')!.fields;
  const values: DbcValue[] = fields.map((f) => (f.kind === 's' ? '' : 0));
  values[0] = itemSetId;
  values[fieldIndex(fields, 'Name')] = set.name;
  const first = fieldIndex(fields, 'ItemID1');
  PIECES.forEach((key, i) => { values[first + i] = set.pieces[key].entry; });
  return values;
}

export interface SetIssue {
  severity: 'error' | 'warning';
  message: string;
}

/** What is wrong with a set before it is saved */
export function setIssues(set: TierSet): SetIssue[] {
  const out: SetIssue[] = [];
  const add = (severity: SetIssue['severity'], message: string): void => { out.push({ severity, message }); };
  if (set.name.trim() === '') add('error', 'The set needs a name.');
  for (const key of PIECES) {
    const p = set.pieces[key];
    const label = PIECE_INFO[key].label;
    if (p.name.trim() === '') add('error', `${label}: the piece needs a name.`);
    if (!PIECE_INFO[key].types.includes(p.inventoryType)) add('error', `${label}: slot ${p.inventoryType} does not fit this piece.`);
    if (p.look.kind === 'existing' && p.look.displayId <= 0) add('error', `${label}: pick a look.`);
    if (p.look.kind === 'new') {
      if (p.look.baseDisplayId <= 0) add('error', `${label}: pick the base look to copy.`);
      if (Object.values(p.look.textures).every((s) => s.length === 0) && !p.look.model) add('warning', `${label}: no texture or model was added, so the new look is the base's.`);
    }
    const spent = p.stats.reduce((n, s) => n + Math.max(0, s.value), 0);
    const budget = statBudget({ itemLevel: set.itemLevel, quality: set.quality, piece: key });
    if (spent > budget * 1.25) add('warning', `${label}: the stats add up to ${spent}, well above the ${budget} an item level ${set.itemLevel} ${set.quality} piece normally has.`);
  }
  return out;
}

/** The warning for the pull request and the export: these items need registering in the server's C++ */
export function clientItemPatchWarning(entries: readonly number[]): string | null {
  if (entries.length === 0) return null;
  return `Tier set items ${entries.join(', ')} need Ascension::ClientItemPatches::Instance().Register(id) in the server's C++ (AscensionCompat.cpp), or the client shows them as "?". The editor cannot edit C++.`;
}
