import { useEffect, useRef, useState } from 'react';
import { withRecord } from '@core/dbc/edits';
import { DBC_LAYOUTS, layoutOf, type DbcLayout } from '@core/game/dbc-formats';
import type { DbcRowView } from '@shared/ipc';
import { TextField } from '../scripts/fields';
import { useApi } from '../state/names';
import { useProjectEntities } from '../state/project-entities';
import { useDbcRecord } from './useDbc';
import { Num } from './fields';
import './spells.css';

const STATE_WORD = { file: '', changed: 'edited', new: 'new' } as const;

/** The columns a list shows: the id, the first texts, then the first numbers */
function shownFields(layout: DbcLayout): number[] {
  const texts = layout.fields.flatMap((f, i) => (f.kind === 's' ? [i] : [])).slice(0, 2);
  const numbers = layout.fields.flatMap((f, i) => (i > 0 && f.kind !== 's' && f.kind !== 'x' ? [i] : [])).slice(0, 3);
  return [0, ...texts, ...numbers];
}

/** One record as a form of all its fields, kept in the project as it is changed */
function RecordForm({ layout, id, onPick }: { layout: DbcLayout; id: number; onPick(id: number | null): void }): React.JSX.Element {
  const rec = useDbcRecord(layout.file, id);
  const project = useProjectEntities();
  const api = useApi();
  if (rec.loading) return <p className="scene-hint">Reading the record…</p>;
  if (!rec.values) return <p className="scene-hint">Record {id} is not in {layout.file}.</p>;
  const values = rec.values;
  const set = (i: number, v: number | string): void => rec.set(values.map((x, at) => (at === i ? v : x)));
  return (
    <section className="spell-form" aria-label={`${layout.title} ${id}`}>
      <header className="spell-form__head">
        <div className="spell-form__title">
          <h3>{layout.title}: {id}</h3>
          <div className="scene-hint">{rec.state === 'new' ? 'New, made in this project' : rec.state === 'changed' ? 'Edited in this project' : `As ${layout.file} has it`}</div>
        </div>
        <div className="spell-form__actions">
          <button type="button" className="btn" disabled={!project || !api} onClick={() => {
            if (!api || !project) return;
            void api.dbcFreeId(layout.file).then((r) => {
              if (!r.ok) return;
              const copy = values.map((v, i) => (i === 0 ? r.value.id : v));
              project.setEntities({ ...project.entities, dbcEdits: withRecord(project.entities.dbcEdits, layout.file, r.value.id, copy, null) });
              onPick(r.value.id);
            });
          }}>Copy to a new record</button>
          {rec.state !== 'file' && <button type="button" className="btn" onClick={() => { rec.revert(); if (rec.state === 'new') onPick(null); }}>{rec.state === 'new' ? 'Delete this record' : 'Put back as the file has it'}</button>}
        </div>
      </header>
      {!rec.editable && <p className="scene-hint">Open a project to change records.</p>}
      <div className="sheet-grid spell-raw">
        {layout.fields.map((f, i) =>
          f.kind === 's' ? (
            <TextField key={f.name} label={f.name} value={String(values[i] ?? '')} onChange={(v) => set(i, v)} />
          ) : (
            <Num key={f.name} label={f.name} value={Number(values[i] ?? 0)} step={f.kind === 'f' ? 'any' : 1} disabled={!rec.editable || f.kind === 'n'} onChange={(v) => set(i, v)} />
          ),
        )}
      </div>
    </section>
  );
}

/**
 * Any of the client tables the editor knows (spell icons, items, item looks, factions, areas...): find a record, change its
 * fields, copy it to a new id. The same machinery as the spell editor, with every field shown raw.
 */
export function DbcBrowser(): React.JSX.Element {
  const api = useApi();
  const project = useProjectEntities();
  const [file, setFile] = useState(DBC_LAYOUTS[1]!.file);
  const layout = layoutOf(file)!;
  const [text, setText] = useState('');
  const [rows, setRows] = useState<DbcRowView[]>([]);
  const [total, setTotal] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const asked = useRef(0);

  const search = (query = text): void => {
    if (!api) return;
    const mine = ++asked.current;
    void api.dbcSearch(file, query, 40).then((r) => {
      if (mine !== asked.current) return;
      setProblem(r.ok ? null : r.error.message);
      setRows(r.ok ? r.value.rows : []);
      setTotal(r.ok ? r.value.total : 0);
    });
  };
  useEffect(() => {
    setText('');
    setOpen(null);
    setRows([]);
    setTotal(0);
    setProblem(null);
    search('');
    // Only the file changes what is shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, api]);

  const columns = shownFields(layout);
  const edited = (project?.entities.dbcEdits ?? []).find((e) => e.file.toLowerCase() === file.toLowerCase())?.records.length ?? 0;
  return (
    <div className="spell-browser">
      <p className="scene-hint">The client tables the editor can change. Records you change are kept in the project and written out by Export client patch.</p>
      <div className="scene-row">
        <label className="scene-field">
          <span>Table</span>
          <select value={file} onChange={(e) => setFile(e.target.value)}>
            {DBC_LAYOUTS.map((l) => <option key={l.file} value={l.file}>{l.title} ({l.file})</option>)}
          </select>
        </label>
        <form className="scene-row" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <label className="scene-field">
            <span>Find by id{layout.fields.some((f) => f.kind === 's') ? ' or words' : ''}</span>
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={!api}>Find</button>
        </form>
        {/^\d+$/.test(text.trim()) && <button type="button" className="btn" onClick={() => setOpen(Number(text.trim()))}>Open {text.trim()}</button>}
      </div>
      {edited > 0 && <p className="scene-hint">{edited} {edited === 1 ? 'record' : 'records'} of {layout.file} changed in this project.</p>}
      {problem && <p role="alert" className="control__alert">{problem}</p>}
      {rows.length > 0 && (
        <>
          <p className="scene-hint">{total > rows.length ? `${rows.length} of ${total} shown; narrow the search.` : `${rows.length} found.`}</p>
          <div className="sql-result">
            <table aria-label="Records found">
              <thead><tr>{columns.map((c) => <th key={c}>{layout.fields[c]!.name}</th>)}<th /></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} aria-selected={open === row.id}>
                    {columns.map((c) => <td key={c} title={String(row.values[c])}>{String(row.values[c])}</td>)}
                    <td>
                      <button type="button" className="btn" aria-label={`Open ${row.id}`} onClick={() => setOpen(row.id)}>Open</button>
                      {row.state !== 'file' && <span className={`spell-badge spell-badge--${row.state}`}>{STATE_WORD[row.state]}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {open !== null && <RecordForm key={`${file}:${open}`} layout={layout} id={open} onPick={setOpen} />}
    </div>
  );
}
