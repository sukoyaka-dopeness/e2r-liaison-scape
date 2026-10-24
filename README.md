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

The application uses E2R Validator `0.7.0` and preserves unknown Core fields
and Extensions through supported load, edit, and save flows. Its current
acceptance coverage includes A1 through A19, including Event endpoint
limitations, self and parallel Relations, coordinate behavior, and validation
diagnostics.

## Public sample Dataset

Home provides a sample action for the current locale:

- English: [`lighthouse-restoration-demo.en.e2r.json`](public/lighthouse-restoration-demo.en.e2r.json)
- Japanese: [`lighthouse-restoration-demo.ja.e2r.json`](public/lighthouse-restoration-demo.ja.e2r.json)

The Lighthouse Restoration Project sample contains ten Entities, eleven
Events, person-centered Entity-to-Entity Relations, Event endpoint Relations,
self-Relations, a parallel Relation pair, History data, and LiaisonScape
Presentation data. It intentionally contains no saved Coordinate data, so
opening the sample exercises LiaisonScape's automatic initial placement.
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

The repository deploys to GitHub Pages through its `main` push workflow under
the project base path `/e2r-liaison-scape/`.

The live application is available at:

https://sukoyaka-dopeness.github.io/e2r-liaison-scape/

## Version

The published application remains `0.2.1`. This repository locally prepares
application and package version `0.2.2` as an unpublished Ko-fi maintenance
candidate; its Credits `Updated` date still describes the last confirmed
application publication and must be set to the actual JST publication date
before any `0.2.2` Push. The approved `0.2.1` Credits-fix application source
`54202255df0c34e26c2e1b2d2654ba782e4c4d5e` was deployed to GitHub Pages
on 2026-10-21 at 15:27:30 JST. Its [bounded Human Closure](docs/credits-repository-link-hit-area-fix-2026-10-21.md)
is distinct from later Documentation-only `main` commits. The separate
[Lighthouse JA Dimension Assessment preservation acceptance](docs/dimension-assessment-ui-preservation-human-acceptance-2026-10-22.md)
does not establish Dimension Assessment editing support or general Dataset safety.

The local candidate Credits identifies LiaisonScape `0.2.2`, first released on
2026-08-16, with `Updated: 2026-10-21` as the last confirmed application
publication date, not a `0.2.2` publication claim. The application consumes
E2R Validator `0.7.0`. See the [0.2.2 release preparation](docs/liaisonscape-0.2.2-release-candidate-preparation-2026-10-25.md)
for the remaining date and Human review gates.

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

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
