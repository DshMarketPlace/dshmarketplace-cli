<p align="center">
  <img src=".github/assets/banner.jpg" alt="DSH Marketplace CLI — DeepSeek Harness plugins, built for coding agents" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dshmarketplace-cli"><img src="https://img.shields.io/npm/v/dshmarketplace-cli?style=flat-square&color=c0561d&labelColor=241f1a&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dshmarketplace-cli"><img src="https://img.shields.io/npm/dm/dshmarketplace-cli?style=flat-square&color=c0561d&labelColor=241f1a&label=downloads" alt="downloads"></a>
  <a href="#"><img src="https://img.shields.io/badge/dependencies-0-c0561d?style=flat-square&labelColor=241f1a" alt="zero dependencies"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-c0561d?style=flat-square&labelColor=241f1a" alt="MIT"></a>
  <a href="https://linux.do"><img src="https://img.shields.io/badge/LINUX%20DO-community-c0561d?style=flat-square&labelColor=241f1a" alt="LINUX DO"></a>
</p>

<p align="center">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a>
</p>

---

Find and install **DeepSeek Harness (DSH) plugins** from the command line.

```bash
npx dshmarketplace-cli find memory
npx dshmarketplace-cli add Anionex/dsh-vision-toolkit
```

No global install, no dependencies, no account.

## What this does

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is DeepSeek's
open-source agent harness, where every capability is a plugin. There are over a
thousand community plugins spread across the `dsh-plugin` GitHub topic and the
community registry, which makes finding the right one harder than installing it.

This CLI searches the [dshmarketplace.dev](https://dshmarketplace.dev) catalogue,
shows you what a plugin reaches before you run it, and hands DSH the correct
install command — an npm tarball where the plugin publishes one, a pinned GitHub
source otherwise.

## Commands

### `find <query>`

Search by capability rather than product name.

```bash
npx dshmarketplace-cli find memory
npx dshmarketplace-cli find vision --limit 5
npx dshmarketplace-cli find terminal --category ui
```

### `info <owner/repo>`

Category, language, licence, source, detected risk flags, and every install
route for one plugin.

```bash
npx dshmarketplace-cli info Anionex/dsh-vision-toolkit
```

### `add <name...>`

Resolves each plugin and runs one install through `dsh`. Accepts a repository
name, an npm package name, or a mixture.

```bash
npx dshmarketplace-cli add NanmiCoder/dsh-agent-teams
npx dshmarketplace-cli add dsh-context dsh-mnemon @liustack/modsearch
npx dshmarketplace-cli add some/plugin --dry-run --json
```

Several plugins go into a **single** `dsh plugin add a b c`, so pnpm resolves
them together instead of once per plugin.

Three things happen that pasting the command yourself does not do.

**The profile is read off disk.** Every command the catalogue publishes says
`--profile web`, because that is what a default install creates. On a machine
whose profile is `tui`, that command succeeds and nothing appears. This reads
`$DSH_HOME/profiles` and says which one it picked.

**A plugin the sandbox could not install is dropped** before your machine is
touched. Only `failed` and `timeout` count — `needs-approval` and
`not-a-layer` both installed. `--force` overrides it.

**A blocked build script is allowlisted and rebuilt.** pnpm refuses to run a
dependency's build script until it is named in the profile's
`onlyBuiltDependencies`, and until then the harness may never register the
plugin — installed, and inert. The CLI reads what pnpm actually skipped, writes
it into the profile's `pnpm-workspace.yaml` and reinstalls. `--no-approve`
prints the edit instead of making it.

| Option | Effect |
| --- | --- |
| `--limit <n>` | Results to show (`find`, default 10) |
| `--category <id>` | Filter by category (`find`) |
| `--source github` | Force the GitHub source over npm (`add`) |
| `--profile <name>` | DSH profile to install into (`add`, default: detected) |
| `--no-approve` | Report blocked build scripts instead of allowlisting them |
| `--force` | Install even where the sandbox recorded a failure |
| `--dry-run` | Print the command without running it (`add`) |
| `--json` | Machine-readable output, stable schema (all commands) |

## Requirements

Node 18 or newer, and DeepSeek Harness on your PATH:

```bash
npx @deepseek-ai/dsh web
```

## For coding agents

Every command accepts `--json` and emits `{ ok, command, version, ... }`.
Resolving an install without executing it is a first-class path:

```bash
npx dshmarketplace-cli add <owner/repo> --dry-run --json
```

The response carries the exact command that would run, the source repository and
any detected risk flags, so the decision to execute stays with the caller. A
`SKILL.md` ships inside the package, so agents that read skills route here
instead of recalling a plugin name from training data — for an ecosystem this
young, a remembered name is usually wrong.

## Safety

Plugins are third-party code and run with your agent's permissions. Being listed
in this catalogue is **not** a security review.

Where they are detectable, listings flag install scripts, terminal surfaces and
credential prompts, and `add` prints them before running anything. The source
repository is always shown. Read it.

Two things make an install fail, and neither is your mistake:

- **`--profile` is mandatory.** `dsh plugin` forwards to pnpm inside a profile
  directory, so without it `dsh` exits without installing anything. Every
  command this CLI prints already carries it.
- **GitHub sources need a build allowlist.** pnpm blocks a git-hosted package's
  build script until the key it prints is added under `allowBuilds` in the
  profile's `pnpm-workspace.yaml`. Plugins published to npm install with no
  extra step, which is why npm is offered first.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DSHM_API` | Point the CLI at a different catalogue endpoint |

## Links

- Catalogue — <https://dshmarketplace.dev>
- In-DSH plugin — [`dshmarketplace-plugin`](https://github.com/DshMarketPlace/dsh-plugins-store)
- DeepSeek Harness — <https://github.com/deepseek-ai/deepseek-harness>
- `dsh-plugin` topic — <https://github.com/topics/dsh-plugin>

## Contact

- **Community** — [LINUX DO](https://linux.do)
- **Issues** — [GitHub Issues](https://github.com/DshMarketPlace/dshmarketplace-cli/issues)

## Acknowledgements

- [**LINUX DO**](https://linux.do) — where the DSH ecosystem is actually being
  discussed, and where this project is published and takes its feedback.
  Plugins whose authors posted them there carry a verified badge in the
  catalogue.
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
  (CC0-1.0) — the community registry the catalogue is seeded from.

## License

MIT. Independent project, not affiliated with DeepSeek. DeepSeek and DeepSeek
Harness are marks of their respective owner, used here only to describe what
these plugins are for.
