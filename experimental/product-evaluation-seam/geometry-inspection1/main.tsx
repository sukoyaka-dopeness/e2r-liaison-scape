import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App";
import { buildEntityGraph } from "../../../src/dataset";
import { solveAutoLayout } from "../../../src/auto-layout";
import { generateBoundedCoarseCandidate } from "../../../src/initial-layout-coarse-objective";
import "../../../src/styles.css";
import "./main.css";

const diagnosticDatasetUrl = "https://diagnostic.liaisonscape.invalid/apollo-11-product-inspection.en.e2r.json";
const inspectionUrl = new URL(window.location.href);
const fixtureKind = inspectionUrl.searchParams.get("fixture") ?? "apollo";
const requestedLocale = inspectionUrl.searchParams.get("locale");
const inspectionLocale = requestedLocale === "ja" ? "ja" : "en";
if (requestedLocale === "en" || requestedLocale === "ja") window.localStorage.setItem("liaisonscape.locale", requestedLocale);
const isApolloPublic = fixtureKind === "apollo-public";
type SupportedFixture = "apollo" | "linkscape" | "lighthouse" | "berlin-wall" | "ashen-crown" | "titanic";
const supportedFixtures = new Set<SupportedFixture>(["apollo", "linkscape", "lighthouse", "berlin-wall", "ashen-crown", "titanic"]);
const selectedFixtureKind: SupportedFixture = supportedFixtures.has(fixtureKind as SupportedFixture) ? fixtureKind as SupportedFixture : "apollo";
const fixtureUrl = isApolloPublic
  ? `http://127.0.0.1:4180/apollo-11-mission.${inspectionLocale}.e2r.json`
  : selectedFixtureKind === "linkscape"
  ? `${import.meta.env.BASE_URL}examples/linkscape-relation-sample.e2r.json`
  : selectedFixtureKind === "lighthouse"
    ? `http://127.0.0.1:4180/lighthouse-restoration-demo.${inspectionLocale}.e2r.json`
    : selectedFixtureKind === "berlin-wall"
      ? `http://127.0.0.1:4180/berlin-wall-history.${inspectionLocale}.e2r.json`
      : selectedFixtureKind === "ashen-crown"
        ? `http://127.0.0.1:4180/ashen-crown.${inspectionLocale}.e2r.json`
        : selectedFixtureKind === "titanic"
          ? `http://127.0.0.1:4180/titanic-final-voyage.${inspectionLocale}.e2r.json`
          : `${import.meta.env.BASE_URL}experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-220.en.e2r.json`;
const localSearchPositions = {
  armstrong: { x: 31.342, y: 373.958 },
  aldrin: { x: 222.011, y: 508.891 },
  collins: { x: -42.185, y: 159.000 },
  nasa: { x: 167.263, y: 316.949 },
  columbia: { x: 172.797, y: 73.267 },
  eagle: { x: 359.027, y: 191.533 },
  "saturn-v": { x: 11.156, y: -25.818 },
  moon: { x: 380.534, y: -64.622 },
  hornet: { x: 156.701, y: -168.251 },
};
const targetedLocalCorridorPositions = {
  armstrong: { x: -59.717, y: 357.208 },
  aldrin: { x: 222.011, y: 508.891 },
  collins: { x: -42.185, y: 159.000 },
  nasa: { x: 145.196, y: 337.480 },
  columbia: { x: 172.797, y: 73.267 },
  eagle: { x: 327.422, y: 158.709 },
  "saturn-v": { x: 11.156, y: -25.818 },
  moon: { x: 380.534, y: -64.622 },
  hornet: { x: 156.701, y: -168.251 },
};
const crossingAwarePositions = {
  armstrong: { x: 81.52195178196578, y: 353.2847031633761 },
  aldrin: { x: 259.7062286929358, y: 430.1699006272331 },
  collins: { x: 76.32957767356187, y: 138.12092444915325 },
  nasa: { x: 130.49487076849863, y: 312.98512095043066 },
  columbia: { x: 221.9353670498617, y: 119.05140035670064 },
  eagle: { x: 343.39085336332016, y: 262.924370141413 },
  "saturn-v": { x: -31.796044546104158, y: -3.1044108905196204 },
  moon: { x: 359.18434549022095, y: -92.58917084520496 },
  hornet: { x: 92.39689847726747, y: -114.41400735836851 },
};
const labelAccommodationAwarePositions = {
  armstrong: { x: -16.800818856626748, y: 401.9538301018924 },
  aldrin: { x: 222.011, y: 508.891 },
  collins: { x: -42.185, y: 159 },
  nasa: { x: 200.31500974535382, y: 456.76359694681133 },
  columbia: { x: 172.797, y: 73.267 },
  eagle: { x: 373.4656226719991, y: 216.58198437142744 },
  "saturn-v": { x: 11.156, y: -25.818 },
  moon: { x: 380.534, y: -64.622 },
  hornet: { x: 156.701, y: -168.251 },
};
const presentationAwareRelaxationPositions = {
  armstrong: { x: -5.716999999999999, y: 423.208 },
  aldrin: { x: 222.011, y: 508.891 },
  collins: { x: 17.814999999999998, y: 183 },
  nasa: { x: 127.196, y: 343.48 },
  columbia: { x: 160.797, y: 61.266999999999996 },
  eagle: { x: 315.422, y: 170.709 },
  "saturn-v": { x: 35.156, y: -1.8180000000000014 },
  moon: { x: 332.534, y: -40.622 },
  hornet: { x: 156.701, y: -138.251 },
};
const topologyAwareRelaxationPositions = {
  armstrong: { x: -17.717, y: 357.208 },
  aldrin: { x: 216.011, y: 472.891 },
  collins: { x: -0.18500000000000022, y: 189 },
  nasa: { x: 151.196, y: 331.48 },
  columbia: { x: 160.797, y: 97.267 },
  eagle: { x: 303.422, y: 182.709 },
  "saturn-v": { x: 35.156, y: -1.8180000000000014 },
  moon: { x: 368.534, y: -58.622 },
  hornet: { x: 156.701, y: -108.251 },
};
const labelLengthAwarePositions = {
  armstrong: { x: -152.717, y: 363.208 },
  aldrin: { x: 261.011, y: 595.891 },
  collins: { x: -135.185, y: 141 },
  nasa: { x: 238.196, y: 322.48 },
  columbia: { x: 139.797, y: 136.267 },
  eagle: { x: 327.422, y: 158.709 },
  "saturn-v": { x: 5.156, y: -52.818 },
  moon: { x: 401.534, y: -151.622 },
  hornet: { x: 183.701, y: -255.251 },
};
const horizontalCanvasAwarePositions = {
  armstrong: { x: -116.717, y: 312.208 },
  aldrin: { x: 204.011, y: 490.891 },
  collins: { x: -6.185, y: 177 },
  nasa: { x: 145.196, y: 337.48 },
  columbia: { x: 151.797, y: 31.267 },
  eagle: { x: 321.422, y: 164.709 },
  "saturn-v": { x: 11.156, y: -25.818 },
  moon: { x: 452.534, y: -37.622 },
  hornet: { x: 174.701, y: -96.251 },
};
const balancedEdgeLengthPositions = {
  armstrong: { x: -116.717, y: 312.208 },
  aldrin: { x: 204.011, y: 490.891 },
  collins: { x: -102.185, y: 153 },
  nasa: { x: 139.196, y: 325.48 },
  columbia: { x: 145.797, y: 55.267 },
  eagle: { x: 336.422, y: 158.709 },
  "saturn-v": { x: -33.844, y: -43.818 },
  moon: { x: 407.534, y: -64.622 },
  hornet: { x: 156.701, y: -87.251 },
};
const safeVerticalCompactionPositions = {
  armstrong: { x: -116.717, y: 294.208 },
  aldrin: { x: 204.011, y: 475.891 },
  collins: { x: -102.185, y: 126 },
  nasa: { x: 139.196, y: 325.48 },
  columbia: { x: 145.797, y: 64.267 },
  eagle: { x: 336.422, y: 167.709 },
  "saturn-v": { x: -33.844, y: -43.818 },
  moon: { x: 407.534, y: -64.622 },
  hornet: { x: 156.701, y: -60.251 },
};
const crossingAfterCompactionPositions = {
  armstrong: { x: -104.717, y: 300.208 },
  aldrin: { x: 204.011, y: 475.891 },
  collins: { x: -108.185, y: 114 },
  nasa: { x: 139.196, y: 325.48 },
  columbia: { x: 151.797, y: 58.267 },
  eagle: { x: 336.422, y: 167.709 },
  "saturn-v": { x: -33.844, y: -43.818 },
  moon: { x: 407.534, y: -52.622 },
  hornet: { x: 168.701, y: -48.251 },
};
const globalHorizontalTopologyPositions = {
  armstrong: { x: -134.0465391339618, y: 45.09264205164071 },
  aldrin: { x: -96.97798947530262, y: 398.36791305033864 },
  collins: { x: 15.2778960549082, y: -66.2072202282605 },
  nasa: { x: -12.48795861293533, y: 258.06150610156027 },
  columbia: { x: 212.03663646862498, y: 112.63015193932537 },
  eagle: { x: 230.64408039010652, y: 326.44714148811903 },
  "saturn-v": { x: 186.85772011104916, y: -97.72656955313896 },
  moon: { x: 451.15162688523276, y: 255.88448816711832 },
  hornet: { x: 308.45952731227834, y: 64.31394698329733 },
};
const topologyAwareHorizontalRecompositionPositions = {
  armstrong: { x: -92.0465391339618, y: 63.09264205164071 },
  aldrin: { x: -78.97798947530262, y: 374.36791305033864 },
  collins: { x: 15.2778960549082, y: -66.2072202282605 },
  nasa: { x: -12.48795861293533, y: 258.06150610156027 },
  columbia: { x: 182.03663646862498, y: 142.63015193932537 },
  eagle: { x: 218.64408039010652, y: 326.44714148811903 },
  "saturn-v": { x: 174.85772011104916, y: -61.72656955313896 },
  moon: { x: 415.15162688523276, y: 279.8844881671183 },
  hornet: { x: 308.45952731227834, y: 64.31394698329733 },
};
const verticalSpaceRebalancePositions = {
  armstrong: { x: -116.717, y: 256.3466666666667 },
  aldrin: { x: 204.011, y: 392.6089166666667 },
  collins: { x: -102.185, y: 130.1906666666667 },
  nasa: { x: 139.196, y: 279.8006666666667 },
  columbia: { x: 145.797, y: 83.89091666666667 },
  eagle: { x: 336.422, y: 161.47241666666667 },
  "saturn-v": { x: -33.844, y: 2.827166666666699 },
  moon: { x: 407.534, y: -12.775833333333338 },
  hornet: { x: 156.701, y: -9.497583333333324 },
};
const genericCrossingSearchPositions = {
  armstrong: { x: 392, y: 328 },
  aldrin: { x: 229.94112549695427, y: 441.94112549695427 },
  collins: { x: 392, y: 164 },
  nasa: { x: 0, y: 304 },
  columbia: { x: 448.5685424949238, y: -56.56854249492382 },
  eagle: { x: 588, y: 328 },
  "saturn-v": { x: 56.56854249492379, y: 107.43145750507618 },
  moon: { x: 670.0243866176395, y: 82.02438661763951 },
  hornet: { x: 196, y: 0 },
};
const postStructuralRelaxationPositions = {
  armstrong: { x: 392, y: 328 },
  aldrin: { x: 247.94112549695427, y: 408.94112549695427 },
  collins: { x: 392, y: 164 },
  nasa: { x: 0, y: 319 },
  columbia: { x: 451.2045814642449, y: -10.47665940288703 },
  eagle: { x: 588, y: 328 },
  "saturn-v": { x: 69.29646455628165, y: 120.15937956643404 },
  moon: { x: 622.3259018078045, y: 86.2670273047588 },
  hornet: { x: 196, y: 0 },
};
const pressureTargetedRelaxationPositions = {
  armstrong: { x: 392, y: 328 },
  aldrin: { x: 247.94112549695427, y: 408.94112549695427 },
  collins: { x: 392, y: 164 },
  nasa: { x: 0, y: 331 },
  columbia: { x: 448.5685424949238, y: -56.56854249492382 },
  eagle: { x: 588, y: 328 },
  "saturn-v": { x: 56.56854249492379, y: 107.43145750507618 },
  moon: { x: 670.0243866176395, y: 82.02438661763951 },
  hornet: { x: 196, y: 0 },
};
const quantizedRelaxationStep1Positions = {
  armstrong: { x: 392, y: 328 },
  aldrin: { x: 248, y: 409 },
  collins: { x: 392, y: 164 },
  nasa: { x: 0, y: 337 },
  columbia: { x: 451, y: -11 },
  eagle: { x: 588, y: 328 },
  "saturn-v": { x: 57, y: 107 },
  moon: { x: 644, y: 82 },
  hornet: { x: 196, y: 0 },
};
const generalizationPositions = {
  linkscape: {
    generic: {
      "entity-library": { x: 0, y: 0 },
      "entity-bob": { x: 162.05887450304573, y: 130.05887450304573 },
      "entity-alice": { x: 375.02943725152284, y: 7.029437251522861 },
      "entity-cafe": { x: 196, y: 0 },
      "entity-studio": { x: 0, y: 164 },
    },
    post: {
      "entity-library": { x: 12.727922061357859, y: 30.727922061357855 },
      "entity-bob": { x: 162.05887450304573, y: 127.05887450304573 },
      "entity-alice": { x: 355.93755415948607, y: 50.121320343559645 },
      "entity-cafe": { x: 196, y: 18 },
      "entity-studio": { x: 0, y: 164 },
    },
    quantized: {
      "entity-library": { x: 13, y: 31 },
      "entity-bob": { x: 162, y: 127 },
      "entity-alice": { x: 356, y: 50 },
      "entity-cafe": { x: 196, y: 18 },
      "entity-studio": { x: 0, y: 164 },
    },
  },
  lighthouse: {
    generic: {
      archive: { x: 392, y: -24 }, thomas: { x: 0, y: 164 }, clara: { x: 196, y: 328 }, lighthouse: { x: 636, y: 328 }, maya: { x: 196, y: 164 }, authority: { x: 588, y: -64 }, daniel: { x: 392, y: 376 }, elias: { x: 196, y: 0 }, beacon: { x: 392, y: 164 }, sofia: { x: 540, y: 164 },
    },
    post: {
      archive: { x: 379.27207793864216, y: -24 }, thomas: { x: -6, y: 164 }, clara: { x: 196, y: 328 }, lighthouse: { x: 627, y: 328 }, maya: { x: 196, y: 164 }, authority: { x: 581.636038969321, y: -39.63603896932107 }, daniel: { x: 429.09188309203677, y: 361.3639610306789 }, elias: { x: 196, y: 0 }, beacon: { x: 396.24264068711926, y: 168.2426406871193 }, sofia: { x: 540, y: 164 },
    },
    pressure: {
      archive: { x: 379.27207793864216, y: -24 }, thomas: { x: -6, y: 164 }, clara: { x: 196, y: 328 }, lighthouse: { x: 636, y: 328 }, maya: { x: 196, y: 164 }, authority: { x: 588, y: -64 }, daniel: { x: 424.8492424049175, y: 341.3933982822018 }, elias: { x: 196, y: 0 }, beacon: { x: 392, y: 164 }, sofia: { x: 552.7279220613578, y: 185.72792206135784 },
    },
    quantized: {
      archive: { x: 377, y: -18 }, thomas: { x: -6, y: 164 }, clara: { x: 196, y: 328 }, lighthouse: { x: 623, y: 341 }, maya: { x: 196, y: 164 }, authority: { x: 582, y: -40 }, daniel: { x: 430, y: 361 }, elias: { x: 196, y: 0 }, beacon: { x: 392, y: 164 }, sofia: { x: 540, y: 164 },
    },
  },
} as const;
const additionalGeneralizationPositions = {
  "berlin-wall": {
    en: {
      generic: {
        sed: { x: 392, y: 328 }, "berlin-wall": { x: 392, y: 0 }, jaeger: { x: 0, y: 164 }, "neues-forum": { x: 492, y: 0 }, bornholmer: { x: 196, y: 36 }, gorbachev: { x: 196, y: 164 }, honecker: { x: 196, y: 328 }, gdr: { x: 392, y: 200 }, schabowski: { x: 0, y: 0 },
      },
      post: {
        sed: { x: 392, y: 310 }, "berlin-wall": { x: 379.27207793864216, y: 30.72792206135786 }, jaeger: { x: 12.727922061357857, y: 176.72792206135784 }, "neues-forum": { x: 468.66547622084397, y: 29.334523779156086 }, bornholmer: { x: 196, y: 54 }, gorbachev: { x: 196, y: 164 }, honecker: { x: 208.72792206135784, y: 324.27207793864216 }, gdr: { x: 374.66547622084397, y: 189.3933982822018 }, schabowski: { x: 30.72792206135786, y: 30.727922061357855 },
      },
    },
    ja: {
      generic: {
        sed: { x: 392, y: 328 }, "berlin-wall": { x: 366.5441558772843, y: 25.455844122715714 }, jaeger: { x: 0, y: 164 }, "neues-forum": { x: 475.02943725152284, y: 16.970562748477153 }, bornholmer: { x: 160, y: 0 }, gorbachev: { x: 160, y: 164 }, honecker: { x: 220, y: 328 }, gdr: { x: 392, y: 164 }, schabowski: { x: 0, y: 0 },
      },
      post: {
        sed: { x: 385.6360389693211, y: 316.3639610306789 }, "berlin-wall": { x: 366.5441558772843, y: 25.455844122715714 }, jaeger: { x: 0, y: 146 }, "neues-forum": { x: 444.301515190165, y: 29.698484809835012 }, bornholmer: { x: 160, y: 0 }, gorbachev: { x: 178, y: 164 }, honecker: { x: 226.36396103067892, y: 321.6360389693211 }, gdr: { x: 376.6360389693211, y: 170.36396103067892 }, schabowski: { x: 0, y: 0 },
      },
    },
  },
  "ashen-crown": {
    en: {
      generic: {
        darius: { x: 392, y: 328 }, nyra: { x: 16.970562748477143, y: 180.97056274847714 }, vhalgrim: { x: 150.74516600406093, y: 118.74516600406096 }, rowan: { x: 196, y: 328 }, kael: { x: 588, y: 328 }, mira: { x: 588, y: 0 }, ilyan: { x: 392, y: 0 }, garrick: { x: 588, y: 164 }, elara: { x: 392, y: 164 }, selene: { x: 0, y: 0 },
      },
      post: {
        darius: { x: 392, y: 328 }, nyra: { x: 16.970562748477143, y: 180.97056274847714 }, vhalgrim: { x: 150.74516600406093, y: 118.74516600406096 }, rowan: { x: 196, y: 328 }, kael: { x: 588, y: 328 }, mira: { x: 588, y: 0 }, ilyan: { x: 392, y: 0 }, garrick: { x: 588, y: 164 }, elara: { x: 392, y: 164 }, selene: { x: 0, y: 0 },
      },
    },
    ja: {
      generic: {
        darius: { x: 392, y: 280 }, nyra: { x: 0, y: 164 }, vhalgrim: { x: 196, y: 164 }, rowan: { x: 196, y: 328 }, kael: { x: 588, y: 328 }, mira: { x: 588, y: 0 }, ilyan: { x: 392, y: 0 }, garrick: { x: 588, y: 164 }, elara: { x: 392, y: 164 }, selene: { x: 48, y: 0 },
      },
      post: {
        darius: { x: 385.6360389693211, y: 286.3639610306789 }, nyra: { x: 0, y: 164 }, vhalgrim: { x: 196, y: 164 }, rowan: { x: 178.87867965644037, y: 330.12132034355966 }, kael: { x: 600.363961030679, y: 334.3639610306789 }, mira: { x: 588, y: 0 }, ilyan: { x: 392, y: 0 }, garrick: { x: 588, y: 164 }, elara: { x: 392, y: 164 }, selene: { x: 15.665476220843928, y: -23.849242404917497 },
      },
    },
  },
  titanic: {
    en: {
      generic: {
        fleet: { x: 408.7154106321713, y: 0 }, andrews: { x: 598.6549327243254, y: 36.012221161991704 }, ismay: { x: 745.081599324549, y: 135.79891877406658 }, "white-star-line": { x: 814.4508257473578, y: 276.5001629733679 }, "molly-brown": { x: 790.8709582090905, y: 425.88299434764303 }, phillips: { x: 679.7438601945548, y: 549.7256064873205 }, smith: { x: 506.52741063217127, y: 619.6571494164668 }, rostron: { x: 310.9034106321714, y: 619.6571494164668 }, carpathia: { x: 137.6869610697878, y: 549.7256064873206 }, bride: { x: 26.559863055252094, y: 425.88299434764315 }, "harland-wolff": { x: 2.9799955169847294, y: 276.50016297336776 }, titanic: { x: 72.3492219397935, y: 135.79891877406686 }, californian: { x: 218.77588854001735, y: 36.01222116199165 },
      },
      post: {
        fleet: { x: 389.62352754013455, y: 37.09188309203679 }, andrews: { x: 555.1990886016097, y: 54.012221161991704 }, ismay: { x: 745.081599324549, y: 135.79891877406658 }, "white-star-line": { x: 770.9949816246422, y: 258.5001629733679 }, "molly-brown": { x: 747.4151140863748, y: 407.88299434764303 }, phillips: { x: 636.2880160718391, y: 531.7256064873205 }, smith: { x: 488.52741063217127, y: 576.2013052937511 }, rostron: { x: 310.9034106321714, y: 619.6571494164668 }, carpathia: { x: 119.8377186648703, y: 508.39108270816456 }, bride: { x: 26.559863055252094, y: 425.88299434764315 }, "harland-wolff": { x: 33.70791757834258, y: 263.7722409120099 }, titanic: { x: 109.44110503183028, y: 151.16287980474578 }, californian: { x: 218.77588854001735, y: 36.01222116199165 },
      },
    },
    ja: {
      generic: {
        andrews: { x: 0, y: 328 }, rostron: { x: 0, y: 0 }, titanic: { x: 425.94112549695427, y: 154.05887450304573 }, fleet: { x: 668, y: 424 }, californian: { x: 24, y: 164 }, "molly-brown": { x: 588, y: 164 }, "white-star-line": { x: 588, y: 0 }, ismay: { x: 356, y: 0 }, phillips: { x: 784, y: 424 }, "harland-wolff": { x: 196, y: 328 }, carpathia: { x: 196, y: 164 }, bride: { x: 392, y: 328 }, smith: { x: 784, y: 0 },
      },
      post: {
        andrews: { x: 30.72792206135786, y: 340.72792206135784 }, rostron: { x: 24.36396103067893, y: 19.091883092036785 }, titanic: { x: 417.4558441227157, y: 171.02943725152286 }, fleet: { x: 668, y: 424 }, californian: { x: 24, y: 164 }, "molly-brown": { x: 600.7279220613578, y: 151.27207793864216 }, "white-star-line": { x: 575.2720779386422, y: 12.727922061357857 }, ismay: { x: 356, y: 0 }, phillips: { x: 766, y: 424 }, "harland-wolff": { x: 196, y: 328 }, carpathia: { x: 189.63603896932108, y: 157.63603896932108 }, bride: { x: 392, y: 328 }, smith: { x: 753.2720779386422, y: 12.727922061357859 },
      },
    },
  },
} as const;
const fp1NgpPositions = {
  aldrin: { x: 0, y: 0 },
  armstrong: { x: 52.5, y: 6.5625 },
  collins: { x: 105, y: 26.25 },
  columbia: { x: 157.5, y: 59.0625 },
  eagle: { x: 210, y: 105 },
  hornet: { x: 262.5, y: 164.0625 },
  moon: { x: 315, y: 236.25 },
  nasa: { x: 367.5, y: 321.5625 },
  "saturn-v": { x: 420, y: 420 },
};
const candidateDescriptions = {
  current: "Current Product baseline (coordinate-less public sample)",
  "product-seed-clearance-120": "Current Product seed / nodeClearance 120 (diagnostic)",
  "local-search-v1": "Deterministic local geometry candidate",
  "local-search-v1-plus": "Targeted local corridor refinement",
  "crossing-aware-v1": "Crossing-aware refinement (mixed control)",
  "label-accommodation-v1": "Label-accommodation-aware refinement (mixed control)",
  "presentation-aware-relaxation-v1": "Presentation-aware bounded relaxation (diagnostic)",
  "topology-aware-relaxation-v1": "Topology-aware bounded relaxation (diagnostic)",
  "label-length-aware-v1": "Label-length-aware refinement (mixed control)",
  "horizontal-canvas-v1": "Horizontal-canvas refinement (mixed control)",
  "balanced-edge-length-v1": "Horizontal canvas with balanced Edge length (diagnostic)",
  "safe-vertical-compaction-v1": "Balanced Edge length with safe vertical compaction (diagnostic)",
  "crossing-after-compaction-v1": "Bounded crossing refinement after compaction (diagnostic)",
  "global-horizontal-topology-v1": "Global horizontal recomposition (topology-first)",
  "topology-aware-horizontal-recomposition-v1": "Topology-aware horizontal recomposition (label-aware)",
  "vertical-space-rebalance-v1": "Horizontal topology rebalance (vertical-space only)",
  "generic-crossing-search-v1": "Generic crossing-first structural search (diagnostic)",
  "post-structural-relaxation-v1": "Post-structural constrained relaxation (diagnostic)",
  "coarse-objective-prototype-v1": "Coarse-objective bounded candidate (diagnostic)",
  "pressure-targeted-relaxation-v1": "Pressure-targeted constrained relaxation (diagnostic)",
  "quantized-relaxation-step1-v1": "Integer-lattice constrained relaxation, step 1 (diagnostic)",
  "source-f0-160": "Source F0 solver, clearance 160",
  "fp1-ngp-420": "FP1-NGP negative control",
} as const;
type CandidateId = keyof typeof candidateDescriptions;
const queryCandidate = new URL(window.location.href).searchParams.get("candidate") as CandidateId | null;
const selectedCandidate: CandidateId = queryCandidate && queryCandidate in candidateDescriptions ? queryCandidate : "current";

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function coordinateMap(dataset: any, candidate: CandidateId) {
  if (candidate === "product-seed-clearance-120") {
    const graph = buildEntityGraph(dataset);
    return solveAutoLayout({
      entities: graph.nodes.map(({ id }) => ({ id })),
      relations: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
    }, { nodeClearance: 120, iterations: 3 });
  }
  if (candidate === "coarse-objective-prototype-v1") {
    const graph = buildEntityGraph(dataset);
    const entities = graph.nodes.map((node) => ({ id: node.id, label: node.label, description: node.description }));
    const relations = graph.edges.map((edge) => ({ id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, label: dataset.relations.find((relation: any) => relation.id === edge.id)?.name ?? edge.id }));
    return generateBoundedCoarseCandidate({ entities, relations, budgetMs: 100 }).positions;
  }
  const additionalFixturePositions = additionalGeneralizationPositions[selectedFixtureKind as keyof typeof additionalGeneralizationPositions];
  if (additionalFixturePositions && (candidate === "generic-crossing-search-v1" || candidate === "post-structural-relaxation-v1")) {
    const family = candidate === "generic-crossing-search-v1" ? "generic" : "post";
    return additionalFixturePositions[inspectionLocale][family];
  }
  if ((selectedFixtureKind === "linkscape" || selectedFixtureKind === "lighthouse") && (candidate === "generic-crossing-search-v1" || candidate === "post-structural-relaxation-v1")) {
    const family = candidate === "generic-crossing-search-v1" ? "generic" : "post";
    return generalizationPositions[selectedFixtureKind][family];
  }
  if ((selectedFixtureKind === "linkscape" || selectedFixtureKind === "lighthouse") && candidate === "pressure-targeted-relaxation-v1") {
    const positions = generalizationPositions[selectedFixtureKind as "linkscape" | "lighthouse"];
    return positions.pressure ?? positions.post;
  }
  if ((selectedFixtureKind === "linkscape" || selectedFixtureKind === "lighthouse") && candidate === "quantized-relaxation-step1-v1") {
    return generalizationPositions[selectedFixtureKind as "linkscape" | "lighthouse"].quantized;
  }
  if (candidate === "local-search-v1") return localSearchPositions;
  if (candidate === "local-search-v1-plus") return targetedLocalCorridorPositions;
  if (candidate === "crossing-aware-v1") return crossingAwarePositions;
  if (candidate === "label-accommodation-v1") return labelAccommodationAwarePositions;
  if (candidate === "presentation-aware-relaxation-v1") return presentationAwareRelaxationPositions;
  if (candidate === "topology-aware-relaxation-v1") return topologyAwareRelaxationPositions;
  if (candidate === "label-length-aware-v1") return labelLengthAwarePositions;
  if (candidate === "horizontal-canvas-v1") return horizontalCanvasAwarePositions;
  if (candidate === "balanced-edge-length-v1") return balancedEdgeLengthPositions;
  if (candidate === "safe-vertical-compaction-v1") return safeVerticalCompactionPositions;
  if (candidate === "crossing-after-compaction-v1") return crossingAfterCompactionPositions;
  if (candidate === "global-horizontal-topology-v1") return globalHorizontalTopologyPositions;
  if (candidate === "topology-aware-horizontal-recomposition-v1") return topologyAwareHorizontalRecompositionPositions;
  if (candidate === "vertical-space-rebalance-v1") return verticalSpaceRebalancePositions;
  if (candidate === "generic-crossing-search-v1") return genericCrossingSearchPositions;
  if (candidate === "post-structural-relaxation-v1") return postStructuralRelaxationPositions;
  if (candidate === "pressure-targeted-relaxation-v1") return pressureTargetedRelaxationPositions;
  if (candidate === "quantized-relaxation-step1-v1") return quantizedRelaxationStep1Positions;
  if (candidate === "fp1-ngp-420") return fp1NgpPositions;
  const graph = buildEntityGraph(dataset);
  if (candidate === "source-f0-160") {
    return solveAutoLayout({
      entities: graph.nodes.map(({ id }) => ({ id })),
      relations: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
    }, { nodeClearance: 160, iterations: 3 });
  }
  return Object.fromEntries(dataset.entities.map((entity: any) => {
    const values = entity.extensions?.["draft.github.sukoyaka-dopeness.coordinate"]?.coordinates?.[0]?.values;
    return [entity.id, values ? { x: values.x, y: values.y } : undefined];
  }).filter((entry: [string, unknown]) => entry[1]));
}

function materializeCandidate(dataset: any, candidate: CandidateId) {
  const next = cloneValue(dataset);
  const positions = coordinateMap(next, candidate);
  if (Object.keys(positions).length > 0) {
    const extensions = next.extensions ?? (next.extensions = {});
    extensions["draft.github.sukoyaka-dopeness.coordinate"] ??= {
      specVersion: "0.1.0",
      spaces: [{
        id: "liaisonscape-graph",
        name: "LiaisonScape graph coordinates",
        kind: "cartesian-2d",
        components: {
          x: { unit: "liaisonscape-user-unit", positiveDirection: "display-right" },
          y: { unit: "liaisonscape-user-unit", positiveDirection: "display-down" },
        },
      }],
    };
    const specification = extensions["draft.github.sukoyaka-dopeness.specification"] ?? (extensions["draft.github.sukoyaka-dopeness.specification"] = { specVersion: "0.1.0", uses: [] });
    specification.uses ??= [];
    if (!specification.uses.some((use: any) => use.extension === "draft.github.sukoyaka-dopeness.coordinate")) {
      specification.uses.push({ extension: "draft.github.sukoyaka-dopeness.coordinate", version: "0.1.0" });
    }
  }
  for (const entity of next.entities) {
    const position = positions[entity.id];
    const values = entity.extensions?.["draft.github.sukoyaka-dopeness.coordinate"]?.coordinates?.[0]?.values;
    if (position) {
      const extensions = entity.extensions ?? (entity.extensions = {});
      const coordinate = extensions["draft.github.sukoyaka-dopeness.coordinate"] ?? (extensions["draft.github.sukoyaka-dopeness.coordinate"] = { coordinates: [{ spaceId: "liaisonscape-graph", values: position }] });
      const values = coordinate.coordinates?.[0]?.values ?? (coordinate.coordinates = [{ spaceId: "liaisonscape-graph", values: position }])[0].values;
      values.x = position.x;
      values.y = position.y;
    }
  }
  return next;
}

const originalFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (requestedUrl === diagnosticDatasetUrl) {
    const response = await originalFetch(fixtureUrl, init);
    const dataset = await response.json();
    return new Response(JSON.stringify(materializeCandidate(dataset, selectedCandidate)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
}) as typeof window.fetch;

if (!window.location.hash.includes("datasetUrl=")) window.location.hash = `datasetUrl=${encodeURIComponent(diagnosticDatasetUrl)}`;

function candidateUrl(candidate: CandidateId) {
  const url = new URL(window.location.href);
  url.searchParams.set("candidate", candidate);
  return `${url.pathname}${url.search}${url.hash}`;
}

function CandidateMetrics() {
  if (isApolloPublic || selectedFixtureKind !== "apollo") return <p className="geometry-inspection-metrics">Coordinate-less public-sample comparison: machine metrics from the stored-coordinate diagnostic table are intentionally not reused here. Compare the actual Product canvas directly.</p>;
  const rows = useMemo(() => [
    ["current", "3", "2", "187.9", "364.6", "510 × 677", "0.753", "0.416", "—"],
    ["local-search-v1", "3", "0", "177.9", "319.9", "423 × 677", "0.625", "0.416", "—"],
    ["local-search-v1-plus", "3", "0", "163.8", "363.3", "440 × 677", "0.650", "0.416", "3043"],
    ["crossing-aware-v1", "1", "2", "116.1", "305.4", "391 × 545", "0.718", "0.506", "—"],
    ["label-accommodation-v1", "3", "1", "177.9", "464.4", "423 × 677", "0.624", "0.416", "—"],
    ["presentation-aware-relaxation-v1", "2", "0", "123.3", "382.5", "338 × 647", "0.523", "0.433", "15338"],
    ["topology-aware-relaxation-v1", "3", "0", "127.4", "292.8", "386 × 581", "0.665", "0.477", "9453"],
    ["label-length-aware-v1", "3", "0", "185.9", "394.6", "485 × 653", "0.727", "0.365", "0"],
    ["horizontal-canvas-v1", "3", "0", "140.1", "394.8", "569 × 587", "0.970", "0.473", "4624"],
    ["balanced-edge-length-v1", "3", "0", "192.4", "410.9", "524 × 578", "0.907", "0.480", "15"],
    ["safe-vertical-compaction-v1", "3", "0", "189.6", "404.0", "524 × 541", "0.970", "0.510", "6"],
    ["crossing-after-compaction-v1", "3", "0", "180.9", "393.8", "516 × 529", "0.976", "0.520", "6"],
    ["global-horizontal-topology-v1", "3", "0", "171.5", "381.6", "585 × 496", "1.180", "0.550", "10322"],
    ["topology-aware-horizontal-recomposition-v1", "3", "0", "141.5", "327.4", "507 × 441", "1.151", "0.610", "5502"],
    ["vertical-space-rebalance-v1", "3", "0", "187.2", "397.6", "524 × 405", "1.293", "0.656", "20"],
    ["generic-crossing-search-v1", "0", "0", "194.0", "356.9", "670 × 499", "1.344", "0.548", "149"],
    ["post-structural-relaxation-v1", "0", "0", "195.7", "352.9", "622 × 419", "1.484", "0.596", "0"],
    ["source-f0-160", "6", "0", "205.0", "413.7", "484 × 542", "0.893", "0.508", "—"],
    ["fp1-ngp-420", "11", "0", "214.7", "466.8", "420 × 420", "1.000", "0.636", "—"],
    ["pressure-targeted-relaxation-v1", "0", "0", "193.2", "356.9", "670 × 466", "1.439", "0.582", "0"],
    ["quantized-relaxation-step1-v1", "0", "0", "191.6", "358.5", "644 × 420", "1.533", "0.636", "0"],
  ], []);
  return <section className="geometry-inspection-metrics" aria-label="Diagnostic geometry metrics">
    <strong>Diagnostic metrics only — not Product adoption</strong>
    <table><thead><tr><th>candidate</th><th>crossings</th><th>label hits</th><th>route median</th><th>route max</th><th>node extent</th><th>aspect</th><th>fit scale</th><th>usable span penalty</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row[0]}><td><code>{row[0]}</code></td>{row.slice(1).map((value) => <td key={value}>{value}</td>)}</tr>)}</tbody>
    </table>
  </section>;
}

function GeometryInspection() {
  const changeCandidate = (event: React.ChangeEvent<HTMLSelectElement>) => {
    window.location.href = candidateUrl(event.target.value as CandidateId);
  };
  return <>
    <div className="geometry-inspection-seam" aria-label="Geometry candidate controls">
      <span>Actual Product geometry candidate inspection / {isApolloPublic ? "apollo-public" : selectedFixtureKind}</span>
      <label>Candidate <select value={selectedCandidate} onChange={changeCandidate} aria-label="Geometry candidate">
        {Object.entries(candidateDescriptions).map(([id, description]) => <option key={id} value={id}>{description}</option>)}
      </select></label>
      <span className="geometry-inspection-note">Only stored coordinate values are replaced in an in-memory diagnostic clone. Routing, labels, drag behavior, and Product source remain unchanged. Node body overlap is a hard diagnostic rejection at the existing 76-unit initial-placement clearance. Compare Generic crossing-first structural search with Post-structural constrained relaxation, Balanced Edge length with safe vertical compaction, and Horizontal topology rebalance (vertical-space only). The post-structural candidate makes only small local movements around the user-inspected generic solution; it is a diagnostic result, not Product adoption. Recheck Neil Armstrong / NASA / Lunar Module Eagle, Michael Collins / NASA, NASA / Saturn V, Saturn V / Command Module Columbia, and the crowded NASA corridor. These are diagnostic comparisons, not adoption decisions; pointer-up side-flip behavior remains a separate open interactive-routing track.</span>
    </div>
    <CandidateMetrics />
    <App />
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><GeometryInspection /></StrictMode>);
