import {
  COORDINATE_DRAFT_EXTENSION_ID,
  COORDINATE_EXTENSION_ID,
  COORDINATE_FORMAT_VERSION,
  LINKSCAPE_SPACE_ID,
  LIAISONSCAPE_SPACE_ID,
  type Dataset,
  type Diagnostic,
  validateDatasetForExport,
} from "./dataset.ts";

const SPECIFICATION_EXTENSION_ID = "draft.github.sukoyaka-dopeness.specification";
const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export type CoordinateDraftMigrationRefusalCode =
  | "linkscape_coordinate_draft_migration_no_source"
  | "linkscape_coordinate_draft_migration_target_exists"
  | "linkscape_coordinate_draft_migration_source_invalid"
  | "linkscape_coordinate_draft_migration_unknown_source_field"
  | "linkscape_coordinate_draft_migration_space_unsupported"
  | "linkscape_coordinate_draft_migration_component_unsupported"
  | "linkscape_coordinate_draft_migration_external_reference_unsupported"
  | "linkscape_coordinate_draft_migration_specification_unsupported"
  | "linkscape_coordinate_draft_migration_target_invalid";

export type CoordinateDraftMigrationReadiness =
  | { ready: true }
  | { ready: false; code: CoordinateDraftMigrationRefusalCode; path: string };

export type CoordinateDraftMigrationResult =
  | { migrated: true; dataset: Dataset; diagnostics: Diagnostic[] }
  | { migrated: false; readiness: CoordinateDraftMigrationReadiness; diagnostics: Diagnostic[] };

type Occurrence = { value: unknown; path: string; collection: "dataset" | "entities" | "events" | "relations" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pointerSegment(value: unknown): string {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function refuse(
  code: CoordinateDraftMigrationRefusalCode,
  path: string,
): CoordinateDraftMigrationReadiness {
  return { ready: false, code, path };
}

function firstUnknownField(value: Record<string, unknown>, allowed: ReadonlySet<string>): string | null {
  return Object.keys(value).find((field) => !allowed.has(field)) ?? null;
}

function occurrences(dataset: Dataset, identifier: string): Occurrence[] {
  const result: Occurrence[] = [];
  const visit = (
    value: unknown,
    path: string,
    collection: Occurrence["collection"],
  ) => {
    if (!isRecord(value) || !isRecord(value.extensions)) return;
    if (identifier in value.extensions) {
      result.push({
        value: value.extensions[identifier],
        path: `${path}/extensions/${pointerSegment(identifier)}`,
        collection,
      });
    }
  };

  visit(dataset, "", "dataset");
  for (const collection of ["entities", "events", "relations"] as const) {
    for (const [index, value] of dataset[collection].entries()) {
      visit(value, `/${collection}/${index}`, collection);
    }
  }
  return result;
}

function extensionIdentifiers(dataset: Dataset): Set<string> {
  const identifiers = new Set<string>();
  const visit = (value: unknown) => {
    if (!isRecord(value) || !isRecord(value.extensions)) return;
    for (const identifier of Object.keys(value.extensions)) identifiers.add(identifier);
  };
  visit(dataset);
  for (const collection of [dataset.entities, dataset.events, dataset.relations]) {
    for (const value of collection) visit(value);
  }
  return identifiers;
}

function validateSimpleSpecification(dataset: Dataset): CoordinateDraftMigrationReadiness {
  const specificationOccurrences = occurrences(dataset, SPECIFICATION_EXTENSION_ID);
  if (specificationOccurrences.length === 0) return { ready: true };
  if (
    specificationOccurrences.length !== 1
    || specificationOccurrences[0]?.collection !== "dataset"
  ) {
    return refuse(
      "linkscape_coordinate_draft_migration_specification_unsupported",
      specificationOccurrences[0]?.path ?? `/extensions/${SPECIFICATION_EXTENSION_ID}`,
    );
  }

  const occurrence = specificationOccurrences[0];
  const specification = occurrence.value;
  if (!isRecord(specification) || specification.specVersion !== "0.1.0") {
    return refuse("linkscape_coordinate_draft_migration_specification_unsupported", occurrence.path);
  }
  const unknown = firstUnknownField(specification, new Set(["specVersion", "uses"]));
  if (unknown) {
    return refuse(
      "linkscape_coordinate_draft_migration_specification_unsupported",
      `${occurrence.path}/${pointerSegment(unknown)}`,
    );
  }
  if (!Array.isArray(specification.uses)) {
    return refuse(
      "linkscape_coordinate_draft_migration_specification_unsupported",
      `${occurrence.path}/uses`,
    );
  }

  const declarations = new Map<string, { version: string; path: string }>();
  for (const [index, value] of specification.uses.entries()) {
    const path = `${occurrence.path}/uses/${index}`;
    if (!isRecord(value)
      || firstUnknownField(value, new Set(["extension", "version"])) !== null
      || !nonEmptyString(value.extension)
      || typeof value.version !== "string"
      || !VERSION_PATTERN.test(value.version)
      || declarations.has(value.extension)) {
      return refuse("linkscape_coordinate_draft_migration_specification_unsupported", path);
    }
    declarations.set(value.extension, { version: value.version, path });
  }

  const present = extensionIdentifiers(dataset);
  present.delete(SPECIFICATION_EXTENSION_ID);
  if (declarations.size !== present.size || [...present].some((id) => !declarations.has(id))) {
    return refuse(
      "linkscape_coordinate_draft_migration_specification_unsupported",
      `${occurrence.path}/uses`,
    );
  }
  if ([...declarations.keys()].some((id) => !present.has(id))) {
    return refuse(
      "linkscape_coordinate_draft_migration_specification_unsupported",
      `${occurrence.path}/uses`,
    );
  }

  const prototype = declarations.get(COORDINATE_EXTENSION_ID);
  if (!prototype || prototype.version !== COORDINATE_FORMAT_VERSION) {
    return refuse(
      "linkscape_coordinate_draft_migration_specification_unsupported",
      prototype?.path ?? `${occurrence.path}/uses`,
    );
  }
  return { ready: true };
}

export function assessCoordinateDraftMigration(dataset: Dataset): CoordinateDraftMigrationReadiness {
  const draftOccurrences = occurrences(dataset, COORDINATE_DRAFT_EXTENSION_ID);
  if (draftOccurrences.length > 0) {
    return refuse(
      "linkscape_coordinate_draft_migration_target_exists",
      draftOccurrences[0]!.path,
    );
  }

  const prototypeOccurrences = occurrences(dataset, COORDINATE_EXTENSION_ID);
  const datasetOccurrence = prototypeOccurrences.find(({ collection }) => collection === "dataset");
  if (!datasetOccurrence) {
    return refuse(
      "linkscape_coordinate_draft_migration_no_source",
      `/extensions/${COORDINATE_EXTENSION_ID}`,
    );
  }
  if (!isRecord(datasetOccurrence.value)) {
    return refuse("linkscape_coordinate_draft_migration_source_invalid", datasetOccurrence.path);
  }

  const datasetPayload = datasetOccurrence.value;
  const datasetUnknown = firstUnknownField(datasetPayload, new Set(["formatVersion", "spaces"]));
  if (datasetUnknown) {
    return refuse(
      "linkscape_coordinate_draft_migration_unknown_source_field",
      `${datasetOccurrence.path}/${pointerSegment(datasetUnknown)}`,
    );
  }
  if (
    datasetPayload.formatVersion !== COORDINATE_FORMAT_VERSION
    || !Array.isArray(datasetPayload.spaces)
  ) {
    return refuse("linkscape_coordinate_draft_migration_source_invalid", datasetOccurrence.path);
  }

  const spaces = new Map<string, { components: Set<string> }>();
  for (const [spaceIndex, value] of datasetPayload.spaces.entries()) {
    const spacePath = `${datasetOccurrence.path}/spaces/${spaceIndex}`;
    if (!isRecord(value)) {
      return refuse("linkscape_coordinate_draft_migration_source_invalid", spacePath);
    }
    const unknown = firstUnknownField(
      value,
      new Set(["id", "name", "kind", "components", "externalReference"]),
    );
    if (unknown) {
      return refuse(
        "linkscape_coordinate_draft_migration_unknown_source_field",
        `${spacePath}/${pointerSegment(unknown)}`,
      );
    }
    if ("externalReference" in value) {
      return refuse(
        "linkscape_coordinate_draft_migration_external_reference_unsupported",
        `${spacePath}/externalReference`,
      );
    }
    const profile = value.id === LINKSCAPE_SPACE_ID
      ? { id: LINKSCAPE_SPACE_ID, unit: "linkscape-user-unit" }
      : value.id === LIAISONSCAPE_SPACE_ID
        ? { id: LIAISONSCAPE_SPACE_ID, unit: "liaisonscape-user-unit" }
        : null;
    if (
      !profile
      || value.kind !== "cartesian-2d"
      || ("name" in value && !nonEmptyString(value.name))
      || !isRecord(value.components)
      || spaces.has(profile.id)
    ) {
      return refuse("linkscape_coordinate_draft_migration_space_unsupported", spacePath);
    }

    const componentIds = Object.keys(value.components);
    if (
      componentIds.length !== 2
      || !componentIds.includes("x")
      || !componentIds.includes("y")
    ) {
      return refuse(
        "linkscape_coordinate_draft_migration_component_unsupported",
        `${spacePath}/components`,
      );
    }
    for (const componentId of ["x", "y"] as const) {
      const componentPath = `${spacePath}/components/${componentId}`;
      const component = value.components[componentId];
      if (!isRecord(component)) {
        return refuse("linkscape_coordinate_draft_migration_source_invalid", componentPath);
      }
      const componentUnknown = firstUnknownField(
        component,
        new Set(["name", "unit", "positiveDirection", "minimum", "maximum", "period"]),
      );
      if (componentUnknown) {
        return refuse(
          "linkscape_coordinate_draft_migration_unknown_source_field",
          `${componentPath}/${pointerSegment(componentUnknown)}`,
        );
      }
      const expectedDirection = componentId === "x" ? "display-right" : "display-down";
      if (
        component.unit !== profile.unit
        || component.positiveDirection !== expectedDirection
        || ("name" in component && !nonEmptyString(component.name))
        || "minimum" in component
        || "maximum" in component
        || "period" in component
      ) {
        return refuse("linkscape_coordinate_draft_migration_component_unsupported", componentPath);
      }
    }
    spaces.set(profile.id, { components: new Set(["x", "y"]) });
  }

  for (const occurrence of prototypeOccurrences) {
    if (occurrence.collection === "dataset") continue;
    if (occurrence.collection === "relations" || !isRecord(occurrence.value)) {
      return refuse("linkscape_coordinate_draft_migration_source_invalid", occurrence.path);
    }
    const payloadUnknown = firstUnknownField(occurrence.value, new Set(["coordinates"]));
    if (payloadUnknown) {
      return refuse(
        "linkscape_coordinate_draft_migration_unknown_source_field",
        `${occurrence.path}/${pointerSegment(payloadUnknown)}`,
      );
    }
    if (!Array.isArray(occurrence.value.coordinates) || occurrence.value.coordinates.length === 0) {
      return refuse("linkscape_coordinate_draft_migration_source_invalid", `${occurrence.path}/coordinates`);
    }

    const seenSpaces = new Set<string>();
    for (const [coordinateIndex, value] of occurrence.value.coordinates.entries()) {
      const coordinatePath = `${occurrence.path}/coordinates/${coordinateIndex}`;
      if (!isRecord(value)) {
        return refuse("linkscape_coordinate_draft_migration_source_invalid", coordinatePath);
      }
      const coordinateUnknown = firstUnknownField(value, new Set(["spaceId", "values"]));
      if (coordinateUnknown) {
        return refuse(
          "linkscape_coordinate_draft_migration_unknown_source_field",
          `${coordinatePath}/${pointerSegment(coordinateUnknown)}`,
        );
      }
      if (
        !nonEmptyString(value.spaceId)
        || seenSpaces.has(value.spaceId)
        || !spaces.has(value.spaceId)
        || !isRecord(value.values)
        || Object.keys(value.values).length === 0
      ) {
        return refuse("linkscape_coordinate_draft_migration_source_invalid", coordinatePath);
      }
      seenSpaces.add(value.spaceId);
      const components = spaces.get(value.spaceId)!.components;
      for (const [componentId, componentValue] of Object.entries(value.values)) {
        if (!components.has(componentId)
          || typeof componentValue !== "number"
          || !Number.isFinite(componentValue)) {
          return refuse(
            "linkscape_coordinate_draft_migration_component_unsupported",
            `${coordinatePath}/values/${pointerSegment(componentId)}`,
          );
        }
      }
    }
  }

  return validateSimpleSpecification(dataset);
}

function migrateSpecificationDeclaration(dataset: Dataset): void {
  if (!isRecord(dataset.extensions)) return;
  const specification = dataset.extensions[SPECIFICATION_EXTENSION_ID];
  if (!isRecord(specification) || !Array.isArray(specification.uses)) return;
  dataset.extensions[SPECIFICATION_EXTENSION_ID] = {
    ...specification,
    uses: specification.uses.map((declaration) => {
      if (!isRecord(declaration) || declaration.extension !== COORDINATE_EXTENSION_ID) {
        return declaration;
      }
      return {
        ...declaration,
        extension: COORDINATE_DRAFT_EXTENSION_ID,
        version: "0.1.0",
      };
    }),
  };
}

function migrateObjectCoordinatePayload(value: Record<string, unknown>): Record<string, unknown> {
  const extensions = isRecord(value.extensions) ? value.extensions : null;
  if (!extensions || !(COORDINATE_EXTENSION_ID in extensions)) return value;
  const prototype = extensions[COORDINATE_EXTENSION_ID];
  if (!isRecord(prototype)) return value;
  const nextExtensions = { ...extensions };
  delete nextExtensions[COORDINATE_EXTENSION_ID];
  nextExtensions[COORDINATE_DRAFT_EXTENSION_ID] = {
    coordinates: structuredClone(prototype.coordinates),
  };
  return { ...value, extensions: nextExtensions };
}

/**
 * Explicitly migrates Linkscape's narrow Coordinate Prototype profile to Draft
 * 0.1.0. Assessment, projection, and whole-Dataset validation are atomic.
 */
export function migrateCoordinatePrototypeToDraft(dataset: Dataset): CoordinateDraftMigrationResult {
  const readiness = assessCoordinateDraftMigration(dataset);
  if (!readiness.ready) return { migrated: false, readiness, diagnostics: [] };

  const copy = structuredClone(dataset) as Dataset;
  const extensions = isRecord(copy.extensions) ? copy.extensions : {};
  const prototype = extensions[COORDINATE_EXTENSION_ID];
  if (!isRecord(prototype)) {
    const refusal = refuse(
      "linkscape_coordinate_draft_migration_source_invalid",
      `/extensions/${COORDINATE_EXTENSION_ID}`,
    );
    return { migrated: false, readiness: refusal, diagnostics: [] };
  }

  const nextExtensions = { ...extensions };
  delete nextExtensions[COORDINATE_EXTENSION_ID];
  nextExtensions[COORDINATE_DRAFT_EXTENSION_ID] = {
    specVersion: "0.1.0",
    spaces: structuredClone(prototype.spaces),
  };
  copy.extensions = nextExtensions;
  copy.entities = copy.entities.map(migrateObjectCoordinatePayload) as Dataset["entities"];
  copy.events = copy.events.map(migrateObjectCoordinatePayload) as Dataset["events"];
  copy.relations = copy.relations.map(migrateObjectCoordinatePayload) as Dataset["relations"];
  migrateSpecificationDeclaration(copy);

  const diagnostics = validateDatasetForExport(copy);
  const error = diagnostics.find(({ severity }) => severity === "error");
  if (error) {
    return {
      migrated: false,
      readiness: refuse("linkscape_coordinate_draft_migration_target_invalid", error.path),
      diagnostics,
    };
  }
  return { migrated: true, dataset: copy, diagnostics };
}
