import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { HandyHealth, VoicePhase } from '../types'
import {
  detectOs,
  findHandy,
  forceStopHandy,
  handyProcess,
  looksLikeTranscript,
  startHandy,
  stopHandy,
  toggleRecording,
} from './handy'
import type { Os } from './handy'

const phase = atom({ plugin: 'voice-bar', key: 'phase' } as const, 'idle')
const flash = atom({ plugin: 'voice-bar', key: 'flash' } as const, null)
const health = atom({ plugin: 'voice-bar', key: 'health' } as const, 'unknown')

/** How long a button stays red after a failed press. */
const FLASH_MS = 1500
/** How long Handy gets to start or quit before the light is checked again. */
const SETTLE_MS = 1500

const MESSAGES = {
  missing:
    'Handy was not found. Install it from handy.computer, or set its path in the voice-bar settings.',
  off: 'Handy is off. Press ⏻ to start it.',
  cantCheck: 'Could not check whether Handy runs: the system did not answer. Try again in a moment.',
  ready: 'Handy is ready. Press Speak to dictate.',
  listening: 'Handy is listening. Press Stop when you are done.',
  empty: 'Nothing to send: the prompt is empty.',
  stopFirst: 'Stop the recording first, then turn Handy off.',
  notStarted: 'Handy did not start.',
  notQuit: 'Handy did not quit.',
} as const

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Module state. A reload starts it over, and `register` and `session.start`
// set it again.
type Handy = { os: Os; path: string | undefined }
let configuredPath = ''
/** Where Handy is, once found: the system and the path do not change in a session. */
let found: Handy | undefined
/** A copy of `phase` for the per-keystroke check in `prompt.edit`. */
let isRecordingNow = false
/** The timer that ends the current red flash. */
let flashTimer: Timer | undefined

async function locate($: EngineInterface): Promise<Handy> {
  if (found !== undefined) return found
  const os = await detectOs($)
  const handy = { os, path: await findHandy($, os, configuredPath) }
  if (handy.path !== undefined) found = handy // keep looking while it is missing
  return handy
}

async function setPhase($: EngineInterface, next: VoicePhase): Promise<void> {
  isRecordingNow = next === 'recording'
  await update($, phase, () => next)
}

/** Check Handy once and set the light. */
async function refresh($: EngineInterface): Promise<{ state: HandyHealth; handy: Handy }> {
  const handy = await locate($)
  let state: HandyHealth = 'missing'
  if (handy.path !== undefined) {
    const process = await handyProcess($, handy.os)
    state = process === 'running' ? 'running' : process === 'off' ? 'off' : 'error'
  }
  await update($, health, () => state)
  if (state === 'off' || state === 'missing') await setPhase($, 'idle')
  return { state, handy }
}

/** Turn a button red for a moment and say why. */
async function fail($: EngineInterface, button: 'speak' | 'send', why: string): Promise<void> {
  $.ui.toast(why)
  flashTimer?.cancel()
  await update($, flash, () => button)
  flashTimer = $.clock.after(FLASH_MS, () => {
    void update($, flash, () => null)
  })
}

/** Speak / Stop: start or stop a recording in Handy. */
async function speak($: EngineInterface): Promise<void> {
  const { state, handy } = await refresh($)
  if (state === 'missing' || handy.path === undefined) return fail($, 'speak', MESSAGES.missing)
  if (state === 'off') return fail($, 'speak', MESSAGES.off)
  if (state === 'error') return fail($, 'speak', MESSAGES.cantCheck)

  const result = await toggleRecording($, handy.path)
  if (result.exitCode !== 0) {
    await update($, health, () => 'error' as HandyHealth)
    const why = result.stderr.trim() || `exit code ${result.exitCode}`
    return fail($, 'speak', `Handy did not answer: ${why}`)
  }
  const now = await read($, phase)
  await setPhase($, now === 'recording' ? 'idle' : 'recording')
}

/** ⏎: send what is in the prompt box, as Enter would. */
async function send($: EngineInterface): Promise<void> {
  const { text } = await $.prompt.read()
  if (text.trim() === '') return fail($, 'send', MESSAGES.empty)

  await $.prompt.fill({ text: '', mode: 'replace' })
  let refused: string | undefined
  try {
    const result = await $.prompt.submit({ text })
    if (result.drop !== undefined) refused = result.drop
  } catch (error) {
    refused = reasonOf(error)
  }
  if (refused !== undefined) {
    // Put the words back so nothing is lost.
    await $.prompt.fill({ text, mode: 'replace' })
    await fail($, 'send', `Not sent: ${refused}`)
  }
}

/** ●: show what is going on. */
async function showStatus($: EngineInterface): Promise<void> {
  const { state } = await refresh($)
  if (state === 'missing') $.ui.toast(MESSAGES.missing)
  else if (state === 'off') $.ui.toast(MESSAGES.off)
  else if (state === 'error') $.ui.toast(MESSAGES.cantCheck)
  else $.ui.toast(isRecordingNow ? MESSAGES.listening : MESSAGES.ready)
}

/** ⏻: start Handy when it is off, quit it when it runs. */
async function power($: EngineInterface): Promise<void> {
  const { state, handy } = await refresh($)
  if (state === 'missing' || handy.path === undefined) {
    $.ui.toast(MESSAGES.missing)
    return
  }
  if (state === 'error') {
    $.ui.toast(MESSAGES.cantCheck)
    return
  }

  if (state === 'off') {
    const started = await startHandy($, handy.os, handy.path)
    await $.clock.sleep(SETTLE_MS)
    const after = await refresh($)
    if (after.state !== 'running') {
      const why = started.stderr.trim()
      $.ui.toast(why === '' ? MESSAGES.notStarted : `${MESSAGES.notStarted} ${why}`)
    }
    return
  }

  // Quitting mid-recording would lose what was said.
  if (isRecordingNow) {
    $.ui.toast(MESSAGES.stopFirst)
    return
  }
  await stopHandy($, handy.os)
  await $.clock.sleep(SETTLE_MS)
  if ((await refresh($)).state === 'running') {
    await forceStopHandy($, handy.os)
    await $.clock.sleep(SETTLE_MS)
    if ((await refresh($)).state === 'running') $.ui.toast(MESSAGES.notQuit)
  }
}

export const register: Register = (on, options) => {
  configuredPath = typeof options.handyPath === 'string' ? options.handyPath.trim() : ''
  found = undefined

  // Learn once at start whether Handy runs (one quick process list, no polling).
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    isRecordingNow = (await read($, phase)) === 'recording'
    void refresh($).catch(() => undefined)
    return started
  })

  // Handy pastes the text when a recording ends, also one stopped with its own
  // shortcut: then the button goes back to Speak. A paste reaches the prompt as
  // an edit with no key. Outside a recording this is one boolean check per key.
  on('prompt.edit', ($, e, next) => {
    if (isRecordingNow && looksLikeTranscript(e.key, e.inputText)) void setPhase($, 'idle')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.plugin !== 'voice-bar' || e.props.hasSurvey) return next(e)

    const isRecording = (await read($, phase)) === 'recording'
    const red = await read($, flash)
    const light = await read($, health)
    const { Box, Button, Text } = $.ui.resolve(e)

    const speakColor = red === 'speak' ? 'error' : isRecording ? 'success' : undefined
    const sendColor = red === 'send' ? 'error' : undefined
    const dotColor =
      light === 'running' ? 'success' : light === 'missing' || light === 'error' ? 'error' : 'inactive'
    const powerColor = light === 'running' ? 'success' : 'text'

    return (
      <Box columnGap={1}>
        <Button key="speak" onPress={() => speak($)}>
          {speakColor === undefined ? (
            <Text>{' 🎤 Speak '}</Text>
          ) : (
            <Text backgroundColor={speakColor} color="inverseText">
              {isRecording && red !== 'speak' ? ' ■ Stop ' : ' 🎤 Speak '}
            </Text>
          )}
        </Button>
        <Button key="send" onPress={() => send($)}>
          {sendColor === undefined ? (
            <Text>{'  ⏎  '}</Text>
          ) : (
            <Text backgroundColor={sendColor} color="inverseText">
              {'  ⏎  '}
            </Text>
          )}
        </Button>
        <Button key="status" onPress={() => showStatus($)}>
          <Text color={dotColor}>●</Text>
        </Button>
        <Button key="power" onPress={() => power($)}>
          <Text color={powerColor}>⏻</Text>
        </Button>
      </Box>
    )
  })
}
