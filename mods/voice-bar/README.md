# voice-bar

> Speak and send buttons above the prompt: dictate with Handy (offline speech-to-text), see at a glance whether it is listening, and send with one click.

```
[  🎤 Speak  ] [   ⏎   ] [ ● ] [ ⏻ ]
```

## At a glance

| | |
|---|---|
| Version | 0.1.0 |
| Kind | Band (a row of buttons above the prompt) |
| Tested with | Claude Code 2.1.325, Handy 0.9.1 |
| Platforms | Windows (tested). macOS and Linux: written for them, not tested yet |
| Status | Experimental |

## What it does

Adds four buttons above the prompt. Click them with the mouse, or press `ctrl+x` then `tab` to reach them with the keyboard.

| Button | What it does |
|---|---|
| **🎤 Speak** | Starts a recording in [Handy](https://handy.computer). The button turns green and becomes **■ Stop**. Click it again to stop: Handy writes what you said into the prompt, and the button is **Speak** again. If Handy cannot record (not running, not found), the button turns red for a moment and a message says why. |
| **⏎** | Sends what is in the prompt, like Enter. With an empty prompt it turns red for a moment; if Claude Code refuses the message, your text is put back and a message says why. Claude Code marks a message a mod sends as *Prompt from the voice-bar plugin*, so Claude knows it came through the mod; no mod can send as if you typed it. Press Enter instead if you want the plain look. |
| **●** | Status light: green when Handy runs, grey when it is off, red when something is wrong. Click it for a message that says what is going on. |
| **⏻** | Power switch for Handy: green when it runs, white when it is off. Click to start or quit Handy. It does not quit Handy in the middle of a recording, and it asks Handy to quit normally before it ends it the hard way. |

Handy's own shortcut (default `ctrl+space`) keeps working as before.

**Good to know.** Handy cannot tell other programs whether it is recording, so the button shows the recordings the mod started. When Handy pastes the dictated text, the button goes back to **Speak**, also after you stopped with Handy's own shortcut. Handy is one program for all your sessions: use the bar in one session at a time. If the button ever shows the wrong state, Handy's own overlay shows whether it records; one more click on **Speak/Stop** puts both back in step.

## Permissions

What the mod hooks and calls, as `claude plugin validate` reports it:

- Hooks: `session.start`, `prompt.edit` (only notices a paste while a recording runs; otherwise one quick check per key), `ui.render` (only its own row above the prompt)
- Calls: `$.process.run`, `$.env.get`, `$.fs.exists`, `$.prompt.read`, `$.prompt.fill`, `$.prompt.submit`, `$.ui.toast`, `$.clock.after`, `$.clock.sleep`, `$.state.get`, `$.state.set`, `$.ui.resolve`
- Processes, only when you click a button or once when a session starts:
  - Handy itself: `handy --toggle-transcription` (start or stop a recording)
  - checking whether Handy runs: `tasklist` (Windows) or `pgrep -xi handy` (macOS, Linux)
  - starting Handy: `powershell -NoProfile -NonInteractive -Command "& { Start-Process -FilePath $args[0] -ArgumentList '--start-hidden' }" <path>` (Windows), `open -a Handy --args --start-hidden` (macOS), `sh -c 'setsid "$0" --start-hidden …' <path>` (Linux)
  - quitting Handy: first normally (`taskkill /IM handy.exe` on Windows, `osascript -e 'quit app "Handy"'` on macOS, `pkill -xi handy` on Linux); only if Handy is still running after a moment, at once (`taskkill /IM handy.exe /F`, `pkill -KILL -xi handy`)
  - finding Handy on Linux when it is not in `/usr/bin` or `/usr/local/bin`: `sh -c 'command -v handy'`
- Files: checks whether Handy's program file exists in its usual install folders (once per session)
- Environment: reads `OS`, `LOCALAPPDATA` and `ProgramFiles` to find Handy
- Network: none. Handy works offline; your voice never leaves your computer.
- Microphone: only Handy records, and only after you click **Speak** (or use Handy's own shortcut). Handy itself may keep recordings and a history in its own app folder; that is set in Handy's settings, not by this mod.
- Blocks tool calls: no
- Allows tool calls: no

A Handy path from the settings is only used when it ends in `handy`, `handy.exe` or a Handy AppImage name (`Handy_….AppImage`) and holds no character a shell could read as a command.

## Requirements

- Claude Code 2.1.287 or newer
- [Handy](https://handy.computer) 0.7.6 or newer (the version that added `--toggle-transcription`), installed

## Installation

At the prompt of a Claude Code session:

```
/plugin install voice-bar --marketplace Sibo1505/claude-mods
```

From a shell: `claude plugin install voice-bar --marketplace Sibo1505/claude-mods`, then `/reload-plugins` in an open session.

### Extra steps

None. If Handy is not installed yet, install it from [handy.computer](https://handy.computer) first.

## Configuration

| Option | What it does | Required | Default |
|---|---|---|---|
| `handyPath` | Full path to Handy's program file | no | empty: looks in `%LOCALAPPDATA%\Handy\handy.exe` and `%ProgramFiles%\Handy\handy.exe` (Windows), `/Applications/Handy.app` (macOS), `/usr/bin/handy` or `handy` on the PATH (Linux; for the AppImage, set the path to the `.AppImage` file) |

Set it in `/plugin` → Installed → voice-bar → configure, or from a shell with `claude plugin configure voice-bar@claude-mods --values-stdin` and `{"handyPath": "…"}` as input.

## Check that it works

1. The four buttons appear above the prompt. **⏻** is green if Handy runs.
2. Click **Speak**, say a sentence, click **Stop**. The sentence appears in the prompt.
3. Click **⏎**. Claude answers.

## Update

```
claude plugin update voice-bar@claude-mods
```

Then `/reload-plugins` in an open session.

### Migration

None.

## Uninstall

```
claude plugin uninstall voice-bar@claude-mods
```

### Cleanup

None. Handy stays installed and keeps its settings.

## Changelog

- 0.1.0 (2026-11-16): First version.
