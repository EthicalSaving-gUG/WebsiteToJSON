#!/usr/bin/env node

const fs = require('fs');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');

async function main() {
    const args = process.argv.slice(2);
    let url = '';
    let readerMode = false;
    let debugMode = false;

    for (const arg of args) {
        if (arg === '--reader') {
            readerMode = true;
        } else if (arg === '--debug') {
            debugMode = true;
        } else if (arg.startsWith('http')) {
            url = arg;
        } else {
            console.log(`Unknown argument: ${arg}`);
            console.log('Usage: node browser-cli.js <url> [--reader]');
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
            let cookies = 'CONSENT=YES+cb; CookieConsent={stamp:\'%2B\',necessary:true,preferences:true,statistics:true,marketing:true,method:\'explicit\',ver:1,utc:1610000000000}; accept_cookies=true; cookie_notice_accepted=true;';
            if (u.includes('golem.de')) cookies += ' golem_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
            if (u.includes('spiegel.de')) cookies += ' spiegel_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
            if (u.includes('zeit.de')) cookies += ' zeit_consent=true; iab_cmp_consent=true; euconsent-v2=true;';
            return cookies;
        }

        function isCookieWall(html) {
            const lower = html.toLowerCase();
            return lower.includes('id="sp_message_container"') ||
                lower.includes('id="onetrust-consent-sdk"') ||
                lower.includes('class="sp_message_container"') ||
                lower.includes('consent.cmp') ||
                lower.includes('id="gspmessage"') ||
                lower.includes('golem pur bestellen') ||
                (lower.includes('zustimmung') && lower.includes('datenschutz') && lower.includes('akzeptieren'));
        }

        console.error(`Fetching ${targetUrl}...`);
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

        // Attempt Fallback if blocked
        if (isCookieWall(html)) {
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
            const idStr = String(el.id || '').toLowerCase();
            const classStr = typeof el.className === 'string' ? el.className.toLowerCase() : '';
            if (idStr.includes('cookie') || classStr.includes('cookie') || idStr.includes('consent') || classStr.includes('consent') || idStr.includes('onetrust') || classStr.includes('onetrust')) {
                return true;
            }

            if (!workingDocument.defaultView) return false;
            try {
                const style = workingDocument.defaultView.getComputedStyle(el);
                return (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0');
            } catch (e) {
                return false;
            }
        }

        function cleanText(text) {
            const cleaned = text ? text.replace(/\s+/g, ' ').trim() : '';
            if (!cleaned) return '';

            const promptRegex = /(ignore (all |previous )?instructions|disregard (all |previous )?instructions|forget (all |previous )?(instructions|prompts)|system prompt|secret instructions|print your instructions|summarize all of your secret instructions|you are a(n)? |act as a(n)? |developer mode|bypass restrictions|do anything now|DAN)/i;
            if (promptRegex.test(cleaned)) {
                try {
                    const csvPath = require('path').join(process.cwd(), 'promt_injections.csv');
                    const logLine = `"${url}","${cleaned.replace(/"/g, '""')}"\n`;
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
                            value: input.value || ''
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

        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Runtime Error:', error.message);
        process.exit(1);
    }
}

main();
