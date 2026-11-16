import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isSafeHandyPath } from '../hooks/handy'

// Run with: claude plugin test mods/voice-bar
// Each `on(...)` here stands for Claude Code and the computer beneath the mod:
// a fake Windows with Handy installed, and a fake Handy process.

const BAND = {
  plugin: 'voice-bar',
  component: 'AbovePrompt',
  requestId: 'voice-bar',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 3,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 3 },
    view: {},
  },
} as const

type Fake = { running: boolean; toggleExit: number; runs: string[][] }

/** A Windows machine with Handy installed; `running` says whether it runs. */
function fakeComputer(on: On, running: boolean): Fake {
  const fake: Fake = { running, toggleExit: 0, runs: [] }
  mock.env(on, { OS: 'Windows_NT', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' })
  on('fs.exists', (_, e) => ({ value: e.path.toLowerCase().endsWith('handy.exe') }))
  on('process.run', (_, e) => {
    fake.runs.push([...e.argv])
    const [command] = e.argv
    let exitCode = 0
    let stdout = ''
    if (command === 'tasklist') stdout = fake.running ? 'handy.exe   60220 Console' : 'INFO: No tasks'
    else if (command === 'cmd') fake.running = true
    else if (command === 'taskkill') fake.running = false
    else exitCode = fake.toggleExit
    return {
      value: {
        exitCode,
        stdout,
        stderr: exitCode === 0 ? '' : 'no running instance',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return fake
}

function captureToasts(on: On): string[] {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return toasts
}

test('only real Handy paths without shell characters are used', () => {
  expect(isSafeHandyPath('C:\\Users\\me\\AppData\\Local\\Handy\\handy.exe')).toBe(true)
  expect(isSafeHandyPath('/Applications/Handy.app/Contents/MacOS/handy')).toBe(true)
  expect(isSafeHandyPath('C:\\Tools\\other.exe')).toBe(false)
  expect(isSafeHandyPath('C:\\x & calc\\handy.exe')).toBe(false)
  expect(isSafeHandyPath('/tmp/$(rm -rf ~)/handy')).toBe(false)
})

test('Speak starts a recording, the button turns into Stop, Stop ends it', async ($, on) => {
  const fake = fakeComputer(on, true)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ key: 'speak' }))?.text).toContain('Speak')

    await ui.press({ key: 'speak' })
    expect((await ui.find({ key: 'speak' }))?.text).toContain('Stop')
    expect((await ui.find({ type: 'Text', text: /Stop/ }))?.props.backgroundColor).toBe('success')
    expect(fake.runs.at(-1)).toEqual([
      'C:\\Users\\me\\AppData\\Local\\Handy\\handy.exe',
      '--toggle-transcription',
    ])

    await ui.press({ key: 'speak' })
    expect((await ui.find({ key: 'speak' }))?.text).toContain('Speak')
    await ui.unmount()
  }
})

test('text another plugin puts in the prompt ends the recording state', async ($, on) => {
  fakeComputer(on, true)
  on('prompt.change', (_, e) => e)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: 'speak' })
  expect((await ui.find({ key: 'speak' }))?.text).toContain('Stop')

  // The kit raises prompt.change like the engine; its typings only list a mod's calls.
  const raise = $.prompt as unknown as { change: (e: unknown) => Promise<unknown> }
  await raise.change({ text: 'Hello from Handy', cursor: 16, origin: { kind: 'plugin', name: 'x' } })
  expect((await ui.find({ key: 'speak' }))?.text).toContain('Speak')
  await ui.unmount()
})

test('Speak with Handy off flashes red, says why, and goes back to normal', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  fakeComputer(on, false)
  const toasts = captureToasts(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: 'speak' })
  expect(toasts.at(-1)).toContain('Handy is off')
  let label = await ui.find({ type: 'Text', text: /Speak/ })
  expect(label?.props.backgroundColor).toBe('error')

  await clock.advance(1500)
  label = await ui.find({ type: 'Text', text: /Speak/ })
  expect(label?.props.backgroundColor).toBeUndefined()
  await ui.unmount()
})

test('the power switch starts Handy and the light turns green', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const fake = fakeComputer(on, false)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  // Power waits a moment for Handy to start: move the clock until it is done.
  let isDone = false
  const pressing = ui.press({ key: 'power' }).then(() => {
    isDone = true
  })
  for (let step = 0; step < 10 && !isDone; step += 1) await clock.advance(500)
  await pressing
  expect(fake.runs.some(argv => argv[0] === 'cmd' && argv.includes('--start-hidden'))).toBe(true)
  expect(fake.running).toBe(true)
  expect((await ui.find({ type: 'Text', text: /⏻/ }))?.props.color).toBe('success')
  await ui.unmount()
})

test('⏎ sends the prompt and clears the box; an empty box flashes red', async ($, on) => {
  mock.clock(on, { now: 0 })
  fakeComputer(on, true)
  const toasts = captureToasts(on)
  let draft = 'Explain this repo'
  const sent: string[] = []
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', (_, e) => {
    draft = e.text
    return { isFilled: true }
  })
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: 'send' })
  expect(sent).toEqual(['Explain this repo'])
  expect(draft).toBe('')

  await ui.press({ key: 'send' })
  expect(sent).toHaveLength(1)
  expect(toasts.at(-1)).toContain('Nothing to send')
  expect((await ui.find({ type: 'Text', text: /⏎/ }))?.props.backgroundColor).toBe('error')
  await ui.unmount()
})

test('the status dot explains the state', async ($, on) => {
  fakeComputer(on, true)
  const toasts = captureToasts(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: 'status' })
  expect(toasts.at(-1)).toBe('Handy is ready. Press Speak to dictate.')
  await ui.unmount()
})

test('a paste ends the recording state (Handy stopped by its own shortcut); typing does not', async ($, on) => {
  fakeComputer(on, true)
  on('prompt.edit', (_, e) => ({
    text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end),
    cursor: e.start + e.inputText.length,
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // The kit raises prompt.edit like the engine; its typings only list a mod's calls.
  const raise = $.prompt as unknown as { edit: (e: unknown) => Promise<unknown> }

  await ui.press({ key: 'speak' })
  expect((await ui.find({ key: 'speak' }))?.text).toContain('Stop')

  // A key typed while Handy listens: still recording.
  await raise.edit({
    origin: { kind: 'composer' },
    key: { key: 'a' },
    text: '',
    cursor: 0,
    start: 0,
    end: 0,
    inputText: 'a',
  })
  expect((await ui.find({ key: 'speak' }))?.text).toContain('Stop')

  // Handy's paste: an edit with no key.
  await raise.edit({
    origin: { kind: 'composer' },
    text: 'a',
    cursor: 1,
    start: 1,
    end: 1,
    inputText: ' Hello from Handy',
  })
  expect((await ui.find({ key: 'speak' }))?.text).toContain('Speak')
  await ui.unmount()
})
