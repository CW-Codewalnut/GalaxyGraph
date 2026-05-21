import type { GalaxyGraphDataset, NodeNarrative } from "@galaxy-graph/core";

export interface AdapterContext {
  /** Absolute or cwd-relative backend repository root. */
  rootDir: string;
  /** Adapter-specific options. Prefer serializable values for CLI use. */
  options?: unknown;
}

export interface GalaxyGraphAdapter {
  name: string;
  description: string;
  generate(context: AdapterContext): Promise<GalaxyGraphDataset>;
}

export interface SemanticDocTags extends NodeNarrative {
  story?: string;
  category?: string;
}

export interface AnnotationWarning {
  file: string;
  message: string;
}
