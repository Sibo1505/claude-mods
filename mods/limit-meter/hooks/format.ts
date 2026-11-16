// Pure helpers that turn the figures into the pieces of the row.
// No `$` here, so the tests can check them directly.

import type { LimitSnapshot, LimitWindow } from '../types'

export type Lang = 'en' | 'de'

/** Theme colors, so the row follows the person's Claude Code theme. */
export type Tone = 'success' | 'warning' | 'error'

/** One piece of the row: its text, and how it is colored. */
export type Segment = { text: string; tone?: Tone; isDim?: boolean }

const LABELS = {
  en: { fiveHour: '5h', week: 'Week', context: 'Context', day: 'd' },
  de: { fiveHour: '5h', week: 'Woche', context: 'Kontext', day: 'T' },
} as const

const BAR_CELLS = 8
/** From this width on, the row has bars and countdowns. */
const WIDE = 80
/** From this width on, the row has countdowns (no bars). */
const MEDIUM = 50

/** Green under 50 %, yellow from 50 %, red from 80 %. */
export function toneOf(percent: number): Tone {
  if (percent >= 80) return 'error'
  if (percent >= 50) return 'warning'
  return 'success'
}

/**
 * `▰▱▱▱▱▱▱▱` for 6 %: rounded to the nearest cell, but any use shows at least
 * one filled cell, and only 100 % or more fills the bar.
 */
export function bar(percent: number, cells: number = BAR_CELLS): string {
  let filled = 0
  if (percent >= 100) filled = cells
  else if (percent > 0) filled = Math.min(cells - 1, Math.max(1, Math.round((percent / 100) * cells)))
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}

export function formatPercent(percent: number): string {
  return `${Math.round(percent)} %`
}

/** `2 h 26 min`, `41 min`, `3 d 5 h` (de: `3 T 5 h`); undefined without a time. */
export function formatRemaining(
  resetsAt: string | undefined,
  now: number,
  lang: Lang,
): string | undefined {
  if (resetsAt === undefined || now <= 0) return undefined
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms)) return undefined

  const minutes = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60

  if (days > 0) return `${days} ${LABELS[lang].day} ${hours} h`
  if (hours > 0) return `${hours} h ${rest} min`
  return `${rest} min`
}

/** True when there is anything to draw. */
export function hasFigures(snapshot: LimitSnapshot | null): snapshot is LimitSnapshot {
  return (
    snapshot !== null &&
    (snapshot.fiveHour !== undefined ||
      snapshot.week !== undefined ||
      snapshot.context !== undefined)
  )
}

/** The row as segments, fitted to the width it is drawn in. */
export function buildSegments(
  snapshot: LimitSnapshot,
  now: number,
  lang: Lang,
  columns: number,
): Segment[] {
  const labels = LABELS[lang]
  const hasBars = columns >= WIDE
  const hasTimes = columns >= MEDIUM
  const segments: Segment[] = []

  const gap = () => {
    if (segments.length > 0) segments.push({ text: '   ' })
  }

  const addWindow = (label: string, window: LimitWindow | undefined) => {
    if (window === undefined) return
    gap()
    const tone = toneOf(window.percent)
    segments.push({ text: `${label} `, isDim: true })
    if (hasBars) segments.push({ text: `${bar(window.percent)} `, tone })
    segments.push({ text: formatPercent(window.percent), tone })
    const left = hasTimes ? formatRemaining(window.resetsAt, now, lang) : undefined
    if (left !== undefined) segments.push({ text: ` · ${left}`, isDim: true })
  }

  addWindow(labels.fiveHour, snapshot.fiveHour)
  addWindow(labels.week, snapshot.week)

  if (snapshot.context !== undefined) {
    gap()
    segments.push({ text: `${labels.context} `, isDim: true })
    segments.push({ text: formatPercent(snapshot.context), tone: toneOf(snapshot.context) })
  }

  return segments
}
