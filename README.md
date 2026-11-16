# Claude Mods

A small app store for [Claude Code](https://code.claude.com) mods. Browse the list, pick what you like, install it with one line.

A **mod** is a Claude Code plugin with a small TypeScript module that changes how Claude Code looks or behaves: a panel beside the chat, a line above the prompt, a rule for tool calls, a new slash command, a theme. Mods need **Claude Code 2.1.287 or newer**.

## Mods

| Mod | What it does | Kind | Status | Version |
|---|---|---|---|---|
| [limit-meter](mods/limit-meter/) | Your 5-hour and weekly limits and the context fill under the prompt, with colored bars and reset countdowns. | Status line | Experimental | 0.2.0 |
| [voice-bar](mods/voice-bar/) | Speak and send buttons above the prompt: dictate with [Handy](https://handy.computer) (offline), see whether it is listening, send with one click. | Band | Experimental | 0.1.0 |

## Tools

| Plugin | What it does | Version |
|---|---|---|
| [mod-manager](manager/) | Say "install mods a, b" in any session, and Claude installs, updates or removes them for you. | 0.1.1 |

## Install a mod

At the prompt of a Claude Code session in a terminal:

```
/plugin install <mod> --marketplace Sibo1505/claude-mods
```

Answer `y` to add the store, then press Enter for the user scope (the mod then runs in all your sessions).

- **From a shell:** `claude plugin install <mod> --marketplace Sibo1505/claude-mods`, then type `/reload-plugins` in an open session (or start a new one).
- **In the desktop app:** click **+** next to the prompt box, then **Plugins** → **Add marketplace** with `Sibo1505/claude-mods`, then add the mod.
- **Browse first:** add the store once with `/plugin marketplace add Sibo1505/claude-mods`, then open `/plugin` → **Discover**.

## Let Claude do it

Install the mod manager once:

```
/plugin install mod-manager --marketplace Sibo1505/claude-mods
```

Then just say, in any session: "install mods a, b", "update all mods", "remove mod a", "which mods are there?". Claude reads each mod's README, shows you what the mod does and may do, and runs the install for you.

## Update and remove

- **Update:** `claude plugin update <mod>@claude-mods`, then `/reload-plugins`. Or `/plugin` → **Installed** → the mod → **Update now**.
- **Remove:** `claude plugin uninstall <mod>@claude-mods`. Some mods list extra cleanup steps in their README.
- Updates do not arrive by themselves: auto-update is off for this store unless you turn it on (`/plugin` → **Marketplaces**).

## Safety

A mod is code that runs inside Claude Code **with your permissions and without a sandbox**. Before you install one, read the **Permissions** section of its README: it lists what the mod hooks, whether it uses the network or starts processes, and whether it blocks tool calls.

Every mod in this store follows these rules:

- No secrets in the code. Tokens and keys are settings you fill in yourself; Claude Code keeps them in your system's credential store.
- No mod allows a tool call that your own permission rules would block.
- Network access is listed with its target.
- Nothing depends on the author's own machine or servers.

## Build a mod

[CLAUDE.md](CLAUDE.md) has the rules, [templates/mod](templates/mod/) is the starting point.

## License

[MIT](LICENSE)
