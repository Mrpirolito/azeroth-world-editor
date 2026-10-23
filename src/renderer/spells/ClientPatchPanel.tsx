import { useState } from 'react';
import { DEFAULT_PATCH_NAME, patchNameIssue } from '@core/dbc/patch-name';
import { editCount } from '@core/dbc/edits';
import type { ClientPatchResult } from '@shared/ipc';
import { useApi } from '../state/names';
import { useProjectEntities } from '../state/project-entities';
import './spells.css';

const STORED = 'awe.clientPatchName';

const stored = (): string => {
  try {
    return window.localStorage.getItem(STORED) || DEFAULT_PATCH_NAME;
  } catch {
    return DEFAULT_PATCH_NAME;
  }
};

/**
 * Writes what the project changes in the client files: the server's DBC files (to copy over the server's own, after a
 * .bak of each), a client patch archive that loads last, and the SQL patch for the table rows.
 */
export function ClientPatchPanel(): React.JSX.Element {
  const api = useApi();
  const project = useProjectEntities();
  const [name, setName] = useState(stored);
  const [folder, setFolder] = useState('');
  const [mpq, setMpq] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<ClientPatchResult | null>(null);
  const edits = project?.entities.dbcEdits ?? [];
  const nameProblem = mpq && edits.length > 0 ? patchNameIssue(name) : null;

  const run = (): void => {
    if (!api) return;
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      window.localStorage.setItem(STORED, name);
    } catch {
      // The name is only a convenience
    }
    void api.exportClientPatch({ ...(folder.trim() ? { folder: folder.trim() } : {}), patchName: name, mpq }).then((r) => {
      setBusy(false);
      if (r.ok) setDone(r.value);
      else setProblem(r.error.message);
    });
  };

  return (
    <div className="spell-export">
      <p className="scene-hint">
        Writes what this project changes in the client&apos;s tables. The server&apos;s files are never overwritten here: you copy them
        over your own, after keeping the originals as .bak.
      </p>
      {edits.length === 0 ? (
        <p className="scene-hint">No client table records are changed in this project. Exporting still writes the SQL patch when it has table rows.</p>
      ) : (
        <ul aria-label="Changed files">
          {edits.map((e) => (
            <li key={e.file}>{e.file}: {e.records.length} {e.records.length === 1 ? 'record' : 'records'} ({e.records.filter((r) => !r.was).length} new). Keep a copy of the server&apos;s {e.file} as {e.file}.bak before replacing it.</li>
          ))}
        </ul>
      )}
      <div className="sheet-grid">
        <label className="scene-field">
          <span>Client patch name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          <small className="scene-hint">{nameProblem ?? 'Loads after patch-CZZ, so its tables win over the stock ones.'}</small>
        </label>
        <label className="scene-field">
          <span>Folder for the files</span>
          <input type="text" value={folder} placeholder="a new folder in the export folder" onChange={(e) => setFolder(e.target.value)} />
          <small className="scene-hint">Not the server&apos;s Data folder.</small>
        </label>
        <label className="scene-field scene-field--check">
          <input type="checkbox" checked={mpq} onChange={(e) => setMpq(e.target.checked)} />
          <span>Also write the client patch archive</span>
        </label>
      </div>
      <div>
        <button type="button" className="btn btn--primary" disabled={!api || busy || nameProblem !== null || (editCount(edits) === 0 && (project?.entities.rowsets ?? []).length === 0 && project?.tracked.length === 0)} onClick={run}>
          {busy ? 'Exporting…' : 'Export client patch'}
        </button>
      </div>
      {problem && <p role="alert" className="control__alert">{problem}</p>}
      {done && (
        <div className="spell-export__done" role="status" aria-label="Exported">
          <p><strong>Written to</strong> {done.folder}</p>
          <ul>
            {done.dbcFiles.map((f) => <li key={f.file}>{f.path}: {f.changed} changed, {f.added} added, {f.records} records</li>)}
            {done.mpqPath && <li>{done.mpqPath}</li>}
            {done.sql && <li>{done.sql.applyPath}</li>}
          </ul>
          {done.notes.map((n, i) => <p key={i} className="scene-hint">{n}</p>)}
          {done.issues.length > 0 && <ul className="sheet-issues" aria-label="Warnings">{done.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
