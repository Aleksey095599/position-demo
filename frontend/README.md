# Frontend source structure

`index.html` is a generated runtime artifact. Edit the files under `frontend/`
and rebuild it with:

```text
npm run build:frontend
```

The build is intentionally dependency-free and deterministic. It assembles the
shell, page fragments and dialog components in the order declared by
`fragment-manifest.json`. `npm run check:frontend` fails when `index.html` is
stale, when a fragment is missing, when page/dialog ordering changes
unexpectedly, when duplicate DOM IDs are introduced, or when the application
script no longer parses.

## Ownership

- `index.shell.html` owns only the document shell and workspace navigation.
- `features/<feature>/*.page.html` owns route-level page markup.
- `features/<feature>/components/` owns feature-specific dialogs and UI pieces.
- `shared/components/` owns UI pieces reused by multiple features.
- `shared/components/workbench-tabs.css` owns the opt-in visual contract for
  route-level section tabs through the `workbench-section-tabs` class. Every
  `nav-tabs` navigation must opt into this contract.
- `styles/source-manifest.json` preserves the CSS cascade order across core,
  feature and shared-component stylesheets. `styles/app.css` is the generated
  runtime bundle and must not be edited directly.
- `app/source-manifest.json` declares the JavaScript source order. Feature page
  controllers live beside their markup; `app/app.js` is their generated runtime
  bundle and must not be edited directly.

Do not edit generated `index.html`, `styles/app.css` or `app/app.js` directly.
