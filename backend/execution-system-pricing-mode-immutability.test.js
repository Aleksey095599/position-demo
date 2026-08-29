"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { readFrontendSources } = require("./test-support/frontend-source.js");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA_PATH = path.join(ROOT, "schema.sql");
const SEED_PATH = path.join(ROOT, "seed.sql");
const SERVER_PATH = path.join(ROOT, "server.js");
const TEMPORARY_DIRECTORY_PREFIX = "position-execution-system-pricing-mode-";
const { combinedSource: html, appScript: inlineScript } = readFrontendSources(ROOT);
const serverSource = fs.readFileSync(SERVER_PATH, "utf8");

function topLevelFunctionSource(name) {
  const asyncMarker = `async function ${name}(`;
  const marker = inlineScript.includes(asyncMarker)
    ? asyncMarker
    : `function ${name}(`;
  const start = inlineScript.indexOf(marker);
  assert.notEqual(start, -1, `Expected inline function ${name}.`);
  const remainingSource = inlineScript.slice(start + marker.length);
  const nextFunctionMatch = /\n    (?:async )?function [A-Za-z_$][\w$]*\s*\(/.exec(remainingSource);
  const end = nextFunctionMatch
    ? start + marker.length + nextFunctionMatch.index
    : inlineScript.length;
  return inlineScript.slice(start, end).trim();
}

function serverTopLevelFunctionSource(name) {
  const marker = `function ${name}(`;
  const start = serverSource.indexOf(marker);
  assert.notEqual(start, -1, `Expected server function ${name}.`);
  const remainingSource = serverSource.slice(start + marker.length);
  const nextFunctionMatch = /\nfunction [A-Za-z_$][\w$]*\s*\(/.exec(remainingSource);
  const end = nextFunctionMatch
    ? start + marker.length + nextFunctionMatch.index
    : serverSource.length;
  return serverSource.slice(start, end).trim();
}

function freshSeededDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  database.exec(fs.readFileSync(SEED_PATH, "utf8"));
  return database;
}

function legacyExecutionContextDatabase({ duplicateContext = false } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE servicing_locations
    (
      servicing_location_id TEXT PRIMARY KEY
    );
    CREATE TABLE accounting_systems
    (
      accounting_system_id TEXT PRIMARY KEY
    );
    CREATE TABLE execution_systems
    (
      execution_system_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pricing_mode TEXT NOT NULL,
      is_active INTEGER NOT NULL
    );
    CREATE TABLE ccy_pair_options
    (
      ccy_pair_code TEXT PRIMARY KEY
    );
    CREATE TABLE trading_counterparties
    (
      counterparty_id INTEGER PRIMARY KEY
    );
    CREATE TABLE execution_contexts
    (
      execution_context_id TEXT PRIMARY KEY,
      servicing_location_id TEXT NOT NULL
        REFERENCES servicing_locations (servicing_location_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      accounting_system_id TEXT
        REFERENCES accounting_systems (accounting_system_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      execution_system_id TEXT NOT NULL
        REFERENCES execution_systems (execution_system_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    );
    CREATE TABLE trading_counterparty_execution_contexts
    (
      counterparty_id INTEGER NOT NULL,
      execution_context_id TEXT NOT NULL
    );
    CREATE TABLE pricing_rules
    (
      pricing_rule_id INTEGER PRIMARY KEY,
      counterparty_id INTEGER NOT NULL,
      execution_context_id TEXT NOT NULL,
      ccy_pair_code TEXT NOT NULL,
      margin_percent REAL NOT NULL
    );

    INSERT INTO servicing_locations VALUES ('000');
    INSERT INTO accounting_systems VALUES ('AFINA');
    INSERT INTO execution_systems VALUES
      ('VERIFY_MODE_LOCK', 'Verification Execution System', 'DEALER_APPROVED', 1);
    INSERT INTO ccy_pair_options VALUES ('EUR_USD');
    INSERT INTO trading_counterparties VALUES (1);
    INSERT INTO execution_contexts VALUES
      ('LEGACY_CONTEXT', '000', 'AFINA', 'VERIFY_MODE_LOCK');
    INSERT INTO trading_counterparty_execution_contexts VALUES (1, 'LEGACY_CONTEXT');
    INSERT INTO pricing_rules VALUES (1, 1, 'LEGACY_CONTEXT', 'EUR_USD', 0.1);

    CREATE TRIGGER trg_execution_systems_lock_pricing_mode_while_referenced
    BEFORE UPDATE OF pricing_mode ON execution_systems
    FOR EACH ROW
    WHEN NEW.pricing_mode <> OLD.pricing_mode
      AND EXISTS
      (
        SELECT 1
        FROM execution_contexts context
        WHERE context.execution_system_id = OLD.execution_system_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'an Execution System used by Execution Context cannot change Pricing Mode');
    END;
  `);

  if (duplicateContext) {
    database.prepare(`
      INSERT INTO execution_contexts VALUES
        ('LEGACY_CONTEXT_DUPLICATE', '000', 'AFINA', 'VERIFY_MODE_LOCK')
    `).run();
  }

  return database;
}

function removeOwnedTemporaryDirectory(temporaryDirectory) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolvedDirectory = path.resolve(temporaryDirectory);
  const relativeDirectory = path.relative(temporaryRoot, resolvedDirectory);

  assert.ok(relativeDirectory && !relativeDirectory.startsWith(".."));
  assert.equal(path.isAbsolute(relativeDirectory), false);
  assert.match(
    path.basename(resolvedDirectory),
    new RegExp(`^${TEMPORARY_DIRECTORY_PREFIX}`)
  );
  fs.rmSync(resolvedDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  });
}

function apiClient(handleApi) {
  return async function request(method, pathname, body) {
    let statusCode = 0;
    let responseBody = "";
    const serializedBody = body === undefined ? "" : JSON.stringify(body);
    const apiRequest = {
      method,
      async *[Symbol.asyncIterator]() {
        if (serializedBody) {
          yield Buffer.from(serializedBody, "utf8");
        }
      }
    };
    const response = {
      writeHead(code) {
        statusCode = code;
      },
      end(chunk = "") {
        responseBody += chunk;
      }
    };
    const handled = await handleApi(
      apiRequest,
      response,
      new URL(pathname, "http://127.0.0.1:8000")
    );

    return {
      handled,
      statusCode,
      body: responseBody ? JSON.parse(responseBody) : null
    };
  };
}

function executionSystemPayload({
  executionSystemId = "VERIFY_MODE_LOCK",
  name = "Verification Execution System",
  pricingMode = "DEALER_APPROVED",
  active = true
} = {}) {
  return { executionSystemId, name, pricingMode, active };
}

test("database locks Pricing Mode only while Execution Contexts are attached", () => {
  const database = freshSeededDatabase();

  try {
    database.prepare(`
      INSERT INTO execution_systems
        (execution_system_id, name, pricing_mode, is_active)
      VALUES ('VERIFY_MODE_LOCK', 'Verification Execution System', 'DEALER_APPROVED', 1)
    `).run();
    database.prepare(`
      UPDATE execution_systems
      SET pricing_mode = 'DEALER_PRICED'
      WHERE execution_system_id = 'VERIFY_MODE_LOCK'
    `).run();
    assert.equal(
      database.prepare(`
        SELECT pricing_mode AS pricingMode
        FROM execution_systems
        WHERE execution_system_id = 'VERIFY_MODE_LOCK'
      `).get().pricingMode,
      "DEALER_PRICED"
    );

    const executionContextId = Number(database.prepare(`
      INSERT INTO execution_contexts
        (
          servicing_location_id,
          accounting_system_id,
          execution_system_id,
          default_position_management_mode
        )
      VALUES ('000', 'AFINA', 'VERIFY_MODE_LOCK', 'MANUAL')
    `).run().lastInsertRowid);

    assert.throws(() => database.prepare(`
      UPDATE execution_systems
      SET name = 'Must Roll Back', pricing_mode = 'AUTO_PRICED'
      WHERE execution_system_id = 'VERIFY_MODE_LOCK'
    `).run(), /used by Execution Context cannot change Pricing Mode/);
    assert.deepEqual(
      { ...database.prepare(`
        SELECT name, pricing_mode AS pricingMode
        FROM execution_systems
        WHERE execution_system_id = 'VERIFY_MODE_LOCK'
      `).get() },
      {
        name: "Verification Execution System",
        pricingMode: "DEALER_PRICED"
      }
    );

    database.prepare(`
      UPDATE execution_systems
      SET name = 'Allowed Metadata Update',
          pricing_mode = pricing_mode,
          is_active = 0
      WHERE execution_system_id = 'VERIFY_MODE_LOCK'
    `).run();
    assert.deepEqual(
      { ...database.prepare(`
        SELECT name, pricing_mode AS pricingMode, is_active AS active
        FROM execution_systems
        WHERE execution_system_id = 'VERIFY_MODE_LOCK'
      `).get() },
      {
        name: "Allowed Metadata Update",
        pricingMode: "DEALER_PRICED",
        active: 0
      }
    );

    database.prepare(`
      DELETE FROM execution_contexts
      WHERE execution_context_id = ?
    `).run(executionContextId);
    database.prepare(`
      UPDATE execution_systems
      SET pricing_mode = 'AUTO_PRICED'
      WHERE execution_system_id = 'VERIFY_MODE_LOCK'
    `).run();
    assert.equal(
      database.prepare(`
        SELECT pricing_mode AS pricingMode
        FROM execution_systems
        WHERE execution_system_id = 'VERIFY_MODE_LOCK'
      `).get().pricingMode,
      "AUTO_PRICED"
    );
  } finally {
    database.close();
  }
});

test("legacy Execution Context migration restores the Pricing Mode lock atomically", () => {
  const migrateLegacyExecutionContextIds = new Function(
    `${serverTopLevelFunctionSource("migrateLegacyExecutionContextIds")}; return migrateLegacyExecutionContextIds;`
  )();
  const migratedDatabase = legacyExecutionContextDatabase();
  const rejectedMigrationDatabase = legacyExecutionContextDatabase({
    duplicateContext: true
  });

  try {
    migrateLegacyExecutionContextIds(migratedDatabase);
    assert.equal(
      migratedDatabase.prepare(`
        SELECT type
        FROM pragma_table_info('execution_contexts')
        WHERE name = 'execution_context_id'
      `).get().type,
      "INTEGER"
    );
    assert.ok(migratedDatabase.prepare(`
      SELECT 1
      FROM pragma_table_info('pricing_rules')
      WHERE name = 'auto_hedging_admission_mode_override'
    `).get());
    assert.equal(
      migratedDatabase.prepare(`
        SELECT auto_hedging_admission_mode_override AS admissionOverride
        FROM pricing_rules
        WHERE pricing_rule_id = 1
      `).get().admissionOverride,
      null
    );
    assert.ok(migratedDatabase.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'trigger'
        AND name = 'trg_execution_systems_lock_pricing_mode_while_referenced'
    `).get());
    assert.throws(() => migratedDatabase.prepare(`
      UPDATE execution_systems
      SET pricing_mode = 'AUTO_PRICED'
      WHERE execution_system_id = 'VERIFY_MODE_LOCK'
    `).run(), /used by Execution Context cannot change Pricing Mode/);

    assert.throws(
      () => migrateLegacyExecutionContextIds(rejectedMigrationDatabase),
      /UNIQUE constraint failed/
    );
    assert.equal(
      rejectedMigrationDatabase.prepare(`
        SELECT type
        FROM pragma_table_info('execution_contexts')
        WHERE name = 'execution_context_id'
      `).get().type,
      "TEXT"
    );
    assert.ok(rejectedMigrationDatabase.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'trigger'
        AND name = 'trg_execution_systems_lock_pricing_mode_while_referenced'
    `).get());
    assert.throws(() => rejectedMigrationDatabase.prepare(`
      UPDATE execution_systems
      SET pricing_mode = 'AUTO_PRICED'
      WHERE execution_system_id = 'VERIFY_MODE_LOCK'
    `).run(), /used by Execution Context cannot change Pricing Mode/);
  } finally {
    migratedDatabase.close();
    rejectedMigrationDatabase.close();
  }
});

test("Execution System API rejects a Pricing Mode change only while referenced", async t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), TEMPORARY_DIRECTORY_PREFIX)
  );
  const databasePath = path.join(temporaryDirectory, "pricing-mode.sqlite");
  const previousDatabasePath = process.env.DEMO_DATABASE_PATH;
  let closeDatabase = null;

  t.after(() => {
    try {
      closeDatabase?.();
    } finally {
      if (previousDatabasePath === undefined) {
        delete process.env.DEMO_DATABASE_PATH;
      } else {
        process.env.DEMO_DATABASE_PATH = previousDatabasePath;
      }

      removeOwnedTemporaryDirectory(temporaryDirectory);
    }
  });

  process.env.DEMO_DATABASE_PATH = databasePath;
  const server = require(SERVER_PATH);
  closeDatabase = server.closeDatabase;
  const request = apiClient(server.handleApi);

  const created = await request(
    "POST",
    "/api/v1/execution-systems",
    executionSystemPayload()
  );
  assert.equal(created.handled, true);
  assert.equal(created.statusCode, 201);

  const changedWhileUnused = await request(
    "PUT",
    "/api/v1/execution-systems/VERIFY_MODE_LOCK",
    executionSystemPayload({ pricingMode: "DEALER_PRICED" })
  );
  assert.equal(changedWhileUnused.statusCode, 200);
  assert.equal(changedWhileUnused.body.pricingMode, "DEALER_PRICED");

  const attachedContext = await request("POST", "/api/v1/execution-contexts", {
    servicingLocationId: "000",
    accountingSystemId: "AFINA",
    executionSystemId: "VERIFY_MODE_LOCK",
    defaultPositionManagementMode: "MANUAL"
  });
  assert.equal(attachedContext.statusCode, 201);

  const metadataUpdate = await request(
    "PUT",
    "/api/v1/execution-systems/VERIFY_MODE_LOCK",
    executionSystemPayload({
      name: "Allowed Metadata Update",
      pricingMode: "DEALER_PRICED",
      active: false
    })
  );
  assert.equal(metadataUpdate.statusCode, 200);
  assert.equal(metadataUpdate.body.name, "Allowed Metadata Update");
  assert.equal(metadataUpdate.body.active, false);

  const rejectedModeChange = await request(
    "PUT",
    "/api/v1/execution-systems/VERIFY_MODE_LOCK",
    executionSystemPayload({
      name: "Must Not Persist",
      pricingMode: "AUTO_PRICED",
      active: true
    })
  );
  assert.equal(rejectedModeChange.statusCode, 409);
  assert.equal(
    rejectedModeChange.body.code,
    "EXECUTION_SYSTEM_PRICING_MODE_IMMUTABLE"
  );
  assert.match(rejectedModeChange.body.message, /used by Execution Context/);

  const systemsAfterRejection = await request("GET", "/api/v1/execution-systems");
  const persistedSystem = systemsAfterRejection.body.find(
    system => system.executionSystemId === "VERIFY_MODE_LOCK"
  );
  assert.deepEqual(
    {
      name: persistedSystem.name,
      pricingMode: persistedSystem.pricingMode,
      active: persistedSystem.active,
      executionContextCount: persistedSystem.executionContextCount
    },
    {
      name: "Allowed Metadata Update",
      pricingMode: "DEALER_PRICED",
      active: false,
      executionContextCount: 1
    }
  );

  const contextId = encodeURIComponent(attachedContext.body.executionContextId);
  const deletedContext = await request(
    "DELETE",
    `/api/v1/execution-contexts/${contextId}`
  );
  assert.equal(deletedContext.statusCode, 204);

  const changedAfterDetach = await request(
    "PUT",
    "/api/v1/execution-systems/VERIFY_MODE_LOCK",
    executionSystemPayload({
      name: "Allowed After Detach",
      pricingMode: "AUTO_PRICED",
      active: true
    })
  );
  assert.equal(changedAfterDetach.statusCode, 200);
  assert.equal(changedAfterDetach.body.pricingMode, "AUTO_PRICED");
});

test("Execution System editor disables Pricing Mode only for referenced rows", () => {
  const renderReferenceDataEditRow = new Function(
    "referenceDataKindLabel",
    "referenceDataUsageCount",
    "escapeHtml",
    "pricingTypeOptions",
    "pricingTypePresentation",
    "activeBooleanOptions",
    "executionSystemLabelMarkup",
    "attachedExecutionContextsButtonMarkup",
    `${topLevelFunctionSource("renderReferenceDataEditRow")}; return renderReferenceDataEditRow;`
  )(
    () => "Execution System",
    (_kind, item) => item.executionContextCount || 0,
    value => String(value ?? ""),
    selected => `<option value="${selected}" selected>${selected}</option>`,
    selected => ({ label: selected.replaceAll("_", " ") }),
    () => '<option value="true" selected>Active</option>',
    () => "Execution System preview",
    () => "Attached contexts"
  );
  const item = {
    tradeCaptureChannelId: "VERIFY_MODE_LOCK",
    tradeCaptureChannelName: "Verification Execution System",
    pricingType: "DEALER_APPROVED",
    isActive: true,
    executionContextCount: 0
  };

  const createMarkup = renderReferenceDataEditRow(
    "tradeCaptureChannel",
    item,
    null
  );
  const unusedMarkup = renderReferenceDataEditRow(
    "tradeCaptureChannel",
    item,
    0
  );
  const referencedMarkup = renderReferenceDataEditRow(
    "tradeCaptureChannel",
    { ...item, executionContextCount: 2 },
    0
  );

  assert.doesNotMatch(createMarkup, /reference-readonly-control/);
  assert.doesNotMatch(createMarkup, /data-reference-field="pricingType"[^>]* disabled/);
  assert.doesNotMatch(unusedMarkup, /reference-readonly-control/);
  assert.doesNotMatch(unusedMarkup, /data-reference-field="pricingType"[^>]* disabled/);
  assert.match(referencedMarkup, /class="reference-readonly-control"/);
  assert.match(referencedMarkup, /tabindex="0"/);
  assert.match(referencedMarkup, /role="group"/);
  assert.match(referencedMarkup, /aria-disabled="true"/);
  assert.match(
    referencedMarkup,
    /aria-label="Pricing Mode: DEALER APPROVED\. Pricing Mode is locked while Execution Contexts are attached\./
  );
  assert.match(referencedMarkup, /data-tooltip="Pricing Mode is locked while Execution Contexts are attached\./);
  assert.match(referencedMarkup, /data-reference-field="pricingType"[^>]* disabled/);
  assert.match(referencedMarkup, /value="DEALER_APPROVED" selected/);

  assert.match(
    html,
    /\.inline-edit-control:disabled\s*\{[\s\S]*?background-color: var\(--bs-secondary-bg\);[\s\S]*?opacity: 1;/
  );
  assert.match(
    html,
    /\.reference-readonly-control:focus-visible\s*\{[\s\S]*?outline: 2px solid rgba\(var\(--bs-primary-rgb\), 0\.28\);/
  );
  assert.match(
    topLevelFunctionSource("updateReferenceDataRowSaveAvailability"),
    /item\.pricingType !== oldItem\.pricingType[\s\S]*?referenceDataUsageCount\(kind, oldItem\) > 0/
  );
  assert.match(
    topLevelFunctionSource("saveReferenceDataFromRow"),
    /item\.pricingType !== oldItem\.pricingType[\s\S]*?referenceDataUsageCount\(kind, oldItem\) > 0/
  );
});
