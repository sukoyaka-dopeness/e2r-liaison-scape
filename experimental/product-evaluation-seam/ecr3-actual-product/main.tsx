import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App, { type ActualProductDiagnosticInitialLayout } from "../../../src/App";
import "../../../src/styles.css";
import "./review.css";

type Fixture = "lighthouse" | "titanic" | "apollo-11";
type Locale = "en" | "ja";
type Arm = "current" | "full-post" | "adaptive-post" | "global-placement3" | "frontier-12" | "parallel-pair-16" | "parallel-bundle-16";
const fixtures: readonly Fixture[] = ["lighthouse", "titanic", "apollo-11"];
const locales: readonly Locale[] = ["en", "ja"];
const arms: readonly Arm[] = ["current", "full-post", "adaptive-post", "global-placement3", "frontier-12", "parallel-pair-16", "parallel-bundle-16"];

function queryValue<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = new URLSearchParams(window.location.search).get(name) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

const initialFixture = queryValue("fixture", fixtures, "lighthouse");
const initialLocale = queryValue("locale", locales, "en");
const initialParams = new URLSearchParams(window.location.search);
initialParams.set("acceptance-fixture", initialFixture);
initialParams.set("acceptance-locale", initialLocale);
window.history.replaceState({ ecr3Review: true }, "", `${window.location.pathname}?${initialParams.toString()}${window.location.hash}`);

function ReviewSurface() {
  const fixture = queryValue("fixture", fixtures, "lighthouse");
  const locale = queryValue("locale", locales, "en");
  const arm = queryValue("arm", arms, "current");
  const [override, setOverride] = useState<ActualProductDiagnosticInitialLayout | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (arm === "current") return;
    // The presentation-only arms reuse the G3 coordinates and exercise the
    // same normal Product open path; only their optional route-slot policy
    // differs. They must not ask the layout endpoint for a new provider arm.
    const layoutArm = arm === "parallel-pair-16" || arm === "parallel-bundle-16"
      ? "global-placement3"
      : arm;
    const endpoint = `${import.meta.env.BASE_URL}__acceptance-layouts?fixture=${encodeURIComponent(fixture)}&locale=${encodeURIComponent(locale)}&arm=${encodeURIComponent(layoutArm)}`;
    void fetch(endpoint)
      .then((response) => { if (!response.ok) throw new Error(`ECR3 candidate request failed: ${response.status}`); return response.json(); })
      .then((result: { positions?: Record<string, { x: number; y: number }> }) => {
        if (!result.positions) throw new Error("ECR3 candidate positions missing");
        setOverride({ positions: result.positions, arm });
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "ECR3 candidate request failed"));
  }, [arm, fixture, locale]);

  function switchReview(next: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    params.set(next, value);
    window.location.href = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  }

  if (error) return <main className="ecr3-review-error"><h1>Initial Layout Actual Product review unavailable</h1><p>{error}</p></main>;
  if (arm !== "current" && !override) return <main className="ecr3-review-loading"><h1>Preparing ECR3 Actual Product review</h1><p>Generating the selected candidate from the canonical fixture…</p></main>;
  const parallelBundleVariant = arm === "parallel-pair-16" ? "pair-16" : arm === "parallel-bundle-16" ? "bundle-16" : undefined;
  return <>
    <div className="ecr3-review-banner" aria-label="Initial Layout Actual Product review controls">
      <strong>Initial Layout Actual Product human review</strong>
      <label>Fixture <select value={fixture} onChange={(event) => switchReview("fixture", event.target.value)}>{fixtures.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Locale <select value={locale} onChange={(event) => switchReview("locale", event.target.value)}>{locales.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
      <label>Arm <select value={arm} onChange={(event) => switchReview("arm", event.target.value)}>{arms.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <span data-review-arm={arm}>Active arm: {arm}</span>
      <span>Canonical Dataset → normal App open / routing / labels / fit / interaction</span>
    </div>
    <App initialLayoutOverride={override} parallelBundleVariant={parallelBundleVariant} />
  </>;
}

createRoot(document.getElementById("root")!).render(<ReviewSurface />);
