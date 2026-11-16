# limit-meter

> Shows your 5-hour and weekly usage limits and the context fill under the prompt, with colored bars and the time until each limit resets.

```
5h ▰▱▱▱▱▱▱▱ 6 % · 2 h 26 min   Week ▰▱▱▱▱▱▱▱ 6 % · 3 d 5 h   Context 9 %
? for shortcuts
```

## At a glance

| | |
|---|---|
| Version | 0.1.0 |
| Kind | Status line (a row under the prompt) |
| Tested with | Claude Code 2.1.325 |
| Platforms | Windows, macOS, Linux (terminal and desktop app) |
| Status | Experimental |

## What it does

Adds one row under the prompt, above Claude Code's own hint line:

- **5h**: how much of your 5-hour limit is used, and how long until it resets
- **Week**: the same for the weekly limit
- **Context**: how full the context window is

Colors follow your Claude Code theme: green under 50 %, yellow from 50 %, red from 80 %. The countdown moves once a minute. On a narrow terminal the bars go first, then the countdowns.

The figures are the ones Claude Code itself reports (the same as `/usage` and the status line). The limits appear after Claude's first answer in a session, and only with a Claude subscription; with an API key the row shows the context alone.

## Permissions

What the mod hooks and calls, as `claude plugin validate` reports it:

- Hooks: `session.start`, `session.measure`, `ui.render` (only the hint row under the prompt)
- Calls: `$.session.usage`, `$.clock.now`, `$.clock.every`, `$.state.get`, `$.state.set`, `$.ui.resolve`
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

- 0.1.0 (2026-11-16): First version.
