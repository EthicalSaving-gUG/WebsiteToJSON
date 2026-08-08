/**
 * Smoke tests for the core value proposition of DOS Browser:
 * turning noisy HTML into clean, semantically meaningful content.
 *
 * These tests are dependency-light and network-free so they can run
 * deterministically in CI (`npm test`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const SAMPLE_HTML = `<!doctype html>
<html>
  <head><title>Breaking News</title></head>
  <body>
    <nav><a href="/">Home</a><a href="/about">About</a></nav>
    <script>window.__ADS__ = true;</script>
    <div class="ad" id="taboola-below-article">Sponsored junk</div>
    <article>
      <h1>The Headline</h1>
      <p>This is the first paragraph of the real article body that a
      reader actually cares about, long enough for Readability to treat
      it as primary content rather than boilerplate.</p>
      <p>A second paragraph with more substantial sentences so the
      extractor is confident this block is the main article and not a
      navigation region or advertisement wrapper.</p>
    </article>
    <footer>Copyright 2026</footer>
  </body>
</html>`;

test('Readability extracts the core article text', () => {
  const dom = new JSDOM(SAMPLE_HTML, { url: 'https://example.com/news' });
  const article = new Readability(dom.window.document).parse();

  assert.ok(article, 'Readability returned a parsed article');
  assert.match(article.textContent, /first paragraph of the real article body/);
  assert.match(article.textContent, /second paragraph/);
});

test('reader extraction drops nav, script, and ad boilerplate', () => {
  const dom = new JSDOM(SAMPLE_HTML, { url: 'https://example.com/news' });
  const article = new Readability(dom.window.document).parse();

  assert.doesNotMatch(article.textContent, /Sponsored junk/, 'ad content stripped');
  assert.doesNotMatch(article.textContent, /window\.__ADS__/, 'inline script stripped');
});

test('semantic DOM query surfaces headings and links', () => {
  const dom = new JSDOM(SAMPLE_HTML, { url: 'https://example.com/news' });
  const doc = dom.window.document;

  const heading = doc.querySelector('article h1');
  assert.equal(heading?.textContent, 'The Headline');

  const links = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.deepEqual(links, ['/', '/about']);
});
