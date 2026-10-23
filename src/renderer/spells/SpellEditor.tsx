import { useEffect, useMemo, useRef, useState } from 'react';
import { SPECS } from '@core/tables/specs';
import { iconClientPath, iconName, type SpellLookups } from '@core/spells/lookups';
import { blankSpell, cloneSpell, spellNum, spellText, withSpell } from '@core/spells/model';
import { withRecord } from '@core/dbc/edits';
import { EditorTabs, type EditorTab } from '../entities/EditorTabs';
import { useApi } from '../state/names';
import { useProjectEntities } from '../state/project-entities';
import { Sheet } from '../tables/Sheet';
import { SpellIconImage } from './SpellIconImage';
import { AdvancedTab, AttributesTab, BasicsTab, CastingTab, EffectsTab, type TabProps } from './SpellTabs';
import { useDbcIssues, useDbcRecord, useSpellLookups } from './useDbc';
import '../tables/sheets.css';
import './spells.css';

const FILE = 'Spell.dbc';

/** The database tables that belong to a spell, in the order of the tabs after the client-file ones */
const DB_TABLES = ['spell_dbc', 'spell_custom_attr', 'spell_proc', 'spell_bonus_data', 'spell_group', 'spell_linked_spell', 'spell_target_position', 'spell_area', 'spell_script_names'] as const;

interface Found {
  id: number;
  name: string;
  rank: string;
  icon: number;
  state: 'file' | 'changed' | 'new';
}

const found = (row: { id: number; values: (number | string)[]; state: Found['state'] }): Found => ({
  id: row.id, name: spellText(row.values, 'Name'), rank: spellText(row.values, 'Rank'), icon: spellNum(row.values, 'SpellIconID'), state: row.state,
});

const STATE_WORD = { file: '', changed: 'edited', new: 'new' } as const;

/** A spell in a list: its icon, name and rank, id, and whether the project changed it */
function SpellRow({ spell, lookups, selected, onPick }: { spell: Found; lookups: SpellLookups; selected: boolean; onPick(): void }): React.JSX.Element {
  return (
    <li>
      <button type="button" className={`spell-row${selected ? ' spell-row--on' : ''}`} aria-current={selected} onClick={onPick}>
        <SpellIconImage path={iconClientPath(lookups, spell.icon)} name={iconName(lookups, spell.icon)} size={28} />
        <span className="spell-row__name">{spell.name || '(no name)'}{spell.rank ? ` · ${spell.rank}` : ''}</span>
        <span className="spell-row__id">#{spell.id}</span>
        {spell.state !== 'file' && <span className={`spell-badge spell-badge--${spell.state}`}>{STATE_WORD[spell.state]}</span>}
      </button>
    </li>
  );
}

/** The spell being edited: header, problems, and the tabs of the client file and of the database tables */
function SpellForm({ id, lookups, onPick }: { id: number; lookups: SpellLookups; onPick(id: number): void }): React.JSX.Element {
  const api = useApi();
  const project = useProjectEntities();
  const rec = useDbcRecord(FILE, id);
  const issues = useDbcIssues(FILE, rec.values);
  const [names, setNames] = useState<Record<number, string>>({});
  const triggers = rec.values ? [0, 1, 2].map((i) => spellNum(rec.values!, `EffectTriggerSpell${i + 1}`)).filter((n) => n > 0) : [];
  const triggerKey = triggers.join(',');
  useEffect(() => {
    if (!api || triggers.length === 0) return undefined;
    let live = true;
    void api.spellFacts(triggers).then((r) => {
      if (live && r.ok) setNames(Object.fromEntries(Object.entries(r.value.spells).map(([k, v]) => [k, v.name])));
    });
    return () => {
      live = false;
    };
    // The ids are in the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, triggerKey]);

  if (rec.loading) return <p className="scene-hint">Reading the spell…</p>;
  if (!rec.values) return <p className="scene-hint">Spell {id} is not in {FILE}. A spell that only exists as a spell_dbc row is edited in the Database tables dialog (Spells).</p>;
  const values = rec.values;
  const disabled = !rec.editable;
  const props: TabProps = {
    record: values,
    change: (changes) => rec.set(withSpell(values, changes)),
    replace: (next) => rec.set(next),
    lookups,
    describe: { lookups, spellName: (n) => names[n] },
    disabled,
  };
  const tabs: EditorTab[] = [
    { id: 'basics', label: 'Basics', render: () => <BasicsTab {...props} /> },
    { id: 'casting', label: 'Casting', render: () => <CastingTab {...props} /> },
    { id: 'effects', label: 'Effects', render: () => <EffectsTab {...props} /> },
    { id: 'attributes', label: 'Attributes', render: () => <AttributesTab {...props} /> },
    { id: 'advanced', label: 'Advanced', render: () => <AdvancedTab {...props} /> },
    ...DB_TABLES.map((table): EditorTab => {
      const spec = SPECS.find((s) => s.table === table)!;
      return {
        id: table,
        label: `DB: ${spec.title}`,
        render: () => <Sheet spec={spec} scope={{ [spec.scope[0]!]: String(id) }} idPrefix={`spell-${id}-${table}`} title={spec.title} />,
      };
    }),
  ];
  const name = spellText(values, 'Name');
  return (
    <div className="spell-form">
      <header className="spell-form__head">
        <SpellIconImage path={iconClientPath(lookups, spellNum(values, 'SpellIconID'))} name={iconName(lookups, spellNum(values, 'SpellIconID'))} size={48} />
        <div className="spell-form__title">
          <h3>{name || '(no name)'}{spellText(values, 'Rank') ? ` · ${spellText(values, 'Rank')}` : ''}</h3>
          <div className="scene-hint">Spell #{id}{rec.state === 'new' ? ' · new, made in this project' : rec.state === 'changed' ? ' · edited in this project' : ''}</div>
        </div>
        <div className="spell-form__actions">
          <button type="button" className="btn" disabled={!project} onClick={() => {
            if (!api || !project) return;
            void api.dbcFreeId(FILE).then((r) => {
              if (!r.ok) return;
              project.setEntities({ ...project.entities, dbcEdits: withRecord(project.entities.dbcEdits, FILE, r.value.id, cloneSpell(values, r.value.id), null) });
              onPick(r.value.id);
            });
          }}>Clone to a new spell</button>
          {rec.state !== 'file' && <button type="button" className="btn" onClick={() => { rec.revert(); if (rec.state === 'new') onPick(0); }}>{rec.state === 'new' ? 'Delete this new spell' : 'Put back as the file has it'}</button>}
        </div>
      </header>
      {disabled && <p className="scene-hint">Open a project to change spells.</p>}
      {issues.length > 0 && (
        <ul className="sheet-issues" aria-label="Problems">
          {issues.map((i, n) => <li key={n} className={i.severity === 'error' ? 'spell-issue--error' : undefined}>{i.severity === 'error' ? 'Problem: ' : 'Check: '}{i.message}</li>)}
        </ul>
      )}
      <EditorTabs label="Spell" tabs={tabs} />
    </div>
  );
}

/**
 * Find a spell by name or id, change it in the client file (names, icon, cost, casting, effects, attributes) or clone it
 * to a free id, and edit the database tables that belong to it. Changes are kept in the project.
 */
export function SpellEditor(): React.JSX.Element {
  const api = useApi();
  const project = useProjectEntities();
  const { lookups, ready, reason } = useSpellLookups();
  const [text, setText] = useState('');
  const [results, setResults] = useState<Found[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const asked = useRef(0);

  const search = (): void => {
    if (!api) return;
    const mine = ++asked.current;
    void api.dbcSearch(FILE, text, 40).then((r) => {
      if (mine !== asked.current) return;
      setProblem(r.ok ? null : r.error.message);
      setResults(r.ok ? r.value.rows.map(found) : []);
    });
  };
  const changed = useMemo<Found[]>(
    () => (project?.entities.dbcEdits ?? []).filter((e) => e.file.toLowerCase() === FILE.toLowerCase()).flatMap((e) => e.records.map((r) => found({ id: r.id, values: r.values, state: r.was ? 'changed' : 'new' }))),
    [project?.entities.dbcEdits],
  );

  return (
    <div className="spell-editor">
      <aside className="spell-editor__side" aria-label="Find a spell">
        <form className="scene-row" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <label className="scene-field">
            <span>Find a spell by name or id</span>
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={!api || text.trim() === ''}>Find</button>
        </form>
        <div className="scene-row">
          {/^\d+$/.test(text.trim()) && <button type="button" className="btn" onClick={() => setSelected(Number(text.trim()))}>Open spell {text.trim()}</button>}
          <button type="button" className="btn" disabled={!api || !project} onClick={() => {
            if (!api || !project) return;
            void api.dbcFreeId(FILE).then((r) => {
              if (!r.ok) return;
              project.setEntities({ ...project.entities, dbcEdits: withRecord(project.entities.dbcEdits, FILE, r.value.id, blankSpell(r.value.id), null) });
              setSelected(r.value.id);
            });
          }}>New empty spell</button>
        </div>
        {problem && <p role="alert" className="control__alert">{problem}</p>}
        {!ready && <p className="scene-hint">Reading the client tables…</p>}
        {reason && <p className="scene-hint">{reason}</p>}
        {results.length > 0 && (
          <ul className="spell-list" aria-label="Spells found">
            {results.map((s) => <SpellRow key={s.id} spell={s} lookups={lookups} selected={selected === s.id} onPick={() => setSelected(s.id)} />)}
          </ul>
        )}
        {changed.length > 0 && (
          <div>
            <h4 className="scene-section__title">Changed in this project</h4>
            <ul className="spell-list" aria-label="Spells changed in this project">
              {changed.map((s) => <SpellRow key={s.id} spell={s} lookups={lookups} selected={selected === s.id} onPick={() => setSelected(s.id)} />)}
            </ul>
          </div>
        )}
      </aside>
      <section className="spell-editor__main" aria-label="Spell">
        {selected === null || selected === 0 ? <p className="scene-hint">Find a spell, or start a new one. You can clone any spell to a free id and change the copy.</p> : <SpellForm key={selected} id={selected} lookups={lookups} onPick={setSelected} />}
      </section>
    </div>
  );
}
