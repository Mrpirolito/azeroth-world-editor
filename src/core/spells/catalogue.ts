import type { Bit, Choice } from '../smartai/types';
import { ATTRIBUTE_NAMES, AURA_NAMES, EFFECT_NAMES, MECHANIC_NAMES, TARGET_NAMES } from './names.generated';

/**
 * The words the spell editor uses: effects, auras, targets and attribute bits come from the fork's
 * `SharedDefines.h` (names made readable); the rest is this project's own wording.
 */

const toChoices = (list: readonly (readonly [number, string])[]): Choice[] => list.map(([v, l]) => [v, l] as const);

export const EFFECTS: readonly Choice[] = [[0, 'None'], ...toChoices(EFFECT_NAMES)];
export const AURAS: readonly Choice[] = [[0, 'None'], ...toChoices(AURA_NAMES)];
export const TARGETS: readonly Choice[] = [[0, 'None'], ...toChoices(TARGET_NAMES)];
export const MECHANICS: readonly Choice[] = toChoices(MECHANIC_NAMES.length > 0 ? MECHANIC_NAMES : [[0, 'None']]);

/** The name of a value in a list, else the number */
export const nameOf = (list: readonly Choice[], value: number): string => list.find(([v]) => v === value)?.[1] ?? `#${value}`;
export const hasValue = (list: readonly Choice[], value: number): boolean => list.some(([v]) => v === value);

const bit = (n: number, label: string, help?: string): Bit => ({ value: 2 ** n, label, ...(help ? { help } : {}) });

export const SCHOOL_BITS: readonly Bit[] = [
  bit(0, 'Physical'), bit(1, 'Holy'), bit(2, 'Fire'), bit(3, 'Nature'), bit(4, 'Frost'), bit(5, 'Shadow'), bit(6, 'Arcane'),
];

export const POWER_TYPES: readonly Choice[] = [[-2, 'Health'], [0, 'Mana'], [1, 'Rage'], [2, 'Focus'], [3, 'Energy'], [4, 'Happiness'], [5, 'Rune'], [6, 'Runic power']];

export const DISPEL_TYPES: readonly Choice[] = [
  [0, 'None'], [1, 'Magic'], [2, 'Curse'], [3, 'Disease'], [4, 'Poison'], [5, 'Stealth'], [6, 'Invisibility'], [7, 'All'], [8, 'NPC only'], [9, 'Enrage'], [10, 'ZG ticket'],
];

/** What interrupts the cast itself (InterruptFlags) */
export const CAST_INTERRUPT_BITS: readonly Bit[] = [
  bit(0, 'Moving', 'The cast stops when the caster moves'),
  bit(1, 'Pushback', 'Taking damage delays the cast'),
  bit(3, 'Interrupt', 'Spell interrupts (kick, counterspell) stop it'),
  bit(4, 'Cancelled by damage', 'Any direct damage stops the cast'),
];

/** What ends an aura, or interrupts a channel (AuraInterruptFlags, ChannelInterruptFlags) */
export const AURA_INTERRUPT_BITS: readonly Bit[] = [
  bit(0, 'Hit by a spell'), bit(1, 'Takes damage'), bit(2, 'Casts a spell'), bit(3, 'Moves'), bit(4, 'Turns'), bit(5, 'Jumps'),
  bit(6, 'Dismounts'), bit(7, 'Enters water'), bit(8, 'Leaves water'), bit(9, 'Unsheathes'), bit(10, 'Talks to an NPC'), bit(11, 'Uses an object'),
  bit(12, 'Melee attacks'), bit(13, 'Spell attacks'), bit(15, 'Transforms'), bit(17, 'Mounts'), bit(18, 'Stands up'), bit(19, 'Changes map'),
  bit(20, 'Becomes immune'), bit(22, 'Is teleported'), bit(23, 'Enters PvP combat'), bit(24, 'Takes direct damage'), bit(25, 'Lands'), bit(31, 'Leaves combat'),
];

/** The eight attribute words as named toggles; bit 31 is kept (the number is unsigned in the file) */
export const ATTRIBUTE_WORDS: readonly { field: string; label: string; bits: readonly Bit[] }[] = ATTRIBUTE_NAMES.map((bitsOfWord, n) => ({
  field: n === 0 ? 'Attributes' : `AttributesEx${n === 1 ? '' : n}`,
  label: n === 0 ? 'Attributes' : `Attributes Ex${n}`,
  bits: bitsOfWord.map(([b, title, help]) => bit(b, title, help || undefined)),
}));

/** Effects that apply an aura, whose aura type is then meaningful */
export const AURA_EFFECTS: ReadonlySet<number> = new Set([6, 27, 35, 65, 119, 128, 129, 143]);

/** Whether a bit of an unsigned mask is set (works for bit 31) */
export const hasBit = (mask: number, value: number): boolean => ((mask >>> 0) & (value >>> 0)) !== 0;

/** A mask as the labels of its set bits, none for 0 */
export function maskLabel(bitsList: readonly Bit[], mask: number): string {
  const set = bitsList.filter((b) => hasBit(mask, b.value)).map((b) => b.label);
  return set.length > 0 ? set.join(', ') : 'none';
}

/** A mask with a bit set or cleared, kept unsigned */
export function toggleBit(mask: number, value: number, on: boolean): number {
  const m = mask >>> 0;
  const v = value >>> 0;
  return (on ? m | v : m & ~v) >>> 0;
}
