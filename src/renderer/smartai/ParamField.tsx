import { PHASE_BITS } from '@core/smartai/catalogue';
import { timeText } from '@core/smartai/format';
import type { TextLine } from '@core/smartai/read';
import type { Bit, ParamDef } from '@core/smartai/types';
import { SpellField } from '../combat/SpellField';
import { EntityField, NumberField } from '../scripts/fields';

/** Everything a parameter field may need besides its own value */
export interface FieldContext {
  /** The creature's `creature_text` lines, to show what a text group says */
  texts: readonly TextLine[];
  disabled?: boolean;
}

/** A set of named bits as toggle buttons; the value is their sum */
export function BitToggles({ label, bits, value, onChange, disabled }: { label: string; bits: readonly Bit[]; value: number; onChange(v: number): void; disabled?: boolean }): React.JSX.Element {
  return (
    <fieldset className="sai-bits" disabled={disabled}>
      <legend>{label}</legend>
      <div className="sai-bits__row">
        {bits.map((b) => {
          const on = (value & b.value) === b.value;
          return (
            <button key={b.value} type="button" aria-pressed={on} title={b.help} className={`sai-bit${on ? ' sai-bit--on' : ''}`} onClick={() => onChange(on ? value & ~b.value : value | b.value)}>
              {b.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const hint = (def: ParamDef, value: number): string | null => {
  if (value === 0 && def.zero !== undefined) return `0 = ${def.zero}`;
  if (def.kind === 'ms' && value >= 1000) return timeText(value);
  return def.help ?? null;
};

/** One event, action or target parameter, as the field its meaning calls for */
export function ParamField({ id, def, value, onChange, ctx }: { id: string; def: ParamDef; value: number; onChange(v: number): void; ctx: FieldContext }): React.JSX.Element {
  const { disabled } = ctx;
  const note = hint(def, value);
  let field: React.ReactNode;
  switch (def.kind) {
    case 'spell':
      field = <SpellField id={id} label={def.label} value={value} onChange={(spell) => onChange(spell)} />;
      break;
    case 'creature':
    case 'gameobject':
    case 'item':
    case 'quest':
      field = <EntityField id={id} label={def.label} kind={def.kind} value={value} onChange={onChange} />;
      break;
    case 'bool':
      field = (
        <label className="scene-field scene-field--check">
          <input type="checkbox" checked={value !== 0} disabled={disabled} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />
          <span>{def.label}</span>
        </label>
      );
      break;
    case 'enum': {
      const known = def.options?.some(([v]) => v === value) ?? false;
      field = (
        <label className="scene-field">
          <span>{def.label}</span>
          <select value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
            {!known && <option value={value}>Unknown ({value})</option>}
            {def.options?.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
          </select>
        </label>
      );
      break;
    }
    case 'flags':
      field = <BitToggles label={def.label} bits={def.bits ?? []} value={value} onChange={onChange} disabled={disabled} />;
      break;
    case 'phaseMask':
      field = <BitToggles label={def.label} bits={PHASE_BITS} value={value} onChange={onChange} disabled={disabled} />;
      break;
    case 'phase':
      field = (
        <label className="scene-field">
          <span>{def.label}</span>
          <select value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
            {value === 0 && <option value={0}>{def.zero ?? 'None'}</option>}
            {PHASE_BITS.map((_, i) => <option key={i + 1} value={i + 1}>{`Phase ${i + 1}`}</option>)}
          </select>
        </label>
      );
      break;
    default:
      field = <NumberField label={`${def.label}${def.kind === 'ms' ? ' (ms)' : def.kind === 'sec' ? ' (s)' : def.kind === 'yards' ? ' (yd)' : def.kind === 'pct' ? ' (%)' : ''}`} value={value} onChange={onChange} disabled={disabled} />;
  }
  const lines = def.kind === 'textGroup' ? ctx.texts.filter((t) => t.group === value) : [];
  return (
    <div className="sai-param">
      {field}
      {note && def.kind !== 'bool' && <small className="sai-param__note">{note}</small>}
      {def.kind === 'textGroup' && (lines.length > 0 || value > 0) && (
        <small className="sai-param__note">{lines.length > 0 ? `"${lines[0]!.text}"${lines.length > 1 ? ` and ${lines.length - 1} more` : ''}` : 'No such group in creature_text'}</small>
      )}
    </div>
  );
}
