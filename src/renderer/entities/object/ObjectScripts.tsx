import type { CustomObject } from '@core/entities/model';
import { SMART_ROWS_KEY, smartLocked, smartUnread } from '@core/smartai/lock';
import type { SmartRow } from '@core/smartai/row';
import { SmartScriptsPanel } from '../../smartai/SmartScriptsPanel';

/** The Scripts tab of an object: its SmartAI rows, which it runs when used, opened, or told something */
export function ObjectScripts({ object, onChange }: { object: CustomObject; onChange(next: CustomObject): void }): React.JSX.Element {
  const existing = object.origin.kind === 'existing' ? object.origin : null;
  const original = existing ? (existing.original[SMART_ROWS_KEY] as SmartRow[] | undefined) : undefined;
  const blockedReason = smartLocked('object', existing?.original.gameobject_template?.[0])
    ? 'Its AI is not SmartGameObjectAI, so SmartAI rows would never run on it.'
    : existing && smartUnread(existing)
      ? 'This object was brought into the project before its SmartAI rows were read. Choose Put back as the database has it, then edit it again.'
      : undefined;
  return (
    <div className="scripts-body">
      <SmartScriptsPanel owner={{ kind: 'gameobject', entry: object.entry, name: object.name.trim() || `Object ${object.entry}` }} rows={object.smartScripts} original={original} unread={existing !== null && smartUnread(existing)}
        blockedReason={object.smartScripts === null ? blockedReason : undefined} onChange={(smartScripts) => onChange({ ...object, smartScripts })} />
    </div>
  );
}
