# LiaisonScape

LiaisonScape is an E2R relationship explorer and Entity-first reference
application for exploring relationships between Entities and Relations.

Repository: <https://github.com/sukoyaka-dopeness/e2r-liaison-scape>

## Current status

LiaisonScape currently provides:

- Open an E2R Dataset
- Create a new Dataset
- Entity graph visualization
- Entity creation, editing, and safe deletion
- Relation creation, editing, endpoint editing, and deletion
- Self-Relations and parallel Relations
- Direct graph authoring
- Stored Entity coordinates and explicit coordinate saving
- Dataset export with E2R Validator checks
- English and Japanese UI
- Locale-specific public sample Dataset loading from Home

The application uses E2R Validator `0.2.0` and preserves unknown Core fields
and Extensions through supported load, edit, and save flows. Its current
acceptance coverage includes A1 through A19, including Event endpoint
limitations, self and parallel Relations, coordinate behavior, and validation
diagnostics.

## Public sample Dataset

Home provides a sample action for the current locale:

- English: [`lighthouse-restoration-demo.en.e2r.json`](public/lighthouse-restoration-demo.en.e2r.json)
- Japanese: [`lighthouse-restoration-demo.ja.e2r.json`](public/lighthouse-restoration-demo.ja.e2r.json)

The Lighthouse Restoration Project sample contains six Entities, four Events,
Entity-to-Entity Relations, Event endpoint Relations, a self-Relation, a
parallel Relation pair, History data, and LiaisonScape Coordinate Draft data.
The same Dataset structure is designed to offer a graph view in LiaisonScape
and a timeline/event view in NarrativeLine.

## User guides

- [Japanese user guide](docs/user-guide-ja.md)
- [English user guide](docs/user-guide-en.md)

## Development

```text
npm install
npm run dev
npm test
npm run lint
npm run build
```

`npm run lint` runs TypeScript type checking with `tsc --noEmit`.
`npm run build` runs the TypeScript build and produces the Vite `dist/`
directory.

## GitHub Pages

The repository contains a GitHub Pages deployment workflow and is prepared for
deployment under the project base path `/e2r-liaison-scape/`.

The actual GitHub Pages deployment and live application URL have not yet been
verified. No live URL is listed here until a Pages deployment has completed
successfully.

## Version

Current package version: `0.1.0`

The package version and Credits display are aligned. The First Distribution
release date has not been decided and is intentionally not listed here.

## Known limitations

The following remain candidates for post-distribution work:

- Advanced validation diagnostics
- Group / Cluster
- Advanced routing and collision avoidance
- Relation Arrow Appearance
- Mobile UI refinement
- Stable Coordinate standardization
- Additional locales

The current application does not publish to npm and does not include a native
installer or desktop package.
