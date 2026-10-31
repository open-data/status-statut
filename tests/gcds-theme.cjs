// Run with Node >=20 and Playwright available through NODE_PATH.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.STATUS_URL || 'http://127.0.0.1:3000/status-statut/';
const screenshots = process.env.SCREENSHOT_DIR || 'screenshots';
(async () => {
  fs.mkdirSync(screenshots, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = new URL(base); url.searchParams.set('lang', 'en'); url.searchParams.set('test', 'preserved');
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.locator('.gcds-language-link').waitFor();
  await page.addScriptTag({ url: new URL('gcds-i18n.js', base).href });
  assert.equal(await page.locator('.gcds-language-link').count(), 1, 'A repeated script load creates one language control');
  assert.equal(await page.locator('[data-gcds-brand-header]').count(), 1);
  await page.locator('nav[data-gcds-breadcrumbs]').waitFor();
  assert.equal(await page.locator('nav a').count(), 1);
  assert.equal(await page.locator('nav').getAttribute('aria-label'), 'Breadcrumb');
  const navigationPosition = await page.evaluate(() => ({
    headerBottom: document.querySelector('[data-gcds-brand-header]').getBoundingClientRect().bottom,
    breadcrumbTop: document.querySelector('nav[data-gcds-breadcrumbs]').getBoundingClientRect().top
  }));
  assert.ok(navigationPosition.breadcrumbTop >= navigationPosition.headerBottom);
  await page.locator('.gcds-repository-link a').waitFor();
  await page.waitForFunction(() => { const icon = document.querySelector('.gcds-repository-icon'); return icon?.complete && icon.naturalWidth > 0; });
  assert.equal(await page.locator('.gcds-repository-link a').evaluate(el => el.firstElementChild?.tagName), 'IMG');
  assert.equal(await page.locator('.gcds-repository-icon').getAttribute('alt'), '');
  assert.equal(await page.locator('.gcds-repository-link a').evaluate(el => getComputedStyle(el).fontWeight), '700');
  const repositoryUrl = await page.evaluate(async () => (await (await fetch(new URL('gcds-i18n.json', document.baseURI))).json()).repositoryUrl);
  assert.equal(await page.locator('.gcds-repository-link a').getAttribute('href'), repositoryUrl);
  assert.equal(await page.locator('nav a[href*="github.com"]').count(), 0);
  assert.equal(await page.locator('link[rel="icon"]').count(), 1);
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('type'), 'image/x-icon');
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'), 'https://wet-boew.github.io/themes-dist/GCWeb/GCWeb/assets/favicon.ico');
  assert.ok(await page.locator('.gcds-repository-link').evaluate(el => el.getBoundingClientRect().top >= el.parentElement.querySelector('p').getBoundingClientRect().bottom));
  assert.equal(await page.locator('nav a').evaluateAll(links => links.filter(link => {
    const url = new URL(link.href); return (url.origin === location.origin || ['127.0.0.1', 'localhost'].includes(location.hostname)) && url.pathname.replace(/\/$/, '') === new URL(document.baseURI).pathname.replace(/\/$/, '');
  }).length), 1, 'The header has exactly one status-home link');
  await page.locator('.gcds-brand-footer img').waitFor();
  assert.equal(await page.locator('.gcds-brand-footer').count(), 1);
  await page.waitForFunction(() => [...document.querySelectorAll('.gcds-signature img, .gcds-brand-footer img')].every(img => img.complete && img.naturalWidth > 0));
  assert.equal(await page.locator('.gcds-signature img').getAttribute('alt'), 'Government of Canada');
  assert.equal(await page.locator('.gcds-history-back').count(), 0);
  await page.waitForFunction(() => document.querySelectorAll('.live-status article').length > 0);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  if (await page.locator('main > article.up').count()) assert.ok(!(await page.locator('main > article.up').textContent()).includes('✅'), 'The theme replaces the stock emoji with its CSS marker');
  assert.equal(await page.locator('.gcds-language-link').textContent(), 'Français');
  assert.equal(await page.locator('h1').textContent().then(x => x.trim()), 'Open.Canada.ca System Status');
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily.includes('Noto Sans')), true);
  assert.equal(await page.locator('input[type=radio]').first().isVisible(), true);
  // A language change must preserve the chosen measurement interval and URL state.
  await page.locator('#data_month').check();
  await page.screenshot({ path: path.join(screenshots, 'desktop-en.png'), fullPage: true });
  await page.locator('.gcds-language-link').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.lang === 'fr');
  assert.equal(await page.locator('h1').textContent().then(x => x.trim()), 'État des systèmes d’Open.Canada.ca');
  assert.equal(await page.locator('#data_month').isChecked(), true);
  assert.equal(new URL(page.url()).searchParams.get('test'), 'preserved');
  assert.equal(await page.locator('.gcds-language-link').getAttribute('lang'), 'en');
  assert.equal(await page.locator('nav').getAttribute('aria-label'), 'Fil d’Ariane');
  assert.equal(await page.locator('.gcds-language-link').evaluate(el => el === document.activeElement), true);
  assert.ok((await page.locator('.live-status').textContent()).includes('Temps de réponse moyen'));
  assert.ok((await page.locator('.live-status .data').allTextContents()).some(x => /\d+\s*ms/.test(x)));
  assert.ok(!(await page.locator('main').textContent()).includes('Overall uptime'));
  await page.screenshot({ path: path.join(screenshots, 'desktop-fr.png'), fullPage: true });
  for (const lang of ['fr', 'en']) {
    await page.setViewportSize({ width: 390, height: 844 });
    if (await page.locator('html').getAttribute('lang') !== lang) await page.locator('.gcds-language-link').click();
    await page.waitForFunction(expected => document.documentElement.lang === expected, lang);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal overflow');
    await page.screenshot({ path: path.join(screenshots, `mobile-${lang}.png`), fullPage: true });
  }
  // The adapter must handle future asynchronous text updates, not only initial HTML.
  await page.locator('.gcds-language-link').click();
  await page.evaluate(() => {
    const fixture = document.createElement('div'); fixture.id = 'gcds-test-fixture';
    fixture.innerHTML = '<span>Incident #123 report / Rapport d\'incident #123 →</span><div>Posted at <a href="https://example.com/date">Oct 31</a> by <a href="https://example.com/author">@author</a> / Posté à <a href="https://example.com/date">Oct 31</a> par <a href="https://example.com/author">@author</a></div>';
    document.querySelector('main').append(fixture);
  });
  await page.waitForFunction(() => document.querySelector('#gcds-test-fixture span').textContent.includes("Rapport d'incident #123"));
  await page.waitForFunction(() => document.querySelectorAll('#gcds-test-fixture a').length === 2);
  assert.ok((await page.locator('#gcds-test-fixture div').textContent()).startsWith('Posté à'));
  await page.locator('.gcds-language-link').click();
  await page.waitForFunction(() => document.querySelector('#gcds-test-fixture span').textContent === 'Incident #123 report');
  assert.equal(await page.locator('#gcds-test-fixture a').count(), 2);
  await page.evaluate(() => { document.querySelector('#gcds-test-fixture span').firstChild.nodeValue = "Incident #456 report / Rapport d'incident #456 →"; });
  await page.waitForFunction(() => document.querySelector('#gcds-test-fixture span').textContent === 'Incident #456 report');
  await page.locator('#gcds-test-fixture').evaluate(el => el.remove());
  // Persisted preference and explicit URL override.
  await page.locator('.gcds-language-link').click();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.lang === 'fr');
  await page.goto(new URL('?lang=en', base).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.locator('.gcds-language-link').click();
  await page.goBack();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  // A fallback page may mount its layout after window.load.
  const delayed = await context.newPage();
  const delayedURL = new URL('gcds-delayed-test?lang=fr', base).href;
  const scriptURL = new URL('gcds-i18n.js', base).href;
  await delayed.route(delayedURL, route => route.fulfill({ contentType: 'text/html', body:
    `<!doctype html><html><head><meta charset="utf-8"><script async src="${scriptURL}"></script></head><body><div id="sapper"></div><script>
    setTimeout(() => { document.querySelector('#sapper').innerHTML = '<nav></nav><main><h1>Open.Canada.ca System Status / État des systèmes d’Open.Canada.ca</h1></main>'; }, 1200);
    </script></body></html>` }));
  await delayed.goto(delayedURL);
  await delayed.locator('.gcds-language-link').waitFor();
  assert.equal(await delayed.locator('.gcds-language-link').count(), 1);
  assert.equal(await delayed.locator('h1').textContent(), 'État des systèmes d’Open.Canada.ca');
  // Replacing a fallback layout must preserve the existing control and skip target.
  await delayed.evaluate(() => { document.querySelector('#sapper').innerHTML = '<nav></nav><main><h1>Open.Canada.ca System Status / État des systèmes d’Open.Canada.ca</h1></main>'; });
  await delayed.waitForFunction(() => document.querySelector('main')?.id === 'gcds-main');
  assert.equal(await delayed.locator('.gcds-language-link').count(), 1);
  await delayed.locator('.gcds-language-link').click();
  assert.equal(await delayed.locator('html').getAttribute('lang'), 'en');
  await delayed.close();
  // History navigation works on direct URLs and Sapper client navigation.
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(new URL('history/portal?lang=en', base).href, { waitUntil: 'networkidle' });
  await page.locator('.gcds-history-back a').waitFor();
  assert.equal(await page.locator('.gcds-history-back').count(), 1);
  assert.equal(await page.locator('nav ul a').count(), 0);
  assert.equal(await page.locator('.gcds-history-back a').textContent(), '← Back to all services');
  assert.equal(await page.locator('.gcds-history-back a').getAttribute('href'), new URL('?lang=en', base).href);
  await page.screenshot({ path: path.join(screenshots, 'history-desktop-en.png'), fullPage: true });
  await page.locator('.gcds-language-link').click();
  assert.equal(await page.locator('.gcds-history-back a').textContent(), '← Retour à tous les services');
  assert.equal(await page.locator('.gcds-history-back').count(), 1);
  await page.screenshot({ path: path.join(screenshots, 'history-desktop-fr.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  await page.waitForTimeout(350); // Allow the upstream canvas chart to finish its resize.
  await page.screenshot({ path: path.join(screenshots, 'history-mobile-fr.png'), fullPage: true });
  await page.locator('.gcds-language-link').click();
  await page.screenshot({ path: path.join(screenshots, 'history-mobile-en.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const brandRects = await page.evaluate(() => {
    const signature = document.querySelector('.gcds-signature').getBoundingClientRect();
    const toggle = document.querySelector('.gcds-language-link').getBoundingClientRect();
    const wordmark = document.querySelector('.gcds-brand-footer img').getBoundingClientRect();
    return { signatureRight: signature.right, toggleLeft: toggle.left, wordmarkRight: wordmark.right, width: innerWidth };
  });
  assert.ok(brandRects.signatureRight <= brandRects.toggleLeft, 'Signature and language link must not overlap');
  assert.ok(Math.abs(brandRects.wordmarkRight - (brandRects.width - 16)) < 2, 'Mobile wordmark sits at the right gutter');
  await page.locator('.gcds-history-back a').click();
  await page.waitForFunction(() => !location.pathname.includes('/history/'));
  await page.waitForFunction(() => !document.querySelector('.gcds-history-back'));
  const firstService = page.locator('.live-status h4 a').first();
  // A stock local export still generates service URLs for the public deployment.
  if (new URL(base).hostname === '127.0.0.1') await firstService.evaluate(link => {
    const url = new URL(link.href); link.href = location.origin + url.pathname + url.search;
  });
  await firstService.click();
  await page.waitForFunction(() => location.pathname.includes('/history/'));
  await page.locator('.gcds-history-back a').waitFor();
  assert.equal(await page.locator('.gcds-history-back').count(), 1);
  await page.goBack();
  await page.waitForFunction(() => !location.pathname.includes('/history/'));
  await page.waitForFunction(() => !document.querySelector('.gcds-history-back'));
  await page.goto(new URL('incident/1?lang=fr', base).href, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.gcds-history-back').count(), 0);
  await page.locator('main > footer a').waitFor();
  assert.ok((await page.locator('main > footer a').textContent()).includes('Retour à tous les incidents'));
  // No JavaScript: source bilingual copy remains visible.
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noJS.newPage();
  await fallback.goto(base);
  assert.ok((await fallback.locator('h1').textContent()).includes(' / '));
  assert.equal(await fallback.locator('.gcds-language-link').count(), 0);
  await noJS.close();
  assert.deepEqual(errors, [], 'No browser runtime errors');
  await browser.close();
  console.log('PASS: EN/FR, keyboard, responsive layout, numbers/units, dynamic updates, metadata links, persistence, URL precedence, Back, and bilingual no-JS fallback.');
})().catch(error => { console.error(error); process.exit(1); });
