"use strict";

const { CurrentDayLoadingProcess } = require("../application/current-day-loading-process");
const { SqliteCurrentDayLoadingRepository } = require("../infrastructure/sqlite-current-day-loading-repository");

function createCurrentDayModule(options) {
  const repository = new SqliteCurrentDayLoadingRepository(options);
  const process = new CurrentDayLoadingProcess({ ...options, repository });
  const settings = {
    get: () => repository.getSettings(),
    update: patch => {
      const value = repository.updateSettings(patch);
      process.settingsChanged();
      return value;
    }
  };
  return { settings, process };
}
module.exports = { createCurrentDayModule };
