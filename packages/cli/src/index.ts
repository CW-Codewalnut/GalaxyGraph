#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateDatasetFromAdapter, getBuiltInAdapter, listBuiltInAdapters } from "@galaxy-graph/adapters";

type AdapterOptionValue = string | number | boolean;

function usage(): never {
  const adapters = listBuiltInAdapters()
    .map((adapter) => `  ${adapter.name.padEnd(8)} ${adapter.description}`)
    .join("\n");
  console.error(`Usage:
  galaxy-graph generate --adapter <name> --root <repo> --out <graph.json>

Options:
  --adapter-option key=value   Pass an adapter-specific option. Repeatable.

Current adapters:
${adapters}
`);
  process.exit(1);
}

const args = process.argv.slice(2);
const command = args.shift();
if (command !== "generate" || args.includes("--help") || args.includes("-h")) usage();

const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const getAll = (flag: string): string[] => {
  const values: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag && args[i + 1]) {
      values.push(args[i + 1]);
      i += 1;
    } else if (arg.startsWith(`${flag}=`)) {
      values.push(arg.slice(flag.length + 1));
    }
  }
  return values;
};

function parseAdapterOptions(values: string[]): Record<string, AdapterOptionValue> | undefined {
  if (!values.length) return undefined;
  const options: Record<string, AdapterOptionValue> = {};
  for (const raw of values) {
    const equals = raw.indexOf("=");
    if (equals <= 0) {
      console.error(`Invalid --adapter-option "${raw}". Expected key=value.`);
      usage();
    }
    const key = raw.slice(0, equals).trim();
    const value = raw.slice(equals + 1).trim();
    if (!key) {
      console.error(`Invalid --adapter-option "${raw}". Option key is empty.`);
      usage();
    }
    options[key] = parseOptionValue(value);
  }
  return options;
}

function parseOptionValue(value: string): AdapterOptionValue {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

const adapter = get("--adapter") ?? "encore";
const root = resolve(get("--root") ?? process.cwd());
const out = resolve(get("--out") ?? "galaxy-graph.json");

if (!getBuiltInAdapter(adapter)) {
  console.error(`Unsupported adapter: ${adapter}`);
  usage();
}

const dataset = await generateDatasetFromAdapter(adapter, {
  rootDir: root,
  options: parseAdapterOptions(getAll("--adapter-option")),
});
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(dataset, null, 2) + "\n");
console.log(`Wrote ${out}`);
console.log(`${dataset.services.length} services, ${dataset.endpoints.length} endpoints, ${dataset.contracts.length} contracts, ${dataset.tests.length} tests`);
