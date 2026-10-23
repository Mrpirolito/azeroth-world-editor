import { ITEM_FIELDS } from '@core/tables/item-fields';
import type { Field, Row } from '@core/tables/types';
import type { CustomItem } from '@core/entities/model';
import type { ColumnInfo } from '@core/db/types';
import { SheetField } from './SheetField';

/**
 * The item columns without a typed field (flags, who can use it, sockets, sets, wear), as named toggles and dropdowns. They are kept in the
 * item's `advanced` bag: a value is always written, even 0, so an existing item's flag can be switched off.
 */
export function ItemProperties({ item, onChange, columns }: { item: CustomItem; onChange(next: CustomItem): void; columns: readonly ColumnInfo[] }): React.JSX.Element {
  const known = new Set(columns.map((c) => c.name));
  const fields = ITEM_FIELDS.filter((f) => known.size === 0 || known.has(f.column));
  const row: Row = item.advanced;
  const set = (column: string, value: string | null): void => onChange({ ...item, advanced: { ...item.advanced, [column]: value === null || value === '' ? '0' : value } });
  const groups = [...new Set(fields.map((f) => f.group ?? ''))].sort((a, b) => Number(a === 'Advanced') - Number(b === 'Advanced'));
  return (
    <div className="scripts-body">
      {groups.map((group) => {
        const body = (
          <div className="sheet-grid">
            {fields.filter((f: Field) => (f.group ?? '') === group).map((f) => <SheetField key={f.column} id={`item-${item.entry}-${f.column}`} field={f} row={row} onChange={set} />)}
          </div>
        );
        return group === 'Advanced' ? (
          <details key={group} className="sheet-advanced"><summary>Advanced</summary>{body}</details>
        ) : (
          <fieldset key={group} className="sheet-group" aria-label={group}><legend className="scene-section__title">{group}</legend>{body}</fieldset>
        );
      })}
    </div>
  );
}
