import { useEffect, useState } from 'react';
import { specOf } from '@core/tables/specs';
import { useApi } from '../state/names';
import { TableBrowser } from '../tables/TablesDialog';

type SqlRows = { columns: string[]; rows: Record<string, string | null>[] };

/** The rows of one SELECT, or why it failed (a table the connected database lacks) */
function useSql(sql: string): { data: SqlRows | null; problem: string | null } {
  const api = useApi();
  const [state, setState] = useState<{ data: SqlRows | null; problem: string | null }>({ data: null, problem: null });
  useEffect(() => {
    let live = true;
    void api?.sqlQuery(sql).then((r) => { if (live) setState(r.ok ? { data: r.value, problem: null } : { data: null, problem: r.error.message }); });
    return () => { live = false; };
  }, [api, sql]);
  return state;
}

function Rows({ data, label }: { data: SqlRows; label: string }): React.JSX.Element {
  return (
    <div className="sql-result">
      <table aria-label={label}>
        <thead><tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{data.rows.map((row, i) => <tr key={i}>{data.columns.map((c) => <td key={c}>{row[c] ?? 'NULL'}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** A table sheet browser, or a notice when the connected database has no such table */
function TableCard({ table }: { table: string }): React.JSX.Element {
  const spec = specOf(table);
  const { data, problem } = useSql(`SELECT 1 FROM \`${table}\` LIMIT 1`);
  if (!spec) return <p className="scene-hint">{table} is not known to the editor.</p>;
  if (problem) return <p className="scene-hint">{spec.title}: the table {table} is not in the connected database ({problem}). Apply the CoA SQL that creates it, then reconnect.</p>;
  if (!data) return <p className="scene-hint">Looking for {table}...</p>;
  return (
    <section>
      <h4 className="scene-section__title">{spec.title}</h4>
      <TableBrowser spec={spec} />
    </section>
  );
}

export function WorldBosses(): React.JSX.Element {
  const { data, problem } = useSql('SELECT w.entry, t.name, w.difficulty, w.health, w.damage_pct, w.note FROM coa_world_boss_level w LEFT JOIN creature_template t ON t.entry = w.entry ORDER BY w.entry, w.difficulty');
  return (
    <>
      <p className="scene-hint">World bosses read their health and damage per difficulty from coa_world_boss_level (mod-coa-raid-difficulty). The altar that summons a boss is not stored in a table: find it with the SQL console in Tables.</p>
      {problem && <p className="scene-hint">The list needs coa_world_boss_level and creature_template ({problem}).</p>}
      {data && <Rows data={data} label="World bosses" />}
      <TableCard table="coa_world_boss_level" />
    </>
  );
}

const APEX = [
  ['AUTO_PCT', '3%', 'per auto attack, before armour'],
  ['WOLF_PCT', '1%', 'a summoned add, per swing'],
  ['ABILITY_PCT', '4%', 'a normal ability, per victim'],
  ['ABILITY_BUDGET', '7%', 'total per ability hit, averaged pool'],
  ['ABILITY_CAP_PCT', '10%', 'most any single victim takes from one hit'],
  ['HEAVY_PCT', '6%', 'a telegraphed heavy hit'],
  ['PERIODIC_PCT', '1.5%', 'one damage-over-time tick'],
];

export function ScalingAndRunes(): React.JSX.Element {
  const { data, problem } = useSql("SELECT entry, name, description FROM item_template WHERE name LIKE '%Descension%' ORDER BY entry LIMIT 100");
  return (
    <>
      <h4 className="scene-section__title">ApexScaling</h4>
      <p className="scene-hint">Apex bosses (mod-skinpeelerquest) scale their damage from the victim&apos;s health with fixed percentages set in the code (ApexScaling.h), not in a table; every apex boss shares them. A new apex boss only chooses which ability uses which percentage, and its pool is sized from a 15 second damage probe.</p>
      <div className="sql-result">
        <table aria-label="ApexScaling constants">
          <thead><tr><th>Constant</th><th>Value</th><th>Meaning</th></tr></thead>
          <tbody>{APEX.map(([name, value, meaning]) => <tr key={name}><td>{name}</td><td>{value}</td><td>{meaning}</td></tr>)}</tbody>
        </table>
      </div>
      <h4 className="scene-section__title">Runes of Descension</h4>
      <p className="scene-hint">Runes of Descension are items (the currency apex bosses pay out). The items that carry the name:</p>
      {problem && <p className="scene-hint">Could not read item_template ({problem}).</p>}
      {data && <Rows data={data} label="Descension items" />}
    </>
  );
}

export function Pools(): React.JSX.Element {
  return (
    <>
      <p className="scene-hint">Gathering nodes (the GatherMate import) and rare spawns share the pool tables: a pool shows at most max_limit of its members; a node is a gameobject spawn (guid) listed in pool_gameobject, and pools can sit inside a mother pool.</p>
      {['pool_template', 'pool_gameobject', 'pool_creature', 'pool_pool'].map((t) => <TableCard key={t} table={t} />)}
    </>
  );
}

const CHECKLIST: { title: string; items: string[] }[] = [
  { title: 'Ids', items: ['Every new id is unique: creature_template.entry, spell, item, quest, gameobject, display ids and pool entries; use Free ids in Tables and let the PR export check them against main.', 'Reuse the ids an existing PR of the same system already claims instead of picking a second set.'] },
  { title: 'Tables touched', items: ['creature_template, creature_template_model, creature (spawn), creature_loot_template', 'coa_world_boss_level (health and damage per difficulty) for a world boss', 'quest_template, quest_template_addon, quest POI rows, conditions', 'pool_template / pool_creature / pool_gameobject for nodes and rare spawns'] },
  { title: 'Client patch', items: ['Every new model, texture and DBC record is in the client patch (Spells > Export); the MPQ is loaded after the retail patches.', 'New items have an Item.dbc row (item_dbc) and a ClientItemPatches entry in the server.'] },
  { title: 'Quest POI', items: ['A quest POI has at most 12 points per area; more are ignored by the client.'] },
  { title: 'Scaling', items: ['An apex boss has its ApexScaling profile chosen per ability (ApexScaling.h) and no table row; a world boss has rows in coa_world_boss_level for every difficulty it runs on.'] },
  { title: 'Tests and PR', items: ['Test it in game: the fix fails before and passes after.', 'Run the project verification, then the PR export (it checks the ids against main and lints the SQL).', 'Open the pull request only after the test passes.'] },
];

export function Checklist(): React.JSX.Element {
  return (
    <>
      {CHECKLIST.map((g) => (
        <section key={g.title}>
          <h4 className="scene-section__title">{g.title}</h4>
          <ul>{g.items.map((i) => <li key={i}><label><input type="checkbox" /> {i}</label></li>)}</ul>
        </section>
      ))}
    </>
  );
}
