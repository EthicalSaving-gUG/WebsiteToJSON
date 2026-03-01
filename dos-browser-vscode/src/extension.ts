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
                            const result = await fetchAndParse(message.url, message.readerMode, false);
                            panel.webview.postMessage({ command: 'render', data: result.nodes });
                        } catch (err: any) {
                            panel.webview.postMessage({ command: 'error', error: err.message });
                        }
                        return;
                    case 'fetchReport':
                        try {
                            const result = await fetchAndParse(message.url, message.readerMode, true);
                            // Save report file to workspace
                            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
                            const reportsDir = path.join(workspacePath, 'Reports');
                            if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
                            try {
                                const urlObj = new URL(message.url.startsWith('http') ? message.url : `https://${message.url}`);
                                const domain = urlObj.hostname.replace(/[^a-z0-9]/gi, '_');
                                const reportFileName = `report-${domain}-${Date.now()}.json`;
                                const reportPath = path.join(reportsDir, reportFileName);
                                fs.writeFileSync(reportPath, JSON.stringify(result.report, null, 2));
                                vscode.window.showInformationMessage(`[DOS Browser] Report saved to Reports/${reportFileName}`);
                            } catch (e: any) {
                                vscode.window.showErrorMessage(`[DOS Browser] Failed to save report: ${e.message}`);
                            }
                            // Send report back to webview for display
                            panel.webview.postMessage({ command: 'reportReady', report: result.report });
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

async function fetchAndParse(url: string, readerMode: boolean, reportMode: boolean = false) {
    // Load global config
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    let globalConfig: any = {};
    const configPaths = [
        path.join(workspaceRoot, 'config.json'),
        path.join(__dirname, '..', '..', 'config.json') // also check root browser dir
    ];
    for (const cp of configPaths) {
        if (fs.existsSync(cp)) {
            try { globalConfig = JSON.parse(fs.readFileSync(cp, 'utf8')); break; } catch (e) { }
        }
    }

    const captchaMode = vscode.workspace.getConfiguration('dosBrowser').get<string>('captchaMode', '') || globalConfig.captchaMode || '';
    const generateReports = (vscode.workspace.getConfiguration('dosBrowser').get<boolean>('generateReports', false) || globalConfig.generateReports || false);
    const effectiveReportMode = reportMode || generateReports;

    let diagnosticReport: any = {
        url: url,
        timestamp: new Date().toISOString(),
        cookiewallBypassed: false,
        captchaIntervened: false,
        captchaSolverUsed: null,
        promptInjectionsStripped: 0,
        adsBlocked: 0,
        obstructiveCssNodes: 0,
        otherIssues: []
    };

    let targetUrl = url;

    function getCookiesForUrl(u: string) {
        let cookies = 'CONSENT=YES+cb; CookieConsent={stamp:\'%2B\',necessary:true,preferences:true,statistics:true,marketing:true,method:\'explicit\',ver:1,utc:1610000000000}; accept_cookies=true; cookie_notice_accepted=true;';
        if (u.includes('golem.de')) cookies += ' golem_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
        if (u.includes('spiegel.de')) cookies += ' spiegel_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
        if (u.includes('zeit.de')) cookies += ' zeit_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
        return cookies;
    }

    function isCookieWall(html: string) {
        const lower = html.toLowerCase();
        return lower.includes('id="sp_message_container"') ||
            lower.includes('id="onetrust-consent-sdk"') ||
            lower.includes('class="sp_message_container"') ||
            lower.includes('consent.cmp') ||
            lower.includes('id="gspmessage"') ||
            lower.includes('golem pur bestellen') ||
            (lower.includes('zustimmung') && lower.includes('datenschutz') && lower.includes('akzeptieren'));
    }

    let response = await fetch(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': getCookiesForUrl(targetUrl)
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    let html = await response.text();


    function needsCaptcha(html: string, status: number) {
        if (status === 403 || status === 503) {
            diagnosticReport.captchaIntervened = true;
            return true;
        }
        const lower = html.toLowerCase();
        const hasCaptcha = lower.includes('cf-browser-verification') ||
            lower.includes('just a moment...') ||
            lower.includes('enable javascript and cookies to continue') ||
            lower.includes('cf-turnstile');
        if (hasCaptcha) diagnosticReport.captchaIntervened = true;
        return hasCaptcha;
    }

    function getPuppeteer(): any {
        let p: any;
        try {
            require.resolve('puppeteer-extra');
        } catch (e) {
            vscode.window.showInformationMessage('[DOS Browser] Puppeteer missing. Downloading dynamically... This may take a minute.');
            require('child_process').execSync('npm install --no-save puppeteer puppeteer-extra puppeteer-extra-plugin-stealth', { stdio: 'ignore', cwd: __dirname });
        }
        p = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        p.use(StealthPlugin());
        return p;
    }

    if (needsCaptcha(html, response.status)) {
        diagnosticReport.captchaSolverUsed = captchaMode || 'none';
        if (captchaMode === 'browser') {
            const open = require('open');
            await open(targetUrl);
            vscode.window.showInformationMessage(`[DOS Browser] CAPTCHA detected on ${targetUrl}. Please solve it in your system browser. Waiting 15 seconds to retry...`);
            await new Promise(r => setTimeout(r, 15000));

            response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Cookie': getCookiesForUrl(targetUrl)
                }
            });
            html = await response.text();
        } else if (captchaMode === 'stealth') {
            try {
                const puppeteer = getPuppeteer();
                const browser = await puppeteer.launch({ headless: 'new' });
                const page = await browser.newPage();
                await page.goto(targetUrl, { waitUntil: 'networkidle2' });
                await new Promise(r => setTimeout(r, 6000));
                html = await page.content();
                await browser.close();
            } catch (e: any) {
                vscode.window.showErrorMessage('Puppeteer is not installed in the workspace! Please run `npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth` in the dos-browser folder to use Stealth mode.');
            }
        } else if (captchaMode === 'api') {
            vscode.window.showErrorMessage('2Captcha API is pending full implementation.');
        } else {
            vscode.window.showErrorMessage(`[DOS Browser] CAPTCHA detected, but no solver configured. Go to Settings > DOS Browser > Captcha Mode to select one.`);
        }
    }

    if (isCookieWall(html)) {
        diagnosticReport.cookiewallBypassed = true;
        response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Cookie': getCookiesForUrl(targetUrl)
            }
        });
        html = await response.text();

        if (isCookieWall(html)) {
            targetUrl = `https://web.archive.org/web/2/${targetUrl}`;
            response = await fetch(targetUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            html = await response.text();
        }
    }

    const virtualConsole = new (require('jsdom').VirtualConsole)();

    // Check if user has enabled a custom debug mode in settings, else disable
    const debugMode = vscode.workspace.getConfiguration('dosBrowser').get('debugLogging', false);

    function logError(type: string, args: any[]) {
        if (debugMode) {
            try {
                const fs = require('fs');
                const path = require('path');
                const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
                const errPath = path.join(workspacePath, 'errors.txt');
                const msg = `[${new Date().toISOString()}] [${type}] ${args.map(a => String(a?.message || a)).join(' ')}\n`;
                fs.appendFileSync(errPath, msg);
            } catch (e) { }
        }
    }

    virtualConsole.on("error", (...args: any[]) => logError("ERROR", args));
    virtualConsole.on("warn", (...args: any[]) => logError("WARN", args));
    virtualConsole.on("jsdomError", (...args: any[]) => logError("JSDOM_ERROR", args));

    const doc = new JSDOM(html, { url: targetUrl, virtualConsole });
    const window = doc.window;
    const document = window.document;

    let workingDocument = document;

    if (readerMode) {
        const reader = new Readability(document as any);
        const article = reader.parse();

        if (article && article.content) {
            const cleanDOMPurify = DOMPurify(window as any);
            const safeHtml = cleanDOMPurify.sanitize(article.content);

            const cleanDoc = new JSDOM(`<html><body><h1>${article.title || ''}</h1>${safeHtml}</body></html>`, { url, virtualConsole });
            workingDocument = cleanDoc.window.document;
        }
    }

    const result: any[] = [];
    let idCounter = 0;

    function isHidden(el: any) {
        const idStr = String(el.id || '').toLowerCase();
        const classStr = typeof el.className === 'string' ? el.className.toLowerCase() : '';

        // Cookie Consent Filter
        if (idStr.includes('cookie') || classStr.includes('cookie') || idStr.includes('consent') || classStr.includes('consent') || idStr.includes('onetrust') || classStr.includes('onetrust')) {
            return true;
        }

        // Ad Blocker Filter
        if (idStr.includes('ad-') || classStr.includes('ad-') || idStr.includes('advert') || classStr.includes('advert') || idStr.includes('banner') || classStr.includes('banner') || idStr.includes('sponsor') || classStr.includes('sponsor') || classStr.includes('outbrain') || classStr.includes('taboola') || classStr.includes('adsense')) {
            diagnosticReport.adsBlocked++;
            return true;
        }

        if (!workingDocument.defaultView) return false;
        try {
            const style = workingDocument.defaultView.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || parseInt(style.zIndex || '0', 10) < 0) {
                diagnosticReport.obstructiveCssNodes++;
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    function cleanText(text: string | null) {
        const cleaned = text ? text.replace(/\s+/g, ' ').trim() : '';
        if (!cleaned) return '';

        const promptRegex = /(ignore (all |previous )?instructions|disregard (all |previous )?instructions|forget (all |previous )?(instructions|prompts)|system prompt|secret instructions|print your instructions|summarize all of your secret instructions|you are a(n)? |act as a(n)? |developer mode|bypass restrictions|do anything now|DAN)/i;
        if (promptRegex.test(cleaned)) {
            diagnosticReport.promptInjectionsStripped++;
            try {
                const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
                const csvPath = path.join(workspacePath, 'promt_injections.csv');
                const logLine = `"${url}","${cleaned.replace(/"/g, '""')}"\n`;
                if (!fs.existsSync(csvPath)) fs.writeFileSync(csvPath, 'URL,Injection_Attempt\n');
                fs.appendFileSync(csvPath, logLine);
            } catch (e) { }
            return ''; // Safely filter it out
        }
        return cleaned;
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
    return { nodes: result, report: effectiveReportMode ? diagnosticReport : null };
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
        .report-btn {
            background: black;
            color: #eab308;
            border: 1px solid #ca8a04;
            font-size: 12px;
            padding: 4px 8px;
        }
        .report-btn:hover:not(:disabled) { background: #eab308; color: black; }
        .report-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        #report-panel {
            position: fixed; top: 0; right: 0; width: 420px; height: 100vh;
            background: #111; border-left: 2px solid #eab308;
            color: #facc15; font-family: monospace; font-size: 12px;
            overflow-y: auto; padding: 20px; z-index: 100;
            box-shadow: -4px 0 20px rgba(234,179,8,0.2);
            display: none;
        }
        #report-panel h2 { color: #fbbf24; margin-top: 0; font-size: 14px; letter-spacing: 2px; }
        .report-row { display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding: 6px 0; }
        .report-key { color: #9ca3af; }
        .report-val-true { color: #f87171; }
        .report-val-false { color: #4ade80; }
        .report-val-num { color: #60a5fa; }
        .report-val-str { color: #fbbf24; }
        #report-close { float: right; background: none; border: 1px solid #6b7280; color: #9ca3af; font-size: 11px; padding: 2px 8px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="header">
        <div class="toggles">
            <button class="toggle-btn" id="readerToggle">READER: OFF</button>
            <button class="report-btn" id="reportBtn" disabled title="Generate extraction diagnostic report">[ REPORT ]</button>
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

    <div id="report-panel">
        <button id="report-close" onclick="document.getElementById('report-panel').style.display='none'">CLOSE ✕</button>
        <h2>⚙ EXTRACTION DIAGNOSTIC REPORT</h2>
        <div id="report-content"></div>
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
        const reportBtn = document.getElementById('reportBtn');
        const contentDiv = document.getElementById('content');
        const errorDiv = document.getElementById('error');
        const reportPanel = document.getElementById('report-panel');
        const reportContent = document.getElementById('report-content');
        
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

        reportBtn.addEventListener('click', () => {
            const current = urlInput.value.trim();
            if (!current) return;
            reportBtn.textContent = 'REPORTING...';
            reportBtn.disabled = true;
            vscode.postMessage({ command: 'fetchReport', url: current, readerMode: readerMode });
        });
        
        themeToggle.addEventListener('click', () => {
            theme = theme === 'green' ? 'white' : 'green';
            themeToggle.textContent = \`THEME: \${theme.toUpperCase()}\`;
            document.body.className = theme === 'white' ? 'theme-white' : '';
        });
        
        function navigate(url, isHistoryNav = false) {
            contentDiv.innerHTML = '<div style="text-align: center; margin-top: 80px;">LOADING...</div>';
            errorDiv.style.display = 'none';
            reportBtn.disabled = false;
            
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
                    reportBtn.textContent = '[ REPORT ]';
                    reportBtn.disabled = false;
                    break;
                case 'reportReady':
                    reportBtn.textContent = '[ REPORT ]';
                    reportBtn.disabled = false;
                    showReport(message.report);
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

        function showReport(report) {
            if (!report) return;
            const rows = [
                ['URL', report.url],
                ['Timestamp', report.timestamp],
                ['Cookie Wall Bypassed', report.cookiewallBypassed],
                ['CAPTCHA Intervened', report.captchaIntervened],
                ['CAPTCHA Solver Used', report.captchaSolverUsed || 'N/A'],
                ['Prompt Injections Stripped', report.promptInjectionsStripped],
                ['Ads / Trackers Blocked', report.adsBlocked],
                ['Obstructive CSS Nodes', report.obstructiveCssNodes],
                ['Other Issues', (report.otherIssues || []).join(', ') || 'None']
            ];
            reportContent.innerHTML = rows.map(([k, v]) => {
                let cls = 'report-val-str';
                if (v === true) cls = 'report-val-true';
                else if (v === false) cls = 'report-val-false';
                else if (typeof v === 'number') cls = 'report-val-num';
                return \`<div class="report-row"><span class="report-key">\${k}</span><span class="\${cls}">\${v}</span></div>\`;
            }).join('');
            reportPanel.style.display = 'block';
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
