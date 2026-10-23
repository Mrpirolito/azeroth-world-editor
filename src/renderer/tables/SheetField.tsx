import { useEffect, useRef, useState } from 'react';
import type { Field, Row } from '@core/tables/types';
import { SpellField } from '../combat/SpellField';
import { BitToggles } from '../smartai/ParamField';
import { EntityField, TextField } from '../scripts/fields';

/** The text of a column as a number; what is not one reads as 0 */
const numberOf = (value: string | null | undefined): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** A label over its control, with the help under it: the label names the control alone, so it can be found by name */
function Labeled({ id, label, help, short, children }: { id: string; label: string; help?: string | null; short?: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className={`scene-field${short ? ' scene-field--short' : ''}`}>
      <label htmlFor={id} className="sheet-label">{label}</label>
      {children}
      {help && <small className="scene-hint">{help}</small>}
    </div>
  );
}

/** A number box that lets the author clear it while typing; an empty box is NULL where the column may be, else 0 */
function NumberInput({ id, label, value, nullable, step, onChange, hint }: { id: string; label: string; value: string | null; nullable: boolean; step?: string; onChange(v: string | null): void; hint?: string | null }): React.JSX.Element {
  const [local, setLocal] = useState(value ?? '');
  const known = useRef(value);
  useEffect(() => {
    if (value !== known.current) {
      known.current = value;
      setLocal(value ?? '');
    }
  }, [value]);
  const change = (text: string): void => {
    setLocal(text);
    const next = text.trim() === '' ? (nullable ? null : '0') : Number.isFinite(Number(text)) ? String(Number(text)) : null;
    if (next === null && text.trim() !== '') return;
    known.current = next;
    onChange(next);
  };
  return (
    <Labeled id={id} label={label} help={hint} short>
      <input id={id} type="number" step={step ?? 'any'} value={local} placeholder={nullable ? 'default' : undefined} onChange={(e) => change(e.target.value)} />
    </Labeled>
  );
}

/**
 * One field of a table row, as the control its type calls for: number boxes, named toggles for flags,
 * dropdowns for choices, pickers by name for ids. `onChange` hears the column and its new text.
 */
export function SheetField({ id, field, row, onChange }: { id: string; field: Field; row: Row; onChange(column: string, value: string | null): void }): React.JSX.Element {
  const { column, label } = field;
  const value = row[column] ?? null;
  const set = (v: string | null): void => onChange(column, v);
  const help = field.help ? <small className="scene-hint">{field.help}</small> : null;
  switch (field.type) {
    case 'int':
    case 'float': {
      const zero = field.zero !== undefined && numberOf(value) === 0 && value !== null ? `0 = ${field.zero}` : null;
      return <NumberInput id={id} label={label} value={value} nullable={field.nullable ?? false} step={field.type === 'int' ? '1' : 'any'} onChange={set} hint={zero ?? field.help} />;
    }
    case 'text':
      return (
        <div className="sheet-field">
          <TextField label={label} value={value ?? ''} long={field.long} onChange={(text) => set(text === '' && (field.nullable || value === null) ? null : text)} />
          {help}
        </div>
      );
    case 'bool':
      return (
        <label className="scene-field scene-field--check" title={field.help}>
          <input id={id} type="checkbox" checked={numberOf(value) !== 0} onChange={(e) => set(e.target.checked ? '1' : '0')} />
          <span>{label}</span>
        </label>
      );
    case 'enum': {
      const known = value === null || field.options.some(([v]) => String(v) === value);
      return (
        <Labeled id={id} label={label} help={field.help}>
          <select id={id} value={value ?? ''} onChange={(e) => set(e.target.value === '' ? null : e.target.value)}>
            {(field.nullable || value === null) && <option value="">(server default)</option>}
            {!known && <option value={value ?? ''}>Unknown ({value})</option>}
            {field.options.map(([v, text]) => <option key={v} value={String(v)}>{text}</option>)}
          </select>
        </Labeled>
      );
    }
    case 'flags':
      return (
        <div className="sheet-field">
          <BitToggles label={label} bits={field.bits} value={numberOf(value)} onChange={(v) => set(String(v))} />
          {help}
        </div>
      );
    case 'ref':
      return field.kind === 'spell'
        ? <div className="sheet-field"><SpellField id={id} label={label} value={numberOf(value)} onChange={(spell) => set(String(spell))} />{help}</div>
        : <div className="sheet-field"><EntityField id={id} label={label} kind={field.kind} value={numberOf(value)} onChange={(v) => set(String(v))} />{help}</div>;
    case 'part': {
      const size = 2 ** field.width;
      const unit = 2 ** field.shift;
      const part = Math.floor(numberOf(value) / unit) % size;
      const put = (next: number): void => set(String(numberOf(value) - part * unit + (next % size) * unit));
      if (!field.options) return <NumberInput id={id} label={label} value={String(part)} nullable={false} step="1" onChange={(v) => put(numberOf(v))} hint={field.help} />;
      const known = field.options.some(([v]) => v === part);
      return (
        <Labeled id={id} label={label} help={field.help}>
          <select id={id} value={part} onChange={(e) => put(Number(e.target.value))}>
            {!known && <option value={part}>Unknown ({part})</option>}
            {field.options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
          </select>
        </Labeled>
      );
    }
  }
}
