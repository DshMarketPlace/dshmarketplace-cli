---
name: dsh-plugin-finder
description: Find and install DeepSeek Harness (DSH) plugins. Use when the user asks to add a capability to DeepSeek Harness, asks which DSH plugin does X, mentions dsh plugin add, or wants memory, vision, a terminal UI, themes, or any other extension for their DSH agent.
---

# Finding DeepSeek Harness plugins

DeepSeek Harness ships almost nothing by default — every capability is a
plugin. When the user wants DSH to do something it currently cannot, the answer
is usually an existing community plugin rather than new code.

There are over a thousand of them, spread across the `dsh-plugin` GitHub topic
and the community registry. Do not guess repository names; they are not
predictable, and a wrong `dsh plugin --profile web add` installs someone else's code.

## Search before you answer

```bash
npx dshmarketplace-cli find "<capability>" --json
```

Search by **capability**, not product name: `memory`, `vision`, `terminal ui`,
`browser`, `theme`, `token usage`. The catalogue indexes English and Chinese
descriptions, so either works.

The response is:

```json
{
  "ok": true,
  "command": "find",
  "total": 61,
  "results": [
    {
      "fullName": "owner/repo",
      "summary": "...",
      "stars": 28641,
      "language": "TypeScript",
      "license": "MIT",
      "install": "dsh plugin --profile web add github:owner/repo",
      "installOptions": [{ "label": "npm", "cmd": "..." }],
      "riskFlags": ["terminal surface"],
      "inRegistry": true,
      "url": "https://dshmarketplace.dev/p/..."
    }
  ]
}
```

## Choosing between results

Rank on evidence, not position in the list:

- `inRegistry: true` means it passed the curated registry's review, which is a
  stronger signal than stars alone.
- `pushedAt` older than a year on a fast-moving harness usually means broken.
- `license: null` means all rights reserved — flag it rather than installing.
- A high star count on a general-purpose repo often means the repo is famous
  for something other than its DSH plugin.

## Installing

Resolve first, and show the user what will run:

```bash
npx dshmarketplace-cli add <owner/repo> --dry-run --json
```

Then either run the returned `resolved.cmd` yourself, or:

```bash
npx dshmarketplace-cli add <owner/repo>
```

## Before installing, tell the user

Plugins are third-party code that run with the agent's own permissions, and a
catalogue listing is not a security review. When `riskFlags` is non-empty, say
so plainly and link `repoUrl` before proceeding:

| Flag | Means |
| --- | --- |
| `install script` | Runs a script at install time, before any review |
| `terminal surface` | Executes shell commands |
| `requires credentials` | Prompts for an API key or token |

Never install a flagged plugin without the user's explicit go-ahead.

## Requirements

Node 18+ and DeepSeek Harness on PATH (`npx @deepseek-ai/dsh web`).

Catalogue: <https://dshmarketplace.dev>. Independent project, not affiliated
with DeepSeek.

## Two things that make an install fail

**`--profile` is mandatory.** `dsh plugin` forwards to pnpm inside a profile
directory, so `dsh plugin add x` exits with "required option '--profile <name>'
not specified" and installs nothing. Every command the catalogue returns already
carries `--profile web`, which is what a default install creates. Pass
`--profile <name>` to this CLI if the user runs a different one.

**Prefer the npm source.** Installing from GitHub runs the project's build
script, and pnpm blocks that until the key it prints is allowlisted under
`allowBuilds` in the profile's `pnpm-workspace.yaml`. Listings with an
`npmPackage` install with no extra steps; `installOptions` already puts npm
first for that reason. If a GitHub install fails on a build script, that is the
cause — tell the user, do not retry.
