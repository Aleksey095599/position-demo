"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { readFrontendSources } = require("../test-support/frontend-source.js");

const root = path.resolve(__dirname, "../..");
const { documentHtml } = readFrontendSources(root);
const runtime = fs.readFileSync(path.join(root, "frontend/app/core/runtime.js"), "utf8");
const tooltipCode = runtime.slice(runtime.indexOf("let activeTooltipTarget = null;"), runtime.indexOf("function editNumber("));

function element(trigger) {
  const attributes = new Map();
  const classes = new Set();
  return {
    id: "appTooltip", dataset: { tooltip: "Help text", tooltipTrigger: trigger }, style: {}, listeners: {},
    classList: { add: x => classes.add(x), remove: x => classes.delete(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) },
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key),
    getAttribute: key => attributes.get(key),
    addEventListener(type, fn) { this.listeners[type] = fn; },
    closest: () => null, contains: () => false, matches: () => false,
    getBoundingClientRect: () => ({ left: 100, top: 50, bottom: 70, width: 160, height: 30 }),
    emit(type) { this.listeners[type]?.({ currentTarget: this }); }
  };
}

function setup() {
  const popup = element();
  const document = { body: { append() {} }, activeElement: null };
  const context = vm.createContext({ appTooltipEl: popup, document, window: { innerWidth: 800, innerHeight: 600 } });
  vm.runInContext(`${tooltipCode}\nthis.bind = bindAppTooltip;`, context);
  return { popup, bind: context.bind };
}

test("all field information controls are named click-only buttons", () => {
  const buttons = [...documentHtml.matchAll(/<button\b[^>]*class="form-label-help"[^>]*>/g)];
  assert.equal(buttons.length, 6);
  for (const [button] of buttons) {
    assert.match(button, /type="button"/);
    assert.match(button, /aria-label="About [^"]+"/);
    assert.match(button, /data-tooltip-trigger="click"/);
    assert.doesNotMatch(button, /\stitle=/);
  }
  assert.doesNotMatch(documentHtml, /<span[^>]*form-label-help/);
  assert.match(documentHtml, /This application uses M1 and D1 candles from MOEX ISS as source candles\./);
});

test("information help opens only on click and closes on second click or blur", () => {
  const { popup, bind } = setup();
  const info = element("click");
  bind(info);
  info.emit("mouseenter");
  info.emit("focus");
  assert.equal(info.getAttribute("aria-expanded"), "false");
  info.emit("click");
  assert.equal(info.getAttribute("aria-expanded"), "true");
  assert.equal(info.getAttribute("aria-describedby"), "appTooltip");
  assert.equal(popup.textContent, "Help text");
  info.emit("mouseleave");
  assert.equal(info.getAttribute("aria-expanded"), "true");
  info.emit("click");
  assert.equal(info.getAttribute("aria-expanded"), "false");
  assert.equal(info.getAttribute("aria-describedby"), undefined);
  info.emit("click");
  info.emit("blur");
  assert.equal(popup.getAttribute("aria-hidden"), "true");
});

test("hover tooltips do not replace or dismiss open information help", () => {
  const { bind } = setup();
  const info = element("click");
  const hover = element();
  const secondInfo = element("click");
  [info, hover, secondInfo].forEach(bind);
  info.emit("click");
  for (const type of ["mouseenter", "mouseleave", "focus", "blur"]) hover.emit(type);
  assert.equal(info.getAttribute("aria-expanded"), "true");
  secondInfo.emit("click");
  assert.equal(info.getAttribute("aria-expanded"), "false");
  assert.equal(secondInfo.getAttribute("aria-expanded"), "true");
});
