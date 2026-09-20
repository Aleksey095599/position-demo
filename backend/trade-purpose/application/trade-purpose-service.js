"use strict";

const { tradePurpose, tradePurposeId } = require("../domain/trade-purpose");

class TradePurposeNotFoundError extends Error {}
class DuplicateTradePurposeError extends Error {}

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
    return purpose;
  }

  replace(currentId, fields) {
    const id = this.requireExisting(currentId);
    const purpose = tradePurpose(fields);
    this.repository.replace(id, purpose);
    return purpose;
  }

  delete(currentId) {
    this.repository.delete(this.requireExisting(currentId));
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
  DuplicateTradePurposeError,
  TradePurposeNotFoundError,
  TradePurposeService
};
