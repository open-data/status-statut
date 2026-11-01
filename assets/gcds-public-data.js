/* Credential-free Upptime transport. Load synchronously in customHeadHtml,
 * before the app mounts. Only public snapshots and immutable CDN files leave
 * the browser; GitHub API requests are fulfilled locally, never proxied. MIT.
 */
(() => {
  'use strict';
  if (window.__gcdsPublicData) return;
  const script = document.currentScript;
  const repository = script.dataset.repository;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Missing public status repository');
  const assetURL = new URL(script.src, location.href);
  const base = new URL('./', assetURL);
  const originalFetch = window.fetch.bind(window);
  const apiPrefix = `/repos/${repository}/`.toLowerCase();
  const cacheKey = `gcds-public-snapshot:${repository}`;
  let pending, snapshot, dataCommit, fallback = false, fetchedAt = 0;
  const detailCache = new Map();
  const publicOptions = { credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } };
  const cdn = (ref, path) => `https://cdn.jsdelivr.net/gh/${repository}@${ref}/${path}`;
  const valid = value => value?.schemaVersion === 1 && value.repository?.toLowerCase() === repository.toLowerCase()
    && /^[a-f0-9]{40}$/.test(value.sourceCommit || '') && Number.isFinite(Date.parse(value.generatedAt))
    && Number.isFinite(Date.parse(value.sourceUpdatedAt)) && Date.parse(value.generatedAt) <= Date.now() + 300000
    && Array.isArray(value.summary) && Array.isArray(value.issues) && value.commits && value.details;
  const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  async function read(url, options = {}) {
    const response = await originalFetch(url, { ...publicOptions, ...options });
    if (!response.ok) throw new Error('Public status HTTP ' + response.status);
    return response.json();
  }
  function remember() {
    try { localStorage.setItem(cacheKey, JSON.stringify({ snapshot, dataCommit })); } catch (_) { /* Public cache is optional. */ }
  }
  async function load() {
    if (snapshot && Date.now() - fetchedAt < 60000) return snapshot;
    if (pending) return pending;
    pending = (async () => {
      try {
        const pointerURL = new URL('public-status.json', base);
        pointerURL.searchParams.set('minute', Math.floor(Date.now() / 60000));
        const pointer = await read(pointerURL, { cache: 'no-store' });
        if (pointer.repository?.toLowerCase() !== repository.toLowerCase() || !/^[a-f0-9]{40}$/.test(pointer.dataCommit || '')) throw new Error('Invalid public status pointer');
        const value = await read(cdn(pointer.dataCommit, 'manifest.json'));
        if (!valid(value)) throw new Error('Invalid public status snapshot');
        snapshot = value; dataCommit = pointer.dataCommit; fallback = false;
      } catch (_) {
        try {
          // Branch-cache fallback is deliberately marked as potentially stale.
          const value = await read(cdn('public-status-data', 'manifest.json'));
          if (!valid(value)) throw new Error('Invalid fallback');
          snapshot = value; dataCommit = 'public-status-data'; fallback = true;
        } catch (_) {
          let cached;
          try { cached = JSON.parse(localStorage.getItem(cacheKey)); } catch (_) { /* Unavailable storage. */ }
          if (!valid(cached?.snapshot) || Date.now() - Date.parse(cached.snapshot.generatedAt) > 86400000) throw new Error('Public status data is temporarily unavailable');
          snapshot = cached.snapshot; dataCommit = cached.dataCommit; fallback = true;
        }
      }
      fetchedAt = Date.now(); remember(); updateNotice(); rewriteGraphs(document);
      return snapshot;
    })().finally(() => { pending = undefined; });
    return pending;
  }
  async function detail(number) {
    const state = await load();
    const ref = state.details[number];
    if (!ref || !/^issues\/\d+-[a-f0-9]{16}\.json$/.test(ref.path)) throw new Error('Incident is not in the public status snapshot');
    const key = `${dataCommit}/${ref.path}`;
    if (!detailCache.has(key)) detailCache.set(key, read(cdn(dataCommit, ref.path)).then(value => {
      if (value.repository?.toLowerCase() !== repository.toLowerCase() || value.issue?.number !== Number(number)) throw new Error('Invalid public incident');
      return value;
    }).catch(error => { detailCache.delete(key); throw error; }));
    return detailCache.get(key);
  }
  function isOwnRaw(url) {
    return url.hostname === 'raw.githubusercontent.com' && url.pathname.toLowerCase().startsWith('/' + repository.toLowerCase() + '/');
  }
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.hostname === 'api.github.com' && url.pathname.toLowerCase().startsWith(apiPrefix)) {
      if (method !== 'GET') throw new Error('Public status is read-only');
      const path = url.pathname.slice(apiPrefix.length);
      const state = await load();
      if (path === 'issues') {
        const labels = (url.searchParams.get('labels') || '').split(',').filter(Boolean);
        const filter = url.searchParams.get('state') || 'open';
        const issues = state.issues.filter(issue => (filter === 'all' || issue.state === filter) && labels.every(label => issue.labels.some(item => item.name === label)));
        const sort = url.searchParams.get('sort') === 'updated' ? 'updated_at' : 'created_at';
        issues.sort((a, b) => Date.parse(b[sort]) - Date.parse(a[sort]));
        if (url.searchParams.get('direction') === 'asc') issues.reverse();
        const size = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page')) || 30));
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
        return json(issues.slice((page - 1) * size, page * size));
      }
      const incident = path.match(/^issues\/(\d+)(\/comments)?$/);
      if (incident) { const value = await detail(incident[1]); return json(incident[2] ? value.comments : value.issue); }
      if (path === 'commits') {
        const slug = (url.searchParams.get('path') || '').match(/^history\/([\w.-]+)\.yml$/)?.[1];
        if (!slug || !state.commits[slug]) throw new Error('History is not in the public status snapshot');
        return json(state.commits[slug].slice(0, Math.min(100, Number(url.searchParams.get('per_page')) || 30)));
      }
      throw new Error('Unsupported public status request');
    }
    if (isOwnRaw(url)) {
      if (method !== 'GET') throw new Error('Public status is read-only');
      const state = await load();
      const path = url.pathname.split('/').slice(4).join('/');
      if (path === 'history/summary.json') return json(state.summary);
      if (path.startsWith('graphs/')) return originalFetch(cdn(state.sourceCommit, path), { credentials: 'omit', referrerPolicy: 'no-referrer' });
      throw new Error('Unsupported public status asset');
    }
    return originalFetch(input, init);
  };
  function rewriteGraphs(root) {
    if (!snapshot || !root.querySelectorAll) return;
    const elements = [...root.querySelectorAll('[style], img[src]')];
    if (root.nodeType === 1 && root.matches('[style], img[src]')) elements.push(root);
    const raw = `https://raw.githubusercontent.com/${repository}/`;
    for (const element of elements) {
      const style = element.getAttribute('style');
      if (style?.includes(raw)) {
        const next = style.replace(/https:\/\/raw\.githubusercontent\.com\/[^\s'"()]+/g, match => {
          const url = new URL(match);
          return isOwnRaw(url) ? cdn(snapshot.sourceCommit, url.pathname.split('/').slice(4).join('/')) : match;
        });
        if (next !== style) element.setAttribute('style', next);
      }
      if (element.tagName === 'IMG' && element.src.startsWith(raw)) {
        const url = new URL(element.src); element.src = cdn(snapshot.sourceCommit, url.pathname.split('/').slice(4).join('/'));
      }
    }
  }
  function updateNotice() {
    const main = document.querySelector('main');
    if (!main || !snapshot) return;
    let notice = main.querySelector('.gcds-public-data-notice');
    if (!notice) {
      notice = document.createElement('p'); notice.className = 'gcds-public-data-notice'; notice.dataset.gcdsUi = '';
      const heading = main.querySelector(':scope > header') || main.querySelector('h1');
      if (heading) heading.after(notice); else main.prepend(notice);
    }
    const fr = document.documentElement.lang?.startsWith('fr');
    const sourceDate = snapshot.sourceUpdatedAt || snapshot.generatedAt;
    const stale = fallback || Date.now() - Math.min(Date.parse(snapshot.generatedAt), Date.parse(sourceDate)) > 20 * 60000;
    const date = new Date(sourceDate).toLocaleString(fr ? 'fr-CA' : 'en-CA');
    const text = stale
      ? (fr ? `Données mises en cache — dernière mise à jour : ${date}. Actualisez la page pour réessayer.` : `Cached data — last updated: ${date}. Refresh the page to retry.`)
      : (fr ? `Données de surveillance mises à jour le ${date}. Actualisation environ toutes les 10 minutes.` : `Monitoring data updated: ${date}. Snapshots refresh about every 10 minutes.`);
    if (notice.textContent !== text) notice.textContent = text;
    notice.classList.toggle('stale', stale);
    document.documentElement.dataset.gcdsPublicData = stale ? 'stale' : 'ready';
  }
  // Ignore old Octokit caches, but retain the visitor's language preference.
  try {
    const marker = repository.replace('/', '-');
    for (const key of Object.keys(localStorage)) if (key.includes(marker) && /^(issues-|closed-issues-|maintenance-issues-|scheduled-current-|issue-|issue-comments-|commits-)/.test(key)) localStorage.removeItem(key);
  } catch (_) { /* Storage is optional. */ }
  window.__gcdsPublicData = { load, repository };
  const observer = new MutationObserver(records => {
    updateNotice();
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === 'lang') continue;
      rewriteGraphs(record.target.nodeType === 1 ? record.target : document);
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'src', 'lang'] });
  setInterval(updateNotice, 60000);
  // Old bookmarks must recover without ever asking visitors for a token.
  if (location.pathname.replace(/\/$/, '') === new URL('rate-limit-exceeded', base).pathname) {
    const home = new URL(base); home.search = location.search; location.replace(home.href);
  }
})();
