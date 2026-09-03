import "../../../src/styles.css";
import type { ReactElement } from "react";
import type { DerivedAutomaticRoute } from "../../../src/graph-presentation.ts";
import type { ArrowheadGeometry, LabelRect, Point } from "../../../src/viewport.ts";

export type EvaluationNodeLabelText = {
  text: string;
  x: number;
  y: number;
};

export type EvaluationNode = {
  id: string;
  position: Point;
  labelPlacement: LabelRect;
  labelText: EvaluationNodeLabelText;
  descriptionText: readonly EvaluationNodeLabelText[];
  connector?: { x1: number; y1: number; x2: number; y2: number };
};

export type EvaluationRelation = {
  route: Pick<DerivedAutomaticRoute, "id" | "path" | "samples" | "label">;
  lineStyle: "solid" | "dashed" | "dotted";
  arrowheads: readonly ArrowheadGeometry[];
  labelPlacement?: LabelRect;
  labelGroupTransform?: string;
  labelHitRect?: { x: number; y: number; width: number; height: number; rx: number };
};

export type EvaluationRenderInput = {
  nodes: readonly EvaluationNode[];
  relations: readonly EvaluationRelation[];
  viewportTransform: string;
  ariaLabel?: string;
};

/** Evaluation-only static projection of the existing neutral Product graph SVG. */
export function renderEvaluationGraph({
  nodes,
  relations,
  viewportTransform,
  ariaLabel = "Entity relationship graph",
}: EvaluationRenderInput): ReactElement {
  return (
    <svg className="graph" viewBox="0 0 800 500" role="img" aria-label={ariaLabel}>
      <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor" /></marker></defs>
      <g transform={viewportTransform}>
        {relations.map(({ route, lineStyle, arrowheads, labelPlacement, labelGroupTransform = "translate(0 0)", labelHitRect }) => (
          <g key={route.id} className="edge-group" data-relation-id={route.id}>
            <path d={route.path} className="edge-halo" />
            <path d={route.path} className={`edge line-style-${lineStyle}`} />
            {arrowheads.map((arrowhead, index) => <polygon
              key={`${route.id}-arrowhead-${index}`}
              className="edge-arrowhead"
              points={`${arrowhead.baseA.x},${arrowhead.baseA.y} ${arrowhead.baseB.x},${arrowhead.baseB.y} ${arrowhead.tip.x},${arrowhead.tip.y}`}
            />)}
          </g>
        ))}
        {relations.map(({ route, labelPlacement, labelGroupTransform = "translate(0 0)", labelHitRect }) => {
          if (!route.label || !labelPlacement) return null;
          return <g key={`label-${route.id}`} className="edge-label-group" data-relation-id={route.id} transform={labelGroupTransform}>
            <g transform={`translate(${labelPlacement.x} ${labelPlacement.y})`}>
              {labelHitRect && <rect className="label-drag-hit" {...labelHitRect} />}
              <text className="edge-label" x="0" y="-5" aria-hidden="true">{route.label}</text>
            </g>
          </g>;
        })}
        {nodes.map(({ id, position, labelPlacement, labelText, descriptionText, connector }) => {
          const offsetX = labelPlacement.x - position.x;
          const offsetY = labelPlacement.y - position.y;
          return <g key={id} className="node" data-entity-id={id} transform={`translate(${position.x} ${position.y})`}>
            <rect className="entity-body" x="-32" y="-32" width="64" height="64" rx="12" />
            <g className="node-label-group" data-entity-id={id}>
              {connector && <line className="node-label-connector" {...connector} />}
              <rect
                className="label-drag-hit"
                x={offsetX - labelPlacement.width / 2}
                y={offsetY - labelPlacement.height / 2}
                width={labelPlacement.width}
                height={labelPlacement.height}
                rx="3"
              />
              <text className="node-label" textAnchor="middle" x={labelText.x} y={labelText.y}>{labelText.text}</text>
              {descriptionText.map(({ text, x, y }, index) => <text key={`description-${index}`} className="node-description" textAnchor="middle" x={x} y={y}>{text}</text>)}
            </g>
          </g>;
        })}
      </g>
    </svg>
  );
}
