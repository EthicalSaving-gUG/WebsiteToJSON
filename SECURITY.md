# Security & Responsible-Use Notes

DOS Browser browses arbitrary, untrusted websites and exposes that capability to
AI agents via an MCP server. A few parts of this project carry real security and
legal weight — please read this before deploying, publishing, or promoting it.

## Prompt injection is mitigated, not solved

The heuristic regex filter strips common injection phrases (e.g. "ignore all
previous instructions") before content reaches an LLM. This raises the bar but
**does not guarantee safety** — obfuscated or novel injections can still pass
through. Treat any content returned from `browse_website` as untrusted input, and
do not wire high-privilege tools (filesystem, shell, credentials) into the same
agent that consumes browsed content without an explicit human-in-the-loop.

## Credential import (`src/credentials/BrowserPasswordImporter.js`)

This module reads local browser credential stores (Chrome/Edge/Brave `Login Data`
SQLite, Firefox `logins.json`) and can export them to CSV / KeePass XML. Legitimate
use is **migrating your own passwords into your own password manager**, on your own
machine, with your consent.

- Never expose this functionality through the MCP server, the web API, or any
  network-reachable interface. It is intentionally **not** wired into those today.
- Reading another person's credential store without authorization may be illegal
  in your jurisdiction. Ship and use this feature accordingly.

## Access-control bypass (paywalls / cookie walls / bot checks)

The cookie-wall and Cloudflare/captcha handling circumvents publisher access
controls and anti-bot measures. This can violate sites' Terms of Service and, in
some jurisdictions, the law. Use only against targets you are authorized to
access.

This behavior is **not** confined to one file — it is implemented in every
shipped entry point, so auditing or disabling it in one place is not enough:

- `src/app/api/browse/route.ts` — the Next.js web API route
- `browser-cli.js` — the headless CLI (`dos-browser-cli` bin)
- `tui-browser.js` — the terminal UI (`dos-browser` bin)
- `mcp-server.js` — the MCP server exposed to AI agents (`dos-browser-mcp` bin)
- `dos-browser-vscode/` — the bundled VS Code extension

The consent-cookie injection and Googlebot spoofing are duplicated across these;
the Cloudflare/captcha path additionally relies on Puppeteer + a stealth plugin,
which the CLI/TUI/MCP entry points install on demand. Anyone hardening a
deployment must review or strip the behavior in **all** of the above.

## Reporting a vulnerability

Please open a private security advisory on the repository, or contact the
maintainers directly, rather than filing a public issue.
