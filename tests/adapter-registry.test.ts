import { describe, expect, it } from "vitest";
import { getBuiltInAdapter, listBuiltInAdapters } from "../packages/adapters/src/registry";

describe("adapter registry", () => {
  it("exposes built-in framework adapters through one lookup surface", () => {
    expect(listBuiltInAdapters().map((adapter) => adapter.name)).toEqual(["encore", "grails"]);
    expect(getBuiltInAdapter("encore")?.description).toContain("Encore");
    expect(getBuiltInAdapter("grails")?.description).toContain("Grails");
    expect(getBuiltInAdapter("missing")).toBeUndefined();
  });
});
