import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { HandyHealth } from '../types'
import {
  detectOs,
  findHandy,
  isRunning,
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
  ready: 'Handy is ready. Press Speak to dictate.',
  listening: 'Handy is listening. Press Stop when you are done.',
  stopped: 'Stopped. Handy is writing the text into the prompt.',
  empty: 'Nothing to send: the prompt is empty.',
} as const

// The configured path, set by `register` (a reload sets it again).
let configuredPath = ''

type Handy = { os: Os; path: string | undefined }

async function locate($: EngineInterface): Promise<Handy> {
  const os = await detectOs($)
  return { os, path: await findHandy($, os, configuredPath) }
}

/** Check whether Handy runs and set the light; true when it runs. */
async function refresh($: EngineInterface): Promise<boolean> {
  const { os, path } = await locate($)
  if (path === undefined) {
    await update($, health, () => 'missing' as HandyHealth)
    return false
  }
  const running = await isRunning($, os)
  await update($, health, () => (running ? 'running' : 'off') as HandyHealth)
  if (!running) await update($, phase, () => 'idle' as const)
  return running
}

/** Turn a button red for a moment and say why. */
async function fail($: EngineInterface, button: 'speak' | 'send', why: string): Promise<void> {
  $.ui.toast(why)
  await update($, flash, () => button)
  $.clock.after(FLASH_MS, () => {
    void update($, flash, () => null)
  })
}

/** Speak / Stop: start or stop a recording in Handy. */
async function speak($: EngineInterface): Promise<void> {
  const { os, path } = await locate($)
  if (path === undefined) {
    await update($, health, () => 'missing' as HandyHealth)
    return fail($, 'speak', MESSAGES.missing)
  }
  if (!(await isRunning($, os))) {
    await update($, health, () => 'off' as HandyHealth)
    await update($, phase, () => 'idle' as const)
    return fail($, 'speak', MESSAGES.off)
  }

  let problem: string | undefined
  try {
    const result = await toggleRecording($, path)
    if (result.exitCode !== 0) problem = result.stderr.trim() || `exit code ${result.exitCode}`
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error)
  }
  if (problem !== undefined) {
    await update($, health, () => 'error' as HandyHealth)
    return fail($, 'speak', `Handy did not answer: ${problem}`)
  }

  await update($, health, () => 'running' as HandyHealth)
  const now = await read($, phase)
  await update($, phase, () => (now === 'recording' ? 'idle' : 'recording'))
}

/** ⏎: send what is in the prompt box, as Enter would. */
async function send($: EngineInterface): Promise<void> {
  const { text } = await $.prompt.read()
  if (text.trim() === '') return fail($, 'send', MESSAGES.empty)

  await $.prompt.fill({ text: '', mode: 'replace' })
  try {
    await $.prompt.submit({ text })
  } catch (error) {
    // Put the words back so nothing is lost.
    await $.prompt.fill({ text, mode: 'replace' })
    await fail($, 'send', `Could not send: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** ●: show what is going on. */
async function showStatus($: EngineInterface): Promise<void> {
  const running = await refresh($)
  const now = await read($, phase)
  const state = await read($, health)
  if (state === 'missing') $.ui.toast(MESSAGES.missing)
  else if (!running) $.ui.toast(MESSAGES.off)
  else $.ui.toast(now === 'recording' ? MESSAGES.listening : MESSAGES.ready)
}

/** ⏻: start Handy when it is off, quit it when it runs. */
async function power($: EngineInterface): Promise<void> {
  const { os, path } = await locate($)
  if (path === undefined) {
    await update($, health, () => 'missing' as HandyHealth)
    $.ui.toast(MESSAGES.missing)
    return
  }
  if (await isRunning($, os)) {
    await stopHandy($, os)
    await update($, phase, () => 'idle' as const)
  } else {
    await startHandy($, os, path)
  }
  await $.clock.sleep(SETTLE_MS)
  await refresh($)
}

export const register: Register = (on, options) => {
  configuredPath = typeof options.handyPath === 'string' ? options.handyPath.trim() : ''

  // Learn once at start whether Handy runs (one quick process list, no polling).
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void refresh($)
    return started
  })

  // Handy pastes the text when a recording ends, also one stopped with its own
  // shortcut: then the button goes back to Speak.
  on('prompt.change', async ($, e, next) => {
    if ((await read($, phase)) === 'recording') await update($, phase, () => 'idle' as const)
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
