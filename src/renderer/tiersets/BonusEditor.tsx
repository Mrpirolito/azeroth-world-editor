import { useEffect, useState } from 'react';
import { BONUS_STATS, BONUS_STAT_KEYS, bonusTooltip, MAX_BONUSES, PROC_EVENTS, PROC_EVENT_KEYS, type Bonus, type BonusEnv, type BonusTemplate } from '@core/tiersets/bonus';
import type { ParsedBonus } from '@core/tiersets/bonus-text';
import { spellText } from '@core/spells/model';
import { useApi } from '../state/names';
import { Num } from '../spells/fields';

const KINDS: readonly (readonly [BonusTemplate['kind'], string])[] = [
  ['stat', 'Stat'], ['damagePct', '% damage of a spell'], ['cooldown', 'Less cooldown of a spell'], ['costPct', 'Less cost of a spell'], ['critChance', '+ crit chance of a spell'],
  ['proc', 'Chance to cast a spell'], ['healingPct', '% healing done'], ['damageTakenPct', '% less damage taken'], ['pending', 'Needs server code'],
];

/** A template of a kind with plain starting values */
export function defaultTemplate(kind: BonusTemplate['kind']): BonusTemplate {
  switch (kind) {
    case 'stat': return { kind, stat: 'crit', value: 20 };
    case 'damagePct': return { kind, spells: [], value: 10 };
    case 'cooldown': return { kind, spells: [], seconds: 2 };
    case 'costPct': return { kind, spells: [], value: 10 };
    case 'critChance': return { kind, spells: [], value: 5 };
    case 'proc': return { kind, event: 'meleeHit', chance: 10, triggerSpell: 0 };
    case 'healingPct': return { kind, value: 5 };
    case 'damageTakenPct': return { kind, value: 5 };
    case 'pending': return { kind, reason: 'Needs server code.' };
  }
}

type Names = Readonly<Record<number, string>>;

/** Spells found by id or by name in Spell.dbc, picked into a list */
function SpellPick({ label, ids, names, single, onChange, onName }: { label: string; ids: readonly number[]; names: Names; single?: boolean; onChange(ids: number[]): void; onName(id: number, name: string): void }): React.JSX.Element {
  const api = useApi();
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ id: number; name: string; rank: string }[]>([]);
  useEffect(() => {
    if (!api || text.trim() === '') { setFound([]); return; }
    let live = true;
    const timer = setTimeout(() => {
      void api.dbcSearch('Spell.dbc', text, 8).then((r) => { if (live && r.ok) setFound(r.value.rows.map((row) => ({ id: row.id, name: spellText(row.values, 'Name'), rank: spellText(row.values, 'Rank') }))); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [api, text]);
  const pick = (f: { id: number; name: string }): void => {
    onName(f.id, f.name);
    onChange(single ? [f.id] : ids.includes(f.id) ? [...ids] : [...ids, f.id]);
    setText('');
  };
  return (
    <div className="scene-field">
      <label className="sheet-label">{label}
        <input type="search" value={text} placeholder="Spell id or name" onChange={(e) => setText(e.target.value)} />
      </label>
      <ul className="tier-chips">
        {ids.map((id) => (
          <li key={id}><button type="button" title="Remove" onClick={() => onChange(ids.filter((i) => i !== id))}>{names[id] ?? 'Spell'} ({id}) x</button></li>
        ))}
        {ids.length === 0 && <li className="scene-hint">No spell picked.</li>}
      </ul>
      {found.length > 0 && (
        <ul className="spell-list">
          {found.map((f) => (
            <li key={f.id}><button type="button" className="spell-row" onClick={() => pick(f)}><span className="spell-row__name">{f.name}{f.rank ? ` (${f.rank})` : ''}</span><span className="spell-row__id">{f.id}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The fields of one template */
function TemplateFields({ template: t, names, onName, onChange }: { template: BonusTemplate; names: Names; onName(id: number, name: string): void; onChange(t: BonusTemplate): void }): React.JSX.Element {
  const kind = (
    <div className="scene-field">
      <label className="sheet-label">Bonus
        <select value={t.kind} onChange={(e) => onChange(defaultTemplate(e.target.value as BonusTemplate['kind']))}>
          {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>
    </div>
  );
  switch (t.kind) {
    case 'stat':
      return (
        <div className="tier-row">
          {kind}
          <div className="scene-field">
            <label className="sheet-label">Stat
              <select value={t.stat} onChange={(e) => onChange({ ...t, stat: e.target.value as typeof t.stat })}>
                {BONUS_STAT_KEYS.map((k) => <option key={k} value={k}>{BONUS_STATS[k].label}</option>)}
              </select>
            </label>
          </div>
          <Num label="Amount" value={t.value} onChange={(value) => onChange({ ...t, value })} />
        </div>
      );
    case 'damagePct':
      return <div className="tier-row">{kind}<SpellPick label="Spells" ids={t.spells} names={names} onName={onName} onChange={(spells) => onChange({ ...t, spells })} /><Num label="Damage %" value={t.value} onChange={(value) => onChange({ ...t, value })} /></div>;
    case 'cooldown':
      return <div className="tier-row">{kind}<SpellPick label="Spells" ids={t.spells} names={names} onName={onName} onChange={(spells) => onChange({ ...t, spells })} /><Num label="Seconds less" value={t.seconds} min={1} onChange={(seconds) => onChange({ ...t, seconds })} /></div>;
    case 'costPct':
      return <div className="tier-row">{kind}<SpellPick label="Spells" ids={t.spells} names={names} onName={onName} onChange={(spells) => onChange({ ...t, spells })} /><Num label="Cost % less" value={t.value} min={1} max={100} onChange={(value) => onChange({ ...t, value })} /></div>;
    case 'critChance':
      return <div className="tier-row">{kind}<SpellPick label="Spells" ids={t.spells} names={names} onName={onName} onChange={(spells) => onChange({ ...t, spells })} /><Num label="Crit chance %" value={t.value} min={1} max={100} onChange={(value) => onChange({ ...t, value })} /></div>;
    case 'proc':
      return (
        <div className="tier-row">
          {kind}
          <div className="scene-field">
            <label className="sheet-label">On
              <select value={t.event} onChange={(e) => onChange({ ...t, event: e.target.value as typeof t.event })}>
                {PROC_EVENT_KEYS.map((k) => <option key={k} value={k}>{PROC_EVENTS[k].label}</option>)}
              </select>
            </label>
          </div>
          <Num label="Chance %" value={t.chance} min={1} max={100} onChange={(chance) => onChange({ ...t, chance })} />
          <SpellPick label="Casts" single ids={t.triggerSpell > 0 ? [t.triggerSpell] : []} names={names} onName={onName} onChange={(ids) => onChange({ ...t, triggerSpell: ids[0] ?? 0 })} />
        </div>
      );
    case 'healingPct':
    case 'damageTakenPct':
      return <div className="tier-row">{kind}<Num label="Percent" value={t.value} min={t.kind === 'damageTakenPct' ? 1 : undefined} onChange={(value) => onChange({ ...t, value })} /></div>;
    case 'pending':
      return (
        <div className="tier-row">
          {kind}
          <div className="scene-field">
            <label className="sheet-label">What it needs<input type="text" value={t.reason} maxLength={300} onChange={(e) => onChange({ ...t, reason: e.target.value })} /></label>
            <small className="scene-hint">No spell is made. The bonus is listed as pending server code in the export summary and the PR.</small>
          </div>
        </div>
      );
  }
}

const ids = (t: BonusTemplate): number[] => ('spells' in t ? t.spells : t.kind === 'proc' ? [t.triggerSpell] : []).filter((i) => i > 0);

/** The bonuses of a set: thresholds, templates, the generated tooltip, and a text-to-template draft */
export function BonusEditor({ bonuses, onChange }: { bonuses: readonly Bonus[]; onChange(next: Bonus[]): void }): React.JSX.Element {
  const api = useApi();
  const [names, setNames] = useState<Record<number, string>>({});
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<(ParsedBonus & { threshold: number }) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const setName = (id: number, name: string): void => setNames((n) => (n[id] === name ? n : { ...n, [id]: name }));

  // Names of the spells the bonuses already point at
  const wanted = [...new Set([...bonuses.flatMap((b) => ids(b.template)), ...(draft ? ids(draft.template) : [])])].filter((id) => names[id] === undefined);
  const key = wanted.join(',');
  useEffect(() => {
    if (!api || key === '') return;
    for (const id of key.split(',').map(Number)) void api.dbcRecord('Spell.dbc', id).then((r) => { if (r.ok && r.value.row) setName(id, spellText(r.value.row.values, 'Name')); });
  }, [api, key]);

  const env: BonusEnv = { spell: (id) => (names[id] ? { id, name: names[id]!, icon: 0, classSet: 0, mask: [0, 0, 0] } : undefined) };
  const nextThreshold = (): number => [2, 4, 3, 5, 1].find((n) => !bonuses.some((b) => b.threshold === n)) ?? 5;
  const update = (i: number, patch: Partial<Bonus>): void => onChange(bonuses.map((b, n) => (n === i ? { ...b, ...patch } : b)));
  const add = (template: BonusTemplate, threshold = nextThreshold(), original = ''): void => onChange([...bonuses, { threshold, template, text: original, spellId: 0 }]);

  const translate = (): void => {
    if (!api || text.trim() === '') return;
    setProblem(null);
    void api.tierSetBonusDraft(text).then((r) => {
      if (!r.ok) { setProblem(r.error.message); return; }
      setDraft({ ...r.value, threshold: nextThreshold() });
    });
  };

  return (
    <section className="tier-piece" aria-label="Set bonuses">
      <h3>Bonuses</h3>
      {bonuses.map((b, i) => (
        <div key={i} className="tier-bonus">
          <div className="tier-row">
            <Num label="Pieces" value={b.threshold} min={1} max={8} onChange={(threshold) => update(i, { threshold })} />
            <div className="scene-field"><small className="scene-hint">{b.spellId > 0 ? `Spell ${b.spellId}` : b.template.kind === 'pending' ? 'No spell (pending)' : 'Spell id given on save'}</small></div>
            <button type="button" className="btn" onClick={() => onChange(bonuses.filter((_, n) => n !== i))}>Remove</button>
          </div>
          <TemplateFields template={b.template} names={names} onName={setName} onChange={(template) => update(i, { template })} />
          {b.template.kind !== 'pending' && <p className="scene-hint">Tooltip: {bonusTooltip(b.template, env)}</p>}
          {b.text && <small className="scene-hint">From the text: {b.text}</small>}
        </div>
      ))}
      <div className="tier-row">
        <button type="button" className="btn" disabled={bonuses.length >= MAX_BONUSES} onClick={() => add(defaultTemplate('stat'))}>Add bonus</button>
      </div>
      <div className="scene-field">
        <label className="sheet-label">Describe a bonus in words
          <textarea rows={2} value={text} maxLength={500} placeholder="Increases the damage of Fireball by 10%." onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="button" className="btn" disabled={!api || text.trim() === ''} title="Reads common phrasings with fixed rules (no AI model is called); an external AI can fill bonuses through the tier_set_bonus MCP tool" onClick={translate}>Translate with AI</button>
        {problem && <small role="alert" className="tier-drop__error">{problem}</small>}
      </div>
      {draft && (
        <div className="tier-bonus">
          <strong>Draft, edit it before adding</strong>
          {draft.notes.map((n, i) => <small key={i} className="tier-report--warning">{n}</small>)}
          <div className="tier-row">
            <Num label="Pieces" value={draft.threshold} min={1} max={8} onChange={(threshold) => setDraft({ ...draft, threshold })} />
          </div>
          <TemplateFields template={draft.template} names={names} onName={setName} onChange={(template) => setDraft({ ...draft, template, notes: [] })} />
          {draft.template.kind !== 'pending' && <p className="scene-hint">Tooltip: {bonusTooltip(draft.template, env)}</p>}
          <div className="tier-row">
            <button type="button" className="btn btn--primary" disabled={bonuses.length >= MAX_BONUSES} onClick={() => { add(draft.template, draft.threshold, text); setDraft(null); setText(''); }}>Add to the set</button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </div>
      )}
    </section>
  );
}
