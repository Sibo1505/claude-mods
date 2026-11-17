import { expect, mock, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import {
  bar,
  buildSegments,
  current,
  formatClock,
  formatCountdown,
  formatRemaining,
  MINUTE,
  needsSeconds,
  nextTick,
  toneOf,
} from '../hooks/format'

// Run with: claude plugin test mods/limit-meter
// Each `on(...)` here stands for Claude Code beneath the mod.

const NOW = Date.parse('2026-11-16T12:00:00Z')

const USAGE: SessionUsage = {
  startedAt: NOW,
  context: { window: 200_000, tokens: 18_000, percent: 9 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 6, resetsAt: '2026-11-16T14:26:00Z' },
    { kind: 'seven_day', percentUsed: 6, resetsAt: '2026-11-19T17:00:00Z' },
  ],
}

const HINT = {
  plugin: 'limit-meter',
  component: 'PromptHint',
  requestId: 'prompt-hint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

test('bars, colors and countdowns', () => {
  expect(bar(0)).toBe('▱▱▱▱▱▱▱▱')
  expect(bar(6)).toBe('▰▱▱▱▱▱▱▱')
  expect(bar(52)).toBe('▰▰▰▰▱▱▱▱')
  expect(bar(87)).toBe('▰▰▰▰▰▰▰▱')
  expect(bar(99)).toBe('▰▰▰▰▰▰▰▱')
  expect(bar(100)).toBe('▰▰▰▰▰▰▰▰')
  expect(bar(130)).toBe('▰▰▰▰▰▰▰▰')

  expect(toneOf(49)).toBe('success')
  expect(toneOf(50)).toBe('warning')
  expect(toneOf(80)).toBe('error')

  expect(formatRemaining('2026-11-16T14:26:00Z', NOW, 'de')).toBe('2 h 26 min')
  expect(formatRemaining('2026-11-16T12:41:00Z', NOW, 'en')).toBe('41 min')
  expect(formatRemaining('2026-11-19T17:00:00Z', NOW, 'de')).toBe('3 T 5 h')
  expect(formatRemaining('2026-11-19T17:00:00Z', NOW, 'en')).toBe('3 d 5 h')
  expect(formatRemaining(undefined, NOW, 'en')).toBeUndefined()
})

test('a narrow terminal drops the bars first, then the countdowns', () => {
  const snapshot = {
    fiveHour: { percent: 6, resetsAt: '2026-11-16T14:26:00Z' },
    week: { percent: 6, resetsAt: '2026-11-19T17:00:00Z' },
    context: 9,
  }
  const text = (columns: number) =>
    buildSegments(snapshot, NOW, 'en', columns)
      .map(segment => segment.text)
      .join('')

  expect(text(120)).toBe('5h ▰▱▱▱▱▱▱▱ 6 % · 2 h 26 min   Week ▰▱▱▱▱▱▱▱ 6 % · 3 d 5 h   Context 9 %')
  expect(text(60)).toBe('5h 6 % · 2 h 26 min   Week 6 % · 3 d 5 h   Context 9 %')
  expect(text(40)).toBe('5h 6 %   Week 6 %   Context 9 %')
})

test('the row never wraps: at 80 columns a long German row drops its bars', () => {
  const snapshot = {
    fiveHour: { percent: 42, resetsAt: '2026-11-16T13:03:00Z' },
    week: { percent: 46, resetsAt: '2026-11-16T18:23:00Z' },
    context: 6,
  }
  const text = (columns: number) =>
    buildSegments(snapshot, NOW, 'de', columns)
      .map(segment => segment.text)
      .join('')

  expect(text(100)).toBe('5h ▰▰▰▱▱▱▱▱ 42 % · 1 h 3 min   Woche ▰▰▰▰▱▱▱▱ 46 % · 6 h 23 min   Kontext 6 %')
  expect(text(80)).toBe('5h 42 % · 1 h 3 min   Woche 46 % · 6 h 23 min   Kontext 6 %')
  expect(text(80).length).toBeLessThanOrEqual(76)
})

test('the row shows the limits under the prompt, on terminal and desktop', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...HINT, surface })
    const row = await ui.find({ type: 'Text', text: /Context/ })

    expect(row?.text).toContain('5h ▰▱▱▱▱▱▱▱ 6 % · 2 h 26 min')
    expect(row?.text).toContain('Week ▰▱▱▱▱▱▱▱ 6 % · 3 d 5 h')
    expect(row?.text).toContain('Context 9 %')
    await ui.unmount()
  }
})

test('German labels', { options: { language: 'de' } }, async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  const row = await ui.find({ type: 'Text', text: /Kontext/ })

  expect(row?.text).toContain('Woche ▰▱▱▱▱▱▱▱ 6 % · 3 T 5 h')
  expect(row?.text).toContain('Kontext 9 %')
  await ui.unmount()
})

test('new figures from Claude Code redraw the row', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure({
    context: { window: 200_000, percent: 31 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 87, resetsAt: '2026-11-16T12:41:00Z' },
      { kind: 'seven_day', percentUsed: 52, resetsAt: '2026-11-18T15:00:00Z' },
    ],
    changed: ['rateLimits', 'context'],
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  const row = await ui.find({ type: 'Text', text: /Context/ })

  expect(row?.text).toContain('5h ▰▰▰▰▰▰▰▱ 87 % · 41 min')
  expect(row?.text).toContain('Week ▰▰▰▰▱▱▱▱ 52 % · 2 d 3 h')
  expect(row?.text).toContain('Context 31 %')
  await ui.unmount()
})

test('the countdown moves with the clock', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(60 * 60_000)

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  const row = await ui.find({ type: 'Text', text: /Context/ })

  expect(row?.text).toContain('6 % · 1 h 26 min')
  await ui.unmount()
})

test('before the first reading only Claude Code’s own line is drawn', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /5h/ })).toBeUndefined()
  await ui.unmount()
})

// Times built from local date parts, so these tests pass in every time zone.
// Monday 16 November 2026, 12:00 local time.
const LOCAL_NOON = new Date(2026, 10, 16, 12, 0, 0).getTime()
const IN_2_26_13 = 2 * 3_600_000 + 26 * 60_000 + 13_000

test('live countdown, reset clock and out-of-date windows', () => {
  expect(formatCountdown(IN_2_26_13, 'de')).toBe('2:26:13')
  expect(formatCountdown(59_000, 'en')).toBe('0:00:59')
  expect(formatCountdown(2 * 86_400_000 + 5 * 3_600_000 + 12 * 60_000 + 33_000, 'de')).toBe(
    '2 T 05:12:33',
  )

  expect(formatClock(new Date(2026, 10, 16, 14, 35).getTime(), LOCAL_NOON, 'de')).toBe('14:35')
  expect(formatClock(new Date(2026, 10, 19, 17, 0).getTime(), LOCAL_NOON, 'de')).toBe('Do 17:00')
  expect(formatClock(new Date(2026, 10, 19, 17, 0).getTime(), LOCAL_NOON, 'en')).toBe('Thu 17:00')
  // Six days or more ahead: with the date, so next Monday is not read as today.
  expect(formatClock(new Date(2026, 10, 23, 11, 0).getTime(), LOCAL_NOON, 'de')).toBe('Mo 23.11. 11:00')
  expect(formatClock(new Date(2026, 10, 23, 11, 0).getTime(), LOCAL_NOON, 'en')).toBe('Mon 23 Nov 11:00')

  const passed = { percent: 89, resetsAt: new Date(LOCAL_NOON - 60_000).toISOString() }
  expect(current(passed, LOCAL_NOON)).toEqual({ percent: 0 })

  const full = { percent: 100, resetsAt: new Date(LOCAL_NOON + IN_2_26_13).toISOString() }
  expect(needsSeconds({ fiveHour: full }, LOCAL_NOON)).toBe(true)
  expect(needsSeconds({ fiveHour: { percent: 99, resetsAt: full.resetsAt } }, LOCAL_NOON)).toBe(false)
  // 99.6 is shown as "100 %", so it is used up too.
  expect(needsSeconds({ fiveHour: { percent: 99.6, resetsAt: full.resetsAt } }, LOCAL_NOON)).toBe(true)
  expect(bar(99.6)).toBe('▰▰▰▰▰▰▰▰')

  // Seconds only while a live timer is drawn, landing half-way between seconds.
  expect(nextTick({ fiveHour: full }, LOCAL_NOON, true)).toBe(500)
  expect(nextTick({ fiveHour: full }, LOCAL_NOON, false)).toBe(MINUTE)
  expect(nextTick({ fiveHour: { percent: 40, resetsAt: full.resetsAt } }, LOCAL_NOON, true)).toBe(MINUTE)
})

test('a used-up limit shows a live timer and the reset time', async ($, on) => {
  const clock = mock.clock(on, { now: LOCAL_NOON })
  on('session.usage', () => ({
    value: {
      startedAt: LOCAL_NOON,
      context: { window: 200_000, percent: 40 },
      rateLimits: [
        {
          kind: 'five_hour',
          percentUsed: 100,
          resetsAt: new Date(LOCAL_NOON + IN_2_26_13).toISOString(),
        },
      ],
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  let row = await ui.find({ type: 'Text', text: /Context/ })
  expect(row?.text).toContain('5h ▰▰▰▰▰▰▰▰ 100 % · resets in 2:26:13 · 14:26')

  // Ticks land half-way between two shown seconds: one step per second, none skipped.
  await clock.advance(1500)
  row = await ui.find({ type: 'Text', text: /Context/ })
  expect(row?.text).toContain('resets in 2:26:12')
  await clock.advance(1000)
  row = await ui.find({ type: 'Text', text: /Context/ })
  expect(row?.text).toContain('resets in 2:26:11')
  await ui.unmount()
})

test('after the reset time the old figure is not shown', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 200_000, percent: 9 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 89, resetsAt: '2026-11-16T12:41:00Z' }],
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(60 * 60_000)

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  const row = await ui.find({ type: 'Text', text: /Context/ })

  expect(row?.text).toContain('5h ▱▱▱▱▱▱▱▱ 0 %   Context 9 %')
  expect(row?.text).not.toContain('89')
  await ui.unmount()
})

test('a session without a screen runs no clock', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  await clock.advance(10 * 60_000)

  // The clock never ran: the time stays unset, so no countdown is worked out.
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  const row = await ui.find({ type: 'Text', text: /Context/ })
  expect(row?.text).toContain('5h ▰▱▱▱▱▱▱▱ 6 %')
  expect(row?.text).not.toContain('min')
  await ui.unmount()
})
