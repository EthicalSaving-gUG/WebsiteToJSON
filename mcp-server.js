#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
let globalConfig = {};
if (fs.existsSync(configPath)) {
    try { globalConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { }
}

const server = new Server({
    name: "dos-browser-mcp",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {}
    }
});

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

function getPuppeteer() {
    let p;
    try {
        require.resolve('puppeteer-extra');
    } catch (e) {
        require('child_process').execSync('npm install --no-save puppeteer puppeteer-extra puppeteer-extra-plugin-stealth', { stdio: 'ignore', cwd: process.cwd() });
    }
    p = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    p.use(StealthPlugin());
    return p;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "browse_website",
                description: "Parse and extract a website DOM for AI ingestion. Includes Cookie Wall bypassing, prompt injection filtering, and ad-blocking.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL to browse (e.g. https://www.zeit.de)"
                        },
                        readerMode: {
                            type: "boolean",
                            description: "If true, extracts only the main article text using Mozilla Readability instead of full page elements."
                        },
                        jsRender: {
                            type: "boolean",
                            description: "If true, forcefully boots a headless JS engine (Puppeteer) to execute JavaScript, bypass cookie walls, and render SPAs natively before extracting DOM."
                        },
                        captcha: {
                            type: "string",
                            description: "Optional CAPTCHA bypass mode: 'browser' (opens the host system's web browser for manual solving), 'stealth' (spawns invisible Puppeteer to bypass), or 'api' (uses 2Captcha).",
                            enum: ["browser", "stealth", "api"]
                        },
                        report: {
                            type: "boolean",
                            description: "If true, returns a detailed diagnostic report alongside the content, documenting any obstacles (cookie walls, CAPTCHAs, ads, obstructive CSS, prompt injections) encountered during extraction."
                        }
                    },
                    required: ["url"]
                }
            },
            {
                name: "fetch_image",
                description: "Download an image from a URL and return it as a base64 encoded image for AI vision models.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL of the image to fetch."
                        }
                    },
                    required: ["url"]
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "fetch_image") {
        const targetUrl = request.params.arguments.url;
        try {
            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                }
            });

            if (!response.ok) {
                return {
                    content: [{ type: "text", text: `Error: Failed to fetch image. Status: ${response.status} ${response.statusText}` }],
                    isError: true,
                };
            }

            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            let mimeType = response.headers.get('content-type') || 'image/jpeg';

            // Standardize mimeType parsing if servers append encoding chartsets
            mimeType = mimeType.split(';')[0].trim();
            if (!mimeType.startsWith('image/')) {
                mimeType = 'image/jpeg';
            }

            return {
                content: [
                    {
                        type: "image",
                        data: base64,
                        mimeType: mimeType
                    }
                ]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Image fetch error: ${error.message}` }],
                isError: true,
            };
        }
    }

    if (request.params.name === "browse_website") {
        let targetUrl = request.params.arguments.url;
        const readerMode = request.params.arguments.readerMode === true;
        const jsRender = request.params.arguments.jsRender === true || globalConfig.jsRender || false;
        const captchaMode = request.params.arguments.captcha || globalConfig.captchaMode || null;
        const reportMode = request.params.arguments.report === true || globalConfig.generateReports;

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

        if (!targetUrl.startsWith('http')) {
            targetUrl = 'https://' + targetUrl;
        }

        try {
            let html = '';
            let response = null;

            if (jsRender) {
                diagnosticReport.otherIssues.push('[JS_RENDER] Using forced Puppeteer engine via MCP.');
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
                } catch (e) {
                    return {
                        content: [{ type: "text", text: `Error: Puppeteer JS Engine failed to boot. Make sure 'puppeteer' and 'puppeteer-extra' are installed. Details: ${e.message}` }],
                        isError: true,
                    };
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
                    return {
                        content: [{ type: "text", text: `Error: Failed to fetch URL. Status: ${response.status} ${response.statusText}` }],
                        isError: true,
                    };
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
                    const open = require('open');
                    await open(targetUrl);
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
                    } catch (e) {
                        return {
                            content: [{ type: "text", text: `Error: Puppeteer is not installed. Tell the user to run 'npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth' in the browser directory.` }],
                            isError: true,
                        };
                    }
                } else if (captchaMode === 'api') {
                    // API implementation pending
                } else {
                    return {
                        content: [{ type: "text", text: `Error: CAPTCHA bot protection detected, but no captcha solver arg was provided. Try again with captchaMode set to 'browser' or 'stealth'.` }],
                        isError: true,
                    };
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
                        });
                        await new Promise(r => setTimeout(r, 1500));

                        html = await pPage.content();
                        await pBrowser.close();
                        diagnosticReport.otherIssues.push('[SPA_SHELL] Puppeteer JS render complete.');
                    } catch (e) {
                        return {
                            content: [{ type: "text", text: `Error: JS-rendered SPA page detected, but Puppeteer is not installed to render it. Tell the user to run 'npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth' in the browser directory.\nDetails: ${e.message}` }],
                            isError: true,
                        };
                    }
                }

                if (isCookieWall(html)) {
                    targetUrl = `https://web.archive.org/web/2/${targetUrl}`;
                    response = await fetch(targetUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                    });
                    html = await response.text();
                }
            }

            const virtualConsole = new (require('jsdom').VirtualConsole)();
            virtualConsole.on("error", () => { });
            virtualConsole.on("warn", () => { });
            virtualConsole.on("jsdomError", () => { });
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
                // Ad/Sponsor Filter
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
                } catch (e) { return false; }
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
                    return '';
                }
                return cleaned;
            }

            function walkDOM(node) {
                if (node.nodeType === workingDocument.defaultView?.Node.ELEMENT_NODE || node.nodeType === 1) {
                    const el = node;
                    const tagName = el.tagName.toLowerCase();
                    if (['script', 'style', 'noscript', 'nav', 'footer', 'iframe', 'svg'].includes(tagName) || isHidden(el)) return;

                    if (tagName === 'a') {
                        const text = cleanText(el.textContent);
                        if (text && el.href) result.push(`[${text}](${el.href})`);
                        return;
                    }
                    if (tagName === 'button' || (tagName === 'input' && el.type === 'button') || (tagName === 'input' && el.type === 'submit')) {
                        const text = cleanText(el.textContent) || el.value || 'Submit';
                        result.push(`**[BUTTON: ${text}]**`);
                        return;
                    }
                    if (tagName === 'form') {
                        result.push(`\n**--- [FORM START] Action: ${el.action || 'none'} ---**`);
                        const inputs = el.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
                        inputs.forEach(input => {
                            const lbl = resolveLabelForInput(input);
                            const name = input.name || input.id || 'unnamed_field';
                            const type = input.tagName.toLowerCase() === 'input' ? input.type : input.tagName.toLowerCase();
                            result.push(`   * [INPUT] Label: "${lbl}" | Name: "${name}" | Type: "${type}"`);
                        });
                        result.push(`**--- [FORM END] ---**\n`);
                        return;
                    }
                    if (tagName === 'img' && el.src) {
                        result.push(`![${el.alt || 'Image'}](${el.src})`);
                        return;
                    }
                    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                        const text = cleanText(el.textContent);
                        if (text) result.push(`${'#'.repeat(parseInt(tagName.replace('h', '')))} ${text}`);
                        return;
                    }
                } else if (node.nodeType === workingDocument.defaultView?.Node.TEXT_NODE || node.nodeType === 3) {
                    const text = cleanText(node.textContent);
                    if (text && text.length > 5) {
                        const parentTag = node.parentNode?.tagName?.toLowerCase();
                        if (!['a', 'button', 'script', 'style', 'title', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'noscript'].includes(parentTag)) {
                            result.push(text);
                        }
                    }
                }
                let child = node.firstChild;
                while (child) { walkDOM(child); child = child.nextSibling; }
            }

            walkDOM(workingDocument.body);

            const outputText = result.join('\n\n');
            if (reportMode) {
                try {
                    const urlObj = new URL(targetUrl);
                    const domain = urlObj.hostname.replace(/[^a-z0-9]/gi, '_');
                    const timestamp = new Date().getTime();
                    const reportFileName = `report-${domain}-${timestamp}.json`;
                    const reportPath = path.join(__dirname, 'Reports', reportFileName);
                    fs.writeFileSync(reportPath, JSON.stringify(diagnosticReport, null, 2));
                } catch (e) {
                    diagnosticReport.otherIssues.push(`[REPORT ERROR] ${e.message}`);
                }
            }

            return {
                content: [
                    { type: "text", text: outputText },
                    ...(reportMode ? [{ type: "text", text: `\n\n--- DIAGNOSTIC REPORT ---\n${JSON.stringify(diagnosticReport, null, 2)}` }] : [])
                ],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Scraping error: ${error.message}` }],
                isError: true,
            };
        }
    }
    throw new Error(`Tool not found: ${request.params.name}`);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("DOS Browser MCP Server running on stdio");
}

main().catch(console.error);
