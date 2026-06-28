# DOS Browser 🌐👾

[![npm version](https://img.shields.io/npm/v/dos-browser.svg)](https://www.npmjs.com/package/dos-browser)
[![license](https://img.shields.io/npm/l/dos-browser.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/dos-browser.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-server-blueviolet.svg)](https://modelcontextprotocol.io/)

The DOS Browser is a powerful, retro-styled suite of web browsing tools built entirely in Node.js. It features robust heuristic DOM parsing that strips away noise and extracts the true semantic meaning of websites (**website-to-JSON**). It comes with multi-platform interfaces designed for both **Humans** and **AI Agents**.

---

## 🚀 Quick Start

No clone required — run any interface straight from npm with `npx`:

```bash
# Interactive terminal UI
npx dos-browser https://news.ycombinator.com/

# Headless JSON extractor (pipe-friendly)
npx dos-browser-cli https://en.wikipedia.org/wiki/Terminal

# MCP server for AI agents (stdio)
npx dos-browser-mcp
```

Or install it globally to get the `dos-browser`, `dos-browser-cli` and `dos-browser-mcp` commands on your `PATH`:

```bash
npm install -g dos-browser
```

---

## 🛠️ Core Features

- **Semantic DOM Extraction**: Automatically strips `<div>` soup, navbars, and footers, extracting only pure readable content, headers, and interactive elements.
- **Enterprise-Grade Security**: Active heuristic regex filters actively detect and strip Prompt Injection attempts (e.g. "Ignore all previous instructions") before they reach your AI.
- **Proactive Ad Blocker**: Pre-filters well-known ad networks (Outbrain, Taboola, Adsense, etc.) from the DOM so they never render.
- **Cookie Wall Bypass**: Injects necessary `Cookie` headers for strict German websites (`golem.de`, `zeit.de`, `spiegel.de`). Falls back to a Googlebot spoof, and eventually the Wayback Machine web archive if all else fails.
- **CLI Streaming Downloads**: Supports full parsing and native downloading of `.exe`, `.zip`, `.pdf`, and multimedia objects directly to the filesystem with real-time text progress bars.

---

## 👤 For Humans: User Interfaces

DOS Browser provides three robust interfaces:

### 1. Terminal UI (TUI) Browser
A fully interactive, keyboard-driven `blessed`-based graphical interface that lives right in your terminal window.

```bash
# Launch simply by pointing it to a URL
node tui-browser.js https://news.ycombinator.com/
```
**Controls**:
- `TAB`: Switch cursor focus between the URL entry bar and the web page content.
- `UP` / `DOWN` / `LEFT` / `RIGHT`: Navigate semantically highlighted interactive buttons, downloads, and links on the page.
- `ENTER`: Click the highlighted link, or start downloading the interactive file directly into your current directory.
- `ESC`: Close active download popups or close the browser.

### 2. Command Line Interface (CLI)
A headless JSON extractor that rapidly navigates a URL and dumps the semantically cleaned `DOM` JSON object straight to `/dev/stdout`. Useful for scripting and piping to other tools.

```bash
node browser-cli.js https://en.wikipedia.org/wiki/Terminal
```

### 3. VS Code Extension
A native webview side-panel inside VS Code.
1. Change into `dos-browser-vscode` and run `npm install`, then `npm run watch`.
2. Press `F5` to open the Extension Development Host.
3. Use the VS Code Command Palette (`Ctrl+Shift+P`) and type **`DOS Browser: Browse`** to split the editor and browse the web right next to your code.

---

## 🤖 For AIs: MCP Server (Model Context Protocol)

DOS Browser exposes a standard **MCP Server** via `stdio` that grants any AI agent full semantic access to the web, powered by our custom Ad Blocker, Cookie Bypasser, and Prompt Injection firewalls.

### Setup for MCP Clients (Claude Desktop, Cursor, etc)
Add `dos-browser` to your `mcp.json` or `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dos-browser": {
      "command": "npx",
      "args": ["-y", "dos-browser-mcp"]
    }
  }
}
```

> Prefer a local checkout? Point `command` at `node` and `args` at the absolute path of `mcp-server.js` instead.

### Available AI Tools

#### `browse_website`
Parses and extracts a website into clean Markdown format for the LLM to read.

**Arguments**:
- `url` (String, required): The target website URL.
- `readerMode` (Boolean, optional): If `true`, runs the page through Mozilla Readability to strip everything EXCEPT the main core article text. Useful for long-form blogs or news.

**Example Response**:
```markdown
# Welcome to Example News

Here is the breaking news text of the article we found.

[Read More Here](https://example.com/more)
**[BUTTON: Accept Cookies]**
![Stock Photo](https://example.com/img.jpg)
```

#### `fetch_image`
Downloads an image directly from a URL and returns it to the AI as a native Base64-encoded `image` block. This allows modern vision-capable LLMs to actually "see" the pictures embedded in the scraped websites.

**Arguments**:
- `url` (String, required): The target image URL.

---

## 🔐 Responsible Use & Security

DOS Browser includes powerful capabilities — a prompt-injection firewall, an ad blocker, cookie-wall fallbacks, and optional local credential/password import helpers. Please use them responsibly:

- **Respect site terms & robots.** The cookie-wall and bot-check fallbacks are intended for accessibility and personal research, not for evading paywalls or abusing services at scale.
- **Credentials stay local.** The browser password import and KeePassXC/Bitwarden providers operate only on your own machine and your own stored credentials; nothing is transmitted off-device by DOS Browser.
- **Prompt-injection filtering is a safety net, not a guarantee.** Always keep a human (or a sandbox) in the loop when feeding scraped content to an LLM.

Found a security issue? Please open a private report via the [issue tracker](https://github.com/EthicalSaving-gUG/WebsiteToJSON/issues).

---

Have fun browsing the retro web! 🚀
