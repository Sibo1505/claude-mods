import { expect, mock, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import { bar, buildSegments, formatRemaining, toneOf } from '../hooks/format'

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
