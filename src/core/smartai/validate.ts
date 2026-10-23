import { EVENT_FLAGS_ALL, PHASE_MASK_ALL, sourceBit, typeOf } from './catalogue';
import { EVENT_LINK, SOURCE_TIMED_LIST, numberOf, ownerKey, textOf, type SmartRow } from './row';
import type { ParamDef, ParamKind, TypeDef } from './types';

/** Problems a script row has, in words, found before the server would log them at startup. */

export interface Issue {
  /** The row's `entryorguid/source_type/id`, or null for a problem of the whole set */
  row: string | null;
  /** The column the problem is in, when it is one */
  column?: string;
  level: 'error' | 'warning';
  message: string;
}

export interface ValidateContext {
  /** Whether the database has the thing: true, false, or undefined when it cannot tell */
  exists?: (kind: ParamKind, id: number) => boolean | undefined;
  /** Text groups the owner's `creature_text` has, when known */
  textGroups?: ReadonlySet<number>;
  /** Action lists that exist outside the rows being checked (other owners' lists) */
  foreignLists?: ReadonlySet<number>;
}

const COMMENT_MAX = 255;
const EXISTENCE_KINDS: ReadonlySet<ParamKind> = new Set(['spell', 'creature', 'gameobject', 'item', 'quest']);
const KIND_WORD: Partial<Record<ParamKind, string>> = { spell: 'spell', creature: 'creature', gameobject: 'object', item: 'item', quest: 'quest' };

const place = (row: Readonly<SmartRow>): string => `${numberOf(row, 'entryorguid')}/${numberOf(row, 'source_type')}/${numberOf(row, 'id')}`;

function checkParams(out: Issue[], row: Readonly<SmartRow>, def: TypeDef, prefix: string, count: number, ctx: ValidateContext): void {
  const key = place(row);
  const values = Array.from({ length: count }, (_, i) => numberOf(row, `${prefix}${i + 1}`));
  def.params.forEach((p: ParamDef, i) => {
    const value = values[i] ?? 0;
    const column = `${prefix}${i + 1}`;
    if (EXISTENCE_KINDS.has(p.kind) && value > 0 && ctx.exists?.(p.kind, value) === false) {
      out.push({ row: key, column, level: 'warning', message: `${p.label}: the database has no ${KIND_WORD[p.kind]} ${value}.` });
    }
    if (p.kind === 'bool' && value !== 0 && value !== 1) out.push({ row: key, column, level: 'error', message: `${p.label} must be 0 or 1.` });
    if (p.kind === 'enum' && p.options && !p.options.some(([v]) => v === value)) {
      out.push({ row: key, column, level: 'warning', message: `${p.label}: ${value} is not one of ${p.options.map(([v, l]) => `${v} (${l})`).join(', ')}.` });
    }
    if (p.kind === 'phaseMask' && (value < 0 || value > PHASE_MASK_ALL)) out.push({ row: key, column, level: 'error', message: `${p.label}: phases go from 1 to 12.` });
    if (p.kind === 'phase' && (value < 0 || value > 12)) out.push({ row: key, column, level: 'error', message: `${p.label}: the phase must be from 1 to 12.` });
    if (p.kind === 'pct' && (value < 0 || value > 100) && def.id !== 42) out.push({ row: key, column, level: 'warning', message: `${p.label}: ${value} is not between 0 and 100.` });
    if (p.pair === 'min') {
      const next = def.params[i + 1];
      if (next?.pair === 'max' && value > (values[i + 1] ?? 0) && (values[i + 1] ?? 0) !== 0) {
        out.push({ row: key, column, level: 'error', message: `${p.label} is more than ${next.label.toLowerCase()}.` });
      }
    }
  });
  for (let i = def.params.length; i < count; i += 1) {
    if ((values[i] ?? 0) !== 0) out.push({ row: key, column: `${prefix}${i + 1}`, level: 'warning', message: `${def.name} does not use parameter ${i + 1}, so ${values[i]} here is ignored.` });
  }
}

/**
 * Checks the rows of one owner's scripts and its action lists. Errors are what the server refuses to
 * load; warnings are what it loads but probably is not what was meant.
 */
export function validateRows(rows: readonly SmartRow[], ctx: ValidateContext = {}): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  const ids = new Set(rows.map((r) => `${ownerKey(r)}/${numberOf(r, 'id')}`));
  const linkedTo = new Map<string, number>();
  for (const r of rows) {
    const link = numberOf(r, 'link');
    if (link > 0) linkedTo.set(`${ownerKey(r)}/${link}`, (linkedTo.get(`${ownerKey(r)}/${link}`) ?? 0) + 1);
  }
  const lists = new Set<number>(ctx.foreignLists);
  for (const r of rows) if (numberOf(r, 'source_type') === SOURCE_TIMED_LIST) lists.add(numberOf(r, 'entryorguid'));

  for (const row of rows) {
    const key = place(row);
    const source = numberOf(row, 'source_type');
    const full = `${key}/${numberOf(row, 'link')}`;
    if (seen.has(full)) out.push({ row: key, level: 'error', message: 'Another row has the same id and link in this script; the database can only hold one.' });
    seen.add(full);

    const event = typeOf('event', numberOf(row, 'event_type'));
    const action = typeOf('action', numberOf(row, 'action_type'));
    const target = typeOf('target', numberOf(row, 'target_type'));
    if (!event) out.push({ row: key, column: 'event_type', level: 'error', message: `There is no event type ${numberOf(row, 'event_type')}.` });
    if (!action) out.push({ row: key, column: 'action_type', level: 'error', message: `There is no action type ${numberOf(row, 'action_type')}.` });
    if (!target) out.push({ row: key, column: 'target_type', level: 'error', message: `There is no target type ${numberOf(row, 'target_type')}.` });
    if (event) {
      if (source >= 0 && source < 10 && event.sources !== undefined && (event.sources & sourceBit(source)) === 0) {
        out.push({ row: key, column: 'event_type', level: 'error', message: `"${event.name}" cannot be used in this kind of script.` });
      }
      checkParams(out, row, event, 'event_param', 6, ctx);
    }
    if (action) {
      checkParams(out, row, action, 'action_param', 6, ctx);
      if (action.hidden) out.push({ row: key, column: 'action_type', level: 'warning', message: `"${action.name}" is not supported on a 3.3.5a server or can crash it.` });
    }
    if (target) {
      checkParams(out, row, target, 'target_param', 4, ctx);
      if (target.position && ['x', 'y', 'z'].every((c) => numberOf(row, `target_${c}`) === 0) && target.id === 8) {
        out.push({ row: key, column: 'target_x', level: 'warning', message: 'The target is a position but its coordinates are all 0.' });
      }
    }

    const mask = numberOf(row, 'event_phase_mask');
    if (mask < 0 || mask > PHASE_MASK_ALL) out.push({ row: key, column: 'event_phase_mask', level: 'error', message: 'The phase mask can only name phases 1 to 12 (up to 4095).' });
    const chance = numberOf(row, 'event_chance');
    if (chance < 0 || chance > 100) out.push({ row: key, column: 'event_chance', level: 'error', message: 'The chance must be from 0 to 100.' });
    else if (chance === 0) out.push({ row: key, column: 'event_chance', level: 'warning', message: 'A chance of 0 means the event never fires.' });
    const flags = numberOf(row, 'event_flags');
    if (flags < 0 || (flags & ~EVENT_FLAGS_ALL) !== 0) out.push({ row: key, column: 'event_flags', level: 'error', message: 'These event flags include a bit the server does not know.' });
    if (textOf(row, 'comment').length > COMMENT_MAX) out.push({ row: key, column: 'comment', level: 'error', message: `The comment is longer than ${COMMENT_MAX} characters.` });

    const link = numberOf(row, 'link');
    if (link > 0) {
      if (link === numberOf(row, 'id')) out.push({ row: key, column: 'link', level: 'error', message: 'A row cannot link to itself.' });
      else if (!ids.has(`${ownerKey(row)}/${link}`)) out.push({ row: key, column: 'link', level: 'error', message: `It links to row ${link}, which this script does not have.` });
    }
    const isLink = numberOf(row, 'event_type') === EVENT_LINK;
    const referenced = (linkedTo.get(key) ?? 0) > 0;
    if (isLink && !referenced) out.push({ row: key, column: 'event_type', level: 'warning', message: 'Nothing links to this row, so it never runs.' });
    if (referenced && !isLink && source !== SOURCE_TIMED_LIST) out.push({ row: key, column: 'event_type', level: 'warning', message: 'A row that other rows link to should have the event "Right after the previous row"; otherwise it also fires on its own.' });
    if ((linkedTo.get(key) ?? 0) > 1) out.push({ row: key, level: 'warning', message: `${linkedTo.get(key)} rows link to this row.` });

    const act = numberOf(row, 'action_type');
    if (act === 80 && numberOf(row, 'action_param1') > 0 && !lists.has(numberOf(row, 'action_param1'))) {
      out.push({ row: key, column: 'action_param1', level: 'warning', message: `Action list ${numberOf(row, 'action_param1')} has no rows here.` });
    }
    if (act === 80 && numberOf(row, 'action_param3') > 1) out.push({ row: key, column: 'action_param3', level: 'error', message: 'Replace the running list must be 0 or 1; the server skips the row otherwise.' });
    if ((act === 1 || act === 84) && ctx.textGroups && !ctx.textGroups.has(numberOf(row, 'action_param1')) && source !== SOURCE_TIMED_LIST) {
      out.push({ row: key, column: 'action_param1', level: 'warning', message: `The creature has no text group ${numberOf(row, 'action_param1')} in creature_text.` });
    }
  }

  return out;
}

