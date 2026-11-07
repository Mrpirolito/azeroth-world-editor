import { useEffect, useState } from 'react';
import { checkModelFile, KIND_INFO, MODEL_KINDS, newDraft, placeFiles, type ModelKind, type WizardDraft } from '@core/modelwizard/model';
import type { SetIssue, WizardResult } from '@shared/ipc';
import { Num } from '../spells/fields';
import { useApi } from '../state/names';
import { useProjectEntities } from '../state/project-entities';

type Picked = { name: string; data: string; issues: SetIssue[] };

const readBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });

/** Checks a file by its first 12 bytes, which is all the headers need */
const issuesOf = (name: string, data: string): SetIssue[] => checkModelFile(name, Uint8Array.from(atob(data.slice(0, 16)), (c) => c.charCodeAt(0)));

const STEPS = ['Type', 'Client files', 'Client rows', 'Creature', 'Spell', 'Item', 'Review'] as const;

/** Step by step: an M2 model becomes a mount, a companion pet or an NPC in the project (client rows, creature, spell, item and files) */
export function ModelWizard(): React.JSX.Element {
  const api = useApi();
  const project = useProjectEntities();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(newDraft('mount'));
  const [files, setFiles] = useState<Picked[]>([]);
  const [preview, setPreview] = useState<WizardResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<WizardResult | null>(null);
  const edit = (patch: Partial<WizardDraft>): void => { setDraft({ ...draft, ...patch }); setDone(null); };
  const learns = draft.kind !== 'npc';
  const skipped = (i: number): boolean => !learns && (i === 4 || i === 5);
  const move = (by: 1 | -1): void => {
    let next = step + by;
    while (skipped(next)) next += by;
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
  };

  useEffect(() => {
    if (!api || step < 2 || draft.name.trim() === '') { setPreview(null); return; }
    let live = true;
    void api.modelWizard(draft, files.map(({ name, data }) => ({ name, data })), false).then((r) => {
      if (!live) return;
      setPreview(r.ok ? r.value : null);
      setProblem(r.ok ? null : r.error.message);
    });
    return () => { live = false; };
  }, [api, draft, files, step]);

  const pick = async (list: FileList | null): Promise<void> => {
    if (!list) return;
    const added = await Promise.all([...list].map(async (f) => { const data = await readBase64(f); return { name: f.name, data, issues: issuesOf(f.name, data) }; }));
    setFiles([...files.filter((f) => !added.some((a) => a.name === f.name)), ...added]);
    setDone(null);
  };
  const add = (): void => {
    if (!api) return;
    setBusy(true);
    void api.modelWizard(draft, files.map(({ name, data }) => ({ name, data })), true).then((r) => {
      setBusy(false);
      setProblem(r.ok ? null : r.error.message);
      if (r.ok) setDone(r.value);
    });
  };

  if (!project) return <p className="scene-hint">Open a project to use the model wizard.</p>;
  const placed = placeFiles(draft.name, files);
  const blocking = (preview?.issues ?? []).some((i) => i.severity === 'error');
  return (
    <div className="spell-editor__main">
      <nav className="tier-tabs" aria-label="Wizard steps">
        {STEPS.map((label, i) => !skipped(i) && <button key={label} type="button" aria-current={step === i} onClick={() => setStep(i)}>{i + 1}. {label}</button>)}
      </nav>

      {step === 0 && (
        <div className="coa-cards">
          {MODEL_KINDS.map((k: ModelKind) => (
            <button key={k} type="button" className="coa-card" aria-pressed={draft.kind === k} onClick={() => edit(newDraft(k))}>
              <strong>{KIND_INFO[k].label}</strong>
              <span>{KIND_INFO[k].blurb}</span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <>
          <label className="scene-field"><span>Name (it names the files and the creature)</span><input type="text" value={draft.name} onChange={(e) => edit({ name: e.target.value })} /></label>
          <label className="scene-field"><span>M2 model, .skin files and BLP textures</span><input type="file" multiple accept=".m2,.skin,.blp" onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} /></label>
          <p className="scene-hint">The 3.3.5a client reads M2 version 264; other versions are warned about. At most 3 textures; they are stored as CoA_&lt;Name&gt;_Tex1..3.</p>
          <ul className="tier-report">
            {files.map((f, i) => (
              <li key={f.name} className={f.issues.length ? `tier-report--${f.issues[0]!.severity}` : undefined}>
                {f.name} {placed.paths[i] ? `-> ${placed.paths[i]}` : '(not used)'} {f.issues.map((x) => x.message).join(' ')}
                <button type="button" className="btn" onClick={() => setFiles(files.filter((x) => x !== f))}>Remove</button>
              </li>
            ))}
            {draft.name.trim() !== '' && placed.issues.map((x, i) => <li key={`p${i}`} className={`tier-report--${x.severity}`}>{x.message}</li>)}
          </ul>
        </>
      )}

      {step === 2 && (
        <>
          <Num label="Model scale" value={draft.scale} step="any" min={0.01} onChange={(scale) => edit({ scale })} />
          <p className="scene-hint">One CreatureModelData record (the model path) and one CreatureDisplayInfo record (the model, the scale and the textures) are written to the client files. Ids: {preview ? `model ${preview.ids.modelData}, display ${preview.ids.display}` : 'name the model first'}.</p>
        </>
      )}

      {step === 3 && (
        <p className="scene-hint">The creature &quot;{draft.name}&quot; (entry {preview?.ids.creature ?? '...'}) is added to the project with the new look as its model (creature_template and creature_template_model). {draft.kind === 'npc' ? 'Place it in the world or edit it in the NPC editor.' : 'It is the creature the spell names; it is never spawned.'}</p>
      )}

      {step === 4 && learns && (
        <>
          {draft.kind === 'mount' ? (
            <>
              <Num label="Ground speed bonus (%) (aura 32; 0 for none)" value={draft.speed} min={0} max={1000} onChange={(speed) => edit({ speed })} />
              <label><input type="checkbox" checked={draft.flying} onChange={(e) => edit({ flying: e.target.checked, flightSpeed: e.target.checked && draft.flightSpeed === 0 ? 280 : draft.flightSpeed })} /> Flying (aura 207)</label>
              {draft.flying && <Num label="Flight speed bonus (%)" value={draft.flightSpeed} min={0} max={1000} onChange={(flightSpeed) => edit({ flightSpeed })} />}
              <p className="scene-hint">Spell {preview?.ids.spell ?? '...'}: apply aura 78 (mounted) with the creature as its misc value, copied from spell 23221 when the client has it.</p>
            </>
          ) : (
            <p className="scene-hint">Spell {preview?.ids.spell ?? '...'}: effect 28 (summon) with the creature as its misc value and summon properties 41 (companion), copied from spell 4055 when the client has it.</p>
          )}
        </>
      )}

      {step === 5 && learns && (
        <>
          <Num label="Item look (ItemDisplayInfo id)" value={draft.itemDisplayId} min={0} onChange={(itemDisplayId) => edit({ itemDisplayId })} />
          <p className="scene-hint">Item {preview?.ids.item ?? '...'} (class 15, {draft.kind === 'mount' ? 'mount' : 'companion'}): casts Learning (483) on use and learns spell {preview?.ids.spell ?? '...'} (trigger 6), with a client item row.</p>
        </>
      )}

      {step === 6 && (
        <>
          {preview ? (
            <ul className="tier-report">
              <li>Ids: creature {preview.ids.creature}{learns ? `, spell ${preview.ids.spell}, item ${preview.ids.item}` : ''}</li>
              {preview.records.map((r) => <li key={`${r.file}${r.id}`}>{r.file} record {r.id}</li>)}
              {preview.paths.map((p) => <li key={p}>{p}</li>)}
              {preview.issues.map((x, i) => <li key={`i${i}`} className={`tier-report--${x.severity}`}>{x.message}</li>)}
              {preview.warnings.map((w, i) => <li key={`w${i}`} className="tier-report--warning">{w}</li>)}
            </ul>
          ) : <p className="scene-hint">Name the model and pick its files first.</p>}
          <div className="tier-row">
            <button type="button" className="btn btn--primary" disabled={busy || !api || !preview || blocking} onClick={add}>Add to project</button>
          </div>
          {done?.saved && <p role="status">Added. The SQL goes out with the project export (Project, or the PR export) and the records and files with the client patch (Spells, Export).</p>}
        </>
      )}

      {problem && <p role="alert" className="tier-drop__error">{problem}</p>}
      <div className="tier-row">
        <button type="button" className="btn" disabled={step === 0} onClick={() => move(-1)}>Back</button>
        <button type="button" className="btn" disabled={step === STEPS.length - 1} onClick={() => move(1)}>Next</button>
      </div>
    </div>
  );
}
