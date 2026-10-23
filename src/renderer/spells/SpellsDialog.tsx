import { useEffect, useRef, useState } from 'react';
import { trapTab } from '../components/trap-tab';
import { ClientPatchPanel } from './ClientPatchPanel';
import { DbcBrowser } from './DbcBrowser';
import { SpellEditor } from './SpellEditor';
import '../views/ProjectDialog.css';
import '../tables/sheets.css';
import './spells.css';

const VIEWS = [
  { id: 'spells', label: 'Spells' },
  { id: 'tables', label: 'Client tables' },
  { id: 'export', label: 'Export' },
] as const;

/** The spell editor, the other client tables, and the export of what they change, in one window */
export function SpellsDialog({ onClose }: { onClose(): void }): React.JSX.Element {
  const dialog = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('spells');
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

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="modal tables-dialog spells-dialog" role="dialog" aria-modal="true" aria-labelledby="spells-title" onKeyDown={(e) => trapTab(e, dialog.current)}>
        <header className="modal__header">
          <h2 id="spells-title">Spells and client tables</h2>
          <button type="button" className="btn btn--icon" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="tables-dialog__body">
          <nav className="tables-dialog__nav" aria-label="Spell views">
            {VIEWS.map((v) => <button key={v.id} type="button" aria-current={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>)}
          </nav>
          <div className="tables-dialog__main" role="region" aria-label={VIEWS.find((v) => v.id === view)!.label}>
            {view === 'spells' && <SpellEditor />}
            {view === 'tables' && <DbcBrowser />}
            {view === 'export' && <ClientPatchPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
