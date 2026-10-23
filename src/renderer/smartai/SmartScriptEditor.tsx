import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefKind } from '@core/db/types';
import { typeOf } from '@core/smartai/catalogue';
import type { NameLookup } from '@core/smartai/format';
import type { TextLine } from '@core/smartai/read';
import {
  SOURCE_TIMED_LIST, addCard, addList, addListRow, addStep, cardsOf, numberOf, ownersOf, removeRow, rowKey, rowsOfOwner, type ScriptOwner, type SmartRow,
} from '@core/smartai/row';
import type { ParamKind } from '@core/smartai/types';
import { validateRows, type Issue } from '@core/smartai/validate';
import { useApi } from '../state/names';
import { RowEditor } from './RowEditor';
import { ScriptSearchPanel } from './ScriptSearch';
import './smartai.css';

export interface ScriptOwnerFacts {
  kind: 'creature' | 'gameobject';
  entry: number;
  name: string;
}

/** The kinds whose values name a row of the database, so a missing one is worth a warning */
const NAMED: readonly ParamKind[] = ['spell', 'creature', 'gameobject', 'item', 'quest'];

/**
 * What the rows name in the database: names for the sentences, and whether each creature, object,
 * item and quest exists. Spells are only named: the spell list is a client file, so a spell
 * it does not know may still be real.
 */
function useReferences(rows: readonly SmartRow[]): { names: NameLookup; exists(kind: ParamKind, id: number): boolean | undefined } {
  const api = useApi();
  const [found, setFound] = useState<{ names: ReadonlyMap<string, string>; missing: ReadonlySet<string> }>({ names: new Map(), missing: new Set() });
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!api) return;
    const want = new Map<ParamKind, Set<number>>();
    for (const row of rows) {
      for (const kind of ['event', 'action', 'target'] as const) {
        const def = typeOf(kind, numberOf(row, `${kind}_type`));
        def?.params.forEach((p, i) => {
          const id = numberOf(row, `${kind}_param${i + 1}`);
          if (!NAMED.includes(p.kind) || id <= 0 || asked.current.has(`${p.kind}:${id}`)) return;
          asked.current.add(`${p.kind}:${id}`);
          if (!want.has(p.kind)) want.set(p.kind, new Set());
          want.get(p.kind)!.add(id);
        });
      }
    }
    for (const [kind, ids] of want) {
      const list = [...ids];
      void api.lookupNames(kind as RefKind, list).then((res) => {
        if (!res.ok) return;
        setFound((prev) => {
          const names = new Map(prev.names);
          const missing = new Set(prev.missing);
          for (const id of list) {
            if (Object.prototype.hasOwnProperty.call(res.value, id)) names.set(`${kind}:${id}`, res.value[id]!);
            else missing.add(`${kind}:${id}`);
          }
          return { names, missing };
        });
      });
    }
  }, [api, rows]);
  return useMemo(() => ({
    names: (kind, id) => found.names.get(`${kind}:${id}`),
    exists: (kind, id) => (kind === 'spell' ? undefined : found.names.has(`${kind}:${id}`) ? true : found.missing.has(`${kind}:${id}`) ? false : undefined),
  }), [found]);
}

const ownerLabel = (o: ScriptOwner, main: ScriptOwnerFacts): string =>
  o.sourceType === SOURCE_TIMED_LIST ? `Action list ${o.entryorguid}` : o.entryorguid < 0 ? `Spawn ${-o.entryorguid}` : main.name.trim() || `${main.kind === 'creature' ? 'NPC' : 'Object'} ${main.entry}`;

/**
 * The SmartAI editor for one creature or object: its rows as ordered cards, "When ... do ... on ...",
 * each with a sentence, named fields and pickers, and linked rows chained under the card. The rows,
 * its spawn scripts and its action lists are tabs. `rows` is every row of the owner and `onChange`
 * hands back the whole new list.
 */
export function SmartScriptEditor({
  owner, rows, onChange, readOnlyReason,
}: {
  owner: ScriptOwnerFacts;
  rows: readonly SmartRow[];
  onChange(rows: SmartRow[]): void;
  readOnlyReason?: string;
}): React.JSX.Element {
  const api = useApi();
  const source = owner.kind === 'creature' ? 0 : 1;
  const [texts, setTexts] = useState<TextLine[] | null>(null);
  const [selected, setSelected] = useState(`${owner.entry}/${source}`);
  const refs = useReferences(rows);

  useEffect(() => {
    let live = true;
    if (!api) return undefined;
    void api.smartScripts(owner.kind, owner.entry).then((res) => {
      if (live) setTexts(res.ok ? res.value.texts : null);
    });
    return () => {
      live = false;
    };
  }, [api, owner.kind, owner.entry]);

  const owners = useMemo(() => {
    const main: ScriptOwner = { entryorguid: owner.entry, sourceType: source };
    const rest = ownersOf(rows).filter((o) => !(o.entryorguid === main.entryorguid && o.sourceType === main.sourceType));
    return [main, ...rest];
  }, [rows, owner.entry, source]);
  const current = owners.find((o) => `${o.entryorguid}/${o.sourceType}` === selected) ?? owners[0]!;
  const scriptRows = rowsOfOwner(rows, current.entryorguid, current.sourceType);
  const cards = cardsOf(scriptRows);

  const issues = useMemo(
    () => validateRows(rows, { exists: refs.exists, ...(owner.kind === 'creature' && texts ? { textGroups: new Set(texts.map((t) => t.group)) } : {}) }),
    [rows, refs, owner.kind, texts],
  );
  const issuesOf = (row: SmartRow): Issue[] => issues.filter((i) => i.row === `${numberOf(row, 'entryorguid')}/${numberOf(row, 'source_type')}/${numberOf(row, 'id')}`);
  const countIn = (o: ScriptOwner): number => issues.filter((i) => i.level === 'error' && i.row?.startsWith(`${o.entryorguid}/${o.sourceType}/`)).length;
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.length - errors;
  const ctx = { texts: texts ?? [], disabled: readOnlyReason !== undefined };

  const select = (o: ScriptOwner): void => setSelected(`${o.entryorguid}/${o.sourceType}`);
  const openList = (id: number): void => {
    if (!rows.some((r) => numberOf(r, 'entryorguid') === id && numberOf(r, 'source_type') === SOURCE_TIMED_LIST)) onChange(addList(rows, id).rows);
    setSelected(`${id}/${SOURCE_TIMED_LIST}`);
  };
  const newList = (): void => {
    const used = new Set(rows.filter((r) => numberOf(r, 'source_type') === SOURCE_TIMED_LIST).map((r) => numberOf(r, 'entryorguid')));
    let id = owner.entry * 100;
    while (used.has(id)) id += 1;
    openList(id);
  };

  return (
    <fieldset className="sai-editor" disabled={readOnlyReason !== undefined}>
      <legend className="sai-editor__legend">SmartAI script</legend>
      {readOnlyReason && <p className="scene-hint">{readOnlyReason}</p>}
      <p className="sai-summary" role="status">
        {rows.length} {rows.length === 1 ? 'row' : 'rows'} in {owners.length} {owners.length === 1 ? 'script' : 'scripts'}
        {errors > 0 && <span className="sai-summary__errors">{` · ${errors} ${errors === 1 ? 'error' : 'errors'}`}</span>}
        {warnings > 0 && <span className="sai-summary__warnings">{` · ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`}</span>}
        {errors + warnings === 0 && rows.length > 0 && ' · no problems found'}
      </p>
      <div role="tablist" aria-label="Scripts" className="sai-tabs">
        {owners.map((o) => {
          const on = o === current;
          const bad = countIn(o);
          return (
            <button key={`${o.entryorguid}/${o.sourceType}`} type="button" role="tab" aria-selected={on} className={`sai-tab${on ? ' sai-tab--on' : ''}`} onClick={() => select(o)}>
              {ownerLabel(o, owner)}{bad > 0 && <span className="sai-tab__bad">{` (${bad} ${bad === 1 ? 'error' : 'errors'})`}</span>}
            </button>
          );
        })}
      </div>
      {current.sourceType === SOURCE_TIMED_LIST && (
        <p className="scene-hint">An action list runs its rows in order of their timers: each row waits the time in its event, counted from when the list started.</p>
      )}
      {cards.length === 0 && <p className="scene-hint">{current.sourceType === SOURCE_TIMED_LIST ? 'This action list has no rows.' : 'This script has no rows yet. A card says what happens when something happens to it.'}</p>}
      {cards.map((card, n) => (
        <article key={rowKey(card.rows[0]!)} className="sai-card" aria-label={`Card ${n + 1}`}>
          <h3 className="sai-card__title">{current.sourceType === SOURCE_TIMED_LIST ? `Step ${n + 1}` : `Card ${n + 1}`}</h3>
          {card.rows.map((row, i) => (
            <div key={rowKey(row)}>
              {i > 0 && <div className="sai-card__chain" aria-hidden="true">↓ then</div>}
              <RowEditor
                row={row} idPrefix={`sai-${rowKey(row)}`} source={current.sourceType} ctx={ctx} names={refs.names} issues={issuesOf(row)}
                removeLabel={card.rows.length === 1 ? 'Remove card' : 'Remove step'}
                onChange={(next) => onChange(rows.map((r) => (r === row ? next : r)))}
                onRemove={() => onChange(removeRow(rows, row))}
                onOpenList={openList}
              />
            </div>
          ))}
          <button type="button" className="btn btn--small" onClick={() => onChange(addStep(rows, card.rows[card.rows.length - 1]!).rows)}>
            {current.sourceType === SOURCE_TIMED_LIST ? 'Add a step' : 'Then do something else'}
          </button>
        </article>
      ))}
      <div className="sai-add">
        {current.sourceType !== SOURCE_TIMED_LIST && <button type="button" className="btn" onClick={() => onChange(addCard(rows, current.entryorguid, current.sourceType).rows)}>Add card</button>}
        {current.sourceType === SOURCE_TIMED_LIST && <button type="button" className="btn" onClick={() => onChange(addListRow(rows, current.entryorguid).rows)}>Add step</button>}
        {current.sourceType !== SOURCE_TIMED_LIST && current.entryorguid > 0 && <button type="button" className="btn" onClick={newList}>Add action list</button>}
      </div>
      <details className="sai-find">
        <summary>Find scripts that use something</summary>
        <ScriptSearchPanel entry={owner.entry} entryLabel={owner.name.trim() || undefined} />
      </details>
    </fieldset>
  );
}

