import {
  constants,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ENV_PAIRS = [
  { example: ".env.example", target: ".env" },
  { example: "apps/api/.env.example", target: "apps/api/.env" },
  { example: "apps/web/.env.example", target: "apps/web/.env" },
];

const LEGACY_VOICEVOX_KEY = "VOICEVOX_BASE_URL";
const COMPOSE_VOICEVOX_KEY = "WFCHAT_COMPOSE_VOICEVOX_BASE_URL";

export function syncEnvFiles({
  rootDir = process.cwd(),
  pairs = DEFAULT_ENV_PAIRS,
  logger = console,
  hooks = {},
} = {}) {
  const root = resolve(rootDir);
  const states = preflight(root, pairs);
  const plans = planSynchronization(states);
  const stagedPlans = [];

  try {
    for (const plan of plans) {
      stagePlan(plan, stagedPlans, hooks);
    }

    try {
      hooks.afterStage?.({ plans });
    } catch (error) {
      throw stagingError(null, error);
    }
    verifyTargetSnapshots(plans);

    for (const plan of plans.filter((candidate) => candidate.changed && candidate.snapshot.exists)) {
      hooks.beforeBackup?.({ plan });
      plan.backupPath = createUniquePath(plan.targetPath, "backup");
      copyFileSync(plan.targetPath, plan.backupPath, constants.COPYFILE_EXCL);
    }

    const replaced = [];
    try {
      for (const plan of plans.filter((candidate) => candidate.changed)) {
        hooks.beforeReplace?.({ plan, replaced: [...replaced] });
        renameSync(plan.stagePath, plan.targetPath);
        plan.stagePath = null;
        replaced.push(plan);
      }
    } catch (error) {
      const rollbackErrors = rollbackReplacements(replaced, hooks);
      throw new EnvSyncTransactionError(
        `Environment sync replacement failed${errorCodeSuffix(error)}`,
        rollbackErrors,
        { cause: error },
      );
    }

    reportPlans(root, plans, logger);
    return plans.map(publicPlan);
  } finally {
    for (const plan of stagedPlans) {
      if (plan.stagePath && existsSync(plan.stagePath)) {
        rmSync(plan.stagePath, { force: true });
      }
    }
  }
}

function preflight(root, pairs) {
  const states = pairs.map((pair, index) => {
    const examplePath = resolve(root, pair.example);
    const targetPath = resolve(root, pair.target);
    if (!existsSync(examplePath)) {
      throw new EnvSyncError(`Missing template: ${pair.example}`);
    }

    const exampleSnapshot = readSnapshot(examplePath, true);
    const targetSnapshot = readSnapshot(targetPath, false);
    const exampleDocument = parseEnvDocument(
      decodeUtf8(exampleSnapshot.bytes, pair.example),
      pair.example,
    );
    const targetDocument = targetSnapshot.exists
      ? parseEnvDocument(decodeUtf8(targetSnapshot.bytes, pair.target), pair.target)
      : parseEnvDocument("", pair.target);

    return {
      index,
      pair,
      examplePath,
      targetPath,
      exampleDocument,
      targetDocument,
      exampleSnapshot,
      snapshot: targetSnapshot,
      exampleAssignments: indexAssignments(exampleDocument, pair.example),
      targetAssignments: indexAssignments(targetDocument, pair.target),
    };
  });

  const targets = new Set();
  for (const state of states) {
    if (targets.has(state.targetPath)) {
      throw new EnvSyncError(`Duplicate target file: ${state.pair.target}`);
    }
    targets.add(state.targetPath);
  }

  return states;
}

function planSynchronization(states) {
  const ownership = new Map();
  for (const state of states) {
    state.canonicalKeys = new Set(state.exampleAssignments.keys());
    state.values = new Map();
    state.actions = {
      added: new Set(),
      migrated: new Set(),
      moved: new Set(),
      removed: new Set(),
    };

    for (const key of state.canonicalKeys) {
      const owners = ownership.get(key) ?? [];
      owners.push(state);
      ownership.set(key, owners);
    }

    for (const [key, assignment] of state.targetAssignments) {
      if (state.canonicalKeys.has(key)) {
        state.values.set(key, assignment.rawRhs);
      }
    }
  }

  planLegacyVoicevoxMigration(states);

  for (const source of states) {
    for (const [key, assignment] of source.targetAssignments) {
      if (source.canonicalKeys.has(key)) {
        continue;
      }
      if (source.pair.target === ".env" && key === LEGACY_VOICEVOX_KEY) {
        source.actions.removed.add(key);
        continue;
      }

      const owners = ownership.get(key) ?? [];
      if (assignment.rawRhs === "" || owners.length === 0) {
        source.actions.removed.add(key);
        continue;
      }
      if (owners.length !== 1) {
        throw new EnvSyncError(`Ambiguous ownership: ${key} in ${source.pair.target}`);
      }

      const destination = owners[0];
      moveRawValue({ source, destination, key, rawRhs: assignment.rawRhs });
    }
  }

  for (const state of states) {
    for (const [key, exampleAssignment] of state.exampleAssignments) {
      if (!state.values.has(key)) {
        state.values.set(key, exampleAssignment.rawRhs);
        state.actions.added.add(key);
      }
    }
  }

  return states.map((state) => {
    const output = renderFromTemplate(state.exampleDocument, state.values);
    const previous = state.snapshot.exists
      ? decodeUtf8(state.snapshot.bytes, state.pair.target)
      : null;
    return {
      ...state,
      output,
      changed: previous !== output,
      created: !state.snapshot.exists,
      stagePath: null,
      backupPath: null,
    };
  });
}

function planLegacyVoicevoxMigration(states) {
  const root = states.find((state) => state.pair.target === ".env");
  const api = states.find((state) => state.pair.target === "apps/api/.env");
  const legacy = root?.targetAssignments.get(LEGACY_VOICEVOX_KEY);
  if (!legacy) {
    return;
  }
  if (!root.canonicalKeys.has(COMPOSE_VOICEVOX_KEY) || !api?.canonicalKeys.has(LEGACY_VOICEVOX_KEY)) {
    throw new EnvSyncError(`VOICEVOX migration catalogs are incomplete`);
  }

  assignMigratedRawValue(root, COMPOSE_VOICEVOX_KEY, legacy.rawRhs, root.pair.target);
  assignMigratedRawValue(api, LEGACY_VOICEVOX_KEY, legacy.rawRhs, root.pair.target);
  root.actions.removed.add(LEGACY_VOICEVOX_KEY);
}

function assignMigratedRawValue(destination, key, rawRhs, sourceFile) {
  const current = destination.values.get(key);
  if (current !== undefined && current !== "" && current !== rawRhs) {
    throw new EnvSyncError(
      `Conflicting migration value: ${key} between ${sourceFile} and ${destination.pair.target}`,
    );
  }
  if (current === undefined || current === "") {
    destination.values.set(key, rawRhs);
    destination.actions.migrated.add(key);
  }
}

function moveRawValue({ source, destination, key, rawRhs }) {
  const current = destination.values.get(key);
  if (current !== undefined && current !== "" && current !== rawRhs) {
    throw new EnvSyncError(
      `Conflicting ownership value: ${key} between ${source.pair.target} and ${destination.pair.target}`,
    );
  }
  if (current === undefined || current === "") {
    destination.values.set(key, rawRhs);
    destination.actions.moved.add(key);
  }
  source.actions.removed.add(key);
}

function parseEnvDocument(content, fileName) {
  if (content.includes("\0")) {
    throw new EnvSyncError(`Malformed environment file: ${fileName}`);
  }

  const physicalLines = splitPhysicalLines(content);
  const records = [];
  let index = 0;

  while (index < physicalLines.length) {
    const line = physicalLines[index];
    if (/^[ \t]*(?:#.*)?$/.test(line.text)) {
      records.push({ type: "text", rawText: line.text, eol: line.eol });
      index += 1;
      continue;
    }

    const match = line.text.match(/^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/);
    if (!match) {
      throw new EnvSyncError(`Malformed environment file: ${fileName} at line ${index + 1}`);
    }

    const equalsIndex = match[0].lastIndexOf("=");
    const prefix = line.text.slice(0, equalsIndex + 1);
    let rawRhs = line.text.slice(equalsIndex + 1);
    let rawText = line.text;
    let endIndex = index;
    let boundaryState = scanBoundaryState(rawRhs);
    boundaryState = scanBoundaryState(line.eol, boundaryState);

    if (isOpenQuoteState(boundaryState)) {
      while (endIndex + 1 < physicalLines.length) {
        rawRhs += physicalLines[endIndex].eol;
        endIndex += 1;
        rawRhs += physicalLines[endIndex].text;
        rawText += physicalLines[endIndex - 1].eol + physicalLines[endIndex].text;
        boundaryState = scanBoundaryState(physicalLines[endIndex].text, boundaryState);
        boundaryState = scanBoundaryState(physicalLines[endIndex].eol, boundaryState);
        if (!isOpenQuoteState(boundaryState)) {
          break;
        }
      }
      if (isOpenQuoteState(boundaryState)) {
        throw new EnvSyncError(
          `Unterminated quoted value: ${match[1]} in ${fileName} at line ${index + 1}`,
        );
      }
    }
    if (!isCompleteBoundaryState(boundaryState)) {
      throw new EnvSyncError(
        `Uncertain record boundary: ${match[1]} in ${fileName} at line ${index + 1}`,
      );
    }

    records.push({
      type: "assignment",
      key: match[1],
      prefix,
      rawRhs,
      rawText,
      eol: physicalLines[endIndex].eol,
      duplicate: false,
    });
    index = endIndex + 1;
  }

  return { records };
}

function splitPhysicalLines(content) {
  if (content === "") {
    return [];
  }
  const lines = [];
  let cursor = 0;
  while (cursor < content.length) {
    const match = /\r\n|\n|\r/.exec(content.slice(cursor));
    if (!match) {
      lines.push({ text: content.slice(cursor), eol: "" });
      break;
    }
    const lineEnd = cursor + match.index;
    lines.push({ text: content.slice(cursor, lineEnd), eol: match[0] });
    cursor = lineEnd + match[0].length;
  }
  return lines;
}

const BoundaryState = Object.freeze({
  complete: "complete",
  comment: "comment",
  escape: "escape",
  strongOpen: "strong_open",
  strongOpenEscape: "strong_open_escape",
  weakOpen: "weak_open",
  weakOpenEscape: "weak_open_escape",
  whitespace: "whitespace",
});

function scanBoundaryState(input, initialState = BoundaryState.complete) {
  let state = initialState;
  for (const character of input) {
    switch (state) {
      case BoundaryState.comment:
        return state;
      case BoundaryState.whitespace:
        if (character === "#") return BoundaryState.comment;
        if (character === "\\") state = BoundaryState.escape;
        else if (character === '"') state = BoundaryState.weakOpen;
        else if (character === "'") state = BoundaryState.strongOpen;
        else state = BoundaryState.complete;
        break;
      case BoundaryState.escape:
        state = BoundaryState.complete;
        break;
      case BoundaryState.strongOpen:
        if (character === "\\") state = BoundaryState.strongOpenEscape;
        else if (character === "'") state = BoundaryState.complete;
        break;
      case BoundaryState.strongOpenEscape:
        state = BoundaryState.strongOpen;
        break;
      case BoundaryState.weakOpen:
        if (character === "\\") state = BoundaryState.weakOpenEscape;
        else if (character === '"') state = BoundaryState.complete;
        break;
      case BoundaryState.weakOpenEscape:
        state = BoundaryState.weakOpen;
        break;
      case BoundaryState.complete:
        if (character === "\\") state = BoundaryState.escape;
        else if (character === '"') state = BoundaryState.weakOpen;
        else if (character === "'") state = BoundaryState.strongOpen;
        else if (isRuntimeBoundaryWhitespace(character)) state = BoundaryState.whitespace;
        break;
    }
  }
  return state;
}

function isRuntimeBoundaryWhitespace(character) {
  return character !== "\n" && character !== "\r" && /^\s$/u.test(character);
}

function isOpenQuoteState(state) {
  return (
    state === BoundaryState.strongOpen ||
    state === BoundaryState.strongOpenEscape ||
    state === BoundaryState.weakOpen ||
    state === BoundaryState.weakOpenEscape
  );
}

function isCompleteBoundaryState(state) {
  return state === BoundaryState.complete || state === BoundaryState.comment;
}

function indexAssignments(document, fileName) {
  const assignments = new Map();
  for (const record of document.records) {
    if (record.type !== "assignment") {
      continue;
    }
    const previous = assignments.get(record.key);
    if (!previous) {
      assignments.set(record.key, record);
      continue;
    }
    if (previous.rawText !== record.rawText) {
      throw new EnvSyncError(`Conflicting duplicate: ${record.key} in ${fileName}`);
    }
    record.duplicate = true;
  }
  return assignments;
}

function renderFromTemplate(template, values) {
  let rendered = "";
  for (const record of template.records) {
    if (record.type === "text") {
      rendered += record.rawText + record.eol;
    } else if (!record.duplicate) {
      rendered += `${record.prefix}${values.get(record.key) ?? record.rawRhs}${record.eol}`;
    }
  }
  return rendered;
}

function readSnapshot(path, required) {
  if (!existsSync(path)) {
    if (required) {
      throw new EnvSyncError(`Missing file: ${path}`);
    }
    return { exists: false, bytes: null };
  }
  return { exists: true, bytes: readFileSync(path), mode: statSync(path).mode };
}

function stagePlan(plan, stagedPlans, hooks) {
  let descriptor = null;
  try {
    plan.stagePath = createUniquePath(plan.targetPath, "stage");
    const mode = (plan.snapshot.exists ? plan.snapshot.mode : plan.exampleSnapshot.mode) & 0o777;
    descriptor = openSync(plan.stagePath, "wx", mode);
    stagedPlans.push(plan);
    writeFileSync(descriptor, plan.output, { encoding: "utf8" });
    closeSync(descriptor);
    descriptor = null;
    hooks.afterStageWrite?.({ plan });
  } catch (error) {
    throw stagingError(plan, error);
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // Cleanup of the registered stage path still runs in syncEnvFiles.
      }
    }
  }
}

function stagingError(plan, error) {
  const file = plan ? `: ${plan.pair.target}` : "";
  return new EnvSyncError(`Environment sync staging failed${file}${errorCodeSuffix(error)}`);
}

function decodeUtf8(bytes, fileName) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new EnvSyncError(`Malformed UTF-8: ${fileName}`);
  }
}

function verifyTargetSnapshots(plans) {
  for (const plan of plans) {
    const currentExists = existsSync(plan.targetPath);
    if (currentExists !== plan.snapshot.exists) {
      throw new EnvSyncError(`Concurrent change detected: ${plan.pair.target}`);
    }
    if (currentExists) {
      const current = readFileSync(plan.targetPath);
      if (!current.equals(plan.snapshot.bytes)) {
        throw new EnvSyncError(`Concurrent change detected: ${plan.pair.target}`);
      }
    }
  }
}

function rollbackReplacements(replaced, hooks) {
  const failures = [];
  for (const plan of [...replaced].reverse()) {
    try {
      hooks.beforeRollback?.({ plan });
      if (plan.snapshot.exists) {
        const restorePath = createUniquePath(plan.targetPath, "restore");
        try {
          copyFileSync(plan.backupPath, restorePath, constants.COPYFILE_EXCL);
          renameSync(restorePath, plan.targetPath);
        } finally {
          if (existsSync(restorePath)) {
            rmSync(restorePath, { force: true });
          }
        }
      } else if (existsSync(plan.targetPath)) {
        rmSync(plan.targetPath);
      }
    } catch (error) {
      failures.push(`Rollback failed: ${plan.pair.target}${errorCodeSuffix(error)}`);
    }
  }
  return failures;
}

function createUniquePath(targetPath, action) {
  mkdirSync(dirname(targetPath), { recursive: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `${targetPath}.${action}-${Date.now()}-${process.pid}-${attempt}`;
    if (!existsSync(candidate)) {
      return candidate;
    }
  }
  throw new EnvSyncError(`Unable to reserve ${action} file for ${targetPath}`);
}

function reportPlans(root, plans, logger) {
  for (const plan of plans) {
    if (plan.backupPath) {
      logger.log(`Backed up: ${relative(root, plan.backupPath)}`);
    }
    if (!plan.changed) {
      logger.log(`OK: ${plan.pair.target}`);
      continue;
    }
    const details = actionDetails(plan.actions);
    logger.log(
      `${plan.created ? "Created" : "Updated"}: ${plan.pair.target}${details ? ` (${details})` : ""}`,
    );
  }
}

function actionDetails(actions) {
  return [
    formatKeys("added", actions.added),
    formatKeys("migrated", actions.migrated),
    formatKeys("moved", actions.moved),
    formatKeys("removed", actions.removed),
  ]
    .filter(Boolean)
    .join("; ");
}

function formatKeys(action, keys) {
  return keys.size ? `${action} ${[...keys].sort().join(", ")}` : "";
}

function publicPlan(plan) {
  return {
    target: plan.pair.target,
    changed: plan.changed,
    created: plan.created,
    backupPath: plan.backupPath,
  };
}

function errorCodeSuffix(error) {
  return error && typeof error === "object" && "code" in error ? ` (${error.code})` : "";
}

export class EnvSyncError extends Error {}

export class EnvSyncTransactionError extends EnvSyncError {
  constructor(message, rollbackErrors, options) {
    super(message, options);
    this.rollbackErrors = rollbackErrors;
  }
}

function runCli() {
  try {
    syncEnvFiles();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Environment sync failed");
    if (error instanceof EnvSyncTransactionError) {
      for (const rollbackError of error.rollbackErrors) {
        console.error(rollbackError);
      }
    }
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (entryPath === fileURLToPath(import.meta.url)) {
  runCli();
}
