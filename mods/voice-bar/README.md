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
| **⏎** | Sends what is in the prompt, like Enter. With an empty prompt it turns red for a moment. Claude Code marks a message a mod sends as *Prompt from the voice-bar plugin*, so Claude knows it came through the mod; no mod can send as if you typed it. Press Enter instead if you want the plain look. |
| **●** | Status light: green when Handy runs, grey when it is off, red when something is wrong. Click it for a message that says what is going on. |
| **⏻** | Power switch for Handy: green when it runs, white when it is off. Click to start or quit Handy. |

Handy's own shortcut (default `ctrl+space`) keeps working as before. The mod only knows about recordings it started; when Handy pastes text, the button goes back to **Speak** in any case.

## Permissions

What the mod hooks and calls, as `claude plugin validate` reports it:

- Hooks: `session.start`, `prompt.change`, `ui.render` (only its own row above the prompt)
- Calls: `$.process.run`, `$.env.get`, `$.fs.exists`, `$.prompt.read`, `$.prompt.fill`, `$.prompt.submit`, `$.ui.toast`, `$.clock.after`, `$.clock.sleep`, `$.state.get`, `$.state.set`, `$.ui.resolve`
- Processes, only when you click a button or once when a session starts:
  - Handy itself: `handy --toggle-transcription` (start or stop a recording)
  - checking whether Handy runs: `tasklist` (Windows) or `pgrep -x handy` (macOS, Linux)
  - starting Handy: `cmd /c start` (Windows), `open -a Handy` (macOS), `sh -c 'setsid …'` (Linux), always with `--start-hidden`
  - quitting Handy: `taskkill /IM handy.exe /F` (Windows), `osascript -e 'quit app "Handy"'` (macOS), `pkill -x handy` (Linux)
- Files: checks whether Handy's program file exists in its usual install folders
- Environment: reads `OS`, `LOCALAPPDATA` and `ProgramFiles` to find Handy
- Network: none. Handy works offline; your voice never leaves your computer.
- Microphone: only Handy records, and only after you click **Speak** (or use Handy's own shortcut). Handy itself may keep recordings and a history in its own app folder; that is set in Handy's settings, not by this mod.
- Blocks tool calls: no
- Allows tool calls: no

A Handy path from the settings is only used when it ends in `handy` or `handy.exe` and holds no character a shell could read as a command.

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
| `handyPath` | Full path to Handy's program file | no | empty: looks in `%LOCALAPPDATA%\Handy\handy.exe` and `%ProgramFiles%\Handy\handy.exe` (Windows), `/Applications/Handy.app` (macOS), `/usr/bin/handy` or `handy` on the PATH (Linux) |

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
