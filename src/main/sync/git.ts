import { execFile } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a program to its end; never rejects for a non-zero exit, only for a program that cannot start */
export type Runner = (cmd: string, args: readonly string[], opts?: { cwd?: string; env?: Record<string, string> }) => Promise<RunResult>;

export const nodeRunner: Runner = (cmd, args, opts) =>
  new Promise((resolve, reject) => {
    execFile(cmd, [...args], { cwd: opts?.cwd, env: opts?.env ? { ...process.env, ...opts.env } : process.env, maxBuffer: 256 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error && typeof (error as { code?: unknown }).code !== 'number') reject(error);
      else resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, stdout, stderr });
    });
  });

/** `git -C <dir> …`, answering stdout trimmed, or throwing git's own message */
export function gitIn(run: Runner, dir: string) {
  return async (...args: string[]): Promise<string> => {
    const r = await run('git', ['-C', dir, ...args]);
    if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed in ${dir}: ${(r.stderr || r.stdout).trim()}`);
    return r.stdout.trim();
  };
}
