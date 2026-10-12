"use strict";

const { tradePurpose, tradePurposeId } = require("../domain/trade-purpose");

class TradePurposeNotFoundError extends Error {}
class DuplicateTradePurposeError extends Error {}
class TradePurposeInUseError extends Error {}

class TradePurposeService {
  constructor(repository) {
    this.repository = repository;
  }

  list() {
    return this.repository.list();
  }

  create(fields) {
    const purpose = tradePurpose(fields);
    this.repository.create(purpose);
    return this.repository.find(purpose.tradePurposeId);
  }

  replace(currentId, fields) {
    const id = this.requireExisting(currentId);
    const purpose = tradePurpose(fields);
    if (purpose.tradePurposeId !== id) this.requireUnused(id);
    this.repository.replace(id, purpose);
    return this.repository.find(purpose.tradePurposeId);
  }

  delete(currentId) {
    const id = this.requireExisting(currentId);
    this.requireUnused(id);
    this.repository.delete(id);
  }

  requireUnused(id) {
    if (this.repository.find(id).tradeContextCount > 0) {
      throw new TradePurposeInUseError(`Trade Purpose ${id} is used by Trade Contexts.`);
    }
  }

  requireExisting(currentId) {
    const id = tradePurposeId(currentId);

    if (!this.repository.find(id)) {
      throw new TradePurposeNotFoundError(`Trade Purpose ${id} was not found.`);
    }

    return id;
  }
}

module.exports = {
  TradePurposeInUseError,
  DuplicateTradePurposeError,
  TradePurposeNotFoundError,
  TradePurposeService
};
