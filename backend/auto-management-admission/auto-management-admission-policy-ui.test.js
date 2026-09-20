"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const settingsHtml = fs.readFileSync(
  path.join(ROOT, "frontend/features/position/position-management-settings.page.html"),
  "utf8"
);
const settingsScript = fs.readFileSync(
  path.join(ROOT, "frontend/features/position/position-management-settings.page.js"),
  "utf8"
);
const settingsStyle = fs.readFileSync(
  path.join(ROOT, "frontend/features/position/position-management-settings.css"),
  "utf8"
);
const runtimeScript = fs.readFileSync(
  path.join(ROOT, "frontend/app/core/runtime.js"),
  "utf8"
);

const TRADE_TYPES = Object.freeze([
  "CLIENT_DEAL",
  "HEDGE_DEAL",
  "BATCH_POSITION_OUT"
]);

function policy(tradeType, marker = tradeType) {
  return {
    tradeType,
    currencyPairs: [{
      ccyPairCode: "EURUSD",
      currencyPair: "EUR/USD",
      baseCcyCode: "EUR",
      baseCcyFractionDigits: 2,
      enabled: tradeType === "CLIENT_DEAL",
      maxBaseCcyAmount: tradeType === "CLIENT_DEAL" ? "1000" : null,
      maxTransferRateDeviationPercent: tradeType === "CLIENT_DEAL" ? "1" : null,
      marker
    }]
  };
}

function policyHarness() {
  const pending = [];
  const renders = [];
  const context = vm.createContext({
    AUTO_MODE_ELIGIBILITY_TRADE_TYPES: TRADE_TYPES,
    autoManagementAdmissionPolicy: { tradeType: "CLIENT_DEAL", currencyPairs: [] },
    autoManagementAdmissionPolicyLoaded: false,
    autoManagementAdmissionPolicySaving: false,
    autoManagementAdmissionPolicyEventsBound: false,
    autoManagementAdmissionEditingTradeType: null,
    autoManagementAdmissionEditingPairCode: null,
    autoManagementAdmissionTradeTypeFilter: { value: "ALL" },
    autoManagementAdmissionPairSearch: { value: "" },
    autoManagementAdmissionPairFilter: { value: "ALL" },
    normalizedAutoManagementAdmissionPolicy: source => ({
      tradeType: source?.tradeType || "CLIENT_DEAL",
      currencyPairs: Array.isArray(source?.currencyPairs) ? source.currencyPairs : []
    }),
    DEMO_API_ENABLED: true,
    demoApiRequest: (url, options) => new Promise((resolve, reject) => {
      pending.push({ url, options, resolve, reject });
    }),
    escapeHtml: String,
    groupedDecimalText: String,
    normalizedDecimalInputText: value => /^\d+(\.\d+)?$/.test(value || "") ? value : null,
    positiveDecimalInputText: value => Number(value) > 0 ? value : null,
    Big: require("big.js")
  });

  vm.runInContext(settingsScript, context);
  context.setAutoManagementAdmissionPolicyStatus = () => {};
  context.setAutoManagementAdmissionCriteriaStatus = () => {};
  context.setAutoManagementAdmissionPolicyBusy = () => {};
  context.updateAutoManagementAdmissionCriteriaSaveAvailability = () => {};
  context.renderAutoManagementAdmissionPolicy = () => renders.push(snapshot());

  function snapshot() {
    return JSON.parse(vm.runInContext(`JSON.stringify({
      activeTradeType: activeAutoManagementAdmissionTradeType,
      states: AUTO_MODE_ELIGIBILITY_TRADE_TYPES.map(tradeType => ({
        tradeType,
        ...autoManagementAdmissionStateFor(tradeType)
      }))
    })`, context));
  }

  return { context, pending, renders, snapshot };
}

test("Auto Mode Eligibility is one compact table for every stored trade type", () => {
  assert.equal(
    (settingsHtml.match(/data-position-management-settings-section-panel="eligibility"/g) || []).length,
    1
  );
  assert.match(settingsHtml, /id="autoManagementAdmissionCriteriaPage"/);
  assert.match(settingsHtml, /id="autoManagementAdmissionTradeTypeFilter"/);
  assert.deepEqual(
    [...settingsHtml.matchAll(/<col data-ui-column-key="([^"]+)"/g)].map(match => match[1]),
    [
      "ccy_pair",
      "trade_type",
      "eligible_for_auto_mode",
      "maximum_trade_amount",
      "transfer_rate_deviation",
      "actions"
    ]
  );
  TRADE_TYPES.forEach(tradeType => {
    assert.match(settingsHtml, new RegExp(`<option value="${tradeType}">`));
  });
  assert.match(settingsHtml, />Eligible<\/span>/);
  assert.match(settingsHtml, />Amount Limit<\/span>/);
  assert.doesNotMatch(settingsHtml, /Maximum Trade Amount \(Base Ccy\)/);
  assert.match(settingsHtml, />Max\. Transfer Rate Deviation<\/span>/);
  assert.doesNotMatch(settingsHtml, /Maximum Transfer Rate Deviation \(%\)/);
  assert.match(
    settingsStyle,
    /\.auto-management-admission-criteria-panel \{[\s\S]*?width: fit-content;[\s\S]*?max-width: 100%;/
  );
  assert.match(
    settingsStyle,
    /tr:has\(> td:not\(\.auto-mode-eligibility-pair-cell\):hover\)[\s\S]*?> td:not\(\.auto-mode-eligibility-pair-cell\)/
  );
  assert.doesNotMatch(settingsHtml, /auto-management-admission-pair-table[^\"]*table-hover/);
  assert.match(
    settingsStyle,
    /#positionManagementSettingsPage[\s\S]*?tbody tr:hover > td \{[\s\S]*?background: var\(--bs-body-bg\) !important/
  );
  assert.match(
    settingsStyle,
    /tr:has\(> td:not\(\.auto-mode-eligibility-pair-cell\):hover\)[\s\S]*?background: var\(--workbench-grid-hover-bg\) !important/
  );
  assert.doesNotMatch(
    settingsStyle,
    /\.auto-management-admission-pair-table tbody tr:hover td/
  );
  assert.doesNotMatch(settingsStyle, /data-auto-management-admission-group-end[\s\S]*?border-bottom-width/);
  assert.doesNotMatch(settingsHtml, /Open Auto Mode Eligibility settings|auto-management-admission-criteria\.page\.html/);
});

test("Client and Hedge rows are editable while Position Out is explicitly not evaluated", () => {
  const { context } = policyHarness();
  context.autoManagementAdmissionPolicyLoaded = true;
  context.autoManagementAdmissionEditingTradeType = "CLIENT_DEAL";
  context.autoManagementAdmissionEditingPairCode = "EURUSD";

  const clientRow = context.autoManagementAdmissionPairRowMarkup(
    policy("CLIENT_DEAL").currencyPairs[0],
    "CLIENT_DEAL"
  );
  const hedgeRow = context.autoManagementAdmissionPairRowMarkup(
    policy("HEDGE_DEAL").currencyPairs[0],
    "HEDGE_DEAL"
  );
  const positionOutRow = context.autoManagementAdmissionPairRowMarkup(
    policy("BATCH_POSITION_OUT").currencyPairs[0],
    "BATCH_POSITION_OUT"
  );

  assert.match(clientRow, /position-trade-type-icon">handshake</);
  assert.match(clientRow, /data-admission-action="save"/);
  assert.match(clientRow, /data-admission-action="cancel"/);
  assert.match(clientRow, /auto-management-admission-row-actions" data-disable-tooltips/);
  assert.match(clientRow, /data-disable-overflow-tooltip/);
  assert.match(clientRow, /data-auto-management-admission-pair-limit/);
  assert.equal((clientRow.match(/<td class="text-end"/g) || []).length, 2);
  assert.equal((clientRow.match(/class="form-control text-end"/g) || []).length, 2);
  assert.match(hedgeRow, /position-trade-type-icon">shield/);
  assert.match(hedgeRow, /data-admission-action="edit"/);
  assert.doesNotMatch(clientRow + hedgeRow, /data-tooltip=/);
  assert.doesNotMatch(hedgeRow, /<input|data-admission-action="save"/);
  assert.match(positionOutRow, /Not evaluated/);
  assert.match(positionOutRow, /data-auto-management-admission-evaluated="false"/);
  assert.doesNotMatch(positionOutRow, /<input|data-admission-action="edit"/);
  assert.match(positionOutRow, /position-trade-type-icon">output/);
  assert.doesNotMatch(clientRow + hedgeRow + positionOutRow, /<strong>/);
  assert.match(
    settingsStyle,
    /\.auto-management-admission-row-actions \.reference-grid-action \{[\s\S]*?display: inline-flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/
  );
});

test("Ccy Pair groups recalculate their row span when Trade Type filters change", () => {
  const { context } = policyHarness();
  vm.runInContext(
    `AUTO_MODE_ELIGIBILITY_TRADE_TYPES.forEach((tradeType, index) => {
       const state = autoManagementAdmissionStateFor(tradeType);
       state.policy = ${JSON.stringify(TRADE_TYPES.map(tradeType => policy(tradeType)))}[index];
       state.loaded = true;
     });`,
    context
  );

  let groups = context.filteredAutoManagementAdmissionRuleGroups();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].currencyPair, "EUR/USD");
  assert.equal(groups[0].rules.length, 3);
  const groupedMarkup = groups[0].rules.map(({ pair, tradeType }, index) =>
    context.autoManagementAdmissionPairRowMarkup(pair, tradeType, {
      renderPairCell: index === 0,
      pairRowspan: groups[0].rules.length,
      groupEnd: index === groups[0].rules.length - 1,
      tableEnd: true
    })
  ).join("");
  assert.equal((groupedMarkup.match(/auto-mode-eligibility-pair-cell/g) || []).length, 1);
  assert.match(groupedMarkup, /auto-mode-eligibility-pair-cell is-table-end/);
  assert.match(groupedMarkup, /rowspan="3">EUR\/USD/);
  assert.match(
    settingsScript,
    /tableEnd: groupIndex === groups\.length - 1/
  );
  assert.match(
    settingsStyle,
    /\.auto-mode-eligibility-pair-cell\.is-table-end\s*\{\s*border-bottom:\s*0;/
  );

  context.autoManagementAdmissionTradeTypeFilter.value = "HEDGE_DEAL";
  groups = context.filteredAutoManagementAdmissionRuleGroups();
  assert.equal(groups.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(groups[0].rules.map(rule => rule.tradeType))),
    ["HEDGE_DEAL"]
  );
  const filteredMarkup = context.autoManagementAdmissionPairRowMarkup(
    groups[0].rules[0].pair,
    groups[0].rules[0].tradeType,
    { pairRowspan: groups[0].rules.length }
  );
  assert.match(filteredMarkup, /rowspan="1">EUR\/USD/);
});

test("editing is scoped by the composite Trade Type and Ccy Pair key", () => {
  const { context } = policyHarness();
  const pairs = [
    policy("CLIENT_DEAL").currencyPairs[0],
    {
      ...policy("CLIENT_DEAL").currencyPairs[0],
      ccyPairCode: "GBPUSD",
      currencyPair: "GBP/USD",
      baseCcyCode: "GBP",
      enabled: false,
      maxBaseCcyAmount: null,
      maxTransferRateDeviationPercent: null
    }
  ];
  vm.runInContext(
    `autoManagementAdmissionStateFor("CLIENT_DEAL").policy = ${JSON.stringify({ tradeType: "CLIENT_DEAL", currencyPairs: pairs })};
     autoManagementAdmissionStateFor("CLIENT_DEAL").loaded = true;
     activeAutoManagementAdmissionTradeType = "CLIENT_DEAL";
     syncActiveAutoManagementAdmissionPolicy();`,
    context
  );
  context.autoManagementAdmissionEditingTradeType = "CLIENT_DEAL";
  context.autoManagementAdmissionEditingPairCode = "EURUSD";
  const amount = { value: "2500", setCustomValidity() {} };
  const deviation = { value: "2", setCustomValidity() {} };
  context.autoManagementAdmissionPairRows = {
    querySelector(selector) {
      assert.match(selector, /trade-type="CLIENT_DEAL"/);
      assert.match(selector, /pair-code="EURUSD"/);
      return {
        querySelector(field) {
          if (field.includes("pair-enabled")) return { checked: true };
          if (field.includes("pair-limit")) return amount;
          return deviation;
        }
      };
    }
  };

  const draft = JSON.parse(JSON.stringify(context.autoManagementAdmissionPolicyDraft()));
  assert.equal(draft.tradeType, "CLIENT_DEAL");
  assert.equal(draft.currencyPairs[0].maxBaseCcyAmount, "2500");
  assert.equal(draft.currencyPairs[0].maxTransferRateDeviationPercent, "2");
  assert.deepEqual(draft.currencyPairs[1], {
    ccyPairCode: "GBPUSD",
    enabled: false,
    maxBaseCcyAmount: null,
    maxTransferRateDeviationPercent: null
  });
  assert.equal(Object.hasOwn(draft, "expectedRevision"), false);
});

test("the unified loader requests and stores every rule set together", async () => {
  const { context, pending, snapshot } = policyHarness();
  const loading = context.loadAutoManagementAdmissionRuleMatrix();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].url, "/api/v1/auto-mode-eligibility-rules?scope=all");
  pending[0].resolve({ ruleSets: TRADE_TYPES.map((tradeType, index) => policy(tradeType, index)) });
  await loading;

  const loaded = snapshot();
  assert.deepEqual(loaded.states.map(state => state.tradeType), [...TRADE_TYPES]);
  assert.deepEqual(loaded.states.map(state => state.loaded), [true, true, true]);
  assert.deepEqual(
    loaded.states.map(state => state.policy.currencyPairs[0].marker),
    [0, 1, 2]
  );
});

test("row saves keep the existing per-trade-type API contract without revisions", () => {
  assert.match(settingsScript, /tradeType: activeAutoManagementAdmissionTradeType,[\s\S]*?currencyPairs/);
  assert.match(settingsScript, /"\/api\/v1\/auto-mode-eligibility-rules",[\s\S]*?method: "PUT"/);
  assert.match(settingsScript, /invalidControl\.reportValidity\(\)/);
  assert.doesNotMatch(settingsScript, /expectedRevision|latest revision/);
  assert.match(runtimeScript, /let maxTransferRateDeviationPercent = null;/);
  assert.match(settingsScript, /parsedMaxBaseCcyAmount !== null[\s\S]*?<= pair\.baseCcyFractionDigits/);
});
