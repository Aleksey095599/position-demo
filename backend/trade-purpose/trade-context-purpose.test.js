"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { migrateTradeContextPurpose } = require("./infrastructure/persistence/migrate-trade-context-purpose");

function legacyDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE trade_purposes(trade_purpose_id TEXT PRIMARY KEY);
    INSERT INTO trade_purposes VALUES ('CLIENT_CONVERSION'),('POSITION_HEDGING'),('LOAN_REPAYMENT');
    CREATE TABLE trade_contexts(trade_context_id INTEGER PRIMARY KEY,servicing_location_id TEXT NOT NULL,
      accounting_system_id TEXT,originating_system_id TEXT NOT NULL,position_management_mode TEXT NOT NULL);
    CREATE UNIQUE INDEX uq_trade_contexts_components ON trade_contexts
      (servicing_location_id,COALESCE(accounting_system_id,'NOT_APPLICABLE'),originating_system_id);
    INSERT INTO trade_contexts VALUES (1,'000',NULL,'INTERNAL_FRONT_SYSTEM','MANUAL'),
      (2,'001','AFINA','CLICK_TRADE_EFX','AUTO_IF_ELIGIBLE');
    CREATE TABLE trades(id INTEGER PRIMARY KEY,trade_context_id INTEGER REFERENCES trade_contexts(trade_context_id),mode TEXT);
    INSERT INTO trades VALUES(50,1,'MANUAL'),(51,2,'AUTO');
    CREATE VIEW trade_context_details AS SELECT t.id,c.* FROM trades t JOIN trade_contexts c USING(trade_context_id);`);
  return db;
}

test("migration preserves IDs, relationships and modes, adds purpose uniqueness and is repeatable", () => {
  const db = legacyDatabase();
  try {
    const contexts = db.prepare("SELECT * FROM trade_contexts ORDER BY trade_context_id").all().map(row=>({...row}));
    const trades = db.prepare("SELECT * FROM trades ORDER BY id").all();
    migrateTradeContextPurpose(db);
    migrateTradeContextPurpose(db);
    assert.deepEqual(db.prepare("SELECT * FROM trade_contexts ORDER BY trade_context_id").all().map(({trade_purpose_id,...row}) => row), contexts);
    assert.deepEqual(db.prepare("SELECT * FROM trades ORDER BY id").all(), trades);
    assert.equal(db.prepare("SELECT trade_purpose_id FROM trade_context_details WHERE id=50").get().trade_purpose_id,"POSITION_HEDGING");
    assert.throws(() => db.exec("INSERT INTO trade_contexts SELECT * FROM trade_contexts WHERE trade_context_id=1"), /UNIQUE/);
    assert.throws(() => db.exec("INSERT INTO trade_contexts(trade_context_id,servicing_location_id,originating_system_id,position_management_mode) VALUES(3,'000','INTERNAL_FRONT_SYSTEM','MANUAL')"), /NOT NULL/);
    db.exec("INSERT INTO trade_contexts VALUES('LOAN_REPAYMENT',3,'000',NULL,'INTERNAL_FRONT_SYSTEM','MANUAL')");
    assert.throws(() => db.exec("INSERT INTO trade_contexts VALUES('LOAN_REPAYMENT',4,'000',NULL,'INTERNAL_FRONT_SYSTEM','MANUAL')"), /UNIQUE/);
    assert.throws(() => db.exec("DELETE FROM trade_purposes WHERE trade_purpose_id='POSITION_HEDGING'"), /FOREIGN KEY/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});

test("migration refuses unapproved contexts without partially changing the database", () => {
  const db = legacyDatabase();
  try {
    db.exec("UPDATE trade_contexts SET originating_system_id='UNKNOWN' WHERE trade_context_id=2");
    assert.throws(() => migrateTradeContextPurpose(db), /explicit Trade Purpose/);
    assert.equal(db.prepare("PRAGMA table_info(trade_contexts)").all().some(c=>c.name==='trade_purpose_id'), false);
    assert.equal(db.prepare("SELECT count(*) n FROM trade_context_details").get().n, 2);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  } finally { db.close(); }
});

test("Trade Context API requires purpose and permits equal coordinates with different purposes", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"trade-context-purpose-test-"));
  const previous = process.env.DEMO_DATABASE_PATH;
  const serverPath = require.resolve("../../server");
  process.env.DEMO_DATABASE_PATH=path.join(dir,"test.sqlite");
  const server = require(serverPath);
  t.after(()=>{
    server.closeDatabase();delete require.cache[serverPath];
    if(previous===undefined)delete process.env.DEMO_DATABASE_PATH;else process.env.DEMO_DATABASE_PATH=previous;
    const relative=path.relative(os.tmpdir(),dir);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  async function request(method,url,body){
    let status,data;
    await server.handleApi({method,async *[Symbol.asyncIterator](){if(body!==undefined)yield Buffer.from(JSON.stringify(body));}},
      {writeHead(code){status=code;},end(text){data=text?JSON.parse(text):null;}},new URL(url,'http://localhost'));
    return {status,data};
  }
  const contexts=(await request('GET','/api/v1/trade-contexts')).data;
  assert.equal(contexts.length,7);
  const client=contexts.find(c=>c.tradePurposeId==='CLIENT_CONVERSION');
  const payload={...client,tradePurposeId:'LOAN_REPAYMENT'};
  assert.equal((await request('POST','/api/v1/trade-contexts',{...payload,tradePurposeId:undefined})).status,400);
  assert.equal((await request('POST','/api/v1/trade-contexts',{...payload,tradePurposeId:'UNKNOWN'})).status,409);
  const created=await request('POST','/api/v1/trade-contexts',payload);
  assert.equal(created.status,201);
  assert.equal(created.data.tradePurposeId,'LOAN_REPAYMENT');
  assert.equal((await request('POST','/api/v1/trade-contexts',payload)).status,409);
  const url='/api/v1/trade-contexts/'+created.data.tradeContextId;
  assert.equal((await request('PUT',url,{...payload,tradePurposeId:'FEE_COLLECTION'})).status,200);
  assert.equal((await request('DELETE','/api/v1/trade-purposes/FEE_COLLECTION')).status,409);
  assert.equal((await request('GET','/api/v1/trade-purposes')).data.find(p=>p.tradePurposeId==='FEE_COLLECTION').tradeContextCount,1);
  assert.equal((await request('DELETE',url)).status,204);
  assert.equal((await request('DELETE','/api/v1/trade-purposes/FEE_COLLECTION')).status,204);
});
