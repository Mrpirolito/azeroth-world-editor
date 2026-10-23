import type { Bit, Choice } from './types';

/** Named bits and named values the SmartAI parameters take, from the server's headers. */

const bits = (list: readonly (readonly [number, string])[]): Bit[] => list.map(([value, label]) => ({ value, label }));

/** `SmartEventFlags` (`event_flags`) */
export const EVENT_FLAG_BITS: readonly Bit[] = [
  { value: 0x001, label: 'Run only once', help: 'The event fires one time and never repeats, until the script resets.' },
  { value: 0x002, label: 'Normal difficulty', help: 'Only in instance difficulty 0.' },
  { value: 0x004, label: 'Heroic difficulty', help: 'Only in instance difficulty 1.' },
  { value: 0x008, label: 'Difficulty 2', help: 'Only in instance difficulty 2.' },
  { value: 0x010, label: 'Difficulty 3', help: 'Only in instance difficulty 3.' },
  { value: 0x020, label: 'Reserved 5' },
  { value: 0x040, label: 'Reserved 6' },
  { value: 0x080, label: 'Debug builds only' },
  { value: 0x100, label: 'Keep through resets', help: 'The event is not re-armed when the script resets.' },
  { value: 0x200, label: 'Works while charmed', help: 'Fires even when the owner is charmed.' },
];
export const EVENT_FLAGS_ALL = EVENT_FLAG_BITS.reduce((all, b) => all | b.value, 0);

/** `event_phase_mask`: phases 1 to 12 */
export const PHASE_BITS: readonly Bit[] = Array.from({ length: 12 }, (_, i) => ({ value: 1 << i, label: `Phase ${i + 1}` }));
export const PHASE_MASK_ALL = 4095;

export const CAST_FLAG_BITS: readonly Bit[] = bits([
  [0x001, 'Interrupt what it is casting'],
  [0x002, 'Triggered (no cost, no cast time)'],
  [0x020, 'Only if the target lacks the aura'],
  [0x040, 'Stand still while casting'],
  [0x080, 'Only with more than one on the threat list'],
  [0x100, 'Only if the target uses mana'],
  [0x200, 'Allow movement when out of sight'],
  [0x400, 'Use this spell range to chase'],
]);

export const TRIGGER_FLAG_BITS: readonly Bit[] = bits([
  [0x1, 'Ignore global cooldown'],
  [0x2, 'Ignore spell cooldowns'],
  [0x4, 'Ignore power and reagent cost'],
  [0x8, 'Ignore cast item'],
  [0x10, 'Ignore aura scaling'],
  [0x20, 'Ignore a cast in progress'],
  [0x40, 'Ignore combo points'],
  [0x80, 'Cast directly'],
  [0x100, 'Ignore aura interrupt flags'],
  [0x200, 'Do not turn to the target'],
  [0x400, 'Ignore shapeshift'],
  [0x800, 'Ignore caster aura state'],
  [0x2000, 'Ignore mounted or vehicle'],
  [0x10000, 'Ignore caster auras'],
  [0x20000, 'Disallow proc events'],
  [0x40000, 'Do not report cast errors'],
  [0x80000, 'Ignore equipped item requirement'],
  [0x100000, 'No periodic reset'],
  [0x200000, 'Ignore spell effects'],
]);

export const SPELL_SCHOOL_BITS: readonly Bit[] = bits([
  [1, 'Physical'], [2, 'Holy'], [4, 'Fire'], [8, 'Nature'], [16, 'Frost'], [32, 'Shadow'], [64, 'Arcane'],
]);

export const UNIT_FLAG_BITS: readonly Bit[] = bits([
  [0x1, 'Server controlled'], [0x2, 'Not attackable'], [0x4, 'Cannot move'], [0x8, 'Attackable by players'],
  [0x10, 'Can be renamed'], [0x20, 'Preparing'], [0x80, 'Not attackable (1)'], [0x100, 'Immune to players'],
  [0x200, 'Immune to creatures'], [0x400, 'Looting'], [0x800, 'Pet in combat'], [0x1000, 'PvP'],
  [0x2000, 'Silenced'], [0x4000, 'Persuaded'], [0x8000, 'Swimming'], [0x10000, 'Not attackable (2)'],
  [0x20000, 'Pacified'], [0x40000, 'Stunned'], [0x80000, 'In combat'], [0x100000, 'On a taxi flight'],
  [0x200000, 'Disarmed'], [0x400000, 'Confused'], [0x800000, 'Fleeing'], [0x1000000, 'Player controlled'],
  [0x2000000, 'Not selectable'], [0x4000000, 'Skinnable'], [0x8000000, 'Mounted'], [0x40000000, 'Sheathed'],
]);

export const NPC_FLAG_BITS: readonly Bit[] = bits([
  [0x1, 'Gossip'], [0x2, 'Quest giver'], [0x10, 'Trainer'], [0x20, 'Class trainer'], [0x40, 'Profession trainer'],
  [0x80, 'Vendor'], [0x100, 'Ammo vendor'], [0x200, 'Food vendor'], [0x400, 'Poison vendor'], [0x800, 'Reagent vendor'],
  [0x1000, 'Repairs'], [0x2000, 'Flight master'], [0x4000, 'Spirit healer'], [0x8000, 'Spirit guide'],
  [0x10000, 'Innkeeper'], [0x20000, 'Banker'], [0x40000, 'Petitioner'], [0x80000, 'Tabard designer'],
  [0x100000, 'Battlemaster'], [0x200000, 'Auctioneer'], [0x400000, 'Stable master'], [0x800000, 'Guild banker'],
  [0x1000000, 'Spell click'], [0x2000000, 'Player vehicle'],
]);

export const DYNAMIC_FLAG_BITS: readonly Bit[] = bits([
  [0x1, 'Lootable'], [0x2, 'Track unit'], [0x4, 'Tapped'], [0x8, 'Tapped by this player'], [0x10, 'Special info'],
  [0x20, 'Dead'], [0x40, 'Refer a friend'], [0x80, 'Tapped by all threat list'],
]);

export const GO_FLAG_BITS: readonly Bit[] = bits([
  [0x1, 'In use'], [0x2, 'Locked'], [0x4, 'Needs a condition to interact'], [0x8, 'Transport'], [0x10, 'Not selectable'],
  [0x20, 'Never despawn'], [0x40, 'Triggered'], [0x200, 'Damaged'], [0x400, 'Destroyed'],
]);

export const ROLE_BITS: readonly Bit[] = bits([[1, 'Tanks'], [2, 'Healers'], [4, 'Damage dealers']]);

export const SUMMON_FLAG_BITS: readonly Bit[] = bits([[1, 'Personal spawn'], [2, 'Prefer the unit']]);

export const REACT_STATES: readonly Choice[] = [[0, 'Passive'], [1, 'Defensive'], [2, 'Aggressive'], [3, 'Assist']];
export const SHEATH_STATES: readonly Choice[] = [[0, 'Unarmed'], [1, 'Melee weapon'], [2, 'Ranged weapon']];
export const SUMMON_TYPES: readonly Choice[] = [
  [1, 'Despawn after the time, or when it dies'],
  [2, 'Despawn after the time, or when its corpse goes'],
  [3, 'Despawn after the time'],
  [4, 'Despawn after the time, when out of combat'],
  [5, 'Despawn when it dies'],
  [6, 'Despawn when its corpse goes, or after the time'],
  [7, 'Despawn when it dies (corpse stays)'],
  [8, 'Only despawn by script'],
];
export const POWER_TYPES: readonly Choice[] = [[0, 'Mana'], [1, 'Rage'], [2, 'Focus'], [3, 'Energy'], [4, 'Happiness'], [5, 'Runes'], [6, 'Runic power']];
export const TIMER_TYPES: readonly Choice[] = [[0, 'Only out of combat'], [1, 'Only in combat'], [2, 'Always']];
export const GO_STATES: readonly Choice[] = [[0, 'Active (closed)'], [1, 'Ready (open)'], [2, 'Alternative active']];
export const LOOT_STATES: readonly Choice[] = [[0, 'Not ready'], [1, 'Ready'], [2, 'Activated'], [3, 'Just deactivated']];
export const RESPAWN_CHECKS: readonly Choice[] = [[0, 'Anywhere'], [1, 'On a given map'], [2, 'In a given area']];
export const HOSTILITY: readonly Choice[] = [[0, 'Hostile units only'], [1, 'Non-hostile units only'], [2, 'Any unit']];
export const GOSSIP_HELLO_FILTERS: readonly Choice[] = [[0, 'Always'], [1, 'Only when talked to'], [2, 'Only when used (report use)']];
export const UNIT_KINDS: readonly Choice[] = [[0, 'Creature'], [1, 'Game object']];
export const ENTITY_KINDS: readonly Choice[] = [[1, 'Creature'], [2, 'Game object']];
export const ALIVE_STATES: readonly Choice[] = [[0, 'Alive or dead'], [1, 'Alive only'], [2, 'Dead only']];
export const CREDIT_TYPES: readonly Choice[] = [[0, 'Monster kill'], [1, 'Event']];
export const UNIT_FLAG_FIELDS: readonly Choice[] = [[0, 'unit_flags'], [1, 'unit_flags2']];
export const BYTES1_TYPES: readonly Choice[] = [[0, 'Stand state'], [1, 'Pet talents'], [2, 'Visibility flags'], [3, 'Animation tier']];
export const INSTANCE_DATA_TYPES: readonly Choice[] = [[0, 'Data'], [1, 'Boss state']];
export const TEAMS: readonly Choice[] = [[0, 'Any'], [67, 'Horde'], [469, 'Alliance']];
export const CHARM_MOMENTS: readonly Choice[] = [[0, 'When charm starts'], [1, 'When charm ends']];
export const FOLLOW_STATES: readonly Choice[] = [[0, 'Stop following'], [1, 'Follow']];
export const IMMUNITY_TYPES: readonly Choice[] = [[0, 'School'], [1, 'Dispel type'], [2, 'Mechanic'], [3, 'Effect'], [4, 'State'], [5, 'Spell id']];
export const FORMATION_TYPES: readonly Choice[] = [[0, 'Members only'], [1, 'Leader only'], [2, 'Everyone']];
export const WAYPOINT_SOURCES: readonly Choice[] = [[0, 'waypoint_data'], [1, 'waypoints']];
export const MOVEMENT_SPEED_TYPES: readonly Choice[] = [[0, 'Walk'], [1, 'Run'], [2, 'Run back'], [3, 'Swim'], [4, 'Swim back'], [5, 'Turn rate'], [6, 'Flight'], [7, 'Flight back'], [8, 'Pitch rate']];
