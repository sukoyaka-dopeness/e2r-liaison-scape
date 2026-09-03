import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../../../");
const browserRoot = path.join(root, "experimental/product-evaluation-seam/browser1");
const normalEntry = path.join(root, "src/main.tsx");
const evaluationEntry = path.join(browserRoot, "main.tsx");
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

function resolveLocalImport(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const requested = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [requested];
  if (!path.extname(requested)) {
    for (const extension of sourceExtensions) candidates.push(`${requested}${extension}`);
    for (const extension of sourceExtensions) candidates.push(path.join(requested, `index${extension}`));
  }
  return candidates.find((candidate) => sourceExtensions.includes(path.extname(candidate)) && existsSync(candidate));
}

function importedSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const specifiers: string[] = [];
  const addLiteral = (node: ts.Node | undefined): void => {
    if (node && ts.isStringLiteral(node)) specifiers.push(node.text);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) addLiteral(node.moduleSpecifier);
    if (ts.isExportDeclaration(node) && !node.isTypeOnly) addLiteral(node.moduleSpecifier);
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) addLiteral(node.arguments[0]);
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") addLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function reachableLocalSources(entry: string): Set<string> {
  const reached = new Set<string>();
  const visit = (file: string): void => {
    const normalized = path.normalize(file);
    if (reached.has(normalized)) return;
    reached.add(normalized);
    for (const specifier of importedSpecifiers(normalized)) {
      const target = resolveLocalImport(normalized, specifier);
      if (target) visit(target);
    }
  };
  visit(entry);
  return reached;
}

function relativeSources(files: Set<string>): string[] {
  return [...files].map((file) => path.relative(root, file).replaceAll("\\", "/")).sort();
}

function canonicalCssSha256(source: string): string {
  return createHash("sha256").update(source.replace(/\r\n?/g, "\n"), "utf8").digest("hex").toUpperCase();
}

const normalSources = reachableLocalSources(normalEntry);
const evaluationSources = reachableLocalSources(evaluationEntry);
const normalRelativeSources = relativeSources(normalSources);
const evaluationRelativeSources = relativeSources(evaluationSources);
const evaluationMainSource = readFileSync(evaluationEntry, "utf8");
const browserHtml = readFileSync(path.join(browserRoot, "index.html"), "utf8");
const smokeSource = readFileSync(path.join(browserRoot, "smoke-fixture.ts"), "utf8");

test("G1/G2/G3 normal Product graph cannot reach experimental evaluation code", () => {
  assert.ok(normalSources.has(normalEntry));
  assert.ok(normalRelativeSources.every((file) => !file.startsWith("experimental/product-evaluation-seam/")));
  assert.ok(!normalRelativeSources.some((file) => file.includes("render-wrapper1")));
  assert.ok(!normalRelativeSources.some((file) => file.includes("browser1")));
});

test("G4 evaluation entry reaches the accepted render wrapper", () => {
  assert.ok(evaluationRelativeSources.includes("experimental/product-evaluation-seam/render-wrapper1/render-wrapper.tsx"));
});

test("G5/G6/G7 evaluation graph excludes App, materializer, and candidate code", () => {
  assert.ok(!evaluationRelativeSources.includes("src/App.tsx"));
  assert.ok(!evaluationRelativeSources.includes("src/main.tsx"));
  assert.ok(!evaluationRelativeSources.some((file) => /DatasetService|persistence|materializer|candidate|TA0|TA2|TA3|FP1|cdp/i.test(file)));
});

test("G8 browser document exposes only the expected evaluation root host", () => {
  assert.match(browserHtml, /<div id="evaluation-root"><\/div>/);
  assert.match(evaluationMainSource, /getElementById\("evaluation-root"\)/);
});

test("G9/G10 browser entry uses only a neutral fixture and derives no geometry", () => {
  assert.match(evaluationMainSource, /from "\.\/smoke-fixture\.ts"/);
  assert.doesNotMatch(smokeSource, /buildNormalizedLayoutGraph|solveAutoLayout|settleNormalizedLayoutFromInitialPositions|deriveAutomaticRoutes|deriveAutomaticNodeLabels|deriveAutomaticRelationLabels|placeNodeLabel|placeEdgeLabel|routeGraphEdge/);
  assert.doesNotMatch(evaluationMainSource, /materializer|candidate|TA0|TA2|TA3|FP1/);
});

test("G11 Product CSS provenance remains valid", () => {
  const css = readFileSync(path.join(root, "src/styles.css"), "utf8");
  const cssBlob = execFileSync("git", ["-c", `safe.directory=${root}`, "rev-parse", "HEAD:src/styles.css"], { cwd: root, encoding: "utf8" }).trim();
  assert.equal(cssBlob, "ae41e48b34d72067d92517a5d42a57a4cc1d409f");
  assert.equal(canonicalCssSha256(css), "9955A690FDC38064309F1391BA62FA5D5F044B677ED44799555FAB583F6490BF");
});

test("G12 evaluation source is deterministic enough for repeated builds", () => {
  assert.doesNotMatch(evaluationMainSource, /Math\.random|Date\.now/);
  assert.doesNotMatch(smokeSource, /Math\.random|Date\.now/);
  const sourceDigest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
  assert.equal(sourceDigest(evaluationEntry), sourceDigest(evaluationEntry));
  assert.equal(sourceDigest(path.join(browserRoot, "smoke-fixture.ts")), sourceDigest(path.join(browserRoot, "smoke-fixture.ts")));
});
