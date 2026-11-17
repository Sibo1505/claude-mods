// How voice-bar finds, checks, starts, stops and toggles Handy on each system.
// Every command is an argument list run without a shell, except the launchers
// that need one (PowerShell's Start-Process on Windows, `sh -c` on Linux),
// which get the path as a separate, checked argument.

import type { EngineInterface, ProcessRunResult } from 'claude-code'

export type Os = 'windows' | 'mac' | 'linux'

/** What the process list says about Handy; `unknown` when it could not be read. */
export type HandyProcess = 'running' | 'off' | 'unknown'

const TIMEOUT = 5000

/**
 * Run a command. One that cannot start (a missing program) or takes too long
 * reads as exit code -1 with the reason in stderr, so callers never throw.
 */
export async function run($: EngineInterface, argv: readonly string[]): Promise<ProcessRunResult> {
  try {
    return await $.process.run(argv, { timeoutMs: TIMEOUT })
  } catch (error) {
    return {
      exitCode: -1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      isStdoutTruncated: false,
      isStderrTruncated: false,
    }
  }
}

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
 * A path is only used when it names Handy's program (`handy`, `handy.exe`, or
 * Handy's Linux AppImage such as `Handy_0.10.1_amd64.AppImage`) and holds no
 * character a launcher could read as a command (`"`, `&`, `|`, `<`, `>`, `^`,
 * `%`, `` ` ``, `$`, newline).
 */
export function isSafeHandyPath(path: string): boolean {
  const isHandy =
    /(^|[\\/])handy(\.exe)?$/i.test(path) || /(^|[\\/])handy[\w.-]*\.appimage$/i.test(path)
  if (!isHandy) return false
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
  if (os === 'linux') {
    // Elsewhere on the PATH (a local install, a renamed AppImage).
    const found = await run($, ['sh', '-c', 'command -v handy'])
    const path = found.stdout.trim()
    if (found.exitCode === 0 && isSafeHandyPath(path)) return path
  }
  return undefined
}

/** Ask the process list whether Handy runs. */
export async function handyProcess($: EngineInterface, os: Os): Promise<HandyProcess> {
  if (os === 'windows') {
    const result = await run($, ['tasklist', '/FI', 'IMAGENAME eq handy.exe', '/NH'])
    if (result.exitCode !== 0) return 'unknown'
    return result.stdout.toLowerCase().includes('handy.exe') ? 'running' : 'off'
  }
  // -i: the process may be named `handy` or `Handy`. Exit 1 means no match.
  const result = await run($, ['pgrep', '-xi', 'handy'])
  if (result.exitCode === 0) return 'running'
  if (result.exitCode === 1) return 'off'
  return 'unknown'
}

/** Start Handy in the background, its window hidden. */
export async function startHandy($: EngineInterface, os: Os, path: string): Promise<ProcessRunResult> {
  if (os === 'windows') {
    // Start-Process returns at once and leaves Handy running; the path arrives
    // as the script block's own argument, never as part of the script.
    return run($, [
      'powershell',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '& { Start-Process -FilePath $args[0] -ArgumentList "--start-hidden" }',
      path,
    ])
  }
  if (os === 'mac') return run($, ['open', '-a', 'Handy', '--args', '--start-hidden'])
  return run($, ['sh', '-c', 'setsid "$0" --start-hidden >/dev/null 2>&1 &', path])
}

/** Ask Handy to quit, the way closing it normally would. */
export async function stopHandy($: EngineInterface, os: Os): Promise<ProcessRunResult> {
  if (os === 'windows') return run($, ['taskkill', '/IM', 'handy.exe'])
  if (os === 'mac') return run($, ['osascript', '-e', 'quit app "Handy"'])
  return run($, ['pkill', '-xi', 'handy'])
}

/** End Handy at once: only when asking it to quit did not work. */
export async function forceStopHandy($: EngineInterface, os: Os): Promise<ProcessRunResult> {
  if (os === 'windows') return run($, ['taskkill', '/IM', 'handy.exe', '/F'])
  return run($, ['pkill', '-KILL', '-xi', 'handy'])
}

/** Start or stop a recording in the running Handy (its documented CLI flag). */
export async function toggleRecording($: EngineInterface, path: string): Promise<ProcessRunResult> {
  return run($, [path, '--toggle-transcription'])
}

/**
 * True when an edit looks like a dictated text arriving: pasted (no single
 * key), at least two visible characters, one line. A typed key, a keybinding
 * newline or a short burst of keys does not count.
 */
export function looksLikeTranscript(key: unknown, inputText: string): boolean {
  if (key !== undefined) return false
  const visible = inputText.trim()
  return visible.length >= 2 && !visible.includes('\n')
}
