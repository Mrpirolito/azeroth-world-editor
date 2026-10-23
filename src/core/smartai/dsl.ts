import type { Bit, Choice, ParamDef, ParamKind } from './types';

/** Short builders for parameter definitions, so the catalogue reads as a table. */

const make = (kind: ParamKind) => (label: string, zero?: string, help?: string): ParamDef => ({ label, kind, ...(zero ? { zero } : {}), ...(help ? { help } : {}) });

export const int = make('int');
export const ms = make('ms');
export const sec = make('sec');
export const pct = make('pct');
export const yards = make('yards');
export const bool = make('bool');
export const spell = make('spell');
export const creature = make('creature');
export const gameobject = make('gameobject');
export const item = make('item');
export const quest = make('quest');
export const textGroup = make('textGroup');
export const emote = make('emote');
export const sound = make('sound');
export const faction = make('faction');
export const map = make('map');
export const area = make('area');
export const gameEvent = make('gameEvent');
export const phase = make('phase');
export const phaseMask = make('phaseMask');
export const actionList = make('actionList');
export const areatrigger = make('areatrigger');
export const gossipMenu = make('gossipMenu');

export const flags = (label: string, bits: readonly Bit[], help?: string): ParamDef => ({ label, kind: 'flags', bits, ...(help ? { help } : {}) });
export const choice = (label: string, options: readonly Choice[], help?: string): ParamDef => ({ label, kind: 'enum', options, ...(help ? { help } : {}) });

/** The two ends of a timer or a range: `ms('...')` marked as the lower or the upper one */
export const lo = (p: ParamDef): ParamDef => ({ ...p, pair: 'min' });
export const hi = (p: ParamDef): ParamDef => ({ ...p, pair: 'max' });

/** Four timer parameters: when it first fires, then how often it repeats (both as a random time between two values) */
export const timers = (first = 'First fire', repeat = 'Repeat'): ParamDef[] => [
  lo(ms(`${first}: at least`, undefined, 'Milliseconds. The event first fires at a random time between this and the next value.')),
  hi(ms(`${first}: at most`)),
  lo(ms(`${repeat}: at least`, 'never', 'Milliseconds. After firing it fires again after a random time between this and the next value.')),
  hi(ms(`${repeat}: at most`)),
];

/** Two cooldown parameters */
export const cooldown = (): ParamDef[] => [
  lo(ms('Cooldown: at least', undefined, 'Milliseconds before it can fire again; a random time between the two values.')),
  hi(ms('Cooldown: at most')),
];

/** Two repeat parameters */
export const repeat = (): ParamDef[] => [lo(ms('Repeat: at least', 'never')), hi(ms('Repeat: at most'))];
