import { specOf } from '@core/tables/specs';
import type { TableSpec } from '@core/tables/types';
import type { CustomItem, CustomNpc, CustomObject } from '@core/entities/model';
import { OBJECT_TYPE_VALUE } from '@core/entities/model';
import { useApi } from '../state/names';
import { Sheet } from './Sheet';
import { useRowSet } from './useRowSet';

const need = (table: string): TableSpec => {
  const spec = specOf(table);
  if (!spec) throw new Error(`No sheet for ${table}`);
  return spec;
};

const ownerOf = (kind: 'creature' | 'gameobject' | 'item', entry: number) => ({ kind, entry }) as const;

/**
 * A loot list the owner's template points at by id. With an id the list is a sheet; without one, a button gives the owner
 * a list of its own: the first id from its entry up that no row of the loot table holds yet.
 */
function ViaLoot({ spec, entry, owner, current, onGive, idPrefix }: { spec: TableSpec; entry: number; owner: ReturnType<typeof ownerOf>; current: number; onGive(id: number): void; idPrefix: string }): React.JSX.Element {
  const api = useApi();
  if (current > 0) return <Sheet spec={spec} scope={{ Entry: String(current) }} owner={owner} idPrefix={idPrefix} />;
  return (
    <section className="scene-section sheet" aria-label={spec.title}>
      <h4 className="scene-section__title">{spec.title}</h4>
      <p className="scene-hint">{spec.blurb} It has no list yet.</p>
      <button type="button" className="btn" disabled={!api} onClick={() => void api?.freeIds(spec.table, 'Entry', entry, 1).then((r) => { if (r.ok) onGive(r.value.ids[0] ?? entry); })}>
        Give it a list
      </button>
    </section>
  );
}

/** A creature template column that names a loot list, read through the Traits sheet so both agree */
function TemplateVia({ spec, npc }: { spec: TableSpec; npc: CustomNpc }): React.JSX.Element {
  const template = useRowSet('creature_template', { entry: String(npc.entry) }, ownerOf('creature', npc.entry));
  const column = spec.via!.column;
  const row = template.rows[0];
  return (
    <ViaLoot spec={spec} entry={npc.entry} owner={ownerOf('creature', npc.entry)} idPrefix={`npc-${npc.entry}-${spec.table}`} current={Number(row?.[column] ?? 0)}
      onGive={(id) => template.change([{ ...(row ?? {}), entry: String(npc.entry), [column]: String(id) }])} />
  );
}

/** Further looks and equipment sets, under the first ones the Look tab edits */
export function NpcMoreLooks({ npc }: { npc: CustomNpc }): React.JSX.Element {
  const owner = ownerOf('creature', npc.entry);
  return (
    <>
      <Sheet spec={need('creature_template_model')} scope={{ CreatureID: String(npc.entry) }} owner={owner} idPrefix={`npc-${npc.entry}-models`} />
      <Sheet spec={need('creature_equip_template')} scope={{ CreatureID: String(npc.entry) }} owner={owner} idPrefix={`npc-${npc.entry}-equip`} />
    </>
  );
}

/** The Traits tab: the template columns the Basics tab leaves out, in groups */
export function NpcTraits({ npc }: { npc: CustomNpc }): React.JSX.Element {
  return (
    <div className="scripts-body">
      <Sheet spec={need('creature_template')} scope={{ entry: String(npc.entry) }} owner={ownerOf('creature', npc.entry)} idPrefix={`npc-${npc.entry}-traits`} />
    </div>
  );
}

/** The Behaviour tab: how it stands and moves, the spells on its bar, what it resists */
export function NpcBehaviour({ npc }: { npc: CustomNpc }): React.JSX.Element {
  const scope = (column: string): Record<string, string> => ({ [column]: String(npc.entry) });
  const owner = ownerOf('creature', npc.entry);
  return (
    <div className="scripts-body">
      <Sheet spec={need('creature_template_addon')} scope={scope('entry')} owner={owner} idPrefix={`npc-${npc.entry}-addon`} />
      <Sheet spec={need('creature_template_movement')} scope={scope('CreatureId')} owner={owner} idPrefix={`npc-${npc.entry}-movement`} />
      <Sheet spec={need('creature_template_resistance')} scope={scope('CreatureID')} owner={owner} idPrefix={`npc-${npc.entry}-resist`} />
      <Sheet spec={need('creature_template_spell')} scope={scope('CreatureID')} owner={owner} idPrefix={`npc-${npc.entry}-spells`} />
    </div>
  );
}

/** The Rewards tab: reputation, quest items, what can be stolen and skinned */
export function NpcRewards({ npc }: { npc: CustomNpc }): React.JSX.Element {
  const owner = ownerOf('creature', npc.entry);
  return (
    <div className="scripts-body">
      <Sheet spec={need('creature_onkill_reputation')} scope={{ creature_id: String(npc.entry) }} owner={owner} idPrefix={`npc-${npc.entry}-rep`} />
      <Sheet spec={need('creature_questitem')} scope={{ CreatureEntry: String(npc.entry) }} owner={owner} idPrefix={`npc-${npc.entry}-qitems`} />
      <TemplateVia spec={need('pickpocketing_loot_template')} npc={npc} />
      <TemplateVia spec={need('skinning_loot_template')} npc={npc} />
    </div>
  );
}

/** The Texts tab: what it says, by group */
export function NpcTexts({ npc }: { npc: CustomNpc }): React.JSX.Element {
  return (
    <div className="scripts-body">
      <Sheet spec={need('creature_text')} scope={{ CreatureID: String(npc.entry) }} owner={ownerOf('creature', npc.entry)} idPrefix={`npc-${npc.entry}-text`} />
    </div>
  );
}

/** The Details tab of an object: what its type reads, its faction and flags, its quest items */
export function ObjectDetails({ object }: { object: CustomObject }): React.JSX.Element {
  const owner = ownerOf('gameobject', object.entry);
  return (
    <div className="scripts-body">
      <Sheet spec={need('gameobject_template')} scope={{ entry: String(object.entry) }} owner={owner} idPrefix={`obj-${object.entry}-details`} context={{ type: String(OBJECT_TYPE_VALUE[object.type]) }} />
      <Sheet spec={need('gameobject_template_addon')} scope={{ entry: String(object.entry) }} owner={owner} idPrefix={`obj-${object.entry}-addon`} />
      <Sheet spec={need('gameobject_questitem')} scope={{ GameObjectEntry: String(object.entry) }} owner={owner} idPrefix={`obj-${object.entry}-qitems`} />
    </div>
  );
}

/** What an item gives when opened */
export function ItemContents({ item }: { item: CustomItem }): React.JSX.Element {
  return (
    <div className="scripts-body">
      <Sheet spec={need('item_loot_template')} scope={{ Entry: String(item.entry) }} owner={ownerOf('item', item.entry)} idPrefix={`item-${item.entry}-contents`} />
    </div>
  );
}

/** What disenchanting, prospecting and milling an item give */
export function ItemBreakdown({ item, onChange }: { item: CustomItem; onChange(next: CustomItem): void }): React.JSX.Element {
  const owner = ownerOf('item', item.entry);
  const disenchant = need('disenchant_loot_template');
  return (
    <div className="scripts-body">
      <ViaLoot spec={disenchant} entry={item.entry} owner={owner} idPrefix={`item-${item.entry}-disenchant`} current={Number(item.advanced.DisenchantID ?? 0)}
        onGive={(id) => onChange({ ...item, advanced: { ...item.advanced, DisenchantID: String(id) } })} />
      <Sheet spec={need('prospecting_loot_template')} scope={{ Entry: String(item.entry) }} owner={owner} idPrefix={`item-${item.entry}-prospecting`} />
      <Sheet spec={need('milling_loot_template')} scope={{ Entry: String(item.entry) }} owner={owner} idPrefix={`item-${item.entry}-milling`} />
    </div>
  );
}
