import { SERVICES, ENDPOINTS, TESTS, CONTRACTS, TOPICS } from "./data";
import { MUTATION } from "./mutation-data";
import { COLORS } from "./helpers";
import type { ContractDef, GalaxyGraphDataset, GraphLink, GraphNode, TestRef, TopicDef } from "./types";

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const TOPIC_COLOR = "#54c1ff";
const DIRECT_BOND_COLOR = "#f8d77a";

export function topicNodeId(topic: string): string {
  return `topic:${topic}`;
}

export function bondNodeId(contractId: string): string {
  return `bond:${contractId}`;
}

export function buildGraph(dataset?: GalaxyGraphDataset): GraphData {
  const services = dataset?.services ?? SERVICES;
  const endpoints = dataset?.endpoints ?? ENDPOINTS;
  const testsInput = dataset?.tests ?? TESTS;
  const contracts = dataset?.contracts ?? CONTRACTS;
  const topicsInput = dataset?.topics ?? TOPICS;
  const mutation = dataset?.mutation ?? MUTATION;
  const serviceColor = (svc: string) => dataset?.colors?.[svc] ?? COLORS[svc];

  // per-endpoint test list and coverage proxy (= test count). Keyed by the
  // namespaced endpoint key `<svc>:<fnName>` so services with overlapping
  // function names (e.g. gamification.getProfile vs identity-core.getProfile)
  // don't collide.
  const epTests: Record<string, TestRef[]> = {};
  endpoints.forEach((ep) => (epTests[ep.id.replace("ep:", "")] = []));
  testsInput.forEach((t) =>
    t.endpoints.forEach((key) => {
      if (epTests[key]) {
        epTests[key].push({ id: t.id, name: t.name, http: !!t.http, svc: t.svc });
      }
    })
  );
  const maxCoverage = Math.max(...Object.values(epTests).map((a) => a.length), 1);

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  services.forEach((s) => {
    nodes.push({
      id: s.id,
      name: s.svc,
      kind: "service",
      svc: s.svc,
      file: s.file,
      val: 60,
      color: serviceColor(s.svc),
      mutation: mutation.services[s.svc],
      ...(s.narrative ? { narrative: s.narrative } : {}),
    });
  });

  endpoints.forEach((ep) => {
    const epKey = ep.id.replace("ep:", "");
    const tests = epTests[epKey];
    nodes.push({
      id: ep.id,
      name: ep.noun,
      fnName: ep.fnName,
      kind: "endpoint",
      svc: ep.svc,
      val: 14,
      color: serviceColor(ep.svc),
      method: ep.method,
      path: ep.path,
      internal: !!ep.internal,
      tests,
      coverage: tests.length,
      coverageRatio: tests.length / maxCoverage,
      mutation: mutation.endpoints[epKey],
      ...(ep.narrative ? { narrative: ep.narrative } : {}),
    });
    links.push({ source: "svc:" + ep.svc, target: ep.id, kind: "contains" });
  });

  testsInput.forEach((t) => {
    nodes.push({
      id: t.id,
      name: t.name,
      kind: "test",
      svc: t.svc,
      http: !!t.http,
      val: 4,
      color: serviceColor(t.svc),
    });
    if (t.endpoints.length) {
      t.endpoints.forEach((epKey) => {
        links.push({ source: t.id, target: "ep:" + epKey, kind: "tests" });
      });
    } else {
      links.push({ source: t.id, target: "svc:" + t.svc, kind: "tests" });
    }
  });

  // Index TopicDef by topic name so each topic node can carry its
  // narrative + file-path metadata (parsed from backend/events/<stem>.ts).
  // Missing entries are fine — the topic card falls back to a synthetic
  // tagline derived from the contracts that share the topic.
  const topicDefs: Record<string, TopicDef> = Object.fromEntries(
    topicsInput.map((t) => [t.topic, t])
  );

  // Cross-service contract bonds — derived from backend/systems/_contracts/*.
  // Direct-call: producer ──depends──▶ consumer (contractId attached for hover).
  // Event-bus  : producer ──publishes──▶ topic ──consumes──▶ consumer.
  // Topics dedupe by id so multiple subscribers fan out from the same node.
  const topicIndex = new Map<string, GraphNode>();
  contracts.forEach((c: ContractDef) => {
    const srcSvc = `svc:${c.producer}`;
    const dstSvc = `svc:${c.consumer}`;

    if (c.mode === "direct-call") {
      // A bond node sits at the midpoint of every direct-call contract so
      // there's a discrete, hoverable marker — the same affordance topic
      // octahedrons give event-bus contracts. Force layout naturally
      // pulls the bond to the rope's centre via the two link segments.
      const bid = bondNodeId(c.id);
      nodes.push({
        id: bid,
        name: `${c.producer} → ${c.consumer}`,
        kind: "bond",
        svc: c.producer,
        val: 18,
        color: DIRECT_BOND_COLOR,
        contract: c,
      });
      links.push({
        source: srcSvc,
        target: bid,
        kind: "depends",
        cross: true,
        contractId: c.id,
        mode: c.mode,
        reason: c.describe,
      });
      links.push({
        source: bid,
        target: dstSvc,
        kind: "depends",
        cross: true,
        contractId: c.id,
        mode: c.mode,
        reason: c.describe,
      });
      return;
    }

    // event-bus: ensure a single topic node per topic name.
    const topic = c.topic!;
    const tid = topicNodeId(topic);
    let topicNode = topicIndex.get(tid);
    if (!topicNode) {
      const tdef = topicDefs[topic];
      topicNode = {
        id: tid,
        name: topic,
        kind: "topic",
        svc: c.producer,
        val: 22,
        color: TOPIC_COLOR,
        topic,
        contracts: [c],
        ...(tdef ? { topicDef: tdef, narrative: tdef.narrative } : {}),
      };
      topicIndex.set(tid, topicNode);
      nodes.push(topicNode);
    } else {
      topicNode.contracts!.push(c);
    }
    links.push({
      source: srcSvc,
      target: tid,
      kind: "publishes",
      cross: true,
      contractId: c.id,
      mode: c.mode,
    });
    links.push({
      source: tid,
      target: dstSvc,
      kind: "consumes",
      cross: true,
      contractId: c.id,
      mode: c.mode,
    });
  });

  // Mark cross-service for the contains/tests links (already explicit above
  // for contract links). Topic-node owners are tagged to the producer's svc;
  // the publishes/consumes links already declare cross: true.
  const nodeSvc = Object.fromEntries(nodes.map((n) => [n.id, n.svc]));
  links.forEach((l) => {
    if (l.cross !== undefined) return;
    l.cross = !!nodeSvc[l.source] && !!nodeSvc[l.target] && nodeSvc[l.source] !== nodeSvc[l.target];
  });

  return { nodes, links };
}
