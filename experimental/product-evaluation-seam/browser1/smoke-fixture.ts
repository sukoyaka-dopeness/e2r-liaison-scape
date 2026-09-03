import type { EvaluationRenderInput } from "../render-wrapper1/render-wrapper.tsx";

const smokePresentation: EvaluationRenderInput = {
  viewportTransform: "translate(400 250) scale(1) translate(-400 -250)",
  ariaLabel: "Neutral evaluation graph",
  relations: [
    {
      route: {
        id: "smoke-relation",
        path: "M 220 250 L 580 250",
        samples: [{ x: 220, y: 250 }, { x: 580, y: 250 }],
        label: "connects",
      },
      lineStyle: "solid",
      arrowheads: [{ tip: { x: 580, y: 250 }, baseA: { x: 568, y: 244 }, baseB: { x: 568, y: 256 } }],
      labelPlacement: { x: 400, y: 250, width: 72, height: 22, directionX: 1, directionY: 0 },
      labelHitRect: { x: -36, y: -18, width: 72, height: 22, rx: 3 },
    },
  ],
  nodes: [
    {
      id: "smoke-left",
      position: { x: 220, y: 250 },
      labelPlacement: { x: 220, y: 320, width: 80, height: 20, directionX: 0, directionY: 1 },
      labelText: { text: "Left", x: 0, y: 4 },
      descriptionText: [{ text: "Node", x: 0, y: 14 }],
      connector: { x1: 0, y1: 33, x2: 0, y2: 60 },
    },
    {
      id: "smoke-right",
      position: { x: 580, y: 250 },
      labelPlacement: { x: 580, y: 180, width: 88, height: 20, directionX: 0, directionY: -1 },
      labelText: { text: "Right", x: 0, y: 4 },
      descriptionText: [],
    },
  ],
};

export default smokePresentation;
