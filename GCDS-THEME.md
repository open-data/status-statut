# GCDS-inspired theme for Upptime

A reusable CSS theme and optional English/French language enhancement for the standard [Upptime status-page template](https://github.com/upptime/status-page). No template fork or changes to generated workflows are required. The CSS has no repository names, base paths, or organization-specific logos.

This approximates GCDS visual styling; it is not the GCDS web-component library or a certification of Canada.ca compliance. It uses the documented [custom theme](https://upptime.js.org/docs/configuration#theme) and [scripts](https://upptime.js.org/docs/configuration#custom-javascript) extension points.

## Install the CSS

Copy `assets/gcds.css` into your Upptime repository. Set the full public URL of the theme on your deployment (use `https://YOUR-DOMAIN/gcds.css` for a site at the domain root):

```yaml
status-website:
  theme: light
  themeUrl: https://YOUR-USER.github.io/YOUR-REPOSITORY/gcds.css
  links:
    - rel: stylesheet
      href: https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Noto+Sans:wght@400;700&display=swap
```

Upptime publishes the contents of `assets/` at the website root, so the URL does **not** include `/assets/`. Use an absolute hosted `themeUrl`: Upptime’s exporter may crawl a relative/local stylesheet URL as a page before copying assets, producing a directory/file collision. The full URL avoids this export problem.

Fonts can instead be self-hosted under your organization's font policy; the CSS also includes Arial and system sans-serif fallbacks. There are no external CSS imports. The theme works without the JavaScript add-on.

The palette maps all stock Upptime theme variables, including status borders, tags, code, buttons and graphs. Additional rules cover type sizes, the heading underline, layout, mobile navigation, cards, footer, visible focus, time-range radio controls, reduced motion and print. It uses stable element/class selectors rather than generated Svelte class names. Override `--gcds-theme-width`, `--gcds-theme-accent`, the `--gcds-*` colour variables, or font variables in your own stylesheet. No official signatures or wordmarks are added automatically; configure authorized branding through Upptime's `logoUrl` and `name`.

## Add the language link

1. Copy `assets/gcds-i18n.js`, `assets/gcds-messages.json`, and `tools/build-gcds-i18n.py` into the same paths in your repository.
2. Keep using Upptime's `i18n` map. Write each translated value as `English / Français` (one space on each side of the slash). The same convention works for the site's `name`, `introTitle`, `introMessage`, and navbar titles. Every template variable (`$NUMBER`, `$DATE`, etc.) should appear in both language halves, except the shared trailing values in `overallUptime` and `averageResponseTime`, which are supported explicitly.
3. Edit `assets/gcds-messages.json` for site-specific labels. Each entry has `source`, `en`, and `fr`. This translates displayed service names without changing check names, slugs, history or issue identifiers. Remove this repository's service names when adopting elsewhere. Values are plain text, not HTML or Markdown.
4. Install Python 3 and PyYAML, then run `python3 tools/build-gcds-i18n.py`. Commit the generated `assets/gcds-i18n.json` alongside your configuration. Rerun this command whenever you edit translated configuration text. CI does not need Python because the generated dictionary is committed.
5. Enable the script, using your deployment path:

```yaml
status-website:
  scripts:
    - src: /YOUR-REPOSITORY/gcds-i18n.js
      async: true
```

If you already have `links` or `scripts`, append to those lists. Do not create duplicate YAML keys. Keep `theme: light` as a fallback.

The script adds a top-right `Français` / `English` link in a header landmark, an accessible skip link, the appropriate document `lang`, and a language-change announcement. `?lang=fr` and `?lang=en` are shareable and take priority over the saved preference; otherwise English is the default. Switching preserves the current route, other query parameters, fragment and selected chart interval. Same-site status links carry the language parameter; external links retain their original URL. Browser Back/Forward and dynamically loaded Upptime content are supported. Storage failure does not prevent switching.

Only registered interface messages are translated. Incident titles, incident narratives, author names, dates, numeric measurements, chart images and canvas chart labels retain their original content/formatting. For fully localized dates or chart data labels, separate locale-specific builds or upstream template support would be required. Do not put HTML/Markdown markup in translated configuration messages; incident prose may continue using Upptime's Markdown normally. `[translate="no"]`, code, scripts and form values are excluded. If the dictionary fails to load or JavaScript is disabled, the original bilingual Upptime page remains usable and no language control is advertised.

## Verification and screenshots

The implementation is checked against the stock Upptime Svelte template, including keyboard switching, query parameters, persistent preferences, dynamic status data and incident metadata, mobile overflow and the no-JavaScript fallback. Screenshots are captured at desktop and mobile sizes in both languages. The test script in `tests/gcds-theme.cjs` accepts `STATUS_URL`, `SCREENSHOT_DIR`, and an optional `CHROME_PATH`; install Playwright separately to run it.

When changing the Upptime template version, recheck the home, history, incident and error views. CSS cannot repair all template semantics. This theme does not claim a full accessibility audit.

## Design references

- [GCDS colour tokens](https://design-system.canada.ca/en/foundations/colour/)
- [GCDS typography tokens](https://design-system.canada.ca/en/foundations/typography/)
- [GCDS language toggle](https://design-system.canada.ca/en/components/language-toggle/code/)
- [Upptime configuration and custom themes](https://upptime.js.org/docs/configuration)

Theme CSS, browser script and generator are distributed under the repository's MIT license. Font licenses remain with their respective publishers.

## Optional branding and history navigation

This site's `.upptimerc.yml` uses `customBodyHtml` for the supplied GC signature and a `template[data-gcds-brand-footer]` for the Canada wordmark. The optional language script places the footer template after the standard page footer. This works with released Upptime templates that do not render `customFootHtml`; if a native branded footer is present, the script uses it without duplication. Copy or replace these HTML blocks to opt in to your own branding; removing them restores the generic header. The bottom wordmark requires the enhancement script. The CSS and script contain no branding URLs. A header with `data-gcds-brand-header` and a child `data-gcds-language-slot` shares its top row with the language link. Images retain their aspect ratio on mobile. Keep useful image `alt` text, adding its translations to `assets/gcds-messages.json` if needed.

History pages receive a footer link to the status home page, retaining the chosen language. Customize `i18n.historyBack` using the same `English / Français` convention and regenerate the dictionary. The link is removed when navigating to another type of page; stock incident-page links stay intact.

The optional `data-gcds-breadcrumb-header` attribute places the header bar above the status-home breadcrumb. Set `navbar: []` to remove extra navigation items. `data-gcds-repository-footer` adds the GitHub repository link beneath the department text in the standard footer; its destination is generated from the configured owner/repository, so forks link to themselves. A `link[data-gcds-favicon]` supplied through `customHeadHtml` selects the branded tab icon and removes conflicting stock icons after hydration; the configured PNG favicon remains a no-script fallback. This site uses GCWeb's official maple-leaf ICO and mobile PNG assets.

The repository-footer option includes a decorative GitHub Octicons mark before the bold link text. Copy `assets/gcds-github.svg` with the language script; the icon's MIT license and GitHub copyright notice are included in that SVG. The icon is hidden from assistive technology because the adjacent link text supplies its accessible name.

## Credential-free public status delivery

Visitors do not call the GitHub REST API and do not need a personal access token. `assets/gcds-public-data.js` is a synchronous script in `customHeadHtml`, with `data-repository="OWNER/REPO"`. Keep it on the site's own Pages origin. It fulfills the stock Upptime issue, comment, commit-history and summary requests using public snapshots. Requests to the repository's GitHub API are handled locally, and their headers are never forwarded to the CDN. The normal status/error navigation no longer directs visitors to a token-entry form; old rate-limit-page bookmarks return to the public home page.

Copy the adapter, `tools/publish-public-status.py`, and `.github/workflows/public-status.yml` when adopting this option. The workflow needs only the built-in Actions token with contents write, issues read and Pages write permissions. It runs every ten minutes and after a successful site/setup build on the default branch. No additional secret is required. The token is confined to the runner's GitHub API reads and Git pushes; it is never written into public JSON, HTML, scripts or URLs.

The exporter reads public monitoring files and public status/maintenance issues, batches comment reads through GraphQL, reuses unchanged closed-issue discussions for up to a day, and exports filtered fields and issue comments, and publishes them on the dedicated `public-status-data` branch. A small `public-status.json` pointer is added to `gh-pages` without replacing other website files. A Pages build is requested explicitly because pushes made with the built-in Actions token do not themselves trigger a Pages build. Publishing retries if another website build advances the Pages branch. Monitoring records in `master` are never rewritten.

The pointer selects an immutable jsDelivr commit URL for the manifest and incident details. Graph PNGs use the monitoring source commit on jsDelivr. Mutable jsDelivr branch URLs can remain cached for twelve hours, so they are only a visibly marked fallback. Fresh status is never inferred from a cached branch URL. The page shows the monitoring timestamp, the approximate ten-minute publication cadence, and a warning when cached/stale data is used. Last-known public data can be retained in local storage for up to a day when the public hosts are unavailable. If no usable snapshot exists, the page reports a temporary loading error, without requesting credentials or inventing an all-operational result.

Initialize delivery by running the **Public status data** workflow once after merging. Generated snapshots and pointer files belong only on the publishing branches; do not commit them to the source PR. Archived SQL monitoring files stay intact, while the separate Datastore check uses its own monitor identifier. The adapter intentionally supports only the read-only endpoints the stock template uses; arbitrary GitHub issues outside the status/maintenance export are not mirrored.

Verification: run `tests/public-status.cjs` with Node/Playwright and `STATUS_URL`. It forces GitHub API/raw requests to return HTTP 429, seeds a dummy stored token, checks that no API requests or credential headers leave the browser, and exercises home, history, incident, language switching and recovery from old rate-limit URLs. This test uses no authenticated browser proxy.
