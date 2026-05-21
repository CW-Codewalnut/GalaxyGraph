#!/usr/bin/env node
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const toolRoot = resolve(scriptDir, "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCli = process.env.npm_execpath && existsSync(process.env.npm_execpath) ? process.env.npm_execpath : undefined;

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  printUsage();
  process.exit(0);
}

const adapter = String(args.adapter ?? process.env.GALAXY_GRAPH_ADAPTER ?? "");
if (!adapter) {
  printUsage();
  fail("Missing required --adapter <name> argument.");
}

const rootArg = args.root ?? process.env.GALAXY_GRAPH_ROOT;
if (!rootArg) {
  printUsage();
  fail("Missing required --root <path> argument.");
}

const sourceRoot = resolve(process.cwd(), String(rootArg));
const outDir = resolve(process.cwd(), String(args["out-dir"] ?? join(sourceRoot, "galaxy-graph")));
const title = String(args.title ?? `${displayName(adapter)} API Galaxy`);
const publicDatasetName = String(args["dataset-name"] ?? "galaxy-graph-dataset.json");
const tempDir = mkdtempSync(join(tmpdir(), "galaxy-graph-data-"));
const datasetPath = join(tempDir, publicDatasetName);

console.log("GalaxyGraph generator");
console.log(`Tool root   : ${toolRoot}`);
console.log(`Adapter     : ${adapter}`);
console.log(`Source root : ${sourceRoot}`);
console.log(`Output dir  : ${outDir}`);
console.log(`Title       : ${title}`);

try {
  if (!existsSync(join(toolRoot, "node_modules")) || args.install) {
    if (args["skip-install"]) {
      fail("node_modules is missing. Run npm ci, or rerun without --skip-install.");
    }
    runNpm(["ci"], toolRoot);
  }

  if (!args["skip-build"]) {
    runNpm(["-w", "@galaxy-graph/core", "run", "build"], toolRoot);
    runNpm(["-w", "@galaxy-graph/adapters", "run", "build"], toolRoot);
    runNpm(["-w", "@galaxy-graph/cli", "run", "build"], toolRoot);
  }

  run(process.execPath, [
    join(toolRoot, "packages", "cli", "dist", "index.js"),
    "generate",
    "--adapter",
    adapter,
    "--root",
    sourceRoot,
    "--out",
    datasetPath,
    ...adapterOptionArgs(args),
  ], toolRoot);

  runNpm([
    "-w",
    "@galaxy-graph/example-generated",
    "run",
    "build",
    "--",
    "--outDir",
    outDir,
    "--emptyOutDir",
  ], toolRoot, { VITE_GALAXY_GRAPH_TITLE: title });

  copyFileSync(datasetPath, join(outDir, publicDatasetName));
  run(process.execPath, [
    join(toolRoot, "scripts", "make-standalone-html.mjs"),
    outDir,
    "--dataset",
    datasetPath,
    "--title",
    title,
  ], toolRoot);

  const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
  console.log("");
  console.log("Galaxy graph generated successfully.");
  console.log(`HTML       : ${join(outDir, "index.html")}`);
  console.log(`Dataset    : ${join(outDir, publicDatasetName)}`);
  console.log(`Services   : ${dataset.services?.length ?? 0}`);
  console.log(`Endpoints  : ${dataset.endpoints?.length ?? 0}`);
  console.log(`Contracts  : ${dataset.contracts?.length ?? 0}`);
  console.log(`Tests      : ${dataset.tests?.length ?? 0}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function parseArgs(raw) {
  const out = { adapterOptions: [] };
  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i];
    if (!arg.startsWith("--")) {
      fail(`Unexpected argument: ${arg}`);
    }
    const withoutPrefix = arg.slice(2);
    const [key, inlineValue] = withoutPrefix.split("=", 2);
    if (["help", "h", "install", "skip-install", "skip-build"].includes(key)) {
      out[key] = true;
      continue;
    }
    const value = inlineValue ?? raw[i + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }
    if (key === "adapter-option") {
      out.adapterOptions.push(value);
    } else {
      out[key] = value;
    }
    if (inlineValue === undefined) i += 1;
  }
  return out;
}

function adapterOptionArgs(parsedArgs) {
  return parsedArgs.adapterOptions.flatMap((value) => ["--adapter-option", value]);
}

function displayName(input) {
  return input
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function run(command, commandArgs, cwd, extraEnv = {}) {
  console.log(`\n> ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32" && command.endsWith(".cmd"),
    env: { ...process.env, ...extraEnv },
  });
  if (result.error) {
    fail(result.error.message);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNpm(commandArgs, cwd, extraEnv = {}) {
  if (npmCli) {
    run(process.execPath, [npmCli, ...commandArgs], cwd, extraEnv);
    return;
  }
  run(npmBin, commandArgs, cwd, extraEnv);
}

function printUsage() {
  console.log(`
Usage:
  npm run generate:graph -- --adapter <name> --root <repo> [--out-dir <output-dir>]

Examples:
  npm run generate:graph -- --adapter grails --root C:\\code\\my-grails-app
  npm run generate:graph -- --adapter encore --root C:\\code\\my-encore-app --out-dir C:\\code\\my-encore-app\\galaxy-graph
  npm run generate:grails -- --root /repo --title "Billing API Galaxy"

Adapter options:
  --adapter-option controllersDir=server/grails-app/controllers
  --adapter-option servicesDir=server/grails-app/services
  --adapter-option packageDomainRoot=com.example.apps

Options:
  --adapter <name>         Adapter name, for example grails or encore.
  --root <path>            Source repo root or framework app root.
  --out-dir <path>         Output folder. Defaults to <root>/galaxy-graph.
  --title <text>           Graph title shown in the visual viewer.
  --dataset-name <name>    Dataset filename copied beside index.html.
  --install                Force npm ci before generation.
  --skip-install           Do not run npm ci automatically if node_modules is missing.
  --skip-build             Skip rebuilding core/adapters/cli before generation.
  --help                   Show this help.
`);
}

function fail(message) {
  console.error(`\nError: ${message}`);
  process.exit(1);
}
