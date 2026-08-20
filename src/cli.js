#!/usr/bin/env node
/**
 * dshmarketplace — find and install DeepSeek Harness plugins.
 *
 * Zero dependencies on purpose: this runs via `npx` on machines we know
 * nothing about, so every extra package is an extra way to fail before the
 * user has installed anything.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { styleText } from "node:util";

const VERSION = "0.3.0";

// One canonical endpoint. DSHM_API covers anyone who needs to point the CLI
// somewhere else — a mirror, a staging deployment, or a local catalogue.
const ENDPOINTS = process.env.DSHM_API
  ? [process.env.DSHM_API]
  : ["https://dshmarketplace.dev"];

const c = {
  dim: (s) => tint(s, "dim"),
  bold: (s) => tint(s, "bold"),
  copper: (s) => tint(s, "yellow"),
  red: (s) => tint(s, "red"),
  green: (s) => tint(s, "green"),
};

function tint(s, style) {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return s;
  try {
    return styleText(style, s);
  } catch {
    return s;
  }
}

/**
 * Stable machine-readable envelope. Coding agents are a first-class caller of
 * this CLI, so `--json` output is a contract: fields are added, never renamed
 * or removed, and every command emits the same shape.
 */
function emitJson(command, payload) {
  process.stdout.write(
    `${JSON.stringify({ ok: true, command, version: VERSION, ...payload }, null, 2)}\n`,
  );
}

async function api(path) {
  let lastError;
  for (const base of ENDPOINTS) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { "User-Agent": `dshmarketplace-cli/${VERSION}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Could not reach the catalogue (${lastError?.message ?? "unknown"}). ` +
      `Set DSHM_API to override the endpoint.`,
  );
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function printPlugin(p, index) {
  const stars = p.stars ? c.dim(`★ ${p.stars}`) : "";
  const risk = p.riskFlags?.length
    ? c.copper(` ⚠ ${plural(p.riskFlags.length, "flag", "flags")}`)
    : "";

  console.log(
    `${c.dim(String(index + 1).padStart(2))}  ${c.bold(p.fullName)} ${stars}${risk}`,
  );
  if (p.summary) {
    console.log(`    ${c.dim(truncate(p.summary, 96))}`);
  }
  console.log(`    ${c.copper("$")} ${p.install}`);
  console.log();
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

async function find(query, options) {
  if (!query) {
    console.error("Usage: npx dshmarketplace-cli find <query>");
    process.exit(1);
  }

  const params = new URLSearchParams({ q: query, limit: String(options.limit) });
  if (options.category) params.set("category", options.category);

  const data = await api(`/api/v1/plugins?${params}`);

  if (options.json) {
    return emitJson("find", {
      query,
      total: data.total,
      results: data.results,
    });
  }

  if (!data.results.length) {
    console.log(`No DeepSeek Harness plugins matched ${c.bold(query)}.`);
    console.log(
      c.dim("Try a capability instead of a product name — memory, vision, terminal."),
    );
    return;
  }

  console.log(
    `\n${c.bold(String(data.total))} ${data.total === 1 ? "match" : "matches"} for ${c.bold(query)}` +
      (data.total > data.results.length
        ? c.dim(`  (showing ${data.results.length})`)
        : "") +
      "\n",
  );

  data.results.forEach(printPlugin);
  console.log(c.dim(`Install one with: npx dshmarketplace-cli add <owner/repo>\n`));
}

async function info(name, options = {}) {
  const data = await api(`/api/v1/plugins?q=${encodeURIComponent(name)}&limit=5`);
  const p = data.results.find((r) => r.fullName === name) ?? data.results[0];

  if (!p) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, command: "info", error: "not_found", query: name })}\n`,
      );
      process.exit(1);
    }
    console.error(`Not found: ${name}`);
    process.exit(1);
  }

  if (options.json) return emitJson("info", { plugin: p });

  console.log(`\n${c.bold(p.fullName)}${p.stars ? c.dim(`  ★ ${p.stars}`) : ""}`);
  if (p.summary) console.log(`${p.summary}\n`);

  const rows = [
    ["Category", p.category],
    ["Language", p.language],
    ["Licence", p.license ?? "none declared"],
    ["Source", p.repoUrl],
    ["Registry", p.inRegistry ? "in curated registry" : "GitHub topic only"],
  ];
  for (const [k, v] of rows) {
    if (v) console.log(`${c.dim(k.padEnd(10))} ${v}`);
  }

  if (p.riskFlags?.length) {
    console.log(`\n${c.copper("Detected:")} ${p.riskFlags.join(", ")}`);
    console.log(c.dim("Read the source before granting these."));
  }

  console.log(`\n${c.bold("Install")}`);
  for (const opt of p.installOptions) {
    console.log(`  ${c.dim(opt.label.padEnd(7))} ${c.copper("$")} ${opt.cmd}`);
  }
  console.log(`\n${c.dim(p.url)}\n`);
}

/**
 * The harness keeps its profiles under $DSH_HOME/profiles/<name>. The catalogue
 * writes every command against `web` because that is what a default install
 * creates, but anyone running `tui` or `headless` would otherwise paste a
 * command that installs into a profile they never boot — it succeeds, and
 * nothing appears. Read the disk instead of assuming.
 */
function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

function detectProfiles() {
  try {
    return readdirSync(join(dshHome(), "profiles"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function resolveProfile(explicit) {
  if (explicit) return { profile: explicit, note: null };
  const found = detectProfiles();
  if (!found.length || found.includes("web")) return { profile: "web", note: null };
  if (found.length === 1) {
    return { profile: found[0], note: `No 'web' profile here — using '${found[0]}'.` };
  }
  return {
    profile: found[0],
    note: `Profiles here: ${found.join(", ")}. Using '${found[0]}' — override with --profile.`,
  };
}

/**
 * pnpm refuses to run a dependency's build script until it is allowlisted, and
 * says which one it skipped. That single line is the whole content of our
 * `needs-approval` verdict, and it is recoverable: the profile's
 * pnpm-workspace.yaml takes an `onlyBuiltDependencies` list, and a reinstall
 * then builds it. Parsing pnpm rather than trusting the catalogue is
 * deliberate — this is about the machine in front of us, and it is the same
 * reason the sandbox reads the profile manifest instead of the exit code.
 */
function parseBlockedBuilds(output) {
  return [
    ...new Set(
      [...output.matchAll(/Ignored build scripts:\s*([^\n]+)/g)]
        .flatMap((m) => m[1].split(","))
        .map((s) => s.trim().replace(/\.$/, "").replace(/@[^@]*$/, ""))
        .filter(Boolean),
    ),
  ];
}

/**
 * Appends to the profile's existing `onlyBuiltDependencies` block, or adds one.
 * Hand-rolled because this package carries no dependencies and a YAML parser
 * would be the largest thing in it — the file is machine-written and shaped
 * like the two cases handled here. Anything unexpected returns false and the
 * caller prints the edit for the user to make, rather than guessing at it.
 */
function allowBuilds(profileDir, packages) {
  const file = join(profileDir, "pnpm-workspace.yaml");
  if (!existsSync(file)) return false;

  const text = readFileSync(file, "utf8");
  const already = new Set(
    [...text.matchAll(/^\s*-\s*(\S+)\s*$/gm)].map((m) => m[1]),
  );
  const missing = packages.filter((p) => !already.has(p));
  if (!missing.length) return true;

  const lines = missing.map((p) => `  - ${p}`).join("\n");

  if (/^onlyBuiltDependencies:/m.test(text)) {
    writeFileSync(
      file,
      text.replace(/^onlyBuiltDependencies:.*$/m, (m) => `${m}\n${lines}`),
      "utf8",
    );
  } else {
    writeFileSync(file, `${text.replace(/\n*$/, "")}\n\nonlyBuiltDependencies:\n${lines}\n`, "utf8");
  }
  return true;
}

function run(bin, args, { capture = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: false,
    });
    let out = "";
    if (capture) {
      const tee = (chunk) => {
        out += chunk;
        process.stdout.write(chunk);
      };
      child.stdout.on("data", tee);
      child.stderr.on("data", tee);
    }
    child.on("error", (err) => resolve({ code: null, out, error: err }));
    child.on("exit", (code) => resolve({ code, out, error: null }));
  });
}

async function resolveOne(name, options) {
  const seen = new Map();
  // A scoped npm name is what our own install commands print, so it is what
  // people paste — and it is the one form the catalogue search missed until
  // `npmPackage` was added to it. Older deployments are still out there and
  // this CLI outlives them, so fall back to the bare name rather than telling
  // someone a plugin does not exist while its page is open in their browser.
  for (const query of [name, name.replace(/^@[^/]+\//, "")]) {
    if (seen.has(query)) continue;
    const data = await api(`/api/v1/plugins?q=${encodeURIComponent(query)}&limit=5`);
    seen.set(query, true);
    const hit =
      data.results.find((r) => r.fullName === name || r.npmPackage === name) ??
      (query === name ? data.results[0] : null);
    if (hit) {
      seen.set("hit", hit);
      break;
    }
  }

  const p = seen.get("hit");
  if (!p) return { query: name, plugin: null };

  const option =
    options.source === "github"
      ? (p.installOptions.find((o) => o.label === "GitHub") ?? p.installOptions[0])
      : p.installOptions[0];

  // The target, not the whole command: several plugins go into one
  // `dsh plugin add a b c`, which the harness accepts and which installs and
  // registers all of them in a single pnpm resolution.
  const target = option?.cmd?.match(/ add (\S+)$/)?.[1] ?? null;
  return { query: name, plugin: p, target };
}

/**
 * Curated sets. The catalogue serves them with the date and verdict of the
 * sandbox run that installed the whole combination at once — a preset is a
 * claim about plugins together, and combinations fail where the parts do not.
 */
async function preset(id, options) {
  const data = await api("/api/v1/presets");

  if (!id) {
    if (options.json) return emitJson("preset", data);
    console.log(`\n${c.bold("Curated sets")}\n`);
    for (const p of data.presets) {
      console.log(`  ${c.bold(p.id.padEnd(12))} ${p.name.en}`);
      console.log(`  ${" ".repeat(12)} ${c.dim(truncate(p.blurb.en, 78))}`);
      console.log(
        `  ${" ".repeat(12)} ${c.dim(`${plural(p.plugins.length, "plugin", "plugins")} · verified ${p.verified.at} · ${p.verified.verdict}`)}\n`,
      );
    }
    console.log(c.dim("Install one with: npx dshmarketplace-cli preset <id>\n"));
    return;
  }

  const chosen = data.presets.find((p) => p.id === id);
  if (!chosen) {
    console.error(
      c.red(`No preset called '${id}'.`) +
        c.dim(`\nAvailable: ${data.presets.map((p) => p.id).join(", ")}\n`),
    );
    process.exit(1);
  }

  // Nothing but JSON on stdout when an agent asked for JSON — `add` emits the
  // envelope below, and a human-readable header printed first would make the
  // documented contract unparseable.
  if (!options.json) {
    console.log(`\n${c.bold(chosen.name.en)}  ${c.dim(`(${chosen.id})`)}`);
    console.log(c.dim(chosen.blurb.en));
  }
  // Stated up front rather than buried. The whole reason to trust a preset is
  // that the combination was run, so the date and the verdict travel with it.
  if (!options.json) {
    console.log(
      c.dim(
        `\nVerified ${chosen.verified.at} — ${chosen.verified.verdict}, ` +
          `dsh ${chosen.verified.dsh}, pnpm ${chosen.verified.pnpm}`,
      ),
    );
  }

  // Hand the targets to the same path a manual `add` takes, so a preset gets
  // profile detection, the sandbox pre-flight and the build-script allowlist
  // for free — and cannot drift from what `add` does. The endpoint returns a
  // record per member, not a bare string, because the page needs the summary
  // and the star count; `add` wants the install target out of it.
  return add(
    chosen.plugins.map((m) => (typeof m === "string" ? m : m.target)),
    options,
  );
}

async function add(names, options) {
  if (!names.length) {
    console.error("Usage: npx dshmarketplace-cli add <owner/repo> [more...]");
    process.exit(1);
  }

  const resolved = await Promise.all(names.map((n) => resolveOne(n, options)));

  const missing = resolved.filter((r) => !r.plugin);
  const unusable = resolved.filter((r) => r.plugin && !r.target);
  // A verdict is only worth acting on when it says the command cannot work.
  // `needs-approval` and `not-a-layer` both installed; they are not blockers.
  const broken = options.force
    ? []
    : resolved.filter(
        (r) => r.target && ["failed", "timeout"].includes(r.plugin.installCheck),
      );
  const usable = resolved.filter(
    (r) => r.target && !broken.includes(r),
  );

  const { profile, note } = resolveProfile(options.profile);
  const profileDir = join(dshHome(), "profiles", profile);
  const targets = usable.map((r) => r.target);
  const cmd = targets.length
    ? `dsh plugin --profile ${profile} add ${targets.join(" ")}`
    : null;

  if (options.json && options.dryRun) {
    return emitJson("add", {
      profile,
      resolved: { cmd, targets },
      plugins: usable.map((r) => r.plugin),
      skipped: {
        notFound: missing.map((r) => r.query),
        noInstallCommand: unusable.map((r) => r.plugin.fullName),
        failedInSandbox: broken.map((r) => r.plugin.fullName),
      },
      executed: false,
    });
  }

  for (const r of missing) console.log(c.red(`✗ not in the catalogue: ${r.query}`));
  for (const r of unusable) {
    console.log(
      c.red(`✗ ${r.plugin.fullName}`) +
        c.dim(" — no install command exists for this listing"),
    );
  }
  for (const r of broken) {
    console.log(
      c.red(`✗ ${r.plugin.fullName}`) +
        c.dim(` — sandbox says '${r.plugin.installCheck}'; skipping. --force to try anyway.`),
    );
  }

  if (!usable.length) {
    console.error(c.red("\nNothing left to install.\n"));
    process.exit(1);
  }

  if (note) console.log(c.copper(`\n${note}`));

  console.log();
  for (const r of usable) {
    const flags = r.plugin.riskFlags?.length
      ? c.copper(`  ⚠ ${r.plugin.riskFlags.join(", ")}`)
      : "";
    console.log(`  ${c.bold(r.plugin.fullName)}${flags}`);
  }
  console.log(`\n${c.copper("$")} ${cmd}\n`);

  if (options.dryRun) return console.log(c.dim("--dry-run: not executing."));

  const [bin, ...args] = cmd.split(" ");
  const first = await run(bin, args, { capture: true });

  if (first.error) {
    if (first.error.code === "ENOENT") {
      console.error(
        c.red(`\n'${bin}' is not on your PATH.`) +
          c.dim("\nInstall DeepSeek Harness first: npx @deepseek-ai/dsh web\n"),
      );
    } else {
      console.error(c.red(`\n${first.error.message}\n`));
    }
    process.exit(1);
  }

  // The install "succeeded" and a plugin may still be inert. Finishing the job
  // is the point of running this through a tool instead of pasting a string.
  const blocked = parseBlockedBuilds(first.out);
  if (blocked.length) {
    console.log(
      c.copper(`\n⚠  pnpm refused to build: ${blocked.join(", ")}`) +
        c.dim("\n   Until it is allowed, the harness may not register the plugin."),
    );

    if (options.noApprove) {
      console.log(c.dim(`   Add these to onlyBuiltDependencies in ${profileDir}/pnpm-workspace.yaml`));
    } else if (allowBuilds(profileDir, blocked)) {
      console.log(c.dim(`   Allowed in ${profile}/pnpm-workspace.yaml — rebuilding.\n`));
      await run("pnpm", ["install", "--dir", profileDir]);
    } else {
      console.log(
        c.dim(`   Could not edit ${profileDir}/pnpm-workspace.yaml. Add by hand:\n`) +
          c.dim(`   onlyBuiltDependencies:\n${blocked.map((b) => `     - ${b}`).join("\n")}\n`),
      );
    }
  }

  if (first.code === 0) {
    console.log(c.green(`\n✓ ${plural(usable.length, "plugin", "plugins")} installed into '${profile}'\n`));
  }
  process.exit(first.code ?? 0);
}

const HELP = `
${c.bold("dshmarketplace-cli")} ${c.dim(`v${VERSION}`)}  —  DeepSeek Harness plugins

${c.bold("Usage")}
  npx dshmarketplace-cli find <query>        Search the catalogue
  npx dshmarketplace-cli info <owner/repo>   Show one plugin in detail
  npx dshmarketplace-cli add <name...>       Install one or more into DSH
  npx dshmarketplace-cli preset              List the curated sets
  npx dshmarketplace-cli preset <id>         Install a whole set

${c.bold("Options")}
  --json             Machine-readable output (stable schema)
  --limit <n>        Results to show (find, default 10)
  --category <id>    Filter by category (find)
  --source github    Force the GitHub source over npm (add)
  --profile <name>   DSH profile to install into (add, default: detected)
  --no-approve       Do not allowlist blocked build scripts; just report them
  --force            Install even when the sandbox says the command fails
  --dry-run          Resolve without running the install (add)

${c.bold("Examples")}
  npx dshmarketplace-cli find memory
  npx dshmarketplace-cli find vision --limit 5
  npx dshmarketplace-cli add Anionex/dsh-vision-toolkit

${c.bold("Installing several at once")}
  npx dshmarketplace-cli add dsh-context dsh-mnemon @liustack/modsearch

  They go into one \`dsh plugin add\`, so pnpm resolves them together. Anything
  the sandbox has recorded as failing is dropped before your machine is
  touched, and if pnpm refuses to run a build script the CLI allowlists it in
  the profile and rebuilds — which is the step that otherwise leaves a plugin
  installed but inert.

${c.bold("For coding agents")}
  Every command accepts --json and emits { ok, command, version, ... }.
  Resolve an install without executing it:

  npx dshmarketplace-cli add <owner/repo> --dry-run --json

  The response carries the exact command, the source repository and any
  detected risk flags, so the decision to run it stays with the caller.

${c.dim("Catalogue: https://dshmarketplace.dev")}
`;

function parseArgs(argv) {
  const positional = [];
  const options = { limit: 10, dryRun: false, json: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") options.limit = Number(argv[++i]) || 10;
    else if (arg === "--category") options.category = argv[++i];
    else if (arg === "--source") options.source = argv[++i];
    else if (arg === "--profile") options.profile = argv[++i];
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--no-approve") options.noApprove = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "-v" || arg === "--version") options.version = true;
    else positional.push(arg);
  }

  // Coding agents pipe this command; unattended output must be parseable
  // rather than decorated. Honour NO_COLOR too, which agents commonly set.
  if (!process.stdout.isTTY) options.plain = true;

  return { positional, options };
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;

  if (options.version) return console.log(VERSION);
  if (options.help || !command) return console.log(HELP);

  switch (command) {
    case "find":
    case "search":
      return find(rest.join(" "), options);
    case "info":
    case "show":
      return info(rest[0], options);
    case "add":
    case "install":
      return add(rest, options);
    case "preset":
    case "presets":
      return preset(rest[0], options);
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(c.red(`\n${err.message}\n`));
  process.exit(1);
});
