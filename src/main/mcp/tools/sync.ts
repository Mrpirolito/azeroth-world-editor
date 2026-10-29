import { z } from 'zod';
import { defineTool } from '../tool';

/** Aligning the editor with the server's main branch, and turning the project into a pull request against it */
export const syncTools = [
  defineTool({
    name: 'sync_main',
    title: 'Sync with the server main branch',
    description:
      "Fetches the server repo's main, applies every SQL update it adds to the editor's own awe_world database (made from the world database on the first run; the user's own database is never written) and connects the editor to it. Stops at the first failing file and names it.",
    input: {},
    write: false,
    run: async (_args, ctx) => {
      const synced = await ctx.call('syncMain');
      if (synced.ok) ctx.notifyConnected(synced.value.connect);
      return synced;
    },
  }),
  defineTool({
    name: 'export_pr',
    title: 'Export the project as a pull request',
    description:
      "Makes the project's SQL patch a commit on a new branch from main (data/sql/updates/pending_db_world/rev_<date>_<nn>_<slug>.sql), after checking that awe_world is on the current main, the patch applies cleanly, no id is already used and the repo's SQL lint passes. Answers the summary: file, checks, title and description. Nothing is pushed unless confirm is true; show the summary to the user and ask first.",
    input: {
      title: z.string().min(3).max(120).describe('The pull request title, without the "feat(DB/CoA):" prefix.'),
      slug: z.string().regex(/^[a-z0-9_]{1,40}$/).optional().describe('Branch and file name part; made from the title when absent.'),
      confirm: z.boolean().optional().describe('true pushes the branch to the fork and opens the pull request. Only after the user approved the summary.'),
    },
    write: false,
    run: async ({ title, slug, confirm }, ctx) => {
      const prepared = await ctx.call('exportPrPrepare', { title, slug });
      if (!prepared.ok || confirm !== true || !prepared.value.ok) return prepared;
      const published = await ctx.call('exportPrPublish', { slug: prepared.value.slug, confirm: true });
      return published.ok ? { ok: true, value: { ...prepared.value, url: published.value.url } } : published;
    },
  }),
];
