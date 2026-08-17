#!/usr/bin/env node
/**
 * dshmarketplace — find and install DeepSeek Harness plugins.
 *
 * Zero dependencies on purpose: this runs via `npx` on machines we know
 * nothing about, so every extra package is an extra way to fail before the
 * user has installed anything.
 */
import { spawn } from "node:child_process";
import { styleText } from "node:util";

const VERSION = "0.1.4";

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

async function add(name, options) {
  const data = await api(`/api/v1/plugins?q=${encodeURIComponent(name)}&limit=5`);
  const p = data.results.find((r) => r.fullName === name) ?? data.results[0];

  if (!p) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, command: "add", error: "not_found", query: name })}\n`,
      );
      process.exit(1);
    }
    console.error(`Not found in the catalogue: ${name}`);
    console.error(c.dim("Search first:  npx dshmarketplace-cli find <query>"));
    process.exit(1);
  }

  const option =
    options.source === "github"
      ? (p.installOptions.find((o) => o.label === "GitHub") ?? p.installOptions[0])
      : p.installOptions[0];

  // The catalogue writes every command against the `web` profile, which is
  // what a default DSH install creates. `dsh plugin` is a forward to pnpm
  // inside a profile directory, so the flag is mandatory and the name has to
  // be right — anyone on another profile overrides it here.
  const profile = options.profile ?? "web";
  const cmd = options.profile
    ? option.cmd.replace(/--profile \S+/, `--profile ${options.profile}`)
    : option.cmd;

  // An agent driving this must be able to see what will run, and what the
  // plugin declares, without parsing decorated console output. `resolved.cmd`
  // is the exact string that would be executed, profile override included.
  if (options.json && options.dryRun) {
    return emitJson("add", {
      plugin: p,
      resolved: { ...option, cmd },
      profile,
      executed: false,
      riskFlags: p.riskFlags,
    });
  }

  if (p.fullName !== name) {
    console.log(c.dim(`No exact match for ${name} — using ${p.fullName}`));
  }

  console.log(`\n${c.bold(p.fullName)}`);
  if (p.summary) console.log(c.dim(truncate(p.summary, 100)));

  if (p.riskFlags?.length) {
    console.log(
      `\n${c.copper("⚠")}  This plugin declares: ${p.riskFlags.join(", ")}.`,
    );
    console.log(
      c.dim(`   Listing is not a review. Source: ${p.repoUrl}`),
    );
  }

  console.log(`\n${c.copper("$")} ${cmd}\n`);

  if (options.dryRun) {
    console.log(c.dim("--dry-run: not executing."));
    return;
  }

  const [bin, ...args] = cmd.split(" ");
  const child = spawn(bin, args, { stdio: "inherit", shell: false });

  child.on("error", (err) => {
    if (err.code === "ENOENT") {
      console.error(
        c.red(`\n'${bin}' is not on your PATH.`) +
          c.dim("\nInstall DeepSeek Harness first: npx @deepseek-ai/dsh web\n"),
      );
    } else {
      console.error(c.red(`\n${err.message}\n`));
    }
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code === 0) console.log(c.green(`\n✓ ${p.fullName} installed\n`));
    process.exit(code ?? 0);
  });
}

const HELP = `
${c.bold("dshmarketplace-cli")} ${c.dim(`v${VERSION}`)}  —  DeepSeek Harness plugins

${c.bold("Usage")}
  npx dshmarketplace-cli find <query>        Search the catalogue
  npx dshmarketplace-cli info <owner/repo>   Show one plugin in detail
  npx dshmarketplace-cli add <owner/repo>    Install into DeepSeek Harness

${c.bold("Options")}
  --json             Machine-readable output (stable schema)
  --limit <n>        Results to show (find, default 10)
  --category <id>    Filter by category (find)
  --source github    Force the GitHub source over npm (add)
  --profile <name>   DSH profile to install into (add, default: web)
  --dry-run          Resolve without running the install (add)

${c.bold("Examples")}
  npx dshmarketplace-cli find memory
  npx dshmarketplace-cli find vision --limit 5
  npx dshmarketplace-cli add Anionex/dsh-vision-toolkit

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
      return add(rest[0], options);
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
