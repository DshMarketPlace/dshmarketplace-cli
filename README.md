# dshmarketplace-cli

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

### `add <owner/repo>`

Resolves the plugin and runs the install through `dsh`.

```bash
npx dshmarketplace-cli add NanmiCoder/dsh-agent-teams
npx dshmarketplace-cli add zhu1090093659/dsh-web-ui --dry-run
npx dshmarketplace-cli add some/plugin --source github
```

| Option | Effect |
| --- | --- |
| `--limit <n>` | Results to show (`find`, default 10) |
| `--category <id>` | Filter by category (`find`) |
| `--source github` | Force the GitHub source over npm (`add`) |
| `--dry-run` | Print the command without running it (`add`) |

## Requirements

Node 18 or newer, and DeepSeek Harness on your PATH:

```bash
npx @deepseek-ai/dsh web
```

## Safety

Plugins are third-party code and run with your agent's permissions. Being listed
in this catalogue is **not** a security review.

Where they are detectable, listings flag install scripts, terminal surfaces and
credential prompts, and `add` prints them before running anything. The source
repository is always shown. Read it.

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
