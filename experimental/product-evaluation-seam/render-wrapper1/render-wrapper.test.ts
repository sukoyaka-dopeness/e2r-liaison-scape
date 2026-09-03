import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test, { after, before } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";
import type { EvaluationRenderInput } from "./render-wrapper.tsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const cssSource = readFileSync(path.join(root, "src/styles.css"), "utf8");
const wrapperSource = readFileSync(path.join(root, "experimental/product-evaluation-seam/render-wrapper1/render-wrapper.tsx"), "utf8");
const cssBlob = execFileSync("git", ["-c", `safe.directory=${root}`, "rev-parse", "HEAD:src/styles.css"], { cwd: root, encoding: "utf8" }).trim();
const canonicalCssSha256 = (source: string): string => createHash("sha256").update(source.replace(/\r\n?/g, "\n"), "utf8").digest("hex").toUpperCase();
const canonicalCssDigest = "9955A690FDC38064309F1391BA62FA5D5F044B677ED44799555FAB583F6490BF";
const productCssBlob = "ae41e48b34d72067d92517a5d42a57a4cc1d409f";

const arrow = { tip: { x: 160, y: 0 }, baseA: { x: 151, y: -4 }, baseB: { x: 151, y: 4 } };
const presentation: EvaluationRenderInput = {
  viewportTransform: "translate(400 250) scale(1) translate(-400 -250)",
  ariaLabel: "Representative entity relationship graph",
  relations: [
    { route: { id: "ordinary", path: "M 100 100 L 300 100", samples: [{ x: 100, y: 100 }, { x: 300, y: 100 }], label: "ordinary" }, lineStyle: "solid", arrowheads: [arrow], labelPlacement: { x: 200, y: 100, width: 64, height: 22, directionX: 1, directionY: 0 }, labelHitRect: { x: -32, y: -18, width: 64, height: 22, rx: 3 } },
    { route: { id: "parallel", path: "M 100 100 Q 200 40 300 100", samples: [{ x: 100, y: 100 }, { x: 200, y: 40 }, { x: 300, y: 100 }], label: "parallel" }, lineStyle: "dashed", arrowheads: [], labelPlacement: { x: 200, y: 55, width: 64, height: 22, directionX: 0, directionY: -1 }, labelHitRect: { x: -32, y: -18, width: 64, height: 22, rx: 3 } },
  ],
  nodes: [
    { id: "a", position: { x: 100, y: 100 }, labelPlacement: { x: 100, y: 170, width: 64, height: 20, directionX: 0, directionY: 1 }, labelText: { text: "Alpha", x: 0, y: 4 }, descriptionText: [{ text: "First", x: 0, y: 12 }], connector: { x1: 0, y1: 33, x2: 0, y2: 60 } },
    { id: "b", position: { x: 300, y: 100 }, labelPlacement: { x: 300, y: 50, width: 64, height: 20, directionX: 0, directionY: -1 }, labelText: { text: "Beta", x: 0, y: 4 }, descriptionText: [] },
  ],
};

let server: ViteDevServer;
let renderEvaluationGraph: typeof import("./render-wrapper.tsx").renderEvaluationGraph;

before(async () => {
  server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  ({ renderEvaluationGraph } = await server.ssrLoadModule("/experimental/product-evaluation-seam/render-wrapper1/render-wrapper.tsx"));
});

after(async () => { await server.close(); });

function markup(input: EvaluationRenderInput = presentation): string {
  return renderToStaticMarkup(renderEvaluationGraph(input));
}

test("F-R1 deterministic render", () => assert.equal(markup(), markup()));

test("F-R2 Node geometry appears in SVG attributes", () => {
  const output = markup();
  assert.match(output, /class="node" data-entity-id="a" transform="translate\(100 100\)"/);
  assert.match(output, /class="entity-body" x="-32" y="-32" width="64" height="64" rx="12"/);
});

test("F-R3 Relation path geometry is exact", () => assert.match(markup(), /d="M 100 100 L 300 100" class="edge-halo"/));

test("F-R4 Node-label geometry is exact", () => {
  const output = markup();
  assert.match(output, /class="node-label" text-anchor="middle" x="0" y="4">Alpha<\/text>/);
  assert.match(output, /class="label-drag-hit" x="-32" y="60" width="64" height="20" rx="3"/);
});

test("F-R5 Relation-label geometry is exact", () => {
  const output = markup();
  assert.match(output, /class="edge-label-group" data-relation-id="ordinary" transform="translate\(0 0\)"/);
  assert.match(output, /<g transform="translate\(200 100\)"><rect class="label-drag-hit"/);
});

test("F-R6 connector markup follows the neutral input", () => {
  const output = markup();
  assert.match(output, /class="node-label-connector" x1="0" y1="33" x2="0" y2="60"/);
  assert.equal((output.match(/node-label-connector/g) ?? []).length, 1);
});

test("F-R7 Product presentation ordering is preserved", () => {
  const output = markup();
  assert.ok(output.indexOf("data-relation-id=\"ordinary\"") < output.indexOf("data-relation-id=\"parallel\""));
  assert.ok(output.indexOf("data-entity-id=\"a\"") < output.indexOf("data-entity-id=\"b\""));
});

test("F-R8 viewport transform is preserved", () => assert.match(markup(), /<g transform="translate\(400 250\) scale\(1\) translate\(-400 -250\)">/));

test("F-R9 neutral wrapper has no selection or interaction-only visible layers", () => {
  const output = markup();
  assert.doesNotMatch(output, /selected|handle-visible|edge-hit-area|connection-handle|relation-creation-preview/);
});

test("F-R10 wrapper does not mutate its input", () => {
  const input = structuredClone(presentation);
  const before = structuredClone(input);
  markup(input);
  assert.deepEqual(input, before);
});

test("F-R11 current Product class names and CSS authority are used", async () => {
  const output = markup();
  for (const className of ["graph", "edge-group", "edge-halo", "edge", "edge-arrowhead", "edge-label-group", "edge-label", "node", "entity-body", "node-label-group", "node-label", "node-description", "node-label-connector", "label-drag-hit"]) assert.match(output, new RegExp(`class=\"[^\"]*${className}`));
  assert.match(cssSource, /\.graph\s*\{/);
  assert.match(cssSource, /\.edge-label\s*\{/);
  assert.match(cssSource, /\.node-label-connector\s*\{/);
  assert.match(wrapperSource, /import "\.\.\/\.\.\/\.\.\/src\/styles\.css";/);
  assert.equal(cssBlob, productCssBlob);
  assert.equal(canonicalCssSha256(cssSource), canonicalCssDigest);
});

test("F-R12 APP-RENDER-EQUIVALENCE-v1 representative structural proof", () => {
  const output = markup();
  for (const sourceToken of [
    'className="graph"',
    'viewBox="0 0 800 500"',
    '<defs><marker id="arrow"',
    'className="edge-halo"',
    'className="edge-hit-area"',
    'className="edge-label-group"',
    'className="edge-label"',
    'className="entity-body"',
    'className="node-label-group"',
    'className="node-label-connector"',
    'className="node-label"',
    'className="node-description"',
    'centeredViewportTransform(scale, pan, 800, 500)',
  ]) assert.ok(appSource.includes(sourceToken), `App authority missing ${sourceToken}`);
  for (const renderedToken of [
    'class="graph" viewBox="0 0 800 500" role="img"',
    '<defs><marker id="arrow"',
    'class="edge-halo"',
    'class="edge-label-group"',
    'class="edge-label"',
    'class="entity-body"',
    'class="node-label-group"',
    'class="node-label-connector"',
    'class="node-label"',
    'class="node-description"',
  ]) assert.ok(output.includes(renderedToken), `wrapper projection missing ${renderedToken}`);
});

test("F-R13 PRODUCT-CSS-PROVENANCE-v1 is EOL-portable and rejects content drift", () => {
  const lf = ".graph {\n  color: red;\n}\n";
  const crlf = lf.replace(/\n/g, "\r\n");
  assert.equal(canonicalCssSha256(lf), canonicalCssSha256(crlf));
  assert.notEqual(canonicalCssSha256(lf), canonicalCssSha256(lf.replace("red", "blue")));
});
