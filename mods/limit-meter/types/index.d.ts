// What limit-meter keeps in $.state for the drawing to read.

/** One rate-limit window: how much of it is used and when it resets. */
export type LimitWindow = {
  /** 0 to 100 (can pass 100 on an exceeded spend limit). */
  percent: number
  /** ISO 8601 timestamp of the reset, when the API reported one. */
  resetsAt?: string
}

/** The figures the row under the prompt shows. */
export type LimitSnapshot = {
  fiveHour?: LimitWindow
  week?: LimitWindow
  /** Context window fill, 0 to 100. */
  context?: number
}

declare module 'claude-code' {
  interface PluginState {
    'limit-meter': {
      /** The last figures Claude Code measured; null before the first. */
      snapshot: Shaped<LimitSnapshot | null>
      /** The time the countdown is drawn against, moved once a minute. */
      now: number
    }
  }
}
