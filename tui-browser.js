#!/usr/bin/env node

const blessed = require('blessed');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');
const fs = require('fs');
const path = require('path');

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
    content: ' [ESC/q/C-c] Quit | [Enter] Focus URL | [Arrows] Scroll '
});

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

async function fetchAndRender(url) {
    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
        targetUrl = 'https://' + targetUrl;
    }

    contentBox.setContent(`{center}LOADING ${targetUrl}...{/center}`);
    screen.render();

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('application/xml')) {
            return await startTuiDownload(targetUrl, response);
        }

        const html = await response.text();
        const doc = new JSDOM(html, { url: targetUrl });
        const window = doc.window;
        const document = window.document;

        // Apply Reader Mode logic always for TUI
        const reader = new Readability(document);
        const article = reader.parse();

        let workingDocument = document;
        if (article && article.content) {
            const cleanDOMPurify = DOMPurify(window);
            const safeHtml = cleanDOMPurify.sanitize(article.content);
            const cleanDoc = new JSDOM(`<html><body><h1>${article.title || ''}</h1>${safeHtml}</body></html>`, { url: targetUrl });
            workingDocument = cleanDoc.window.document;
        }

        const result = [];
        let idCounter = 0;

        function isHidden(el) {
            if (!workingDocument.defaultView) return false;
            try {
                const style = workingDocument.defaultView.getComputedStyle(el);
                return (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0');
            } catch (e) {
                return false;
            }
        }

        function cleanText(text) {
            return text ? text.replace(/\s+/g, ' ').trim() : '';
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

        // Convert the nodes to blessed colored text lines
        let renderLines = [];
        for (const item of result) {
            if (item.type === 'header') {
                renderLines.push(`\n{yellow-fg}{bold}${'#'.repeat(item.level)} ${item.text}{/bold}{/yellow-fg}\n`);
            } else if (item.type === 'link') {
                renderLines.push(`{cyan-fg}[ ${item.text} ]{/cyan-fg} -> {gray-fg}${item.href}{/gray-fg}`);
            } else if (item.type === 'download') {
                renderLines.push(`\n{yellow-bg}{black-fg}{bold} [V] DOWNLOAD: ${item.text} {/bold}{/black-fg}{/yellow-bg}\n    -> {cyan-fg}${item.href}{/cyan-fg}\n`);
            } else if (item.type === 'button') {
                renderLines.push(`{white-bg}{black-fg} < ${item.text} > {/black-fg}{/white-bg}`);
            } else if (item.type === 'image') {
                renderLines.push(`\n{green-fg}[ IMG: ${item.alt || 'Unknown'} - ${item.src} ]{/green-fg}\n`);
            } else if (item.type === 'text') {
                renderLines.push(`${item.text}`);
            }
        }

        if (renderLines.length === 0) {
            contentBox.setContent(`{center}NO CONTENT FOUND FOR THIS PAGE.{/center}`);
        } else {
            contentBox.setContent(renderLines.join('\n'));
        }

        contentBox.scrollTo(0);
        screen.render();

    } catch (err) {
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
                    fileStream.write(value);
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
screen.key(['escape', 'q', 'C-c'], function (ch, key) {
    if (downloadsBox.hidden === false && key.name === 'escape') {
        downloadsBox.hide();
        screen.render();
        urlInput.focus();
        return;
    }
    return process.exit(0);
});

// Focus url on enter
screen.key(['enter'], function (ch, key) {
    if (screen.focused !== urlInput) {
        urlInput.focus();
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

urlInput.focus();
screen.render();
