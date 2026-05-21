import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const [, , distDirArg, ...rawArgs] = process.argv;

if (!distDirArg) {
  console.error("Usage: node scripts/inline-vite-assets-for-standalone-html.mjs <dist-dir> [--dataset <graph.json>] [--title <title>]");
  process.exit(1);
}

const args = parseArgs(rawArgs);
const distDir = distDirArg;
const indexPath = join(distDir, "index.html");
let html = readFileSync(indexPath, "utf8");

const scriptMatch = html.match(/<script\s+type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/);
const cssMatch = html.match(/<link\s+rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/);

if (!scriptMatch) {
  throw new Error(`Could not find Vite module script in ${indexPath}`);
}

const jsPath = join(distDir, scriptMatch[1]);
const cssPath = cssMatch ? join(distDir, cssMatch[1]) : undefined;
const js = readFileSync(jsPath, "utf8").replaceAll("</script", "<\\/script");
const css = cssPath ? readFileSync(cssPath, "utf8").replaceAll("</style", "<\\/style") : "";
const bootstrap = buildBootstrapScript(args);
const inlineScript = `<script>\n${js}\n</script>`;

if (args.title) {
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(args.title)}</title>`);
}

const standalone = html
  .replace(cssMatch?.[0] ?? "", () => (css ? `<style>\n${css}\n</style>` : ""))
  .replace(scriptMatch[0], "")
  .replace(/\s*<link rel="modulepreload"[^>]*>/g, "")
  .replace("</body>", () => `    ${bootstrap}${inlineScript}\n  </body>`);

writeFileSync(indexPath, standalone, "utf8");
console.log(`Wrote standalone ${indexPath}`);
console.log(`Inlined ${basename(jsPath)}${cssPath ? ` and ${basename(cssPath)}` : ""}`);

function parseArgs(raw) {
  const out = {};
  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? raw[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    out[key] = value;
    if (inlineValue === undefined) i += 1;
  }
  return out;
}

function buildBootstrapScript(args) {
  const lines = [];
  if (args.title) {
    lines.push(`window.__GALAXY_GRAPH_TITLE__ = ${JSON.stringify(args.title)};`);
  }
  if (args.dataset) {
    const dataset = readFileSync(args.dataset, "utf8");
    lines.push(`window.__GALAXY_GRAPH_DATASET__ = ${dataset.replaceAll("</script", "<\\/script")};`);
  }
  return lines.length ? `<script>\n${lines.join("\n")}\n</script>\n    ` : "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  );
}
