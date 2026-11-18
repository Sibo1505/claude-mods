# mod-manager

> Say "install mods a, b" in any session: Claude installs, updates or removes mods from this store the way each mod's README describes.

## At a glance

| | |
|---|---|
| Version | 0.1.1 |
| Kind | Skill (no hooks module) |
| Tested with | Claude Code 2.1.325 |
| Platforms | Windows, macOS, Linux |
| Status | Experimental |

## What it does

Adds the skill `mods`. Ask Claude in your own words, in any session:

- "install mods a, b"
- "update all mods"
- "remove mod a"
- "which mods are there?"

Claude refreshes the store, reads each mod's README, shows you in a few lines what the mod does, what it may do and what it needs, then runs the `claude plugin` commands for you and reports what changed.

## Permissions

- Hooks: none (a skill is instructions for Claude, not code)
- What Claude does with it: runs `claude plugin …` commands and reads the store's local copy. Any other command a mod's README asks for is shown to you first and only runs after you say yes.
- Network: through `claude plugin`, to GitHub (fetching the store)
- Blocks or allows tool calls: no

## Requirements

- Claude Code 2.1.287 or newer
- Git (Claude Code uses it to fetch the store from GitHub)

## Installation

At the prompt of a Claude Code session:

```
/plugin install mod-manager --marketplace Sibo1505/claude-mods
```

From a shell: `claude plugin install mod-manager --marketplace Sibo1505/claude-mods`, then `/reload-plugins` in an open session.

### Extra steps

None.

## Configuration

None.

## Check that it works

In a new session, ask "which mods are there?". Claude answers with a table of the store's mods.

## Update

```
claude plugin update mod-manager@claude-mods
```

Then `/reload-plugins` in an open session.

### Migration

None.

## Uninstall

```
claude plugin uninstall mod-manager@claude-mods
```

### Cleanup

None. Mods you installed stay installed.

## Changelog

- 0.1.1 (2026-11-16): Read the store's files with the file-reading tool by exact path; tell the user that a reinstalled mod starts with empty settings, and how to set them.
- 0.1.0 (2026-11-16): First version.
