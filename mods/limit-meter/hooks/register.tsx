import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { LimitSnapshot, LimitWindow } from '../types'
import { buildSegments, hasFigures } from './format'
import type { Lang } from './format'

const snapshot = atom({ plugin: 'limit-meter', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})
const now = atom({ plugin: 'limit-meter', key: 'now' } as const, 0)

const MINUTE = 60_000
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

export const register: Register = (on, options) => {
  const lang: Lang = options.language === 'de' ? 'de' : 'en'

  // Read the figures once at start, and move the countdown once a minute.
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    const usage = await $.session.usage()
    await update($, snapshot, () => toSnapshot(usage.rateLimits, usage.context))

    const tick = async () => {
      const time = await $.clock.now()
      await update($, now, () => time)
    }
    await tick()
    $.clock.every(MINUTE, () => {
      void tick()
    })

    return started
  })

  // Claude Code pushes new figures after each turn and when a limit moves.
  on('session.measure', async ($, e, next) => {
    await update($, snapshot, () => toSnapshot(e.rateLimits, e.context))
    return next(e)
  })

  // Our row first, then Claude Code's own hint line below it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const figures = await read($, snapshot)
    const engineLine = await next(e)
    if (!hasFigures(figures)) return engineLine

    const time = await read($, now)
    const columns = e.viewport?.columns ?? DEFAULT_COLUMNS
    const segments = buildSegments(figures, time, lang, columns)
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
