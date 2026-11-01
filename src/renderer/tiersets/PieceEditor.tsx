import { useEffect, useState } from 'react';
import { STAT_TYPES } from '@core/entities/item-vocab';
import { suggestStats } from '@core/tiersets/budget';
import { MODEL_PIECES, PIECE_INFO, PIECE_REGIONS, REGIONS, SUFFIXES, type Look, type Piece, type PieceKey, type Suffix, type TierSet } from '@core/tiersets/model';
import type { FileTarget, TierLook } from '@shared/ipc';
import { useApi } from '../state/names';
import { Num, Pick } from '../spells/fields';

/** A file chosen or dropped; the answer is its bytes as base64 */
const readBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });

/** A box that takes a file by click or by drop and says what happened to it */
function DropFile({ label, accept, disabled, present, onFile }: { label: string; accept: string; disabled: boolean; present: boolean; onFile(file: File): Promise<string | null> }): React.JSX.Element {
  const [note, setNote] = useState<string | null>(null);
  const take = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setNote('Working...');
    setNote(await onFile(file));
  };
  return (
    <label className={`tier-drop${present ? ' tier-drop--on' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!disabled) void take(e.dataTransfer.files[0]); }}>
      <span>{label}{present ? ' ✓' : ''}</span>
      <input type="file" accept={accept} disabled={disabled} onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      {note && <small className={note === 'Working...' ? 'scene-hint' : 'tier-drop__error'}>{note}</small>}
    </label>
  );
}

/** Looks of the client that fit the piece's slot, found by display id or by the name of an item that uses it */
function LookSearch({ piece, selected, onPick }: { piece: PieceKey; selected: number; onPick(displayId: number): void }): React.JSX.Element {
  const api = useApi();
  const [text, setText] = useState('');
  const [looks, setLooks] = useState<TierLook[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!api) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      void api.tierSetLooks(piece, text).then((r) => {
        if (!live) return;
        setLooks(r.ok ? r.value.looks : []);
        setProblem(r.ok ? null : r.error.message);
      });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [api, piece, text]);
  return (
    <div className="tier-look">
      <input type="search" value={text} placeholder="Display id, or the name of an item that wears it" aria-label="Search looks" onChange={(e) => setText(e.target.value)} />
      {problem && <small className="tier-drop__error">{problem}</small>}
      <ul className="spell-list">
        {looks.map((l) => (
          <li key={l.displayId}>
            <button type="button" className={`spell-row${l.displayId === selected ? ' spell-row--on' : ''}`} onClick={() => onPick(l.displayId)}>
              <span className="spell-row__name">{l.name}{l.items > 1 ? ` (+${l.items - 1} more)` : ''}</span>
              <span className="spell-row__id">{l.displayId}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One piece of a set: name, slot, stats and armor, and its look */
export function PieceEditor({ set, saved, piece: key, onChange, onFileStored }: {
  set: TierSet;
  /** Whether the set is in the project: files can only be added to a saved set */
  saved: boolean;
  piece: PieceKey;
  onChange(next: Piece): void;
  onFileStored(): void;
}): React.JSX.Element {
  const api = useApi();
  const piece = set.pieces[key];
  const info = PIECE_INFO[key];
  const look = piece.look;
  const patch = (p: Partial<Piece>): void => onChange({ ...piece, ...p });
  const setLook = (l: Look): void => patch({ look: l });
  const suggest = (): void => patch(suggestStats({ classId: set.classId, armorType: set.armorType, itemLevel: set.itemLevel, quality: set.quality, piece: key }));
  const newLook = (base: number): Look => ({ kind: 'new', baseDisplayId: base, displayId: look.kind === 'new' ? look.displayId : 0, textures: look.kind === 'new' ? look.textures : {}, model: look.kind === 'new' ? look.model : false, icon: look.kind === 'new' ? look.icon : '' });

  const store = async (target: FileTarget, file: File): Promise<string | null> => {
    if (!api) return 'No project is open.';
    const r = await api.tierSetFile(set.name, key, target, await readBase64(file));
    if (!r.ok) return r.error.message;
    if (look.kind === 'new') {
      if (target.kind === 'texture') {
        const key2 = String(target.region);
        const have = look.textures[key2] ?? [];
        setLook({ ...look, textures: { ...look.textures, [key2]: have.includes(target.suffix) ? have : [...have, target.suffix] } });
      } else if (target.file === 'm2') setLook({ ...look, model: true });
    }
    onFileStored();
    return `Stored (${r.value.paths.length} file${r.value.paths.length === 1 ? '' : 's'}). Save the set to use it.`;
  };

  return (
    <section className="tier-piece" aria-label={info.label}>
      <h3>{info.label}</h3>
      <div className="tier-row">
        <div className="scene-field">
          <label className="sheet-label">Name<input type="text" value={piece.name} onChange={(e) => patch({ name: e.target.value })} /></label>
        </div>
        {info.types.length > 1 && <Pick label="Slot" value={piece.inventoryType} options={info.types.map((t) => [t, t === 5 ? 'Chest' : 'Robe'] as const)} onChange={(inventoryType) => patch({ inventoryType })} />}
        <Num label="Armor" value={piece.armor} min={0} onChange={(armor) => patch({ armor })} />
      </div>
      <fieldset className="tier-stats">
        <legend>Stats</legend>
        {piece.stats.map((s, i) => (
          <div key={i} className="tier-row">
            <Pick label="Stat" value={s.type} options={STAT_TYPES} onChange={(type) => patch({ stats: piece.stats.map((x, j) => (j === i ? { ...x, type } : x)) })} />
            <Num label="Value" value={s.value} onChange={(value) => patch({ stats: piece.stats.map((x, j) => (j === i ? { ...x, value } : x)) })} />
            <button type="button" className="btn" aria-label={`Remove stat ${i + 1}`} onClick={() => patch({ stats: piece.stats.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <div className="tier-row">
          <button type="button" className="btn" disabled={piece.stats.length >= 10} onClick={() => patch({ stats: [...piece.stats, { type: 7, value: 0 }] })}>Add stat</button>
          <button type="button" className="btn" onClick={suggest}>Suggest stats</button>
        </div>
      </fieldset>

      <fieldset className="tier-look-box">
        <legend>Look</legend>
        <div className="tier-row" role="radiogroup" aria-label={`${info.label} look`}>
          <label><input type="radio" name={`look-${key}`} checked={look.kind === 'existing'} onChange={() => setLook({ kind: 'existing', displayId: look.kind === 'existing' ? look.displayId : look.baseDisplayId })} /> Existing look</label>
          <label><input type="radio" name={`look-${key}`} checked={look.kind === 'new'} onChange={() => setLook(newLook(look.kind === 'existing' ? look.displayId : look.baseDisplayId))} /> New look from a base</label>
        </div>
        {look.kind === 'existing' ? (
          <>
            <Num label="Display id" value={look.displayId} min={0} onChange={(displayId) => setLook({ kind: 'existing', displayId })} />
            <LookSearch piece={key} selected={look.displayId} onPick={(displayId) => setLook({ kind: 'existing', displayId })} />
          </>
        ) : (
          <>
            <Num label="Base display id (copied)" value={look.baseDisplayId} min={0} onChange={(n) => setLook({ ...look, baseDisplayId: n })} hint={look.displayId ? `Made as display ${look.displayId}.` : 'A free display id is given when the set is saved.'} />
            <LookSearch piece={key} selected={look.baseDisplayId} onPick={(n) => setLook({ ...look, baseDisplayId: n })} />
            <div className="scene-field">
              <label className="sheet-label">Icon (Interface\Icons\... name, optional)<input type="text" value={look.icon} onChange={(e) => setLook({ ...look, icon: e.target.value })} /></label>
            </div>
            {!saved && <p className="scene-hint">Save the set once to add texture and model files to it.</p>}
            {PIECE_REGIONS[key].length > 0 && (
              <div className="tier-drops">
                {PIECE_REGIONS[key].map((region) => (
                  <fieldset key={region}>
                    <legend>{REGIONS[region]!.label} ({REGIONS[region]!.width}x{REGIONS[region]!.height})</legend>
                    {SUFFIXES.map((suffix: Suffix) => (
                      <DropFile key={suffix} label={suffix === 'U' ? 'Both sexes' : suffix === 'M' ? 'Male' : 'Female'} accept=".png,.blp" disabled={!saved}
                        present={(look.textures[String(region)] ?? []).includes(suffix)} onFile={(file) => store({ kind: 'texture', region, suffix }, file)} />
                    ))}
                  </fieldset>
                ))}
              </div>
            )}
            {MODEL_PIECES.includes(key) && (
              <div className="tier-drops">
                {(key === 'head' ? (['head'] as const) : (['left', 'right'] as const)).map((slot) => (
                  <fieldset key={slot}>
                    <legend>{key === 'head' ? 'Helm model' : slot === 'left' ? 'Left shoulder' : 'Right shoulder'}</legend>
                    <DropFile label=".m2 model" accept=".m2" disabled={!saved} present={look.model} onFile={(file) => store({ kind: 'model', slot, file: 'm2' }, file)} />
                    <DropFile label=".skin" accept=".skin" disabled={!saved} present={look.model} onFile={(file) => store({ kind: 'model', slot, file: 'skin' }, file)} />
                  </fieldset>
                ))}
                <fieldset>
                  <legend>Model texture</legend>
                  <DropFile label=".blp or .png" accept=".png,.blp" disabled={!saved} present={look.model} onFile={(file) => store({ kind: 'model', slot: key === 'head' ? 'head' : 'left', file: 'blp' }, file)} />
                </fieldset>
              </div>
            )}
          </>
        )}
        <p className="scene-hint">No 3D preview of armor yet: the viewer draws weapons and shields only. Check the pieces in the client.</p>
      </fieldset>
    </section>
  );
}
