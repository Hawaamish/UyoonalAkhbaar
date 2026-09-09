# HTML Refactor Notes

## Processed HTML Files

| HTML file | Extracted CSS | Extracted JS |
| --- | --- | --- |
| `index.html` | None; already uses `assets/css/login.css` | None; already uses `assets/js/login.js` |
| `pages/bookindex.html` | `styles/bookindex.css` | `scripts/bookindex.js` |
| `pages/hamish.html` | `styles/hamish.css` | `scripts/hamish.js` |
| `pages/lawhaat.html` | `styles/lawhaat.css` | `scripts/lawhaat.js` |
| `pages/mainpage.html` | `styles/mainpage.css` | `scripts/mainpage.js` |
| `pages/maps.html` | None; already uses `assets/css/maps.css` | `scripts/maps.js` |
| `pages/maptest.html` | `styles/maptest.css` | `scripts/maptest.js` |
| `pages/paintings.html` | `styles/paintings.css` | None; no inline JavaScript |
| `pages/U2DigitalMap.html` | `styles/U2DigitalMap.css` | None; already uses external scripts in `assets/js/` |
| `pages/U2Qasaid.html` | `styles/U2Qasaid.css` | `scripts/U2Qasaid.js` |

No shared inline CSS or JavaScript was identical enough to extract into `common.css` or `common.js` without changing ownership or behavior. Existing shared/vendor assets were left in their current locations.

## New Folder Structure

```text
styles/
  bookindex.css
  hamish.css
  lawhaat.css
  mainpage.css
  maptest.css
  paintings.css
  U2DigitalMap.css
  U2Qasaid.css

scripts/
  bookindex.js
  hamish.js
  lawhaat.js
  mainpage.js
  maps.js
  maptest.js
  U2Qasaid.js
```

## Dead or Broken Code Changes

None. No CSS rules, JavaScript functions, event handlers, data attributes, inline styles, class names, IDs, or element structures were removed or simplified.

## Assumptions

- HTML files remain in their existing directories.
- Existing external CSS, JavaScript, CDN, font, and vendor asset references remain unchanged.
- Extracted page assets are linked with paths relative to each HTML page.
- Extracted JavaScript is loaded with `defer` so it runs after the HTML has been parsed, matching the original pages' effective DOM-ready execution context.
- Dynamic inline styles assigned by JavaScript remain in JavaScript and were not moved or rewritten.

## Future Navigation

- To edit styles for a page, open its matching file in `styles/`, such as `styles/bookindex.css`.
- To edit page-specific behavior, open its matching file in `scripts/`, such as `scripts/bookindex.js`.
- Existing shared assets remain under `assets/css/` and `assets/js/`.
- HTML structure and page content remain in the original files under the project root and `pages/`.

## Validation

- All 10 HTML files contain zero inline `<style>` blocks and zero inline JavaScript blocks.
- All newly extracted JavaScript files pass `node --check`.
- All new local CSS and JavaScript links resolve to existing files.