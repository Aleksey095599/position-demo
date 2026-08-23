"use strict";

const fs = require("node:fs");
const path = require("node:path");

function readFrontendSources(root) {
  const documentHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const appScript = fs.readFileSync(
    path.join(root, "frontend", "app", "app.js"),
    "utf8"
  );
  const appStyle = fs.readFileSync(
    path.join(root, "frontend", "styles", "app.css"),
    "utf8"
  );

  return {
    documentHtml,
    appScript,
    appStyle,
    combinedSource: `${documentHtml}\n${appStyle}\n${appScript}`
  };
}

module.exports = { readFrontendSources };
