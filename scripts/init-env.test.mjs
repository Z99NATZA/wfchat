import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EnvSyncTransactionError,
  syncEnvFiles,
} from "./init-env.mjs";

const templates = {
  ".env.example": [
    "# root catalog",
    "ROOT_ONLY=root-default",
    "SHARED=root-shared",
    "WFCHAT_COMPOSE_VOICEVOX_BASE_URL=http://voicevox:50021",
    "",
  ].join("\n"),
  "apps/api/.env.example": [
    "# api catalog",
    "API_ONLY=api-default",
    "SHARED=api-shared",
    "VOICEVOX_BASE_URL=http://localhost:50021",
    "",
  ].join("\n"),
  "apps/web/.env.example": ["# web catalog", "WEB_ONLY=web-default", "",].join("\n"),
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the repository catalogs parse and create byte-matching targets in a temporary fixture", () => {
  const root = mkdtempSync(join(tmpdir(), "wfchat-init-catalogs-"));
  try {
    for (const example of [
      ".env.example",
      "apps/api/.env.example",
      "apps/web/.env.example",
    ]) {
      const destination = resolve(root, example);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(resolve(repositoryRoot, example), destination);
    }

    syncEnvFiles({ rootDir: root, logger: silentLogger() });
    for (const [example, target] of [
      [".env.example", ".env"],
      ["apps/api/.env.example", "apps/api/.env"],
      ["apps/web/.env.example", "apps/web/.env"],
    ]) {
      assert.equal(read(root, target), read(root, example));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebuilds in template order, preserves canonical values, moves unique keys, and removes stale keys", () => {
  usingFixture(
    {
      ".env": "API_ONLY=from-root\nSTALE=remove-me\nROOT_ONLY=user-root\n",
      "apps/api/.env": "API_ONLY=\nSHARED=user-api\nVOICEVOX_BASE_URL=http://api\n",
      "apps/web/.env": "WEB_ONLY=user-web\n",
    },
    (root) => {
      syncEnvFiles({ rootDir: root, logger: silentLogger() });

      assert.equal(
        read(root, ".env"),
        [
          "# root catalog",
          "ROOT_ONLY=user-root",
          "SHARED=root-shared",
          "WFCHAT_COMPOSE_VOICEVOX_BASE_URL=http://voicevox:50021",
          "",
        ].join("\n"),
      );
      assert.equal(
        read(root, "apps/api/.env"),
        [
          "# api catalog",
          "API_ONLY=from-root",
          "SHARED=user-api",
          "VOICEVOX_BASE_URL=http://api",
          "",
        ].join("\n"),
      );
      assert.equal(read(root, "apps/web/.env"), templates["apps/web/.env.example"].replace("web-default", "user-web"));
      assert.doesNotMatch(read(root, ".env"), /STALE|API_ONLY/);
    },
  );
});

test("creates missing targets from their catalogs without backing them up", () => {
  usingFixture({}, (root) => {
    const plans = syncEnvFiles({ rootDir: root, logger: silentLogger() });

    for (const [example, target] of [
      [".env.example", ".env"],
      ["apps/api/.env.example", "apps/api/.env"],
      ["apps/web/.env.example", "apps/web/.env"],
    ]) {
      assert.equal(read(root, target), read(root, example));
    }
    assert.ok(plans.every((plan) => plan.created && plan.backupPath === null));
  });
});

test("collapses byte-identical duplicate assignment records", () => {
  usingFixture(
    {
      ".env": "ROOT_ONLY=user\nROOT_ONLY=user\n",
    },
    (root) => {
      syncEnvFiles({ rootDir: root, logger: silentLogger() });
      assert.equal((read(root, ".env").match(/^ROOT_ONLY=/gm) ?? []).length, 1);
      assert.match(read(root, ".env"), /^ROOT_ONLY=user$/m);
    },
  );
});

test("rejects duplicate records that differ even when their right-hand sides match", () => {
  usingFixture(
    {
      ".env": "ROOT_ONLY=user\nexport ROOT_ONLY=user\n",
    },
    (root) => {
      const before = read(root, ".env");
      assert.throws(
        () => syncEnvFiles({ rootDir: root, logger: silentLogger() }),
        /Conflicting duplicate: ROOT_ONLY in \.env/,
      );
      assert.equal(read(root, ".env"), before);
      assert.deepEqual(backupFiles(root, ".env"), []);
    },
  );
});

test("treats quoted empty and whitespace right-hand sides as non-empty conflicts", async (t) => {
  for (const destinationValue of ['""', " "]) {
    await t.test(JSON.stringify(destinationValue), () => {
      usingFixture(
        {
          ".env": "API_ONLY=source-secret\n",
          "apps/api/.env": `API_ONLY=${destinationValue}\n`,
        },
        (root) => {
          assert.throws(
            () => syncEnvFiles({ rootDir: root, logger: silentLogger() }),
            /Conflicting ownership value: API_ONLY/,
          );
          assert.equal(read(root, ".env"), "API_ONLY=source-secret\n");
          assert.equal(read(root, "apps/api/.env"), `API_ONLY=${destinationValue}\n`);
        },
      );
    });
  }
});

test("rejects a non-empty misplaced key when multiple catalogs own it", () => {
  usingFixture(
    {
      "apps/web/.env": "SHARED=ambiguous-value\n",
    },
    (root) => {
      assert.throws(
        () => syncEnvFiles({ rootDir: root, logger: silentLogger() }),
        /Ambiguous ownership: SHARED in apps\/web\/\.env/,
      );
      assert.equal(read(root, "apps/web/.env"), "SHARED=ambiguous-value\n");
      assert.equal(allGeneratedFiles(root).length, 0);
    },
  );
});

test("migrates a legacy root VOICEVOX record to both canonical destinations with exact multiline raw text", () => {
  const rawValue = '"http://voicevox\nVOICEVOX_SPEAKER_ID=inside\n# still inside\n:50021"';
  usingFixture(
    {
      ".env": `VOICEVOX_BASE_URL=${rawValue}\nWFCHAT_COMPOSE_VOICEVOX_BASE_URL=\n`,
      "apps/api/.env": "VOICEVOX_BASE_URL=\n",
    },
    (root) => {
      syncEnvFiles({ rootDir: root, logger: silentLogger() });

      assert.match(
        read(root, ".env"),
        new RegExp(`WFCHAT_COMPOSE_VOICEVOX_BASE_URL=${escapeRegExp(rawValue)}`),
      );
      assert.doesNotMatch(read(root, ".env"), /^VOICEVOX_BASE_URL=/m);
      assert.match(
        read(root, "apps/api/.env"),
        new RegExp(`VOICEVOX_BASE_URL=${escapeRegExp(rawValue)}`),
      );
    },
  );
});

test("stops the whole preflight when a VOICEVOX destination conflicts", () => {
  usingFixture(
    {
      ".env": "VOICEVOX_BASE_URL=legacy\nROOT_ONLY=before\n",
      "apps/api/.env": "VOICEVOX_BASE_URL=different\n",
      "apps/web/.env": "WEB_ONLY=before\n",
    },
    (root) => {
      const before = snapshotTargets(root);
      assert.throws(
        () => syncEnvFiles({ rootDir: root, logger: silentLogger() }),
        /Conflicting migration value: VOICEVOX_BASE_URL/,
      );
      assert.deepEqual(snapshotTargets(root), before);
      assert.equal(allBackupFiles(root).length, 0);
    },
  );
});

test("a malformed file aborts global preflight before staging, backup, or target changes", () => {
  usingFixture(
    {
      ".env": "ROOT_ONLY=before\nSTALE=would-change\n",
      "apps/api/.env": "this is not an assignment\n",
      "apps/web/.env": "WEB_ONLY=before\n",
    },
    (root) => {
      const before = snapshotTargets(root);
      assert.throws(
        () => syncEnvFiles({ rootDir: root, logger: silentLogger() }),
        /Malformed environment file: apps\/api\/\.env/,
      );
      assert.deepEqual(snapshotTargets(root), before);
      assert.equal(allGeneratedFiles(root).length, 0);
    },
  );
});

test("stages every result beside its target before checking snapshots", () => {
  usingFixture(
    {
      ".env": "ROOT_ONLY=before\n",
      "apps/api/.env": "API_ONLY=before\n",
      "apps/web/.env": "WEB_ONLY=before\n",
    },
    (root) => {
      let inspected = false;
      syncEnvFiles({
        rootDir: root,
        logger: silentLogger(),
        hooks: {
          afterStage({ plans }) {
            inspected = true;
            assert.equal(plans.length, 3);
            for (const plan of plans) {
              assert.ok(existsSync(plan.stagePath));
              assert.equal(dirname(plan.stagePath), dirname(plan.targetPath));
              assert.equal(readFileSync(plan.stagePath, "utf8"), plan.output);
            }
          },
        },
      });
      assert.ok(inspected);
      assert.equal(allStageFiles(root).length, 0);
    },
  );
});

test("detects a concurrent target change after staging and does not create backups", () => {
  usingFixture(
    {
      ".env": "ROOT_ONLY=before\n",
      "apps/api/.env": "API_ONLY=before\n",
      "apps/web/.env": "WEB_ONLY=before\n",
    },
    (root) => {
      const rootBefore = read(root, ".env");
      assert.throws(
        () =>
          syncEnvFiles({
            rootDir: root,
            logger: silentLogger(),
            hooks: {
              afterStage() {
                write(root, "apps/api/.env", "API_ONLY=concurrent\n");
              },
            },
          }),
        /Concurrent change detected: apps\/api\/\.env/,
      );
      assert.equal(read(root, ".env"), rootBefore);
      assert.equal(read(root, "apps/api/.env"), "API_ONLY=concurrent\n");
      assert.equal(allBackupFiles(root).length, 0);
      assert.equal(allStageFiles(root).length, 0);
    },
  );
});

test("creates every required backup before replacing the first target", () => {
  usingFixture(
    {
      ".env": "ROOT_ONLY=before\n",
      "apps/api/.env": "API_ONLY=before\n",
      "apps/web/.env": "WEB_ONLY=before\n",
    },
    (root) => {
      let checked = false;
      syncEnvFiles({
        rootDir: root,
        logger: silentLogger(),
        hooks: {
          beforeReplace() {
            if (checked) return;
            checked = true;
            assert.equal(allBackupFiles(root).length, 3);
            assert.equal(read(root, ".env"), "ROOT_ONLY=before\n");
          },
        },
      });
      assert.ok(checked);
      assert.ok(allBackupFiles(root).every((file) => readFileSync(file, "utf8").includes("before")));
    },
  );
});

test("restores replaced targets after a partial replacement failure", () => {
  usingFixture(
    {
      ".env": "ROOT_ONLY=before\n",
      "apps/api/.env": "API_ONLY=before\n",
      "apps/web/.env": "WEB_ONLY=before\n",
    },
    (root) => {
      const before = snapshotTargets(root);
      const error = captureError(() =>
        syncEnvFiles({
          rootDir: root,
          logger: silentLogger(),
          hooks: {
            beforeReplace({ plan }) {
              if (plan.pair.target === "apps/api/.env") throw new Error("simulated replace failure");
            },
          },
        }),
      );
      assert.ok(error instanceof EnvSyncTransactionError);
      assert.deepEqual(error.rollbackErrors, []);
      assert.deepEqual(snapshotTargets(root), before);
      assert.equal(allStageFiles(root).length, 0);
    },
  );
});

test("removes a newly created target when a later replacement fails", () => {
  usingFixture(
    {
      "apps/api/.env": "API_ONLY=before\n",
      "apps/web/.env": "WEB_ONLY=before\n",
    },
    (root) => {
      assert.throws(() =>
        syncEnvFiles({
          rootDir: root,
          logger: silentLogger(),
          hooks: {
            beforeReplace({ plan }) {
              if (plan.pair.target === "apps/api/.env") throw new Error("simulated replace failure");
            },
          },
        }),
      );
      assert.equal(existsSync(resolve(root, ".env")), false);
      assert.equal(read(root, "apps/api/.env"), "API_ONLY=before\n");
    },
  );
});

test("reports rollback failures separately without exposing secret values", () => {
  usingFixture(
    {
      ".env": "ROOT_ONLY=root-secret\n",
      "apps/api/.env": "API_ONLY=api-secret\n",
      "apps/web/.env": "WEB_ONLY=web-secret\n",
    },
    (root) => {
      const error = captureError(() =>
        syncEnvFiles({
          rootDir: root,
          logger: silentLogger(),
          hooks: {
            beforeReplace({ plan }) {
              if (plan.pair.target === "apps/api/.env") throw new Error("replace-secret");
            },
            beforeRollback({ plan }) {
              if (plan.pair.target === ".env") throw new Error("rollback-secret");
            },
          },
        }),
      );
      assert.ok(error instanceof EnvSyncTransactionError);
      assert.deepEqual(error.rollbackErrors, ["Rollback failed: .env"]);
      const report = `${error.message}\n${error.rollbackErrors.join("\n")}`;
      assert.doesNotMatch(report, /root-secret|api-secret|web-secret|replace-secret|rollback-secret/);
    },
  );
});

test("never includes env values in conflict errors or successful action logs", () => {
  usingFixture(
    {
      ".env": "API_ONLY=source-super-secret\n",
      "apps/api/.env": "API_ONLY=destination-super-secret\n",
    },
    (root) => {
      const error = captureError(() => syncEnvFiles({ rootDir: root, logger: silentLogger() }));
      assert.doesNotMatch(error.message, /source-super-secret|destination-super-secret/);
    },
  );

  usingFixture(
    {
      ".env": "ROOT_ONLY=canonical-super-secret\nSTALE=stale-super-secret\n",
    },
    (root) => {
      const logger = captureLogger();
      syncEnvFiles({ rootDir: root, logger });
      assert.doesNotMatch(logger.output(), /canonical-super-secret|stale-super-secret/);
    },
  );
});

test("preserves a multiline quoted canonical record including assignment-like continuation lines", () => {
  const multiline = '"first\nSTALE=inside-value\n# inside-value\nlast"';
  usingFixture(
    {
      ".env": `ROOT_ONLY=${multiline}\nSTALE=remove\n`,
    },
    (root) => {
      syncEnvFiles({ rootDir: root, logger: silentLogger() });
      assert.match(read(root, ".env"), new RegExp(`ROOT_ONLY=${escapeRegExp(multiline)}`));
      assert.equal((read(root, ".env").match(/STALE=/g) ?? []).length, 1);
      assert.match(read(root, ".env"), /# inside-value/);
    },
  );
});

test("preserves a late-opening multiline quote with close-reopen and escaped quote states", () => {
  const multiline = 'prefix"closed""first \\"quoted\nAPI_ONLY=inside\nWEB_ONLY=inside\nSTALE=last"';
  usingFixture(
    {
      ".env": `ROOT_ONLY=${multiline}\n`,
    },
    (root) => {
      syncEnvFiles({ rootDir: root, logger: silentLogger() });
      const afterFirst = snapshotTargets(root);
      const backupsAfterFirst = allBackupFiles(root);

      assert.match(read(root, ".env"), new RegExp(`ROOT_ONLY=${escapeRegExp(multiline)}`));
      assert.doesNotMatch(read(root, "apps/api/.env"), /API_ONLY=inside/);
      assert.doesNotMatch(read(root, "apps/web/.env"), /WEB_ONLY=inside/);

      const second = syncEnvFiles({ rootDir: root, logger: silentLogger() });
      assert.deepEqual(snapshotTargets(root), afterFirst);
      assert.deepEqual(allBackupFiles(root), backupsAfterFirst);
      assert.ok(second.every((plan) => !plan.changed));
    },
  );
});

test("cleans every stage artifact and hides secrets after a post-write staging failure", () => {
  const secrets = /root-stage-secret|api-stage-secret|web-stage-secret|hook-stage-secret/;
  usingFixture(
    {
      ".env": "ROOT_ONLY=root-stage-secret\nSTALE=remove\n",
      "apps/api/.env": "API_ONLY=api-stage-secret\n",
      "apps/web/.env": "WEB_ONLY=web-stage-secret\n",
    },
    (root) => {
      chmodSync(resolve(root, ".env"), 0o600);
      const before = snapshotTargets(root);
      const logger = captureLogger();
      const error = captureError(() =>
        syncEnvFiles({
          rootDir: root,
          logger,
          hooks: {
            afterStageWrite({ plan }) {
              const targetMode = statSync(plan.targetPath).mode & 0o777;
              const stageMode = statSync(plan.stagePath).mode & 0o777;
              assert.equal(stageMode, targetMode);
              if (plan.pair.target === "apps/api/.env") {
                throw new Error("hook-stage-secret");
              }
            },
          },
        }),
      );

      assert.match(error.message, /Environment sync staging failed: apps\/api\/\.env/);
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(error.message, secrets);
      assert.doesNotMatch(logger.output(), secrets);
      assert.equal(logger.output(), "");
      assert.deepEqual(snapshotTargets(root), before);
      assert.equal(allStageFiles(root).length, 0);
      assert.equal(allBackupFiles(root).length, 0);
    },
  );
});

test("rejects an unterminated multiline record without changing any target", () => {
  usingFixture(
    {
      ".env": 'ROOT_ONLY="first\nAPI_ONLY=inside\n',
      "apps/api/.env": "API_ONLY=before\n",
      "apps/web/.env": "WEB_ONLY=before\n",
    },
    (root) => {
      const before = snapshotTargets(root);
      assert.throws(
        () => syncEnvFiles({ rootDir: root, logger: silentLogger() }),
        /Unterminated quoted value: ROOT_ONLY in \.env/,
      );
      assert.deepEqual(snapshotTargets(root), before);
      assert.equal(allGeneratedFiles(root).length, 0);
    },
  );
});

test("a repeat run is byte-idempotent and creates no additional backups", () => {
  usingFixture(
    {
      ".env": "ROOT_ONLY=user\nSTALE=remove\n",
      "apps/api/.env": "API_ONLY=user\n",
      "apps/web/.env": "WEB_ONLY=user\n",
    },
    (root) => {
      syncEnvFiles({ rootDir: root, logger: silentLogger() });
      const afterFirst = snapshotTargets(root);
      const backupsAfterFirst = allBackupFiles(root);
      const second = syncEnvFiles({ rootDir: root, logger: silentLogger() });

      assert.deepEqual(snapshotTargets(root), afterFirst);
      assert.deepEqual(allBackupFiles(root), backupsAfterFirst);
      assert.ok(second.every((plan) => !plan.changed && plan.backupPath === null));
      assert.equal(allStageFiles(root).length, 0);
    },
  );
});

function usingFixture(targets, callback) {
  const root = mkdtempSync(join(tmpdir(), "wfchat-init-"));
  try {
    for (const [file, content] of Object.entries(templates)) write(root, file, content);
    for (const [file, content] of Object.entries(targets)) write(root, file, content);
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function write(root, file, content) {
  const path = resolve(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function read(root, file) {
  return readFileSync(resolve(root, file), "utf8");
}

function snapshotTargets(root) {
  return [".env", "apps/api/.env", "apps/web/.env"].map((file) => [
    file,
    existsSync(resolve(root, file)) ? read(root, file) : null,
  ]);
}

function generatedFiles(root, marker) {
  const results = [];
  for (const directory of [root, join(root, "apps/api"), join(root, "apps/web")]) {
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      if (file.includes(marker)) results.push(resolve(directory, file));
    }
  }
  return results.sort();
}

function allGeneratedFiles(root) {
  return [...generatedFiles(root, ".stage-"), ...generatedFiles(root, ".backup-")].sort();
}

function allStageFiles(root) {
  return generatedFiles(root, ".stage-");
}

function allBackupFiles(root) {
  return generatedFiles(root, ".backup-");
}

function backupFiles(root, target) {
  const targetPath = resolve(root, target);
  return readdirSync(dirname(targetPath))
    .filter((file) => file.startsWith(`${basename(targetPath)}.backup-`))
    .sort();
}

function silentLogger() {
  return { log() {} };
}

function captureLogger() {
  const lines = [];
  return {
    log(message) {
      lines.push(message);
    },
    output() {
      return lines.join("\n");
    },
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function captureError(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  assert.fail("expected callback to throw");
}
