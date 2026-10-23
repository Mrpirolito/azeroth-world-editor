import type { Bit, Choice } from '../smartai/types';

/** Named bits from `[bit position, label, help?]`; the top bit (31) is left out, as no editor can hold it as a signed number */
export const bits = (list: readonly (readonly [number, string, string?])[]): Bit[] =>
  list.filter(([n]) => n < 31).map(([n, label, help]) => ({ value: 2 ** n, label, ...(help ? { help } : {}) }));

export const UNIT_FLAGS = bits([
  [1, 'Cannot be attacked', 'Players and NPCs cannot attack it'],
  [2, 'Cannot move'],
  [8, 'Ignores players', 'No combat or help between it and players'],
  [9, 'Ignores NPCs', 'No combat or help between it and other NPCs'],
  [13, 'Silenced', 'Cannot cast spells'],
  [17, 'Pacified', 'Will not attack'],
  [18, 'Stunned'],
  [22, 'Confused'],
  [23, 'Fleeing'],
  [25, 'Cannot be selected', 'No name, no nameplate, cannot be clicked'],
  [26, 'Skinnable'],
  [27, 'Mount'],
  [29, 'No chat emotes'],
  [30, 'Weapons sheathed'],
  [0, 'Server controlled'],
  [4, 'Can be renamed'],
  [12, 'PvP flagged'],
  [15, 'Swims only'],
  [21, 'Disarmed'],
]);

export const UNIT_FLAGS2 = bits([
  [0, 'Feigns death'],
  [1, 'Hides its body', 'Only its equipment shows'],
  [2, 'Ignores reputation'],
  [3, 'Understands all languages'],
  [4, 'Mirror image'],
  [5, 'Appears at once', 'No fade-in when summoned'],
  [7, 'Off-hand disarmed'],
  [10, 'Ranged disarmed'],
  [11, 'Regenerates power'],
  [13, 'Cannot be spell-clicked'],
  [14, 'Enemies can interact'],
  [15, 'Cannot turn'],
  [17, 'Special death animation'],
]);

export const TYPE_FLAGS = bits([
  [0, 'Tameable', 'Also needs a beast type and a family'],
  [1, 'Visible to ghosts'],
  [2, 'Boss', 'Shows ?? as its level and resists knockback'],
  [4, 'No faction tooltip'],
  [6, 'Spell attackable'],
  [7, 'Interactable while dead'],
  [8, 'Herbalism skinning'],
  [9, 'Mining skinning'],
  [10, 'No death message'],
  [11, 'Fights mounted'],
  [12, 'Helps players in combat'],
  [13, 'No pet bar'],
  [15, 'Engineering skinning'],
  [16, 'Exotic tameable'],
  [17, 'Uses model collision size'],
  [18, 'Interactable in combat'],
  [19, 'Projectiles collide'],
  [20, 'No nameplate'],
  [26, 'Treated as raid unit'],
  [27, 'Always gossips'],
  [28, 'Never sheathes'],
]);

export const FLAGS_EXTRA = bits([
  [0, 'Binds instance', 'Killing it binds the killer and group to the instance'],
  [1, 'Civilian', 'Never aggro, whatever its faction says'],
  [2, 'Cannot parry'],
  [3, 'No parry haste'],
  [4, 'Cannot block'],
  [5, 'No crushing blows'],
  [6, 'Gives no XP'],
  [7, 'Trigger', 'An invisible helper creature'],
  [8, 'Immune to taunt'],
  [10, 'Seen by ghosts only'],
  [11, 'Uses off-hand attack'],
  [12, 'Does not buy items'],
  [13, 'Cannot enter combat'],
  [15, 'Guard'],
  [16, 'Ignores feign death'],
  [17, 'Cannot crit'],
  [18, 'No weapon skill gains'],
  [21, 'Kill credit without damage'],
  [22, 'Avoided by area spells'],
  [23, 'Cannot dodge'],
  [25, 'Does not call for help'],
  [26, 'Ignores calls for help'],
  [29, 'Ignores pathfinding'],
  [30, 'Immune to knockback'],
]);

export const DYNAMIC_FLAGS = bits([
  [0, 'Lootable'],
  [1, 'Shown on minimap'],
  [2, 'Tapped (grey name)'],
  [4, 'Special info'],
  [5, 'Looks dead'],
]);

export const MECHANIC_IMMUNITY = bits([
  [0, 'Charm'], [1, 'Disorient'], [2, 'Disarm'], [3, 'Distract'], [4, 'Fear'], [5, 'Grip'], [6, 'Root'], [7, 'Attack slow'],
  [8, 'Silence'], [9, 'Sleep'], [10, 'Snare'], [11, 'Stun'], [12, 'Freeze'], [13, 'Knockout'], [14, 'Bleed'], [15, 'Bandage'],
  [16, 'Polymorph'], [17, 'Banish'], [18, 'Shield'], [19, 'Shackle'], [20, 'Mount'], [21, 'Infection'], [22, 'Turn'], [23, 'Horror'],
  [24, 'Invulnerability'], [25, 'Interrupt'], [26, 'Daze'], [27, 'Discovery'], [28, 'Immune shield'], [29, 'Sapped'], [30, 'Enrage'],
]);

export const SCHOOL_MASK = bits([
  [0, 'Physical'], [1, 'Holy'], [2, 'Fire'], [3, 'Nature'], [4, 'Frost'], [5, 'Shadow'], [6, 'Arcane'],
]);

export const SCHOOLS: readonly Choice[] = [
  [0, 'Physical'], [1, 'Holy'], [2, 'Fire'], [3, 'Nature'], [4, 'Frost'], [5, 'Shadow'], [6, 'Arcane'],
];

export const NPC_FLAGS = bits([
  [0, 'Talks (gossip)'], [1, 'Gives quests'], [4, 'Trains'], [5, 'Class trainer'], [6, 'Profession trainer'], [7, 'Sells items'],
  [8, 'Sells ammo'], [9, 'Sells food'], [10, 'Sells poison'], [11, 'Sells reagents'], [12, 'Repairs'], [13, 'Flight master'],
  [14, 'Spirit healer'], [15, 'Spirit guide'], [16, 'Innkeeper'], [17, 'Banker'], [18, 'Petitions'], [19, 'Tabard designer'],
  [20, 'Battlemaster'], [21, 'Auctioneer'], [22, 'Stable master'], [23, 'Guild banker'], [24, 'Spell click'], [25, 'Player vehicle'],
  [26, 'Mailbox'],
]);

export const GAMEOBJECT_FLAGS = bits([
  [0, 'In use'], [1, 'Locked'], [2, 'Needs a condition to interact'], [3, 'Transport'], [4, 'Cannot be selected'],
  [5, 'Never despawns'], [6, 'Triggered'], [9, 'Damaged'], [10, 'Destroyed'],
]);

export const RANKS: readonly Choice[] = [[0, 'Normal'], [1, 'Elite'], [2, 'Rare elite'], [3, 'Boss'], [4, 'Rare']];

export const UNIT_CLASSES: readonly Choice[] = [[1, 'Warrior'], [2, 'Paladin'], [4, 'Rogue'], [8, 'Mage']];

export const MOVEMENT_TYPES: readonly Choice[] = [[0, 'Stands still'], [1, 'Wanders randomly'], [2, 'Follows a waypoint path']];

export const STAND_STATES: readonly Choice[] = [
  [0, 'Standing'], [1, 'Sitting'], [2, 'Sitting on a chair'], [3, 'Sleeping'], [4, 'Sitting low chair'], [5, 'Sitting medium chair'],
  [6, 'Sitting high chair'], [7, 'Dead'], [8, 'Kneeling'], [9, 'Submerged'],
];

export const VIS_DISTANCES: readonly Choice[] = [
  [0, 'Normal'], [1, 'Tiny'], [2, 'Small'], [3, 'Large'], [4, 'Gigantic'], [5, 'Infinite'],
];

export const MOVE_MODES: readonly Choice[] = [[0, 'Server default'], [1, 'Not allowed'], [2, 'Allowed']];

export const CREATURE_FAMILIES: readonly Choice[] = [
  [0, 'None'], [1, 'Wolf'], [2, 'Cat'], [3, 'Spider'], [4, 'Bear'], [5, 'Boar'], [6, 'Crocolisk'], [7, 'Carrion bird'], [8, 'Crab'],
  [9, 'Gorilla'], [11, 'Raptor'], [12, 'Tallstrider'], [15, 'Felhunter'], [16, 'Voidwalker'], [17, 'Succubus'], [19, 'Doomguard'],
  [20, 'Scorpid'], [21, 'Turtle'], [23, 'Imp'], [24, 'Bat'], [25, 'Hyena'], [26, 'Owl'], [27, 'Wind serpent'], [28, 'Remote control'],
  [29, 'Felguard'], [30, 'Dragonhawk'], [31, 'Ravager'], [32, 'Warp stalker'], [33, 'Sporebat'], [34, 'Nether ray'], [35, 'Serpent'],
  [37, 'Moth'], [38, 'Chimaera'], [39, 'Devilsaur'], [40, 'Ghoul'], [41, 'Silithid'], [42, 'Worm'], [43, 'Rhino'], [44, 'Wasp'],
  [45, 'Core hound'], [46, 'Spirit beast'],
];

/** The kinds of text a creature says: `creature_text.Type` */
export const TEXT_TYPES: readonly Choice[] = [
  [12, 'Says'], [14, 'Yells'], [16, 'Emotes'], [15, 'Boss emote'], [41, 'Boss emote (whisper)'], [42, 'Whispers'], [11, 'Says (to the zone)'],
];

export const TEXT_RANGES: readonly Choice[] = [[0, 'Normal'], [1, 'Area'], [2, 'Zone'], [3, 'Map'], [4, 'World']];

export const LANGUAGES: readonly Choice[] = [
  [0, 'Universal'], [1, 'Orcish'], [2, 'Darnassian'], [3, 'Taurahe'], [6, 'Dwarvish'], [7, 'Common'], [8, 'Demonic'], [9, 'Titan'],
  [10, 'Thalassian'], [11, 'Draconic'], [12, 'Kalimag'], [13, 'Gnomish'], [14, 'Troll'], [33, 'Gutterspeak'], [35, 'Draenei'],
];

export const LOOT_MODES = bits([[0, 'Normal'], [1, 'Hard mode 1'], [2, 'Hard mode 2'], [3, 'Hard mode 3'], [4, 'Hard mode 4']]);

export const GOSSIP_EMOTES: readonly Choice[] = [
  [0, 'None'], [1, 'Talk'], [2, 'Bow'], [3, 'Wave'], [4, 'Cheer'], [5, 'Exclamation'], [6, 'Question'], [7, 'Eat'], [10, 'Dance'],
  [11, 'Laugh'], [14, 'Rude'], [15, 'Roar'], [16, 'Kneel'], [17, 'Kiss'], [18, 'Cry'], [20, 'Salute'], [21, 'Shy'], [273, 'Yes'], [274, 'No'],
];
