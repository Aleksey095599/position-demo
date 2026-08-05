"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

function databaseWithCanonicalSchema() {
  const database = new DatabaseSync(":memory:");
  const repositoryRoot = path.resolve(__dirname, "..", "..", "..", "..");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(fs.readFileSync(path.join(repositoryRoot, "schema.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(repositoryRoot, "seed.sql"), "utf8"));
  return database;
}

test("manual formation persists no Batching Window timestamps", () => {
  const database = databaseWithCanonicalSchema();

  try {
    const batchId = Number(database.prepare(`
      INSERT INTO fx_batches (idempotency_key, ccy_pair_code)
      VALUES ('manual-formation-timing', 'EUR_USD')
    `).run().lastInsertRowid);
    const batch = database.prepare(`
      SELECT window_opened_at, window_closed_at, created_at
      FROM fx_batches
      WHERE batch_id = ?
    `).get(batchId);

    assert.equal(batch.window_opened_at, null);
    assert.equal(batch.window_closed_at, null);
    assert.match(batch.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  } finally {
    database.close();
  }
});

test("automatic formation persists an explicit Batching Window before formation", () => {
  const database = databaseWithCanonicalSchema();

  try {
    database.prepare(`
      INSERT INTO fx_batches
        (
          idempotency_key,
          ccy_pair_code,
          formation_reason_code,
          window_opened_at,
          window_closed_at,
          created_at
        )
      VALUES (?, 'EUR_USD', 'MAX_INTERVAL_REACHED', ?, ?, ?)
    `).run(
      "automatic-formation-timing",
      "2026-08-05T09:00:00.000Z",
      "2026-08-05T09:01:00.000Z",
      "2026-08-05T09:01:00.005Z"
    );

    const batch = database.prepare(`
      SELECT window_opened_at, window_closed_at, created_at
      FROM fx_batches
      WHERE idempotency_key = 'automatic-formation-timing'
    `).get();

    assert.equal(batch.window_opened_at, "2026-08-05T09:00:00.000Z");
    assert.equal(batch.window_closed_at, "2026-08-05T09:01:00.000Z");
    assert.equal(batch.created_at, "2026-08-05T09:01:00.005Z");
  } finally {
    database.close();
  }
});

test("database rejects invented or inconsistent Batching Window timelines", () => {
  const database = databaseWithCanonicalSchema();
  const insert = database.prepare(`
    INSERT INTO fx_batches
      (
        idempotency_key,
        ccy_pair_code,
        formation_reason_code,
        window_opened_at,
        window_closed_at,
        created_at
      )
    VALUES (?, 'EUR_USD', ?, ?, ?, ?)
  `);

  try {
    assert.throws(() => insert.run(
      "automatic-without-window",
      "MAX_INTERVAL_REACHED",
      null,
      null,
      "2026-08-05T09:01:00.000Z"
    ));
    assert.throws(() => insert.run(
      "manual-with-window",
      "MANUAL_SELECTION",
      "2026-08-05T09:00:00.000Z",
      "2026-08-05T09:01:00.000Z",
      "2026-08-05T09:01:00.005Z"
    ));
    assert.throws(() => insert.run(
      "window-closed-before-opened",
      "TRANSFER_RATE_CORRIDOR_BREACHED",
      "2026-08-05T09:01:00.000Z",
      "2026-08-05T09:00:59.999Z",
      "2026-08-05T09:01:00.005Z"
    ));
    assert.throws(() => insert.run(
      "batch-formed-before-window-closed",
      "MAX_INTERVAL_REACHED",
      "2026-08-05T09:00:00.000Z",
      "2026-08-05T09:01:00.000Z",
      "2026-08-05T09:00:59.999Z"
    ));
  } finally {
    database.close();
  }
});
