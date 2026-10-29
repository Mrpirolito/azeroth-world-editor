import { useEffect, useState } from 'react';
import type { SyncSettings, SyncStatus } from '@shared/ipc';
import type { SettingsSectionProps } from './sections';

const FIELDS: [keyof SyncSettings, string][] = [
  ['repoDir', 'Server repo'],
  ['worktreeDir', 'AWE worktree (kept on main)'],
  ['prWorktreeParent', 'Folder for pull request worktrees'],
  ['mysqlBin', 'mysql client (imports the base SQL)'],
];

/** Aligns the editor with the server's main branch: awe_world gets main's SQL updates and the editor connects to it. */
export function SyncSection({ store, setBusy }: SettingsSectionProps): React.JSX.Element {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    // Every tab stays mounted, and tests render the dialog without the preload bridge
    void window.api?.syncStatus().then((r) => {
      if (!r.ok) return setError(r.error.message);
      setStatus(r.value);
      setSettings(r.value.settings);
    });
  }, []);

  const save = async (): Promise<void> => {
    if (!settings) return;
    const r = await window.api.syncSetSettings(settings);
    if (r.ok) setSettings(r.value);
    else setError(r.error.message);
  };

  const sync = async (rebuild = false): Promise<void> => {
    setWorking(true);
    setBusy(true);
    setError(null);
    setNote(null);
    await save();
    const r = await window.api.syncMain(rebuild);
    if (r.ok) {
      setStatus(r.value.status);
      setNote(`${r.value.created ? 'awe_world created. ' : ''}${r.value.applied.length} update files applied.${r.value.failed.length ? ` ${r.value.failed.length} failed and were skipped: ${r.value.failed.map((f) => f.name).join(', ')}.` : ''}`);
      await store.getState().adoptConnection(r.value.connect);
      await store.getState().loadProfiles();
    } else setError(r.error.message);
    setWorking(false);
    setBusy(false);
  };

  return (
    <div className="settings-prefs">
      <h2 className="settings-prefs__heading">Server sync</h2>
      <p className="settings-mcp__note">
        Keeps a copy of your world database (awe_world) up to date with the server's main branch, so what you edit matches the live server. Your own database is never written.
      </p>
      {FIELDS.map(([key, label]) => (
        <label key={key} className="settings-prefs__choice">
          {label}
          <input type="text" value={settings?.[key] ?? ''} disabled={settings === null || working} onChange={(e) => setSettings({ ...settings!, [key]: e.target.value })} onBlur={() => void save()} />
        </label>
      ))}
      <p role="status" className={status?.behind ? 'settings-mcp__error' : 'settings-mcp__note'}>
        {status?.message ?? 'Reading the repo…'}
      </p>
      <div>
        <button type="button" className="btn btn--primary" disabled={working || settings === null} onClick={() => void sync()}>
          {working ? 'Syncing…' : 'Sync with main'}
        </button>
        <button type="button" className="btn" disabled={working || settings === null} onClick={() => void sync(true)}>
          Rebuild from main
        </button>
        <button type="button" className="btn" disabled={working} onClick={() => void window.api.syncStatus(true).then((r) => (r.ok ? setStatus(r.value) : setError(r.error.message)))}>
          Check for changes
        </button>
      </div>
      {note !== null && <p role="status">{note}</p>}
      {error !== null && (
        <p role="alert" className="settings-mcp__error">
          {error}
        </p>
      )}
    </div>
  );
}
