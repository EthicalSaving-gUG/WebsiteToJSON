# Publishing & Listing

This project is packaging-ready: `npm publish` ships only the CLI/TUI/MCP entry
points (see the `files` whitelist in `package.json`), and `npm test` runs a
network-free smoke suite that CI gates releases on.

## 1. Publish to npm

A GitHub Actions workflow (`.github/workflows/*.yml`) publishes to npm
automatically whenever a **GitHub Release** is created, as long as the
`npm_token` repository secret is set.

To set it up once:

1. Create an npm **automation** access token (`npm token create --type=automation`).
2. Add it to the repo as a secret named `npm_token`
   (Settings → Secrets and variables → Actions).
3. Bump `version` in both `package.json` **and** `server.json` (they are kept in
   sync by the smoke test), then cut a GitHub Release. CI runs `npm test`, then
   `npm publish`.

To publish manually instead:

```bash
npm test
npm publish        # add --access public the first time if needed
```

## 2. List in the Model Context Protocol registry

The repo ships a [`server.json`](./server.json) manifest. Publish it with the
official `mcp-publisher` CLI:

```bash
# Authenticate as the GitHub org that owns this repo, then publish
mcp-publisher login github
mcp-publisher publish
```

The server name is namespaced to the GitHub owner
(`io.github.ethicalsaving-gug/dos-browser`), so publishing requires GitHub
authentication for the `EthicalSaving-gUG` organization. Keep the `version` in
`server.json` aligned with the npm release.

## 3. Promote

- The npm listing inherits the `description` and `keywords` from `package.json`.
- Community MCP directories (e.g. mcp.so, Glama, PulseMCP) typically index the
  official registry automatically once step 2 is done.
