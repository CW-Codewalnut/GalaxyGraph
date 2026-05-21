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
const viewerDataset = fileURLToPath(new URL("../examples/standalone-viewer/src/generated/galaxy-graph-dataset.json", import.meta.url));

describe("generate standalone galaxy graph script", () => {
  it("builds standalone HTML from a registered adapter without leaving generated data in the viewer fixture", async () => {
    const dir = await mkdtemp(join(tmpdir(), "galaxy-graph-visual-"));
    const before = await readFile(viewerDataset, "utf8");

    try {
      await execFileAsync(
        process.execPath,
        [
          "scripts/generate-standalone-galaxy-graph.mjs",
          "--adapter",
          "encore",
          "--root",
          fixture,
          "--out-dir",
          dir,
          "--title",
          "Smoke Galaxy",
          "--skip-build",
          "--skip-install",
        ],
        { cwd: repoRoot, timeout: 120_000 }
      );

      const html = await readFile(join(dir, "index.html"), "utf8");
      const data = JSON.parse(await readFile(join(dir, "galaxy-graph-dataset.json"), "utf8"));
      const after = await readFile(viewerDataset, "utf8");

      expect(html).toContain("Smoke Galaxy");
      expect(html).toContain("<script>");
      expect(html).not.toContain('type="module"');
      expect(data.services).toHaveLength(3);
      expect(data.endpoints).toHaveLength(3);
      expect(data.contracts).toHaveLength(1);
      expect(after).toBe(before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
