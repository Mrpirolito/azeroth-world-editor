import { useMemo, useState } from 'react';
import { ARMOR_TYPES, newTierSet, PIECES, PIECE_INFO, QUALITIES, TIER_CLASSES, type ArmorType, type PieceKey, type TierSet } from '@core/tiersets/model';
import { withSuggestedStats } from '@core/tiersets/compose';
import type { SetIssue } from '@shared/ipc';
import { useApi } from '../state/names';
import { useProjectEntities } from '../state/project-entities';
import { Num } from '../spells/fields';
import { BonusEditor } from './BonusEditor';
import { PieceEditor } from './PieceEditor';
import './tiersets.css';

const DIFFICULTIES = ['Normal', 'Heroic', '10 players', '25 players', '10 players Heroic', '25 players Heroic'];

/** The tier sets of the project: a list, and an editor for the one picked */
export function TierSetsPanel(): React.JSX.Element {
  const api = useApi();
  const project = useProjectEntities();
  const sets = project?.entities.tierSets ?? [];
  const [draft, setDraft] = useState<TierSet | null>(null);
  const [piece, setPiece] = useState<PieceKey>('head');
  const [lockedName, setLockedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [report, setReport] = useState<{ issues: SetIssue[]; warnings: string[] } | null>(null);

  const saved = useMemo(() => draft !== null && sets.some((s) => s.name.toLowerCase() === draft.name.toLowerCase()), [draft, sets]);

  const reload = async (): Promise<void> => {
    if (!api || !project) return;
    const read = await api.projectEntities();
    if (read.ok) project.setEntities(read.value);
  };

  const open = (set: TierSet): void => {
    setDraft(structuredClone(set));
    setLockedName(set.name);
    setReport(null);
    setProblem(null);
  };
  const create = (): void => {
    setDraft(withSuggestedStats(newTierSet('', 1, 'plate')));
    setLockedName(null);
    setReport(null);
    setProblem(null);
  };
  const edit = (patch: Partial<TierSet>): void => { if (draft) setDraft({ ...draft, ...patch }); };
  const rename = (name: string): void => {
    if (!draft) return;
    // Piece names that still follow the set's name follow it
    const follow = (k: PieceKey): string => (draft.pieces[k].name === `${draft.name.trim()} ${PIECE_INFO[k].label}` ? `${name.trim()} ${PIECE_INFO[k].label}` : draft.pieces[k].name);
    setDraft({ ...draft, name, pieces: Object.fromEntries(PIECES.map((k) => [k, { ...draft.pieces[k], name: follow(k) }])) as TierSet['pieces'] });
  };

  const save = (): void => {
    if (!api || !draft) return;
    setBusy(true);
    setProblem(null);
    void api.tierSetSave(draft).then(async (r) => {
      setBusy(false);
      if (!r.ok) { setProblem(r.error.message); return; }
      setDraft(r.value.set);
      setLockedName(r.value.set.name);
      setReport({ issues: r.value.issues, warnings: r.value.warnings });
      await reload();
    });
  };
  const remove = (): void => {
    if (!api || !draft) return;
    setBusy(true);
    void api.tierSetDelete(draft.name).then(async (r) => {
      setBusy(false);
      if (!r.ok) { setProblem(r.error.message); return; }
      setDraft(null);
      await reload();
    });
  };

  if (!project) return <p className="scene-hint">Open a project to make tier sets.</p>;
  return (
    <div className="spell-editor">
      <div className="spell-editor__side">
        <button type="button" className="btn btn--primary" onClick={create}>New tier set</button>
        <ul className="spell-list" aria-label="Tier sets">
          {sets.map((s) => (
            <li key={s.name}>
              <button type="button" className={`spell-row${draft && lockedName === s.name ? ' spell-row--on' : ''}`} onClick={() => open(s)}>
                <span className="spell-row__name">{s.name}</span>
                <span className="spell-row__id">{TIER_CLASSES.find((c) => c.id === s.classId)?.name}</span>
              </button>
            </li>
          ))}
          {sets.length === 0 && <li className="scene-hint">No tier sets yet.</li>}
        </ul>
      </div>
      <div className="spell-editor__main">
        {!draft ? (
          <p className="scene-hint">Pick a set or make a new one. A saved set becomes five items, their client rows, an item set and a look per piece in the project; they are exported with the project and the client patch.</p>
        ) : (
          <>
            <div className="tier-row">
              <div className="scene-field">
                <label className="sheet-label">Set name<input type="text" value={draft.name} disabled={lockedName !== null} onChange={(e) => rename(e.target.value)} /></label>
                {lockedName !== null && <small className="scene-hint">The name names the files, so it cannot change once saved.</small>}
              </div>
              <div className="scene-field">
                <label className="sheet-label">Class
                  <select value={draft.classId} onChange={(e) => edit({ classId: Number(e.target.value) })}>
                    <optgroup label="Classes">{TIER_CLASSES.filter((c) => !c.custom).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                    <optgroup label="CoA classes">{TIER_CLASSES.filter((c) => c.custom).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                  </select>
                </label>
              </div>
              <div className="scene-field">
                <label className="sheet-label">Armor
                  <select value={draft.armorType} onChange={(e) => edit({ armorType: e.target.value as ArmorType })}>
                    {(Object.keys(ARMOR_TYPES) as ArmorType[]).map((a) => <option key={a} value={a}>{ARMOR_TYPES[a].label}</option>)}
                  </select>
                </label>
              </div>
              <div className="scene-field">
                <label className="sheet-label">Quality
                  <select value={draft.quality} onChange={(e) => edit({ quality: e.target.value as TierSet['quality'] })}>
                    {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="tier-row">
              <Num label="Item level" value={draft.itemLevel} min={1} onChange={(itemLevel) => edit({ itemLevel })} />
              <Num label="Required level" value={draft.requiredLevel} min={1} max={255} onChange={(requiredLevel) => edit({ requiredLevel })} />
              <div className="scene-field">
                <label className="sheet-label">Raid<input type="text" value={draft.raid} onChange={(e) => edit({ raid: e.target.value })} /></label>
              </div>
              <div className="scene-field">
                <label className="sheet-label">Difficulty<input type="text" list="tier-difficulties" value={draft.difficulty} onChange={(e) => edit({ difficulty: e.target.value })} /></label>
                <datalist id="tier-difficulties">{DIFFICULTIES.map((d) => <option key={d} value={d} />)}</datalist>
              </div>
              <button type="button" className="btn" onClick={() => setDraft(withSuggestedStats(draft))}>Suggest stats for all pieces</button>
            </div>
            <nav className="tier-tabs" aria-label="Pieces">
              {PIECES.map((k) => <button key={k} type="button" aria-current={piece === k} onClick={() => setPiece(k)}>{PIECE_INFO[k].label}</button>)}
            </nav>
            <PieceEditor set={draft} saved={saved} piece={piece} onChange={(p) => setDraft({ ...draft, pieces: { ...draft.pieces, [piece]: p } })} onFileStored={() => void reload()} />
            <BonusEditor bonuses={draft.bonuses} onChange={(bonuses) => setDraft({ ...draft, bonuses })} />
            <div className="tier-row">
              <button type="button" className="btn btn--primary" disabled={busy || !api} onClick={save}>Save set</button>
              {saved && <button type="button" className="btn" disabled={busy || !api} onClick={remove}>Delete set</button>}
            </div>
            {problem && <p role="alert" className="tier-drop__error">{problem}</p>}
            {report && (
              <ul className="tier-report">
                {report.issues.map((i, n) => <li key={`i${n}`} className={`tier-report--${i.severity}`}>{i.message}</li>)}
                {report.warnings.map((w, n) => <li key={`w${n}`} className="tier-report--warning">{w}</li>)}
                {report.issues.length + report.warnings.length === 0 && <li>Saved.</li>}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
