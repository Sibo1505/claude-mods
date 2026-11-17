import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  SessionContextUsage,
  SessionRateLimit,
  Timer,
} from 'claude-code'

import type { LimitSnapshot, LimitWindow } from '../types'
import { MEDIUM, buildSegments, hasFigures, nextTick } from './format'
import type { Lang } from './format'

const snapshot = atom({ plugin: 'limit-meter', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})
const now = atom({ plugin: 'limit-meter', key: 'now' } as const, 0)

/** Used where the surface has not measured its width. */
const DEFAULT_COLUMNS = 120

function toSnapshot(
  rateLimits: readonly SessionRateLimit[],
  context: SessionContextUsage,
): LimitSnapshot {
  const windowOf = (kind: string): LimitWindow | undefined => {
    const found = rateLimits.find(limit => limit.kind === kind)
    if (found === undefined) return undefined
    return found.resetsAt === undefined
      ? { percent: found.percentUsed }
      : { percent: found.percentUsed, resetsAt: found.resetsAt }
  }

  const result: LimitSnapshot = {}
  const fiveHour = windowOf('five_hour')
  const week = windowOf('seven_day')
  if (fiveHour !== undefined) result.fiveHour = fiveHour
  if (week !== undefined) result.week = week
  if (context.percent !== undefined) result.context = context.percent
  return result
}

// The clock behind the countdown: a chain of single timers. Each tick writes
// the time (one local state write: no model call, no tokens) and plans the
// next one: once a minute, or once a second while a used-up limit's live
// timer is drawn. It runs only where a row is drawn. These variables start
// over on a reload, and session.start sets them again.
let timer: Timer | undefined
let generation = 0
let isInteractive = false
let lastColumns = DEFAULT_COLUMNS

async function tick($: EngineInterface, run: number): Promise<void> {
  if (run !== generation) return
  const time = await $.clock.now()
  await update($, now, () => time)
  const delay = nextTick(await read($, snapshot), time, lastColumns >= MEDIUM)
  if (run !== generation) return
  timer = $.clock.after(delay, () => {
    void tick($, run).catch(() => undefined)
  })
}

/**
 * Start the clock afresh. Called at start and after each new reading, so a
 * timer that was refused or lost comes back with the next turn.
 */
async function restartClock($: EngineInterface): Promise<void> {
  timer?.cancel()
  timer = undefined
  generation += 1
  if (!isInteractive) return
  await tick($, generation)
}

async function remember($: EngineInterface, next: LimitSnapshot): Promise<void> {
  await update($, snapshot, () => next)
  await restartClock($)
}

export const register: Register = (on, options) => {
  const lang: Lang = options.language === 'de' ? 'de' : 'en'

  // Read the figures once at start and start the clock.
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    isInteractive = e.isInteractive
    try {
      const usage = await $.session.usage()
      await remember($, toSnapshot(usage.rateLimits, usage.context))
    } catch {
      // The figures come with the next measurement.
    }
    return started
  })

  // Claude Code pushes new figures after each turn and when a limit moves.
  // Everything beneath runs first; a failure here never stops it.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    try {
      await remember($, toSnapshot(e.rateLimits, e.context))
    } catch {
      // The row keeps the last figures until the next measurement.
    }
    return result
  })

  // Our row first, then Claude Code's own hint line below it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const stored = await read($, snapshot)
    const engineLine = await next(e)
    if (!hasFigures(stored)) return engineLine

    const time = await read($, now)
    const columns = e.viewport?.columns ?? DEFAULT_COLUMNS
    lastColumns = columns
    const segments = buildSegments(stored, time, lang, columns)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text>
          {segments.map(segment =>
            segment.tone !== undefined ? (
              <Text color={segment.tone}>{segment.text}</Text>
            ) : (
              <Text dimColor={segment.isDim === true}>{segment.text}</Text>
            ),
          )}
        </Text>
        {engineLine}
      </Box>
    )
  })
}
