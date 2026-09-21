"use strict";

const DAY_MS = 86400000;
const MOSCOW_OFFSET_MS = 10800000;
function tableExists(db,name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function copyDayLoadRanges(db,rows) {
  const byInstrument = new Map();
  for (const row of rows) {
    const from=Date.parse(row.from_at), till=Date.parse(row.till_at);
    if (row.timeframe !== "ONE_DAY" || !Number.isFinite(from) || !Number.isFinite(till) || from>=till) {
      throw new Error("Invalid legacy daily candle load range.");
    }
    if (!byInstrument.has(row.instrument_id)) byInstrument.set(row.instrument_id,[]);
    byInstrument.get(row.instrument_id).push({from,till,loadedAt:row.loaded_at});
  }
  const insert=db.prepare(`INSERT INTO moex_iss_day_candle_load_result
    (instrument_id,load_date,completed_at,last_attempt_at) VALUES (?,?,?,?)
    ON CONFLICT (instrument_id,load_date) DO UPDATE SET
    completed_at=MAX(COALESCE(completed_at,excluded.completed_at),excluded.completed_at),
    last_attempt_at=MAX(last_attempt_at,excluded.last_attempt_at)`);
  for (const [instrumentId,ranges] of byInstrument) {
    const merged=[];
    for (const range of ranges.sort((a,b)=>a.from-b.from)) {
      const previous=merged.at(-1);
      if (!previous || previous.till<range.from) merged.push({...range});
      else {
        previous.till=Math.max(previous.till,range.till);
        if (range.loadedAt>previous.loadedAt) previous.loadedAt=range.loadedAt;
      }
    }
    for (const range of merged) {
      const first=Math.ceil((range.from+MOSCOW_OFFSET_MS)/DAY_MS)*DAY_MS-MOSCOW_OFFSET_MS;
      for(let time=first;time+DAY_MS<=range.till;time+=DAY_MS) {
        const date=new Date(time+MOSCOW_OFFSET_MS).toISOString().slice(0,10);
        insert.run(instrumentId,date,range.loadedAt,range.loadedAt);
      }
    }
  }
}

function migrateDayCandleStorage(db) {
  const oldNames=["moex_iss_daily_candles","moex_iss_daily_candle_load_ranges","moex_iss_daily_candle_load_attempts"];
  if (!oldNames.some(name=>tableExists(db,name))) return false;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (tableExists(db,"moex_iss_daily_candles")) {
      db.exec(`INSERT INTO moex_iss_day_candles
        (instrument_id,timeframe,begin_at,end_at,open_price,high_price,low_price,close_price,data_source,loaded_at)
        SELECT instrument_id,timeframe,begin_at,end_at,open_price,high_price,low_price,close_price,data_source,loaded_at
        FROM moex_iss_daily_candles`);
    }
    if (tableExists(db,"moex_iss_daily_candle_load_ranges")) {
      copyDayLoadRanges(db,db.prepare("SELECT * FROM moex_iss_daily_candle_load_ranges").all());
    }
    if (tableExists(db,"moex_iss_daily_candle_load_attempts")) {
      const insert=db.prepare(`INSERT INTO moex_iss_day_candle_load_result
        (instrument_id,load_date,last_attempt_at,last_error) VALUES (?,?,?,?)
        ON CONFLICT (instrument_id,load_date) DO UPDATE SET
        last_attempt_at=excluded.last_attempt_at,last_error=excluded.last_error`);
      for (const row of db.prepare("SELECT * FROM moex_iss_daily_candle_load_attempts").all()) {
        insert.run(row.instrument_id,row.load_date,row.last_attempt_at,row.last_error);
      }
    }
    // Исходные таблицы сохраняются как архив; при конфликте вся миграция откатывается.
    for (const name of oldNames) {
      if (tableExists(db,name)) db.exec(`ALTER TABLE ${name} RENAME TO legacy_${name}`);
    }
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { migrateDayCandleStorage, copyDayLoadRanges };
