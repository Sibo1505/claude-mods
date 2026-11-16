import { expect, test } from 'claude-code/testing'

// Run with: claude plugin test <this mod's folder>
// In a test nothing sits beneath the mod: each `on(...)` here stands for the
// engine. A call on `$` is answered `{ value }`, an event by its own result.

test('/mod-template answers with a greeting', async ($, on) => {
  on('command.register', () => ({ value: { command: 'mod-template' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // The test plays the person typing /mod-template at the prompt.
  const { text } = await $.command.run({
    command: 'mod-template',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

  expect(text).toContain('Hello from mod-template')
})
