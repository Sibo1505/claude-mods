// Pure helpers that turn the figures into the pieces of the row.
// No `$` here, so the tests can check them directly. Nothing here calls a
// model: the row costs no tokens.

import type { LimitSnapshot, LimitWindow } from '../types'

export type Lang = 'en' | 'de'

/** Theme colors, so the row follows the person's Claude Code theme. */
export type Tone = 'success' | 'warning' | 'error'

/** One piece of the row: its text, and how it is colored. */
export type Segment = { text: string; tone?: Tone; isDim?: boolean }

const LABELS = {
  en: {
    fiveHour: '5h',
    week: 'Week',
    context: 'Context',
    day: 'd',
    freeIn: 'resets in',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
  de: {
    fiveHour: '5h',
    week: 'Woche',
    context: 'Kontext',
    day: 'T',
    freeIn: 'frei in',
    weekdays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  },
} as const

const BAR_CELLS = 8
/** From this width on, the row has bars and countdowns. */
const WIDE = 80
/** From this width on, the row has countdowns (no bars). */
const MEDIUM = 50

const MINUTE = 60_000
const DAY_MINUTES = 1440

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

const pad = (n: number) => String(n).padStart(2, '0')

/** Milliseconds until the window resets; undefined without a usable time. */
function msUntilReset(window: LimitWindow, now: number): number | undefined {
  if (window.resetsAt === undefined || now <= 0) return undefined
  const ms = Date.parse(window.resetsAt) - now
  return Number.isFinite(ms) ? ms : undefined
}

/**
 * The window as it stands now: once its reset time has passed, its old figure
 * is out of date and the window starts again at 0 %, until Claude Code
 * measures again.
 */
export function current(window: LimitWindow, now: number): LimitWindow {
  const ms = msUntilReset(window, now)
  return ms !== undefined && ms <= 0 ? { percent: 0 } : window
}

/** True when the window is used up and has a reset still ahead. */
export function isExhausted(window: LimitWindow, now: number): boolean {
  const ms = msUntilReset(window, now)
  return window.percent >= 100 && ms !== undefined && ms > 0
}

/** True when a window is used up: then the countdown ticks every second. */
export function needsSeconds(snapshot: LimitSnapshot | null, now: number): boolean {
  if (snapshot === null) return false
  return [snapshot.fiveHour, snapshot.week].some(
    window => window !== undefined && isExhausted(window, now),
  )
}

/** `2 h 26 min`, `41 min`, `3 d 5 h` (de: `3 T 5 h`); undefined without a time. */
export function formatRemaining(
  resetsAt: string | undefined,
  now: number,
  lang: Lang,
): string | undefined {
  if (resetsAt === undefined) return undefined
  const ms = msUntilReset({ percent: 0, resetsAt }, now)
  if (ms === undefined) return undefined

  const minutes = Math.max(0, Math.round(ms / MINUTE))
  const days = Math.floor(minutes / DAY_MINUTES)
  const hours = Math.floor((minutes % DAY_MINUTES) / 60)
  const rest = minutes % 60

  if (days > 0) return `${days} ${LABELS[lang].day} ${hours} h`
  if (hours > 0) return `${hours} h ${rest} min`
  return `${rest} min`
}

/** The live countdown: `2:26:13`, or `2 T 05:12:33` past a day. */
export function formatCountdown(ms: number, lang: Lang): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (days > 0) return `${days} ${LABELS[lang].day} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return `${hours}:${pad(minutes)}:${pad(seconds)}`
}

/** The local time of the reset: `14:35` today, `Do 17:00` on another day. */
export function formatClock(resetAt: number, now: number, lang: Lang): string {
  const at = new Date(resetAt)
  const today = new Date(now)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const isSameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate()
  return isSameDay ? time : `${LABELS[lang].weekdays[at.getDay()]} ${time}`
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

  const addWindow = (label: string, stored: LimitWindow | undefined) => {
    if (stored === undefined) return
    const window = current(stored, now)
    gap()
    const tone = toneOf(window.percent)
    segments.push({ text: `${label} `, isDim: true })
    if (hasBars) segments.push({ text: `${bar(window.percent)} `, tone })
    segments.push({ text: formatPercent(window.percent), tone })
    if (!hasTimes) return

    const ms = msUntilReset(window, now)
    if (isExhausted(window, now) && ms !== undefined) {
      segments.push({ text: ` · ${labels.freeIn} ${formatCountdown(ms, lang)}`, tone })
      segments.push({ text: ` · ${formatClock(now + ms, now, lang)}`, isDim: true })
      return
    }
    const left = formatRemaining(window.resetsAt, now, lang)
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
