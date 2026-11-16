// How voice-bar finds, checks, starts, stops and toggles Handy on each system.
// Every command is an argument list run without a shell, except the two
// documented launchers (`cmd /c start` on Windows, `sh -c` on Linux), which
// get the path as a separate, checked argument.

import type { EngineInterface, ProcessRunResult } from 'claude-code'

export type Os = 'windows' | 'mac' | 'linux'

const TIMEOUT = 5000

/** Detect the system from the environment, without any extra permission. */
export async function detectOs($: EngineInterface): Promise<Os> {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'windows'
  if (await $.fs.exists('/Applications')) return 'mac'
  return 'linux'
}

/** The usual install places of Handy, most likely first. */
export async function defaultPaths($: EngineInterface, os: Os): Promise<string[]> {
  if (os === 'windows') {
    const local = await $.env.get('LOCALAPPDATA')
    const programs = await $.env.get('ProgramFiles')
    const paths: string[] = []
    if (local !== undefined) paths.push(`${local}\\Handy\\handy.exe`)
    if (programs !== undefined) paths.push(`${programs}\\Handy\\handy.exe`)
    return paths
  }
  if (os === 'mac') return ['/Applications/Handy.app/Contents/MacOS/handy']
  return ['/usr/bin/handy', '/usr/local/bin/handy']
}

/**
 * A path is only used when it names Handy's program and holds no character a
 * launcher could read as a command (`"`, `&`, `|`, `<`, `>`, `^`, `%`, `` ` ``, `$`, newline).
 */
export function isSafeHandyPath(path: string): boolean {
  if (!/(^|[\\/])handy(\.exe)?$/i.test(path)) return false
  return !/["&|<>^%`$\n\r]/.test(path)
}

/** The configured path if it is usable, else the first install place that exists. */
export async function findHandy(
  $: EngineInterface,
  os: Os,
  configured: string,
): Promise<string | undefined> {
  if (configured !== '') return isSafeHandyPath(configured) ? configured : undefined
  for (const path of await defaultPaths($, os)) {
    if (isSafeHandyPath(path) && (await $.fs.exists(path))) return path
  }
  return os === 'linux' ? 'handy' : undefined
}

function run($: EngineInterface, argv: readonly string[]): Promise<ProcessRunResult> {
  return $.process.run(argv, { timeoutMs: TIMEOUT })
}

export async function isRunning($: EngineInterface, os: Os): Promise<boolean> {
  if (os === 'windows') {
    const result = await run($, ['tasklist', '/FI', 'IMAGENAME eq handy.exe', '/NH'])
    return result.stdout.toLowerCase().includes('handy.exe')
  }
  const result = await run($, ['pgrep', '-x', 'handy'])
  return result.exitCode === 0
}

/** Start Handy in the background, its window hidden. */
export async function startHandy($: EngineInterface, os: Os, path: string): Promise<boolean> {
  if (os === 'windows') {
    return (await run($, ['cmd', '/c', 'start', '""', path, '--start-hidden'])).exitCode === 0
  }
  if (os === 'mac') {
    return (await run($, ['open', '-a', 'Handy', '--args', '--start-hidden'])).exitCode === 0
  }
  const script = 'setsid "$0" --start-hidden >/dev/null 2>&1 &'
  return (await run($, ['sh', '-c', script, path])).exitCode === 0
}

/** Quit Handy. */
export async function stopHandy($: EngineInterface, os: Os): Promise<boolean> {
  if (os === 'windows') return (await run($, ['taskkill', '/IM', 'handy.exe', '/F'])).exitCode === 0
  if (os === 'mac') return (await run($, ['osascript', '-e', 'quit app "Handy"'])).exitCode === 0
  return (await run($, ['pkill', '-x', 'handy'])).exitCode === 0
}

/** Start or stop a recording in the running Handy (its documented CLI flag). */
export async function toggleRecording($: EngineInterface, path: string): Promise<ProcessRunResult> {
  return run($, [path, '--toggle-transcription'])
}
