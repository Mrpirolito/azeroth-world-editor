/**
 * The layouts of the DBC files the editor changes, one letter per 4-byte field (see `Dbc`). They follow the 3.3.5a
 * client files, which the CoA server's `DBCfmt.h` and `DBCStructure.h` read the same way (the server skips the fields
 * it does not use; this layout names them, because the client needs them). Strings are only the first language of a
 * text: the others stay raw (`x`), since some records hold other data there.
 */

export interface DbcField {
  name: string;
  kind: 'n' | 'u' | 'i' | 'f' | 's' | 'x';
}

export interface DbcLayout {
  file: string;
  /** What the table is called in the editor */
  title: string;
  fields: readonly DbcField[];
  format: string;
}

type Kind = DbcField['kind'];

/** `name` for one field, or `name1`..`nameN` for a run of them */
const run = (name: string, count: number, kind: Kind): DbcField[] => (count === 1 ? [{ name, kind }] : Array.from({ length: count }, (_, i) => ({ name: `${name}${i + 1}`, kind })));
const one = (name: string, kind: Kind): DbcField => ({ name, kind });
/** A text in 16 languages and its flags: the first language is read as a string, the others are raw */
const text = (name: string): DbcField[] => [one(`${name}`, 's'), ...run(`${name}Lang`, 15, 'x'), one(`${name}Flags`, 'x')];

const layout = (file: string, title: string, fields: readonly DbcField[]): DbcLayout => ({ file, title, fields, format: fields.map((f) => f.kind).join('') });

export const SPELL_FIELDS: readonly DbcField[] = [
  one('ID', 'n'), one('Category', 'u'), one('DispelType', 'u'), one('Mechanic', 'u'),
  one('Attributes', 'u'), ...run('AttributesEx', 7, 'u').map((f, i) => ({ ...f, name: i === 0 ? 'AttributesEx' : `AttributesEx${i + 1}` })),
  one('Stances', 'u'), one('StancesHigh', 'x'), one('StancesNot', 'u'), one('StancesNotHigh', 'x'),
  one('Targets', 'u'), one('TargetCreatureType', 'u'), one('RequiresSpellFocus', 'u'), one('FacingCasterFlags', 'u'),
  one('CasterAuraState', 'u'), one('TargetAuraState', 'u'), one('ExcludeCasterAuraState', 'u'), one('ExcludeTargetAuraState', 'u'),
  one('CasterAuraSpell', 'u'), one('TargetAuraSpell', 'u'), one('ExcludeCasterAuraSpell', 'u'), one('ExcludeTargetAuraSpell', 'u'),
  one('CastingTimeIndex', 'u'), one('RecoveryTime', 'u'), one('CategoryRecoveryTime', 'u'),
  one('InterruptFlags', 'u'), one('AuraInterruptFlags', 'u'), one('ChannelInterruptFlags', 'u'),
  one('ProcTypeMask', 'u'), one('ProcChance', 'u'), one('ProcCharges', 'u'),
  one('MaxLevel', 'u'), one('BaseLevel', 'u'), one('SpellLevel', 'u'), one('DurationIndex', 'u'),
  one('PowerType', 'i'), one('ManaCost', 'u'), one('ManaCostPerLevel', 'u'), one('ManaPerSecond', 'u'), one('ManaPerSecondPerLevel', 'u'),
  one('RangeIndex', 'u'), one('Speed', 'f'), one('ModalNextSpell', 'u'), one('CumulativeAura', 'u'),
  ...run('Totem', 2, 'u'), ...run('Reagent', 8, 'i'), ...run('ReagentCount', 8, 'i'),
  one('EquippedItemClass', 'i'), one('EquippedItemSubclass', 'i'), one('EquippedItemInvTypes', 'i'),
  ...run('Effect', 3, 'u'), ...run('EffectDieSides', 3, 'i'), ...run('EffectRealPointsPerLevel', 3, 'f'), ...run('EffectBasePoints', 3, 'i'),
  ...run('EffectMechanic', 3, 'u'), ...run('EffectImplicitTargetA', 3, 'u'), ...run('EffectImplicitTargetB', 3, 'u'), ...run('EffectRadiusIndex', 3, 'u'),
  ...run('EffectAura', 3, 'u'), ...run('EffectAuraPeriod', 3, 'u'), ...run('EffectAmplitude', 3, 'f'), ...run('EffectChainTargets', 3, 'u'),
  ...run('EffectItemType', 3, 'u'), ...run('EffectMiscValue', 3, 'i'), ...run('EffectMiscValueB', 3, 'i'), ...run('EffectTriggerSpell', 3, 'u'),
  ...run('EffectPointsPerCombo', 3, 'f'),
  ...run('EffectSpellClassMaskA', 3, 'u'), ...run('EffectSpellClassMaskB', 3, 'u'), ...run('EffectSpellClassMaskC', 3, 'u'),
  ...run('SpellVisual', 2, 'u'), one('SpellIconID', 'u'), one('ActiveIconID', 'u'), one('SpellPriority', 'u'),
  ...text('Name'), ...text('Rank'), ...text('Description'), ...text('ToolTip'),
  one('ManaCostPercentage', 'u'), one('StartRecoveryCategory', 'u'), one('StartRecoveryTime', 'u'), one('MaxTargetLevel', 'u'),
  one('SpellClassSet', 'u'), ...run('SpellClassMask', 3, 'u'), one('MaxTargets', 'u'), one('DefenseType', 'u'), one('PreventionType', 'u'), one('StanceBarOrder', 'u'),
  ...run('EffectChainAmplitude', 3, 'f'), one('MinFactionID', 'u'), one('MinReputation', 'u'), one('RequiredAuraVision', 'u'),
  ...run('TotemCategory', 2, 'u'), one('RequiredAreasID', 'u'), one('SchoolMask', 'u'), one('RuneCostID', 'u'), one('SpellMissileID', 'u'),
  one('PowerDisplayID', 'i'), ...run('EffectBonusMultiplier', 3, 'f'), one('SpellDescriptionVariableID', 'u'), one('SpellDifficultyID', 'u'),
];

const SPELL = layout('Spell.dbc', 'Spells', SPELL_FIELDS);

export const DBC_LAYOUTS: readonly DbcLayout[] = [
  SPELL,
  layout('SpellIcon.dbc', 'Spell icons', [one('ID', 'n'), one('TextureFilename', 's')]),
  layout('SpellRange.dbc', 'Spell ranges', [
    one('ID', 'n'), one('RangeMinHostile', 'f'), one('RangeMinFriendly', 'f'), one('RangeMaxHostile', 'f'), one('RangeMaxFriendly', 'f'), one('Flags', 'u'),
    ...text('DisplayName'), ...text('DisplayNameShort'),
  ]),
  layout('SpellCastTimes.dbc', 'Cast times', [one('ID', 'n'), one('Base', 'i'), one('PerLevel', 'f'), one('Minimum', 'i')]),
  layout('SpellDuration.dbc', 'Durations', [one('ID', 'n'), one('Duration', 'i'), one('PerLevel', 'i'), one('Maximum', 'i')]),
  layout('SpellRadius.dbc', 'Radii', [one('ID', 'n'), one('Radius', 'f'), one('PerLevel', 'f'), one('RadiusMax', 'f')]),
  layout('Item.dbc', 'Items (client)', [one('ID', 'n'), one('ClassID', 'u'), one('SubclassID', 'u'), one('SoundOverrideSubclassID', 'i'), one('Material', 'i'), one('DisplayInfoID', 'u'), one('InventoryType', 'u'), one('SheatheType', 'u')]),
  layout('ItemDisplayInfo.dbc', 'Item looks', [
    one('ID', 'n'), ...run('ModelName', 2, 's'), ...run('ModelTexture', 2, 's'), ...run('InventoryIcon', 2, 's'), ...run('GeosetGroup', 3, 'u'),
    one('Flags', 'u'), one('SpellVisualID', 'u'), one('GroupSoundIndex', 'u'), ...run('HelmetGeosetVis', 2, 'u'), ...run('Texture', 8, 's'), one('ItemVisual', 'u'), one('ParticleColorID', 'u'),
  ]),
  layout('Faction.dbc', 'Factions', [
    one('ID', 'n'), one('ReputationIndex', 'i'), ...run('ReputationRaceMask', 4, 'u'), ...run('ReputationClassMask', 4, 'u'), ...run('ReputationBase', 4, 'i'), ...run('ReputationFlags', 4, 'u'),
    one('ParentFactionID', 'u'), one('SpilloverRateIn', 'f'), one('SpilloverRateOut', 'f'), one('SpilloverMaxRankIn', 'i'), one('SpilloverRankUnk', 'x'),
    ...text('Name'), ...text('Description'),
  ]),
  layout('AreaTable.dbc', 'Areas and zones', [
    one('ID', 'n'), one('ContinentID', 'u'), one('ParentAreaID', 'u'), one('AreaBit', 'u'), one('Flags', 'u'),
    one('SoundProviderPref', 'u'), one('SoundProviderPrefUnderwater', 'u'), one('AmbienceID', 'u'), one('ZoneMusic', 'u'), one('IntroSound', 'u'),
    one('ExplorationLevel', 'i'), ...text('AreaName'), one('FactionGroupMask', 'u'), ...run('LiquidTypeID', 4, 'u'), one('MinElevation', 'f'), one('AmbientMultiplier', 'f'), one('LightID', 'u'),
  ]),
];

/** The layout of a file by name, any case */
export function layoutOf(file: string): DbcLayout | undefined {
  const lower = file.toLowerCase();
  return DBC_LAYOUTS.find((l) => l.file.toLowerCase() === lower);
}

/** The index of a named field of a layout; throws for a name it lacks */
export function fieldIndex(layoutFields: readonly DbcField[], name: string): number {
  const at = layoutFields.findIndex((f) => f.name === name);
  if (at < 0) throw new Error(`No field ${name}.`);
  return at;
}

export const SPELL_FORMAT = SPELL.format;
export const SPELL_LAYOUT = SPELL;
/** A Spell.dbc field's index by name, computed once */
export const SPELL_INDEX: Readonly<Record<string, number>> = Object.fromEntries(SPELL_FIELDS.map((f, i) => [f.name, i]));
