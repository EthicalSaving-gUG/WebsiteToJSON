#!/usr/bin/env node

const fs = require('fs');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');

async function main() {
    const configPath = require('path').join(__dirname, 'config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { }
    }

    const args = process.argv.slice(2);
    let url = '';
    let readerMode = false;
    let debugMode = config.debugLogging || false;
    let captchaMode = config.captchaMode || null;
    let reportMode = config.generateReports || false;
    let jsRender = config.jsRender || false;

    function getPuppeteer() {
        let p;
        try {
            require.resolve('puppeteer-extra');
        } catch (e) {
            console.error('[DEPENDENCY] Puppeteer not found. Downloading dynamically... This may take a minute.');
            require('child_process').execSync('npm install --no-save puppeteer puppeteer-extra puppeteer-extra-plugin-stealth', { stdio: 'inherit', cwd: process.cwd() });
        }
        p = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        p.use(StealthPlugin());
        return p;
    }

    let diagnosticReport = {
        url: '',
        timestamp: new Date().toISOString(),
        cookiewallBypassed: false,
        captchaIntervened: false,
        captchaSolverUsed: null,
        promptInjectionsStripped: 0,
        adsBlocked: 0,
        obstructiveCssNodes: 0,
        otherIssues: []
    };

    for (const arg of args) {
        if (arg === '--reader') {
            readerMode = true;
        } else if (arg === '--report') {
            reportMode = true;
        } else if (arg === '--js') {
            jsRender = true;
        } else if (arg === '--debug') {
            debugMode = true;
        } else if (arg.startsWith('--captcha=')) {
            captchaMode = arg.split('=')[1];
        } else if (arg.startsWith('http')) {
            url = arg;
        } else {
            console.log(`Unknown argument: ${arg}`);
            console.log('Usage: node browser-cli.js <url> [--reader] [--js] [--debug] [--report] [--captcha=browser|stealth|api]');
            process.exit(1);
        }
    }

    if (!url) {
        console.error('Error: Please provide a URL.');
        console.log('Usage: node browser-cli.js <url> [--reader]');
        process.exit(1);
    }

    try {
        let targetUrl = url;

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

        console.error(`Fetching ${targetUrl}...`);
        diagnosticReport.url = targetUrl;
        let html = '';
        let responseOpt = null;

        if (jsRender) {
            console.error(`[JS_RENDER] Forced JS rendering mode active. Booting Puppeteer...`);
            diagnosticReport.otherIssues.push('[JS_RENDER] Using forced Puppeteer engine.');
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
                console.error('[JS_RENDER] Puppeteer extraction complete.');
            } catch (e) {
                console.error('[JS_RENDER ERROR] Puppeteer not installed: ' + e.message);
                process.exit(1);
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
                throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
            }

            html = await response.text();

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

            if (needsCaptcha(html, response.status)) {
                diagnosticReport.captchaSolverUsed = captchaMode || 'none';
                if (captchaMode === 'browser') {
                    console.error(`[CAPTCHA] Bot protection detected. Opening ${targetUrl} in system browser...`);
                    const open = require('open');
                    await open(targetUrl);
                    console.error('[CAPTCHA] Please solve the CAPTCHA in your web browser. Press ENTER when done...');
                    await new Promise(resolve => {
                        const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
                        readline.question('', () => {
                            readline.close();
                            resolve();
                        });
                    });
                    console.error('[CAPTCHA] Retrying fetch...');
                    response = await fetch(targetUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Cookie': getCookiesForUrl(targetUrl)
                        }
                    });
                    html = await response.text();
                } else if (captchaMode === 'stealth') {
                    console.error(`[CAPTCHA] Bot protection detected. Booting Puppeteer stealth browser...`);
                    try {
                        const puppeteer = getPuppeteer();
                        const browser = await puppeteer.launch({ headless: 'new' });
                        const page = await browser.newPage();
                        await page.goto(targetUrl, { waitUntil: 'networkidle2' });
                        await new Promise(r => setTimeout(r, 6000));
                        html = await page.content();
                        await browser.close();
                    } catch (e) {
                        if (e.code === 'MODULE_NOT_FOUND') {
                            console.error('[CAPTCHA ERROR] Puppeteer is not installed. Please run: npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth');
                        } else {
                            console.error('[CAPTCHA ERROR] Stealth bypass failed:', e.message);
                        }
                    }
                } else if (captchaMode === 'api') {
                    console.error(`[CAPTCHA] Bot protection detected. Sending to 2Captcha API...`);
                    const apiKey = process.env.TWOCAPTCHA_API_KEY;
                    if (!apiKey) {
                        console.error('[CAPTCHA ERROR] TWOCAPTCHA_API_KEY environment variable is missing.');
                    } else {
                        console.error('[CAPTCHA] 2Captcha Integration pending implementation of sitekey extraction.');
                    }
                } else {
                }
            } else {
                console.error(`[CAPTCHA] Bot protection detected, but no solver was specified! Pass --captcha=browser, --captcha=stealth, or --captcha=api.`);
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
            console.error('[SPA] JavaScript-only SPA detected. Booting Puppeteer to render JS...');
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
                console.error('[SPA] Puppeteer JS render complete.');
            } catch (e) {
                console.error('[SPA] Puppeteer not installed. Run: npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth');
                diagnosticReport.otherIssues.push('[SPA_SHELL] Puppeteer unavailable: ' + e.message);
            }
        }

        // Attempt Fallback if blocked
        if (isCookieWall(html)) {
            diagnosticReport.cookiewallBypassed = true;
            console.error(`Cookie wall detected on ${targetUrl}. Attempting SEO bot bypass...`);
            response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Cookie': getCookiesForUrl(targetUrl)
                }
            });
            html = await response.text();

            if (isCookieWall(html)) {
                console.error(`Still blocked. Falling back to Archive.org Cache...`);
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
                    const errPath = require('path').join(process.cwd(), 'errors.txt');
                    const msg = `[${new Date().toISOString()}] [${type}] ${args.map(a => String(a?.message || a)).join(' ')}\n`;
                    require('fs').appendFileSync(errPath, msg);
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

        if (readerMode) {
            console.error('Applying Reader Mode parsing...');
            const reader = new Readability(document);
            const article = reader.parse();

            if (article && article.content) {
                const cleanDOMPurify = DOMPurify(window);
                const safeHtml = cleanDOMPurify.sanitize(article.content);

                const cleanDoc = new JSDOM(`<html><body><h1>${article.title || ''}</h1>${safeHtml}</body></html>`, { url, virtualConsole });
                workingDocument = cleanDoc.window.document;
            } else {
                console.error('Reader Mode failed to extract content. Falling back to full page.');
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
            // 1. Check for explicit <label for="id">
            if (el.id) {
                const explicitLabel = workingDocument.querySelector(`label[for="${el.id}"]`);
                if (explicitLabel) {
                    labelText = cleanText(explicitLabel.textContent);
                    if (labelText) return labelText;
                }
            }
            // 2. Check if wrapped in <label>
            let parent = el.parentElement;
            while (parent && parent.tagName !== 'BODY' && parent.tagName !== 'FORM') {
                if (parent.tagName.toLowerCase() === 'label') {
                    // Extract text excluding the input's own text/value
                    const clone = parent.cloneNode(true);
                    const inputs = clone.querySelectorAll('input, select, textarea');
                    inputs.forEach(i => i.remove());
                    labelText = cleanText(clone.textContent);
                    if (labelText) return labelText;
                }
                parent = parent.parentElement;
            }
            // 3. Check for aria-label
            if (el.getAttribute('aria-label')) {
                return cleanText(el.getAttribute('aria-label'));
            }
            // 4. Fallback to placeholder if nothing else
            return el.placeholder ? '(Placeholder: ' + cleanText(el.placeholder) + ')' : '';
        }

        function cleanText(text) {
            const cleaned = text ? text.replace(/\s+/g, ' ').trim() : '';
            if (!cleaned) return '';

            const promptRegex = /(ignore (all |previous )?instructions|disregard (all |previous )?instructions|forget (all |previous )?(instructions|prompts)|system prompt|secret instructions|print your instructions|summarize all of your secret instructions|you are a(n)? |act as a(n)? |developer mode|bypass restrictions|do anything now|DAN)/i;
            if (promptRegex.test(cleaned)) {
                diagnosticReport.promptInjectionsStripped++;
                try {
                    const csvPath = require('path').join(process.cwd(), 'promt_injections.csv');
                    const logLine = `"${targetUrl}","${cleaned.replace(/"/g, '""')}"\n`;
                    const fs = require('fs');
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
                    const formObj = {
                        type: 'form',
                        id: `form-${idCounter++}`,
                        action: el.action || '',
                        method: el.method || 'get',
                        fields: []
                    };

                    const inputs = el.querySelectorAll('input, select, textarea');
                    inputs.forEach((input) => {
                        const inputTagName = input.tagName.toLowerCase();
                        if (inputTagName === 'input' && ['submit', 'button', 'image', 'hidden'].includes(input.type)) {
                            return;
                        }

                        let fieldObj = {
                            name: input.name || input.id || `field-${idCounter++}`,
                            type: inputTagName,
                            inputType: inputTagName === 'input' ? input.type : undefined,
                            placeholder: input.placeholder || '',
                            value: input.value || '',
                            label: resolveLabelForInput(input)
                        };

                        if (inputTagName === 'select') {
                            fieldObj.options = Array.from(input.options).map((opt) => ({
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

        if (reportMode) {
            try {
                const urlObj = new URL(targetUrl);
                const domain = urlObj.hostname.replace(/[^a-z0-9]/gi, '_');
                const timestamp = new Date().getTime();
                const reportFileName = `report-${domain}-${timestamp}.json`;
                const reportPath = require('path').join(process.cwd(), 'Reports', reportFileName);
                require('fs').writeFileSync(reportPath, JSON.stringify(diagnosticReport, null, 2));
                console.error(`[REPORT] Extraction diagnostic saved to ${reportPath}`);
            } catch (e) {
                console.error(`[REPORT ERROR] Failed to save report: ${e.message}`);
                diagnosticReport.otherIssues.push(`[REPORT ERROR] Failed to save report: ${e.message}`);
            }
        }

        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Runtime Error:', error.message);
        process.exit(1);
    }
}

main();
