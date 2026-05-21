import React from "react";
import { createRoot } from "react-dom/client";
import { GalaxyGraph, type GalaxyGraphDataset } from "@galaxy-graph/core";
import "@galaxy-graph/core/style.css";
import sampleDataset from "./generated/galaxy-graph-dataset.json";

const env = (import.meta as unknown as { env?: { VITE_GALAXY_GRAPH_TITLE?: string } }).env;
const runtime = window as Window & {
  __GALAXY_GRAPH_DATASET__?: GalaxyGraphDataset;
  __GALAXY_GRAPH_TITLE__?: string;
};
const dataset = runtime.__GALAXY_GRAPH_DATASET__ ?? (sampleDataset as GalaxyGraphDataset);
const title = runtime.__GALAXY_GRAPH_TITLE__ ?? env?.VITE_GALAXY_GRAPH_TITLE ?? "Galaxy Graph";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GalaxyGraph dataset={dataset} title={title} />
  </React.StrictMode>
);
