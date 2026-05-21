import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import ForceGraph3D from "3d-force-graph";
import Header from "./Header";
import Legend, { type Filters } from "./Legend";
import InfoCard, { type Selection } from "./InfoCard";
import { buildGraph } from "./buildGraph";
import { makeBuildNodeMesh, type BondMeshRef } from "./buildNodeMesh";
import { nodeTooltip } from "./nodeTooltip";
import { contractLinkTooltip } from "./linkTooltip";
import { CATEGORY_META, COLORS, displayName, linkColor, type ServiceCategory } from "./helpers";
import { CONTRACTS, setGalaxyGraphCatalog } from "./data";
import { setGalaxyGraphMutation } from "./mutation-data";
import type { ContractDef, GalaxyGraphDataset, GraphLink, GraphNode } from "./types";

type LinkEnd = string | { id: string };
const linkId = (e: LinkEnd) => (typeof e === "object" ? e.id : e);

// 3d-force-graph's typed surface doesn't expose all chain methods we use.
// Keep the instance as `any` for fluent calls; type at the I/O boundaries.
type ForceGraphInstance = any;

export interface GalaxyGraphProps {
  /** Normalized backend graph payload. If omitted, a small built-in demo dataset is rendered. */
  dataset?: GalaxyGraphDataset;
  /** Heading shown in the summary panel. */
  title?: string;
  className?: string;
}

export default function GalaxyGraph({ dataset, className, title = "Galaxy Graph - System Coverage" }: GalaxyGraphProps) {
  if (dataset) {
    setGalaxyGraphCatalog(dataset);
    setGalaxyGraphMutation(dataset.mutation);
  }
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphInstance | null>(null);
  const ringMeshesRef = useRef<THREE.Mesh[]>([]);
  const bondMeshesRef = useRef<BondMeshRef[]>([]);
  const focusNodeRef = useRef<((n: GraphNode) => void) | null>(null);
  const focusContractRef = useRef<((c: ContractDef) => void) | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [filters, setFilters] = useState<Filters>({
    showSvc: true,
    showEp: true,
    showTest: true,
    showHttp: true,
    showCross: true,
  });

  const data = useMemo(() => buildGraph(dataset), [dataset]);
  const contractsById = useMemo(
    () => new Map((dataset?.contracts ?? CONTRACTS).map((c) => [c.id, c])),
    [dataset]
  );
  const nodeSvc = useMemo(
    () => Object.fromEntries(data.nodes.map((n) => [n.id, n.svc])),
    [data.nodes]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const buildNodeMesh = makeBuildNodeMesh({
      ringMeshes: ringMeshesRef.current,
      bondMeshes: bondMeshesRef.current,
    });
    const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
    const tmpV = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const tmpQ = new THREE.Quaternion();

    const Graph = (ForceGraph3D as unknown as () => (el: HTMLElement) => any)()(
      containerRef.current
    );

    Graph
      .backgroundColor("#05060a")
      .graphData(data)
      .nodeThreeObject((n: GraphNode) => buildNodeMesh(n))
      .nodeLabel((n: GraphNode) => nodeTooltip(n))
      .linkColor((l: GraphLink) =>
        linkColor(l, COLORS[nodeSvc[linkId(l.source as LinkEnd)]])
      )
      // Contract bonds render as thick "ropes" so they're easy to spot and
      // click — the fatter cylinder grows the raycast hit area too. Other
      // link kinds keep their thin styling so the graph doesn't visually
      // collapse into a yarn ball.
      .linkWidth((l: GraphLink) => {
        if (l.kind === "depends") return 6;
        if (l.kind === "publishes" || l.kind === "consumes") return 5;
        if (l.kind === "contains") return 1.6;
        return 0.4;
      })
      .linkOpacity(0.85)
      .linkDirectionalParticles((l: GraphLink) => {
        if (l.kind === "depends") return 6;
        if (l.kind === "publishes" || l.kind === "consumes") return 7;
        return l.cross ? 2 : 0;
      })
      .linkDirectionalParticleSpeed((l: GraphLink) =>
        l.kind === "publishes" || l.kind === "consumes" ? 0.008 : 0.005
      )
      .linkDirectionalParticleWidth((l: GraphLink) => {
        if (l.kind === "depends") return 2.6;
        if (l.kind === "publishes" || l.kind === "consumes") return 2.2;
        return 1.4;
      })
      .linkLabel((l: GraphLink) => {
        if (!l.contractId) return "";
        const c = contractsById.get(l.contractId);
        return c ? contractLinkTooltip(c) : "";
      })
      .onLinkClick((l: GraphLink) => {
        if (!l.contractId) return;
        const c = contractsById.get(l.contractId);
        if (!c) return;
        setSelection({ kind: "contract", contract: c });
        focusContract(c);
      })
      .onEngineTick(() => {
        for (const r of ringMeshesRef.current) {
          r.rotation.z += (r.userData as { spin: number }).spin;
        }
        // Align each bond cylinder's long (Y) axis with the
        // producer→consumer rope so it reads as a thick segment of
        // the line, not a fixed-orientation barrel.
        for (const b of bondMeshesRef.current) {
          const p = nodeById.get(b.producerId);
          const c = nodeById.get(b.consumerId);
          if (!p || !c) continue;
          tmpV.set((c.x ?? 0) - (p.x ?? 0), (c.y ?? 0) - (p.y ?? 0), (c.z ?? 0) - (p.z ?? 0));
          if (tmpV.lengthSq() < 1e-6) continue;
          tmpV.normalize();
          tmpQ.setFromUnitVectors(yAxis, tmpV);
          b.group.quaternion.copy(tmpQ);
        }
      })
      .onBackgroundClick(() => setSelection(null))
      .onNodeClick((n: GraphNode) => {
        // Bond nodes are markers FOR contracts — clicking one should
        // open the same ContractCard + banner you'd get from clicking
        // the rope itself. Anything else focuses as a regular node.
        if (n.kind === "bond" && n.contract) {
          setSelection({ kind: "contract", contract: n.contract });
          focusContract(n.contract);
          return;
        }
        focusNode(n);
      });

    function focusNode(n: GraphNode) {
      setSelection({ kind: "node", node: n });
      const distance = 100;
      const r = Math.hypot(n.x ?? 0, n.y ?? 0, n.z ?? 0) || 1;
      const ratio = 1 + distance / r;
      Graph.cameraPosition(
        { x: (n.x ?? 0) * ratio, y: (n.y ?? 0) * ratio, z: (n.z ?? 0) * ratio },
        n,
        800
      );
    }
    focusNodeRef.current = focusNode;

    // Camera focus for contract bonds. Anchors at the midpoint of the
    // producer/consumer service nodes — for event-bus contracts that point
    // crosses the topic node, which keeps the bond, both endpoints, and the
    // topic in frame at once.
    function focusContract(c: ContractDef) {
      const producer = data.nodes.find((n) => n.id === `svc:${c.producer}`);
      const consumer = data.nodes.find((n) => n.id === `svc:${c.consumer}`);
      if (!producer || !consumer) return;
      const mx = ((producer.x ?? 0) + (consumer.x ?? 0)) / 2;
      const my = ((producer.y ?? 0) + (consumer.y ?? 0)) / 2;
      const mz = ((producer.z ?? 0) + (consumer.z ?? 0)) / 2;
      const distance = 200;
      const r = Math.hypot(mx, my, mz) || 1;
      const ratio = 1 + distance / r;
      Graph.cameraPosition(
        { x: mx * ratio, y: my * ratio, z: mz * ratio },
        { x: mx, y: my, z: mz },
        800
      );
    }
    focusContractRef.current = focusContract;

    Graph.d3Force("charge").strength(-450);
    Graph.d3Force("link")
      .distance((l: GraphLink) => {
        if (l.kind === "depends") return 240;
        if (l.kind === "publishes" || l.kind === "consumes") return 150;
        if (l.kind === "contains") return 28;
        return 18;
      })
      .strength((l: GraphLink) => {
        if (l.kind === "contains") return 1.0;
        if (l.kind === "tests") return 0.5;
        if (l.kind === "publishes" || l.kind === "consumes") return 0.4;
        return 0.25;
      });

    Graph.cameraPosition({ z: 560 });
    graphRef.current = Graph;

    const el = containerRef.current;
    const sizeToContainer = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      Graph.width(w).height(h);
    };
    sizeToContainer();
    const ro = new ResizeObserver(sizeToContainer);
    ro.observe(el);
    window.addEventListener("resize", sizeToContainer);

    return () => {
      window.removeEventListener("resize", sizeToContainer);
      ro.disconnect();
      Graph._destructor?.();
      graphRef.current = null;
      ringMeshesRef.current = [];
      bondMeshesRef.current = [];
    };
  }, [contractsById, data]);

  useEffect(() => {
    const Graph = graphRef.current as any;
    if (!Graph) return;

    const visible = new Set(
      data.nodes
        .filter((n) => {
          if (n.kind === "service" && !filters.showSvc) return false;
          if (n.kind === "endpoint" && !filters.showEp) return false;
          if (n.kind === "test" && !filters.showTest) return false;
          if (n.kind === "test" && n.http && !filters.showHttp) return false;
          // topic + bond nodes always visible — they are first-class contract markers.
          return true;
        })
        .map((n) => n.id)
    );

    const fnodes = data.nodes.filter((n) => visible.has(n.id));
    const flinks = data.links.filter((l) => {
      const s = linkId(l.source as LinkEnd);
      const t = linkId(l.target as LinkEnd);
      if (!visible.has(s) || !visible.has(t)) return false;
      if (l.cross && !filters.showCross) return false;
      return true;
    });
    Graph.graphData({ nodes: fnodes, links: flinks });
  }, [filters, data]);

  const onSelectService = useCallback((svc: string) => {
    const id = `svc:${svc}`;
    const node = data.nodes.find((n) => n.id === id);
    if (!node) return;
    focusNodeRef.current?.(node);
  }, [data.nodes]);

  const onSelectContract = useCallback((contract: ContractDef) => {
    setSelection({ kind: "contract", contract });
    focusContractRef.current?.(contract);
  }, []);

  return (
    <>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <Header title={title} onSelectService={onSelectService} onSelectContract={onSelectContract} />
      <Legend filters={filters} onChange={setFilters} compact={selection !== null} />
      {selection === null && <CategoryLegend />}
      <InfoCard selection={selection} />
      {selection?.kind === "contract" && <ContractBanner contract={selection.contract} />}
    </>
  );
}

function CategoryLegend() {
  const order: ServiceCategory[] = ["core", "feature", "adapter"];
  return (
    <div
      className="panel"
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "6px 14px",
        fontSize: 12,
        letterSpacing: 0.2,
      }}
      data-testid="category-legend"
    >
      {order.map((key) => {
        const meta = CATEGORY_META[key];
        return (
          <span key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: meta.color,
                boxShadow: `0 0 6px ${meta.color}aa`,
              }}
            />
            <span style={{ color: meta.color }}>{meta.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function ContractBanner({ contract: c }: { contract: ContractDef }) {
  const producerColor = COLORS[c.producer] ?? "#7a8095";
  const consumerColor = COLORS[c.consumer] ?? "#7a8095";
  const accent = c.mode === "event-bus" ? "#54c1ff" : "#f8d77a";
  return (
    <div
      className="panel"
      style={{
        position: "absolute",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 16px",
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: 0.2,
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderColor: accent + "55",
      }}
      data-testid="contract-banner"
    >
      <span style={{ color: producerColor }}>{displayName(c.producer)}</span>
      <span style={{ color: accent }}>⇒</span>
      <span style={{ color: consumerColor }}>{displayName(c.consumer)}</span>
      {c.mode === "event-bus" && c.topic && (
        <span
          style={{
            marginLeft: 6,
            fontSize: 11,
            fontWeight: 500,
            color: accent,
            background: accent + "1a",
            border: `1px solid ${accent}55`,
            borderRadius: 4,
            padding: "1px 6px",
          }}
        >
          {c.topic}
        </span>
      )}
    </div>
  );
}
