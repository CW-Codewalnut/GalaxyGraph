import { describe, expect, it } from "vitest";
import { buildGraph } from "../packages/core/src/buildGraph";
import type { GalaxyGraphDataset } from "../packages/core/src/types";

const dataset: GalaxyGraphDataset = {
  services: [{ id: "svc:api", svc: "api", file: "api.ts" }],
  endpoints: [{ id: "ep:api:listUsers", svc: "api", fnName: "listUsers", noun: "List Users", method: "GET", path: "/users" }],
  tests: [{ id: "test:listUsers", svc: "api", name: "lists users", endpoints: ["api:listUsers"], http: true }],
  contracts: [],
  topics: [],
  mutation: { aggregate: { killed: 1, survived: 0, total: 1, score: 100 }, services: { api: { killed: 1, survived: 0, total: 1, score: 100 } }, endpoints: { "api:listUsers": { svc: "api", fnName: "listUsers", killed: 1, survived: 0, total: 1, score: 100 } } },
  colors: { api: "#123456" },
};

describe("buildGraph", () => {
  it("turns a normalized dataset into service, endpoint, and test nodes", () => {
    const graph = buildGraph(dataset);
    expect(graph.nodes.map((n) => n.id)).toContain("svc:api");
    expect(graph.nodes.map((n) => n.id)).toContain("ep:api:listUsers");
    expect(graph.nodes.map((n) => n.id)).toContain("test:listUsers");
    expect(graph.links).toContainEqual(expect.objectContaining({ source: "svc:api", target: "ep:api:listUsers", kind: "contains" }));
    expect(graph.nodes.find((n) => n.id === "ep:api:listUsers")?.mutation?.score).toBe(100);
    expect(graph.nodes.find((n) => n.id === "svc:api")?.color).toBe("#123456");
  });
});
