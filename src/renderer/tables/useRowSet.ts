import { useCallback, useEffect, useRef, useState } from 'react';
import { findSet, rowsetIssues, withSet } from '@core/tables/rowset';
import { specOf } from '@core/tables/specs';
import { setKey, type Row, type RowSet } from '@core/tables/types';
import { useApi } from '../state/names';
import { useProjectEntities } from '../state/project-entities';

export interface RowSetState {
  /** The database is being read */
  loading: boolean;
  /** Whether there is a project and a database to edit against */
  usable: boolean;
  /** False when the database has no such table */
  exists: boolean;
  /** The table's columns in this database; empty until read */
  columns: readonly string[];
  /** The rows as the project holds them, else as the database has them */
  rows: readonly Row[];
  /** Whether the project holds a changed copy */
  changed: boolean;
  /** What is wrong with the rows as held, in a sentence each; empty while they are as the database has them */
  issues: readonly string[];
  /** Holds these rows for the table and scope; a set left as the database has it is dropped */
  change(rows: Row[]): void;
}

/**
 * The rows of one table under one scope, for a sheet: read from the world database once, held in the
 * project's store as soon as they are changed. Outside a project (no store) nothing can be edited.
 */
export function useRowSet(table: string, scope: Readonly<Record<string, string>>, owner?: RowSet['owner']): RowSetState {
  const project = useProjectEntities();
  const api = useApi();
  const key = setKey(table, scope);
  const [read, setRead] = useState<{ key: string; exists: boolean; columns: string[]; rows: Row[] } | null>(null);
  useEffect(() => {
    if (!api) return undefined;
    let live = true;
    void api.tableRows(table, { ...scope }).then((result) => {
      if (live) setRead({ key, exists: result.ok ? result.value.exists : true, columns: result.ok ? result.value.columns : [], rows: result.ok ? result.value.rows : [] });
    });
    return () => {
      live = false;
    };
    // The scope is in the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, table, key]);

  const set = findSet(project?.entities.rowsets, table, scope);
  const mine = read?.key === key ? read : null;
  // Rows another editor owns (set 1 of equipment, the first model) are not this sheet's to show or write
  const owns = specOf(table)?.own;
  const original = set?.original ?? (owns ? (mine?.rows ?? []).filter(owns) : (mine?.rows ?? []));
  const rows = set?.rows ?? original;
  // The latest store, so two edits in a row do not write over each other
  // What the database holds must be known before a change is kept: the set remembers it to put it back
  const ready = set !== undefined || mine !== null || api === null;
  const latest = useRef({ project, original, owner, scope, ready });
  latest.current = { project, original, owner, scope, ready };
  const change = useCallback(
    (next: Row[]): void => {
      const { project: p, original: was, owner: who, scope: at, ready: known } = latest.current;
      if (!p || !known) return;
      p.setEntities({ ...p.entities, rowsets: withSet(p.entities.rowsets, { table, scope: { ...at }, original: was, rows: next, ...(who ? { owner: who } : {}) }) });
    },
    [table],
  );
  const issues = set ? rowsetIssues([set]).map((i) => i.message.replace(/^[^:]*: /, '')) : [];
  return { loading: Boolean(api) && !mine && !set, usable: project !== null && api !== null, exists: mine?.exists ?? true, columns: mine?.columns ?? [], rows, changed: set !== undefined, issues, change };
}
