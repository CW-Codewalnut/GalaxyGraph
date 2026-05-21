# Adapter Architecture

Adapters convert a backend into Galaxy Graph's normalized schema. The renderer and graph-building code are language-independent; language and framework knowledge belongs in adapters.

A mature adapter should discover:

1. service/module boundaries;
2. endpoints/capabilities;
3. tests and what they cover;
4. cross-service contracts;
5. event topics/queues/messages;
6. mutation/confidence report data;
7. JSDoc/TSDoc semantic intent.

Initial adapters:

- `encore`: scans Encore.dev TypeScript services.
- `grails`: scans Grails controllers, services, URL mappings, Spock tests, and client API calls.
- `stryker`: reads Stryker JSON reports and converts mutation scores.
- `jsdoc`: extracts `@summary`, `@why`, `@flow`, `@story`, `@category`.

Adding a framework adapter:

1. emit `GalaxyGraphDataset` from the framework's services, endpoints, tests, contracts, topics, and confidence signals;
2. keep framework-specific parsing inside the adapter package;
3. expose configurable path/layout options instead of project-specific constants;
4. add it to `packages/adapters/src/registry.ts` so the CLI can discover it without branching;
5. add fixture tests that cover the framework's normal project layouts.

Planned adapters:

- Express/Fastify/NestJS route scanners.
- OpenAPI and GraphQL schema importers.
- Python FastAPI/Django scanners.
- AI doc-generation pass that proposes missing semantic tags.


## Contract and test extraction

The Encore adapter also scans `backend/systems/_contracts/*.ts` for small contract descriptor objects with fields such as `id`, `producer`, `consumer`, `mode`, `topic`, `producerFns`, and `consumerFns`. Contract test files can include semantic JSDoc tags (`@story`, `@category`) and an `endpoints: ["svc:fn"]` metadata object so the graph can connect tests back to endpoint nodes.

## Mutation mapping

Stryker reports are aggregated into service-level mutation stats and, when the Encore adapter can associate a report file with endpoint declarations, endpoint-level stats. The current MVP is file-based; line/function-range mapping is a roadmap item.
