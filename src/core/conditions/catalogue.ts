import type { Bit, Choice, ParamDef } from '../smartai/types';
import type { Row } from '../tables/types';

/**
 * Conditions (`conditions` rows): what a gossip option, a loot row, a SmartAI event, a vendor item or a quest needs to be true
 * before it shows or fires. The numbers are AzerothCore's (`ConditionMgr.h`); the wording is this project's own.
 */

export interface ConditionDef {
  id: number;
  name: string;
  help: string;
  /** What `ConditionValue1`..`3` mean for this type, in column order; columns past the end are unused */
  params: readonly ParamDef[];
  /** The condition as the end of a sentence about its subject, with `{1}`..`{3}` for the values */
  say: string;
}

const p = (label: string, kind: ParamDef['kind'], more: Partial<ParamDef> = {}): ParamDef => ({ label, kind, ...more });
const bits = (list: readonly (readonly [number, string])[]): Bit[] => list.map(([n, label]) => ({ value: 2 ** n, label }));
const COMPARISON: readonly Choice[] = [[0, 'exactly'], [1, 'more than'], [2, 'less than'], [3, 'at least'], [4, 'at most']];
export const RANKS = bits([[0, 'Hated'], [1, 'Hostile'], [2, 'Unfriendly'], [3, 'Neutral'], [4, 'Friendly'], [5, 'Honored'], [6, 'Revered'], [7, 'Exalted']]);
export const CLASSES = bits([[0, 'Warrior'], [1, 'Paladin'], [2, 'Hunter'], [3, 'Rogue'], [4, 'Priest'], [5, 'Death Knight'], [6, 'Shaman'], [7, 'Mage'], [8, 'Warlock'], [10, 'Druid']]);
export const RACES = bits([[0, 'Human'], [1, 'Orc'], [2, 'Dwarf'], [3, 'Night elf'], [4, 'Undead'], [5, 'Tauren'], [6, 'Gnome'], [7, 'Troll'], [9, 'Blood elf'], [10, 'Draenei']]);
const QUEST_STATES = bits([[0, 'Not taken'], [1, 'Complete'], [3, 'In progress'], [5, 'Failed'], [6, 'Rewarded']]);
const TYPE_MASK = bits([[3, 'Creature'], [4, 'Player'], [5, 'Game object'], [7, 'Corpse']]);
const RELATIONS: readonly Choice[] = [[0, 'self'], [1, 'in its party'], [2, 'in its raid'], [3, 'its owner'], [4, 'its passenger'], [5, 'its creator']];

export const CONDITIONS: readonly ConditionDef[] = [
  { id: 0, name: 'Always true', help: 'Passes whatever the target is. Used to cancel a condition inherited from a reference.', params: [], say: 'is anything' },
  { id: 1, name: 'Has an aura', help: 'The target is under the effect of a spell.', params: [p('Spell', 'spell'), p('Effect (0-2)', 'int', { help: 'Which effect of the spell must be present.' })], say: 'has the aura of spell {1}' },
  { id: 2, name: 'Has an item', help: 'The player carries the item.', params: [p('Item', 'item'), p('Count', 'int', { zero: 'one' }), p('Count the bank too', 'bool')], say: 'carries {2} of item {1}' },
  { id: 3, name: 'Has an item equipped', help: 'The player wears or wields the item.', params: [p('Item', 'item')], say: 'has item {1} equipped' },
  { id: 4, name: 'Is in a zone', help: 'The target stands in the zone (the big area).', params: [p('Zone', 'area')], say: 'is in zone {1}' },
  { id: 5, name: 'Reputation', help: 'The player\'s standing with a faction is one of the ticked ranks.', params: [p('Faction', 'faction'), p('Standing', 'flags', { bits: RANKS })], say: 'has standing {2} with faction {1}' },
  { id: 6, name: 'Team', help: 'The player is Alliance or Horde.', params: [p('Team', 'enum', { options: [[469, 'Alliance'], [67, 'Horde']] })], say: 'is on team {1}' },
  { id: 7, name: 'Skill', help: 'The player has a skill at a value.', params: [p('Skill', 'int'), p('Least value', 'int', { zero: 'any' })], say: 'has skill {1} of at least {2}' },
  { id: 8, name: 'Quest rewarded', help: 'The player has handed in the quest (it is in their history).', params: [p('Quest', 'quest')], say: 'has completed quest {1}' },
  { id: 9, name: 'Quest in the log', help: 'The player has the quest in their log, done or not.', params: [p('Quest', 'quest')], say: 'has quest {1} in the log' },
  { id: 10, name: 'Drunk', help: 'How drunk the player is.', params: [p('State', 'enum', { options: [[0, 'sober'], [1, 'tipsy'], [2, 'drunk'], [3, 'smashed']] })], say: 'is {1}' },
  { id: 11, name: 'World state', help: 'A world state variable holds a value.', params: [p('World state', 'int'), p('Value', 'int')], say: 'has world state {1} at {2}' },
  { id: 12, name: 'Game event active', help: 'A game event (a holiday, a seasonal event) is running.', params: [p('Game event', 'gameEvent')], say: 'sees game event {1} running' },
  { id: 13, name: 'Instance data', help: 'A value the instance script keeps.', params: [p('Entry', 'int'), p('Data', 'int'), p('Kind', 'enum', { options: [[0, 'data'], [1, 'boss state']] })], say: 'has instance {3} {1} at {2}' },
  { id: 14, name: 'Quest not taken', help: 'The player has neither the quest in the log nor handed it in.', params: [p('Quest', 'quest')], say: 'has not taken quest {1}' },
  { id: 15, name: 'Class', help: 'The player is one of the ticked classes.', params: [p('Classes', 'flags', { bits: CLASSES })], say: 'is of class {1}' },
  { id: 16, name: 'Race', help: 'The player is one of the ticked races.', params: [p('Races', 'flags', { bits: RACES })], say: 'is of race {1}' },
  { id: 17, name: 'Achievement', help: 'The player has the achievement.', params: [p('Achievement', 'int')], say: 'has achievement {1}' },
  { id: 18, name: 'Title', help: 'The player has the title.', params: [p('Title', 'int')], say: 'has title {1}' },
  { id: 19, name: 'Spawn mask', help: 'The difficulty the map is run on.', params: [p('Difficulties', 'int')], say: 'is on difficulty mask {1}' },
  { id: 20, name: 'Gender', help: 'The target\'s gender.', params: [p('Gender', 'enum', { options: [[0, 'male'], [1, 'female'], [2, 'neither']] })], say: 'is {1}' },
  { id: 21, name: 'Unit state', help: 'A unit state bit the target has.', params: [p('State bit', 'int')], say: 'is in unit state {1}' },
  { id: 22, name: 'Is on a map', help: 'The target is on the map.', params: [p('Map', 'map'), p('Area', 'area', { zero: 'any area' })], say: 'is on map {1}' },
  { id: 23, name: 'Is in an area', help: 'The target stands in the area (a small area).', params: [p('Area', 'area')], say: 'is in area {1}' },
  { id: 24, name: 'Creature type', help: 'The target is of a creature type.', params: [p('Type', 'int')], say: 'is of creature type {1}' },
  { id: 25, name: 'Knows a spell', help: 'The player has learned the spell.', params: [p('Spell', 'spell')], say: 'knows spell {1}' },
  { id: 26, name: 'Phase', help: 'The target is in one of the phases.', params: [p('Phase mask', 'phaseMask')], say: 'is in phase {1}' },
  { id: 27, name: 'Level', help: 'The target\'s level.', params: [p('Level', 'int'), p('Compare', 'enum', { options: COMPARISON })], say: 'has level {2} {1}' },
  { id: 28, name: 'Quest done, not handed in', help: 'The player has finished the objectives but not turned the quest in.', params: [p('Quest', 'quest')], say: 'has finished quest {1} but not handed it in' },
  { id: 29, name: 'Near a creature', help: 'A creature is within a distance of the target.', params: [p('Creature', 'creature'), p('Distance (yd)', 'yards'), p('Only if dead', 'bool')], say: 'has creature {1} within {2} yards' },
  { id: 30, name: 'Near an object', help: 'A game object is within a distance of the target.', params: [p('Game object', 'gameobject'), p('Distance (yd)', 'yards')], say: 'has game object {1} within {2} yards' },
  { id: 31, name: 'Is a certain object', help: 'The target is this creature, object or player (by entry, or by spawn guid).', params: [p('Kind', 'enum', { options: [[3, 'creature'], [4, 'player'], [5, 'game object'], [7, 'corpse']] }), p('Entry', 'int', { zero: 'any' }), p('Spawn guid', 'int', { zero: 'any' })], say: 'is the {1} {2}' },
  { id: 32, name: 'Kind of object', help: 'The target is one of the ticked kinds.', params: [p('Kinds', 'flags', { bits: TYPE_MASK })], say: 'is of kind {1}' },
  { id: 33, name: 'Related to the other target', help: 'How the target relates to another object of the check.', params: [p('Other target', 'int'), p('Relation', 'enum', { options: RELATIONS })], say: 'is {2} of target {1}' },
  { id: 34, name: 'Reaction to the other target', help: 'How friendly the target is towards another object of the check.', params: [p('Other target', 'int'), p('Standing', 'flags', { bits: RANKS })], say: 'has standing {2} towards target {1}' },
  { id: 35, name: 'Distance to the other target', help: 'How far the target is from another object of the check.', params: [p('Other target', 'int'), p('Distance (yd)', 'yards'), p('Compare', 'enum', { options: COMPARISON })], say: 'is {3} {2} yards from target {1}' },
  { id: 36, name: 'Is alive', help: 'The target is alive.', params: [], say: 'is alive' },
  { id: 37, name: 'Health (points)', help: 'The target\'s health points.', params: [p('Health', 'int'), p('Compare', 'enum', { options: COMPARISON })], say: 'has {2} {1} health' },
  { id: 38, name: 'Health (percent)', help: 'The target\'s health as a percentage.', params: [p('Percent', 'pct'), p('Compare', 'enum', { options: COMPARISON })], say: 'has {2} {1}% health' },
  { id: 40, name: 'Is in water', help: 'The target is swimming.', params: [], say: 'is in water' },
  { id: 42, name: 'Stand state', help: 'The target\'s posture.', params: [p('Check', 'enum', { options: [[0, 'one state'], [1, 'standing or not']] }), p('State', 'int')], say: 'is in stand state {2}' },
  { id: 43, name: 'Daily quest done', help: 'The player has done this daily quest today.', params: [p('Quest', 'quest')], say: 'has done daily quest {1} today' },
  { id: 44, name: 'Is charmed', help: 'The target is under mind control.', params: [], say: 'is charmed' },
  { id: 45, name: 'Pet type', help: 'The player has a pet of one of the ticked types.', params: [p('Types', 'int')], say: 'has a pet of type mask {1}' },
  { id: 46, name: 'On a taxi', help: 'The player is flying on a flight path.', params: [], say: 'is on a taxi' },
  { id: 47, name: 'Quest state', help: 'The player\'s state for a quest is one of the ticked ones.', params: [p('Quest', 'quest'), p('State', 'flags', { bits: QUEST_STATES })], say: 'has quest {1} in state {2}' },
  { id: 48, name: 'Quest objective progress', help: 'How much of one objective of a quest is done.', params: [p('Quest', 'quest'), p('Objective (0-3)', 'int'), p('Count', 'int')], say: 'has done {3} of objective {2} of quest {1}' },
  { id: 49, name: 'Difficulty', help: 'The map\'s difficulty.', params: [p('Difficulty', 'int')], say: 'is on difficulty {1}' },
  { id: 101, name: 'Quest exclusive group', help: 'The quest\'s exclusive group is satisfied.', params: [p('Quest', 'quest')], say: 'has satisfied the exclusive group of quest {1}' },
  { id: 102, name: 'Has an aura type', help: 'The target has an aura of a type.', params: [p('Aura type', 'int')], say: 'has an aura of type {1}' },
  { id: 105, name: 'Queued for a random dungeon', help: 'The player is in the dungeon finder queue.', params: [], say: 'is queued for a random dungeon' },
  { id: 106, name: 'In combat', help: 'The target is fighting.', params: [], say: 'is in combat' },
];

export const conditionOf = (id: number): ConditionDef | undefined => CONDITIONS.find((c) => c.id === id);

/** Which object of the check a condition looks at */
export const TARGETS: readonly Choice[] = [[0, 'the player (or first object)'], [1, 'the second object'], [2, 'the third object']];

export interface ConditionSource {
  id: number;
  name: string;
  /** What `SourceGroup` and `SourceEntry` mean for this source, for the editor's help */
  group: string;
  entry: string;
}

export const CONDITION_SOURCES: readonly ConditionSource[] = [
  { id: 1, name: 'Creature loot', group: 'loot list id', entry: 'item' },
  { id: 2, name: 'Disenchant loot', group: 'loot list id', entry: 'item' },
  { id: 3, name: 'Fishing loot', group: 'area id', entry: 'item' },
  { id: 4, name: 'Game object loot', group: 'loot list id', entry: 'item' },
  { id: 5, name: 'Item loot', group: 'loot list id', entry: 'item' },
  { id: 6, name: 'Mail loot', group: 'mail template id', entry: 'item' },
  { id: 7, name: 'Milling loot', group: 'loot list id', entry: 'item' },
  { id: 8, name: 'Pickpocket loot', group: 'loot list id', entry: 'item' },
  { id: 9, name: 'Prospecting loot', group: 'loot list id', entry: 'item' },
  { id: 10, name: 'Reference loot', group: 'reference list id', entry: 'item' },
  { id: 11, name: 'Skinning loot', group: 'loot list id', entry: 'item' },
  { id: 12, name: 'Spell loot', group: 'spell id', entry: 'item' },
  { id: 13, name: 'Spell target', group: 'effects mask', entry: 'spell' },
  { id: 14, name: 'Gossip menu text', group: 'menu id', entry: 'text id' },
  { id: 15, name: 'Gossip menu option', group: 'menu id', entry: 'option id' },
  { id: 16, name: 'Vehicle template', group: '0', entry: 'creature' },
  { id: 17, name: 'Spell cast', group: '0', entry: 'spell' },
  { id: 18, name: 'Spell click', group: 'creature', entry: 'spell' },
  { id: 19, name: 'Quest available', group: '0', entry: 'quest' },
  { id: 20, name: 'Quest marker', group: '0', entry: 'quest' },
  { id: 21, name: 'Vehicle spell', group: 'creature', entry: 'spell' },
  { id: 22, name: 'SmartAI event', group: 'event id + 1', entry: 'script owner' },
  { id: 23, name: 'Vendor item', group: 'vendor creature', entry: 'item' },
  { id: 24, name: 'Spell proc', group: '0', entry: 'spell' },
];

/** The source type of each loot table, as `conditions.SourceTypeOrReferenceId` */
export const LOOT_SOURCE: Readonly<Record<string, number>> = {
  creature_loot_template: 1, disenchant_loot_template: 2, fishing_loot_template: 3, gameobject_loot_template: 4, item_loot_template: 5, mail_loot_template: 6,
  milling_loot_template: 7, pickpocketing_loot_template: 8, prospecting_loot_template: 9, reference_loot_template: 10, skinning_loot_template: 11, spell_loot_template: 12,
};

export const GOSSIP_MENU_SOURCE = 14;
export const GOSSIP_OPTION_SOURCE = 15;
export const SMART_EVENT_SOURCE = 22;
export const VENDOR_SOURCE = 23;

/** The numbers a condition row holds, as a list */
export const valuesOf = (row: Readonly<Row>): [number, number, number] => [1, 2, 3].map((n) => Number(row[`ConditionValue${n}`] ?? 0) || 0) as [number, number, number];

/** A condition as a sentence about its subject: "the player has quest 5 in the log", "not: ..." when negated */
export function conditionSentence(row: Readonly<Row>, names: (kind: string, id: number) => string = (kind, id) => String(id)): string {
  const type = Number(row.ConditionTypeOrReference ?? 0);
  const subject = ['the player', 'the second object', 'the third object'][Number(row.ConditionTarget ?? 0)] ?? 'the player';
  if (type < 0) return `${subject} meets the shared condition ${-type}`;
  const def = conditionOf(type);
  if (!def) return `${subject} meets unknown condition ${type}`;
  const values = valuesOf(row);
  const text = def.say.replace(/\{([123])\}/g, (_, n: string) => {
    const param = def.params[Number(n) - 1];
    const value = values[Number(n) - 1]!;
    if (!param) return String(value);
    if (param.kind === 'enum') return param.options?.find(([v]) => v === value)?.[1] ?? String(value);
    if (param.kind === 'flags') {
      const named = (param.bits ?? []).filter((b) => (value & b.value) === b.value).map((b) => b.label.toLowerCase());
      return named.length > 0 ? named.join(' or ') : String(value);
    }
    if (param.kind === 'bool') return value ? 'yes' : 'no';
    return names(param.kind, value);
  });
  const sentence = `${subject} ${text}`;
  return Number(row.NegativeCondition ?? 0) ? `not (${sentence})` : sentence;
}
