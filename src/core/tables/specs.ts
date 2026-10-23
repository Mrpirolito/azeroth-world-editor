import type { Choice } from '../smartai/types';
import {
  CREATURE_FAMILIES, DYNAMIC_FLAGS, FLAGS_EXTRA, GAMEOBJECT_FLAGS, GOSSIP_EMOTES, LANGUAGES, LOOT_MODES, MOVEMENT_TYPES, SCHOOLS, STAND_STATES, TEXT_RANGES, TEXT_TYPES,
  TYPE_FLAGS, UNIT_CLASSES, UNIT_FLAGS, UNIT_FLAGS2, VIS_DISTANCES,
} from './flags';
import type { Field, FieldType, TableSpec } from './types';

/**
 * Every table the editor opens as a sheet. Columns follow AzerothCore's world database; a column a fork
 * does not have is simply not shown. Wording is this project's own.
 */

const field = (column: string, label: string, type: FieldType, more: Partial<Field> = {}): Field => ({ column, label, ...type, ...more }) as Field;
const int = (column: string, label: string, more: Partial<Field> & { min?: number; max?: number; zero?: string } = {}): Field => field(column, label, { type: 'int', min: more.min, max: more.max, zero: more.zero }, more);
const float = (column: string, label: string, more: Partial<Field> = {}): Field => field(column, label, { type: 'float' }, more);
const text = (column: string, label: string, more: Partial<Field> & { long?: boolean } = {}): Field => field(column, label, { type: 'text', long: more.long }, more);
const bool = (column: string, label: string, more: Partial<Field> = {}): Field => field(column, label, { type: 'bool' }, more);
const choice = (column: string, label: string, options: readonly Choice[], more: Partial<Field> = {}): Field => field(column, label, { type: 'enum', options }, more);
const flags = (column: string, label: string, bits: Extract<FieldType, { type: 'flags' }>['bits'], more: Partial<Field> = {}): Field => field(column, label, { type: 'flags', bits }, more);
const ref = (column: string, label: string, kind: Extract<FieldType, { type: 'ref' }>['kind'], more: Partial<Field> = {}): Field => field(column, label, { type: 'ref', kind }, more);
const part = (column: string, label: string, shift: number, width: number, options?: readonly Choice[], more: Partial<Field> = {}): Field => field(column, label, { type: 'part', shift, width, options }, more);

const REPUTATION_RANKS: readonly Choice[] = [[0, 'Hated'], [1, 'Hostile'], [2, 'Unfriendly'], [3, 'Neutral'], [4, 'Friendly'], [5, 'Honored'], [6, 'Revered'], [7, 'Exalted']];
const EXPANSIONS: readonly Choice[] = [[0, 'Classic'], [1, 'Burning Crusade'], [2, 'Wrath of the Lich King']];

/** The columns every loot table shares, in the order a designer thinks of them */
const LOOT_FIELDS: readonly Field[] = [
  ref('Item', 'Item', 'item', { help: 'What drops. Leave empty when the row points at a reference list.' }),
  float('Chance', 'Chance (%)', { help: 'Chance to drop. In a group, the chances should add up to 100 or less; 0 shares what is left equally.' }),
  int('MinCount', 'Least', { min: 1, max: 255 }),
  int('MaxCount', 'Most', { min: 1, max: 255 }),
  int('GroupId', 'Group', { min: 0, max: 255, zero: 'no group: each row rolls on its own', help: 'Rows in one group give exactly one item, picked by chance.' }),
  bool('QuestRequired', 'Only while on the quest', { help: 'Drops only for players who need it for a quest.' }),
  int('Reference', 'Reference list', { help: 'Rolls the reference list with this id instead of an item. Negative: the list is read as a loot id.', group: 'Advanced' }),
  flags('LootMode', 'Loot modes', LOOT_MODES, { group: 'Advanced', help: 'Which difficulty modes the row drops in.' }),
  text('Comment', 'Note', { group: 'Advanced' }),
];

const lootSpec = (table: string, title: string, blurb: string, owner: TableSpec['owner'], via?: TableSpec['via']): TableSpec => ({
  table, title, blurb, owner, scope: ['Entry'], pk: ['Entry', 'Item'], multi: true, loot: true, via, fields: LOOT_FIELDS,
  blank: { Reference: '0', Chance: '100', QuestRequired: '0', LootMode: '1', GroupId: '0', MinCount: '1', MaxCount: '1' },
});

/** Data columns of the game object types the editor names; each is shown only for its own type */
const chestData: Field[] = [
  int('Data0', 'Lock', { when: { column: 'type', in: [3] }, help: 'Lock id from Lock.dbc: what opens it.' }),
  int('Data2', 'Restock time (s)', { when: { column: 'type', in: [3] }, help: 'Seconds until it refills.' }),
  bool('Data3', 'Used up when opened', { when: { column: 'type', in: [3] } }),
  int('Data4', 'Fewest opens', { when: { column: 'type', in: [3] } }),
  int('Data5', 'Most opens', { when: { column: 'type', in: [3] } }),
  int('Data6', 'Game event', { when: { column: 'type', in: [3] } }),
  int('Data7', 'Linked trap', { when: { column: 'type', in: [3] } }),
  int('Data9', 'Level', { when: { column: 'type', in: [3] } }),
  bool('Data12', 'Not usable in combat', { when: { column: 'type', in: [3] } }),
  bool('Data13', 'Log loot', { when: { column: 'type', in: [3] } }),
  int('Data15', 'Group loot rules', { when: { column: 'type', in: [3] } }),
];
const gooberData: Field[] = [
  int('Data0', 'Lock', { when: { column: 'type', in: [10] } }),
  int('Data2', 'Game event', { when: { column: 'type', in: [10] } }),
  int('Data3', 'Closes after (s)', { when: { column: 'type', in: [10] }, zero: 'never closes' }),
  int('Data4', 'Custom animation', { when: { column: 'type', in: [10] } }),
  bool('Data5', 'Used up when used', { when: { column: 'type', in: [10] } }),
  int('Data6', 'Cooldown (s)', { when: { column: 'type', in: [10] } }),
  int('Data10', 'Spell cast on use', { when: { column: 'type', in: [10] } }),
  bool('Data11', 'No damage immunity', { when: { column: 'type', in: [10] } }),
  int('Data12', 'Linked trap', { when: { column: 'type', in: [10] } }),
  int('Data19', 'Gossip menu', { when: { column: 'type', in: [10] } }),
];

export const SPECS: readonly TableSpec[] = [
  // ---- Creatures
  {
    table: 'creature_template', title: 'Traits', blurb: 'Speed, attacks, flags and rewards that the Basics tab does not cover.', owner: 'creature',
    scope: ['entry'], pk: ['entry'], multi: false, overlay: true,
    fields: [
      choice('unit_class', 'Class', UNIT_CLASSES, { group: 'Combat', help: 'Decides its health, mana and armour scaling.' }),
      choice('dmgschool', 'Damage school', SCHOOLS, { group: 'Combat' }),
      int('BaseAttackTime', 'Melee swing time (ms)', { group: 'Combat', zero: 'server default (2000)' }),
      int('RangeAttackTime', 'Ranged swing time (ms)', { group: 'Combat', zero: 'server default (2000)' }),
      float('BaseVariance', 'Melee damage spread', { group: 'Combat', help: '1 is the normal spread.' }),
      float('RangeVariance', 'Ranged damage spread', { group: 'Combat' }),
      float('ManaModifier', 'Mana multiplier', { group: 'Combat' }),
      float('ArmorModifier', 'Armour multiplier', { group: 'Combat' }),
      float('ExperienceModifier', 'XP multiplier', { group: 'Combat' }),
      bool('RegenHealth', 'Regenerates health', { group: 'Combat' }),
      choice('exp', 'Expansion', EXPANSIONS, { group: 'Combat', help: 'Which expansion table its stats are read from.' }),
      float('speed_walk', 'Walk speed', { group: 'Movement', help: '1 is a normal walk.' }),
      float('speed_run', 'Run speed', { group: 'Movement', help: '1.14286 is a normal run.' }),
      float('speed_swim', 'Swim speed', { group: 'Movement' }),
      float('speed_flight', 'Flight speed', { group: 'Movement' }),
      float('detection_range', 'Notices players within (yd)', { group: 'Movement' }),
      choice('MovementType', 'Idle movement', MOVEMENT_TYPES, { group: 'Movement', help: 'What it does when it has no spawn of its own saying so.' }),
      float('HoverHeight', 'Hover height', { group: 'Movement' }),
      choice('family', 'Family', CREATURE_FAMILIES, { group: 'Kind', help: 'The pet family when it is a tameable beast.' }),
      flags('type_flags', 'Type flags', TYPE_FLAGS, { group: 'Kind' }),
      flags('unit_flags', 'Unit flags', UNIT_FLAGS, { group: 'Flags' }),
      flags('unit_flags2', 'More unit flags', UNIT_FLAGS2, { group: 'Flags' }),
      flags('flags_extra', 'Behaviour flags', FLAGS_EXTRA, { group: 'Flags' }),
      flags('dynamicflags', 'Dynamic flags', DYNAMIC_FLAGS, { group: 'Flags', help: 'Normally set by the server while it runs.' }),
      int('mingold', 'Least gold dropped (copper)', { group: 'Rewards' }),
      int('maxgold', 'Most gold dropped (copper)', { group: 'Rewards' }),
      ref('KillCredit1', 'Also counts as kill of', 'creature', { group: 'Rewards', help: 'Killing it gives kill credit for this creature too.' }),
      ref('KillCredit2', 'And also of', 'creature', { group: 'Rewards' }),
      int('pickpocketloot', 'Pickpocket loot id', { group: 'Rewards', zero: 'none' }),
      int('skinloot', 'Skinning loot id', { group: 'Rewards', zero: 'none' }),
      int('CreatureImmunitiesId', 'Immunities set', { group: 'Immunities', zero: 'none', help: 'A row of creature_immunities: the schools, mechanics, effects and auras it ignores.' }),
      int('RacialLeader', 'Racial leader', { group: 'Advanced' }),
      int('PetSpellDataId', 'Pet spell data', { group: 'Advanced' }),
      int('VehicleId', 'Vehicle', { group: 'Advanced' }),
      int('movementId', 'Movement id', { group: 'Advanced' }),
      text('IconName', 'Cursor icon', { group: 'Advanced', help: 'Interact, Speak, Pickup, Gunner...' }),
      int('difficulty_entry_1', 'Heroic 10 entry', { group: 'Advanced' }),
      int('difficulty_entry_2', 'Normal 25 entry', { group: 'Advanced' }),
      int('difficulty_entry_3', 'Heroic 25 entry', { group: 'Advanced' }),
      text('ScriptName', 'C++ script', { group: 'Advanced' }),
    ],
  },
  {
    table: 'creature_template_addon', title: 'Appearance and auras', blurb: 'How it stands, what it rides and which auras it has.', owner: 'creature',
    scope: ['entry'], pk: ['entry'], multi: false,
    fields: [
      part('bytes1', 'Stance', 0, 8, STAND_STATES, { help: 'Standing, sitting, sleeping, kneeling...' }),
      part('bytes1', 'Height', 24, 8, [[0, 'On the ground'], [1, 'Hovering'], [2, 'Flying'], [3, 'Underwater']]),
      part('bytes2', 'Weapons', 0, 8, [[0, 'Sheathed'], [1, 'Melee drawn'], [2, 'Ranged drawn']]),
      int('mount', 'Mount display', { zero: 'not mounted', help: 'A creature display id to ride.' }),
      int('emote', 'Looping emote', { zero: 'none', help: 'An emote id it keeps playing.' }),
      text('auras', 'Auras', { help: 'Spell ids it always has, separated by spaces.' }),
      int('path_id', 'Waypoint path', { zero: 'none', help: 'The path it walks (its template-wide path).' }),
      choice('visibilityDistanceType', 'Seen from', VIS_DISTANCES, { group: 'Advanced' }),
      int('bytes1', 'Raw bytes 1', { group: 'Advanced' }),
      int('bytes2', 'Raw bytes 2', { group: 'Advanced' }),
    ],
  },
  {
    table: 'creature_template_movement', title: 'Movement rules', blurb: 'Where and how it is allowed to move.', owner: 'creature',
    scope: ['CreatureId'], pk: ['CreatureId'], multi: false,
    fields: [
      choice('Ground', 'On the ground', [[0, 'Does not walk'], [1, 'Runs'], [2, 'Hovers']], { nullable: true, help: 'Empty keeps the server default.' }),
      choice('Swim', 'In water', [[0, 'Does not swim'], [1, 'Swims']], { nullable: true }),
      choice('Flight', 'In the air', [[0, 'Does not fly'], [1, 'No gravity'], [2, 'Flies']], { nullable: true }),
      choice('Rooted', 'Rooted', [[0, 'Free to move'], [1, 'Rooted in place']], { nullable: true }),
      choice('Chase', 'Chasing a target', [[0, 'Runs'], [1, 'Walks when close'], [2, 'Always walks']], { nullable: true }),
      choice('Random', 'Wandering', [[0, 'Walks'], [1, 'Runs sometimes'], [2, 'Always runs']], { nullable: true }),
      int('InteractionPauseTimer', 'Stops when talked to (ms)', { nullable: true, help: 'How long it freezes when a player opens its window.' }),
    ],
  },
  {
    table: 'creature_template_resistance', title: 'Resistances', blurb: 'How much of each magic school it resists.', owner: 'creature',
    scope: ['CreatureID'], pk: ['CreatureID', 'School'], multi: true,
    fields: [
      choice('School', 'School', SCHOOLS.filter(([v]) => v > 0)),
      int('Resistance', 'Resistance', { help: 'Points of resistance: about 5 per level is typical.' }),
    ],
    next: (rows) => ({ School: String([1, 2, 3, 4, 5, 6].find((s) => !rows.some((r) => Number(r.School) === s)) ?? 1), Resistance: '0' }),
  },
  {
    table: 'creature_template_spell', title: 'Spells for its pet bar', blurb: 'The spells shown on the bar when a player controls it (vehicles, charmed NPCs).', owner: 'creature',
    scope: ['CreatureID'], pk: ['CreatureID', 'Index'], multi: true,
    fields: [int('Index', 'Slot', { min: 0, max: 7, help: 'Slot 0 to 7 on the bar.' }), ref('Spell', 'Spell', 'spell')],
    next: (rows) => ({ Index: String([0, 1, 2, 3, 4, 5, 6, 7].find((i) => !rows.some((r) => Number(r.Index) === i)) ?? 0), Spell: '0' }),
  },
  {
    table: 'creature_onkill_reputation', title: 'Reputation for killing it', blurb: 'Reputation a player gains or loses with up to two factions when it dies.', owner: 'creature',
    scope: ['creature_id'], pk: ['creature_id'], multi: false,
    fields: [
      int('RewOnKillRepFaction1', 'First faction', { zero: 'none', help: 'A faction id from Faction.dbc.' }),
      float('RewOnKillRepValue1', 'First amount', { help: 'Negative loses reputation.' }),
      choice('MaxStanding1', 'Stops giving at', REPUTATION_RANKS, { help: 'The standing past which it gives no more.' }),
      bool('IsTeamAward1', 'Also for the whole team'),
      int('RewOnKillRepFaction2', 'Second faction', { zero: 'none' }),
      float('RewOnKillRepValue2', 'Second amount'),
      choice('MaxStanding2', 'Second stops giving at', REPUTATION_RANKS),
      bool('IsTeamAward2', 'Second also for the whole team'),
      bool('TeamDependent', 'Depends on the killer\'s team', { group: 'Advanced' }),
    ],
  },
  {
    table: 'creature_questitem', title: 'Quest items it drops for you', blurb: 'Items shown to a player as lootable while they need them, on top of the loot list.', owner: 'creature',
    scope: ['CreatureEntry'], pk: ['CreatureEntry', 'Idx'], multi: true,
    fields: [int('Idx', 'Slot', { min: 0, max: 5 }), ref('ItemId', 'Item', 'item')],
    next: (rows) => ({ Idx: String(rows.reduce((m, r) => Math.max(m, Number(r.Idx) + 1), 0)), ItemId: '0' }),
  },
  {
    table: 'creature_text', title: 'Things it says', blurb: 'The lines SmartAI scripts make it say, grouped; one random line of a group is said at a time.', owner: 'creature',
    scope: ['CreatureID'], pk: ['CreatureID', 'GroupID', 'ID'], multi: true,
    fields: [
      int('GroupID', 'Group', { min: 0, max: 255, help: 'Scripts say a group; one of its lines is picked.' }),
      int('ID', 'Line', { min: 0, max: 255, help: 'Its number inside the group.' }),
      text('Text', 'Words', { long: true, help: 'Use $n for the player name, $r for race, $c for class.' }),
      choice('Type', 'Spoken as', TEXT_TYPES),
      choice('Language', 'Language', LANGUAGES),
      float('Probability', 'Chance (%)', { help: 'Chance among the group; 100 for a lone line.' }),
      int('Emote', 'Emote', { zero: 'none' }),
      int('Sound', 'Sound', { zero: 'none' }),
      int('Duration', 'Time on screen (ms)', { group: 'Advanced' }),
      int('BroadcastTextId', 'Broadcast text', { group: 'Advanced', zero: 'none', help: 'Links the line to the client\'s translations.' }),
      choice('TextRange', 'Heard within', TEXT_RANGES, { group: 'Advanced' }),
      text('comment', 'Note', { group: 'Advanced' }),
    ],
    next: (rows) => {
      const last = rows.at(-1);
      const group = last ? Number(last.GroupID) : 0;
      const line = rows.filter((r) => Number(r.GroupID) === group).reduce((m, r) => Math.max(m, Number(r.ID) + 1), 0);
      return { GroupID: String(group), ID: String(line), Text: '', Type: '12', Language: '0', Probability: '100', Emote: '0', Duration: '0', Sound: '0', BroadcastTextId: '0', TextRange: '0', comment: '' };
    },
  },
  lootSpec('pickpocketing_loot_template', 'Pickpocket loot', 'What a rogue steals from it.', 'creature', { table: 'creature_template', column: 'pickpocketloot' }),
  lootSpec('skinning_loot_template', 'Skinning loot', 'What skinning, herbalism, mining or engineering gives from it.', 'creature', { table: 'creature_template', column: 'skinloot' }),
  // ---- Game objects
  {
    table: 'gameobject_template', title: 'Details', blurb: 'What the object does when used: the settings its type reads.', owner: 'gameobject',
    scope: ['entry'], pk: ['entry'], multi: false, overlay: true,
    fields: [
      ...chestData, ...gooberData,
      text('IconName', 'Cursor icon', { group: 'Advanced' }),
      text('castBarCaption', 'Cast bar text', { group: 'Advanced', help: 'Shown while a player uses it: "Opening", "Mining"...' }),

      text('ScriptName', 'C++ script', { group: 'Advanced' }),
    ],
  },
  {
    table: 'gameobject_template_addon', title: 'Faction and flags', blurb: 'Who it belongs to, what state it starts in and the gold it holds.', owner: 'gameobject',
    scope: ['entry'], pk: ['entry'], multi: false,
    fields: [
      int('faction', 'Faction', { zero: 'none' }),
      flags('flags', 'State', GAMEOBJECT_FLAGS),
      int('mingold', 'Least gold (copper)'), int('maxgold', 'Most gold (copper)'),
      int('artkit0', 'Art kit 1', { group: 'Advanced' }), int('artkit1', 'Art kit 2', { group: 'Advanced' }),
      int('artkit2', 'Art kit 3', { group: 'Advanced' }), int('artkit3', 'Art kit 4', { group: 'Advanced' }),
    ],
  },
  {
    table: 'gameobject_questitem', title: 'Quest items it holds for you', blurb: 'Items shown as lootable to players who need them.', owner: 'gameobject',
    scope: ['GameObjectEntry'], pk: ['GameObjectEntry', 'Idx'], multi: true,
    fields: [int('Idx', 'Slot', { min: 0, max: 5 }), ref('ItemId', 'Item', 'item')],
    next: (rows) => ({ Idx: String(rows.reduce((m, r) => Math.max(m, Number(r.Idx) + 1), 0)), ItemId: '0' }),
  },
  // ---- Items
  lootSpec('item_loot_template', 'Contents', 'What opening this item (a bag, a chest, a lockbox) gives.', 'item'),
  lootSpec('disenchant_loot_template', 'Disenchanting', 'What disenchanting it gives, by the disenchant id of the item.', 'item', { table: 'item_template', column: 'DisenchantID' }),
  lootSpec('prospecting_loot_template', 'Prospecting', 'What prospecting this ore gives.', 'item'),
  lootSpec('milling_loot_template', 'Milling', 'What milling this herb gives.', 'item'),
  // ---- On their own
  lootSpec('reference_loot_template', 'Reference loot lists', 'Shared lists other loot tables point at.', 'standalone'),
  lootSpec('fishing_loot_template', 'Fishing loot', 'What fishing gives in an area (the entry is the area id).', 'standalone'),
  lootSpec('mail_loot_template', 'Mail loot', 'Items a mail template sends (the entry is the mail template id).', 'standalone'),
  lootSpec('spell_loot_template', 'Spell loot', 'Items a spell creates at random (the entry is the spell id).', 'standalone'),
  {
    table: 'item_enchantment_template', title: 'Random enchantments', blurb: 'The enchantments "of the Eagle" style items roll (the entry is the item\'s RandomProperty or RandomSuffix).', owner: 'standalone',
    scope: ['entry'], pk: ['entry', 'ench'], multi: true,
    fields: [int('ench', 'Enchantment', { help: 'An id from ItemRandomProperties or ItemRandomSuffix.' }), float('chance', 'Chance (%)')],
    blank: { chance: '0' },
  },
  {
    table: 'broadcast_text', title: 'Broadcast texts', blurb: 'Texts the client can translate; creature text, gossip and quests point at them.', owner: 'standalone',
    scope: ['ID'], pk: ['ID'], multi: false, search: ['MaleText', 'FemaleText'], nameColumn: 'MaleText',
    fields: [
      text('MaleText', 'Text for males', { long: true }), text('FemaleText', 'Text for females', { long: true }),
      choice('LanguageID', 'Language', LANGUAGES, { nullable: true }),
      choice('EmoteID1', 'First emote', GOSSIP_EMOTES, { nullable: true }), int('EmoteDelay1', 'Delay (ms)', { nullable: true }),
      int('SoundEntriesId', 'Sound', { nullable: true, zero: 'none' }),
      int('EmoteID2', 'Second emote', { group: 'Advanced', nullable: true }), int('EmoteDelay2', 'Delay 2 (ms)', { group: 'Advanced', nullable: true }),
      int('EmoteID3', 'Third emote', { group: 'Advanced', nullable: true }), int('EmoteDelay3', 'Delay 3 (ms)', { group: 'Advanced', nullable: true }),
      int('EmotesID', 'Emote list', { group: 'Advanced', nullable: true }), int('Flags', 'Flags', { group: 'Advanced', nullable: true }),
    ],
  },
  {
    table: 'npc_text', title: 'Gossip texts', blurb: 'What an NPC says when a player opens its window: up to 8 lines, one picked by weight.', owner: 'standalone',
    scope: ['ID'], pk: ['ID'], multi: false, search: ['text0_0', 'text0_1', 'text1_0', 'text2_0'], nameColumn: 'text0_0',
    fields: Array.from({ length: 8 }, (_, i): Field[] => {
      const group = i < 2 ? `Line ${i + 1}` : 'Advanced';
      return [
        text(`text${i}_0`, `Line ${i + 1}, for males`, { long: true, group }),
        text(`text${i}_1`, `Line ${i + 1}, for females`, { long: true, group }),
        float(`Probability${i}`, `Line ${i + 1} weight`, { group, help: 'Lines are picked by their share of the total weight.' }),
        choice(`lang${i}`, `Line ${i + 1} language`, LANGUAGES, { group: 'Advanced' }),
        int(`BroadcastTextID${i}`, `Line ${i + 1} broadcast text`, { group: 'Advanced', zero: 'none' }),
      ];
    }).flat(),
  },
  {
    table: 'page_text', title: 'Book pages', blurb: 'The pages of books, notes and signs; each page points at the next.', owner: 'standalone',
    scope: ['ID'], pk: ['ID'], multi: false, search: ['Text'], nameColumn: 'Text',
    fields: [text('Text', 'Page text', { long: true }), int('NextPageID', 'Next page', { zero: 'last page' })],
  },
  {
    table: 'acore_string', title: 'Server strings', blurb: 'Messages the server itself sends; the entry is the number commands and scripts use.', owner: 'standalone',
    scope: ['entry'], pk: ['entry'], multi: false, search: ['content_default'], nameColumn: 'content_default',
    fields: [
      text('content_default', 'English text', { long: true }),
      ...['koKR', 'frFR', 'deDE', 'zhCN', 'zhTW', 'esES', 'esMX', 'ruRU'].map((l) => text(`locale_${l}`, l, { group: 'Translations', long: true })),
    ],
  },
  {
    table: 'game_tele', title: 'Teleport places', blurb: 'The places the .tele command goes to.', owner: 'standalone',
    scope: ['id'], pk: ['id'], multi: false, search: ['name'], nameColumn: 'name',
    fields: [
      text('name', 'Name', { help: 'What a GM types after .tele' }), int('map', 'Map'),
      float('position_x', 'X'), float('position_y', 'Y'), float('position_z', 'Z'), float('orientation', 'Facing (radians)'),
    ],
  },
  {
    table: 'creature_formations', title: 'Formations', blurb: 'Creatures that move together: the leader\'s spawn guid and each follower with its place around it.', owner: 'standalone',
    scope: ['leaderGUID'], pk: ['memberGUID'], multi: true,
    fields: [
      int('memberGUID', 'Follower spawn guid'), float('dist', 'Stays this far (yd)'), float('angle', 'At this angle (deg)', { help: '0 is behind the leader.' }),
      int('groupAI', 'Group behaviour', { help: '1: members follow the leader, 2: the leader follows members, 4/8: assist each other.' }),
      int('point_1', 'Follows from point', { group: 'Advanced' }), int('point_2', 'And from point', { group: 'Advanced' }),
    ],
    blank: { dist: '0', angle: '0', groupAI: '0', point_1: '0', point_2: '0' },
  },
  {
    table: 'creature_immunities', title: 'Immunity sets', blurb: 'The magic schools, mechanics, effects and auras a creature ignores; creatures point at a set by its id.', owner: 'standalone',
    scope: ['ID'], pk: ['ID'], multi: false, search: ['Comment'], nameColumn: 'Comment',
    fields: [
      text('Comment', 'Name'),
      flags('SchoolMask', 'Immune to schools', [
        { value: 1, label: 'Physical' }, { value: 2, label: 'Holy' }, { value: 4, label: 'Fire' }, { value: 8, label: 'Nature' }, { value: 16, label: 'Frost' }, { value: 32, label: 'Shadow' }, { value: 64, label: 'Arcane' },
      ]),
      int('MechanicsMask', 'Immune to mechanics (mask)', { help: 'Bit per mechanic: charm 1, disorient 2, disarm 4, fear 16, root 64, silence 256, sleep 512, snare 1024, stun 2048...' }),
      int('DispelTypeMask', 'Immune to dispel types (mask)'),
      text('Effects', 'Immune to spell effects', { help: 'Effect numbers separated by spaces.' }),
      text('Auras', 'Immune to auras', { help: 'Aura numbers separated by spaces.' }),
      bool('ImmuneAoE', 'Ignores area spells'), bool('ImmuneChain', 'Ignores chain spells'),
    ],
    blank: { SchoolMask: '0', DispelTypeMask: '0', MechanicsMask: '0', ImmuneAoE: '0', ImmuneChain: '0' },
  },
];

export const SPEC_BY_TABLE: ReadonlyMap<string, TableSpec> = new Map(SPECS.map((s) => [s.table, s]));
export const specOf = (table: string): TableSpec | undefined => SPEC_BY_TABLE.get(table);
/** The sheets an owner's editor offers, in order */
export const specsOf = (owner: TableSpec['owner']): TableSpec[] => SPECS.filter((s) => s.owner === owner);

