# HBM AGENT CLI Reference

Live sources when anything looks stale: `hbm --help`, `hbm <command> --help`,
https://hermes-agent.nousresearch.com/docs/reference/cli-commands

### Global Flags

```
hbm [flags] [command]        (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
hbm chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
hbm setup [section]      Wizard (model|tts|terminal|gateway|tools|agent)
hbm model                Interactive model/provider picker
hbm fallback [add|remove|list]  Fallback provider chain
hbm config [show|edit|get|set|unset|path|env-path|check|migrate]
hbm login / logout       OAuth sign-in / clear stored auth
hbm doctor [--fix]       Check dependencies and config
hbm status [--all]       Component status
```

### Tools & Skills

```
hbm tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

hbm skills list|browse|search QUERY|inspect ID
hbm skills install ID    Hub identifier OR a direct https://…/SKILL.md URL
hbm skills config        Enable/disable skills per platform
hbm skills check|update|uninstall|publish PATH
hbm skills tap add REPO  Add a GitHub repo as a skill source
hbm bundles              Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
hbm mcp add NAME (--url or --command) | remove | list | test NAME
hbm mcp catalog | install NAME     Curated catalog install
hbm mcp configure NAME             Toggle tool selection
hbm mcp serve                      Run HBM AGENT as an MCP server
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
hbm gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `hbm photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/

### Sessions

```
hbm sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
hbm cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
hbm webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
hbm profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
hbm profile rename A B | alias NAME | export NAME | import FILE
hbm profile migrate-identity A B   Retry a completed rename's session/routing identity migration
```

### Credentials & Pools

```
hbm auth                 Interactive credential manager
hbm auth add [PROVIDER]  Add OAuth or API-key credential (nous, openai-codex, qwen-oauth, …)
hbm auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
hbm desktop / gui        Native desktop app
hbm dashboard            Web admin panel + embedded chat (--stop / --status)
hbm proxy                OpenAI-compatible local proxy backed by an OAuth provider
hbm portal               Quick setup / sign in via Nous Portal
hbm kanban <verb>        Multi-agent work-queue board
hbm project              Named multi-folder workspaces
hbm skin list|use|set    Switch/tweak skins (see references/themes.md)
hbm pets <verb>          Pet mascots (see references/petdex.md)
hbm memory setup|status|off|reset   Memory provider
hbm secrets bitwarden|onepassword   External secret stores
hbm moa                  Mixture-of-Agents slots
hbm hooks / security / backup / import / checkpoints / console
hbm logs [-f] [errors]   View agent/error logs
hbm send                 One-off message through a gateway platform
hbm pairing / plugins / insights / journey / computer-use
hbm acp                  ACP server (IDE integration)
hbm completion bash|zsh|fish
hbm update / uninstall / claw migrate
```

Plugin- and provider-supplied subcommands (e.g. `hbm photon setup`) only appear once their plugin is installed/active.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `hbm config edit` · [Configuration docs](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) |
| Tools / toolsets | `hbm tools list` · [Tools reference](https://hermes-agent.nousresearch.com/docs/reference/tools-reference) |
| Skills catalog | `hbm skills browse` · [Skills catalog](https://hermes-agent.nousresearch.com/docs/reference/skills-catalog) |
| Provider setup | `hbm model` · [Providers guide](https://hermes-agent.nousresearch.com/docs/integrations/providers) |
| Env variables | `hbm config env-path` · [Env vars reference](https://hermes-agent.nousresearch.com/docs/reference/environment-variables) |
| Gateway logs | `~/.hbm/logs/gateway.log` (or `hbm logs`) |
| Sessions | `hbm sessions browse` (reads state.db) |
