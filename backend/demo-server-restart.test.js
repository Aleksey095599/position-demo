"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const PREPARE_SCRIPT_PATH = path.join(ROOT, "scripts", "prepare-demo-port.mjs");

async function runtimeModule() {
  return import(pathToFileURL(PREPARE_SCRIPT_PATH).href);
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await closeServer(server);
  return port;
}

async function waitFor(predicate, timeoutMilliseconds = 8000) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error("Timed out while waiting for the demo server state.");
}

test("runtime identity requires the same application, project, port and PID", async () => {
  const {
    DEMO_APPLICATION_ID,
    parseWindowsTcpListeners,
    runtimeRecordMatches
  } = await runtimeModule();
  const record = {
    application: DEMO_APPLICATION_ID,
    projectRoot: ROOT,
    port: 8000,
    pid: 1234
  };

  assert.deepEqual(
    parseWindowsTcpListeners(
      "  TCP    127.0.0.1:8000    0.0.0.0:0    LISTENING    1234\r\n" +
      "  TCP    127.0.0.1:8001    0.0.0.0:0    LISTENING    5678\r\n",
      8000
    ),
    [1234]
  );
  assert.equal(runtimeRecordMatches(record, { projectRoot: ROOT, port: 8000, pid: 1234 }), true);
  assert.equal(runtimeRecordMatches(record, { projectRoot: ROOT, port: 8000, pid: 5678 }), false);
  assert.equal(runtimeRecordMatches(record, { projectRoot: path.dirname(ROOT), port: 8000, pid: 1234 }), false);
});

test("Windows launcher prepares the configured port before starting the server", () => {
  const launcher = fs.readFileSync(path.join(ROOT, "start-demo.bat"), "utf8");
  const buildIndex = launcher.indexOf("node scripts\\build-frontend.mjs");
  const prepareIndex = launcher.indexOf("node scripts\\prepare-demo-port.mjs");
  const serverIndex = launcher.indexOf("node --no-warnings server.js");

  assert.match(launcher, /set "DEMO_PORT=8000"/);
  assert.ok(buildIndex >= 0);
  assert.ok(prepareIndex > buildIndex);
  assert.ok(serverIndex > prepareIndex);
});

test("port preparation never stops an unverified listener", {
  skip: process.platform !== "win32"
}, async () => {
  const { prepareDemoPort, runtimeFilePath } = await runtimeModule();
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  fs.rmSync(runtimeFilePath(ROOT, port), { force: true });

  try {
    await assert.rejects(
      prepareDemoPort({ projectRoot: ROOT, port, timeoutMilliseconds: 500 }),
      /another or unverified process/
    );
    assert.equal(server.listening, true);
  } finally {
    await closeServer(server);
  }
});

test("port preparation replaces a verified server from the same project", {
  skip: process.platform !== "win32",
  timeout: 15000
}, async () => {
  const { prepareDemoPort, runtimeFilePath } = await runtimeModule();
  const port = await unusedPort();
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "position-demo-restart-"));
  const databasePath = path.join(temporaryDirectory, "demo.sqlite");
  const filePath = runtimeFilePath(ROOT, port);
  fs.rmSync(filePath, { force: true });
  const child = spawn(process.execPath, ["--no-warnings", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      DEMO_PORT: String(port),
      DEMO_DATABASE_PATH: databasePath
    },
    stdio: "ignore",
    windowsHide: true
  });

  try {
    await waitFor(() => fs.existsSync(filePath) || child.exitCode !== null);
    assert.equal(child.exitCode, null);
    const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
    assert.equal(record.pid, child.pid);

    const result = await prepareDemoPort({ projectRoot: ROOT, port });

    assert.equal(result.stoppedPid, child.pid);
    await waitFor(() => child.exitCode !== null || child.signalCode !== null);
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await waitFor(() => child.exitCode !== null || child.signalCode !== null);
    }

    fs.rmSync(filePath, { force: true });
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
