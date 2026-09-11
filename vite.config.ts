// @ts-nocheck -- this file is a Node-only Vite dev-server configuration; the app has no Node runtime dependency.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { ACCEPTANCE_FIXTURE_ENDPOINT } from "./src/acceptance-fixture-access.ts";

const canonicalExamples = path.resolve(process.cwd(), "..", "e2r-spec", "examples");
const canonicalFixtureFiles = {
  titanic: "titanic-final-voyage",
  "apollo-11": "apollo-11-mission",
  lighthouse: "lighthouse-restoration-demo",
};

export default defineConfig({
  base: "/e2r-liaison-scape/",
  plugins: [react(), {
    name: "dev-only-canonical-acceptance-fixtures",
    configureServer(server) {
      server.middlewares.use(`/e2r-liaison-scape${ACCEPTANCE_FIXTURE_ENDPOINT}`, (request, response, next) => {
        const match = /^\/(titanic|apollo-11|lighthouse)\.(en|ja)\.e2r\.json$/.exec(request.url ?? "");
        if (!match || request.method !== "GET") return next();
        const filePath = path.join(canonicalExamples, `${canonicalFixtureFiles[match[1]]}.${match[2]}.e2r.json`);
        if (!fs.existsSync(filePath)) { response.statusCode = 404; response.end("Not found"); return; }
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(fs.readFileSync(filePath));
      });
    },
  }],
});
