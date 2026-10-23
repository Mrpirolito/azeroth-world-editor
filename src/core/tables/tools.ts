/** Where the "free ids" tool can look: a table's id column, and the first id worth trying (below it ids belong to Blizzard) */
export interface FreeIdSource {
  label: string;
  table: string;
  column: string;
  from: number;
}

export const FREE_ID_SOURCES: readonly FreeIdSource[] = [
  { label: 'Creature entry', table: 'creature_template', column: 'entry', from: 100000 },
  { label: 'Game object entry', table: 'gameobject_template', column: 'entry', from: 100000 },
  { label: 'Item entry', table: 'item_template', column: 'entry', from: 100000 },
  { label: 'Quest id', table: 'quest_template', column: 'ID', from: 100000 },
  { label: 'Creature spawn guid', table: 'creature', column: 'guid', from: 1000000 },
  { label: 'Game object spawn guid', table: 'gameobject', column: 'guid', from: 1000000 },
  { label: 'Gossip menu id', table: 'gossip_menu', column: 'MenuID', from: 60000 },
  { label: 'Gossip text id', table: 'npc_text', column: 'ID', from: 60000 },
  { label: 'Waypoint path id', table: 'waypoint_data', column: 'id', from: 1000000 },
  { label: 'Page text id', table: 'page_text', column: 'ID', from: 100000 },
  { label: 'Broadcast text id', table: 'broadcast_text', column: 'ID', from: 100000 },
  { label: 'Teleport id', table: 'game_tele', column: 'id', from: 2000 },
  { label: 'Trainer id', table: 'trainer', column: 'Id', from: 1000 },
  { label: 'Spawn group (pool) id', table: 'pool_template', column: 'entry', from: 100000 },
  { label: 'Game event id', table: 'game_event', column: 'eventEntry', from: 100 },
];
