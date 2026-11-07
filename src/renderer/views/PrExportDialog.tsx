import { useState } from 'react';
import type { PrPreview } from '@shared/ipc';
import { PanelFrame } from '../modules/ModulePanel';

/**
 * Export as PR: prepares the branch and commit, shows the file, the checks and the title and description, and
 * only pushes and opens the pull request on the second, explicit click.
 */
export function PrExportDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState<PrPreview | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const prepare = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const r = await window.api.exportPrPrepare({ title: title.trim() });
    if (r.ok) setPreview(r.value);
    else setError(r.error.message);
    setBusy(false);
  };

  const publish = async (): Promise<void> => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const r = await window.api.exportPrPublish({ slug: preview.slug, confirm: true });
    if (r.ok) setUrl(r.value.url);
    else setError(r.error.message);
    setBusy(false);
  };

  return (
    <PanelFrame
      title="Export as PR"
      description="Makes the project's SQL a commit on a new branch from main. Nothing is pushed until you confirm."
      onClose={onClose}
      footer={
        <>
          <span />
          <div className="export-apply__actions">
            <button type="button" className="btn" onClick={onClose}>
              {url ? 'Close' : 'Cancel'}
            </button>
            {!preview && (
              <button type="button" className="btn btn--primary" disabled={busy || title.trim().length < 3} onClick={() => void prepare()}>
                {busy ? 'Preparing…' : 'Prepare'}
              </button>
            )}
            {preview && !url && (
              <button type="button" className="btn btn--primary" disabled={busy || !preview.ok} onClick={() => void publish()}>
                {busy ? 'Pushing…' : 'Push and open pull request'}
              </button>
            )}
          </div>
        </>
      }
    >
      {!preview && (
        <label>
          Title
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="what the patch does" />
        </label>
      )}
      {preview && (
        <>
          <p>
            Branch <code>{preview.branch}</code> in <code>{preview.worktree}</code>
            <br />
            File <code>{preview.file}</code>
            <br />
            Title <code>feat(DB/CoA): {preview.title}</code>
          </p>
          <ul>
            {preview.checks.map((c) => (
              <li key={c.name}>
                {c.ok ? 'OK' : 'FAILED'}: {c.name}
                {[...c.errors, ...c.warnings.map((w) => `warning: ${w}`)].map((m, i) => (
                  <div key={i}>{m}</div>
                ))}
              </li>
            ))}
          </ul>
          <pre className="export-apply__sql">{preview.body}</pre>
          <pre className="export-apply__sql">{preview.sql}</pre>
        </>
      )}
      {url && (
        <p role="status">
          Pull request opened: <code>{url}</code>
        </p>
      )}
      {error !== null && <p role="alert">{error}</p>}
    </PanelFrame>
  );
}
