# 15 — Mobile-first and offline PWA

## Responsive behavior
Test iPhone Safari viewport and installed home-screen web app, Android Chrome and desktop; Playwright WebKit not substitute for real iOS test. 360/390/430/768/1280 px layouts, safe-area inset, dynamic viewport, virtual keyboard; input stays visible, drawer scroll locked correctly, no accidental zoom due to tiny input font. Copy action visible without hover; 44px touch target goal, keyboard and screen-reader labels. Link open must follow gesture; draft text copy actual clipboard. Long tables scroll locally, chart legend adapts, no entire app horizontal overflow. Support light/dark/system. Avoid mandatory install, explain optional Add to Home Screen. Share API and OS integration feature-detected, not assumed universal.

## Service worker
Cache app shell and versioned static assets; navigation fallback for known app routes; first load online required. Do not cache auth tokens, private API responses or user notes in Cache API; data in IndexedDB. Network-first or explicit fetch for public FX, local snapshot fallback with freshness. No reliance on background sync or periodic tasks (platform support varies); sync foreground on startup, reconnect, explicit refresh and while app active with backoff. Service worker update waiting: show update available, flush saves, activate/reload only after safe state; retain compatible assets until old clients gone, handle offline version mismatch. App manifest icons, display standalone, scope/start URL, HTTPS in production. No secrets in manifest or static assets.

## Offline behavior matrix
| Feature | Offline |
|---|---|
| Create/edit/move/copy/search | works after initial load |
| Formula, stats, chart | works from local snapshots |
| External link navigation | browser/network dependent, show normal destination |
| FX refresh | unavailable; cached/manual with date |
| Cloud auth/sync | queue locally; retry online, no false synced badge |
| Attachment read | local cached blob only, explicit unavailable state otherwise |
| Import/export | local data available; backup may report missing remote blobs |

## Recovery
Storage eviction possible; use quota estimates, optional persistence request, backup prompt and sync if enabled. Offline writes must survive normal reload after commit, not guaranteed after OS/browser data purge. Multi-tab and service worker update tests. Do not mark unsaved draft saved just because offline. Test airplane mode after warm boot, create link/draft/data, close/reopen, copy, reconnect and replay, no duplicates; cold offline first visit helpful browser/app fallback where possible. Record manual device evidence and known limitations.
