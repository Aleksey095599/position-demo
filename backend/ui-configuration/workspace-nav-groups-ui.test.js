"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.resolve(__dirname,
  "../../frontend/shared/navigation/workspace-nav-groups.js"), "utf8");

function harness() {
  const elements = new Map();
  const document = {
    activeElement: null,
    getElementById: id => elements.get(id),
    querySelectorAll: () => [toggle]
  };
  function element(id, parent = null, dataset = {}, classes = []) {
    const classNames = new Set(classes);
    const attrs = new Map();
    const item = {
      id, parent, dataset, hidden: false, style: {}, offsetWidth: 220, offsetHeight: 80,
      getBoundingClientRect: () => ({ left: 180, right: 400, top: 120 }),
      classList: {
        toggle(name, enabled) { if (enabled) classNames.add(name); else classNames.delete(name); },
        contains: name => classNames.has(name),
        remove: name => classNames.delete(name)
      },
      getAttribute: name => attrs.get(name),
      setAttribute: (name, value) => attrs.set(name, value),
      focus() { document.activeElement = this; },
      closest(selector) {
        if (selector === "[hidden]" && this.hidden
          || selector === '[role="menu"]' && attrs.get("role") === "menu"
          || selector === ".workspace-nav-subgroup" && classNames.has("workspace-nav-subgroup")
          || selector === "[data-workspace-nav-subgroup-toggle]" && this.dataset.workspaceNavSubgroupToggle
          || selector === "[data-workspace-route]" && this.dataset.workspaceRoute) return this;
        return this.parent?.closest(selector) || null;
      }
    };
    elements.set(id, item);
    return item;
  }
  const menu = element("market-menu");
  menu.setAttribute("role", "menu");
  const quote = element("quote", menu, { workspaceRoute: "market-quote-stream" });
  const charts = element("charts", menu, { workspaceRoute: "market-charts" });
  const toggle = element("data-toggle", menu, {
    workspaceNavSubgroupToggle: "data-group",
    workspaceRoutes: "market-source-data market-candle-aggregation"
  });
  toggle.setAttribute("aria-expanded", "false");
  const group = element("data-group", menu, {}, ["workspace-nav-subgroup"]);
  group.hidden = true;
  group.setAttribute("role", "menu");
  group.setAttribute("aria-labelledby", "data-toggle");
  const sourceLink = element("source", group, { workspaceRoute: "market-source-data" });
  const aggregation = element("aggregation", group, { workspaceRoute: "market-candle-aggregation" });
  group.querySelector = () => sourceLink;
  group.querySelectorAll = () => [sourceLink, aggregation];
  const items = [quote, charts, toggle, sourceLink, aggregation];
  menu.querySelectorAll = selector => selector === "[data-workspace-nav-subgroup-toggle]" ? [toggle] : items;
  const entry = { menu, toggle: element("market-toggle") };
  let repositioned = 0;
  const context = vm.createContext({
    document, window: { innerWidth: 1200, innerHeight: 800 },
    positionWorkspaceNavMenu() { repositioned++; },
    setWorkspaceNavMenuOpen(target, open) { target.menu.hidden = !open; }
  });
  vm.runInContext(source, context);
  function key(keyName) {
    let prevented = false;
    context.handleWorkspaceNavMenuKeydown(entry, {
      key: keyName, preventDefault() { prevented = true; }
    });
    return prevented;
  }
  return { context, document, entry, quote, charts, toggle, group, sourceLink, aggregation,
    key, repositioned: () => repositioned };
}

test("Data Management opens a side menu and a child link closes the outer menu", () => {
  const h = harness();
  h.context.handleWorkspaceNavMenuClick(h.entry, { target: h.toggle });
  assert.equal(h.group.hidden, false);
  assert.equal(h.toggle.getAttribute("aria-expanded"), "true");
  assert.equal(h.entry.menu.hidden, false);
  assert.equal(h.repositioned(), 1);
  assert.equal(h.group.style.left, "402px");
  assert.equal(h.group.style.top, "120px");
  assert.equal(h.group.classList.contains("is-inline"), false);
  h.context.handleWorkspaceNavMenuClick(h.entry, { target: h.toggle });
  assert.equal(h.group.hidden, true);
  h.context.handleWorkspaceNavMenuClick(h.entry, { target: h.sourceLink });
  assert.equal(h.entry.menu.hidden, true);
});

test("active route highlights its parent without automatically opening the flyout", () => {
  for (const route of ["market-source-data", "market-candle-aggregation"]) {
    const h = harness();
    h.context.syncWorkspaceNavSubgroups(route);
    assert.equal(h.toggle.classList.contains("is-active"), true);
    assert.equal(h.group.hidden, true);
    h.context.syncWorkspaceNavSubgroups("market-charts");
    assert.equal(h.toggle.classList.contains("is-active"), false);
    assert.equal(h.toggle.getAttribute("aria-current"), undefined);
  }
});

test("arrow navigation skips collapsed children and wraps through visible items", () => {
  const h = harness();
  h.quote.focus();
  assert.equal(h.key("ArrowDown"), true);
  assert.equal(h.document.activeElement, h.charts);
  h.key("ArrowDown");
  assert.equal(h.document.activeElement, h.toggle);
  h.key("ArrowDown");
  assert.equal(h.document.activeElement, h.quote);
  h.key("ArrowUp");
  assert.equal(h.document.activeElement, h.toggle);
});

test("Right opens a group and Left returns focus to its collapsed parent", () => {
  const h = harness();
  h.toggle.focus();
  h.key("ArrowRight");
  assert.equal(h.group.hidden, false);
  assert.equal(h.document.activeElement, h.sourceLink);
  h.key("ArrowDown");
  assert.equal(h.document.activeElement, h.aggregation);
  h.key("ArrowLeft");
  assert.equal(h.group.hidden, true);
  assert.equal(h.document.activeElement, h.toggle);
});

test("Home, End and Escape respect visible items and return focus to the menu trigger", () => {
  const h = harness();
  h.context.syncWorkspaceNavSubgroups("market-source-data");
  h.quote.focus();
  h.key("End");
  assert.equal(h.document.activeElement, h.toggle);
  h.key("ArrowRight");
  h.key("End");
  assert.equal(h.document.activeElement, h.aggregation);
  h.key("Home");
  assert.equal(h.document.activeElement, h.sourceLink);
  h.key("ArrowUp");
  assert.equal(h.document.activeElement, h.aggregation);
  h.key("Escape");
  assert.equal(h.document.activeElement, h.toggle);
  assert.equal(h.group.hidden, true);
  assert.equal(h.entry.menu.hidden, false);
  h.key("Escape");
  assert.equal(h.entry.menu.hidden, true);
  assert.equal(h.document.activeElement, h.entry.toggle);
});

test("flat workspace menus retain arrow navigation and native link activation", () => {
  const h = harness();
  h.entry.menu.querySelectorAll = selector => selector === "[data-workspace-nav-subgroup-toggle]" ? [] : [h.quote, h.charts];
  h.quote.focus();
  h.key("ArrowUp");
  assert.equal(h.document.activeElement, h.charts);
  assert.equal(h.key("Enter"), false);
  h.context.handleWorkspaceNavMenuClick(h.entry, { target: h.charts });
  assert.equal(h.entry.menu.hidden, true);
});

test("flyout opens left near the right edge and stays within viewport height", () => {
  const h = harness();
  const result = h.context.workspaceNavSubgroupPlacement({ left: 750, right: 970 }, 740, 220, 100, 1000, 800);
  assert.equal(result.inline, false);
  assert.equal(result.opensLeft, true);
  assert.equal(result.left, 528);
  assert.equal(result.top, 692);
});

test("insufficient space on both sides uses inline navigation", () => {
  const h = harness();
  for (const width of [400, 638]) {
    const result = h.context.workspaceNavSubgroupPlacement({ left: 190, right: 410 }, 120, 220, 80, width, 800);
    assert.equal(result.inline, true);
  }
});

test("closing the main menu resets its flyouts", () => {
  const h = harness();
  h.context.setWorkspaceNavSubgroupOpen(h.toggle, true);
  h.context.closeWorkspaceNavSubgroups(h.entry);
  assert.equal(h.group.hidden, true);
  assert.equal(h.toggle.getAttribute("aria-expanded"), "false");
});
