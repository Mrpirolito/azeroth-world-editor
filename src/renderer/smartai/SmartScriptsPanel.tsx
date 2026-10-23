import { sameRowSets, type SmartRow } from '@core/smartai/row';
import { ScriptSearchPanel } from './ScriptSearch';
import { SmartScriptEditor, type ScriptOwnerFacts } from './SmartScriptEditor';
import './smartai.css';

/**
 * The SmartAI part of an NPC's or object's Scripts tab. Until the rows are opened for editing the
 * project holds nothing of them and the database's rows stay as they are; once opened the project holds all of them, and
 * what differs from the database is written over it.
 */
export function SmartScriptsPanel({
  owner, rows, original, unread, blockedReason, onChange,
}: {
  owner: ScriptOwnerFacts;
  /** What the project holds; null leaves the database's rows alone */
  rows: SmartRow[] | null;
  /** The rows the database had when it was taken into the project; undefined for a new one that has none yet */
  original: readonly SmartRow[] | undefined;
  /** The entity was taken into the project before its rows were read: what the database has is not known here */
  unread?: boolean;
  /** Why the rows cannot be edited, when they cannot */
  blockedReason?: string;
  onChange(rows: SmartRow[] | null): void;
}): React.JSX.Element {
  const noun = owner.kind === 'creature' ? 'NPC' : 'object';
  if (rows === null) {
    return (
      <section className="sai-panel" aria-label="SmartAI rows">
        <h3 className="sai-panel__title">SmartAI rows</h3>
        <p className="scene-hint">
          {unread
            ? `The SmartAI rows the database runs on this ${noun} were not read when it was taken into the project.`
            : original === undefined
            ? `This ${noun} has no SmartAI rows yet.`
            : original.length === 0
              ? `The database runs no SmartAI rows on this ${noun}.`
              : `The database runs ${original.length} SmartAI ${original.length === 1 ? 'row' : 'rows'} on this ${noun} (with its spawns and action lists). They stay as they are until you edit them.`}
        </p>
        {blockedReason && <p className="scene-hint">{blockedReason}</p>}
        <button type="button" className="btn" disabled={blockedReason !== undefined} onClick={() => onChange(original ? original.map((r) => ({ ...r })) : [])}>
          {original && original.length > 0 ? 'Edit the SmartAI rows' : 'Write SmartAI rows'}
        </button>
        <details className="sai-find">
          <summary>Find scripts that use something</summary>
          <ScriptSearchPanel entry={owner.entry} entryLabel={owner.name.trim() || undefined} />
        </details>
      </section>
    );
  }
  const unchanged = sameRowSets(rows, original ?? []);
  return (
    <section className="sai-panel" aria-label="SmartAI rows">
      <h3 className="sai-panel__title">SmartAI rows</h3>
      <p className="scene-hint">
        {unchanged ? 'Open for editing, nothing changed yet.' : 'These rows replace the ones the database has for this ' + noun + ' when you export.'}
      </p>
      <SmartScriptEditor owner={owner} rows={rows} onChange={onChange} />
      <button type="button" className="btn btn--small" onClick={() => onChange(null)}>Leave the database rows as they are</button>
    </section>
  );
}
