# DOS Browser 🌐👾

The DOS Browser is a powerful, retro-styled suite of web browsing tools built entirely in Node.js. It features robust heuristic DOM parsing that strips away noise and extracts the true semantic meaning of websites. It comes with multi-platform interfaces designed for both **Humans** and **AI Agents**.

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
      "command": "node",
      "args": ["/absolute/path/to/WebsiteToJSON/mcp-server.js"]
    }
  }
}
```

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

Have fun browsing the retro web! 🚀
