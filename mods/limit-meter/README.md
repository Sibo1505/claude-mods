# limit-meter

> Shows your 5-hour and weekly usage limits and the context fill under the prompt, with colored bars and the time until each limit resets.

```
5h ▰▱▱▱▱▱▱▱ 6 % · 2 h 26 min   Week ▰▱▱▱▱▱▱▱ 6 % · 3 d 5 h   Context 9 %
? for shortcuts
```

## At a glance

| | |
|---|---|
| Version | 0.2.1 |
| Kind | Status line (a row under the prompt) |
| Tested with | Claude Code 2.1.325 |
| Platforms | Windows, macOS, Linux (terminal and desktop app) |
| Status | Experimental |

## What it does

Adds one row under the prompt, above Claude Code's own hint line:

- **5h**: how much of your 5-hour limit is used, and how long until it resets
- **Week**: the same for the weekly limit
- **Context**: how full the context window is

Colors follow your Claude Code theme: green under 50 %, yellow from 50 %, red from 80 %. The countdown moves once a minute (every second while a limit is used up, see below). On a narrow terminal the bars go first, then the countdowns.

When a limit is used up (100 %), its countdown becomes a live timer that ticks every second, followed by the local time it frees up again (a weekday is added when that is not today, and the date when it is six days or more away):

```
5h ▰▰▰▰▰▰▰▰ 100 % · resets in 2:26:13 · 14:26   Week ▰▰▱▱▱▱▱▱ 23 % · 3 d 5 h   Context 40 %
```

Once a reset time has passed, the window shows 0 % until Claude Code reports new figures, instead of the old value.

All of this runs locally inside Claude Code: no model calls, no tokens. The row is redrawn once a minute, and once a second only while a limit is used up and its live timer is on screen. Sessions without a screen (`claude -p`, SDK hosts) run no clock at all.

The figures are the ones Claude Code itself reports (the same as `/usage` and the status line). The limits appear after Claude's first answer in a session, and only with a Claude subscription; with an API key the row shows the context alone.

## Permissions

What the mod hooks and calls, as `claude plugin validate` reports it:

- Hooks: `session.start`, `session.measure`, `ui.render` (only the hint row under the prompt)
- Calls: `$.session.usage`, `$.clock.now`, `$.clock.after`, `$.state.get`, `$.state.set`, `$.ui.resolve`
- Network: none
- Processes: none
- Files: none
- Blocks tool calls: no
- Allows tool calls: no

Nothing leaves your computer.

## Requirements

- Claude Code 2.1.287 or newer

## Installation

At the prompt of a Claude Code session:

```
/plugin install limit-meter --marketplace Sibo1505/claude-mods
```

From a shell: `claude plugin install limit-meter --marketplace Sibo1505/claude-mods`, then `/reload-plugins` in an open session.

### Extra steps

None.

## Configuration

| Option | What it does | Required | Default |
|---|---|---|---|
| `language` | Labels and time units: `en` (5h, Week, Context, d) or `de` (5h, Woche, Kontext, T) | no | `en` |

Set it in `/plugin` → Installed → limit-meter → configure, or from a shell:

```
claude plugin configure limit-meter@claude-mods --values-stdin
```

with `{"language": "de"}` as input. Then `/reload-plugins`.

## Check that it works

Send any message to Claude. After the answer, a row with `5h`, `Week` and `Context` appears under the prompt. The percentages match `/usage`.

## Update

```
claude plugin update limit-meter@claude-mods
```

Then `/reload-plugins` in an open session.

### Migration

None.

## Uninstall

```
claude plugin uninstall limit-meter@claude-mods
```

### Cleanup

None.

## Changelog

- 0.2.1 (2026-11-17): Fixes from a code review: 99.5–99.9 % (shown as "100 %") also gets the live timer and a full bar; the live timer never skips or repeats a second; the clock restarts with every new reading (a lost timer comes back); no clock without a screen or on a narrow terminal; a reset six or more days away shows its date; a failure never stops the measurement for other plugins; the row never wraps (it drops the bars, then the countdowns, by its real length instead of fixed widths).
- 0.2.0 (2026-11-16): A used-up limit shows a live timer (every second) and the local reset time. After a reset the old figure is no longer shown (0 % until the next reading).
- 0.1.0 (2026-11-16): First version.
