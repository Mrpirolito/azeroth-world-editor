import { CLASSES, RACES } from '../conditions/catalogue';
import { bits } from './flags';
import type { Field } from './types';

/**
 * The `item_template` columns the item editor's typed fields do not cover, as named toggles and dropdowns: item flags, who may use
 * the item, sockets, sets and durability. They are kept in the item's `advanced` bag (column to text), so an existing item keeps
 * everything else it came with.
 */

const f = (column: string, label: string, type: Partial<Field>, more: Partial<Field> = {}): Field => ({ ...type, column, label, ...more }) as Field;
const int = (column: string, label: string, more: Partial<Field> = {}): Field => f(column, label, { type: 'int' }, more);
const choice = (column: string, label: string, options: readonly (readonly [number, string])[], more: Partial<Field> = {}): Field => f(column, label, { type: 'enum', options } as Partial<Field>, more);
const flags = (column: string, label: string, list: ReturnType<typeof bits>, more: Partial<Field> = {}): Field => f(column, label, { type: 'flags', bits: list } as Partial<Field>, more);

const SOCKET_COLORS = [[0, 'No socket'], [1, 'Meta'], [2, 'Red'], [4, 'Yellow'], [8, 'Blue']] as const;

export const ITEM_FIELDS: readonly Field[] = [
  flags('Flags', 'Item flags', bits([
    [1, 'Conjured'], [2, 'Can be opened', 'Right-click opens its loot'], [3, 'Heroic tooltip'], [4, 'Cannot be used'], [5, 'Cannot be destroyed'], [7, 'No equip cooldown'],
    [9, 'Wraps other items'], [11, 'Stays in the loot when looted'], [13, 'Guild or arena charter'], [14, 'Readable'], [15, 'Cannot be disenchanted'], [16, 'Time counts while offline'],
    [17, 'No creator name'], [18, 'Can be prospected'], [19, 'Unique equipped'], [22, 'No durability loss'], [23, 'Usable while shapeshifted'], [24, 'Quest glow'],
    [27, 'Bound to account'], [28, 'No reagent cost'], [29, 'Can be milled'], [30, 'Reports to guild chat'],
  ]), { group: 'Flags' }),
  flags('FlagsExtra', 'More flags', bits([
    [0, 'Horde only'], [1, 'Alliance only'], [2, 'Gold needed besides the extended cost'], [5, 'Anyone can roll Need'], [8, 'Greed rolls only'], [12, 'Worth nothing to vendors'], [13, 'Shown before it is discovered'],
  ]), { group: 'Flags' }),
  flags('flagsCustom', 'Server flags', bits([[0, 'Real-time duration'], [1, 'Ignores quest status'], [2, 'Follows loot rules']]), { group: 'Flags' }),
  flags('AllowableClass', 'Classes that can use it', CLASSES, { group: 'Who can use it', help: 'None ticked or all ticked: everyone.' }),
  flags('AllowableRace', 'Races that can use it', RACES, { group: 'Who can use it' }),
  int('RequiredSkill', 'Needs skill', { group: 'Who can use it', zero: 'none' }),
  int('RequiredSkillRank', 'Skill level', { group: 'Who can use it' }),
  int('requiredspell', 'Needs spell', { group: 'Who can use it', zero: 'none' }),
  int('RequiredReputationFaction', 'Needs standing with faction', { group: 'Who can use it', zero: 'none' }),
  choice('RequiredReputationRank', 'At least', [[0, 'Hated'], [1, 'Hostile'], [2, 'Unfriendly'], [3, 'Neutral'], [4, 'Friendly'], [5, 'Honored'], [6, 'Revered'], [7, 'Exalted']], { group: 'Who can use it' }),
  int('Map', 'Only on map', { group: 'Who can use it', zero: 'anywhere' }),
  int('area', 'Only in area', { group: 'Who can use it', zero: 'anywhere' }),
  choice('socketColor_1', 'Socket 1', SOCKET_COLORS, { group: 'Sockets' }),
  int('socketContent_1', 'Socket 1 gem enchantment', { group: 'Sockets' }),
  choice('socketColor_2', 'Socket 2', SOCKET_COLORS, { group: 'Sockets' }),
  int('socketContent_2', 'Socket 2 gem enchantment', { group: 'Sockets' }),
  choice('socketColor_3', 'Socket 3', SOCKET_COLORS, { group: 'Sockets' }),
  int('socketContent_3', 'Socket 3 gem enchantment', { group: 'Sockets' }),
  int('socketBonus', 'Socket bonus enchantment', { group: 'Sockets', zero: 'none', help: 'An id of SpellItemEnchantment.dbc.' }),
  int('GemProperties', 'Gem properties', { group: 'Sockets', zero: 'not a gem', help: 'For gems: an id of GemProperties.dbc.' }),
  int('itemset', 'Set', { group: 'Set and randomness', zero: 'none' }),
  int('RandomProperty', 'Random property', { group: 'Set and randomness', zero: 'none' }),
  int('RandomSuffix', 'Random suffix', { group: 'Set and randomness', zero: 'none' }),
  int('MaxDurability', 'Durability', { group: 'Wear and look' }),
  choice('Material', 'Made of', [[-1, 'Consumable'], [0, 'Not set'], [1, 'Metal'], [2, 'Wood'], [3, 'Liquid'], [4, 'Jewelry'], [5, 'Chain'], [6, 'Plate'], [7, 'Cloth'], [8, 'Leather']], { group: 'Wear and look' }),
  choice('sheath', 'Carried', [[0, 'Not drawn'], [1, 'Two-handed'], [2, 'Staff'], [3, 'One-handed'], [4, 'Shield'], [5, 'Enchanter rod'], [6, 'Off-hand']], { group: 'Wear and look' }),
  int('duration', 'Lasts (seconds)', { group: 'Wear and look', zero: 'forever' }),
  int('ContainerSlots', 'Bag slots', { group: 'Wear and look' }),
  flags('BagFamily', 'Goes in special bags', bits([
    [0, 'Arrows'], [1, 'Bullets'], [2, 'Soul shards'], [3, 'Leatherworking'], [4, 'Inscription'], [5, 'Herbs'], [6, 'Enchanting'], [7, 'Engineering'], [8, 'Keys'], [9, 'Gems'], [10, 'Mining'], [14, 'Quest items'],
  ]), { group: 'Wear and look' }),
  int('lockid', 'Lock', { group: 'Advanced', zero: 'none' }),
  int('RequiredDisenchantSkill', 'Disenchant skill', { group: 'Advanced' }),
  int('DisenchantID', 'Disenchant loot list', { group: 'Advanced', zero: 'none', help: 'Set by the "Breaks down into" tab.' }),
  int('minMoneyLoot', 'Least gold inside', { group: 'Advanced' }), int('maxMoneyLoot', 'Most gold inside', { group: 'Advanced' }),
];
