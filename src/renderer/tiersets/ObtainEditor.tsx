import { useEffect, useState } from 'react';
import { PIECES, PIECE_INFO, QUALITIES, TIER_CLASSES, type TierSet } from '@core/tiersets/model';
import { DIFFICULTIES, DIFFICULTY_LABEL, tokenGroupName, tokenItemName, type Drop, type Obtain, type TokenGroup, type VendorConfig } from '@core/tiersets/obtain';
import type { BossSummary, ObtainIssue, TierLook } from '@shared/ipc';
import { useApi } from '../state/names';
import { useProjectEntities } from '../state/project-entities';
import { Num } from '../spells/fields';

const NONE = { head: 0, shoulders: 0, chest: 0, hands: 0, legs: 0 };
const newGroup = (): TokenGroup => ({ prefix: '', group: '', classIds: [], quality: 'epic', itemLevel: 213, requiredLevel: 80, displayId: 0, entries: NONE, costs: NONE, drops: [] });
const newDrop = (boss: number, bossName: string): Drop => ({ boss, bossName, tokens: [...PIECES], difficulties: ['10n'], chance: 100, groupId: 0, min: 1, max: 1 });
const toggle = <T,>(list: readonly T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

/** Creatures found by name or id, picked one at a time */
function CreaturePick({ label, onPick }: { label: string; onPick(id: number, name: string): void }): React.JSX.Element {
  const api = useApi();
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ id: number; name: string; detail?: string }[]>([]);
  useEffect(() => {
    if (!api || text.trim() === '') { setFound([]); return undefined; }
    let live = true;
    const timer = setTimeout(() => { void api.searchEntities('creature', text).then((r) => { if (live && r.ok) setFound(r.value.slice(0, 8)); }); }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [api, text]);
  return (
    <div className="scene-field">
      <label className="sheet-label">{label}<input type="search" value={text} placeholder="Name or entry" onChange={(e) => setText(e.target.value)} /></label>
      {found.length > 0 && (
        <ul className="spell-list">
          {found.map((f) => (
            <li key={f.id}><button type="button" className="spell-row" onClick={() => { onPick(f.id, f.name); setText(''); }}><span className="spell-row__name">{f.name}</span><span className="spell-row__id">{f.id}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Token looks of the game, found by display id or item name */
function TokenLook({ selected, onPick }: { selected: number; onPick(displayId: number): void }): React.JSX.Element {
  const api = useApi();
  const [text, setText] = useState('');
  const [looks, setLooks] = useState<TierLook[]>([]);
  useEffect(() => {
    if (!api) return undefined;
    let live = true;
    const timer = setTimeout(() => { void api.tierTokenLooks(text).then((r) => { if (live) setLooks(r.ok ? r.value.looks : []); }); }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [api, text]);
  return (
    <div className="tier-look">
      <input type="search" value={text} placeholder="Display id, or the name of a token that uses it" aria-label="Search token looks" onChange={(e) => setText(e.target.value)} />
      <ul className="spell-list">
        {looks.map((l) => (
          <li key={l.displayId}><button type="button" className={`spell-row${l.displayId === selected ? ' spell-row--on' : ''}`} onClick={() => onPick(l.displayId)}><span className="spell-row__name">{l.name}</span><span className="spell-row__id">{l.displayId}</span></button></li>
        ))}
      </ul>
    </div>
  );
}

/** The token groups of the project: their items, who they serve and which bosses drop them */
export function TokenGroupsEditor(): React.JSX.Element {
  const api = useApi();
  const project = useProjectEntities();
  const groups = project?.entities.tokenGroups ?? [];
  const [draft, setDraft] = useState<TokenGroup | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [report, setReport] = useState<{ issues: ObtainIssue[]; warnings: string[]; summary: BossSummary[] } | null>(null);

  const reload = async (): Promise<void> => {
    if (!api || !project) return;
    const read = await api.projectEntities();
    if (read.ok) project.setEntities(read.value);
  };
  const open = (g: TokenGroup | null): void => { setDraft(g ? structuredClone(g) : newGroup()); setSaved(g ? tokenGroupName(g) : null); setReport(null); setProblem(null); };
  const edit = (patch: Partial<TokenGroup>): void => { if (draft) setDraft({ ...draft, ...patch }); };
  const editDrop = (i: number, patch: Partial<Drop>): void => { if (draft) setDraft({ ...draft, drops: draft.drops.map((d, j) => (j === i ? { ...d, ...patch } : d)) }); };

  const save = (): void => {
    if (!api || !draft) return;
    setBusy(true);
    setProblem(null);
    void api.tierTokenGroupSave(draft).then(async (r) => {
      setBusy(false);
      if (!r.ok) { setProblem(r.error.message); return; }
      setDraft(r.value.group);
      setSaved(tokenGroupName(r.value.group));
      setReport({ issues: r.value.issues, warnings: r.value.warnings, summary: r.value.summary });
      await reload();
    });
  };
  const remove = (): void => {
    if (!api || !draft) return;
    setBusy(true);
    void api.tierTokenGroupDelete(tokenGroupName(draft)).then(async (r) => {
      setBusy(false);
      if (!r.ok) { setProblem(r.error.message); return; }
      setDraft(null);
      await reload();
    });
  };

  return (
    <section className="tier-obtain" aria-label="Token groups">
      <h3>Token groups</h3>
      <p className="scene-hint">Tokens bosses drop and a vendor exchanges for set pieces. A group can serve the sets of several classes, like Conqueror, Protector and Vanquisher.</p>
      <div className="tier-row">
        {groups.map((g) => <button key={tokenGroupName(g)} type="button" className="btn" onClick={() => open(g)}>{tokenGroupName(g)}</button>)}
        <button type="button" className="btn" onClick={() => open(null)}>New token group</button>
      </div>
      {draft && (
        <div className="tier-bonus">
          <div className="tier-row">
            <div className="scene-field"><label className="sheet-label">Prefix<input type="text" value={draft.prefix} disabled={saved !== null} placeholder="Lost" onChange={(e) => edit({ prefix: e.target.value })} /></label></div>
            <div className="scene-field"><label className="sheet-label">Group<input type="text" value={draft.group} disabled={saved !== null} placeholder="Conqueror" onChange={(e) => edit({ group: e.target.value })} /></label></div>
            <div className="scene-field">
              <label className="sheet-label">Quality
                <select value={draft.quality} onChange={(e) => edit({ quality: e.target.value as TokenGroup['quality'] })}>{QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}</select>
              </label>
            </div>
            <Num label="Item level" value={draft.itemLevel} min={1} onChange={(itemLevel) => edit({ itemLevel })} />
            <Num label="Required level" value={draft.requiredLevel} min={1} max={255} onChange={(requiredLevel) => edit({ requiredLevel })} />
            <Num label="Look (display id)" value={draft.displayId} min={0} hint="0 copies the Lost Conqueror tokens" onChange={(displayId) => edit({ displayId })} />
          </div>
          <TokenLook selected={draft.displayId} onPick={(displayId) => edit({ displayId })} />
          <small className="scene-hint">Tokens: {PIECES.map((k) => tokenItemName(draft, k)).join(', ')}</small>
          <fieldset>
            <legend>Classes served</legend>
            <div className="tier-row">
              {TIER_CLASSES.map((c) => (
                <label key={c.id}><input type="checkbox" checked={draft.classIds.includes(c.id)} onChange={() => edit({ classIds: toggle(draft.classIds, c.id) })} /> {c.name}</label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Dropped by</legend>
            {draft.drops.map((d, i) => (
              <div key={i} className="tier-bonus">
                <div className="tier-row">
                  <strong>{d.bossName || 'Boss'} ({d.boss})</strong>
                  <button type="button" className="btn" aria-label={`Remove drop ${i + 1}`} onClick={() => edit({ drops: draft.drops.filter((_, j) => j !== i) })}>✕</button>
                </div>
                <div className="tier-row">
                  {PIECES.map((k) => <label key={k}><input type="checkbox" checked={d.tokens.includes(k)} onChange={() => { const tokens = toggle(d.tokens, k); if (tokens.length > 0) editDrop(i, { tokens }); }} /> {PIECE_INFO[k].label}</label>)}
                </div>
                <div className="tier-row">
                  {DIFFICULTIES.map((x) => <label key={x}><input type="checkbox" checked={d.difficulties.includes(x)} onChange={() => { const difficulties = toggle(d.difficulties, x); if (difficulties.length > 0) editDrop(i, { difficulties }); }} /> {DIFFICULTY_LABEL[x]}</label>)}
                </div>
                <div className="tier-row">
                  <Num label="Chance (%)" value={d.chance} min={0} max={100} step="any" onChange={(chance) => editDrop(i, { chance })} />
                  <Num label="Loot group (0: alone)" value={d.groupId} min={0} max={255} hint="Rows in one group give one token per kill" onChange={(groupId) => editDrop(i, { groupId })} />
                  <Num label="Least" value={d.min} min={1} max={255} onChange={(min) => editDrop(i, { min })} />
                  <Num label="Most" value={d.max} min={1} max={255} onChange={(max) => editDrop(i, { max })} />
                </div>
              </div>
            ))}
            <CreaturePick label="Add a boss" onPick={(id, name) => edit({ drops: [...draft.drops, newDrop(id, name)] })} />
          </fieldset>
          <div className="tier-row">
            <button type="button" className="btn btn--primary" disabled={busy || !api} onClick={save}>Save token group</button>
            {saved !== null && <button type="button" className="btn" disabled={busy || !api} onClick={remove}>Delete token group</button>}
          </div>
          {problem && <p role="alert" className="tier-drop__error">{problem}</p>}
          {report && (
            <ul className="tier-report">
              {report.issues.map((x, n) => <li key={`i${n}`} className={`tier-report--${x.severity}`}>{x.message}</li>)}
              {report.warnings.map((w, n) => <li key={`w${n}`} className="tier-report--warning">{w}</li>)}
              {report.summary.map((b) => (
                <li key={b.entry}>{b.name} ({b.entry}): {b.lines.map((l) => `${DIFFICULTY_LABEL[l.difficulty]} as ${l.creature}: ${l.tokens.length} token${l.tokens.length === 1 ? '' : 's'} at ${l.chance}%${l.groupId > 0 ? ` (group ${l.groupId})` : ''}`).join('; ')}</li>
              ))}
              {report.issues.length + report.warnings.length === 0 && <li>Saved.</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

const newVendor = (): VendorConfig => ({ entry: 0, created: true, name: '', subname: 'Tier Set Vendor', displayId: 0, spawn: null, classFilter: true });

/** How a set is obtained: the token group it is bought with and the vendor that sells it */
export function ObtainEditor({ set, onChange }: { set: TierSet; onChange(obtain: Obtain | undefined): void }): React.JSX.Element {
  const project = useProjectEntities();
  const groups = project?.entities.tokenGroups ?? [];
  const obtain = set.obtain;
  const vendor = obtain?.vendor ?? null;
  const patch = (p: Partial<Obtain>): void => onChange({ tokenGroup: '', vendor: null, ...obtain, ...p });
  const patchVendor = (p: Partial<VendorConfig>): void => patch({ vendor: { ...(vendor ?? newVendor()), ...p } });
  return (
    <section className="tier-obtain" aria-label="Obtain">
      <h3>Obtain</h3>
      <div className="tier-row">
        <div className="scene-field">
          <label className="sheet-label">Token group
            <select value={obtain?.tokenGroup ?? ''} onChange={(e) => (e.target.value === '' ? onChange(undefined) : patch({ tokenGroup: e.target.value }))}>
              <option value="">Not set up</option>
              {groups.map((g) => <option key={tokenGroupName(g)} value={tokenGroupName(g)}>{tokenGroupName(g)}</option>)}
            </select>
          </label>
        </div>
        {obtain && (
          <div className="scene-field">
            <label className="sheet-label">Vendor
              <select value={vendor === null ? 'none' : vendor.created ? 'new' : 'existing'} onChange={(e) => patch({ vendor: e.target.value === 'none' ? null : e.target.value === 'new' ? { ...newVendor(), name: `${set.name} Vendor` } : { ...newVendor(), created: false } })}>
                <option value="none">No vendor</option>
                <option value="new">A new NPC</option>
                <option value="existing">An NPC that exists</option>
              </select>
            </label>
          </div>
        )}
      </div>
      {obtain && vendor && !vendor.created && (
        <div className="tier-row">
          <Num label="NPC entry" value={vendor.entry} min={0} onChange={(entry) => patchVendor({ entry })} />
          <label><input type="checkbox" checked={vendor.classFilter} onChange={(e) => patchVendor({ classFilter: e.target.checked })} /> Each class sees only its own pieces</label>
        </div>
      )}
      {obtain && vendor?.created && (
        <>
          <div className="tier-row">
            <div className="scene-field"><label className="sheet-label">Name<input type="text" value={vendor.name} onChange={(e) => patchVendor({ name: e.target.value })} /></label></div>
            <div className="scene-field"><label className="sheet-label">Subname<input type="text" value={vendor.subname} onChange={(e) => patchVendor({ subname: e.target.value })} /></label></div>
            <Num label="Model (display id)" value={vendor.displayId} min={0} onChange={(displayId) => patchVendor({ displayId })} />
            <label><input type="checkbox" checked={vendor.classFilter} onChange={(e) => patchVendor({ classFilter: e.target.checked })} /> Each class sees only its own pieces</label>
          </div>
          <div className="tier-row">
            <label><input type="checkbox" checked={vendor.spawn !== null} onChange={(e) => patchVendor({ spawn: e.target.checked ? { guid: 0, map: 0, x: 0, y: 0, z: 0, o: 0 } : null })} /> Place it in the world</label>
            {vendor.spawn && (
              <>
                <Num label="Map" value={vendor.spawn.map} min={0} onChange={(map) => patchVendor({ spawn: { ...vendor.spawn!, map } })} />
                <Num label="X" value={vendor.spawn.x} step="any" onChange={(x) => patchVendor({ spawn: { ...vendor.spawn!, x } })} />
                <Num label="Y" value={vendor.spawn.y} step="any" onChange={(y) => patchVendor({ spawn: { ...vendor.spawn!, y } })} />
                <Num label="Z" value={vendor.spawn.z} step="any" onChange={(z) => patchVendor({ spawn: { ...vendor.spawn!, z } })} />
                <Num label="Facing" value={vendor.spawn.o} step="any" onChange={(o) => patchVendor({ spawn: { ...vendor.spawn!, o } })} />
              </>
            )}
            {!vendor.spawn && <small className="scene-hint">Without a place the NPC exists but no one can find it.</small>}
          </div>
        </>
      )}
    </section>
  );
}
