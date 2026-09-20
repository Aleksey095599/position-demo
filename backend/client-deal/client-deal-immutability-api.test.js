"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("Client Deal updates, including comments, are rejected without changing stored deals", async t => {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, "client-deal-immutable-"));
  const previousPath = process.env.DEMO_DATABASE_PATH;
  process.env.DEMO_DATABASE_PATH = path.join(directory, "test.sqlite");
  const server = require("../../server.js");
  t.after(() => {
    server.closeDatabase();
    if (previousPath === undefined) delete process.env.DEMO_DATABASE_PATH;
    else process.env.DEMO_DATABASE_PATH = previousPath;
    const relative = path.relative(temporaryRoot, path.resolve(directory));
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    assert.ok(path.basename(directory).startsWith("client-deal-immutable-"));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  async function request(method, pathname, body) {
    let status;
    let result;
    const handled = await server.handleApi({
      method,
      async *[Symbol.asyncIterator]() {
        if (body !== undefined) yield Buffer.from(JSON.stringify(body));
      }
    }, {
      writeHead(value) { status = value; },
      end(value) { result = JSON.parse(value); }
    }, new URL(pathname, "http://localhost"));
    assert.equal(handled, true);
    return { status, result };
  }

  const before = await request("GET", "/api/v1/client-deals");
  assert.equal(before.status, 200);
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const response = await request(method, "/api/v1/client-deals/1", { comment: "Changed comment" });
    assert.equal(response.status, 405);
    assert.match(JSON.stringify(response.result), /CLIENT_DEAL_IMMUTABLE/);
  }
  assert.deepEqual(await request("GET", "/api/v1/client-deals"), before);
});
