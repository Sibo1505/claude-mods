import type { Register } from 'claude-code'

// The hooks module of the mod. `register` runs when the mod loads (and again
// after every reload). Each `on(event, matcher?, hook)` adds one hook.
//
// When you copy this template: replace every "mod-template" in this folder
// with your mod's name, then replace the hooks below with your own.
export const register: Register = on => {
  // Declare the slash command /mod-template when a session starts.
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mod-template',
      description: 'Say hello from the mod template',
    })

    return next(e)
  })

  // Answer /mod-template. Returning without `next` answers the command alone.
  on('command.run', { command: 'mod-template' }, async () => ({
    text: 'Hello from mod-template. Copy this folder to start a new mod.',
  }))
}
