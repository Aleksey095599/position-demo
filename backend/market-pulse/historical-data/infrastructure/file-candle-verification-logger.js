"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

class FileCandleVerificationLogger {
  constructor({ directory }) {
    this.filePath = path.join(directory,"candle-verification.log.txt");
  }

  async writeEvent(entry) {
    if (!["OPEN_CLOSE_MISMATCH","MISSING_DAILY_CANDLE","MISSING_MINUTE_CANDLES","LOAD_ERROR"].includes(entry.eventType)) return;
    try {
      await fs.mkdir(path.dirname(this.filePath),{recursive:true});
      await fs.appendFile(this.filePath,JSON.stringify(entry)+"\n","utf8");
    } catch (cause) {
      const error = new Error("Candle verification log could not be written. Saved candles are unchanged.",{cause});
      error.code = "CANDLE_VERIFICATION_LOG_FAILED";
      throw error;
    }
  }
}

module.exports = { FileCandleVerificationLogger };
