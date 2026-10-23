import { bool, choice, creature, flags, gameobject, hi, int, lo, spell, yards } from './dsl';
import { ALIVE_STATES, ENTITY_KINDS, FORMATION_TYPES, POWER_TYPES, ROLE_BITS } from './flags';
import type { ParamDef, TypeDef } from './types';

/** `SMART_TARGET_*` available on a 3.3.5a AzerothCore server: who or what an action is aimed at. */

const tg = (id: number, key: string, name: string, say: string, help: string, params: readonly ParamDef[] = [], position = false): TypeDef => ({
  id, key, name, say, help, params, ...(position ? { position } : {}),
});

const hostile = (): ParamDef[] => [
  yards('Within (yards)', 'any distance'),
  bool('Players only'),
  { ...choice('Only with this power', [[0, 'Any'], ...POWER_TYPES.map(([v, l]) => [v + 1, l] as const)]), help: 'Only units that use this power (mana, rage ...).' },
  spell('Only if it lacks this aura', 'any'),
];

export const TARGETS: readonly TypeDef[] = [
  tg(0, 'NONE', 'Nobody', 'nobody', 'No target: for actions that do not need one.'),
  tg(1, 'SELF', 'Itself', 'itself', 'The unit running the script.'),
  tg(2, 'VICTIM', 'Its current target', 'its current target', 'The unit it is fighting (the one it has most threat on).'),
  tg(3, 'HOSTILE_SECOND_AGGRO', 'Second on its threat list', 'the second on its threat list', 'The unit with the second most threat.', hostile()),
  tg(4, 'HOSTILE_LAST_AGGRO', 'Last on its threat list', 'the last on its threat list', 'The unit with the least threat.', hostile()),
  tg(5, 'HOSTILE_RANDOM', 'A random attacker', 'a random attacker', 'Any random unit on its threat list.', hostile()),
  tg(6, 'HOSTILE_RANDOM_NOT_TOP', 'A random attacker (not the top)', 'a random attacker other than the main target', 'A random unit on its threat list, except the one with the most threat.', hostile()),
  tg(7, 'ACTION_INVOKER', 'Whoever set it off', 'whoever triggered the event', 'The unit that caused the event: the player who talked to it, the one who killed it ...'),
  tg(8, 'POSITION', 'A fixed position', 'the position below', 'The coordinates given in the position fields.', [], true),
  tg(9, 'CREATURE_RANGE', 'Creatures in a range', '{1} between {2} and {3} yards away', 'Creatures of an entry within a distance range. 0 for the entry means any.', [creature('Creature', 'any'), lo(yards('From (yards)')), hi(yards('To (yards)')), choice('Alive state', ALIVE_STATES)]),
  tg(10, 'CREATURE_GUID', 'A specific creature spawn', 'creature spawn {1}', 'One spawned creature, by its spawn guid (and its entry as a check).', [int('Spawn guid'), creature('Entry')]),
  tg(11, 'CREATURE_DISTANCE', 'Creatures within a distance', '{1} within {2} yards', 'Creatures of an entry within a distance.', [creature('Creature', 'any'), yards('Within (yards)'), choice('Alive state', ALIVE_STATES)]),
  tg(12, 'STORED', 'Remembered targets', 'the targets remembered as list {1}', 'The list saved earlier by the "remember the targets" action.', [int('List id')]),
  tg(13, 'GAMEOBJECT_RANGE', 'Objects in a range', '{1} between {2} and {3} yards away', 'Game objects of an entry within a distance range. 0 for the entry means any.', [gameobject('Object', 'any'), lo(yards('From (yards)')), hi(yards('To (yards)'))]),
  tg(14, 'GAMEOBJECT_GUID', 'A specific object spawn', 'object spawn {1}', 'One spawned game object, by its spawn guid (and its entry as a check).', [int('Spawn guid'), gameobject('Entry')]),
  tg(15, 'GAMEOBJECT_DISTANCE', 'Objects within a distance', '{1} within {2} yards', 'Game objects of an entry within a distance.', [gameobject('Object', 'any'), yards('Within (yards)')]),
  tg(16, 'INVOKER_PARTY', 'The invoker\'s group', 'the invoker and their group', 'The player who set it off and everyone in their party.', [bool('Include pets')]),
  tg(17, 'PLAYER_RANGE', 'Players in a range', 'players between {1} and {2} yards away', 'Players within a distance range, at most this many.', [lo(yards('From (yards)')), hi(yards('To (yards)')), int('At most this many', 'no limit')]),
  tg(18, 'PLAYER_DISTANCE', 'Players within a distance', 'players within {1} yards', 'Players within a distance.', [yards('Within (yards)')]),
  tg(19, 'CLOSEST_CREATURE', 'The closest creature', 'the closest {1}', 'The nearest creature of an entry.', [creature('Creature', 'any'), yards('Within (yards)'), bool('Dead ones')]),
  tg(20, 'CLOSEST_GAMEOBJECT', 'The closest object', 'the closest {1}', 'The nearest game object of an entry.', [gameobject('Object', 'any'), yards('Within (yards)'), bool('Only spawned ones')]),
  tg(21, 'CLOSEST_PLAYER', 'The closest player', 'the closest player within {1} yards', 'The nearest player.', [yards('Within (yards)')]),
  tg(22, 'ACTION_INVOKER_VEHICLE', 'The invoker\'s vehicle', 'the invoker\'s vehicle', 'The vehicle the invoker is riding.'),
  tg(23, 'OWNER_OR_SUMMONER', 'Its owner', 'its owner or summoner', 'Whoever summoned or owns it.', [bool('Use the charmer when charmed')]),
  tg(24, 'THREAT_LIST', 'Everyone on its threat list', 'everyone on its threat list', 'Every unit it is fighting.', [yards('Within (yards)', 'any distance')]),
  tg(25, 'CLOSEST_ENEMY', 'The closest enemy', 'the closest enemy within {1} yards', 'The nearest hostile unit.', [yards('Within (yards)'), bool('Players only')]),
  tg(26, 'CLOSEST_FRIENDLY', 'The closest friend', 'the closest friend within {1} yards', 'The nearest friendly unit.', [yards('Within (yards)'), bool('Players only')]),
  tg(27, 'LOOT_RECIPIENTS', 'The players who tagged it', 'everyone who tagged it', 'Every player who has kill credit on it.'),
  tg(28, 'FARTHEST', 'The farthest unit', 'the farthest unit within {1} yards', 'The most distant hostile unit.', [yards('Within (yards)'), bool('Players only'), bool('Only in line of sight'), yards('At least this far')]),
  tg(29, 'VEHICLE_PASSENGER', 'A vehicle passenger', 'the passenger in seat {1}', 'The unit sitting in a seat of its vehicle.', [int('Seat')]),
  tg(201, 'PLAYER_WITH_AURA', 'A player with an aura', 'players with {1}', 'Players that have (or lack) an aura.', [spell('Aura'), bool('Without the aura'), yards('Within (yards)'), yards('At least this far')]),
  tg(202, 'RANDOM_POINT', 'Random points around', 'random points within {1} yards', 'Random points around it (or the position below), e.g. to summon on.', [yards('Radius'), int('How many'), bool('Around itself')], true),
  tg(203, 'ROLE_SELECTION', 'Players by role', 'players of a chosen role within {1} yards', 'Players that are tanks, healers or damage dealers.', [yards('Within (yards)'), flags('Roles', ROLE_BITS), int('Keep only this many', 'all')]),
  tg(204, 'SUMMONED_CREATURES', 'Its summons', 'its summoned {1}', 'The creatures it summoned, of one entry or (0) all.', [creature('Creature', 'any')]),
  tg(205, 'INSTANCE_STORAGE', 'Stored by the instance script', 'the instance object {1}', 'A creature or object the instance script remembers under an index.', [int('Index'), choice('Kind', ENTITY_KINDS)]),
  tg(206, 'FORMATION', 'Its formation', 'its formation', 'Members of the formation it belongs to.', [choice('Which', FORMATION_TYPES), creature('Creature', 'any'), bool('Not itself')]),
  tg(207, 'SHARED_OWNER_ENTITIES', 'Things with the same owner', 'things with the same owner', 'Creatures or objects that share its owner.', [choice('Kind', ENTITY_KINDS), int('Entry', 'any'), yards('Within (yards)', 'view range')]),
];
