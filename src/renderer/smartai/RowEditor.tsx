import { COLUMNS, EVENT_FLAG_BITS, PHASE_BITS, sourceBit, typeOf } from '@core/smartai/catalogue';
import { capitalize, describeRow } from '@core/smartai/describe';
import type { NameLookup } from '@core/smartai/format';
import { numberOf, paramsOf, withColumn, withParam, withType, type SmartRow } from '@core/smartai/row';
import type { Issue } from '@core/smartai/validate';
import type { TypeDef, TypeKind } from '@core/smartai/types';
import { NumberField } from '../scripts/fields';
import { BitToggles, ParamField, type FieldContext } from './ParamField';
import { TypePicker } from './TypePicker';
import { SMART_EVENT_SOURCE } from '@core/conditions/catalogue';
import type { RowSet } from '@core/tables/types';
import { ConditionsDetails } from '../tables/ConditionsEditor';

const LIST_ACTIONS: ReadonlySet<number> = new Set([80, 87, 88]);

/** The action list ids an action row calls */
function calledLists(row: Readonly<SmartRow>): number[] {
  const type = numberOf(row, 'action_type');
  const p = paramsOf(row, 'action');
  if (type === 80) return p[0]! > 0 ? [p[0]!] : [];
  if (type === 87) return [...new Set(p.filter((n) => n > 0))];
  if (type === 88) return p[0]! > 0 && p[1]! >= p[0]! && p[1]! - p[0]! < 20 ? Array.from({ length: p[1]! - p[0]! + 1 }, (_, i) => p[0]! + i) : [];
  return [];
}

function Column({ kind, title, row, idPrefix, onChange, ctx, source }: {
  kind: TypeKind; title: string; row: SmartRow; idPrefix: string; onChange(row: SmartRow): void; ctx: FieldContext; source: number;
}): React.JSX.Element {
  const typeColumn = `${kind}_type`;
  const def = typeOf(kind, numberOf(row, typeColumn));
  const params = paramsOf(row, kind);
  const allowed = kind === 'event' ? (t: TypeDef) => t.sources === undefined || (t.sources & sourceBit(source)) !== 0 : undefined;
  return (
    <section className={`sai-col sai-col--${kind}`} aria-label={title}>
      <h4 className="sai-col__title">{title}</h4>
      <TypePicker kind={kind} label={capitalize(kind)} value={numberOf(row, typeColumn)} onChange={(id) => onChange(withType(row, kind, id))} allowed={allowed} disabled={ctx.disabled} />
      {def?.params.map((p, i) => (
        <ParamField key={`${numberOf(row, typeColumn)}-${i}`} id={`${idPrefix}-${kind}-${i}`} def={p} value={params[i] ?? 0} onChange={(v) => onChange(withParam(row, kind, i, v))} ctx={ctx} />
      ))}
      {def?.position && (
        <div className="sai-pos">
          {(['x', 'y', 'z', 'o'] as const).map((c) => (
            <NumberField key={c} label={c.toUpperCase()} value={numberOf(row, `target_${c}`)} onChange={(v) => onChange(withColumn(row, `target_${c}`, v))} disabled={ctx.disabled} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One SmartAI row as "When ... do ... on ...": a plain sentence on top, the three parts as labelled
 * fields, the phase, chance and flags folded in one place and every raw column folded in another.
 */
export function RowEditor({
  row, idPrefix, source, ctx, names, issues, onChange, onRemove, onOpenList, removeLabel, owner,
}: {
  /** Who owns the script, so the conditions of its events leave with it */
  owner?: RowSet['owner'];
  row: SmartRow;
  idPrefix: string;
  /** The script's `source_type`, which decides which events fit */
  source: number;
  ctx: FieldContext;
  names: NameLookup;
  issues: readonly Issue[];
  onChange(row: SmartRow): void;
  onRemove(): void;
  onOpenList(id: number): void;
  removeLabel: string;
}): React.JSX.Element {
  const sentence = describeRow(row, names);
  const link = numberOf(row, 'event_type') === 61;
  const phases = numberOf(row, 'event_phase_mask');
  const summary = [phases === 0 ? 'any phase' : PHASE_BITS.filter((b) => phases & b.value).map((b) => b.label.toLowerCase()).join(', '), `${numberOf(row, 'event_chance')}% chance`, numberOf(row, 'event_flags') !== 0 ? 'flags set' : null].filter(Boolean).join(' · ');
  const lists = LIST_ACTIONS.has(numberOf(row, 'action_type')) ? calledLists(row) : [];
  return (
    <div className="sai-row">
      <p className="sai-row__sentence">
        <strong>{link ? 'Then' : capitalize(sentence.when)}</strong>
        {sentence.only.length > 0 && <span className="sai-row__only"> ({sentence.only.join(', ')})</span>}
        {' → '}{sentence.does}
        {sentence.on && <>{' → on '}{sentence.on}</>}
      </p>
      <div className="sai-row__cols">
        <Column kind="event" title={link ? 'Then' : 'When'} row={row} idPrefix={idPrefix} onChange={onChange} ctx={ctx} source={source} />
        <Column kind="action" title="Do" row={row} idPrefix={idPrefix} onChange={onChange} ctx={ctx} source={source} />
        <Column kind="target" title="On" row={row} idPrefix={idPrefix} onChange={onChange} ctx={ctx} source={source} />
      </div>
      {lists.length > 0 && (
        <div className="sai-row__lists">
          {lists.map((id) => <button key={id} type="button" className="btn btn--small" onClick={() => onOpenList(id)}>{`Open action list ${id}`}</button>)}
        </div>
      )}
      <details className="sai-row__more">
        <summary>Phase, chance and flags <span className="sai-row__summary">{summary}</span></summary>
        <BitToggles label="Only in these script phases (none: any)" bits={PHASE_BITS} value={phases} onChange={(v) => onChange(withColumn(row, 'event_phase_mask', v))} disabled={ctx.disabled} />
        <NumberField label="Chance it fires (%)" value={numberOf(row, 'event_chance')} min={0} onChange={(v) => onChange(withColumn(row, 'event_chance', v))} disabled={ctx.disabled} />
        <BitToggles label="Event flags" bits={EVENT_FLAG_BITS} value={numberOf(row, 'event_flags')} onChange={(v) => onChange(withColumn(row, 'event_flags', v))} disabled={ctx.disabled} />
      </details>
      {!ctx.disabled && (
        <ConditionsDetails source={{ type: SMART_EVENT_SOURCE, group: numberOf(row, 'id') + 1, entry: numberOf(row, 'entryorguid'), id: numberOf(row, 'source_type') }} owner={owner} idPrefix={idPrefix} label="Only runs when" />
      )}
      <details className="sai-row__adv">
        <summary>Advanced: the raw columns</summary>
        <div className="sai-adv">
          {COLUMNS.map((c) => (
            <label key={c} className="sai-adv__field">
              <span>{c}</span>
              <input type="text" value={row[c] ?? ''} disabled={ctx.disabled} onChange={(e) => onChange(withColumn(row, c, e.target.value))} />
            </label>
          ))}
        </div>
      </details>
      {issues.length > 0 && (
        <ul className="sai-issues" aria-label="Problems with this row">
          {issues.map((issue, i) => <li key={i} className={`sai-issue sai-issue--${issue.level}`}>{issue.level === 'error' ? 'Error: ' : 'Warning: '}{issue.message}</li>)}
        </ul>
      )}
      <div className="sai-row__actions">
        <button type="button" className="btn btn--small btn--danger" disabled={ctx.disabled} onClick={onRemove}>{removeLabel}</button>
      </div>
    </div>
  );
}
