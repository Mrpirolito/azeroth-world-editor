import { useState } from 'react';
import type { ScriptHit, ScriptSearch as Query } from '@core/smartai/search';
import { typeName } from '@core/smartai/catalogue';
import { SpellField } from '../combat/SpellField';
import { EntityField, NumberField, SelectField } from '../scripts/fields';
import { useApi } from '../state/names';
import { TypePicker } from './TypePicker';

type What = 'action' | 'event' | 'spell' | 'creature' | 'gameobject' | 'quest' | 'item' | 'textGroup';

const WHAT: readonly (readonly [What, string])[] = [
  ['action', 'an action'],
  ['event', 'an event'],
  ['spell', 'a spell'],
  ['creature', 'a creature'],
  ['gameobject', 'an object'],
  ['quest', 'a quest'],
  ['item', 'an item'],
  ['textGroup', 'a text group'],
];

/**
 * "Who uses this?": finds the script rows in the database that run an action, fire on an event or
 * name a spell, creature, object, quest, item or text group, so a change can be judged before it is made.
 */
export function ScriptSearchPanel({ entry, entryLabel }: { entry?: number; entryLabel?: string }): React.JSX.Element {
  const api = useApi();
  const [what, setWhat] = useState<What>('action');
  const [value, setValue] = useState(1);
  const [onlyHere, setOnlyHere] = useState(false);
  const [result, setResult] = useState<{ hits: ScriptHit[]; capped: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (): Promise<void> => {
    if (!api) return;
    setBusy(true);
    setError(null);
    const query: Query = { [what]: value, ...(onlyHere && entry !== undefined ? { entry } : {}) };
    const answer = await api.searchSmartScripts(query);
    setBusy(false);
    if (answer.ok) setResult(answer.value);
    else {
      setResult(null);
      setError(answer.error.message);
    }
  };

  const picker = ((): React.ReactNode => {
    switch (what) {
      case 'action':
      case 'event':
        return <TypePicker kind={what} label={what === 'action' ? 'Action' : 'Event'} value={value} onChange={setValue} />;
      case 'spell':
        return <SpellField id="sai-search-spell" label="Spell" value={value} onChange={(id) => setValue(id)} />;
      case 'textGroup':
        return <NumberField label="Text group" value={value} onChange={setValue} min={0} />;
      default:
        return <EntityField id={`sai-search-${what}`} label={what === 'gameobject' ? 'Object' : what === 'creature' ? 'Creature' : what === 'quest' ? 'Quest' : 'Item'} kind={what} value={value} onChange={setValue} />;
    }
  })();

  return (
    <div className="sai-search">
      <SelectField label="Find the scripts that use" value={what} options={WHAT} onChange={(next) => { setWhat(next); setValue(next === 'action' || next === 'event' ? 1 : 0); setResult(null); }} />
      {picker}
      {entry !== undefined && (
        <label className="scene-field scene-field--check">
          <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} />
          <span>{`Only in the scripts of ${entryLabel ?? `entry ${entry}`}`}</span>
        </label>
      )}
      <button type="button" className="btn" disabled={busy || !api} onClick={() => void search()}>{busy ? 'Searching…' : 'Search'}</button>
      {error && <p role="alert" className="scene-hint">{error}</p>}
      {result && (
        <>
          <p className="scene-hint">{result.hits.length === 0 ? 'Nothing in the database uses it.' : `${result.hits.length}${result.capped ? '+' : ''} ${result.hits.length === 1 ? 'row' : 'rows'}${result.capped ? ' (showing the first ones)' : ''}`}</p>
          <ul className="sai-search__hits" aria-label="Scripts found">
            {result.hits.map((h) => (
              <li key={`${h.entryorguid}/${h.sourceType}/${h.id}`}>
                <strong>{h.owner ? `${h.owner.kind === 'creature' ? 'Creature' : 'Object'} ${h.owner.entry}` : `Script ${h.entryorguid}`}</strong>
                {h.sourceType === 9 ? ` · action list ${h.entryorguid}` : h.entryorguid < 0 ? ` · spawn ${-h.entryorguid}` : ''}
                {` · row ${h.id}: `}
                {h.sentence}
                <small>{` (${typeName('event', h.eventType)}, ${typeName('action', h.actionType)})`}</small>
                {h.comment && <small className="sai-search__comment">{` ${h.comment}`}</small>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
