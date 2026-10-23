import { setSummary } from '@core/tables/rowset';
import type { Field, Row, RowSet, TableSpec } from '@core/tables/types';
import { SheetField } from './SheetField';
import { useRowSet } from './useRowSet';
import './sheets.css';

const ADVANCED = 'Advanced';

/** The fields a row shows: those its columns have in this database and whose `when` holds */
function shown(spec: TableSpec, row: Row, columns: readonly string[], context: Row): Field[] {
  const whole = { ...row, ...context };
  return spec.fields.filter((f) => (columns.length === 0 || columns.includes(f.column)) && (!f.when || f.when.in.includes(Number(whole[f.when.column] ?? NaN))));
}

/** Fields by their group, in the order the groups first appear, with the advanced ones last */
function grouped(fields: readonly Field[]): { group: string; fields: Field[] }[] {
  const order: string[] = [];
  for (const f of fields) if (!order.includes(f.group ?? '')) order.push(f.group ?? '');
  const sorted = [...order.filter((g) => g !== ADVANCED), ...order.filter((g) => g === ADVANCED)];
  return sorted.map((group) => ({ group, fields: fields.filter((f) => (f.group ?? '') === group) }));
}

/** A row's fields in their groups; the advanced group is folded away */
function RowFields({ idPrefix, spec, row, columns, context, onChange }: { idPrefix: string; spec: TableSpec; row: Row; columns: readonly string[]; context: Row; onChange(column: string, value: string | null): void }): React.JSX.Element {
  return (
    <>
      {grouped(shown(spec, row, columns, context)).map(({ group, fields }) => {
        const body = (
          <div className="sheet-grid">
            {fields.map((f) => <SheetField key={f.column + f.label} id={`${idPrefix}-${f.column}-${f.label}`} field={f} row={row} onChange={onChange} />)}
          </div>
        );
        return group === ADVANCED ? (
          <details key={group} className="sheet-advanced">
            <summary>Advanced</summary>
            {body}
          </details>
        ) : (
          <fieldset key={group} className="sheet-group" aria-label={group || spec.title}>
            {group && <legend className="scene-section__title">{group}</legend>}
            {body}
          </fieldset>
        );
      })}
    </>
  );
}

/** Loot rows beside each other, with a total for every group so a chance that cannot be met is seen at once */
function LootRows({ idPrefix, spec, rows, columns, onRow, onRemove }: { idPrefix: string; spec: TableSpec; rows: readonly Row[]; columns: readonly string[]; onRow(i: number, column: string, value: string | null): void; onRemove(i: number): void }): React.JSX.Element {
  const totals = new Map<number, { items: number; chance: number }>();
  for (const row of rows) {
    const group = Number(row.GroupId ?? 0);
    if (group <= 0) continue;
    const have = totals.get(group) ?? { items: 0, chance: 0 };
    totals.set(group, { items: have.items + 1, chance: have.chance + Number(row.Chance ?? 0) });
  }
  const main = spec.fields.filter((f) => f.group !== ADVANCED && (columns.length === 0 || columns.includes(f.column)));
  const rest = spec.fields.filter((f) => f.group === ADVANCED && (columns.length === 0 || columns.includes(f.column)));
  return (
    <>
      <ol className="sheet-loot">
        {rows.map((row, i) => (
          <li key={i} className="sheet-loot__row">
            <div className="sheet-loot__main">
              {main.map((f) => <SheetField key={f.column} id={`${idPrefix}-${i}-${f.column}`} field={f} row={row} onChange={(c, v) => onRow(i, c, v)} />)}
              <button type="button" className="entry-card__btn entry-card__btn--danger" aria-label={`Remove row ${i + 1}`} onClick={() => onRemove(i)}>Remove</button>
            </div>
            {rest.length > 0 && (
              <details className="sheet-advanced">
                <summary>Advanced</summary>
                <div className="sheet-grid">{rest.map((f) => <SheetField key={f.column} id={`${idPrefix}-${i}-${f.column}`} field={f} row={row} onChange={(c, v) => onRow(i, c, v)} />)}</div>
              </details>
            )}
          </li>
        ))}
      </ol>
      {totals.size > 0 && (
        <ul className="sheet-loot__groups" aria-label="Groups">
          {[...totals].sort((a, b) => a[0] - b[0]).map(([group, t]) => (
            <li key={group} className={t.chance > 100.0001 ? 'sheet-loot__group sheet-loot__group--over' : 'sheet-loot__group'}>
              Group {group}: {t.items} {t.items === 1 ? 'item' : 'items'}, chances total {Math.round(t.chance * 100) / 100}%{t.chance > 100.0001 ? ' (more than 100)' : ''}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * One table as a sheet: what it is for, a one-line summary, and its fields in groups (named toggles for flags,
 * dropdowns for choices, pickers for ids), rows of its own for a table with many. Changes are kept in the project.
 */
export function Sheet({ spec, scope, owner, idPrefix, title, context = {} }: { spec: TableSpec; scope: Readonly<Record<string, string>>; owner?: RowSet['owner']; idPrefix: string; title?: string; context?: Row }): React.JSX.Element {
  const set = useRowSet(spec.table, scope, owner);
  const rows = set.rows;
  const heading = (
    <>
      <h4 className="scene-section__title">{title ?? spec.title}</h4>
      <p className="scene-hint">{spec.blurb} <span className="sheet-summary">{setSummary(spec, rows)}</span></p>
    </>
  );
  if (!set.usable) return <section className="scene-section sheet" aria-label={title ?? spec.title}>{heading}<p className="scene-hint">Open a project connected to the world database to edit this.</p></section>;
  if (set.loading) return <section className="scene-section sheet" aria-label={title ?? spec.title}>{heading}<p className="scene-hint">Reading the database…</p></section>;
  if (!set.exists) return <section className="scene-section sheet" aria-label={title ?? spec.title}>{heading}<p className="scene-hint">This database has no {spec.table} table, so there is nothing to edit here.</p></section>;

  const blank = (list: readonly Row[]): Row => ({ ...spec.blank, ...spec.next?.(list), ...scope });
  const edit = (i: number, column: string, value: string | null): void => set.change(rows.map((r, j) => (j === i ? { ...r, ...scope, [column]: value } : r)));

  if (!spec.multi) {
    const row = rows[0];
    return (
      <section className="scene-section sheet" aria-label={title ?? spec.title}>
        {heading}
        <RowFields idPrefix={idPrefix} spec={spec} row={row ?? { ...spec.blank, ...scope }} columns={set.columns} context={context}
          onChange={(column, value) => set.change(row ? [{ ...row, ...scope, [column]: value }] : [{ ...spec.blank, ...scope, [column]: value }])} />
        {row && !spec.overlay && <button type="button" className="btn sheet__clear" onClick={() => set.change([])}>Remove these settings</button>}
        {set.changed && <p className="scene-hint">Changed in this project.</p>}
      </section>
    );
  }
  return (
    <section className="scene-section sheet" aria-label={title ?? spec.title}>
      {heading}
      {spec.loot ? (
        <LootRows idPrefix={idPrefix} spec={spec} rows={rows} columns={set.columns} onRow={edit} onRemove={(i) => set.change(rows.filter((_, j) => j !== i))} />
      ) : (
        <ol className="scene-steps">
          {rows.map((row, i) => (
            <li key={i} className="scene-step">
              <div className="scene-step__head">
                <strong>{spec.title} {i + 1}</strong>
                <button type="button" className="entry-card__btn entry-card__btn--danger" aria-label={`Remove ${spec.title} ${i + 1}`} onClick={() => set.change(rows.filter((_, j) => j !== i))}>Remove</button>
              </div>
              <RowFields idPrefix={`${idPrefix}-${i}`} spec={spec} row={row} columns={set.columns} context={context} onChange={(c, v) => edit(i, c, v)} />
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="btn" onClick={() => set.change([...rows, blank(rows)])}>{spec.loot ? 'Add item' : `Add ${spec.title.toLowerCase()}`}</button>
      {set.changed && <p className="scene-hint">Changed in this project.</p>}
    </section>
  );
}
