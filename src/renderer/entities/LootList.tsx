import { LOOT_SOURCE } from '@core/conditions/catalogue';
import type { LootRow } from '@core/entities/model';
import type { RowSet } from '@core/tables/types';
import { CheckField, EntityField, NumberField } from '../scripts/fields';
import { ConditionsDetails } from '../tables/ConditionsEditor';

const NEW_ROW: LootRow = { item: 0, chance: 100, min: 1, max: 1, questOnly: false };

/** Where the rows are written, so each item can carry conditions in the conditions table */
export interface LootConditions {
  table: 'creature_loot_template' | 'gameobject_loot_template';
  /** The loot list id the rows go under (conditions' SourceGroup) */
  listId: number;
  owner: NonNullable<RowSet['owner']>;
}

/** What a new NPC drops or a new chest holds: each item with its chance and how many, and when it drops. */
export function LootList({ idPrefix, loot, onChange, conditions }: { idPrefix: string; loot: readonly LootRow[]; onChange(next: LootRow[]): void; conditions?: LootConditions }): React.JSX.Element {
  const set = (i: number, row: LootRow): void => onChange(loot.map((r, j) => (j === i ? row : r)));
  return (
    <div className="scene-section">
      <h4 className="scene-section__title">Loot</h4>
      <p className="scene-hint">Items this quest asks for drop through Objectives, not here.</p>
      <ol className="scene-steps">
        {loot.map((row, i) => (
          <li key={i} className="scene-step">
            <div className="scene-step__head">
              <strong>Item {i + 1}</strong>
              <button type="button" className="entry-card__btn entry-card__btn--danger" onClick={() => onChange(loot.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
            <EntityField id={`${idPrefix}-loot${i}`} label="Item" kind="item" value={row.item} onChange={(item) => set(i, { ...row, item })} />
            <div className="scene-row">
              <NumberField label="Chance (%)" value={row.chance} min={0} onChange={(chance) => set(i, { ...row, chance })} />
              <NumberField label="Least" value={row.min} min={1} onChange={(min) => set(i, { ...row, min: Math.round(min) })} />
              <NumberField label="Most" value={row.max} min={1} onChange={(max) => set(i, { ...row, max: Math.round(max) })} />
            </div>
            <CheckField label="Only while the quest is in the log" value={row.questOnly} onChange={(questOnly) => set(i, { ...row, questOnly })} />
            {conditions && row.item > 0 && (
              <ConditionsDetails source={{ type: LOOT_SOURCE[conditions.table]!, group: conditions.listId, entry: row.item }} owner={conditions.owner} idPrefix={`${idPrefix}-loot${i}-cond`} label="Only drops when" />
            )}
          </li>
        ))}
      </ol>
      <button type="button" className="btn" onClick={() => onChange([...loot, { ...NEW_ROW }])}>
        Add loot
      </button>
    </div>
  );
}
