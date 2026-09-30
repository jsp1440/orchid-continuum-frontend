// @vitest-environment node
/**
 * Calyx backend route inventory contract.
 *
 * Every path this frontend sends to the Calyx backend base must be a route the
 * backend actually mounts, with the method the frontend uses. The paths are
 * collected statically from `src/` with the TypeScript compiler API, then
 * matched against a route snapshot generated from the real backend app.
 *
 * The snapshot lives at `contracts/calyx-backend-routes@<backend-sha>.json`.
 * It was generated from jsp1440/orchid-calyx-backend, branch
 * `oc-autonomous-integration`, by importing `app.main:app` in-process (no
 * server, no network). To regenerate, run this from a backend checkout at the
 * SHA you want, in a Python 3.12 venv with the backend's requirements.txt, and
 * delete the old snapshot file:
 *
 *   OUT=<frontend>/contracts/calyx-backend-routes@$(git rev-parse HEAD).json
 *   env -u DATABASE_URL BACKEND_SHA=$(git rev-parse HEAD) python - > "$OUT" <<'PY'
 *   import json, os
 *   from app.main import app
 *   routes = {}
 *   for r in app.routes:
 *       path, methods = getattr(r, "path", None), getattr(r, "methods", None)
 *       if path and methods:
 *           routes.setdefault(path, set()).update(m for m in methods if m != "HEAD")
 *   rows = [json.dumps({"path": p, "methods": sorted(routes[p])}) for p in sorted(routes)]
 *   head = {
 *       "schema": "calyx-backend-route-inventory.v1",
 *       "backend_repository": "jsp1440/orchid-calyx-backend",
 *       "backend_branch": "oc-autonomous-integration",
 *       "backend_sha": os.environ["BACKEND_SHA"],
 *       "source": "app.main:app.routes (FastAPI route table imported in-process; no server, no network)",
 *       "route_count": len(rows),
 *   }
 *   body = json.dumps(head, indent=2)[:-2]
 *   print(body + ',\n  "routes": [\n    ' + ",\n    ".join(rows) + "\n  ]\n}")
 *   PY
 *
 * What counts as "sent to the Calyx backend":
 *  - a string or template whose value starts with the Calyx base
 *    (`CALYX_BACKEND_BASE_URL`, or a local constant read from
 *    `VITE_CALYX_API_URL` / `VITE_CALYX_BACKEND_BASE_URL`), directly or through
 *    a constant such as `COMMUNITY_API_BASE`;
 *  - a path passed to a helper that prefixes it with the Calyx base (the
 *    helpers are derived from the source, not listed by hand);
 *  - a path passed to a call alongside the Calyx base as another argument,
 *    e.g. `getJson(CALYX_BACKEND_BASE_URL, '/api/executive/state')`.
 *
 * The public API (`BACKEND_BASE_URL`, `API_BASE_URL` / `apiRequest`, species
 * search, atlas and the like) is a separate service and is excluded the same
 * way: anything rooted at a public base is never collected.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BACKEND_RESERVE_PLAN_PATH } from './control-plane/backendReservePlanClient';
import { CRM_SUBSCRIBE_PATH, submitMissionListSignup } from './missionListSignup';

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

type RouteRow = { path: string; methods: string[] };
type RouteSnapshot = {
  schema: string;
  backend_repository: string;
  backend_branch: string;
  backend_sha: string;
  route_count: number;
  routes: RouteRow[];
};

const SNAPSHOT_NAME = /^calyx-backend-routes@([0-9a-f]{40})\.json$/;
const snapshotFiles = readdirSync('contracts').filter((name) => SNAPSHOT_NAME.test(name));
const snapshotFile = snapshotFiles[0];
const snapshot: RouteSnapshot = JSON.parse(readFileSync(path.join('contracts', snapshotFile), 'utf8'));

// ---------------------------------------------------------------------------
// Static collector
// ---------------------------------------------------------------------------

// Sentinels that cannot occur in a URL path: base markers and parameter tokens.
const CALYX = '\u27eaCALYX\u27eb';
const PUBLIC = '\u27eaOTHER\u27eb';
const PARAM = (index: number) => `\u27e6${index}\u27e7`;
const PARAM_TOKEN = /\u27e6\d+\u27e7/;

const CALYX_BASE_IDENTIFIER = 'CALYX_BACKEND_BASE_URL';
const CALYX_ENV = new Set(['VITE_CALYX_API_URL', 'VITE_CALYX_BACKEND_BASE_URL', 'VITE_MISSION_CONTROL_BACKEND_URL']);
const PUBLIC_ENV = new Set(['VITE_API_BASE_URL', 'NEXT_PUBLIC_API_BASE_URL', 'VITE_BACKEND_BASE_URL']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const UNRESOLVED = 'UNRESOLVED';

type Kind = 'calyx' | 'public';
type Helper = { kind: Kind; param: number; prefix: string; method: string[] | 'CALLER' };
type Collected = { file: string; line: number; path: string; methods: string[]; via: string };
type Unclassified = { file: string; line: number; path: string };

const isTestFile = (file: string) => /\.test\.tsx?$/.test(file) || file.includes('__fixtures__');

function buildProgram(): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile('tsconfig.app.json', {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => undefined,
  });
  if (!parsed) throw new Error('tsconfig.app.json could not be read');
  const rootNames = parsed.fileNames.filter((file) => !isTestFile(file));
  // Only src files, no libs or packages: symbol resolution across src is all
  // the collector needs, and it keeps the program small.
  return ts.createProgram({
    rootNames,
    options: { ...parsed.options, noEmit: true, types: [], noResolve: true, noLib: true },
  });
}

function collect() {
  const t0 = Date.now();
  const timing = (label: string) => {
    if (process.env.ROUTE_INVENTORY_DEBUG) console.log(`[inventory] ${label} ${Date.now() - t0}ms`);
  };
  const program = buildProgram();
  const checker = program.getTypeChecker();
  timing('program');
  const cwd = process.cwd();
  const sources = program
    .getSourceFiles()
    .filter((sf) => {
      const rel = path.relative(cwd, sf.fileName);
      return rel.startsWith('src' + path.sep) && !sf.isDeclarationFile && !isTestFile(rel);
    });

  const rel = (node: ts.Node) => path.relative(cwd, node.getSourceFile().fileName);
  const lineOf = (node: ts.Node) =>
    node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;

  function declarationOf(identifier: ts.Node): ts.Declaration | undefined {
    let symbol = checker.getSymbolAtLocation(identifier);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  }

  const unwrap = (node: ts.Expression): ts.Expression => {
    let current = node;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current)
    ) {
      current = current.expression;
    }
    return current;
  };

  const constCache = new Map<ts.Node, string | null>();
  const inProgress = new Set<ts.Node>();

  function constValue(decl: ts.Declaration): string | null {
    if (!ts.isVariableDeclaration(decl) || !decl.initializer) return null;
    if (!(ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const)) return null;
    if (constCache.has(decl)) return constCache.get(decl) ?? null;
    if (inProgress.has(decl)) return null;
    inProgress.add(decl);
    const value = render(decl.initializer, new Map());
    inProgress.delete(decl);
    constCache.set(decl, value);
    return value;
  }

  /**
   * Render an expression to the string it evaluates to, as far as it can be
   * known statically: bases become markers, parameters of the function being
   * analysed become tokens, and anything else dynamic becomes `{}`.
   */
  function render(node: ts.Expression, params: Map<string, number>): string | null {
    const n = unwrap(node);
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      // An absolute URL names its service: the Calyx host, or something else.
      const origin = /^https?:\/\/[^/?#]+/i.exec(n.text);
      if (origin) return (/orchid-calyx-backend/i.test(origin[0]) ? CALYX : PUBLIC) + n.text.slice(origin[0].length);
      return n.text;
    }
    if (ts.isTemplateExpression(n)) {
      return (
        n.head.text +
        n.templateSpans.map((span) => (render(span.expression, params) ?? '{}') + span.literal.text).join('')
      );
    }
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (op === ts.SyntaxKind.PlusToken) {
        const left = render(n.left, params);
        const right = render(n.right, params);
        if (left === null && right === null) return null;
        return (left ?? '{}') + (right ?? '{}');
      }
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        for (const side of [n.left, n.right]) {
          const value = render(side, params);
          if (value === CALYX || value === PUBLIC) return value;
        }
        return null;
      }
      return null;
    }
    if (ts.isConditionalExpression(n)) {
      const branches = [render(n.whenTrue, params), render(n.whenFalse, params)];
      // `${path}${query ? `?${query}` : ''}`: only the query string varies.
      const query = branches.find((b) => b !== null && /^[?#]/.test(b));
      if (query !== undefined && branches.some((b) => b === '')) return query;
      if (branches[0] !== null && branches[0] === branches[1]) return branches[0];
      // `path.startsWith('/') ? path : `/${path}``: the same parameter either way.
      const token = branches[0] ? PARAM_TOKEN.exec(branches[0])?.[0] : undefined;
      if (token && branches[1]?.includes(token)) return branches[0];
      const marker = branches.find((b) => b === CALYX || b === PUBLIC);
      return marker ?? null;
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(unwrap(n.expression))) {
      // A path builder: `const projectPath = (id) => `/api/.../${id}``.
      const decl = declarationOf(unwrap(n.expression));
      const body = decl ? returnedExpression(decl) : undefined;
      if (body && isStringish(body) && !inProgress.has(body)) {
        inProgress.add(body);
        const value = render(body, new Map());
        inProgress.delete(body);
        return value;
      }
      return null;
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const name = n.expression.name.text;
      if (['replace', 'replaceAll', 'trim', 'trimEnd', 'toString'].includes(name)) {
        const value = render(n.expression.expression, params);
        return value === CALYX || value === PUBLIC ? value : null;
      }
      return null;
    }
    if (ts.isPropertyAccessExpression(n)) {
      const name = n.name.text;
      if (/\benv$/.test(n.expression.getText())) {
        if (CALYX_ENV.has(name)) return CALYX;
        if (PUBLIC_ENV.has(name)) return PUBLIC;
      }
      return null;
    }
    if (ts.isIdentifier(n)) {
      if (params.has(n.text)) return PARAM(params.get(n.text) as number);
      const decl = declarationOf(n);
      if (!decl) return null;
      if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) && decl.name.text === CALYX_BASE_IDENTIFIER) {
        return CALYX;
      }
      // A local const inside the function being analysed keeps its parameters.
      if (params.size && ts.isVariableDeclaration(decl) && decl.initializer && !inProgress.has(decl)) {
        if (!(ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const)) return null;
        inProgress.add(decl);
        const value = render(decl.initializer, params);
        inProgress.delete(decl);
        return value;
      }
      return constValue(decl);
    }
    return null;
  }

  /** The single expression a function returns, for arrow bodies and one-`return` functions. */
  function returnedExpression(decl: ts.Node): ts.Expression | undefined {
    const fn = ts.isVariableDeclaration(decl) && decl.initializer ? unwrap(decl.initializer) : decl;
    if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn)) || !fn.body) {
      return undefined;
    }
    if (!ts.isBlock(fn.body)) return fn.body;
    const returns = fn.body.statements.filter(ts.isReturnStatement);
    return returns.length === 1 && returns[0].expression ? returns[0].expression : undefined;
  }

  function isStringish(node: ts.Node): boolean {
    return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node) ||
    (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken));
  }

  /** Outermost string-valued expressions in code (not imports or types). */
  function candidates(root: ts.Node): ts.Expression[] {
    const found: ts.Expression[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isImportDeclaration(node) ||
        ts.isExportDeclaration(node) ||
        ts.isLiteralTypeNode(node) ||
        ts.isTypeNode(node)
      ) {
        return;
      }
      if (isStringish(node)) {
        const parent = node.parent;
        const nested =
          (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken) ||
          ts.isTemplateSpan(parent);
        if (!nested) found.push(node as ts.Expression);
      }
      ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
  }

  /** Walk up through wrappers to the call this expression is an argument of. */
  function callSite(node: ts.Expression): { call: ts.CallExpression; index: number } | null {
    let current: ts.Node = node;
    while (
      ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isNonNullExpression(current.parent)
    ) {
      current = current.parent;
    }
    const parent = current.parent;
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
      const index = parent.arguments?.indexOf(current as ts.Expression) ?? -1;
      if (index >= 0 && ts.isCallExpression(parent)) return { call: parent, index };
    }
    return null;
  }

  const calleeName = (call: ts.CallExpression | ts.NewExpression) => {
    const callee = unwrap(call.expression);
    if (ts.isIdentifier(callee)) return callee.text;
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
    return '';
  };

  const helpers = new Map<ts.Node, Helper>();
  // Names of helper declarations, so only plausible callees are resolved.
  const helperNames = new Set<string>();
  const nameOf = (decl: ts.Node) => {
    const name = (decl as { name?: ts.Node }).name;
    return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
  };
  const addHelper = (decl: ts.Node, helper: Helper) => {
    helpers.set(decl, helper);
    const name = nameOf(decl);
    if (name) helperNames.add(name);
  };

  function helperOf(call: ts.CallExpression | ts.NewExpression): Helper | undefined {
    if (!ts.isCallExpression(call)) return undefined;
    const callee = unwrap(call.expression);
    const target = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    if (!ts.isIdentifier(target) || !helperNames.has(target.text)) return undefined;
    const decl = declarationOf(target);
    return decl ? helpers.get(decl) : undefined;
  }

  /** Methods an HTTP call uses, from its init object or a method argument. */
  function methodsOf(call: ts.CallExpression, pathIndex: number): string[] | 'CALLER' {
    const methods = new Set<string>();
    let opaque = false;
    call.arguments.forEach((arg, index) => {
      if (index === pathIndex) return;
      const a = unwrap(arg);
      if (ts.isObjectLiteralExpression(a)) {
        let found = false;
        for (const prop of a.properties) {
          if (ts.isSpreadAssignment(prop)) opaque = true;
          if (ts.isPropertyAssignment(prop) && prop.name.getText() === 'method') {
            found = true;
            const init = unwrap(prop.initializer);
            const branches = ts.isConditionalExpression(init) ? [init.whenTrue, init.whenFalse] : [init];
            for (const branch of branches) {
              const value = render(branch, new Map());
              if (value && HTTP_METHODS.has(value.toUpperCase())) methods.add(value.toUpperCase());
              else opaque = true;
            }
          }
          if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'method') {
            found = true;
            opaque = true;
          }
        }
        if (!found && !opaque) return;
      } else if (ts.isStringLiteral(a) && HTTP_METHODS.has(a.text.toUpperCase())) {
        methods.add(a.text.toUpperCase());
      } else if (ts.isIdentifier(a) || ts.isPropertyAccessExpression(a) || ts.isCallExpression(a)) {
        const value = render(a, new Map());
        if (value && HTTP_METHODS.has(value.toUpperCase())) methods.add(value.toUpperCase());
        else if (value === null || value === '{}') opaque = true;
      }
    });
    if (methods.size) return [...methods].sort();
    if (opaque) return 'CALLER';
    return ['GET'];
  }

  function resolveMethods(call: ts.CallExpression | ts.NewExpression, pathIndex: number, helper?: Helper): string[] {
    // `new URL(...)` builds a URL that is fetched elsewhere.
    if (!ts.isCallExpression(call)) return [UNRESOLVED];
    const local = methodsOf(call, pathIndex);
    if (helper && helper.method !== 'CALLER') {
      // A helper that fixes its own method wins over anything the caller passes
      // unless the caller names one explicitly.
      return local !== 'CALLER' && !(local.length === 1 && local[0] === 'GET') ? local : helper.method;
    }
    return local === 'CALLER' ? [UNRESOLVED] : local;
  }

  type FunctionLike = { decl: ts.Node; params: Map<string, number>; body: ts.Node };
  const functions: FunctionLike[] = [];
  const functionByNode = new Map<ts.Node, FunctionLike>();
  const asFunction = (init: ts.Expression | undefined) => {
    if (!init) return undefined;
    const value = unwrap(init);
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return value;
    // `const request = useCallback(async (path, init) => ..., deps)`
    if (ts.isCallExpression(value) && value.arguments[0]) {
      const first = unwrap(value.arguments[0]);
      if (ts.isArrowFunction(first) || ts.isFunctionExpression(first)) return first;
    }
    return undefined;
  };
  for (const sf of sources) {
    const visit = (node: ts.Node) => {
      let fn: ts.FunctionLikeDeclarationBase | undefined;
      if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.body) fn = node;
      else if (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) fn = asFunction(node.initializer);
      else if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isCallExpression(node.parent)) fn = node;
      if (fn?.body) {
        const params = new Map<string, number>();
        fn.parameters.forEach((p, i) => {
          if (ts.isIdentifier(p.name)) params.set(p.name.text, i);
        });
        const entry = { decl: node, params, body: fn.body };
        functions.push(entry);
        functionByNode.set(node, entry);
        functionByNode.set(fn.body, entry);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  const candidateCache = new Map<ts.Node, ts.Expression[]>();
  const cachedCandidates = (root: ts.Node) => {
    if (!candidateCache.has(root)) candidateCache.set(root, candidates(root));
    return candidateCache.get(root) as ts.Expression[];
  };

  /** Where a local `const url = ...` is passed to a call inside `scope`. */
  function localCallsOf(decl: ts.VariableDeclaration, scope: ts.Node) {
    const sites: { call: ts.CallExpression; index: number }[] = [];
    const visit = (inner: ts.Node) => {
      if (ts.isCallExpression(inner)) {
        inner.arguments.forEach((a, index) => {
          const arg = unwrap(a);
          if (ts.isIdentifier(arg) && ts.isIdentifier(decl.name) && arg.text === decl.name.text) sites.push({ call: inner, index });
        });
      }
      ts.forEachChild(inner, visit);
    };
    visit(scope);
    return sites;
  }

  /**
   * `${BASE}${path}` and `${BASE}/api/lexicon${path}` take a path; `/api/intake/${id}`
   * takes an identifier, so that function is not a path helper and its own
   * template is collected instead.
   */
  const isPathPrefix = (prefix: string) => !prefix.includes('{}') && !prefix.includes('?') && !/[/=]$/.test(prefix);

  /**
   * A helper is a function that sends one of its parameters to a base: either
   * `${BASE}${param}` in a template, or by forwarding it to another helper.
   */
  function deriveHelper(fn: FunctionLike): Helper | undefined {
    if (!fn.params.size) return undefined;
    for (const node of cachedCandidates(fn.body)) {
      const value = render(node, fn.params);
      if (!value) continue;
      const kind: Kind | null = value.startsWith(CALYX) ? 'calyx' : value.startsWith(PUBLIC) ? 'public' : null;
      if (!kind) continue;
      const rest = value.slice((kind === 'calyx' ? CALYX : PUBLIC).length);
      const match = PARAM_TOKEN.exec(rest);
      if (!match) continue;
      const prefix = rest.slice(0, match.index);
      if (!isPathPrefix(prefix)) continue;
      const param = Number(match[0].slice(1, -1));
      let method: Helper['method'] = 'CALLER';
      const site = callSite(node);
      if (site) method = methodsOf(site.call, site.index);
      else if (ts.isVariableDeclaration(node.parent)) {
        const sites = localCallsOf(node.parent, fn.body);
        if (sites.length) method = methodsOf(sites[0].call, sites[0].index);
      }
      return { kind, param, prefix, method };
    }
    const visitCalls = (node: ts.Node): Helper | undefined => {
      if (ts.isCallExpression(node)) {
        const inner = helperOf(node);
        if (inner && node.arguments[inner.param]) {
          const value = render(node.arguments[inner.param], fn.params);
          const match = value ? PARAM_TOKEN.exec(value) : null;
          if (value && match && isPathPrefix(value.slice(0, match.index))) {
            const innerMethod = methodsOf(node, inner.param);
            return {
              kind: inner.kind,
              param: Number(match[0].slice(1, -1)),
              prefix: inner.prefix + value.slice(0, match.index),
              method: inner.method !== 'CALLER' ? inner.method : innerMethod,
            };
          }
        }
      }
      return ts.forEachChild(node, visitCalls);
    };
    return visitCalls(fn.body);
  }

  /** `function useApi() { return useCallback(async (path) => ..., []) }` and `const api = useApi()`. */
  function deriveFactories() {
    let changed = false;
    for (const fn of functions) {
      if (helpers.has(fn.decl)) continue;
      const returned = returnedExpression(fn.decl) ?? (ts.isBlock(fn.body) ? undefined : (fn.body as ts.Expression));
      if (!returned) continue;
      const value = unwrap(returned);
      const inner =
        ts.isCallExpression(value) && value.arguments[0] ? unwrap(value.arguments[0]) : value;
      const helper = helpers.get(inner) ?? (ts.isIdentifier(inner) ? helpers.get(declarationOf(inner) as ts.Node) : undefined);
      if (helper && fn.params.size === 0) {
        factories.set(fn.decl, helper);
      }
    }
    for (const sf of sources) {
      const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && node.initializer && !helpers.has(node)) {
          const init = unwrap(node.initializer);
          if (ts.isCallExpression(init)) {
            const decl = declarationOf(unwrap(init.expression));
            const helper = decl ? factories.get(decl) : undefined;
            if (helper) {
              addHelper(node, helper);
              changed = true;
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    return changed;
  }

  timing('functions');
  const factories = new Map<ts.Node, Helper>();
  for (let round = 0; round < 6; round += 1) {
    let changed = false;
    for (const fn of functions) {
      if (helpers.has(fn.decl)) continue;
      const helper = deriveHelper(fn);
      if (helper) {
        addHelper(fn.decl, helper);
        changed = true;
      }
    }
    if (deriveFactories()) changed = true;
    if (!changed) break;
  }

  timing('helpers');
  const enclosingHelperParams = (node: ts.Node): Map<string, number> => {
    for (let current = node.parent; current; current = current.parent) {
      const fn = functionByNode.get(current);
      if (fn && helpers.has(fn.decl)) return fn.params;
    }
    return new Map();
  };

  // Identifier index, for finding every reference to a constant or builder.
  const identifiers = new Map<string, ts.Identifier[]>();
  for (const sf of sources) {
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node)) {
        const list = identifiers.get(node.text) ?? [];
        list.push(node);
        identifiers.set(node.text, list);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  const referencesTo = (decl: ts.Node & { name?: ts.Node }): ts.Identifier[] => {
    const name = decl.name && ts.isIdentifier(decl.name) ? decl.name.text : undefined;
    if (!name) return [];
    return (identifiers.get(name) ?? []).filter((id) => id !== decl.name && declarationOf(id) === decl);
  };

  type Use =
    | { kind: 'call'; call: ts.CallExpression | ts.NewExpression; index: number }
    | { kind: 'composed' }
    | { kind: 'link' }
    | { kind: 'inert' }
    | { kind: 'other' };

  const STRING_METHODS = new Set(['startsWith', 'endsWith', 'includes', 'indexOf', 'test', 'match', 'localeCompare', 'has']);

  /** Every place the value of `node` flows to, following constants and builders. */
  function usesOf(node: ts.Expression, depth = 0): Use[] {
    let current: ts.Node = node;
    while (
      ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent)
    ) {
      current = current.parent;
    }
    const parent = current.parent;
    // Import/export bindings and rendered text are not requests.
    if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent)) return [];
    if (ts.isJsxExpression(parent) || ts.isJsxAttribute(parent)) {
      const attribute = ts.isJsxAttribute(parent) ? parent : ts.isJsxAttribute(parent.parent) ? parent.parent : undefined;
      // <a href={url}> / <img src={url}> is a GET the browser sends.
      if (attribute && ['href', 'src'].includes(attribute.name.getText())) return [{ kind: 'link' }];
      return [{ kind: 'inert' }];
    }
    if (ts.isTemplateSpan(parent) || (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
      return [{ kind: 'composed' }];
    }
    if (ts.isBinaryExpression(parent)) return [{ kind: 'inert' }];
    if (ts.isCallExpression(parent) && parent.expression !== current) {
      const callee = unwrap(parent.expression);
      if (ts.isPropertyAccessExpression(callee) && STRING_METHODS.has(callee.name.text)) return [{ kind: 'inert' }];
      return [{ kind: 'call', call: parent, index: parent.arguments.indexOf(current as ts.Expression) }];
    }
    if (ts.isNewExpression(parent)) {
      // `new ApiError(message, status, '/api/...')` labels an error; `new URL(path, base)` is a request URL.
      if (/Error$/.test(parent.expression.getText())) return [{ kind: 'inert' }];
      return [{ kind: 'call', call: parent, index: parent.arguments?.indexOf(current as ts.Expression) ?? -1 }];
    }
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current && STRING_METHODS.has(parent.name.text)) {
      return [{ kind: 'inert' }];
    }
    if (depth >= 4) return [{ kind: 'other' }];
    // const X = <node>: follow every reference to X.
    if (ts.isVariableDeclaration(parent) && parent.initializer === current) {
      if (!(ts.getCombinedNodeFlags(parent) & ts.NodeFlags.Const)) return [{ kind: 'other' }];
      // An exported constant nothing in src reads is not sent anywhere.
      return referencesTo(parent).flatMap((ref) => usesOf(ref, depth + 1));
    }
    // A builder's return value: follow every call to the builder.
    const fnNode = ts.isArrowFunction(parent) ? parent : ts.isReturnStatement(parent) ? parent.parent?.parent : undefined;
    if (fnNode) {
      const owner = ts.isArrowFunction(fnNode) && ts.isVariableDeclaration(fnNode.parent) ? fnNode.parent : fnNode;
      const decl = owner as ts.Node & { name?: ts.Node };
      if (returnedExpression(decl) === current || returnedExpression(decl) === node) {
        const calls = referencesTo(decl)
          .map((ref) => ref.parent)
          .filter((p): p is ts.CallExpression => ts.isCallExpression(p));
        return calls.length ? calls.flatMap((call) => usesOf(call, depth + 1)) : [{ kind: 'other' }];
      }
    }
    return [{ kind: 'other' }];
  }

  timing('index');
  const collected: Collected[] = [];
  const unclassified: Unclassified[] = [];
  const BACKEND_SHAPED = /^\/(api|brain)(\/|$|\?)/;
  const record = (node: ts.Node, rawPath: string, methods: string[], via: string) => {
    collected.push({ file: rel(node), line: lineOf(node), path: rawPath, methods, via });
  };

  for (const sf of sources) {
    for (const node of cachedCandidates(sf)) {
      const params = enclosingHelperParams(node);
      const value = render(node, params);
      if (!value) continue;

      if (value.startsWith(CALYX)) {
        const rawPath = value.slice(CALYX.length);
        // The helper's own `${BASE}${path}` template: its callers are collected.
        if (PARAM_TOKEN.test(rawPath)) continue;
        if (!rawPath.startsWith('/')) continue;
        const uses = usesOf(node);
        // A base such as COMMUNITY_API_BASE that is only ever extended.
        if (uses.every((u) => u.kind === 'composed' || u.kind === 'inert')) continue;
        const calls = uses.filter((u): u is Extract<Use, { kind: 'call' }> => u.kind === 'call');
        const found = calls.flatMap((u) => resolveMethods(u.call, u.index, helperOf(u.call)));
        if (uses.some((u) => u.kind === 'link')) found.push('GET');
        const methods = found.length ? [...new Set(found)].sort() : [UNRESOLVED];
        record(node, rawPath, methods, 'CALYX_BACKEND_BASE_URL + path');
        continue;
      }
      if (value.startsWith(PUBLIC)) continue;
      if (!value.startsWith('/') || PARAM_TOKEN.test(value) || /\s/.test(value)) continue;

      let calyx = false;
      let publicUse = false;
      let request = false;
      for (const use of usesOf(node)) {
        if (use.kind !== 'call') {
          if (use.kind === 'other' || use.kind === 'link') request = true;
          continue;
        }
        const helper = helperOf(use.call);
        if (helper && helper.param === use.index) {
          if (helper.kind === 'public') publicUse = true;
          else {
            calyx = true;
            record(node, helper.prefix + value, resolveMethods(use.call, use.index, helper), `helper ${calleeName(use.call)}()`);
          }
          continue;
        }
        const bases = (use.call.arguments ?? []).map((a) => render(a, new Map()));
        if (bases.includes(CALYX)) {
          calyx = true;
          record(node, value, resolveMethods(use.call, use.index), `${calleeName(use.call)}(CALYX_BACKEND_BASE_URL, path)`);
        } else if (bases.includes(PUBLIC)) publicUse = true;
        else request = true;
      }
      if (!calyx && !publicUse && request && BACKEND_SHAPED.test(value)) {
        unclassified.push({ file: rel(node), line: lineOf(node), path: value });
      }
    }
  }

  timing('collected');
  return { collected, unclassified, helperCount: helpers.size };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const stripQuery = (p: string) => p.replace(/[?#].*$/, '');

function segmentMatches(frontend: string, backend: string): boolean {
  if (/^\{[^}]+\}$/.test(backend)) return frontend.length > 0;
  if (frontend === backend) return true;
  if (!frontend.includes('{}')) return false;
  const pattern = new RegExp(
    '^' + frontend.split('{}').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+') + '$',
  );
  return pattern.test(backend);
}

/**
 * Backend routes a frontend path resolves to. The backend's
 * `OPTIONS /api/<area>/{full_path:path}` CORS preflight catch-alls match
 * everything under their area, so they never count as serving a path.
 */
function routesFor(frontendPath: string): RouteRow[] {
  const target = stripQuery(frontendPath).split('/');
  return snapshot.routes.filter((route) => {
    if (route.methods.every((m) => m === 'OPTIONS')) return false;
    const parts = route.path.split('/');
    for (let i = 0; i < parts.length; i += 1) {
      if (/^\{[^}]+:path\}$/.test(parts[i])) return target.length > i;
      if (i >= target.length || !segmentMatches(target[i], parts[i])) return false;
    }
    return parts.length === target.length;
  });
}

// ---------------------------------------------------------------------------
// Known misses (every entry needs a reason and an owner action)
// ---------------------------------------------------------------------------

/**
 * Paths the frontend sends that the backend snapshot does not serve yet.
 * Keyed by `<file> <path>` with `{}` for dynamic segments.
 */
const KNOWN_MISSES: Record<string, string> = {
  // TODO(backend CRM): the CRM subscribe route lives in unmerged backend draft
  // PRs. Until it lands the backend answers 404, and submitMissionListSignup()
  // reports that as "rejected" (tested below), never as delivered.
  [`src/lib/missionListSignup.ts ${CRM_SUBSCRIBE_PATH}`]: 'CRM backend PRs are unmerged drafts',
  // TODO(backend runner): Mission Control reads GET /api/runner/autonomous-status,
  // which the backend does not mount (only the OPTIONS preflight catch-all
  // under /api/runner matches). getJson() records the failure as an endpoint
  // diagnostic; the owner console shows it unavailable rather than inventing
  // a status. Needs a backend route or a frontend switch to an existing one.
  'src/lib/missionControlOps.ts /api/runner/autonomous-status': 'backend does not mount this route',
};

/**
 * Backend-shaped literals that are not requests the collector can attribute:
 * labels, descriptive metadata, or a base supplied by the caller. Each is
 * reviewed by hand. Keyed like KNOWN_MISSES.
 */
const NOT_ATTRIBUTABLE: Record<string, string> = {
  // The base URL is a caller option (`new URL(PATH, options.baseUrl)`), so the
  // collector cannot tell which service it targets. The path is checked
  // against the snapshot explicitly below.
  'src/lib/control-plane/backendReservePlanClient.ts /api/runner/knowledge-gaps/reserve-plan':
    'caller-supplied base; route asserted separately',
  // Descriptive metadata on harvester rows, not fetched by the frontend.
  'src/lib/missionControlOps.ts /api/harvesters/{}/runs': 'descriptive runHistoryEndpoint field',
  // Public Atlas layer hints (text shown to the reader, public API).
  'src/components/atlas/AtlasLayerToggles.tsx /api/atlas/genus/{genus}/map': 'display hint',
  'src/components/atlas/AtlasLayerToggles.tsx /api/atlas/overlays/pollination': 'display hint',
  'src/components/atlas/AtlasLayerToggles.tsx /api/atlas/overlays/mycorrhizal': 'display hint',
  'src/components/atlas/AtlasLayerToggles.tsx /api/atlas/overlays/climate': 'display hint',
  'src/components/atlas/AtlasLayerToggles.tsx /api/atlas/temporal': 'display hint',
  // Source label rendered on the OACS page.
  'src/pages/OACS.tsx /api/oacs/sites/{id}/snapshot': 'display label',
};

const inventory = collect();

const keyOf = (c: { file: string; path: string }) => `${c.file} ${stripQuery(c.path)}`;

describe('Calyx backend route inventory', () => {
  it('uses exactly one snapshot whose filename SHA matches its content', () => {
    expect(snapshotFiles).toHaveLength(1);
    const [, sha] = SNAPSHOT_NAME.exec(snapshotFile) as RegExpExecArray;
    expect(snapshot.backend_sha).toBe(sha);
    expect(snapshot.schema).toBe('calyx-backend-route-inventory.v1');
    expect(snapshot.backend_branch).toBe('oc-autonomous-integration');
    expect(snapshot.routes).toHaveLength(snapshot.route_count);
    expect(snapshot.routes.length).toBeGreaterThan(100);
  });

  it('collects the Calyx paths the frontend is known to send', () => {
    const paths = new Set(inventory.collected.map((c) => stripQuery(c.path)));
    // One per transport style, so a collector regression cannot pass silently.
    for (const expected of [
      '/brain/missions', // calyxWorkspace missionRequest() helper
      '/api/executive/state', // getJson(CALYX_BACKEND_BASE_URL, path)
      '/api/platform/readiness/homepage', // `${CALYX_BACKEND_BASE_URL}/...`
      '/api/conservatory/readiness', // local API_BASE from VITE_CALYX_API_URL
      '/api/mission-control/owner/session-token/refresh', // constant path
    ]) {
      expect(paths, expected).toContain(expected);
    }
    expect(inventory.collected.length).toBeGreaterThan(100);
  });

  it('never collects public-API service calls', () => {
    const publicOnly = ['/api/species/search', '/api/atlas/historical', '/api/genus/daily', '/api/species/featured'];
    const paths = inventory.collected.map((c) => stripQuery(c.path));
    for (const p of publicOnly) expect(paths, p).not.toContain(p);
    for (const c of inventory.collected) {
      expect(c.file, `${c.path} came from the public API client`).not.toBe('src/lib/api.ts');
      expect(c.file).not.toBe('src/lib/ocBackend.ts');
    }
  });

  it('every collected path is a route the backend mounts, with the method used', () => {
    const problems: string[] = [];
    for (const c of inventory.collected) {
      if (KNOWN_MISSES[keyOf(c)]) continue;
      const routes = routesFor(c.path);
      if (!routes.length) {
        problems.push(`${c.file}:${c.line} ${c.path} — no such backend route (${c.via})`);
        continue;
      }
      const methods = new Set(routes.flatMap((r) => r.methods));
      for (const m of c.methods) {
        if (m === UNRESOLVED) continue;
        if (!methods.has(m)) {
          problems.push(`${c.file}:${c.line} ${m} ${c.path} — backend serves ${[...methods].join('/')} (${c.via})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps the known-miss list honest: each entry is still sent and still missing', () => {
    for (const key of Object.keys(KNOWN_MISSES)) {
      const hits = inventory.collected.filter((c) => keyOf(c) === key);
      expect(hits.length, `${key} is no longer sent; remove it from KNOWN_MISSES`).toBeGreaterThan(0);
      for (const hit of hits) {
        expect(routesFor(hit.path), `${key} is now served; remove it from KNOWN_MISSES`).toEqual([]);
      }
    }
  });

  it('serves the reserve-plan path whose base is supplied by the caller', () => {
    const methods = routesFor(BACKEND_RESERVE_PLAN_PATH).flatMap((r) => r.methods);
    expect(methods).toContain('GET');
  });

  it('leaves no backend-shaped path literal unclassified', () => {
    if (process.env.ROUTE_INVENTORY_DEBUG) {
      console.log(JSON.stringify(inventory, null, 1));
    }
    const unreviewed = inventory.unclassified.filter((u) => !NOT_ATTRIBUTABLE[keyOf(u)]);
    expect(unreviewed.map((u) => `${u.file}:${u.line} ${u.path}`)).toEqual([]);
    for (const key of Object.keys(NOT_ATTRIBUTABLE)) {
      expect(inventory.unclassified.some((u) => keyOf(u) === key), `${key} is gone; remove it`).toBe(true);
    }
  });
});

describe('CRM subscribe while the backend does not mount it', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is absent from the backend snapshot', () => {
    expect(routesFor(CRM_SUBSCRIBE_PATH)).toEqual([]);
  });

  it('reports the backend 404 as rejected, never delivered', async () => {
    // FastAPI answers an unmounted path with JSON 404 {"detail":"Not Found"}.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"detail":"Not Found"}', {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })),
    );
    const outcome = await submitMissionListSignup({ email: 'person@example.org', source: 'contract-test' });
    expect(outcome.kind).toBe('rejected');
  });

  it('reports a network failure as unreachable, never delivered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const outcome = await submitMissionListSignup({ email: 'person@example.org', source: 'contract-test' });
    expect(outcome.kind).toBe('unreachable');
  });
});
