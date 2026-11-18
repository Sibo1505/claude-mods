# Claude Mods: rules for working in this repo

This repo is a public **plugin marketplace** (an "app store") of Claude Code mods. Anyone can read every file, and other people run these mods with their own full permissions. Write every file with that in mind.

## Layout

```
.claude-plugin/marketplace.json   the store's catalog: one entry per mod, plus mod-manager
manager/                          plugin "mod-manager": the skill "mods" (install, update, remove, list)
mods/<name>/                      one folder per mod
templates/mod/                    a working minimal mod to copy (not in the catalog)
README.md                         the store front: the table of all mods
```

A mod folder:

```
mods/<name>/
├── .claude-plugin/plugin.json    name, version, description, author, license
├── hooks/hooks.json              { "modules": ["./register.ts"] }
├── hooks/register.ts             the hooks module (.tsx when it draws UI)
├── types/index.d.ts              only if the mod keeps values in $.state
├── tests/<name>.test.ts          at least one test
└── README.md                     the fixed sections (see below)
```

## When the user says "install / update / remove mods …"

Follow `manager/skills/mods/SKILL.md`, also in this repo when the mod-manager plugin is not installed. That file is the one place the procedure is written.

## Rules for every mod

### Names

- Folder name = `name` in `plugin.json` = `name` in the catalog entry.
- Lowercase letters, digits and hyphens, at most 64 characters.
- Never starts with `claude-`, `anthropic-` or `cc-plugin-` (reserved).

### Versions

- `version` lives only in the mod's `plugin.json`, never in the catalog. SemVer:
  - bug fix → patch (`0.1.1`)
  - new feature → minor (`0.2.0`)
  - breaking change (a setting renamed, stored data changes shape, a command removed) → major
- **Every change that should reach people needs a new version.** Without one, `claude plugin update` fetches nothing.
- Every version gets a changelog line in the README: `- 0.2.0 (YYYY-MM-DD): what changed`.

### README sections

Copy `templates/mod/README.md` and keep every heading; write "None." where a section has nothing. The skill `mods` reads them by name:

`At a glance` · `What it does` · `Permissions` · `Requirements` · `Installation` (with `### Extra steps`) · `Configuration` · `Check that it works` · `Update` (with `### Migration`) · `Uninstall` (with `### Cleanup`) · `Changelog`

Extra steps, migrations and cleanups should be `claude plugin …` commands or settings the user fills in. Anything else (another shell command, editing a file) is shown to the user and needs their yes, so keep it rare and write it out exactly.

### Works for everyone

- A mod never depends on the author's own setup: no fixed paths (`C:\Users\…`, `/home/…`), host names, server addresses, chat IDs or note paths. Whatever is personal becomes a `userConfig` option the user fills in.
- Paths inside the mod: `${CLAUDE_PLUGIN_ROOT}` (the installed copy, changes on update) and `${CLAUDE_PLUGIN_DATA}` (kept across updates).
- Runs on Windows, macOS and Linux. Where it cannot, `At a glance` → Platforms says so.

### Safety

- **No secrets in the repo.** Tokens and keys are `userConfig` options with `"sensitive": true` (kept in the OS credential store). Never in `$.store`, `$.state`, logs or test files. Never ask for them in chat.
- **Never allow** a tool call that the user's permission rules would stop. A mod may block or observe tool calls, not approve them.
- A hook that blocks (on `tool.call`, `tool.check`, `prompt.submit`, `command.run` and the like) has a `.catch` that blocks too when the hook fails:
  `on(...).catch(($, e, next) => next.called ? next(e) : { deny: 'why' })`
- **Network:** a mod that uses `$.http` names the target host under `Permissions`. Conversation content leaves the machine only when a setting explicitly allows it.
- No `eval`, no code downloaded at run time.
- `Permissions` is honest and matches the `hooks:` and `calls:` lines of `claude plugin validate`.

## Building a new mod

1. Copy `templates/mod/` to `mods/<name>/` and replace every `mod-template` with `<name>`.
2. Load the skill `plugin-authoring` for the mod API (events, `$`, UI elements, tests); its types file is the reference. Write the mod **in `mods/<name>/` in this repo**, not in the session's dev-mods folder, so there is one copy only.
3. Try it live: in a second terminal tab, `claude --plugin-dir <absolute path to mods/<name>>`. Saving a file reloads the mod. If the mod is also installed from the store, the `--plugin-dir` copy takes its place in that session (tested 2026-11-16: one row, not two), so there is nothing to disable. Test sessions cost tokens: start them with `--model sonnet`.
4. Write the test and the README from the template.
   - `$` may only be passed to a function declared at the top level of the file (or imported from the mod's own files), never to a helper defined inside `register`; otherwise the module does not load.
   - Loading the mod with `--plugin-dir` writes a `tsconfig.json` into the mod folder. Commit it; `.claude-plugin/types/` stays ignored.
5. Add the catalog entry in `.claude-plugin/marketplace.json` (same `description` as `plugin.json`) and a row in the table of `README.md`.
6. Go through the checklist, then open a pull request.

## Changing a mod

Bump the version, add a changelog line, update `Permissions` if hooks or calls changed, write any migration under `Update` → `### Migration`, and update the version in the README table. Then the checklist.

## Checklist before every pull request

1. `claude plugin validate .` (the catalog) → passed.
2. `claude plugin validate mods/<name>` → passed, and **no TypeScript errors** in its output (validate type-checks the module and the tests; they show as warnings).
3. `claude plugin test mods/<name>` → at least one test, all pass.
4. README has every section; `Permissions` matches the validate output.
5. Version bumped, changelog line written, catalog entry and README table up to date.
6. Secret scan of the changed folders finds nothing (tool `scan_secrets` of the plugin-authoring skill), and the diff holds no personal data (names, paths, hosts, email addresses).

## Docs

- Mods: https://code.claude.com/docs/en/plugins/mods/overview
- Plugin manifest: https://code.claude.com/docs/en/plugins/manifest-reference
- Marketplaces: https://code.claude.com/docs/en/plugins/marketplace-reference
