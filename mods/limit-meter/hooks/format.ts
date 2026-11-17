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
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  de: {
    fiveHour: '5h',
    week: 'Woche',
    context: 'Kontext',
    day: 'T',
    freeIn: 'frei in',
    weekdays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    months: [],
  },
} as const

const BAR_CELLS = 8
/** Cells the row leaves free: Claude Code indents it and a terminal wraps at the last cell. */
const ROW_MARGIN = 4

const SECOND = 1000
export const MINUTE = 60_000
const DAY = 86_400_000
const DAY_MINUTES = 1440

const pad = (n: number) => String(n).padStart(2, '0')

/** The percent as the row shows it: 99.6 is "100 %". */
const shown = (percent: number) => Math.round(percent)

/** Green under 50 %, yellow from 50 %, red from 80 %. */
export function toneOf(percent: number): Tone {
  if (shown(percent) >= 80) return 'error'
  if (shown(percent) >= 50) return 'warning'
  return 'success'
}

/**
 * `▰▱▱▱▱▱▱▱` for 6 %: rounded to the nearest cell, but any use shows at least
 * one filled cell, and only what the row shows as 100 % fills the bar.
 */
export function bar(percent: number, cells: number = BAR_CELLS): string {
  let filled = 0
  if (shown(percent) >= 100) filled = cells
  else if (percent > 0) filled = Math.min(cells - 1, Math.max(1, Math.round((percent / 100) * cells)))
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}

export function formatPercent(percent: number): string {
  return `${shown(percent)} %`
}

/** Milliseconds until a reset; undefined without a usable time. */
export function msUntilReset(resetsAt: string | undefined, now: number): number | undefined {
  if (resetsAt === undefined || now <= 0) return undefined
  const ms = Date.parse(resetsAt) - now
  return Number.isFinite(ms) ? ms : undefined
}

/**
 * The window as it stands now: once its reset time has passed, its old figure
 * is out of date and the window starts again at 0 %, until Claude Code
 * measures again.
 */
export function current(window: LimitWindow, now: number): LimitWindow {
  const ms = msUntilReset(window.resetsAt, now)
  return ms !== undefined && ms <= 0 ? { percent: 0 } : window
}

/** True when the row shows the window as 100 % and its reset is still ahead. */
export function isExhausted(window: LimitWindow, now: number): boolean {
  const ms = msUntilReset(window.resetsAt, now)
  return shown(window.percent) >= 100 && ms !== undefined && ms > 0
}

/** The used-up windows with their time left, soonest first. */
function exhaustedWindows(snapshot: LimitSnapshot | null, now: number): number[] {
  if (snapshot === null) return []
  return [snapshot.fiveHour, snapshot.week]
    .filter((window): window is LimitWindow => window !== undefined && isExhausted(window, now))
    .map(window => msUntilReset(window.resetsAt, now) ?? 0)
    .sort((a, b) => a - b)
}

/** True when a window is used up: then the countdown ticks every second. */
export function needsSeconds(snapshot: LimitSnapshot | null, now: number): boolean {
  return exhaustedWindows(snapshot, now).length > 0
}

/**
 * How long until the clock should tick again. Every second while a live timer
 * is drawn, landing half-way between two shown seconds so a late tick never
 * skips or repeats one; else once a minute.
 */
export function nextTick(snapshot: LimitSnapshot | null, now: number, isTimerDrawn: boolean): number {
  const [soonest] = exhaustedWindows(snapshot, now)
  if (!isTimerDrawn || soonest === undefined) return MINUTE
  const offset = (((soonest - SECOND / 2) % SECOND) + SECOND) % SECOND
  return offset === 0 ? SECOND : offset
}

/** `2 h 26 min`, `1 h`, `41 min`, `3 d 5 h` (de: `3 T 5 h`); undefined without a time. */
export function formatRemaining(
  resetsAt: string | undefined,
  now: number,
  lang: Lang,
): string | undefined {
  const ms = msUntilReset(resetsAt, now)
  if (ms === undefined) return undefined

  const minutes = Math.max(0, Math.round(ms / MINUTE))
  const days = Math.floor(minutes / DAY_MINUTES)
  const hours = Math.floor((minutes % DAY_MINUTES) / 60)
  const rest = minutes % 60

  if (days > 0) return `${days} ${LABELS[lang].day} ${hours} h`
  if (hours > 0) return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
  return `${rest} min`
}

/** The live countdown: `2:26:13`, or `2 T 05:12:33` past a day. */
export function formatCountdown(ms: number, lang: Lang): string {
  const total = Math.max(0, Math.ceil(ms / SECOND))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (days > 0) return `${days} ${LABELS[lang].day} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return `${hours}:${pad(minutes)}:${pad(seconds)}`
}

/**
 * The local time of the reset: `14:35` today, `Do 17:00` within the next six
 * days, and with the date further out, so a reset a week away is never read
 * as today (`Mo 23.11. 11:00`, en `Mon 23 Nov 11:00`).
 */
export function formatClock(resetAt: number, now: number, lang: Lang): string {
  const at = new Date(resetAt)
  const today = new Date(now)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const isSameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate()
  if (isSameDay) return time

  const weekday = LABELS[lang].weekdays[at.getDay()]
  if (resetAt - now < 6 * DAY) return `${weekday} ${time}`
  const date =
    lang === 'de'
      ? `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.`
      : `${at.getDate()} ${LABELS.en.months[at.getMonth()]}`
  return `${weekday} ${date} ${time}`
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

/** How much the row shows: the fullest that fits is used. */
type Detail = { hasBars: boolean; hasTimes: boolean }

const SHORTEST: Detail = { hasBars: false, hasTimes: false }
const DETAILS: readonly Detail[] = [
  { hasBars: true, hasTimes: true },
  { hasBars: false, hasTimes: true },
  SHORTEST,
]

function segmentsFor(snapshot: LimitSnapshot, now: number, lang: Lang, detail: Detail): Segment[] {
  const labels = LABELS[lang]
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
    if (detail.hasBars) segments.push({ text: `${bar(window.percent)} `, tone })
    segments.push({ text: formatPercent(window.percent), tone })
    if (!detail.hasTimes) return

    const ms = msUntilReset(window.resetsAt, now)
    if (ms === undefined) return
    if (isExhausted(window, now)) {
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

const widthOf = (segments: readonly Segment[]) =>
  segments.reduce((sum, segment) => sum + segment.text.length, 0)

/**
 * The row fitted to the width it is drawn in: with bars and countdowns when
 * they fit, else without bars, else without countdowns. `hasTimes` says
 * whether countdowns are on screen (only then does a live timer tick).
 */
export function fitRow(
  snapshot: LimitSnapshot,
  now: number,
  lang: Lang,
  columns: number,
): { segments: Segment[]; hasTimes: boolean } {
  const room = columns - ROW_MARGIN
  for (const detail of DETAILS) {
    const segments = segmentsFor(snapshot, now, lang, detail)
    if (widthOf(segments) <= room) return { segments, hasTimes: detail.hasTimes }
  }
  return { segments: segmentsFor(snapshot, now, lang, SHORTEST), hasTimes: false }
}

/** The row as segments, fitted to the width it is drawn in. */
export function buildSegments(
  snapshot: LimitSnapshot,
  now: number,
  lang: Lang,
  columns: number,
): Segment[] {
  return fitRow(snapshot, now, lang, columns).segments
}
