import { CONDITIONS, conditionOf, conditionSentence, TARGETS, valuesOf } from '@core/conditions/catalogue';
import type { Row, RowSet } from '@core/tables/types';
import { ParamField } from '../smartai/ParamField';

import { useRowSet } from './useRowSet';

export interface ConditionSourceRef {
  /** `conditions.SourceTypeOrReferenceId` */
  type: number;
  group: number;
  entry: number;
  /** `conditions.SourceId`: a SmartAI script's source type; 0 elsewhere */
  id?: number;
}

const NO_TEXTS = { texts: [] } as const;


/** A condition as the author reads it, with ids left as numbers (names are on the fields) */
const sayOf = (row: Row): string => conditionSentence(row);

/**
 * The conditions of one thing, as the question the server asks: "applies when ALL of these are true, OR ALL of
 * those". One block is an alternative; its lines all have to hold. Shared by loot rows, gossip options, vendor items
 * and SmartAI events: only the source it is given differs. Changes are kept in the project like any sheet.
 */
export function ConditionsEditor({ source, owner, idPrefix, label = 'Conditions' }: { source: ConditionSourceRef; owner?: RowSet['owner']; idPrefix: string; label?: string }): React.JSX.Element {
  const scope = {
    SourceTypeOrReferenceId: String(source.type), SourceGroup: String(source.group), SourceEntry: String(source.entry), SourceId: String(source.id ?? 0),
  };
  const set = useRowSet('conditions', scope, owner);
  if (!set.usable) return <p className="scene-hint">Open a project connected to the world database to edit conditions.</p>;
  if (set.loading) return <p className="scene-hint">Reading the database…</p>;
  if (!set.exists) return <p className="scene-hint">This database has no conditions table.</p>;

  const rows = set.rows;
  const blank = (group: number): Row => ({
    ...scope, ElseGroup: String(group), ConditionTypeOrReference: '9', ConditionTarget: '0', ConditionValue1: '0', ConditionValue2: '0', ConditionValue3: '0',
    NegativeCondition: '0', ErrorType: '0', ErrorTextId: '0', ScriptName: '', Comment: '',
  });
  const groups = [...new Set(rows.map((r) => Number(r.ElseGroup ?? 0)))].sort((a, b) => a - b);
  const edit = (index: number, patch: Row): void => set.change(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const summary = groups.length === 0
    ? 'No conditions: it always applies.'
    : `Applies when ${groups.map((g) => `(${rows.filter((r) => Number(r.ElseGroup ?? 0) === g).map(sayOf).join(' and ')})`).join(' or ')}.`;

  return (
    <section className="conditions" aria-label={label}>
      <p className="scene-hint conditions__summary">{summary}</p>
      {groups.map((group, gi) => (
        <fieldset key={group} className="conditions__group" aria-label={`Alternative ${gi + 1}`}>
          {groups.length > 1 && <legend className="scene-section__title">{gi === 0 ? 'Either all of' : 'Or all of'}</legend>}
          {rows.map((row, i) => {
            if (Number(row.ElseGroup ?? 0) !== group) return null;
            const type = Number(row.ConditionTypeOrReference ?? 0);
            const def = conditionOf(type);
            const values = valuesOf(row);
            return (
              <div key={i} className="conditions__row">
                <div className="scene-row">
                  <label className="scene-field">
                    <span>Condition</span>
                    <select value={type} aria-label={`Condition ${i + 1}`} onChange={(e) => edit(i, { ConditionTypeOrReference: e.target.value, ConditionValue1: '0', ConditionValue2: '0', ConditionValue3: '0' })}>
                      {!def && <option value={type}>{type < 0 ? `Shared condition ${-type}` : `Unknown (${type})`}</option>}
                      {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="scene-field">
                    <span>Looks at</span>
                    <select value={Number(row.ConditionTarget ?? 0)} aria-label={`Looks at ${i + 1}`} onChange={(e) => edit(i, { ConditionTarget: e.target.value })}>
                      {TARGETS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
                    </select>
                  </label>
                  <label className="scene-field scene-field--check">
                    <input type="checkbox" checked={Number(row.NegativeCondition ?? 0) !== 0} onChange={(e) => edit(i, { NegativeCondition: e.target.checked ? '1' : '0' })} />
                    <span>Must NOT hold</span>
                  </label>
                  <button type="button" className="entry-card__btn entry-card__btn--danger" aria-label={`Remove condition ${i + 1}`} onClick={() => set.change(rows.filter((_, j) => j !== i))}>Remove</button>
                </div>
                {def && <p className="scene-hint">{def.help}</p>}
                <div className="sheet-grid">
                  {def?.params.map((param, n) => (
                    <ParamField key={`${type}-${n}`} id={`${idPrefix}-${i}-v${n + 1}`} def={param} value={values[n]!} onChange={(v) => edit(i, { [`ConditionValue${n + 1}`]: String(v) })} ctx={NO_TEXTS} />
                  ))}
                </div>
                <p className="conditions__says">{sayOf(row)}</p>
                <details className="sheet-advanced">
                  <summary>Advanced</summary>
                  <div className="sheet-grid">
                    {(['ErrorType', 'ErrorTextId'] as const).map((c) => (
                      <label key={c} className="scene-field scene-field--short"><span>{c === 'ErrorType' ? 'Error type' : 'Error text'}</span><input type="number" value={row[c] ?? '0'} onChange={(e) => edit(i, { [c]: String(Number(e.target.value) || 0) })} /></label>
                    ))}
                    <label className="scene-field"><span>C++ script</span><input type="text" value={row.ScriptName ?? ''} onChange={(e) => edit(i, { ScriptName: e.target.value })} /></label>
                    <label className="scene-field"><span>Note</span><input type="text" value={row.Comment ?? ''} onChange={(e) => edit(i, { Comment: e.target.value })} /></label>
                  </div>
                </details>
              </div>
            );
          })}
        </fieldset>
      ))}
      <div className="scene-row">
        <button type="button" className="btn" onClick={() => set.change([...rows, blank(groups.at(-1) ?? 0)])}>{groups.length === 0 ? 'Add a condition' : 'Add a condition (and)'}</button>
        {groups.length > 0 && <button type="button" className="btn" onClick={() => set.change([...rows, blank((groups.at(-1) ?? 0) + 1)])}>Add an alternative (or)</button>}
      </div>
    </section>
  );
}

/**
 * The conditions of one thing folded under a line that says how many there are, for a row of a list (a loot item, a gossip
 * option, a vendor item). Opening it shows the full editor.
 */
export function ConditionsDetails({ source, owner, idPrefix, label = 'Conditions' }: { source: ConditionSourceRef; owner?: RowSet['owner']; idPrefix: string; label?: string }): React.JSX.Element {
  const set = useRowSet('conditions', {
    SourceTypeOrReferenceId: String(source.type), SourceGroup: String(source.group), SourceEntry: String(source.entry), SourceId: String(source.id ?? 0),
  }, owner);
  const n = set.rows.length;
  return (
    <details className="sheet-advanced conditions-details">
      <summary>{label}{n > 0 ? ` (${n})` : ''}</summary>
      <ConditionsEditor source={source} owner={owner} idPrefix={idPrefix} label={`${label} of ${idPrefix}`} />
    </details>
  );
}
