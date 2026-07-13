import type { GalaxyGraphDataset } from "@galaxy-graph/core";
import { generateEncoreDataset, type EncoreAdapterOptions } from "./encore.js";
import { generateGrailsDataset, type GrailsAdapterOptions } from "./grails.js";
import type { AdapterContext, GalaxyGraphAdapter } from "./types.js";

export type BuiltInAdapterName = "encore" | "grails";

const ADAPTERS = [
  {
    name: "encore",
    description: "Encore.dev TypeScript services, topics, contracts, tests, and optional Stryker reports",
    generate: ({ rootDir, options }: AdapterContext) =>
      generateEncoreDataset(rootDir, options as EncoreAdapterOptions | undefined),
  },
  {
    name: "grails",
    description: "Grails controllers, services, Spock specs, and web/mobile API consumers",
    generate: ({ rootDir, options }: AdapterContext) =>
      generateGrailsDataset(rootDir, options as GrailsAdapterOptions | undefined),
  },
] satisfies GalaxyGraphAdapter[];

const ADAPTER_BY_NAME = new Map<string, GalaxyGraphAdapter>(
  ADAPTERS.map((adapter) => [adapter.name, adapter])
);

export function listBuiltInAdapters(): GalaxyGraphAdapter[] {
  return [...ADAPTERS];
}

export function getBuiltInAdapter(name: string): GalaxyGraphAdapter | undefined {
  return ADAPTER_BY_NAME.get(name);
}

export async function generateDatasetFromAdapter(
  name: string,
  context: AdapterContext
): Promise<GalaxyGraphDataset> {
  const adapter = getBuiltInAdapter(name);
  if (!adapter) {
    const available = listBuiltInAdapters().map((a) => a.name).join(", ");
    throw new Error(`Unsupported adapter "${name}". Available adapters: ${available}`);
  }
  return adapter.generate(context);
}
