import { createRoot } from "react-dom/client";
import { renderEvaluationGraph } from "../render-wrapper1/render-wrapper.tsx";
import smokePresentation from "./smoke-fixture.ts";

const root = document.getElementById("evaluation-root");
if (!root) throw new Error("Missing #evaluation-root host");

createRoot(root).render(renderEvaluationGraph(smokePresentation));
