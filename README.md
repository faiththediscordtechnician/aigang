# aigang

A Discord bot that runs a small team of Claude agents (Planner, Coder,
Reviewer) collaborating on a project. Each project lives in its own folder
under `projects/<name>/`, and the agents hand off work to each other by
posting in a Discord thread — the thread transcript is what each agent reads
before taking its turn.

## Setup

```bash
npm install
cp .env.example .env   # fill in DISCORD_BOT_TOKEN and ANTHROPIC_API_KEY
npm start
```

## Usage

In any channel the bot can see, type:

```
!project my-app | Build a small Express server with a /health endpoint and tests
```

The bot opens a thread (`project-my-app`), creates `projects/my-app/`, and
runs the agents in round-robin turns until Reviewer says `PROJECT COMPLETE`
or the round limit is hit.

## How it works

- `src/agents.js` — the agent roster and each agent's role/system prompt.
- `src/orchestrator.js` — runs one Claude Agent SDK session per turn (model
  `claude-haiku-4-5`, effort `low`), scoped to the project folder via `cwd`
  and restricted to file tools (`Read`, `Write`, `Edit`, `Glob`, `Grep`).
- `src/bot.js` — Discord entry point: starts a thread per project and relays
  each agent's reply into it.
- `src/projectPaths.js` — validates project names and resolves project
  folders, to keep everything inside `projects/`.
