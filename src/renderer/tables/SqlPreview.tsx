import { useEffect, useState } from 'react';
import type { Row } from '@core/tables/types';
import { useApi } from '../state/names';

/**
 * The SQL a sheet will write for its rows, and the SQL that puts the database's rows back, asked of the main process while
 * the section is open (and again a moment after the rows change). Nothing is run: this is the same text Export project writes.
 */
export function SqlPreview({ table, scope, rows }: { table: string; scope: Readonly<Record<string, string>>; rows: readonly Row[] }): React.JSX.Element | null {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [out, setOut] = useState<{ sql: string; revert: string; note: string | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const key = JSON.stringify([table, scope, rows]);
  useEffect(() => {
    if (!api || !open) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      void api.tableSql(table, { ...scope }, rows.map((r) => ({ ...r }))).then((r) => {
        if (!live) return;
        setProblem(r.ok ? null : r.error.message);
        setOut(r.ok ? r.value : null);
      });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // The table, scope and rows are in the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, open, key]);
  if (!api) return null;
  return (
    <details className="sheet-advanced sheet-sql" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>SQL this will write</summary>
      {problem && <p role="alert" className="control__alert">{problem}</p>}
      {out?.note && <p className="scene-hint">{out.note}</p>}
      {out && out.sql !== '' && (
        <>
          <pre className="sql-ids" aria-label="SQL to apply">{out.sql}</pre>
          <p className="scene-hint">And to put the database&apos;s rows back:</p>
          <pre className="sql-ids" aria-label="SQL to revert">{out.revert}</pre>
        </>
      )}
    </details>
  );
}
