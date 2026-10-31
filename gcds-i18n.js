/* Optional English/French enhancement for the GCDS-inspired Upptime theme. MIT.
 * Dictionary is generated from .upptimerc.yml by tools/build-gcds-i18n.py.
 * No framework dependency, generated Svelte selectors, or repository URLs.
 */
(() => {
  'use strict';
  // Exported pages can execute custom scripts both during parsing and hydration.
  const instanceKey = '__gcdsUpptimeLanguageInitialized';
  if (window[instanceKey]) return;
  window[instanceKey] = true;
  const script = document.currentScript;
  const assetURL = new URL(script.src, location.href);
  const basePath = assetURL.pathname.slice(0, assetURL.pathname.lastIndexOf('/') + 1);
  const storageKey = `gcds-upptime-language:${basePath}`;
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const textRecords = new WeakMap();
  const groupRecords = new WeakMap();
  const attributeRecords = new WeakMap();
  let language, entries, header, toggle, announcement;
  let scheduled = false;
  let repositoryUrl;
  let historyBackLabels = { en: '← Back to all services', fr: '← Retour à tous les services' };

  function compile(message) {
    const tokens = [];
    const source = normalize(message.source);
    const pattern = source.split(/(\$[A-Z]+)/).map(part => {
      if (/^\$[A-Z]+$/.test(part)) { tokens.push(part); return '(.+?)'; }
      return escape(part);
    }).join('');
    return { ...message, tokens, pattern: new RegExp(`^${pattern}$`) };
  }

  function match(value) {
    const plain = normalize(value);
    // Upptime's all-operational message has an emoji outside the i18n value.
    const originalDecoration = plain.match(/^(✅|⚠️|🛑)\s*/)?.[0] || '';
    const decoration = originalDecoration.startsWith('✅') ? '' : originalDecoration;
    const content = originalDecoration ? plain.slice(originalDecoration.length) : plain;
    for (const entry of entries) {
      const result = entry.pattern.exec(content);
      if (!result) continue;
      const values = {};
      entry.tokens.forEach((token, index) => { if (!(token in values)) values[token] = result[index + 1]; });
      return { entry, values, decoration };
    }
    return null;
  }

  function render(found) {
    return found.decoration + found.entry[language].replace(/\$[A-Z]+/g, token => found.values[token] ?? token);
  }

  function translateText(node) {
    const record = textRecords.get(node);
    const source = record && node.nodeValue === record.output ? record.source : node.nodeValue;
    // Some Upptime builds emit the stock emoji in its own text node.
    // The theme draws a font-independent decorative marker for this banner.
    if (/^\s*✅\s*$/.test(source) && node.parentElement?.matches('main > article.up')) {
      if (node.nodeValue !== '') node.nodeValue = '';
      textRecords.set(node, { source, output: '' });
      return;
    }
    const found = match(source);
    if (!found) return;
    const output = (source.match(/^\s*/)?.[0] || '') + render(found) + (source.match(/\s*$/)?.[0] || '');
    if (node.nodeValue !== output) node.nodeValue = output;
    textRecords.set(node, { source, output });
  }

  function translateInlineGroup(element) {
    // Only metadata containing plain links. Never replace form controls, cards,
    // graphs, or interactive Svelte subtrees. Preserve variable links as links.
    if (!element.children.length || ![...element.children].every(child => child.tagName === 'A' && !child.children.length)) return;
    const old = groupRecords.get(element);
    const current = normalize(element.textContent);
    const source = old && current === old.output ? old.source : current;
    const found = match(source);
    if (!found) return;
    const output = render(found);
    if (current === normalize(output)) return;
    const links = old && current === old.output ? old.links : [...element.children].map(link => link.cloneNode(true));
    const fragment = document.createDocumentFragment();
    if (found.decoration) fragment.append(document.createTextNode(found.decoration));
    for (const part of found.entry[language].split(/(\$[A-Z]+)/)) {
      const value = found.values[part];
      if (value === undefined) { fragment.append(document.createTextNode(part)); continue; }
      const link = links.find(link => normalize(link.textContent) === normalize(value));
      fragment.append(link ? link.cloneNode(true) : document.createTextNode(value));
    }
    element.replaceChildren(fragment);
    groupRecords.set(element, { source, output: normalize(element.textContent), links });
  }

  function translateAttributes(element) {
    const records = attributeRecords.get(element) || {};
    for (const name of ['aria-label', 'title', 'placeholder', 'alt']) {
      const current = element.getAttribute(name);
      if (!current) continue;
      const old = records[name];
      const source = old && current === old.output ? old.source : current;
      const found = match(source);
      if (!found) continue;
      const output = render(found);
      if (current !== output) element.setAttribute(name, output);
      records[name] = { source, output };
    }
    attributeRecords.set(element, records);
  }

  function ensureBrandFooter() {
    // Older released Upptime templates do not render customFootHtml.
    const root = document.querySelector('#sapper');
    const template = document.querySelector('template[data-gcds-brand-footer]');
    if (!root || !template) return;
    const nativeFooter = root.querySelector('.gcds-brand-footer:not([data-gcds-footer-fallback])');
    if (nativeFooter) {
      root.querySelectorAll('[data-gcds-footer-fallback]').forEach(footer => footer.remove());
    } else if (!root.querySelector('.gcds-brand-footer')) {
      const content = template.content.cloneNode(true);
      const footer = content.querySelector('.gcds-brand-footer');
      if (footer) { footer.dataset.gcdsFooterFallback = ''; root.append(content); }
    }
  }

  function applyLayoutOptions() {
    if (header?.hasAttribute('data-gcds-breadcrumb-header')) {
      const nav = document.querySelector('#sapper > nav');
      if (nav) {
        nav.dataset.gcdsBreadcrumbs = '';
        nav.setAttribute('aria-label', language === 'fr' ? 'Fil d’Ariane' : 'Breadcrumb');
      }
    }
    if (header?.hasAttribute('data-gcds-repository-footer') && repositoryUrl) {
      const footer = document.querySelector('#sapper > main ~ footer');
      if (footer) {
        let repository = footer.querySelector('.gcds-repository-link');
        if (!repository) {
          repository = document.createElement('p');
          repository.className = 'gcds-repository-link';
          const link = document.createElement('a');
          const icon = document.createElement('img');
          icon.className = 'gcds-repository-icon';
          icon.src = new URL('gcds-github.svg', assetURL).href;
          icon.alt = '';
          icon.width = 20;
          icon.height = 20;
          icon.setAttribute('aria-hidden', 'true');
          link.append(icon, document.createTextNode('GitHub'));
          link.href = repositoryUrl;
          repository.append(link);
          footer.append(repository);
        }
      }
    }
    const favicon = document.querySelector('link[data-gcds-favicon]');
    if (favicon) document.querySelectorAll('link[rel="icon"]').forEach(link => {
      if (link !== favicon) link.remove();
    });
  }

  function apply() {
    scheduled = false;
    ensureBrandFooter();
    applyLayoutOptions();
    // The service-worker fallback can mount/recreate the layout after window.load.
    if (header && !header.isConnected) {
      const replacement = document.querySelector('[data-gcds-brand-header]');
      if (replacement && replacement !== header) replacement.replaceWith(header);
      else document.querySelector('nav')?.before(header);
    }
    const main = document.querySelector('main');
    const isHistory = location.pathname.startsWith(`${basePath}history/`);
    let back = main?.querySelector('.gcds-history-back');
    if (main && isHistory) {
      if (!back) {
        back = document.createElement('footer');
        back.className = 'gcds-history-back';
        back.dataset.gcdsUi = '';
        back.append(document.createElement('a'));
        main.append(back);
      }
      const link = back.querySelector('a');
      const home = new URL(basePath, location.origin);
      home.searchParams.set('lang', language);
      if (link.href !== home.href) link.href = home.href;
      if (link.textContent !== historyBackLabels[language]) link.textContent = historyBackLabels[language];
    } else if (back) back.remove();
    document.documentElement.lang = language;
    document.documentElement.dataset.gcdsLanguage = language;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest('script, style, noscript, code, pre, textarea, [data-gcds-ui], [translate="no"]')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(translateText);
    document.querySelectorAll('main div, main p, main a').forEach(translateInlineGroup);
    document.querySelectorAll('[aria-label], [title], [placeholder], img[alt]').forEach(translateAttributes);
    const titleNode = document.querySelector('title')?.firstChild;
    if (titleNode) translateText(titleNode);
    const alternate = language === 'en' ? 'fr' : 'en';
    const target = new URL(location.href);
    target.searchParams.set('lang', alternate);
    toggle.href = target.href;
    toggle.lang = alternate;
    toggle.hreflang = alternate;
    const toggleText = alternate === 'fr' ? 'Français' : 'English';
    if (toggle.textContent !== toggleText) toggle.textContent = toggleText;
    toggle.setAttribute('aria-label', alternate === 'fr' ? 'Passer au français' : 'Switch to English');
    const skip = header.querySelector('.gcds-skip-link');
    const currentMain = document.querySelector('main');
    if (currentMain) {
      if (!currentMain.id) currentMain.id = 'gcds-main';
      currentMain.tabIndex = -1;
      skip.href = `#${currentMain.id}`;
    }
    const skipText = language === 'fr' ? 'Passer au contenu principal' : 'Skip to main content';
    if (skip.textContent !== skipText) skip.textContent = skipText;
    document.querySelectorAll('a[href]').forEach(link => {
      if (link.closest('[data-gcds-ui]') || link.getAttribute('href').startsWith('#')) return;
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname.startsWith(basePath)) {
        url.searchParams.set('lang', language);
        if (link.href !== url.href) link.href = url.href;
      }
    });
  }

  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(apply); }
  }

  async function start() {
    try {
      const response = await fetch(new URL('gcds-i18n.json', assetURL));
      if (!response.ok) throw new Error(`Dictionary HTTP ${response.status}`);
      const dictionary = await response.json();
      entries = dictionary.messages.map(compile);
      repositoryUrl = dictionary.repositoryUrl;
      if (dictionary.historyBack?.en && dictionary.historyBack?.fr) historyBackLabels = dictionary.historyBack;
      const requested = new URL(location.href).searchParams.get('lang');
      let saved;
      try { saved = localStorage.getItem(storageKey); } catch (_) { /* Private storage may be unavailable. */ }
      language = [requested, saved, dictionary.defaultLanguage, 'en'].find(value => value === 'en' || value === 'fr');
      const nav = await new Promise(resolve => {
        const existing = document.querySelector('nav');
        if (existing) return resolve(existing);
        const observer = new MutationObserver(() => {
          const mounted = document.querySelector('nav');
          if (mounted) { observer.disconnect(); clearTimeout(timeout); resolve(mounted); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const timeout = setTimeout(() => { observer.disconnect(); resolve(null); }, 15000);
      });
      if (!nav) return;
      const brandedHeader = document.querySelector('[data-gcds-brand-header]');
      header = brandedHeader || document.createElement('header');
      header.classList.add('gcds-language-header');
      header.dataset.gcdsUi = '';
      const languageLinks = '<a class="gcds-skip-link" href="#gcds-main"></a><a class="gcds-language-link" rel="alternate"></a><span class="gcds-language-announcement" role="status" aria-live="polite"></span>';
      const slot = header.querySelector('[data-gcds-language-slot]');
      if (slot) slot.innerHTML = languageLinks;
      else header.innerHTML = `<div class="container">${languageLinks}</div>`;
      if (!brandedHeader) nav.before(header);
      const main = document.querySelector('main');
      if (main) {
        if (!main.id) main.id = 'gcds-main';
        main.tabIndex = -1;
        header.querySelector('.gcds-skip-link').href = `#${main.id}`;
      }
      toggle = header.querySelector('.gcds-language-link');
      announcement = header.querySelector('[role="status"]');
      toggle.addEventListener('click', event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        language = language === 'en' ? 'fr' : 'en';
        const url = new URL(location.href);
        url.searchParams.set('lang', language);
        history.pushState(null, '', url);
        try { localStorage.setItem(storageKey, language); } catch (_) { /* URL remains usable. */ }
        apply();
        announcement.textContent = language === 'fr' ? 'Interface en français.' : 'Interface in English.';
      });
      window.addEventListener('popstate', () => {
        const requested = new URL(location.href).searchParams.get('lang');
        language = requested === 'fr' ? 'fr' : requested === 'en' ? 'en' : dictionary.defaultLanguage;
        apply();
      });
      apply();
      new MutationObserver(schedule).observe(document.body, { childList: true, characterData: true, subtree: true });
      new MutationObserver(schedule).observe(document.head, { childList: true, characterData: true, subtree: true });
    } catch (error) {
      // The original bilingual page remains available if the enhancement cannot load.
      console.warn('GCDS language enhancement unavailable:', error);
    }
  }
  // Svelte must finish hydration before interface text is changed.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
