import { NextResponse } from 'next/server';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(request: Request) {
    const configPath = path.join(process.cwd(), 'config.json');
    let config: any = {};
    if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { }
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const readerMode = searchParams.get('readerMode') === 'true';
    const jsRender = searchParams.get('jsRender') === 'true' || config.jsRender;
    const debugMode = searchParams.get('debug') === 'true' || config.debugLogging;
    const captchaMode = searchParams.get('captcha') || config.captchaMode;
    const reportMode = searchParams.get('report') === 'true' || config.generateReports;

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
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
            let cookies = 'cookieyes-consent=consent:yes; CONSENT=YES+cb; CookieConsent={stamp:\'%2B\',necessary:true,preferences:true,statistics:true,marketing:true,method:\'explicit\',ver:1,utc:1610000000000}; accept_cookies=true; cookie_notice_accepted=true;';
            if (u.includes('golem.de')) cookies += ' golem_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
            if (u.includes('spiegel.de')) cookies += ' spiegel_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
            if (u.includes('zeit.de')) cookies += ' zeit_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
            return cookies;
        }

        function isCookieWall(html: string) {
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

        function getPuppeteer(): any {
            let p: any;
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

        function isSpaShell(html: string) {
            // Detect if the page is a JS-only SPA shell (body nearly empty, skeleton loaders present, no real content)
            const lower = html.toLowerCase();
            // Quick win: has skeleton loaders but NO form, input, article, or meaningful paragraph text
            const hasSkeletonLoader = lower.includes('skeleton') || lower.includes('loader-wrapper') || lower.includes('data-loader');
            const hasRealContent = lower.includes('<input') || lower.includes('<form') || lower.includes('<article') || lower.includes('<p>') || lower.includes('<p ');
            if (hasSkeletonLoader && !hasRealContent) return true;
            // Generic check: body has very little text content (< 200 visible chars)
            const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            if (bodyMatch) {
                const bodyText = bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (bodyText.length < 200) return true;
            }
            return false;
        }

        let html = '';
        let contentType = '';

        if (jsRender) {
            diagnosticReport.otherIssues.push('[JS_RENDER] Using forced Puppeteer engine via API.');
            try {
                const puppeteer = getPuppeteer();
                const pBrowser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                const pPage = await pBrowser.newPage();
                await pPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await pPage.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise((r) => setTimeout(r, 4000));

                // Aggressively attempt to click "Accept Cookies" banners
                await pPage.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, a, div')).find(el => {
                        const t = (el.textContent || '').toLowerCase();
                        return (t.includes('accept') || t.includes('akzeptieren') || t.includes('agree') || t.includes('zustimmen') || t.includes('allow all')) &&
                            (t.includes('cookie') || el.className.toLowerCase().includes('cookie') || el.id.toLowerCase().includes('cookie'));
                    });
                    if (btn) (btn as HTMLElement).click();

                    // Hard remove common banner containers
                    document.querySelectorAll('div, section').forEach(el => {
                        const id = (el.id || '').toLowerCase();
                        const cls = (el.className || '').toLowerCase();
                        if (id.includes('cookie') || cls.includes('cookie') || id.includes('consent') || cls.includes('consent') || id.includes('onetrust') || cls.includes('onetrust') || id.includes('sp_message')) {
                            el.remove();
                        }
                    });
                });
                await new Promise((r) => setTimeout(r, 1500));

                html = await pPage.content();
                await pBrowser.close();
            } catch (e: any) {
                return NextResponse.json({ error: `Puppeteer failed to boot JS render: ${e.message}` }, { status: 500 });
            }
        } else {
            let response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cookie': getCookiesForUrl(targetUrl)
                }
            });

            if (!response.ok) {
                return NextResponse.json({ error: `Failed to fetch URL: ${response.status} ${response.statusText}` }, { status: response.status });
            }

            contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('application/xml')) {
                return await handleFileDownload(targetUrl, response);
            }

            html = await response.text();
        }

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

        if (needsCaptcha(html, response.status)) {
            diagnosticReport.captchaSolverUsed = captchaMode || 'none';
            if (captchaMode === 'browser') {
                console.error(`[CAPTCHA] Opening ${targetUrl} in system browser...`);
                const open = require('open');
                await open(targetUrl);

                // Wait 15 seconds for user to solve
                await new Promise(r => setTimeout(r, 15000));

                console.error('[CAPTCHA] Retrying fetch in Next.js backend...');
                response = await fetch(targetUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Cookie': getCookiesForUrl(targetUrl)
                    }
                });
                html = await response.text();
            } else if (captchaMode === 'stealth') {
                console.error(`[CAPTCHA] Booting Puppeteer stealth...`);
                try {
                    const puppeteer = getPuppeteer();
                    const browser = await puppeteer.launch({ headless: 'new' });
                    const page = await browser.newPage();
                    await page.goto(targetUrl, { waitUntil: 'networkidle2' });
                    await new Promise(r => setTimeout(r, 6000));
                    html = await page.content();
                    await browser.close();
                } catch (e: any) {
                    console.error('[CAPTCHA ERROR] Puppeteer not installed. Run: npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth');
                }
            } else if (captchaMode === 'api') {
                console.error('[CAPTCHA ERROR] 2Captcha API pending implementation...');
            } else {
                console.error(`[CAPTCHA DETECTED] No solver specified in Next.js request param!`);
            }
        }

        // Auto SPA detection: if the page body is a JS-only skeleton, use Puppeteer to render it
        if (isSpaShell(html)) {
            diagnosticReport.otherIssues.push('[SPA_SHELL] JavaScript-only SPA detected. Attempting Puppeteer JS render...');
            try {
                const puppeteer = getPuppeteer();
                const pBrowser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                const pPage = await pBrowser.newPage();
                await pPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await pPage.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                // Extra wait for JS frameworks to finish rendering
                await new Promise(r => setTimeout(r, 4000));

                // Aggressively attempt to click "Accept Cookies" banners
                await pPage.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, a, div')).find(el => {
                        const t = (el.textContent || '').toLowerCase();
                        return (t.includes('accept') || t.includes('akzeptieren') || t.includes('agree') || t.includes('zustimmen') || t.includes('allow all')) &&
                            (t.includes('cookie') || el.className.toLowerCase().includes('cookie') || el.id.toLowerCase().includes('cookie'));
                    }) as HTMLElement;
                    if (btn) btn.click();
                });
                await new Promise(r => setTimeout(r, 1500)); // wait for banner animation to finish

                html = await pPage.content();
                await pBrowser.close();
                diagnosticReport.otherIssues.push('[SPA_SHELL] Puppeteer JS render completed successfully.');
            } catch (e: any) {
                diagnosticReport.otherIssues.push(`[SPA_SHELL] Puppeteer not available: ${e.message}. Install with: npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth`);
            }
        }

        // Attempt Fallback if blocked
        if (isCookieWall(html)) {
            diagnosticReport.cookiewallBypassed = true;
            // Fallback 1: Googlebot Spoofing
            response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Cookie': getCookiesForUrl(targetUrl)
                }
            });
            html = await response.text();

            // Fallback 2: Archive.org Web Cache
            if (isCookieWall(html)) {
                targetUrl = `https://web.archive.org/web/2/${targetUrl}`;
                response = await fetch(targetUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                });
                html = await response.text();
            }
        }

        const virtualConsole = new (require('jsdom').VirtualConsole)();

        function logError(type: string, args: any[]) {
            if (debugMode) {
                try {
                    const errPath = path.join(process.cwd(), 'errors.txt');
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
            const reader = new Readability(document);
            const article = reader.parse();

            if (article && article.content) {
                // DOMPurify needs a window object.
                const cleanDOMPurify = DOMPurify(window as any);
                const safeHtml = cleanDOMPurify.sanitize(article.content);

                const cleanDoc = new JSDOM(`<html><body><h1>${article.title || ''}</h1>${safeHtml}</body></html>`, { url, virtualConsole });
                workingDocument = cleanDoc.window.document;
            }
        }

        // Now walk the DOM (either original or cleaned)
        const result: any[] = [];
        let idCounter = 0;

        function isHidden(el: any) {
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
            // Catch errors if getComputedStyle fails for any reason
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
                    const csvPath = path.join(process.cwd(), 'promt_injections.csv');
                    const logLine = `"${url}","${cleaned.replace(/"/g, '""')}"\n`;
                    if (!fs.existsSync(csvPath)) fs.writeFileSync(csvPath, 'URL,Injection_Attempt\n');
                    fs.appendFileSync(csvPath, logLine);
                } catch (e) { }
                return ''; // Safely filter it out
            }
            return cleaned;
        }

        function walkDOM(node: any) {
            if (node.nodeType === workingDocument.defaultView?.Node.ELEMENT_NODE || node.nodeType === 1) { // 1 is ELEMENT_NODE
                const el = node;
                const tagName = el.tagName.toLowerCase();

                // Skip hidden elements, script, style, noscript
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

                if (tagName === 'form') {
                    const formObj: any = {
                        type: 'form',
                        id: `form-${idCounter++}`,
                        action: el.action || '',
                        method: el.method || 'get',
                        fields: []
                    };

                    const inputs = el.querySelectorAll('input, select, textarea');
                    inputs.forEach((input: any) => {
                        const inputTagName = input.tagName.toLowerCase();
                        if (inputTagName === 'input' && ['submit', 'button', 'image', 'hidden'].includes(input.type)) {
                            return;
                        }

                        let fieldObj: any = {
                            name: input.name || input.id || `field-${idCounter++}`,
                            type: inputTagName,
                            inputType: inputTagName === 'input' ? input.type : undefined,
                            placeholder: input.placeholder || '',
                            value: input.value || ''
                        };

                        if (inputTagName === 'select') {
                            fieldObj.options = Array.from(input.options).map((opt: any) => ({
                                value: opt.value,
                                text: opt.text
                            }));
                        }

                        formObj.fields.push(fieldObj);
                    });

                    if (formObj.fields.length > 0) {
                        result.push(formObj);
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
            } else if (node.nodeType === workingDocument.defaultView?.Node.TEXT_NODE || node.nodeType === 3) { // 3 is TEXT_NODE
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

        if (reportMode) {
            try {
                const urlObj = new URL(targetUrl);
                const domain = urlObj.hostname.replace(/[^a-z0-9]/gi, '_');
                const timestamp = new Date().getTime();
                const reportFileName = `report-${domain}-${timestamp}.json`;
                const reportPath = path.join(process.cwd(), 'Reports', reportFileName);
                fs.writeFileSync(reportPath, JSON.stringify(diagnosticReport, null, 2));
            } catch (e: any) {
                diagnosticReport.otherIssues.push(`[REPORT ERROR] Failed to save report: ${e.message}`);
            }
        }

        return NextResponse.json({ success: true, data: result, report: (reportMode ? diagnosticReport : undefined) });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
