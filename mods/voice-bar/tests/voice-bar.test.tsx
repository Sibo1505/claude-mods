import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isSafeHandyPath, looksLikeTranscript } from '../hooks/handy'

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

const HANDY = 'C:\\Users\\me\\AppData\\Local\\Handy\\handy.exe'

type Fake = {
  running: boolean
  /** Exit code of `handy --toggle-transcription`. */
  toggleExit: number
  /** Whether a polite `taskkill` (without /F) makes Handy quit. */
  quitsPolitely: boolean
  /** The process list cannot be read (a missing or hanging command). */
  isProcessListBroken: boolean
  runs: string[][]
}

const answer = (exitCode: number, stdout = '', stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

/** A Windows machine with Handy installed; `running` says whether it runs. */
function fakeComputer(on: On, running: boolean): Fake {
  const fake: Fake = {
    running,
    toggleExit: 0,
    quitsPolitely: true,
    isProcessListBroken: false,
    runs: [],
  }
  mock.env(on, { OS: 'Windows_NT', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' })
  on('fs.exists', (_, e) => ({ value: e.path.toLowerCase().endsWith('handy.exe') }))
  on('process.run', (_, e) => {
    fake.runs.push([...e.argv])
    const [command] = e.argv
    if (command === 'tasklist') {
      if (fake.isProcessListBroken) throw new Error('tasklist did not answer')
      return answer(0, fake.running ? 'handy.exe   60220 Console' : 'INFO: No tasks')
    }
    if (command === 'powershell') {
      fake.running = true
      return answer(0)
    }
    if (command === 'taskkill') {
      if (e.argv.includes('/F') || fake.quitsPolitely) fake.running = false
      return answer(0)
    }
    return answer(fake.toggleExit, '', fake.toggleExit === 0 ? '' : 'no running instance')
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

/** Press a button whose action waits on the mocked clock, moving the clock until it is done. */
async function pressAndWait(
  press: Promise<unknown>,
  clock: { advance: (ms: number) => Promise<void> },
): Promise<void> {
  let isDone = false
  const pressing = press.then(() => {
    isDone = true
  })
  for (let step = 0; step < 20 && !isDone; step += 1) await clock.advance(500)
  await pressing
}

test('only real Handy paths without shell characters are used', () => {
  expect(isSafeHandyPath(HANDY)).toBe(true)
  expect(isSafeHandyPath('/Applications/Handy.app/Contents/MacOS/handy')).toBe(true)
  expect(isSafeHandyPath('/home/me/Apps/Handy_0.10.1_amd64.AppImage')).toBe(true)
  expect(isSafeHandyPath('/home/me/Apps/NotHandy.AppImage')).toBe(false)
  expect(isSafeHandyPath('C:\\Tools\\other.exe')).toBe(false)
  expect(isSafeHandyPath('C:\\x & calc\\handy.exe')).toBe(false)
  expect(isSafeHandyPath('/tmp/$(rm -rf ~)/handy')).toBe(false)
})

test('only a pasted text of two or more characters counts as the transcript', () => {
  expect(looksLikeTranscript(undefined, ' Hello from Handy')).toBe(true)
  expect(looksLikeTranscript({ key: 'a' }, 'a')).toBe(false)
  expect(looksLikeTranscript(undefined, '\n')).toBe(false)
  expect(looksLikeTranscript(undefined, 'a')).toBe(false)
  expect(looksLikeTranscript(undefined, 'first line\nsecond line')).toBe(false)
})

test('Speak starts a recording, the button turns into a green Stop, Stop ends it', async ($, on) => {
  const fake = fakeComputer(on, true)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ key: 'speak' }))?.text).toContain('Speak')

    await ui.press({ key: 'speak' })
    expect((await ui.find({ key: 'speak' }))?.text).toContain('Stop')
    expect((await ui.find({ type: 'Text', text: /Stop/ }))?.props.backgroundColor).toBe('success')
    expect(fake.runs.at(-1)).toEqual([HANDY, '--toggle-transcription'])

    await ui.press({ key: 'speak' })
    expect((await ui.find({ key: 'speak' }))?.text).toContain('Speak')
    await ui.unmount()
  }
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
  const edit = (inputText: string, key?: { key: string }) =>
    raise.edit({ origin: { kind: 'composer' }, key, text: '', cursor: 0, start: 0, end: 0, inputText })

  await ui.press({ key: 'speak' })
  await edit('a', { key: 'a' }) // a typed key
  await edit('\n') // a keybinding newline
  expect((await ui.find({ key: 'speak' }))?.text).toContain('Stop')

  await edit(' Hello from Handy') // Handy's paste
  expect((await ui.find({ key: 'speak' }))?.text).toContain('Speak')
  await ui.unmount()
})

test('Speak with Handy off flashes red, says why, and goes back to normal', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const fake = fakeComputer(on, false)
  const toasts = captureToasts(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: 'speak' })
  expect(toasts.at(-1)).toContain('Handy is off')
  expect((await ui.find({ type: 'Text', text: /Speak/ }))?.props.backgroundColor).toBe('error')
  expect(fake.runs.some(argv => argv.includes('--toggle-transcription'))).toBe(false)

  await clock.advance(1500)
  expect((await ui.find({ type: 'Text', text: /Speak/ }))?.props.backgroundColor).toBeUndefined()
  await ui.unmount()
})

test('a second failure gets its full red time', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  fakeComputer(on, false)
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: 'speak' }) // red until 1500
  await clock.advance(1000)
  await ui.press({ key: 'send' }) // red until 2500
  await clock.advance(600) // 1600: the first timer would have cleared it
  expect((await ui.find({ type: 'Text', text: /⏎/ }))?.props.backgroundColor).toBe('error')
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /⏎/ }))?.props.backgroundColor).toBeUndefined()
  await ui.unmount()
})

test('a process list that cannot be read is reported, not thrown', async ($, on) => {
  mock.clock(on, { now: 0 })
  const fake = fakeComputer(on, true)
  fake.isProcessListBroken = true
  const toasts = captureToasts(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: 'speak' })
  expect(toasts.at(-1)).toContain('Could not check whether Handy runs')
  expect((await ui.find({ type: 'Text', text: /●/ }))?.props.color).toBe('error')
  await ui.unmount()
})

test('the power switch starts Handy through Start-Process and the light turns green', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const fake = fakeComputer(on, false)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await pressAndWait(ui.press({ key: 'power' }), clock)
  const start = fake.runs.find(argv => argv[0] === 'powershell')
  expect(start?.at(-1)).toBe(HANDY)
  expect(start?.join(' ')).toContain('Start-Process -FilePath $args[0] -ArgumentList "--start-hidden"')
  expect(fake.running).toBe(true)
  expect((await ui.find({ type: 'Text', text: /⏻/ }))?.props.color).toBe('success')
  await ui.unmount()
})

test('the power switch asks Handy to quit first, and forces it only if needed', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const fake = fakeComputer(on, true)
  fake.quitsPolitely = false
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await pressAndWait(ui.press({ key: 'power' }), clock)
  const kills = fake.runs.filter(argv => argv[0] === 'taskkill')
  expect(kills[0]).toEqual(['taskkill', '/IM', 'handy.exe'])
  expect(kills[1]).toEqual(['taskkill', '/IM', 'handy.exe', '/F'])
  expect(fake.running).toBe(false)
  await ui.unmount()
})

test('the power switch does not quit Handy in the middle of a recording', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const fake = fakeComputer(on, true)
  const toasts = captureToasts(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: 'speak' })
  await pressAndWait(ui.press({ key: 'power' }), clock)
  expect(toasts.at(-1)).toContain('Stop the recording first')
  expect(fake.running).toBe(true)
  expect(fake.runs.some(argv => argv[0] === 'taskkill')).toBe(false)
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

test('⏎ puts the text back when the prompt is refused', async ($, on) => {
  mock.clock(on, { now: 0 })
  fakeComputer(on, true)
  const toasts = captureToasts(on)
  let draft = 'Dictated words'
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', (_, e) => {
    draft = e.text
    return { isFilled: true }
  })
  on('prompt.submit', () => ({ drop: 'a Stop is active' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: 'send' })
  expect(draft).toBe('Dictated words')
  expect(toasts.at(-1)).toBe('Not sent: a Stop is active')
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
  await ui.press({ key: 'speak' })
  await ui.press({ key: 'status' })
  expect(toasts.at(-1)).toBe('Handy is listening. Press Stop when you are done.')
  await ui.unmount()
})
