import { useEffect, useRef, useState } from 'react';
import { trapTab } from '../components/trap-tab';
import { TierSetsPanel } from '../tiersets/TierSetsPanel';
import { Checklist, Pools, ScalingAndRunes, WorldBosses } from './CoaSections';
import { ModelWizard } from './ModelWizard';
import '../views/ProjectDialog.css';
import '../tables/sheets.css';
import '../spells/spells.css';
import './coa.css';

const SECTIONS = [
  { id: 'tiersets', label: 'Tier Sets', blurb: 'Five armor pieces of a class with their looks, set bonuses and where they drop.', view: TierSetsPanel },
  { id: 'bosses', label: 'World bosses', blurb: 'Health and damage per difficulty (coa_world_boss_level) of the CoA world bosses.', view: WorldBosses },
  { id: 'scaling', label: 'Scaling & Runes', blurb: 'ApexScaling percentages of the apex bosses and the Runes of Descension items.', view: ScalingAndRunes },
  { id: 'pools', label: 'Pools & gathering nodes', blurb: 'Spawn pools, the nodes and rare spawns in them.', view: Pools },
  { id: 'model', label: 'Model wizard', blurb: 'An M2 model to a mount, companion pet or NPC: client rows, creature, spell and item.', view: ModelWizard },
  { id: 'checklist', label: 'Quest / boss checklist', blurb: 'Ids, tables, client patch, quest POI, scaling, tests and PR: what to check before a PR.', view: Checklist },
] as const;

/** Everything CoA-specific in one place: a card per feature, each opening its own page */
export function CoaHub({ onClose }: { onClose(): void }): React.JSX.Element {
  const dialog = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState<(typeof SECTIONS)[number]['id'] | null>(null);
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

  const section = SECTIONS.find((s) => s.id === open);
  const View = section?.view;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="modal tables-dialog spells-dialog" role="dialog" aria-modal="true" aria-labelledby="coa-title" onKeyDown={(e) => trapTab(e, dialog.current)}>
        <header className="modal__header">
          <h2 id="coa-title">CoA content{section ? `: ${section.label}` : ''}</h2>
          {section && <button type="button" className="btn" onClick={() => setOpen(null)}>All CoA content</button>}
          <button type="button" className="btn btn--icon" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="tables-dialog__body coa-hub__body">
          <div className="tables-dialog__main" role="region" aria-label={section?.label ?? 'CoA content'}>
            {View ? <View /> : (
              <div className="coa-cards">
                {SECTIONS.map((s) => (
                  <button key={s.id} type="button" className="coa-card" onClick={() => setOpen(s.id)}>
                    <strong>{s.label}</strong>
                    <span>{s.blurb}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
