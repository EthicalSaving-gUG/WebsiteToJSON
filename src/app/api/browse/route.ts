import { NextResponse } from 'next/server';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const readerMode = searchParams.get('readerMode') === 'true';

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
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
            const reader = new Readability(document);
            const article = reader.parse();

            if (article && article.content) {
                // DOMPurify needs a window object.
                const cleanDOMPurify = DOMPurify(window as any);
                const safeHtml = cleanDOMPurify.sanitize(article.content);

                const cleanDoc = new JSDOM(`<html><body><h1>${article.title || ''}</h1>${safeHtml}</body></html>`, { url });
                workingDocument = cleanDoc.window.document;
            }
        }

        // Now walk the DOM (either original or cleaned)
        const result: any[] = [];
        let idCounter = 0;

        function isHidden(el: any) {
            if (!workingDocument.defaultView) return false;
            // Catch errors if getComputedStyle fails for any reason
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

        return NextResponse.json({ success: true, data: result });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
