# mod-template

> Starting point for a new mod: adds the command `/mod-template`, which says hello.

## At a glance

| | |
|---|---|
| Version | 0.1.0 |
| Kind | Command |
| Tested with | Claude Code 2.1.325 |
| Platforms | Windows, macOS, Linux |
| Status | Template (not listed in the store) |

<!-- Kind: Pane · Band · Status line · Tool rule · Command · Theme · Other
     Status: Experimental · Stable · Template -->

## What it does

Adds the slash command `/mod-template`. When you run it, Claude Code prints a short greeting. That is all: the template exists so that a new mod starts from a folder that already validates and passes its test.

## Permissions

What the mod hooks and calls, as `claude plugin validate` reports it:

- Hooks: `session.start`, `command.run` (only its own command `/mod-template`)
- Calls: `$.command.register`
- Network: none
- Processes: none
- Files: none
- Blocks tool calls: no
- Allows tool calls: no (no mod in this store does)

## Requirements

- Claude Code 2.1.287 or newer

## Installation

At the prompt of a Claude Code session:

```
/plugin install mod-template --marketplace Sibo1505/claude-mods
```

From a shell: `claude plugin install mod-template --marketplace Sibo1505/claude-mods`, then `/reload-plugins` in an open session.

(The template itself is not in the store. The lines show the pattern every mod's README uses.)

### Extra steps

None.

## Configuration

None.

<!-- For each userConfig option: name, what it is for, required or not, default.
     A secret (token, key) is marked "sensitive" and is entered by the user in
     /plugin → Installed → this mod → configure. Never in chat, never in a file. -->

## Check that it works

Type `/mod-template`. Claude Code prints `Hello from mod-template. Copy this folder to start a new mod.`

## Update

```
claude plugin update mod-template@claude-mods
```

Then `/reload-plugins` in an open session.

### Migration

None.

## Uninstall

```
claude plugin uninstall mod-template@claude-mods
```

### Cleanup

None.

## Changelog

- 0.1.0 (2026-11-16): First version.
