# AgentWolf

AgentWolf runs configurable Werewolf matches between Codex, Claude, Trae, and other Agent Client Protocol agents. Human users configure agents and boards, then watch the match through god, closed-eye, or individual-player views.

## Local development

Requirements: Node.js 24+, pnpm 10.20.

```sh
pnpm install
pnpm check
pnpm dev
```

Use `pnpm dev:developer` to start the loopback-only developer trajectory inspector. Runtime
traces are captured in both modes, while developer routes and each Match record's trajectory
action exist only for that explicit startup mode. Each ended or paused Match record exposes an
`添加仿真` workflow that captures, reviews, and approves a fixture entirely in the browser. The
equivalent `pnpm simulation:review -- <simulation-id>` and
`pnpm simulation:approve -- <simulation-id>` commands remain available for automation;
`pnpm test:simulation` runs the approved corpus.

The web app runs on `http://127.0.0.1:5173`; the API runs on `http://127.0.0.1:4310`. Runtime state is stored under `.agentwolf/`.

## Agent adapters

The built-in tool catalog uses:

- Trae CLI: `traecli acp serve`
- Codex: `@agentclientprotocol/codex-acp`
- Claude: `@agentclientprotocol/claude-agent-acp`
- Custom ACP: any command that serves ACP over stdio

Agent profiles bind one tool definition to one model and its connection parameters. Credentials are read from named environment variables and are not saved in profile records.

See [product behavior](docs/product.md), [architecture](docs/architecture.md), and [testing](docs/testing.md).
