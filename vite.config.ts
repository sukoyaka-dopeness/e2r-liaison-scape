// @ts-nocheck -- this file is a Node-only Vite dev-server configuration; the app has no Node runtime dependency.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ACCEPTANCE_FIXTURE_ENDPOINT } from "./src/acceptance-fixture-access.ts";

const canonicalExamples = path.resolve(process.cwd(), "..", "e2r-spec", "examples");
const berlinExamples = path.resolve(process.cwd(), "..", "e2r-narrative-line", "src", "sample");
const canonicalFixtureFiles = {
  titanic: "titanic-final-voyage",
  "apollo-11": "apollo-11-mission",
  lighthouse: "lighthouse-restoration-demo",
  "ashen-crown": "ashen-crown",
};
const diagnosticFixtureFiles = {
  "reference-regression": "reference-layout-regression.reference",
  "reference-regression-no-coordinates": "reference-layout-regression.no-coordinates",
};
const ecr3Arms = new Set(["full-post", "adaptive-post", "global-placement3", "frontier-12"]);

function runEcr3Search(fixturePath: string, arm: string): Promise<Record<string, { x: number; y: number }>> {
  const armEnvironment = arm === "adaptive-post" ? {
    E2R_RELAXATION_PRIORITIZATION: "adaptive-cheap-ranking",
    E2R_RELAXATION_ADAPTIVE_MARGIN: "0.10",
  } : arm === "global-placement3" ? {
    E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_GLOBAL_SPACING_STAGE2: "off",
    E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once",
  } : arm === "frontier-12" ? {
    E2R_GLOBAL_PLACEMENT_ABLATION: "frontier-12",
    E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic",
    E2R_GLOBAL_SPACING_SCALE: "0.88",
    E2R_GLOBAL_SPACING_Y: "1.12",
    E2R_GLOBAL_SPACING_STAGE2: "off",
    E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once",
  } : {};
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(process.cwd(), "tools/generic-crossing-search.mjs"), fixturePath], {
      cwd: process.cwd(),
      env: { ...process.env, E2R_PRESENTATION_FINALIST_LIMIT: "2", E2R_RELAXATION_STEP_MODE: "omit-fine", E2R_PRESENTATION_GEOMETRY_CACHE: "1", E2R_PRESENTATION_EXACT_CANDIDATE_REUSE: "1", ...armEnvironment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) { reject(new Error(`ECR3 search failed: ${stderr || `exit ${code}`}`)); return; }
      try {
        const result = JSON.parse(stdout);
        if (!result.selected?.positions || typeof result.selected.positions !== "object") throw new Error("selected positions missing");
        resolve(result.selected.positions);
      } catch (error) { reject(error); }
    });
  });
}

export default defineConfig({
  base: "/e2r-liaison-scape/",
  plugins: [react(), {
    name: "dev-only-canonical-acceptance-fixtures",
    configureServer(server) {
      server.middlewares.use(`/e2r-liaison-scape${ACCEPTANCE_FIXTURE_ENDPOINT}`, (request, response, next) => {
        const match = /^\/(titanic|apollo-11|lighthouse|ashen-crown|reference-regression|reference-regression-no-coordinates)\.(en|ja)\.e2r\.json$/.exec(request.url ?? "");
        if (!match || request.method !== "GET") return next();
        const fixtureBase = match[1] in diagnosticFixtureFiles
          ? path.resolve(process.cwd(), "experimental", "explicit-auto-layout-reference-placement-regression-fixture1", "fixtures", diagnosticFixtureFiles[match[1] as keyof typeof diagnosticFixtureFiles])
          : path.join(canonicalExamples, `${canonicalFixtureFiles[match[1] as keyof typeof canonicalFixtureFiles]}.${match[2]}.e2r.json`);
        const filePath = `${fixtureBase}.${match[2]}.e2r.json`;
        if (!fs.existsSync(filePath)) { response.statusCode = 404; response.end("Not found"); return; }
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(fs.readFileSync(filePath));
      });
      server.middlewares.use("/e2r-liaison-scape/__frontier-sweep-fixtures", (request, response, next) => {
        const match = /^\/berlin-wall-history\.(en|ja)\.e2r\.json$/.exec(request.url ?? "");
        if (!match || request.method !== "GET") return next();
        const filePath = path.join(berlinExamples, `berlin-wall-history.${match[1]}.e2r.json`);
        if (!fs.existsSync(filePath)) { response.statusCode = 404; response.end("Not found"); return; }
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(fs.readFileSync(filePath));
      });
      server.middlewares.use("/e2r-liaison-scape/__acceptance-layouts", async (request, response, next) => {
        const url = new URL(request.url ?? "", "http://localhost");
        const fixture = url.searchParams.get("fixture");
        const locale = url.searchParams.get("locale");
        const arm = url.searchParams.get("arm");
        if (request.method !== "GET" || !(fixture && fixture in canonicalFixtureFiles) || !(locale === "en" || locale === "ja") || !arm || !ecr3Arms.has(arm)) { next(); return; }
        try {
          const fixturePath = path.join(canonicalExamples, `${canonicalFixtureFiles[fixture as keyof typeof canonicalFixtureFiles]}.${locale}.e2r.json`);
          const positions = await runEcr3Search(fixturePath, arm);
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ fixture, locale, arm, positions }));
        } catch (error) {
          response.statusCode = 500;
          response.end(error instanceof Error ? error.message : "ECR3 search failed");
        }
      });
    },
  }],
});
