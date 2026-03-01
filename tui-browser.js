#!/usr/bin/env node

const blessed = require('blessed');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
let config = {};
if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { }
}

const args = process.argv.slice(2);
const debugMode = args.includes('--debug') || (config.debugLogging || false);
const captchaMode = (args.find(a => a.startsWith('--captcha=')) || '').split('=')[1] || (config.captchaMode || null);
const reportMode = args.includes('--report') || (config.generateReports || false);
const readerMode = args.includes('--reader') || false;
const jsRender = args.includes('--js') || (config.jsRender || false);

// Create a screen object.
const screen = blessed.screen({
    smartCSR: true,
    title: 'DOS Browser TUI'
});

// Top header for URL
const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    border: {
        type: 'line'
    },
    style: {
        fg: 'green',
        border: {
            fg: '#16a34a'
        }
    }
});

const promptText = blessed.text({
    parent: header,
    top: 0,
    left: 1,
    content: '> URL: ',
    style: {
        fg: 'yellow'
    }
});

const urlInput = blessed.textbox({
    parent: header,
    top: 0,
    left: 8,
    width: '100%-12',
    height: 1,
    inputOnFocus: true,
    style: {
        fg: 'green',
        focus: {
            bg: 'gray',
            fg: 'white'
        }
    }
});

// Main content box
const contentBox = blessed.box({
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-4',
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
        ch: ' ',
        track: {
            bg: 'cyan'
        },
        style: {
            inverse: true
        }
    },
    keys: true,
    vi: true,
    mouse: true,
    border: {
        type: 'line'
    },
    style: {
        fg: 'green',
        border: {
            fg: 'green'
        }
    },
    tags: true,
    content: '{center}SYSTEM READY. \nPRESS [ENTER] OR CLICK URL BAR TO NAVIGATE.\nUSE [UP]/[DOWN] ARROWS TO SCROLL.{/center}'
});

// Footer
const footer = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    style: {
        fg: 'white',
        bg: 'blue'
    },
    content: ' [ESC/C-c] Quit | [TAB] Switch Focus | [Enter] Go / Open Link | [Arrows] Navigate '
});

let currentResult = [];
let focusableItems = [];
let focusedItemIndex = -1;

function renderParsedContent() {
    let renderLines = [];
    focusableItems = [];

    function sanitizeBlessed(str) {
        return (str || '').replace(/\{/g, '{open}').replace(/\}/g, '{close}');
    }

    for (const item of currentResult) {
        if (['link', 'download', 'button'].includes(item.type)) {
            item.linkIndex = focusableItems.length;
            focusableItems.push({ ...item, lineApprox: renderLines.length });
        }

        const isFocused = (item.linkIndex === focusedItemIndex);

        if (item.type === 'header') {
            renderLines.push(`\n{yellow-fg}{bold}${'#'.repeat(item.level)} ${sanitizeBlessed(item.text)}{/bold}{/yellow-fg}\n`);
        } else if (item.type === 'link') {
            if (isFocused) {
                renderLines.push(`{black-bg}{white-fg}[ ${sanitizeBlessed(item.text)} ]{/white-fg}{/black-bg} -> {gray-fg}${item.href}{/gray-fg}`);
            } else {
                renderLines.push(`{cyan-fg}[ ${sanitizeBlessed(item.text)} ]{/cyan-fg} -> {gray-fg}${item.href}{/gray-fg}`);
            }
        } else if (item.type === 'download') {
            if (isFocused) {
                renderLines.push(`\n{white-bg}{black-fg}{bold} [V] DOWNLOAD: ${sanitizeBlessed(item.text)} {/bold}{/black-fg}{/white-bg}\n    -> {cyan-fg}${item.href}{/cyan-fg}\n`);
            } else {
                renderLines.push(`\n{yellow-bg}{black-fg}{bold} [V] DOWNLOAD: ${sanitizeBlessed(item.text)} {/bold}{/black-fg}{/yellow-bg}\n    -> {cyan-fg}${item.href}{/cyan-fg}\n`);
            }
        } else if (item.type === 'button') {
            if (isFocused) {
                renderLines.push(`{black-bg}{white-fg} < ${sanitizeBlessed(item.text)} > {/white-fg}{/black-bg}`);
            } else {
                renderLines.push(`{white-bg}{black-fg} < ${sanitizeBlessed(item.text)} > {/black-fg}{/white-bg}`);
            }
        } else if (item.type === 'image') {
            renderLines.push(`\n{green-fg}[ IMG: ${sanitizeBlessed(item.alt || 'Unknown')} - ${item.src} ]{/green-fg}\n`);
        } else if (item.type === 'text') {
            renderLines.push(`${sanitizeBlessed(item.text)}`);
        } else if (item.type === 'input') {
            const lbl = item.label ? `(Label: "${sanitizeBlessed(item.label)}")` : '';
            if (isFocused) {
                renderLines.push(`{black-bg}{white-fg}[ ${item.inputType.toUpperCase()}: ________ ] ${lbl}{/white-fg}{/black-bg}`);
            } else {
                renderLines.push(`{white-bg}{black-fg}[ ${item.inputType.toUpperCase()}: ________ ] ${lbl}{/black-fg}{/white-bg}`);
            }
        }
    }

    if (renderLines.length === 0) {
        contentBox.setContent(`{center}NO CONTENT FOUND FOR THIS PAGE.{/center}`);
    } else {
        const outStr = renderLines.join('\n');
        contentBox.setContent(outStr);
    }
    screen.render();
}

const downloadsBox = blessed.box({
    top: 'center',
    left: 'center',
    width: '80%',
    height: 10,
    border: { type: 'line' },
    style: { fg: 'yellow', border: { fg: 'yellow' }, bg: 'blue' },
    content: '{center}{bold}--- ACTIVE DOWNLOAD ---{/bold}{/center}\n\n',
    hidden: true,
    tags: true,
    shadow: true
});

screen.append(header);
screen.append(contentBox);
screen.append(footer);
screen.append(downloadsBox);

function getPuppeteer() {
    let p;
    try {
        require.resolve('puppeteer-extra');
    } catch (e) {
        contentBox.setContent(`{center}{yellow-fg}[DEPENDENCY] Puppeteer not found. Downloading dynamically... This may take a minute.{/yellow-fg}{/center}`);
        screen.render();
        require('child_process').execSync('npm install --no-save puppeteer puppeteer-extra puppeteer-extra-plugin-stealth', { stdio: 'ignore', cwd: process.cwd() });
    }
    p = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    p.use(StealthPlugin());
    return p;
}

async function fetchAndRender(url) {
    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
        targetUrl = 'https://' + targetUrl;
    }

    contentBox.setContent(`{center}LOADING ${targetUrl}...{/center}`);
    screen.render();

    let diagnosticReport = {
        url: targetUrl,
        timestamp: new Date().toISOString(),
        cookiewallBypassed: false,
        captchaIntervened: false,
        captchaSolverUsed: null,
        promptInjectionsStripped: 0,
        adsBlocked: 0,
        obstructiveCssNodes: 0,
        otherIssues: []
    };

    try {
        function getCookiesForUrl(u) {
            let cookies = 'cookieyes-consent=consent:yes; CONSENT=YES+cb; CookieConsent={stamp:\'%2B\',necessary:true,preferences:true,statistics:true,marketing:true,method:\'explicit\',ver:1,utc:1610000000000}; accept_cookies=true; cookie_notice_accepted=true;';
            if (u.includes('golem.de')) cookies += ' golem_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
            if (u.includes('spiegel.de')) cookies += ' spiegel_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
            if (u.includes('zeit.de')) cookies += ' zeit_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
            return cookies;
        }

        function isCookieWall(html) {
            const lower = html.toLowerCase();
            return lower.includes('id="sp_message_container"') ||
                lower.includes('id="onetrust-consent-sdk"') ||
                lower.includes('id="cookieyes-banner"') ||
                lower.includes('class="sp_message_container"') ||
                lower.includes('consent.cmp') ||
                lower.includes('id="gspmessage"') ||
                lower.includes('golem pur bestellen') ||
                (lower.includes('zustimmung') && lower.includes('datenschutz') && lower.includes('akzeptieren'));
        }

        let html = '';
        let contentType = '';
        let response = null;

        if (jsRender) {
            diagnosticReport.otherIssues.push('[JS_RENDER] Using forced Puppeteer engine.');
            contentBox.setContent(`{center}{yellow-fg}[JS_RENDER] Forced JS rendering mode active. Booting Puppeteer...{/yellow-fg}{/center}`);
            screen.render();
            try {
                const puppeteer = getPuppeteer();
                const pBrowser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                const pPage = await pBrowser.newPage();
                await pPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await pPage.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(r => setTimeout(r, 4000));

                // Aggressively attempt to click "Accept Cookies" banners
                await pPage.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, a, div')).find(el => {
                        const t = (el.textContent || '').toLowerCase();
                        return (t.includes('accept') || t.includes('akzeptieren') || t.includes('agree') || t.includes('zustimmen') || t.includes('allow all')) &&
                            (t.includes('cookie') || el.className.toLowerCase().includes('cookie') || el.id.toLowerCase().includes('cookie'));
                    });
                    if (btn) btn.click();

                    // Hard remove common banner containers
                    document.querySelectorAll('div, section').forEach(el => {
                        const id = (el.id || '').toLowerCase();
                        const cls = (el.className || '').toLowerCase();
                        if (id.includes('cookie') || cls.includes('cookie') || id.includes('consent') || cls.includes('consent') || id.includes('onetrust') || cls.includes('onetrust') || id.includes('sp_message')) {
                            el.remove();
                        }
                    });
                });
                await new Promise(r => setTimeout(r, 1500));

                html = await pPage.content();
                await pBrowser.close();
                contentBox.setContent(`{center}{green-fg}[JS_RENDER] Puppeteer extraction complete.{/green-fg}{/center}`);
                screen.render();
            } catch (e) {
                contentBox.setContent(`{center}{red-fg}[JS_RENDER ERROR] Puppeteer not installed: ${e.message}{/red-fg}{/center}`);
                screen.render();
                process.exit(1);
            }
        } else {
            response = await fetch(targetUrl, {
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

            contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('application/xml')) {
                return await startTuiDownload(targetUrl, response);
            }

            html = await response.text();
        }

        function needsCaptcha(html, status) {
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

        if (needsCaptcha(html, response?.status || 200)) {
            diagnosticReport.captchaSolverUsed = captchaMode || 'none';
            if (captchaMode === 'browser') {
                contentBox.setContent(`{center}{yellow-fg}[CAPTCHA] OPENING SYSTEM BROWSER...{/yellow-fg}{/center}`);
                screen.render();
                const open = require('open');
                await open(targetUrl);

                contentBox.setContent(`{center}{yellow-fg}[CAPTCHA] PLEASE SOLVE IN BROWSER.{/yellow-fg}\n\n{white-fg}Waiting 15 seconds to automatically retry...{/white-fg}{/center}`);
                screen.render();
                await new Promise(r => setTimeout(r, 15000));

                contentBox.setContent(`{center}{yellow-fg}[CAPTCHA] RETRYING FETCH...{/yellow-fg}{/center}`);
                screen.render();
                response = await fetch(targetUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Cookie': getCookiesForUrl(targetUrl)
                    }
                });
                html = await response.text();
            } else if (captchaMode === 'stealth') {
                contentBox.setContent(`{center}{yellow-fg}[CAPTCHA] BOOTING PUPPETEER STEALTH...{/yellow-fg}{/center}`);
                screen.render();
                try {
                    const puppeteer = getPuppeteer();
                    const browser = await puppeteer.launch({ headless: 'new' });
                    const page = await browser.newPage();
                    await page.goto(targetUrl, { waitUntil: 'networkidle2' });
                    await new Promise(r => setTimeout(r, 6000));
                    html = await page.content();
                    await browser.close();
                } catch (e) {
                    contentBox.setContent(`{center}{red-fg}[CAPTCHA ERROR] Puppeteer not installed. Run: npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth{/red-fg}{/center}`);
                    screen.render();
                    await new Promise(r => setTimeout(r, 4000));
                }
            } else if (captchaMode === 'api') {
                contentBox.setContent(`{center}{red-fg}[CAPTCHA ERROR] 2Captcha API pending implementation...{/red-fg}{/center}`);
                screen.render();
                await new Promise(r => setTimeout(r, 2000));
            } else {
                contentBox.setContent(`{center}{red-fg}[CAPTCHA DETECTED] No solver specified! Pass --captcha=browser|stealth|api{/red-fg}{/center}`);
                screen.render();
                await new Promise(r => setTimeout(r, 3000));
            }
        }
        // Auto SPA detection: if the page body is a JS-only skeleton, use Puppeteer to render it
        function isSpaShell(html) {
            const lower = html.toLowerCase();
            const hasSkeletonLoader = lower.includes('skeleton') || lower.includes('loader-wrapper') || lower.includes('data-loader');
            const hasRealContent = lower.includes('<input') || lower.includes('<form') || lower.includes('<article') || lower.includes('<p>') || lower.includes('<p ');
            if (hasSkeletonLoader && !hasRealContent) return true;
            const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            if (bodyMatch) {
                const bodyText = bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (bodyText.length < 200) return true;
            }
            return false;
        }

        if (isSpaShell(html)) {
            diagnosticReport.otherIssues.push('[SPA_SHELL] JS-only SPA detected. Attempting Puppeteer render...');
            contentBox.setContent(`{center}{yellow-fg}[SPA] JS-only SPA detected. Booting Puppeteer to render JS...{/yellow-fg}{/center}`);
            screen.render();
            try {
                const puppeteer = getPuppeteer();
                const pBrowser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                const pPage = await pBrowser.newPage();
                await pPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await pPage.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(r => setTimeout(r, 4000));

                // Aggressively attempt to click "Accept Cookies" banners and delete them from DOM
                await pPage.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, a, div')).find(el => {
                        const t = (el.textContent || '').toLowerCase();
                        return (t.includes('accept') || t.includes('akzeptieren') || t.includes('agree') || t.includes('zustimmen') || t.includes('allow all')) &&
                            (t.includes('cookie') || el.className.toLowerCase().includes('cookie') || el.id.toLowerCase().includes('cookie'));
                    });
                    if (btn) btn.click();

                    // Hard remove common banner containers
                    document.querySelectorAll('div, section').forEach(el => {
                        const id = (el.id || '').toLowerCase();
                        const cls = (el.className || '').toLowerCase();
                        if (id.includes('cookie') || cls.includes('cookie') || id.includes('consent') || cls.includes('consent') || id.includes('onetrust') || cls.includes('onetrust') || id.includes('sp_message')) {
                            el.remove();
                        }
                    });
                });
                await new Promise(r => setTimeout(r, 1500));

                html = await pPage.content();
                await pBrowser.close();
                contentBox.setContent(`{center}{green-fg}[SPA] Puppeteer JS render complete.{/green-fg}{/center}`);
                screen.render();
            } catch (e) {
                contentBox.setContent(`{center}{red-fg}[SPA ERROR] Puppeteer not installed. Run: npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth{/red-fg}{/center}`);
                screen.render();
                diagnosticReport.otherIssues.push('[SPA_SHELL] Puppeteer unavailable: ' + e.message);
                await new Promise(r => setTimeout(r, 4000));
            }
        }

        // Attempt Fallback if blocked
        if (isCookieWall(html)) {
            diagnosticReport.cookiewallBypassed = true;
            contentBox.setContent(`{center}{yellow-fg}COOKIE WALL DETECTED. ATTEMPTING BYPASS...{/yellow-fg}{/center}`);
            screen.render();

            response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Cookie': getCookiesForUrl(targetUrl)
                }
            });
            html = await response.text();

            if (isCookieWall(html)) {
                contentBox.setContent(`{center}{yellow-fg}STILL BLOCKED. FALLING BACK TO WEB CACHE...{/yellow-fg}{/center}`);
                screen.render();
                targetUrl = `https://web.archive.org/web/2/${targetUrl}`;
                response = await fetch(targetUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                });
                html = await response.text();
            }
        }

        const virtualConsole = new (require('jsdom').VirtualConsole)();

        function logError(type, args) {
            if (debugMode) {
                try {
                    const errPath = path.join(process.cwd(), 'errors.txt');
                    const msg = `[${new Date().toISOString()}] [${type}] ${args.map(a => String(a?.message || a)).join(' ')}\n`;
                    fs.appendFileSync(errPath, msg);
                } catch (e) { }
            }
        }

        virtualConsole.on("error", (...args) => logError("ERROR", args));
        virtualConsole.on("warn", (...args) => logError("WARN", args));
        virtualConsole.on("jsdomError", (...args) => logError("JSDOM_ERROR", args));

        const doc = new JSDOM(html, { url: targetUrl, virtualConsole });
        const window = doc.window;
        const document = window.document;

        let workingDocument = document;

        // Apply Reader Mode logic only if requested
        if (readerMode) {
            const reader = new Readability(document);
            const article = reader.parse();

            if (article && article.content) {
                const cleanDOMPurify = DOMPurify(window);
                const safeHtml = cleanDOMPurify.sanitize(article.content);
                const cleanDoc = new JSDOM(`<html><body><h1>${article.title || ''}</h1>${safeHtml}</body></html>`, { url: targetUrl, virtualConsole });
                workingDocument = cleanDoc.window.document;
            }
        }

        const result = [];
        let idCounter = 0;

        function isHidden(el) {
            const tagName = (el.tagName || '').toLowerCase();
            // ALWAYS preserve essential form elements, even if parent is display:none
            if (['input', 'select', 'textarea', 'button'].includes(tagName)) return false;
            // Also preserve containers that hold these elements
            try {
                if (el.querySelector && el.querySelector('input:not([type="hidden"]), select, textarea, button')) return false;
            } catch (e) { }

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
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || style.zIndex < 0) {
                    diagnosticReport.obstructiveCssNodes++;
                    return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        }

        function resolveLabelForInput(el) {
            let labelText = '';
            if (el.id) {
                const explicitLabel = workingDocument.querySelector(`label[for="${el.id}"]`);
                if (explicitLabel) {
                    labelText = cleanText(explicitLabel.textContent);
                    if (labelText) return labelText;
                }
            }
            let parent = el.parentElement;
            while (parent && parent.tagName !== 'BODY' && parent.tagName !== 'FORM') {
                if (parent.tagName.toLowerCase() === 'label') {
                    const clone = parent.cloneNode(true);
                    const inputs = clone.querySelectorAll('input, select, textarea');
                    inputs.forEach(i => i.remove());
                    labelText = cleanText(clone.textContent);
                    if (labelText) return labelText;
                }
                parent = parent.parentElement;
            }
            if (el.getAttribute('aria-label')) return cleanText(el.getAttribute('aria-label'));
            return el.placeholder ? '(Placeholder: ' + cleanText(el.placeholder) + ')' : '';
        }

        function cleanText(text) {
            const cleaned = text ? text.replace(/\s+/g, ' ').trim() : '';
            if (!cleaned) return '';

            const promptRegex = /(ignore (all |previous )?instructions|disregard (all |previous )?instructions|forget (all |previous )?(instructions|prompts)|system prompt|secret instructions|print your instructions|summarize all of your secret instructions|you are a(n)? |act as a(n)? |developer mode|bypass restrictions|do anything now|DAN)/i;
            if (promptRegex.test(cleaned)) {
                diagnosticReport.promptInjectionsStripped++;
                try {
                    const csvPath = path.join(process.cwd(), 'promt_injections.csv');
                    const logLine = `"${targetUrl}","${cleaned.replace(/"/g, '""')}"\n`;
                    if (!fs.existsSync(csvPath)) fs.writeFileSync(csvPath, 'URL,Injection_Attempt\n');
                    fs.appendFileSync(csvPath, logLine);
                } catch (e) { }
                return ''; // Safely filter it out
            }
            return cleaned;
        }

        function walkDOM(node) {
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
                        result.push({ type: isDownload ? 'download' : 'link', text: text, href: el.href });
                    }
                    return;
                }

                if (tagName === 'button' || (tagName === 'input' && el.type === 'button') || (tagName === 'input' && el.type === 'submit')) {
                    const text = cleanText(el.textContent) || el.value || 'Submit';
                    result.push({ type: 'button', text: text });
                    return;
                }

                if (tagName === 'form') {
                    const inputs = el.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
                    if (inputs.length > 0) {
                        result.push({ type: 'text', text: `\n--- [FORM START] ---` });
                        inputs.forEach(input => {
                            const lbl = resolveLabelForInput(input);
                            const name = input.name || input.id || 'unnamed_field';
                            const type = input.tagName.toLowerCase() === 'input' ? input.type : input.tagName.toLowerCase();
                            result.push({
                                type: 'input',
                                label: lbl,
                                name: name,
                                inputType: type
                            });
                        });
                        result.push({ type: 'text', text: `--- [FORM END] ---\n` });
                    }
                    return;
                }

                if (tagName === 'img') {
                    if (el.src) {
                        result.push({ type: 'image', src: el.src, alt: el.alt || '' });
                    }
                    return;
                }

                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                    const text = cleanText(el.textContent);
                    if (text) {
                        result.push({ type: 'header', level: parseInt(tagName.replace('h', '')), text: text });
                    }
                    return;
                }
            } else if (node.nodeType === workingDocument.defaultView?.Node.TEXT_NODE || node.nodeType === 3) {
                const text = cleanText(node.textContent);
                if (text && text.length > 5) {
                    const parentTag = node.parentNode?.tagName?.toLowerCase();
                    if (!['a', 'button', 'script', 'style', 'title', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'noscript'].includes(parentTag)) {
                        result.push({ type: 'text', text: text });
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

        currentResult = result;
        focusedItemIndex = -1;
        renderParsedContent();

        contentBox.scrollTo(0);
        contentBox.focus(); // Auto-focus content so they can start arrowing immediately

        if (reportMode) {
            try {
                const urlObj = new URL(targetUrl);
                const domain = urlObj.hostname.replace(/[^a-z0-9]/gi, '_');
                const timestamp = new Date().getTime();
                const reportFileName = `report-${domain}-${timestamp}.json`;
                const reportPath = path.join(process.cwd(), 'Reports', reportFileName);
                fs.writeFileSync(reportPath, JSON.stringify(diagnosticReport, null, 2));
                // Show brief success toast in TUI
                const originalTitle = screen.title;
                screen.title = `[REPORT SAVED TO Reports/${reportFileName}]`;
                setTimeout(() => { screen.title = originalTitle; screen.render(); }, 3000);
            } catch (e) { }
        }

        screen.render();

    } catch (err) {
        require('fs').writeFileSync('errors.txt', err.stack || err.message);
        contentBox.setContent(`{red-fg}{bold}ERROR: ${err.message}{/bold}{/red-fg}`);
        screen.render();
    }
}

async function startTuiDownload(url, response) {
    try {
        let filename = url.split('/').pop().split('?')[0] || 'downloaded_file';
        let destPath = path.join(process.cwd(), filename);

        let counter = 1;
        while (fs.existsSync(destPath)) {
            const ext = path.extname(filename);
            const name = path.basename(filename, ext);
            destPath = path.join(process.cwd(), `${name}_${counter}${ext}`);
            counter++;
        }

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        let loaded = 0;
        const reader = response.body?.getReader();
        const fileStream = fs.createWriteStream(destPath);

        downloadsBox.show();
        screen.render();

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                    if (!fileStream.write(value)) {
                        await new Promise(r => fileStream.once('drain', r));
                    }
                    loaded += value.length;

                    let pBar = '';
                    let pct = '';
                    if (total) {
                        const progress = Math.round((loaded / total) * 100);
                        const barLength = 40;
                        const filled = Math.round((progress / 100) * barLength);
                        const empty = barLength - filled;
                        pBar = `[${'='.repeat(filled)}${progress < 100 ? '>' : ''}${' '.repeat(Math.max(0, empty - (progress < 100 ? 1 : 0)))}]`;
                        pct = `${progress}%`;
                    } else {
                        const mb = (loaded / 1024 / 1024).toFixed(2);
                        pBar = `[... STR ]`;
                        pct = `${mb} MB`;
                    }

                    downloadsBox.setContent(`{center}{bold}--- ACTIVE DOWNLOAD ---{/bold}{/center}\n\nFile: ${path.basename(destPath)}\n${pBar} ${pct}`);
                    screen.render();
                }
            }
            fileStream.end();
            downloadsBox.setContent(`{center}{bold}--- DOWNLOAD COMPLETE ---{/bold}{/center}\n\nSaved to: ${destPath}\n\n(Press ESC to close popup)`);
            screen.render();
        }
    } catch (e) {
        downloadsBox.setContent(`{center}{bold}--- DOWNLOAD FAILED ---{/bold}{/center}\n\nError: ${e.message}\n\n(Press ESC to close popup)`);
        screen.render();
    }
}

// Handle submitting the URL
urlInput.on('submit', (value) => {
    if (value.trim()) {
        fetchAndRender(value.trim());
    } else {
        contentBox.focus();
    }
});

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'C-c'], function (ch, key) {
    if (downloadsBox.hidden === false && key.name === 'escape') {
        downloadsBox.hide();
        screen.render();
        urlInput.focus();
        return;
    }
    return process.exit(0);
});

// Switch focus between URL input and Content box on Tab
screen.key(['tab'], function (ch, key) {
    if (screen.focused === urlInput) {
        contentBox.focus();
    } else {
        urlInput.focus();
    }
    screen.render();
});

// Link navigation inside Content Box using arrows
contentBox.key(['up', 'down', 'left', 'right'], function (ch, key) {
    if (focusableItems.length === 0) {
        // Fall back to native scrolling if no links exist
        if (key.name === 'up' || key.name === 'left') contentBox.scroll(-2);
        if (key.name === 'down' || key.name === 'right') contentBox.scroll(2);
        screen.render();
        return;
    }

    if (key.name === 'up' || key.name === 'left') {
        focusedItemIndex = Math.max(0, focusedItemIndex - 1);
    } else if (key.name === 'down' || key.name === 'right') {
        focusedItemIndex = Math.min(focusableItems.length - 1, focusedItemIndex + 1);
    }

    renderParsedContent();

    // Try to scroll the highlighted line roughly into view
    const item = focusableItems[focusedItemIndex];
    if (item && item.lineApprox !== undefined) {
        // Approximate scroll percentage
        const perc = item.lineApprox / contentBox.getLines().length;
        const targetScroll = Math.floor(perc * contentBox.getScrollHeight());
        contentBox.scrollTo(targetScroll);
    }
    screen.render();
});

// Follow link when pressing Enter on Content Box
contentBox.key(['enter'], function (ch, key) {
    if (focusedItemIndex >= 0 && focusedItemIndex < focusableItems.length) {
        const item = focusableItems[focusedItemIndex];
        if (item.href) {
            fetchAndRender(item.href);
        }
    }
});

// Ensure mouse scroll works globally
screen.on('mouse', function (data) {
    if (data.action === 'wheelup') {
        contentBox.scroll(-2);
        screen.render();
    } else if (data.action === 'wheeldown') {
        contentBox.scroll(2);
        screen.render();
    }
});

const initialUrl = args.find(a => !a.startsWith('--'));
if (initialUrl) {
    urlInput.setValue(initialUrl);
    fetchAndRender(initialUrl);
} else {
    urlInput.focus();
}
screen.render();
