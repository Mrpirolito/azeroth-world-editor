import { useState } from 'react';
import type { Row } from '@core/tables/types';
import { useApi } from '../state/names';

const short = (text: string | null | undefined, n = 90): string => {
  const one = (text ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};

/**
 * The one way to take a line the game already has: search the broadcast texts (the client's own translated lines) by words or
 * id and hand the chosen row to whoever asked. Creature text, gossip texts and menu greetings all use it.
 */
export function TextPicker({ label = 'Take a line the game has', onPick }: { label?: string; onPick(row: Row): void }): React.JSX.Element {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [found, setFound] = useState<Row[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const search = (): void => {
    void api?.searchTable('broadcast_text', text).then((r) => {
      setProblem(r.ok ? null : r.error.message);
      setFound(r.ok ? r.value.rows : null);
    });
  };
  if (!open) {
    return <button type="button" className="btn btn--small" disabled={!api} onClick={() => setOpen(true)}>{label}</button>;
  }
  return (
    <div className="text-picker" role="group" aria-label={label}>
      <div className="scene-row">
        <label className="scene-field">
          <span>Search the game&apos;s texts</span>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} />
        </label>
        <button type="button" className="btn" disabled={text.trim() === ''} onClick={search}>Search</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
      </div>
      {problem && <p role="alert" className="control__alert">{problem}</p>}
      {found && found.length === 0 && <p className="scene-hint">Nothing found.</p>}
      {found && found.length > 0 && (
        <ul className="tables-dialog__results" aria-label="Texts found">
          {found.map((row) => (
            <li key={row.ID}>
              <button type="button" className="btn" onClick={() => { onPick(row); setOpen(false); setFound(null); }}>
                {row.ID} · {short(row.MaleText || row.FemaleText)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
