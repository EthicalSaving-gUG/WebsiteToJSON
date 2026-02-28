import * as vscode from 'vscode';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('dos-browser.start', () => {
        const panel = vscode.window.createWebviewPanel(
            'dosBrowser',
            'DOS Browser',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = getWebviewContent();

        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'fetchUrl':
                        try {
                            const result = await fetchAndParse(message.url, message.readerMode);
                            panel.webview.postMessage({ command: 'render', data: result });
                        } catch (err: any) {
                            panel.webview.postMessage({ command: 'error', error: err.message });
                        }
                        return;
                    case 'download':
                        const uri = await vscode.window.showSaveDialog({
                            defaultUri: vscode.Uri.file(message.filename),
                            title: 'Save Downloaded File'
                        });
                        if (uri) {
                            startExtensionDownload(message.url, uri.fsPath, message.id, panel, message.filename);
                        }
                        return;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

async function fetchAndParse(url: string, readerMode: boolean) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const doc = new JSDOM(html, { url });
    const window = doc.window;
    const document = window.document;

    let workingDocument = document;

    if (readerMode) {
        const reader = new Readability(document as any);
        const article = reader.parse();

        if (article && article.content) {
            const cleanDOMPurify = DOMPurify(window as any);
            const safeHtml = cleanDOMPurify.sanitize(article.content);

            const cleanDoc = new JSDOM(`<html><body><h1>${article.title || ''}</h1>${safeHtml}</body></html>`, { url });
            workingDocument = cleanDoc.window.document;
        }
    }

    const result: any[] = [];
    let idCounter = 0;

    function isHidden(el: any) {
        if (!workingDocument.defaultView) return false;
        try {
            const style = workingDocument.defaultView.getComputedStyle(el);
            return (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0');
        } catch (e) {
            return false;
        }
    }

    function cleanText(text: string | null) {
        return text ? text.replace(/\s+/g, ' ').trim() : '';
    }

    function walkDOM(node: any) {
        if (node.nodeType === workingDocument.defaultView?.Node.ELEMENT_NODE || node.nodeType === 1) {
            const el = node;
            const tagName = el.tagName.toLowerCase();

            if (['script', 'style', 'noscript', 'nav', 'footer', 'iframe', 'svg'].includes(tagName) || isHidden(el)) {
                return;
            }

            if (tagName === 'a') {
                const text = cleanText(el.textContent);
                if (text && el.href) {
                    const isDownload = /\.(zip|tar\.gz|rar|7z|exe|pdf|docx?|xlsx?|pptx?|mp[34]|avi|mkv|iso|dmg|apk)($|\?)/i.test(el.href);
                    result.push({
                        type: isDownload ? 'download' : 'link',
                        id: `el-${idCounter++}`,
                        text: text,
                        href: el.href
                    });
                }
                return;
            }

            if (tagName === 'button' || (tagName === 'input' && el.type === 'button') || (tagName === 'input' && el.type === 'submit')) {
                const text = cleanText(el.textContent) || el.value || 'Submit';
                result.push({
                    type: 'button',
                    id: `el-${idCounter++}`,
                    text: text
                });
                return;
            }

            if (tagName === 'img') {
                if (el.src) {
                    result.push({
                        type: 'image',
                        id: `el-${idCounter++}`,
                        src: el.src,
                        alt: el.alt || ''
                    });
                }
                return;
            }

            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                const text = cleanText(el.textContent);
                if (text) {
                    result.push({
                        type: 'header',
                        level: parseInt(tagName.replace('h', '')),
                        id: `el-${idCounter++}`,
                        text: text
                    });
                }
                return;
            }
        } else if (node.nodeType === workingDocument.defaultView?.Node.TEXT_NODE || node.nodeType === 3) {
            const text = cleanText(node.textContent);
            if (text && text.length > 5) {
                const parentTag = node.parentNode?.tagName?.toLowerCase();
                if (!['a', 'button', 'script', 'style', 'title', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'noscript'].includes(parentTag)) {
                    result.push({
                        type: 'text',
                        id: `el-${idCounter++}`,
                        text: text
                    });
                }
            }
        }

        let child = node.firstChild;
        while (child) {
            walkDOM(child);
            child = child.nextSibling;
        }
    }

    walkDOM(workingDocument.body);
    return result;
}

async function startExtensionDownload(url: string, destPath: string, downloadId: string, panel: vscode.WebviewPanel, filename: string) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        let loaded = 0;
        const reader = response.body?.getReader();
        const fileStream = fs.createWriteStream(destPath);

        if (reader) {
            panel.webview.postMessage({ command: 'downloadInit', id: downloadId, url, filename });
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                    fileStream.write(value);
                    loaded += value.length;

                    if (total) {
                        const progress = Math.round((loaded / total) * 100);
                        panel.webview.postMessage({ command: 'downloadProgress', id: downloadId, progress, status: 'downloading' });
                    } else {
                        const fakeProgress = Math.min(99, Math.round(loaded / 1024 / 1024)); // max 99% until done
                        panel.webview.postMessage({ command: 'downloadProgress', id: downloadId, progress: fakeProgress, status: 'downloading' });
                    }
                }
            }
            fileStream.end();
            panel.webview.postMessage({ command: 'downloadProgress', id: downloadId, progress: 100, status: 'done' });

            // Auto close success in UI
            setTimeout(() => {
                panel.webview.postMessage({ command: 'downloadClear', id: downloadId });
            }, 5000);
        }
    } catch (e: any) {
        panel.webview.postMessage({ command: 'downloadProgress', id: downloadId, progress: 0, status: 'error', error: e.message });
    }
}

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DOS Browser</title>
    <style>
        body {
            background-color: black;
            color: #22c55e;
            font-family: monospace;
            padding: 20px;
        }
        .header {
            border-bottom: 2px solid #16a34a;
            padding-bottom: 20px;
            margin-bottom: 20px;
            position: relative;
        }
        .title {
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
            color: #4ade80;
        }
        .url-bar {
            display: flex;
            gap: 10px;
            max-width: 800px;
            margin: 0 auto;
        }
        input {
            flex: 1;
            background: black;
            color: #4ade80;
            border: 1px solid #16a34a;
            padding: 8px;
            font-family: monospace;
            font-size: 16px;
        }
        input:focus {
            outline: none;
            border-color: #4ade80;
            background: #064e3b;
        }
        button {
            background: #166534;
            color: black;
            border: 2px solid #16a34a;
            padding: 8px 16px;
            font-weight: bold;
            cursor: pointer;
            font-family: monospace;
        }
        button:hover {
            background: #15803d;
        }
        .nav-btn {
            background: black;
            color: #4ade80;
            border: 1px solid #16a34a;
            padding: 8px 12px;
        }
        .nav-btn:hover:not(:disabled) {
            background: #064e3b;
        }
        .nav-btn:disabled {
            border-color: #064e3b;
            color: #064e3b;
            cursor: not-allowed;
            background: black;
        }
        .toggles {
            position: absolute;
            top: 0;
            right: 0;
            display: flex;
            gap: 10px;
        }
        .toggle-btn {
            background: black;
            color: #4ade80;
            font-size: 12px;
            padding: 4px 8px;
        }
        .toggle-btn:hover {
            background: #4ade80;
            color: black;
        }
        #content {
            max-width: 800px;
            margin: 0 auto;
            border: 2px solid #064e3b;
            padding: 20px;
            min-height: 400px;
            background: #022c22;
        }
        .node-header { color: #facc15; font-weight: bold; margin: 16px 0 8px 0; }
        .node-text { margin-bottom: 8px; }
        .node-link { color: #22d3ee; text-decoration: underline; cursor: pointer; display: block; margin-bottom: 8px; text-align: left; background: none; border: none; font-family: inherit; font-size: inherit; padding: 0; }
        .node-download { background: #854d0e; color: #fef08a; border: 4px double #eab308; padding: 8px 16px; margin: 16px 0; display: inline-block; font-weight: bold; text-decoration: none; text-align: center; }
        .node-download:hover { background: #a16207; color: #fff; cursor: pointer; }
        .node-button { background: #064e3b; color: #4ade80; border: 2px solid #16a34a; padding: 4px 16px; margin-bottom: 8px; }
        .node-image { border: 1px dashed #16a34a; padding: 8px; margin-bottom: 16px; display: inline-block; }
        .node-image-meta { color: #16a34a; font-size: 12px; margin-bottom: 4px; }
        .error { background: #7f1d1d; color: #fecaca; border: 2px solid #ef4444; padding: 16px; font-weight: bold; margin-bottom: 20px; }
        
        /* White Theme Overrides */
        body.theme-white { color: #e5e7eb; }
        .theme-white .header { border-bottom-color: #6b7280; }
        .theme-white .title { color: #d1d5db; }
        .theme-white input { border-color: #6b7280; color: white; }
        .theme-white input:focus { border-color: #9ca3af; background: #374151; }
        .theme-white button { background: #374151; border-color: #6b7280; color: #e5e7eb; }
        .theme-white button:hover { background: #4b5563; }
        .theme-white .nav-btn { color: #d1d5db; border-color: #6b7280; }
        .theme-white .nav-btn:hover:not(:disabled) { background: #374151; }
        .theme-white .nav-btn:disabled { border-color: #374151; color: #374151; }
        .theme-white .toggle-btn { color: #d1d5db; border-color: #d1d5db; }
        .theme-white .toggle-btn:hover { background: #d1d5db; }
        .theme-white #content { border-color: #374151; background: #111827; }
        .theme-white .node-header { color: #d1d5db; }
        .theme-white .node-link { color: #93c5fd; }
        .theme-white .node-download { background: #374151; color: #e5e7eb; border-color: #9ca3af; }
        .theme-white .node-download:hover { background: #4b5563; }
        .theme-white .node-button { background: #1f2937; color: #e5e7eb; border-color: #6b7280; }
        .theme-white .node-image { border-color: #6b7280; }
        .theme-white .node-image-meta { color: #9ca3af; }
    </style>
</head>
<body>
    <div class="header">
        <div class="toggles">
            <button class="toggle-btn" id="readerToggle">READER: OFF</button>
            <button class="toggle-btn" id="themeToggle">THEME: GREEN</button>
        </div>
        <div class="title">VS CODE DOS BROWSER</div>
        <div class="url-bar">
            <button id="backBtn" class="nav-btn" disabled>&lt; BACK</button>
            <button id="forwardBtn" class="nav-btn" disabled>FORWARD &gt;</button>
            <span>&gt;</span>
            <input type="text" id="urlInput" placeholder="ENTER URL (E.G. EXAMPLE.COM)..." />
            <button id="goBtn">GO</button>
        </div>
    </div>
    
    <div id="error" class="error" style="display: none;"></div>
    
    <div id="downloads" style="display: none; border: 2px solid #ca8a04; background: rgba(113, 63, 18, 0.3); padding: 16px; margin: 0 auto 20px auto; max-width: 800px; color: #facc15;">
        <div style="font-weight: bold; margin-bottom: 8px;">--- ACTIVE DOWNLOADS ---</div>
        <div id="download-list"></div>
    </div>

    <div id="content">
        <div style="text-align: center; color: inherit; opacity: 0.5; margin-top: 80px;">
            <p>SYSTEM READY.</p>
            <p>WAITING FOR INPUT...</p>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        let readerMode = false;
        let theme = 'green';
        let history = [];
        let historyIndex = -1;
        let activeDownloads = {};
        
        const urlInput = document.getElementById('urlInput');
        const goBtn = document.getElementById('goBtn');
        const backBtn = document.getElementById('backBtn');
        const forwardBtn = document.getElementById('forwardBtn');
        const readerToggle = document.getElementById('readerToggle');
        const themeToggle = document.getElementById('themeToggle');
        const contentDiv = document.getElementById('content');
        const errorDiv = document.getElementById('error');
        
        function updateNavButtons() {
            backBtn.disabled = historyIndex <= 0;
            forwardBtn.disabled = historyIndex >= history.length - 1;
        }

        backBtn.addEventListener('click', () => {
            if (historyIndex > 0) {
                historyIndex--;
                navigate(history[historyIndex], true);
            }
        });
        
        forwardBtn.addEventListener('click', () => {
            if (historyIndex < history.length - 1) {
                historyIndex++;
                navigate(history[historyIndex], true);
            }
        });

        readerToggle.addEventListener('click', () => {
            readerMode = !readerMode;
            readerToggle.textContent = \`READER: \${readerMode ? 'ON' : 'OFF'}\`;
        });
        
        themeToggle.addEventListener('click', () => {
            theme = theme === 'green' ? 'white' : 'green';
            themeToggle.textContent = \`THEME: \${theme.toUpperCase()}\`;
            document.body.className = theme === 'white' ? 'theme-white' : '';
        });
        
        function navigate(url, isHistoryNav = false) {
            contentDiv.innerHTML = '<div style="text-align: center; margin-top: 80px;">LOADING...</div>';
            errorDiv.style.display = 'none';
            
            let targetUrl = url;
            if (!targetUrl.startsWith('http')) {
                targetUrl = 'https://' + targetUrl;
            }
            
            urlInput.value = targetUrl;
            
            if (!isHistoryNav) {
                if (historyIndex < history.length - 1) {
                    history = history.slice(0, historyIndex + 1);
                }
                if (history.length === 0 || history[history.length - 1] !== targetUrl) {
                    history.push(targetUrl);
                    historyIndex = history.length - 1;
                }
            }
            updateNavButtons();
            
            vscode.postMessage({ command: 'fetchUrl', url: targetUrl, readerMode: readerMode });
        }
        
        goBtn.addEventListener('click', () => navigate(urlInput.value));
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') navigate(urlInput.value);
        });
        
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'render':
                    renderNodes(message.data);
                    break;
                case 'error':
                    errorDiv.textContent = 'ERROR: ' + message.error;
                    errorDiv.style.display = 'block';
                    contentDiv.innerHTML = '';
                    break;
                case 'downloadInit':
                    activeDownloads[message.id] = { filename: message.filename, progress: 0, status: 'downloading' };
                    renderDownloads();
                    break;
                case 'downloadProgress':
                    if (activeDownloads[message.id]) {
                        activeDownloads[message.id].progress = message.progress;
                        activeDownloads[message.id].status = message.status;
                        activeDownloads[message.id].error = message.error;
                        renderDownloads();
                    }
                    break;
                case 'downloadClear':
                    delete activeDownloads[message.id];
                    renderDownloads();
                    break;
            }
        });
        
        function renderDownloads() {
            const dlDiv = document.getElementById('downloads');
            const listDiv = document.getElementById('download-list');
            const keys = Object.keys(activeDownloads);
            
            if (keys.length === 0) {
                dlDiv.style.display = 'none';
                return;
            }
            
            dlDiv.style.display = 'block';
            let html = '';
            keys.forEach(id => {
                const dl = activeDownloads[id];
                const barLength = 20;
                const filled = Math.round((dl.progress / 100) * barLength);
                const empty = barLength - filled;
                const isDl = dl.status === 'downloading';
                
                const eqs = '='.repeat(filled);
                const gt = (isDl && filled < barLength) ? '>' : '';
                const spc = ' '.repeat(Math.max(0, empty - (gt ? 1 : 0)));
                const bar = \`[\${eqs}\${gt}\${spc}]\`;
                
                let statusText = '[DOWNLOADING]';
                let colors = '';
                if (dl.status === 'done') { statusText = '[COMPLETED]'; colors = 'color: #4ade80;'; }
                if (dl.status === 'error') { statusText = \`[ERROR: \${dl.error}]\`; colors = 'color: #f87171;'; }
                
                html += \`<div style="margin-bottom: 8px; font-family: monospace;">
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">\${dl.filename}</div>
                    <div>\${bar} \${dl.progress}% <span style="\${colors}">\${statusText}</span></div>
                </div>\`;
            });
            listDiv.innerHTML = html;
        }

        function queueDownload(url, text) {
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            vscode.postMessage({ command: 'download', url: url, filename: text || 'file', id: id });
        }

        function renderNodes(nodes) {
            contentDiv.innerHTML = '';
            
            if (nodes.length === 0) {
                contentDiv.innerHTML = '<div style="text-align: center; opacity: 0.5; margin-top: 80px;">NO CONTENT FOUND.</div>';
                return;
            }
            
            nodes.forEach(node => {
                let el;
                switch (node.type) {
                    case 'header':
                        el = document.createElement('div');
                        el.className = 'node-header';
                        el.textContent = '#'.repeat(node.level || 1) + ' ' + node.text;
                        break;
                    case 'text':
                        el = document.createElement('div');
                        el.className = 'node-text';
                        el.textContent = node.text;
                        break;
                    case 'link':
                        el = document.createElement('button');
                        el.className = 'node-link';
                        el.textContent = '[' + node.text + ']';
                        el.onclick = () => navigate(node.href);
                        break;
                    case 'download':
                        el = document.createElement('button');
                        el.className = 'node-download';
                        el.textContent = '[ V ] QUEUE DOWNLOAD: ' + node.text;
                        el.onclick = () => queueDownload(node.href, node.text);
                        break;
                    case 'button':
                        el = document.createElement('button');
                        el.className = 'node-button';
                        el.textContent = '< ' + node.text + ' >';
                        break;
                    case 'image':
                        el = document.createElement('div');
                        el.className = 'node-image';
                        el.innerHTML = \`<div class="node-image-meta">IMG: \${node.alt || 'Unknown'} - \${node.src}</div>\`;
                        break;
                }
                if (el) contentDiv.appendChild(el);
            });
        }
    </script>
</body>
</html>`;
}
