import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  DEMO_APPLICATION_ID,
  runtimeFilePath,
  runtimeRecordMatches
} = require("./demo-server-runtime.cjs");

export { DEMO_APPLICATION_ID, runtimeFilePath, runtimeRecordMatches };

export function parseWindowsTcpListeners(output, port) {
  const expectedPort = String(port);

  return String(output || "")
    .split(/\r?\n/)
    .map(line => line.trim().split(/\s+/))
    .filter(columns =>
      columns.length >= 5
      && columns[0].toUpperCase() === "TCP"
      && columns[3].toUpperCase() === "LISTENING"
      && columns[1].slice(columns[1].lastIndexOf(":") + 1) === expectedPort
    )
    .map(columns => Number(columns[4]))
    .filter(Number.isSafeInteger);
}

function listenerPids(port) {
  if (process.platform !== "win32") {
    throw new Error("Automatic replacement of the demo server is supported by start-demo.bat on Windows only.");
  }

  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
    windowsHide: true
  });

  if (result.error || result.status !== 0) {
    throw result.error || new Error(`netstat exited with code ${result.status}.`);
  }

  return [...new Set(parseWindowsTcpListeners(result.stdout, port))];
}

function readRuntimeRecord(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw new Error(`Cannot read ${filePath}: ${error.message}`);
  }
}

function removeRuntimeRecord(filePath, expectedRecord) {
  const currentRecord = readRuntimeRecord(filePath);

  if (currentRecord && runtimeRecordMatches(currentRecord, expectedRecord)) {
    fs.rmSync(filePath, { force: true });
  }
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function prepareDemoPort({ projectRoot, port, timeoutMilliseconds = 5000 }) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const filePath = runtimeFilePath(resolvedProjectRoot, port);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let pids = listenerPids(port);

  if (pids.length === 0) {
    const staleRecord = readRuntimeRecord(filePath);

    if (staleRecord && runtimeRecordMatches(staleRecord, {
      projectRoot: resolvedProjectRoot,
      port,
      pid: staleRecord.pid
    })) {
      fs.rmSync(filePath, { force: true });
    }

    return { stoppedPid: null };
  }

  if (pids.length !== 1) {
    throw new Error(`Port ${port} has multiple listening processes and none were stopped.`);
  }

  const pid = pids[0];
  const expectedRecord = { projectRoot: resolvedProjectRoot, port, pid };
  const runtimeRecord = readRuntimeRecord(filePath);

  if (!runtimeRecordMatches(runtimeRecord, expectedRecord)) {
    throw new Error(
      `Port ${port} is occupied by another or unverified process (PID ${pid}). It was not stopped.`
    );
  }

  pids = listenerPids(port);

  if (pids.length !== 1 || pids[0] !== pid) {
    throw new Error(`The process listening on port ${port} changed during verification. Nothing was stopped.`);
  }

  process.kill(pid, "SIGTERM");

  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    await wait(100);

    if (!listenerPids(port).includes(pid)) {
      removeRuntimeRecord(filePath, expectedRecord);
      return { stoppedPid: pid };
    }
  }

  throw new Error(`The existing demo server (PID ${pid}) did not release port ${port}.`);
}

async function main() {
  const configuredPort = Number(process.env.DEMO_PORT);
  const port = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535
    ? configuredPort
    : 8000;
  const result = await prepareDemoPort({ projectRoot: process.cwd(), port });

  if (result.stoppedPid) {
    console.log(`Stopped the previous Demo FX Position Application (PID ${result.stoppedPid}).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
