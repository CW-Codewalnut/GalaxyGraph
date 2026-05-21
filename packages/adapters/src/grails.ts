import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import type {
  ContractDef,
  ContractTest,
  EndpointDef,
  GalaxyGraphDataset,
  MutationData,
  NodeNarrative,
  ServiceDef,
  ServiceKey,
  TestDef,
} from "@galaxy-graph/core";

export interface GrailsAdapterOptions {
  controllersDir?: string;
  servicesDir?: string;
  /** Legacy convenience aliases for the default web/mobile client roots. */
  webClientDir?: string;
  mobileClientDir?: string;
  /** Additional or replacement client source roots that call the Grails API. */
  clientRoots?: GrailsClientRoot[];
  /** Test roots. Defaults to common Grails unit/integration test locations. */
  testDirs?: string[];
  /** One UrlMappings.groovy file. Prefer urlMappingsFiles when several exist. */
  urlMappingsFile?: string;
  /** UrlMappings.groovy files. Relative paths resolve from rootDir. */
  urlMappingsFiles?: string[];
  /** Package prefix whose first child segment should be treated as the domain. */
  packageDomainRoot?: string;
  /** URL prefixes to remove before deriving controller/action names from client calls. */
  apiPathPrefixes?: string[];
  /** Public-looking controller methods that should not be graph endpoints. */
  helperActions?: string[];
  /** Class suffixes to include as backend service nodes. */
  serviceClassSuffixes?: string[];
  /** Additional external dependency fingerprints. Defaults are included unless disabled. */
  externalIntegrations?: ExternalIntegrationRule[];
  includeDefaultExternalIntegrations?: boolean;
  /** Directory names ignored while walking source roots. */
  ignoreDirs?: string[];
}

export interface GrailsClientRoot {
  dir: string;
  svc?: ServiceKey;
}

export interface ExternalIntegrationRule {
  svc: ServiceKey;
  label: string;
  patterns: RegExp[];
}

export interface ClientApiCall {
  clientSvc: ServiceKey;
  method: string;
  rawPath: string;
  path: string;
  controller: string;
  action: string;
  file: string;
}

interface MethodInfo {
  name: string;
  modifiers: string;
  body: string;
}

interface ClassInfo {
  className: string;
  logicalName: string;
  svc: ServiceKey;
  file: string;
  absFile: string;
  source: string;
  packageName: string;
  domain: string;
  kind: "controller" | "service" | "client" | "external";
  methods: MethodInfo[];
  allowedMethods: Record<string, string>;
  securedRoles: string[];
}

interface DependencyCall {
  producer: ServiceKey;
  consumer: ServiceKey;
  producerFile: string;
  consumerFile: string;
  fieldName: string;
  producerFns: Set<string>;
  consumerFns: Set<string>;
}

interface TestMethodInfo {
  name: string;
  body: string;
}

interface GrailsPaths {
  controllersDir: string;
  servicesDir: string;
  clientRoots: Array<Required<GrailsClientRoot>>;
  testDirs: string[];
  urlMappingsFiles: string[];
}

const CRUD_ACTIONS = new Set(["index", "show", "create", "save", "edit", "update", "delete", "list", "view"]);
const DEFAULT_HELPER_ACTIONS = [
  "getAuthenticatedUser",
  "isLoggedIn",
  "getJsonMapFromRequest",
  "trimJson",
  "renderJsonFailure",
  "parseLongValue",
  "getRequestValue",
  "readJsonRequestMapOrRender",
  "findTenantServiceTicketOrRender",
  "findTenantCustomerOrRender",
  "enforceQuoteContactTenantAccess",
  "enforceAmcProposalMachineTenantAccess",
  "enforceAmcProposalSalesPersonTenantAccess",
  "enforceAmcProposalRecipientAccess",
  "getCustomerAllowedEmails",
  "findAmcProposalOrRender",
  "enforceStoredAmcProposalMachineTenantAccess",
  "getStatesStringForSql",
  "uploadLeadImagesToServer",
  "uploadFile",
];

const DEFAULT_API_PATH_PREFIXES = ["api"] as const;
const DEFAULT_SERVICE_CLASS_SUFFIXES = ["Service", "Utils", "Util", "Policy"] as const;
const DEFAULT_IGNORED_DIRS = ["node_modules", "dist", "build", ".git", ".gradle", "target", "out"] as const;

const DOMAIN_COLORS: Record<string, string> = {
  client: "#38bdf8",
  common: "#a78bfa",
  service: "#22d3ee",
  sales: "#fb923c",
  security: "#f472b6",
  admin: "#f43f5e",
  forms: "#84cc16",
  web: "#60a5fa",
  external: "#f59e0b",
  default: "#94a3b8",
};

export const DEFAULT_EXTERNAL_INTEGRATIONS: ExternalIntegrationRule[] = [
  {
    svc: "google-translate",
    label: "Google Translate",
    patterns: [/translation\.googleapis\.com/i, /GOOGLE_TRANSLATE/i],
  },
  {
    svc: "google-maps",
    label: "Google Maps / Geocoding",
    patterns: [/maps\.googleapis\.com/i, /google\.com\/maps/i, /opencagedata\.com/i, /fetchDistanceFromGoogle/i],
  },
  {
    svc: "google-cloud-storage",
    label: "Google Cloud Storage",
    patterns: [/com\.google\.cloud\.storage/i, /\bBlob\b/, /StorageOptions/i],
  },
  {
    svc: "email-service",
    label: "Email Delivery",
    patterns: [/\bsendMail\s*\{/i],
  },
  {
    svc: "whatsapp",
    label: "WhatsApp",
    patterns: [/wa\.me/i, /web\.whatsapp\.com/i, /whatsapp/i],
  },
  {
    svc: "qr-code-service",
    label: "QR Code Service",
    patterns: [/api\.qrserver\.com/i],
  },
  {
    svc: "oauth-provider",
    label: "OAuth Provider",
    patterns: [/oauth\/access_token/i, /api\/login/i],
  },
];

function rel(rootDir: string, file: string): string {
  return relative(rootDir, file).replace(/\\/g, "/");
}

function fromBase(base: string, path: string): string {
  return isAbsolute(path) ? path : join(base, path);
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueExistingFiles(paths: string[]): string[] {
  return uniquePaths(paths).filter((path) => existsSync(path));
}

function resolveGrailsPaths(rootDir: string, opts: GrailsAdapterOptions = {}): GrailsPaths {
  const isGrailsAppRoot = existsSync(join(rootDir, "controllers")) || existsSync(join(rootDir, "services"));
  const isServerRoot = existsSync(join(rootDir, "grails-app/controllers")) || existsSync(join(rootDir, "grails-app/services"));
  const grailsAppDir = isGrailsAppRoot ? rootDir : isServerRoot ? join(rootDir, "grails-app") : join(rootDir, "server/grails-app");
  const serverDir = isGrailsAppRoot ? dirname(rootDir) : isServerRoot ? rootDir : join(rootDir, "server");
  const projectRoot = isGrailsAppRoot ? dirname(serverDir) : isServerRoot ? dirname(rootDir) : rootDir;
  const defaultClientRoots: Array<Required<GrailsClientRoot>> = [
    { dir: opts.webClientDir ? fromBase(rootDir, opts.webClientDir) : join(projectRoot, "web/src"), svc: "web-client" },
    { dir: opts.mobileClientDir ? fromBase(rootDir, opts.mobileClientDir) : join(projectRoot, "mobile/src"), svc: "mobile-client" },
  ];
  const clientRoots = opts.clientRoots?.length
    ? opts.clientRoots.map((root, idx) => ({
        dir: fromBase(rootDir, root.dir),
        svc: root.svc ?? `client-${idx + 1}`,
      }))
    : defaultClientRoots;
  const configuredUrlMappings = opts.urlMappingsFiles?.length
    ? opts.urlMappingsFiles.map((file) => fromBase(rootDir, file))
    : opts.urlMappingsFile
      ? [fromBase(rootDir, opts.urlMappingsFile)]
      : [];
  const discoveredUrlMappings = [
    join(grailsAppDir, "controllers", "UrlMappings.groovy"),
    join(grailsAppDir, "conf", "UrlMappings.groovy"),
    ...walk(grailsAppDir, [".groovy"], [], opts).filter((file) => basename(file) === "UrlMappings.groovy"),
  ];

  return {
    controllersDir: opts.controllersDir ? fromBase(rootDir, opts.controllersDir) : join(grailsAppDir, "controllers"),
    servicesDir: opts.servicesDir ? fromBase(rootDir, opts.servicesDir) : join(grailsAppDir, "services"),
    clientRoots: uniqueClientRoots(clientRoots),
    testDirs: opts.testDirs?.length
      ? uniquePaths(opts.testDirs.map((dir) => fromBase(rootDir, dir)))
      : uniquePaths([
          join(serverDir, "src/test"),
          join(serverDir, "src/integration-test"),
          join(projectRoot, "server/src/test"),
          join(projectRoot, "server/src/integration-test"),
        ]),
    urlMappingsFiles: uniqueExistingFiles([...configuredUrlMappings, ...discoveredUrlMappings]),
  };
}

function uniqueClientRoots(roots: Array<Required<GrailsClientRoot>>): Array<Required<GrailsClientRoot>> {
  const seen = new Set<string>();
  return roots.filter((root) => {
    const key = `${root.svc}|${root.dir.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function walk(dir: string, exts: string[], out: string[] = [], opts: GrailsAdapterOptions = {}): string[] {
  if (!existsSync(dir)) return out;
  const ignored = new Set([...(opts.ignoreDirs ?? []), ...DEFAULT_IGNORED_DIRS]);
  for (const entry of readdirSync(dir).sort()) {
    if (entry.startsWith(".") || ignored.has(entry)) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, exts, out, opts);
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(p);
    }
  }
  return out;
}

function kebab(input: string): string {
  return input
    .replace(/Controller$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s.]+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "unknown";
}

function lowerFirst(input: string): string {
  return input ? input[0].toLowerCase() + input.slice(1) : input;
}

function title(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parsePackage(source: string): string {
  return source.match(/^\s*package\s+([\w.]+)/m)?.[1] ?? "";
}

function packageDomain(packageName: string, opts: GrailsAdapterOptions = {}): string {
  const parts = packageName.split(".").filter(Boolean);
  const configuredRoot = opts.packageDomainRoot?.split(".").filter(Boolean) ?? [];
  if (configuredRoot.length && startsWithSegments(parts, configuredRoot)) {
    return parts[configuredRoot.length] ?? "default";
  }
  for (const marker of ["apps", "app", "modules", "module", "features", "feature", "domains", "domain"]) {
    const idx = parts.indexOf(marker);
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  }
  const domainParts = parts.filter((part) => !["controllers", "services", "controller", "service"].includes(part));
  const leaf = domainParts[domainParts.length - 1];
  return leaf ?? "default";
}

function startsWithSegments(parts: string[], prefix: string[]): boolean {
  return prefix.every((part, idx) => parts[idx] === part);
}

function parseClassName(source: string): string | undefined {
  return source.match(/\bclass\s+([A-Z]\w*)/)?.[1];
}

function parseSecuredRoles(source: string): string[] {
  const match = source.match(/@Secured\s*\(\s*\[([\s\S]*?)\]\s*\)/);
  if (!match) return [];
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function findMethods(source: string): MethodInfo[] {
  const re =
    /^(\s*(?:@[^\n]+\n\s*)*)(\s*(?:(?:public|private|protected|static|final|synchronized)\s+)*)((?:def|void|String|Integer|Long|Boolean|BigDecimal|Map(?:<[^>]+>)?|List(?:<[^>]+>)?|Set(?:<[^>]+>)?|[A-Z]\w+(?:<[^>]+>)?)\s+)([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/gm;
  const matches = [...source.matchAll(re)];
  return matches.map((match, idx) => {
    const start = match.index ?? 0;
    const end = matches[idx + 1]?.index ?? source.length;
    return {
      name: match[4],
      modifiers: match[2] ?? "",
      body: source.slice(start, end),
    };
  });
}

function parseAllowedMethods(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  const match = source.match(/static\s+allowedMethods\s*=\s*\[([\s\S]*?)\]/m);
  if (!match) return out;
  for (const item of match[1].matchAll(/([A-Za-z_]\w*)\s*:\s*['"]([^'"]+)['"]/g)) {
    out[item[1]] = item[2].toUpperCase();
  }
  return out;
}

function mappingStringProp(source: string, key: string): string | undefined {
  return source.match(new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`))?.[1];
}

function parseExplicitUrlMappings(rootDir: string, opts: GrailsAdapterOptions = {}): Map<string, { path: string; method?: string }> {
  const map = new Map<string, { path: string; method?: string }>();
  const mappingsFiles = resolveGrailsPaths(rootDir, opts).urlMappingsFiles;
  for (const mappingsFile of mappingsFiles) {
    const source = readFileSync(mappingsFile, "utf8");
    const re = /(['"])([^'"]+)\1\s*\(([\s\S]*?)\)/g;
    for (const match of source.matchAll(re)) {
      const body = match[3];
      const controller = mappingStringProp(body, "controller");
      const action = mappingStringProp(body, "action");
      if (!controller || !action) continue;
      const method = mappingStringProp(body, "method");
      map.set(`${controller}:${action}`, {
        path: match[2].replace(/\$([A-Za-z_]\w*)/g, ":$1"),
        ...(method ? { method: method.toUpperCase() } : {}),
      });
    }
  }
  return map;
}

function normalizeApiPath(raw: string): string | undefined {
  let path = raw.trim().replace(/\$\{[^}]+\}/g, ":param");
  if (/^https?:\/\//i.test(path)) return undefined;
  path = path.replace(/^\/+/, "");
  path = path.replace(/\?.*$/, "");
  path = path.replace(/#.*$/, "");
  if (!path || path.includes("://")) return undefined;
  return "/" + path;
}

function splitControllerAction(path: string, opts: GrailsAdapterOptions = {}): { controller: string; action: string } | undefined {
  const prefixes = new Set(opts.apiPathPrefixes ?? [...DEFAULT_API_PATH_PREFIXES]);
  const parts = path.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length > 1 && prefixes.has(parts[0])) parts.shift();
  if (!parts.length) return undefined;
  return { controller: parts[0], action: parts[1] ?? "index" };
}

function discoverClientApiCalls(rootDir: string, opts: GrailsAdapterOptions = {}): ClientApiCall[] {
  const paths = resolveGrailsPaths(rootDir, opts);
  const roots = paths.clientRoots;
  const calls: ClientApiCall[] = [];
  const directCall =
    /\b(?:api|multiPartApi|instance|multiInstance|axios)\s*\.\s*(get|post|put|delete|patch|head)\s*\(\s*([`'"])([\s\S]*?)\2/g;
  const concatCall =
    /\b(?:api|multiPartApi|instance|multiInstance|axios)\s*\.\s*(get|post|put|delete|patch|head)\s*\(\s*[^,\n]+?\+\s*([`'"])([\s\S]*?)\2/g;
  const fetchCall =
    /\bfetch\s*\(\s*([`'"])([\s\S]*?)\1\s*(?:,\s*\{([\s\S]*?)\})?/g;

  for (const root of roots) {
    for (const file of walk(root.dir, [".js", ".jsx", ".ts", ".tsx"], [], opts)) {
      const source = readFileSync(file, "utf8");
      const relFile = rel(rootDir, file);
      for (const re of [directCall, concatCall]) {
        re.lastIndex = 0;
        for (const match of source.matchAll(re)) {
          const method = match[1].toUpperCase();
          const rawPath = re === directCall ? match[3] : match[3];
          const path = normalizeApiPath(rawPath);
          if (!path) continue;
          const split = splitControllerAction(path, opts);
          if (!split) continue;
          calls.push({
            clientSvc: root.svc,
            method,
            rawPath,
            path,
            controller: split.controller,
            action: split.action,
            file: relFile,
          });
        }
      }
      fetchCall.lastIndex = 0;
      for (const match of source.matchAll(fetchCall)) {
        const rawPath = match[2];
        const path = normalizeApiPath(rawPath);
        if (!path) continue;
        const split = splitControllerAction(path, opts);
        if (!split) continue;
        const method = match[3]?.match(/\bmethod\s*:\s*['"]([^'"]+)['"]/i)?.[1]?.toUpperCase() ?? "GET";
        calls.push({
          clientSvc: root.svc,
          method,
          rawPath,
          path,
          controller: split.controller,
          action: split.action,
          file: relFile,
        });
      }
    }
  }
  return dedupeCalls(calls);
}

function readClientInfos(rootDir: string, opts: GrailsAdapterOptions = {}): ClassInfo[] {
  const paths = resolveGrailsPaths(rootDir, opts);
  const infos: ClassInfo[] = [];
  for (const root of paths.clientRoots) {
    const files = walk(root.dir, [".js", ".jsx", ".ts", ".tsx"], [], opts);
    if (!files.length) continue;
    infos.push({
      className: title(root.svc),
      logicalName: root.svc,
      svc: root.svc,
      file: rel(rootDir, root.dir),
      absFile: root.dir,
      source: files.map((file) => readFileSync(file, "utf8")).join("\n"),
      packageName: "client",
      domain: "client",
      kind: "client",
      methods: [],
      allowedMethods: {},
      securedRoles: [],
    });
  }
  return infos;
}

function dedupeCalls(calls: ClientApiCall[]): ClientApiCall[] {
  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.clientSvc}|${call.method}|${call.path}|${call.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readControllerClasses(rootDir: string, calls: ClientApiCall[], opts: GrailsAdapterOptions = {}): ClassInfo[] {
  const controllersDir = resolveGrailsPaths(rootDir, opts).controllersDir;
  const called = new Set(calls.map((c) => `${c.controller}:${c.action}`));
  const infos: ClassInfo[] = [];

  for (const file of walk(controllersDir, [".groovy"], [], opts)) {
    const source = readFileSync(file, "utf8");
    const className = parseClassName(source);
    if (!className?.endsWith("Controller")) continue;
    const logicalName = lowerFirst(className.replace(/Controller$/, ""));
    const methods = findMethods(source).filter((m) => isControllerAction(m, logicalName, called, opts));
    const packageName = parsePackage(source);
    const domain = packageDomain(packageName, opts);
    infos.push({
      className,
      logicalName,
      svc: kebab(logicalName),
      file: rel(rootDir, file),
      absFile: file,
      source,
      packageName,
      domain,
      kind: "controller",
      methods,
      allowedMethods: parseAllowedMethods(source),
      securedRoles: parseSecuredRoles(source),
    });
  }

  return infos;
}

function isControllerAction(
  method: MethodInfo,
  logicalName: string,
  called: Set<string>,
  opts: GrailsAdapterOptions = {}
): boolean {
  const helperActions = new Set([...(opts.helperActions ?? []), ...DEFAULT_HELPER_ACTIONS]);
  if (/\b(private|protected|static)\b/.test(method.modifiers)) return false;
  if (helperActions.has(method.name)) return false;
  if (called.has(`${logicalName}:${method.name}`)) return true;
  if (CRUD_ACTIONS.has(method.name)) return true;
  if (/\b(respond|render)\b/.test(method.body)) return true;
  return false;
}

function readBackendServiceClasses(rootDir: string, opts: GrailsAdapterOptions = {}): ClassInfo[] {
  const paths = resolveGrailsPaths(rootDir, opts);
  const dirs = [paths.servicesDir, paths.controllersDir];
  const infos: ClassInfo[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    for (const file of walk(dir, [".groovy"], [], opts)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      const className = parseClassName(source);
      if (!className || className.endsWith("Controller")) continue;
      if (!isBackendServiceClass(className, opts)) continue;
      const packageName = parsePackage(source);
      const domain = packageDomain(packageName, opts);
      infos.push({
        className,
        logicalName: className,
        svc: backendClassSvcKey(className),
        file: rel(rootDir, file),
        absFile: file,
        source,
        packageName,
        domain,
        kind: "service",
        methods: findMethods(source).filter((m) => !/\b(private|protected|static)\b/.test(m.modifiers)),
        allowedMethods: {},
        securedRoles: [],
      });
    }
  }

  return infos;
}

function isBackendServiceClass(className: string, opts: GrailsAdapterOptions = {}): boolean {
  const suffixes = opts.serviceClassSuffixes ?? [...DEFAULT_SERVICE_CLASS_SUFFIXES];
  return suffixes.some((suffix) => className.toLowerCase().endsWith(suffix.toLowerCase()));
}

function backendClassSvcKey(className: string): ServiceKey {
  if (className.endsWith("Service")) return `${kebab(className.replace(/Service$/, ""))}-service`;
  if (className.endsWith("Utils")) return `${kebab(className.replace(/Utils$/, ""))}-utils`;
  if (className.endsWith("Util")) return `${kebab(className.replace(/Util$/, ""))}-util`;
  return kebab(className);
}

function serviceNarrative(info: ClassInfo): NodeNarrative {
  if (info.kind === "client") {
    return {
      summary: `${title(info.svc)} consumes Grails backend APIs.`,
      why: "Client-to-API edges show which UI surface depends on each backend domain.",
    };
  }
  if (info.kind === "external") {
    return {
      summary: `${title(info.svc)} is an external integration boundary.`,
      why: "External service nodes make runtime dependencies visible beside internal API domains.",
    };
  }
  const role = info.kind === "controller" ? "Grails controller" : "backend service";
  const security = info.securedRoles.length ? ` Secured by ${info.securedRoles.join(", ")}.` : "";
  return {
    summary: `${info.className} is a ${role} in the ${info.domain} domain.`,
    why: `${role}s are mapped as GalaxyGraph service nodes so API capabilities and backend dependencies can be inspected together.${security}`,
  };
}

function endpointNarrative(info: ClassInfo, method: MethodInfo, callCount: number): NodeNarrative {
  const clientText = callCount ? ` Observed in ${callCount} client API call${callCount === 1 ? "" : "s"}.` : "";
  return {
    summary: `${method.name} is handled by ${info.className}.`,
    why: `This node represents a callable Grails action exposed through the default or explicit URL mapping.${clientText}`,
  };
}

function inferHttpMethod(
  info: ClassInfo,
  action: string,
  callsByRoute: Map<string, ClientApiCall[]>,
  mappings: Map<string, { path: string; method?: string }>
): string {
  const explicit = mappings.get(`${info.logicalName}:${action}`)?.method;
  if (explicit) return explicit;
  const allowed = info.allowedMethods[action];
  if (allowed) return allowed;
  const observed = [...new Set((callsByRoute.get(`${info.logicalName}:${action}`) ?? []).map((c) => c.method))];
  if (observed.length === 1) return observed[0];
  if (observed.length > 1) return observed.sort().join("/");
  if (/^(read|get|list|show|view|index|download|write)/i.test(action)) return "GET";
  if (/^(update|edit)/i.test(action)) return "PUT";
  if (/^delete/i.test(action)) return "DELETE";
  if (/^(create|save|add|send|email|complete|close|request|return|issue|notify|calculate|generate|share|cancel)/i.test(action)) return "POST";
  return "ACTION";
}

function endpointPath(info: ClassInfo, action: string, mappings: Map<string, { path: string; method?: string }>): string {
  return mappings.get(`${info.logicalName}:${action}`)?.path ?? `/${info.logicalName}/${action}`;
}

function buildEndpointDefs(
  controllers: ClassInfo[],
  calls: ClientApiCall[],
  mappings: Map<string, { path: string; method?: string }>
): EndpointDef[] {
  const callsByRoute = groupCallsByRoute(calls);
  const endpoints: EndpointDef[] = [];
  for (const info of controllers) {
    for (const method of info.methods) {
      const routeKey = `${info.logicalName}:${method.name}`;
      const callCount = callsByRoute.get(routeKey)?.length ?? 0;
      endpoints.push({
        id: `ep:${info.svc}:${method.name}`,
        svc: info.svc,
        fnName: method.name,
        noun: title(method.name),
        method: inferHttpMethod(info, method.name, callsByRoute, mappings),
        path: endpointPath(info, method.name, mappings),
        narrative: endpointNarrative(info, method, callCount),
      });
    }
  }
  return endpoints;
}

function groupCallsByRoute(calls: ClientApiCall[]): Map<string, ClientApiCall[]> {
  const out = new Map<string, ClientApiCall[]>();
  for (const call of calls) {
    const key = `${call.controller}:${call.action}`;
    const arr = out.get(key) ?? [];
    arr.push(call);
    out.set(key, arr);
  }
  return out;
}

function discoverDependencies(infos: ClassInfo[], classByName: Map<string, ClassInfo>): DependencyCall[] {
  const byPair = new Map<string, DependencyCall>();
  const classByBeanName = new Map<string, ClassInfo>(
    [...classByName.values()].map((info) => [lowerFirst(info.className), info])
  );
  for (const info of infos) {
    const deps = parseInjectedFields(info.source, classByName, classByBeanName);
    if (!deps.length) continue;
    for (const method of info.methods.length ? info.methods : findMethods(info.source)) {
      for (const dep of deps) {
        const callRe = new RegExp(`\\b${escapeRegex(dep.fieldName)}\\s*\\.\\s*([A-Za-z_]\\w*)\\s*\\(`, "g");
        const calledFns = [...method.body.matchAll(callRe)].map((m) => m[1]);
        if (!calledFns.length) continue;
        const consumer = dep.consumer;
        const key = `${info.svc}->${consumer.svc}`;
        const current =
          byPair.get(key) ??
          {
            producer: info.svc,
            consumer: consumer.svc,
            producerFile: info.file,
            consumerFile: consumer.file,
            fieldName: dep.fieldName,
            producerFns: new Set<string>(),
            consumerFns: new Set<string>(),
          };
        current.producerFns.add(method.name);
        calledFns.forEach((fn) => current.consumerFns.add(fn));
        byPair.set(key, current);
      }
    }
  }
  return [...byPair.values()];
}

function parseInjectedFields(
  source: string,
  classByName: Map<string, ClassInfo>,
  classByBeanName: Map<string, ClassInfo>
): Array<{ consumer: ClassInfo; fieldName: string }> {
  const fields: Array<{ consumer: ClassInfo; fieldName: string }> = [];
  const re = /^\s*([A-Z]\w+)\s+([a-z]\w+)\s*(?:$|;|\/\/|=)/gm;
  for (const match of source.matchAll(re)) {
    const consumer = classByName.get(match[1]);
    if (consumer) fields.push({ consumer, fieldName: match[2] });
  }
  const defRe = /^\s*def\s+([a-z]\w+)\s*(?:$|;|\/\/|=)/gm;
  for (const match of source.matchAll(defRe)) {
    const consumer = classByBeanName.get(match[1]);
    if (consumer) fields.push({ consumer, fieldName: match[1] });
  }
  return dedupeInjectedFields(fields);
}

function dedupeInjectedFields(fields: Array<{ consumer: ClassInfo; fieldName: string }>): Array<{ consumer: ClassInfo; fieldName: string }> {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = `${field.consumer.className}:${field.fieldName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildInternalServiceEndpoints(serviceInfos: ClassInfo[], deps: DependencyCall[]): EndpointDef[] {
  const serviceBySvc = new Map(serviceInfos.map((info) => [info.svc, info]));
  const seen = new Set<string>();
  const endpoints: EndpointDef[] = [];
  for (const dep of deps) {
    const info = serviceBySvc.get(dep.consumer);
    if (!info) continue;
    for (const fn of dep.consumerFns) {
      const key = `${dep.consumer}:${fn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      endpoints.push({
        id: `ep:${dep.consumer}:${fn}`,
        svc: dep.consumer,
        fnName: fn,
        noun: title(fn),
        method: "INTERNAL",
        path: `${info.className}.${fn}()`,
        internal: true,
        narrative: {
          summary: `${fn} is called internally on ${info.className}.`,
          why: "Internal service method nodes show where controller actions delegate business logic.",
        },
      });
    }
  }
  return endpoints;
}

function buildDependencyContracts(deps: DependencyCall[]): ContractDef[] {
  return deps.map((dep) => ({
    id: `contract:${dep.producer}:${dep.consumer}`,
    file: dep.producerFile,
    describe: `${title(dep.producer)} calls ${title(dep.consumer)} through ${dep.fieldName}.`,
    producer: dep.producer,
    consumer: dep.consumer,
    mode: "direct-call",
    narrative: {
      summary: `${title(dep.producer)} depends on ${title(dep.consumer)}.`,
      flow: `1. ${title(dep.producer)} handles ${sampleList([...dep.producerFns])}.\n2. It calls ${sampleList([...dep.consumerFns])} on ${title(dep.consumer)}.\n3. The backend service returns data or persists domain changes.`,
    },
    producerFns: [...dep.producerFns].sort(),
    consumerFns: [...dep.consumerFns].sort(),
    tests: [],
  }));
}

function buildClientContracts(calls: ClientApiCall[], knownControllerSvcs: Set<ServiceKey>): ContractDef[] {
  const byPair = new Map<string, { calls: ClientApiCall[]; consumer: ServiceKey }>();
  for (const call of calls) {
    const consumer = kebab(call.controller);
    if (!knownControllerSvcs.has(consumer) && call.controller !== "oauth") continue;
    const normalizedConsumer = call.controller === "oauth" ? "oauth-provider" : consumer;
    const key = `${call.clientSvc}->${normalizedConsumer}`;
    const current = byPair.get(key) ?? { calls: [], consumer: normalizedConsumer };
    current.calls.push(call);
    byPair.set(key, current);
  }

  return [...byPair.entries()].map(([key, value]) => {
    const [producer, consumer] = key.split("->");
    const files = [...new Set(value.calls.map((c) => c.file))];
    const actions = [...new Set(value.calls.map((c) => c.action))].sort();
    return {
      id: `contract:${producer}:${consumer}:api-consumer`,
      file: files[0] ?? "",
      describe: `${title(producer)} calls ${title(consumer)} APIs.`,
      producer,
      consumer,
      mode: "direct-call",
      narrative: {
        summary: `${title(producer)} consumes ${title(consumer)} endpoints.`,
        why: "This edge is derived from axios/fetch-style API calls in the client source.",
        flow: `1. The client calls ${sampleList(actions)}.\n2. Grails routes the request to ${title(consumer)}.\n3. The controller delegates into backend services as needed.`,
      },
      producerFns: files.slice(0, 12),
      consumerFns: actions,
      tests: [],
    } satisfies ContractDef;
  });
}

function integrationRules(opts: GrailsAdapterOptions = {}): ExternalIntegrationRule[] {
  return opts.includeDefaultExternalIntegrations === false
    ? opts.externalIntegrations ?? []
    : [...DEFAULT_EXTERNAL_INTEGRATIONS, ...(opts.externalIntegrations ?? [])];
}

function buildExternalServicesAndContracts(infos: ClassInfo[], clientInfos: ClassInfo[], opts: GrailsAdapterOptions = {}): {
  services: ServiceDef[];
  contracts: ContractDef[];
} {
  const classesWithClients = [...infos, ...clientInfos];
  const services = new Map<ServiceKey, ServiceDef>();
  const contracts: ContractDef[] = [];

  for (const info of classesWithClients) {
    for (const ext of integrationRules(opts)) {
      if (!ext.patterns.some((p) => p.test(info.source))) continue;
      services.set(ext.svc, {
        id: `svc:${ext.svc}`,
        svc: ext.svc,
        file: "external",
        narrative: {
          summary: `${ext.label} boundary detected in source.`,
          why: "External dependencies are represented as adapter service nodes so deployment risks are visible in the graph.",
        },
      });
      contracts.push({
        id: `contract:${info.svc}:${ext.svc}`,
        file: info.file,
        describe: `${title(info.svc)} integrates with ${ext.label}.`,
        producer: info.svc,
        consumer: ext.svc,
        mode: "direct-call",
        narrative: {
          summary: `${title(info.svc)} calls ${ext.label}.`,
          why: "This edge is derived from source references to external APIs or framework integration points.",
        },
        producerFns: [],
        consumerFns: [ext.label],
        tests: [],
      });
    }
  }

  return { services: [...services.values()], contracts: dedupeContracts(contracts) };
}

function parseGrailsTests(rootDir: string, endpoints: EndpointDef[], services: ServiceDef[], opts: GrailsAdapterOptions = {}): TestDef[] {
  const roots = resolveGrailsPaths(rootDir, opts).testDirs;
  const serviceKeys = services.map((s) => s.svc);
  const serviceKeySet = new Set(serviceKeys);
  const tests: TestDef[] = [];
  let counter = 0;

  for (const root of roots) {
    for (const file of walk(root, [".groovy"], [], opts)) {
      const source = readFileSync(file, "utf8");
      const relFile = rel(rootDir, file);
      const testMethods = findSpockTestMethods(source, file);
      const targetSvcs = inferTestServices(source, file, serviceKeySet);
      const endpointPool = targetSvcs.length ? endpoints.filter((ep) => targetSvcs.includes(ep.svc)) : endpoints;

      for (const method of testMethods) {
        const matchedEndpoints = matchTestEndpoints(method, endpointPool);
        const methodLower = `${method.name}\n${method.body}`.toLowerCase();
        const svc =
          matchedEndpoints[0]?.split(":")[0] ??
          targetSvcs[0] ??
          serviceKeys.find((key) => methodLower.includes(serviceNeedle(key))) ??
          serviceKeys[0] ??
          "backend";
        counter += 1;
        tests.push({
          id: `test:${relFile}:${counter}`,
          svc,
          name: method.name,
          http: /Controller|Integration|request|response|render|respond/i.test(source),
          endpoints: matchedEndpoints,
          story: `${method.name} (${relFile})`,
          category: relFile.includes("/integration-test/") ? "integration" : "unit",
        });
      }
    }
  }

  return tests;
}

function findSpockTestMethods(source: string, file: string): TestMethodInfo[] {
  const re = /^\s*(?:@[^\n]+\n\s*)*(?:def|void)\s+["']([^"']+)["']\s*\([^)]*\)\s*\{/gm;
  const matches = [...source.matchAll(re)];
  if (!matches.length) {
    return [{ name: basename(file, ".groovy"), body: source }];
  }
  return matches.map((match, idx) => {
    const start = match.index ?? 0;
    const end = matches[idx + 1]?.index ?? source.length;
    return {
      name: match[1],
      body: source.slice(start, end),
    };
  });
}

function matchTestEndpoints(method: TestMethodInfo, endpointPool: EndpointDef[]): string[] {
  const methodName = method.name.toLowerCase();
  return endpointPool
    .filter((ep) => {
      const fn = escapeRegex(ep.fnName);
      const callPattern = new RegExp(`\\b(?:controller\\s*\\.\\s*)?${fn}\\s*\\(`, "i");
      return methodName.includes(ep.fnName.toLowerCase()) || callPattern.test(method.body);
    })
    .slice(0, 12)
    .map((ep) => `${ep.svc}:${ep.fnName}`);
}

function inferTestServices(source: string, file: string, serviceKeySet: Set<ServiceKey>): ServiceKey[] {
  const classNames = new Set<string>();

  for (const match of source.matchAll(/\b(?:ControllerUnitTest|DomainUnitTest|ServiceUnitTest)\s*<\s*([A-Z]\w*)\s*>/g)) {
    classNames.add(match[1]);
  }
  for (const match of source.matchAll(/\b([A-Z]\w*(?:Controller|Service|Utils|Util|Policy))\b/g)) {
    classNames.add(match[1]);
  }
  const fileTarget = basename(file, ".groovy").replace(/Spec$/, "");
  if (fileTarget) classNames.add(fileTarget);
  for (const match of source.matchAll(/^\s*import\s+[\w.]+\.([A-Z]\w*)\s*$/gm)) {
    classNames.add(match[1]);
  }

  const svcs: ServiceKey[] = [];
  const seen = new Set<ServiceKey>();
  for (const className of classNames) {
    const candidates = [
      backendClassSvcKey(className),
      kebab(className.replace(/Controller$/, "")),
      kebab(className),
    ];
    for (const candidate of candidates) {
      if (!serviceKeySet.has(candidate) || seen.has(candidate)) continue;
      seen.add(candidate);
      svcs.push(candidate);
    }
  }
  return svcs;
}

function serviceNeedle(key: ServiceKey): string {
  return key.replace(/-/g, "").toLowerCase();
}

function buildColors(
  services: ServiceDef[],
  infos: ClassInfo[],
  calls: ClientApiCall[],
  clientInfos: ClassInfo[],
  opts: GrailsAdapterOptions = {}
): Record<ServiceKey, string> {
  const domainBySvc = new Map<ServiceKey, string>(infos.map((info) => [info.svc, info.domain]));
  for (const call of calls) domainBySvc.set(call.clientSvc, "client");
  for (const info of clientInfos) domainBySvc.set(info.svc, "client");
  for (const ext of integrationRules(opts)) domainBySvc.set(ext.svc, "external");
  return Object.fromEntries(
    services.map((service) => [service.svc, DOMAIN_COLORS[domainBySvc.get(service.svc) ?? "default"] ?? DOMAIN_COLORS.default])
  );
}

function emptyMutation(): MutationData {
  return { aggregate: { killed: 0, survived: 0, total: 0, score: 0 }, services: {}, endpoints: {} };
}

function sampleList(items: string[]): string {
  const clean = items.filter(Boolean);
  if (!clean.length) return "the mapped capability";
  const first = clean.slice(0, 4).join(", ");
  return clean.length > 4 ? `${first}, and ${clean.length - 4} more` : first;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeServices(services: ServiceDef[]): ServiceDef[] {
  const seen = new Set<ServiceKey>();
  return services.filter((service) => {
    if (seen.has(service.svc)) return false;
    seen.add(service.svc);
    return true;
  });
}

function dedupeEndpoints(endpoints: EndpointDef[]): EndpointDef[] {
  const seen = new Set<string>();
  return endpoints.filter((endpoint) => {
    if (seen.has(endpoint.id)) return false;
    seen.add(endpoint.id);
    return true;
  });
}

function dedupeContracts(contracts: ContractDef[]): ContractDef[] {
  const seen = new Set<string>();
  return contracts.filter((contract) => {
    if (seen.has(contract.id)) return false;
    seen.add(contract.id);
    return true;
  });
}

function clientServiceDefs(calls: ClientApiCall[], clientInfos: ClassInfo[], opts: GrailsAdapterOptions = {}): ServiceDef[] {
  const activeClients = new Set(calls.map((call) => call.clientSvc));
  for (const info of clientInfos) {
    if (integrationRules(opts).some((ext) => ext.patterns.some((pattern) => pattern.test(info.source)))) {
      activeClients.add(info.svc);
    }
  }
  return clientInfos
    .filter((info) => activeClients.has(info.svc))
    .map((info) => ({
      id: `svc:${info.svc}`,
      svc: info.svc,
      file: info.file,
      narrative: serviceNarrative(info),
    }));
}

function classServiceDefs(infos: ClassInfo[]): ServiceDef[] {
  return infos.map((info) => ({
    id: `svc:${info.svc}`,
    svc: info.svc,
    file: info.file,
    narrative: serviceNarrative(info),
  }));
}

function contractsWithTests(contracts: ContractDef[], tests: TestDef[]): ContractDef[] {
  return contracts.map((contract) => {
    const contractTests: ContractTest[] = tests
      .filter((test) => test.svc === contract.producer || test.svc === contract.consumer)
      .slice(0, 3)
      .map((test) => ({
        name: test.name,
        ...(test.category ? { category: test.category } : {}),
        ...(test.story ? { story: test.story } : {}),
      }));
    return contractTests.length ? { ...contract, tests: contractTests } : contract;
  });
}

export function parseGrailsClientApiCalls(rootDir: string, opts: GrailsAdapterOptions = {}): ClientApiCall[] {
  return discoverClientApiCalls(rootDir, opts);
}

export async function generateGrailsDataset(rootDir: string, opts: GrailsAdapterOptions = {}): Promise<GalaxyGraphDataset> {
  const calls = discoverClientApiCalls(rootDir, opts);
  const clientInfos = readClientInfos(rootDir, opts);
  const mappings = parseExplicitUrlMappings(rootDir, opts);
  const controllers = readControllerClasses(rootDir, calls, opts);
  const backendServices = readBackendServiceClasses(rootDir, opts);
  const classInfos = [...controllers, ...backendServices];
  const classByName = new Map(classInfos.map((info) => [info.className, info]));
  const deps = discoverDependencies(classInfos, classByName);
  const controllerEndpoints = buildEndpointDefs(controllers, calls, mappings);
  const internalEndpoints = buildInternalServiceEndpoints(backendServices, deps);
  const knownControllerSvcs = new Set(controllers.map((controller) => controller.svc));
  const clientContracts = buildClientContracts(calls, knownControllerSvcs);
  const dependencyContracts = buildDependencyContracts(deps);
  const external = buildExternalServicesAndContracts(classInfos, clientInfos, opts);

  const services = dedupeServices([
    ...clientServiceDefs(calls, clientInfos, opts),
    ...classServiceDefs(classInfos),
    ...external.services,
  ]);
  const endpoints = dedupeEndpoints([...controllerEndpoints, ...internalEndpoints]);
  const tests = parseGrailsTests(rootDir, endpoints, services, opts);
  const contracts = contractsWithTests(dedupeContracts([...clientContracts, ...dependencyContracts, ...external.contracts]), tests);

  return {
    services,
    endpoints,
    tests,
    contracts,
    topics: [],
    mutation: emptyMutation(),
    colors: buildColors(services, classInfos, calls, clientInfos, opts),
  };
}
