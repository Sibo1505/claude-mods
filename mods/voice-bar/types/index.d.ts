// What voice-bar keeps in $.state for the band to draw.

/** Whether this mod started a recording that is still running. */
export type VoicePhase = 'idle' | 'recording'

/** The button that flashes red for a moment after a failed press. */
export type VoiceFlash = 'speak' | 'send' | null

/** What the mod last knew about Handy: drives the status dot and the power light. */
export type HandyHealth = 'unknown' | 'running' | 'off' | 'missing' | 'error'

declare module 'claude-code' {
  interface PluginState {
    'voice-bar': {
      phase: VoicePhase
      flash: VoiceFlash
      health: HandyHealth
    }
  }
}
