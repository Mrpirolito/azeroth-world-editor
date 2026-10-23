/**
 * What a SmartAI type (an event, an action or a target) is made of, for an editor and a validator:
 * its name, what each parameter means and what picker suits it. Pure data; the values come from
 * AzerothCore's `SmartScriptMgr.h`, the wording is this project's own.
 */

export type ParamKind =
  | 'int'
  | 'ms'
  | 'sec'
  | 'pct'
  | 'yards'
  | 'bool'
  | 'spell'
  | 'creature'
  | 'gameobject'
  | 'item'
  | 'quest'
  | 'textGroup'
  | 'emote'
  | 'sound'
  | 'faction'
  | 'map'
  | 'area'
  | 'gameEvent'
  | 'phase'
  | 'phaseMask'
  | 'flags'
  | 'enum'
  | 'actionList'
  | 'areatrigger'
  | 'gossipMenu';

/** One named choice of an `enum` parameter */
export type Choice = readonly [value: number, label: string];

/** One named bit of a `flags` parameter */
export interface Bit {
  value: number;
  label: string;
  help?: string;
}

export interface ParamDef {
  label: string;
  kind: ParamKind;
  help?: string;
  /** What 0 means when it is a special value ("any spell", "forever"); shown instead of a bare 0 */
  zero?: string;
  options?: readonly Choice[];
  bits?: readonly Bit[];
  /** Marks one side of a min/max pair, so a validator can check the order */
  pair?: 'min' | 'max';
}

/** `SmartScriptType` bit masks: which kinds of script an event can run in */
export const SOURCE_MASK = {
  creature: 1,
  gameobject: 2,
  areatrigger: 4,
  event: 8,
  gossip: 16,
  quest: 32,
  spell: 64,
  transport: 128,
  instance: 256,
  timedList: 512,
  any: 1023,
} as const;

export interface TypeDef {
  id: number;
  /** The SmartAI constant without its prefix: `UPDATE_IC`, `CAST`, `HOSTILE_RANDOM` */
  key: string;
  /** Short name for a dropdown */
  name: string;
  /** One or two sentences on what it does and when to use it */
  help: string;
  /** The parameters it reads, in column order; columns past the end are unused */
  params: readonly ParamDef[];
  /** The type as part of a sentence, with `{1}` .. `{6}` for the parameters */
  say: string;
  /** Events only: the script kinds it works in (`SOURCE_MASK`); all when absent */
  sources?: number;
  /** Targets only: it reads `target_x/y/z/o` */
  position?: boolean;
  /** Left out of the pickers for new rows (unsupported on 3.3.5a, or dangerous), but still read and kept */
  hidden?: boolean;
}

export type TypeKind = 'event' | 'action' | 'target';
