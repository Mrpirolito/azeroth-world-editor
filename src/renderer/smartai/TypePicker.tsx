import { useId, useMemo, useState } from 'react';
import { pickable, typeOf } from '@core/smartai/catalogue';
import type { TypeDef, TypeKind } from '@core/smartai/types';

const matches = (t: TypeDef, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return String(t.id) === q || t.name.toLowerCase().includes(q) || t.key.toLowerCase().includes(q.replace(/\s+/g, '_')) || t.help.toLowerCase().includes(q);
};

/**
 * An event, action or target type chosen from a list you can search by name, constant or id. A type
 * that is not in the list (a row from a newer server) stays shown by its number and is kept until
 * another is picked.
 */
export function TypePicker({
  kind, label, value, onChange, allowed, disabled,
}: {
  kind: TypeKind;
  label: string;
  value: number;
  onChange(id: number): void;
  /** Narrows the list, e.g. to the events a kind of script supports; the current choice is always kept */
  allowed?(t: TypeDef): boolean;
  disabled?: boolean;
}): React.JSX.Element {
  const listId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const current = typeOf(kind, value);
  const options = useMemo(() => pickable(kind, value).filter((t) => t.id === value || !allowed || allowed(t)).filter((t) => matches(t, query)), [kind, value, allowed, query]);

  const choose = (id: number): void => {
    setOpen(false);
    setQuery('');
    if (id !== value) onChange(id);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault();
      choose(options[active]!.id);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div className="sai-type">
      <label htmlFor={inputId} className="sai-type__label">{label}</label>
      <input
        id={inputId} type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" disabled={disabled}
        value={open ? query : (current?.name ?? `Unknown ${kind} ${value}`)} placeholder={open ? (current?.name ?? '') : undefined}
        onFocus={(e) => { setOpen(true); setQuery(''); setActive(0); e.currentTarget.select(); }}
        onBlur={() => { setOpen(false); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} choices`} className="sai-type__list">
          {options.length === 0 && <li className="sai-type__none">Nothing matches</li>}
          {options.map((t, i) => (
            <li key={t.id} role="option" aria-selected={t.id === value} className={`sai-type__option${i === active ? ' sai-type__option--active' : ''}`}
              // mousedown, not click: the input loses focus (and the list closes) before a click lands
              onMouseDown={(e) => { e.preventDefault(); choose(t.id); }} onMouseEnter={() => setActive(i)}>
              <span>{t.name}</span>
              <small>{t.id}</small>
            </li>
          ))}
        </ul>
      )}
      {current && <p className="sai-type__help">{current.help}</p>}
    </div>
  );
}
