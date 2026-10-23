import { toScriptRow } from '../links/context';
import { typeOf } from './catalogue';
import { phasesOf, say, type NameLookup } from './format';
import { describeEvent } from './ids';
import { numberOf, type SmartRow } from './row';

/** One row of a script in the words a person reads it in: "When ... , do ... , on ...". */
export interface RowSentence {
  /** What fires it, e.g. "when it dies" */
  when: string;
  /** Extra conditions on the event: the phase, the chance, once only */
  only: string[];
  /** What it does, e.g. "cast Frostbolt (116)" */
  does: string;
  /** Who it is done to, e.g. "its current target"; empty when the action needs nobody */
  on: string;
}

const column = (row: Readonly<SmartRow>, prefix: string, count: number): number[] => Array.from({ length: count }, (_, i) => numberOf(row, `${prefix}${i + 1}`));

/** Whether the action leaves it to `target_type`: an action with no parameters and no target needs none shown */
const NO_TARGET_ACTIONS: ReadonlySet<number> = new Set([0, 24, 27, 65, 72, 77, 78, 224, 234, 206, 203, 222]);

export function describeRow(row: Readonly<SmartRow>, names?: NameLookup): RowSentence {
  const eventType = numberOf(row, 'event_type');
  const actionType = numberOf(row, 'action_type');
  const targetType = numberOf(row, 'target_type');
  const eventParams = column(row, 'event_param', 6);
  const when = typeOf('event', eventType) ? say('event', eventType, eventParams, names) : describeEvent(toScriptRow(row));
  const only: string[] = [];
  const phases = phasesOf(numberOf(row, 'event_phase_mask'));
  if (phases.length > 0) only.push(`in phase ${phases.join(' or ')}`);
  const chance = numberOf(row, 'event_chance');
  if (chance < 100) only.push(`${chance}% of the time`);
  if (numberOf(row, 'event_flags') & 1) only.push('only once');
  const does = typeOf('action', actionType) ? say('action', actionType, column(row, 'action_param', 6), names) : `do action ${actionType}`;
  const target = typeOf('target', targetType);
  const on = !target ? `target ${targetType}` : targetType === 0 || (NO_TARGET_ACTIONS.has(actionType) && targetType <= 1) ? '' : say('target', targetType, column(row, 'target_param', 4), names);
  return { when, only, does, on };
}

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The whole row as one line */
export function sentenceOf(row: Readonly<SmartRow>, names?: NameLookup): string {
  const s = describeRow(row, names);
  const head = numberOf(row, 'event_type') === 61 ? 'Then' : capitalize(s.when);
  const only = s.only.length > 0 ? ` (${s.only.join(', ')})` : '';
  return `${head}${only}: ${s.does}${s.on ? `, on ${s.on}` : ''}`;
}
