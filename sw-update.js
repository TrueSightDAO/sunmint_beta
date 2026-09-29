/**
 * Service-worker registration + "update available" self-heal.
 *
 * The app is an offline-capable PWA: a returning visitor can be served an
 * older cached shell after a deploy (network-first means this is normally
 * momentary, but an installed PWA or a long-open tab can pin the old HTML).
 * This turns that silent staleness into a one-tap "Reload to update" prompt,
 * so users self-heal instead of needing a manual cache clear.
 *
 * Pairs with service-worker.js's SKIP_WAITING message hook.
 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  var REFRESHING = false;

  // Show a small, dismissible banner. Kept dependency-free + inline-styled so
  // it works on every page without touching each page's CSS.
  function showUpdateBanner(reg) {
    if (document.getElementById('sw-update-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'sw-update-banner';
    bar.setAttribute('role', 'status');
    bar.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'background:#3b2314;color:#fff;padding:.7rem 1rem;font:14px/1.4 sans-serif;' +
      'display:flex;gap:.75rem;align-items:center;justify-content:center;' +
      'box-shadow:0 -2px 8px rgba(0,0,0,.3);';
    var msg = document.createElement('span');
    msg.textContent = 'Nova versão disponível. / A new version is available.';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Atualizar / Reload';
    btn.style.cssText =
      'background:#e0a458;color:#3b2314;border:0;border-radius:4px;' +
      'padding:.35rem .8rem;font-weight:700;cursor:pointer;';
    btn.addEventListener('click', function () {
      REFRESHING = true;
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      // Fallback if the waiting worker doesn't take over promptly.
      setTimeout(function () { window.location.reload(); }, 1500);
    });
    bar.appendChild(msg);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (REFRESHING) window.location.reload();
  });

  navigator.serviceWorker
    .register('/service-worker.js', { scope: '/' })
    .then(function (reg) {
      // A worker already waiting when we load = an update is pending.
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(reg);
          }
        });
      });
    })
    .catch(function (err) {
      console.warn('Sunmint Service Worker registration failed:', err);
    });
})();
