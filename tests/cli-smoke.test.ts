import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const fixture = fileURLToPath(new URL("./fixtures/encore-mini", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("galaxy-graph CLI", () => {
  it("generates graph JSON from a sanitized Encore fixture", async () => {
    const dir = await mkdtemp(join(tmpdir(), "galaxy-graph-cli-"));
    try {
      const out = join(dir, "nested", "graph.json");
      await execFileAsync(process.execPath, ["packages/cli/dist/index.js", "generate", "--adapter", "encore", "--root", fixture, "--out", out], { cwd: repoRoot });
      const data = JSON.parse(await readFile(out, "utf8"));
      expect(data.services).toHaveLength(3);
      expect(data.endpoints).toHaveLength(3);
      expect(data.contracts).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
