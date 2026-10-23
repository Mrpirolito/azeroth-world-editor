import { useCallback, useEffect, useRef, useState } from 'react';
import { findRecord, withRecord, withoutRecord } from '@core/dbc/edits';
import type { DbcValue } from '@core/game/dbc-file';
import { buildLookups, type DbcRow, type SpellLookups } from '@core/spells/lookups';
import type { Issue } from '@core/validate/validate';
import { useApi } from '../state/names';
import { useProjectEntities } from '../state/project-entities';

const LOOKUP_FILES = ['SpellCastTimes.dbc', 'SpellRange.dbc', 'SpellDuration.dbc', 'SpellRadius.dbc', 'SpellIcon.dbc'] as const;

const EMPTY: SpellLookups = buildLookups({});

/**
 * The tables a spell points at, read from the server's DBC files with the project's edits laid over them. They are
 * read again when the project changes one of them (a new icon or range made in the DBC tables).
 */
export function useSpellLookups(): { lookups: SpellLookups; ready: boolean; reason: string | null } {
  const api = useApi();
  const project = useProjectEntities();
  const dep = JSON.stringify((project?.entities.dbcEdits ?? []).filter((e) => LOOKUP_FILES.some((f) => f.toLowerCase() === e.file.toLowerCase())));
  const [state, setState] = useState<{ lookups: SpellLookups; ready: boolean; reason: string | null }>({ lookups: EMPTY, ready: false, reason: null });
  useEffect(() => {
    if (!api) {
      setState({ lookups: EMPTY, ready: true, reason: 'Open a project connected to a world database to read the client tables.' });
      return undefined;
    }
    let live = true;
    void Promise.all(LOOKUP_FILES.map((f) => api.dbcTable(f))).then((results) => {
      if (!live) return;
      const failed = results.find((r) => !r.ok);
      const rows = results.map((r): DbcRow[] => (r.ok ? r.value.rows.map((x) => ({ id: x.id, values: x.values })) : []));
      setState({
        lookups: buildLookups({ castTimes: rows[0], ranges: rows[1], durations: rows[2], radii: rows[3], icons: rows[4] }),
        ready: true,
        reason: failed && !failed.ok ? failed.error.message : null,
      });
    });
    return () => {
      live = false;
    };
  }, [api, dep]);
  return state;
}

export interface DbcRecordState {
  loading: boolean;
  /** The record as the project has it, else as the file has it; null when there is none */
  values: DbcValue[] | null;
  state: 'file' | 'changed' | 'new' | null;
  /** Whether the project can hold changes (it is open and the window has a store) */
  editable: boolean;
  /** Holds these values in the project */
  set(values: DbcValue[]): void;
  /** Puts the record back as the file has it, or drops one made here */
  revert(): void;
}

/** One record of a DBC file for an editor: read from the file once, then held in the project as soon as it is changed */
export function useDbcRecord(file: string, id: number | null): DbcRecordState {
  const api = useApi();
  const project = useProjectEntities();
  const [read, setRead] = useState<{ key: string; values: DbcValue[] | null } | null>(null);
  const key = `${file}:${id}`;
  useEffect(() => {
    if (!api || id === null) return undefined;
    let live = true;
    void api.dbcRecord(file, id).then((r) => {
      if (live) setRead({ key, values: r.ok && r.value.row && r.value.row.state === 'file' ? r.value.row.values : null });
    });
    return () => {
      live = false;
    };
  }, [api, file, id, key]);

  const held = id === null ? undefined : findRecord(project?.entities.dbcEdits, file, id);
  const fileValues = read?.key === key ? read.values : null;
  const latest = useRef({ project, held, fileValues, id });
  latest.current = { project, held, fileValues, id };

  const set = useCallback(
    (values: DbcValue[]): void => {
      const { project: p, held: h, fileValues: f, id: at } = latest.current;
      if (!p || at === null) return;
      p.setEntities({ ...p.entities, dbcEdits: nonEmpty(withRecord(p.entities.dbcEdits, file, at, values, h ? h.was : f)) });
    },
    [file],
  );
  const revert = useCallback((): void => {
    const { project: p, id: at } = latest.current;
    if (!p || at === null) return;
    p.setEntities({ ...p.entities, dbcEdits: nonEmpty(withoutRecord(p.entities.dbcEdits, file, at)) });
  }, [file]);

  const values = held ? held.values : fileValues;
  return {
    loading: Boolean(api) && id !== null && !held && read?.key !== key,
    values,
    state: held ? (held.was ? 'changed' : 'new') : fileValues ? 'file' : null,
    editable: project !== null,
    set,
    revert,
  };
}

/** The edits, or undefined when none are left (the store then has no `dbcEdits` at all) */
const nonEmpty = <T,>(edits: T[]): T[] | undefined => (edits.length > 0 ? edits : undefined);

/** The problems of a record, asked of the main process a moment after it stops changing */
export function useDbcIssues(file: string, values: DbcValue[] | null): Issue[] {
  const api = useApi();
  const [issues, setIssues] = useState<Issue[]>([]);
  const text = values ? JSON.stringify(values) : '';
  useEffect(() => {
    if (!api || !values) {
      setIssues([]);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      void api.dbcCheck(file, values).then((r) => {
        if (live) setIssues(r.ok ? r.value.issues : [{ severity: 'error', code: 'CHECK', message: r.error.message }]);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `text` stands for `values`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, file, text]);
  return issues;
}
