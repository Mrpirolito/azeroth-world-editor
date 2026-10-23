import { useEffect, useRef, useState } from 'react';
import { SPECS } from '@core/tables/specs';
import { FREE_ID_SOURCES } from '@core/tables/tools';
import type { Row, TableSpec } from '@core/tables/types';
import { trapTab } from '../components/trap-tab';
import { useApi } from '../state/names';
import { useProjectEntities } from '../state/project-entities';
import { Sheet } from './Sheet';
import '../views/ProjectDialog.css';
import './sheets.css';

const GROUPS: { title: string; tables: string[] }[] = [
  { title: 'Loot lists', tables: ['reference_loot_template', 'fishing_loot_template', 'mail_loot_template', 'spell_loot_template'] },
  { title: 'Texts', tables: ['broadcast_text', 'npc_text', 'page_text', 'acore_string'] },
  { title: 'World', tables: ['game_tele', 'creature_formations', 'creature_immunities', 'item_enchantment_template'] },
  { title: 'Placed spawns', tables: ['creature_addon', 'gameobject_addon'] },
  { title: 'Spells', tables: ['spell_dbc', 'spell_custom_attr', 'spell_proc', 'spell_bonus_data', 'spell_group', 'spell_linked_spell', 'spell_target_position', 'spell_area', 'spell_script_names'] },
];
const TOOLS = ['Changed here', 'Free ids', 'SQL console'] as const;
type Tool = (typeof TOOLS)[number];

const short = (text: string | null | undefined, n = 60): string => {
  const one = (text ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};

/** A row in a list of finds: its id and the words that name it */
const labelOf = (spec: TableSpec, row: Row): string => `${row[spec.scope[0]!] ?? '?'}${spec.nameColumn && row[spec.nameColumn] ? ` · ${short(row[spec.nameColumn])}` : ''}`;

/** One table of the database: find a row by id or words, or start a new one, and edit it as a sheet */
function TableBrowser({ spec }: { spec: TableSpec }): React.JSX.Element {
  const api = useApi();
  const project = useProjectEntities();
  const idColumn = spec.scope[0]!;
  const [text, setText] = useState('');
  const [found, setFound] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const asked = useRef(0);
  useEffect(() => {
    setText('');
    setFound([]);
    setOpen(null);
    setProblem(null);
  }, [spec.table]);

  const search = (): void => {
    if (!api) return;
    const mine = ++asked.current;
    void api.searchTable(spec.table, text).then((r) => {
      if (mine !== asked.current) return;
      setProblem(r.ok ? null : r.error.message);
      setFound(r.ok ? r.value.rows : []);
    });
  };
  const changed = (project?.entities.rowsets ?? []).filter((s) => s.table === spec.table && !s.owner);

  return (
    <>
      <p className="scene-hint">{spec.blurb}</p>
      <form className="scene-row" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <label className="scene-field">
          <span>Find by id{spec.search ? ' or words' : ''}</span>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={!api || text.trim() === ''}>Find</button>
        {/^\d+$/.test(text.trim()) && <button type="button" className="btn" onClick={() => setOpen(text.trim())}>Open {idColumn} {text.trim()}</button>}
        {!spec.existingOnly && (
          <button type="button" className="btn" disabled={!api} onClick={() => void api?.freeIds(spec.table, idColumn, 1, 1).then((r) => { if (r.ok) setOpen(String(r.value.ids[0])); })}>
            New with the first free id
          </button>
        )}
      </form>
      {problem && <p role="alert" className="control__alert">{problem}</p>}
      {found.length > 0 && (
        <ul className="tables-dialog__results" aria-label="Found">
          {found.map((row) => (
            <li key={row[idColumn]}><button type="button" className="btn" onClick={() => setOpen(row[idColumn] ?? null)}>{labelOf(spec, row)}</button></li>
          ))}
        </ul>
      )}
      {changed.length > 0 && (
        <div>
          <h4 className="scene-section__title">Changed in this project</h4>
          <ul className="tables-dialog__results" aria-label="Changed in this project">
            {changed.map((s) => (
              <li key={s.scope[idColumn]}><button type="button" className="btn" onClick={() => setOpen(s.scope[idColumn] ?? null)}>{labelOf(spec, s.rows[0] ?? s.scope)}</button></li>
            ))}
          </ul>
        </div>
      )}
      {open !== null && <Sheet key={`${spec.table}:${open}`} spec={spec} scope={{ [idColumn]: open }} idPrefix={`tables-${spec.table}-${open}`} title={`${spec.title}: ${idColumn} ${open}`} />}
    </>
  );
}

/** Every set of rows the project holds, whoever owns it, each with a way to put it back as the database has it */
function ChangedHere(): React.JSX.Element {
  const project = useProjectEntities();
  const sets = project?.entities.rowsets ?? [];
  const drop = (at: number): void => project?.setEntities({ ...project.entities, rowsets: sets.filter((_, i) => i !== at) });
  return (
    <>
      <p className="scene-hint">The table rows this project writes, from the sheets of NPCs, objects and items and from this dialog. Putting one back leaves the database&apos;s rows as they are.</p>
      {sets.length === 0 ? <p className="scene-hint">Nothing is changed in any table yet.</p> : (
        <ul className="tables-dialog__results" aria-label="Changed rows">
          {sets.map((s, i) => {
            const spec = SPECS.find((x) => x.table === s.table);
            return (
              <li key={`${s.table}:${JSON.stringify(s.scope)}`} className="scene-row">
                <span>{spec?.title ?? s.table} · {Object.values(s.scope).join(' / ')}{s.owner ? ` · ${{ creature: 'NPC', gameobject: 'object', item: 'item' }[s.owner.kind]} ${s.owner.entry}` : ''} · {s.rows.length} {s.rows.length === 1 ? 'row' : 'rows'}</span>
                <button type="button" className="btn" aria-label={`Put back ${spec?.title ?? s.table} ${Object.values(s.scope).join(' ')}`} onClick={() => drop(i)}>Put back</button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** The first unused ids of the tables ids are taken from, to type into a script or a spawn */
function FreeIds(): React.JSX.Element {
  const api = useApi();
  const [at, setAt] = useState(0);
  const source = FREE_ID_SOURCES[at]!;
  const [from, setFrom] = useState(source.from);
  const [count, setCount] = useState(10);
  const [ids, setIds] = useState<number[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const run = (): void => {
    void api?.freeIds(source.table, source.column, from, count).then((r) => {
      setProblem(r.ok ? null : r.error.message);
      setIds(r.ok ? r.value.ids : null);
    });
  };
  return (
    <>
      <p className="scene-hint">The first ids from a start that no row of the table holds yet, so a new NPC, spawn or menu never lands on one in use.</p>
      <div className="scene-row">
        <label className="scene-field">
          <span>What for</span>
          <select value={at} onChange={(e) => { const i = Number(e.target.value); setAt(i); setFrom(FREE_ID_SOURCES[i]!.from); setIds(null); }}>
            {FREE_ID_SOURCES.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
          </select>
        </label>
        <label className="scene-field scene-field--short"><span>From</span><input type="number" min={0} value={from} onChange={(e) => setFrom(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} /></label>
        <label className="scene-field scene-field--short"><span>How many</span><input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.min(100, Math.max(1, Math.trunc(Number(e.target.value) || 1))))} /></label>
        <button type="button" className="btn" disabled={!api} onClick={run}>Find free ids</button>
      </div>
      {problem && <p role="alert" className="control__alert">{problem}</p>}
      {ids && <p aria-label="Found ids" className="sql-ids">{ids.join(', ')}</p>}
    </>
  );
}

/** Reads the world database with one SELECT at a time; the database layer refuses anything that could write */
function SqlConsole(): React.JSX.Element {
  const api = useApi();
  const [sql, setSql] = useState('SELECT entry, name FROM creature_template WHERE name LIKE \'%guard%\'');
  const [result, setResult] = useState<{ columns: string[]; rows: Record<string, string | null>[]; truncated: boolean } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const run = (): void => {
    void api?.sqlQuery(sql).then((r) => {
      setProblem(r.ok ? null : r.error.message);
      setResult(r.ok ? r.value : null);
    });
  };
  return (
    <>
      <p className="scene-hint">Read-only: one SELECT, SHOW, DESCRIBE or EXPLAIN at a time, up to 500 rows. Nothing here can change the database.</p>
      <label className="scene-field">
        <span>Query</span>
        <textarea className="sql-input" rows={5} value={sql} onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } }} />
      </label>
      <div><button type="button" className="btn btn--primary" disabled={!api || sql.trim() === ''} onClick={run}>Run (Ctrl+Enter)</button></div>
      {problem && <p role="alert" className="control__alert">{problem}</p>}
      {result && (
        <>
          <p className="scene-hint">{result.rows.length} {result.rows.length === 1 ? 'row' : 'rows'}{result.truncated ? ', more left out' : ''}.</p>
          <div className="sql-result">
            <table aria-label="Result">
              <thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{result.rows.map((row, i) => <tr key={i}>{result.columns.map((c) => <td key={c} title={row[c] ?? 'NULL'}>{row[c] === null || row[c] === undefined ? 'NULL' : row[c]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/**
 * The tables that belong to no NPC, object or item (loot lists, texts, teleports, formations, enchantments, immunity sets), each
 * as the same sheets the editors use, plus two tools: free ids and a read-only SQL console.
 */
export function TablesDialog({ onClose }: { onClose(): void }): React.JSX.Element {
  const dialog = useRef<HTMLDivElement | null>(null);
  const project = useProjectEntities();
  const [shown, setShown] = useState<string>(GROUPS[0]!.tables[0]!);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const spec = SPECS.find((s) => s.table === shown);
  const tool = TOOLS.find((t) => t === shown) as Tool | undefined;
  const changedIn = (table: string): number => (project?.entities.rowsets ?? []).filter((s) => s.table === table && !s.owner).length;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="modal tables-dialog" role="dialog" aria-modal="true" aria-labelledby="tables-title" onKeyDown={(e) => trapTab(e, dialog.current)}>
        <header className="modal__header">
          <h2 id="tables-title">Database tables</h2>
          <button type="button" className="btn btn--icon" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="tables-dialog__body">
          <nav className="tables-dialog__nav" aria-label="Tables">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <h3>{g.title}</h3>
                {g.tables.map((t) => {
                  const s = SPECS.find((x) => x.table === t)!;
                  const n = changedIn(t);
                  return <button key={t} type="button" aria-current={shown === t} onClick={() => setShown(t)}>{s.title}{n > 0 ? ` (${n} changed)` : ''}</button>;
                })}
              </div>
            ))}
            <h3>Tools</h3>
            {TOOLS.map((t) => <button key={t} type="button" aria-current={shown === t} onClick={() => setShown(t)}>{t}</button>)}
          </nav>
          <div className="tables-dialog__main" role="region" aria-label={spec?.title ?? tool}>
            <h3 className="scene-section__title">{spec?.title ?? tool}</h3>
            {spec && <TableBrowser spec={spec} />}
            {tool === 'Changed here' && <ChangedHere />}
            {tool === 'Free ids' && <FreeIds />}
            {tool === 'SQL console' && <SqlConsole />}
          </div>
        </div>
      </div>
    </div>
  );
}
