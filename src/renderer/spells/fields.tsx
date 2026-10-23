import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Bit, Choice } from '@core/smartai/types';
import { hasBit, toggleBit } from '@core/spells/catalogue';
import { iconClientPath, iconName, type SpellLookups } from '@core/spells/lookups';
import { SpellIconImage } from './SpellIconImage';

/** A number box that lets the author clear it while typing; nothing is stored until it holds a number */
export function Num({ label, value, onChange, step = 1, min, max, hint, disabled }: {
  label: string; value: number; onChange(n: number): void; step?: number | 'any'; min?: number; max?: number; hint?: string | null; disabled?: boolean;
}): React.JSX.Element {
  const id = useId();
  const [local, setLocal] = useState(String(value));
  const known = useRef(value);
  const focused = useRef(false);
  // The box follows the stored value, except while the author is typing in it: a half-typed number stays as typed
  useEffect(() => {
    if (value !== known.current && !focused.current) {
      known.current = value;
      setLocal(String(value));
    }
  }, [value]);
  const change = (text: string): void => {
    setLocal(text);
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) return;
    known.current = n;
    onChange(n);
  };
  return (
    <div className="scene-field scene-field--short">
      <label htmlFor={id} className="sheet-label">{label}</label>
      <input id={id} type="number" step={step} min={min} max={max} value={local} disabled={disabled} onChange={(e) => change(e.target.value)}
        onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; known.current = value; setLocal(String(value)); }} />
      {hint && <small className="scene-hint">{hint}</small>}
    </div>
  );
}

/** A dropdown of named values; a value the list lacks is kept and shown as unknown */
export function Pick({ label, value, options, onChange, hint, disabled }: {
  label: string; value: number; options: readonly Choice[]; onChange(n: number): void; hint?: string | null; disabled?: boolean;
}): React.JSX.Element {
  const id = useId();
  const known = options.some(([v]) => v === value);
  return (
    <div className="scene-field">
      <label htmlFor={id} className="sheet-label">{label}</label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
        {!known && <option value={value}>Unknown ({value})</option>}
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
      {hint && <small className="scene-hint">{hint}</small>}
    </div>
  );
}

/** Named toggles for an unsigned mask (bit 31 works, which the shared toggles cannot do) */
export function Mask({ label, bits, value, onChange, disabled }: { label: string; bits: readonly Bit[]; value: number; onChange(n: number): void; disabled?: boolean }): React.JSX.Element {
  return (
    <fieldset className="sai-bits" disabled={disabled}>
      <legend>{label}</legend>
      <div className="sai-bits__row">
        {bits.map((b) => {
          const on = hasBit(value, b.value);
          return (
            <button key={b.value} type="button" aria-pressed={on} title={b.help} className={`sai-bit${on ? ' sai-bit--on' : ''}`} onClick={() => onChange(toggleBit(value, b.value, !on))}>
              {b.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A table row picked from a list, each shown by its readable label: cast times, ranges, durations, radii */
export function TablePick({ label, value, ids, labelOf, onChange, disabled, hint }: {
  label: string; value: number; ids: readonly number[]; labelOf(id: number): string; onChange(n: number): void; disabled?: boolean; hint?: string | null;
}): React.JSX.Element {
  const options = useMemo<Choice[]>(() => [[0, 'None'], ...[...ids].sort((a, b) => a - b).map((id) => [id, `${labelOf(id)} (#${id})`] as const)], [ids, labelOf]);
  return <Pick label={label} value={value} options={options} onChange={onChange} disabled={disabled} hint={hint} />;
}

const ICON_RESULTS = 48;

/** The spell's icon: the one chosen, and a search of every icon of the client by name, each drawn */
export function IconPicker({ value, lookups, onChange, disabled }: { value: number; lookups: SpellLookups; onChange(id: number): void; disabled?: boolean }): React.JSX.Element {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const found = useMemo(() => {
    const needle = text.trim().toLowerCase();
    if (!open || needle === '') return [];
    const out: number[] = [];
    for (const [id, path] of lookups.icons) {
      if (path.toLowerCase().includes(needle) || String(id) === needle) out.push(id);
      if (out.length >= ICON_RESULTS) break;
    }
    return out;
  }, [open, text, lookups]);
  return (
    <div className="spell-icon-picker">
      <div className="spell-icon-picker__current">
        <SpellIconImage path={iconClientPath(lookups, value)} name={iconName(lookups, value)} size={48} />
        <div>
          <strong>{iconName(lookups, value)}</strong>
          <div className="scene-hint">Icon #{value}</div>
        </div>
        <button type="button" className="btn" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Change icon'}</button>
      </div>
      {open && (
        <>
          <label className="scene-field">
            <span>Search icons by name or number</span>
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="fire, frost bolt, 136…" />
          </label>
          {text.trim() !== '' && found.length === 0 && <p className="scene-hint">No icon matches.</p>}
          <ul className="spell-icon-picker__grid" aria-label="Icons found">
            {found.map((id) => (
              <li key={id}>
                <button type="button" className="spell-icon-picker__item" title={`${iconName(lookups, id)} (#${id})`} aria-label={`${iconName(lookups, id)} #${id}`}
                  onClick={() => { onChange(id); setOpen(false); }}>
                  <SpellIconImage path={iconClientPath(lookups, id)} name={iconName(lookups, id)} size={36} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
