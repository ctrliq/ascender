/* Ascender UI behaviour. Plain JavaScript; the markup is PatternFly. */
(function () {
  'use strict';
  var A = window.ASCENDER || {};
  var csrf = A.csrf || (document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/) || [])[1] || '';

  // Forms built by the scripts only gather values: Enter must not submit
  // them. They carry data-no-submit (the content security policy allows
  // no inline onsubmit handlers).
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-no-submit')) e.preventDefault();
  }, true);

  // ---------------------------------------------------------------- helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  // The idle deadline, restarted by every API response that carries
  // Session-Timeout and shared with the other tabs through localStorage, as
  // the old Session context kept it.
  var SESSION_KEY = 'ascender-session-timeout';
  var session = { expiresAt: 0, schedule: null };
  function sessionTouch(seconds) {
    if (!seconds) return;
    session.expiresAt = Date.now() + seconds * 1000;
    try { localStorage.setItem(SESSION_KEY, String(session.expiresAt)); } catch (e) {}
    if (session.schedule) session.schedule();
  }
  function api(method, url, body) {
    var opts = { method: method, credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-CSRFToken': csrf } };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (r) {
      var timeout = r.headers.get('Session-Timeout');
      if (timeout) sessionTouch(Number(timeout));
      return r.text().then(function (t) {
        var data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
        if (r.status === 401) { window.location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); }
        return { status: r.status, ok: r.ok, data: data };
      });
    });
  }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // tOr translates a message composed at run time (msgid) when the catalog
  // has it; otherwise English keeps msgid and other languages show the
  // fallback message.
  function tOr(msgid, fallback, values) {
    var c = window.ASCENDER_I18N;
    if (!c || (typeof c[msgid] === 'string' && c[msgid])) return t(msgid, values);
    return t(fallback, values);
  }
  var ICON = {
    error: '<svg class="pf-v6-svg" fill="currentColor" viewBox="0 0 512 512" aria-hidden="true" role="img" width="1em" height="1em"><path d="M504 256c0 136.997-111.043 248-248 248S8 392.997 8 256C8 119.083 119.043 8 256 8s248 111.083 248 248zm-248 50c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z"></path></svg>',
    close: '<svg class="pf-v6-svg" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" role="img" width="1em" height="1em"><path d="M17.8 16.2 11.59 10l6.21-6.21c.42-.46.39-1.17-.07-1.59-.43-.4-1.09-.4-1.52 0l-6.2 6.2-6.22-6.19c-.44-.44-1.15-.44-1.59 0-.44.44-.44 1.15 0 1.59l6.2 6.21-6.2 6.2c-.42.46-.39 1.17.07 1.59.43.4 1.09.4 1.52 0L10 11.59l6.2 6.2c.44.44 1.15.44 1.59 0 .44-.45.44-1.16 0-1.6Z"></path></svg>',
    times: '<svg class="pf-v6-svg" fill="currentColor" viewBox="0 0 352 512" aria-hidden="true" role="img" width="1em" height="1em"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"></path></svg>',
    search: '<svg class="pf-v6-svg" fill="currentColor" viewBox="0 0 512 512" aria-hidden="true" role="img" width="1em" height="1em"><path d="M505 442.7L405.3 343c-4.5-4.5-10.6-7-17-7H372c27.6-35.3 44-79.7 44-128C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c48.3 0 92.7-16.4 128-44v16.3c0 6.4 2.5 12.5 7 17l99.7 99.7c9.4 9.4 24.6 9.4 33.9 0l28.3-28.3c9.4-9.4 9.4-24.6.1-34zM208 336c-70.7 0-128-57.2-128-128 0-70.7 57.2-128 128-128 70.7 0 128 57.2 128 128 0 70.7-57.2 128-128 128z"></path></svg>',
    warn: '<svg class="pf-v6-svg" fill="currentColor" viewBox="0 0 576 512" aria-hidden="true" role="img" width="1em" height="1em"><path d="M569.517 440.013C587.975 472.007 564.806 512 527.94 512H48.054c-36.937 0-59.999-40.055-41.577-71.987L246.423 23.985c18.467-32.009 64.72-31.951 83.154 0l239.94 416.028zM288 354c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z"></path></svg>'
  };

  // ---------------------------------------------------------------- theme
  var THEMES = A.themes || [];
  function themeIsDark(id) { for (var i = 0; i < THEMES.length; i++) { if (THEMES[i].ID === id) return THEMES[i].Dark; } return true; }
  function applyTheme(id, persist) {
    var ok = false; THEMES.forEach(function (t) { if (t.ID === id) ok = true; });
    if (!ok) id = 'default';
    document.documentElement.setAttribute('data-theme', id);
    if (themeIsDark(id)) document.documentElement.classList.add('pf-v6-theme-dark'); else document.documentElement.classList.remove('pf-v6-theme-dark');
    try { sessionStorage.setItem('theme', id); if (persist) localStorage.setItem('theme', id); } catch (e) {}
    $$('[data-theme-choice]').forEach(function (b) { b.setAttribute('data-selected', b.getAttribute('data-theme-choice') === id ? 'true' : 'false'); });
    return id;
  }
  if (location.pathname !== '/login') {
    // As applyAccountTheme did: the signed-in account's theme wins over the
    // one this browser stored, and an account without one gets the default.
    if (A.user && A.user.preferred_theme) {
      applyTheme(A.user.preferred_theme, true);
    } else if (A.user) {
      try { localStorage.removeItem('theme'); } catch (e) {}
      applyTheme('default', false);
    } else {
      var stored = null;
      try { stored = sessionStorage.getItem('theme') || localStorage.getItem('theme'); } catch (e) {}
      applyTheme(stored || 'default', false);
    }
    $$('[data-theme-choice]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = applyTheme(b.getAttribute('data-theme-choice'), true);
        if (A.user && A.user.id) { api('PATCH', '/api/v2/users/' + A.user.id + '/', { preferred_theme: id }); }
      });
    });
  }

  // ---------------------------------------------------------------- dropdowns
  function closeDropdowns(except) {
    $$('[data-dropdown]').forEach(function (d) {
      if (d === except) return;
      var m = $('[data-dropdown-menu]', d), t = $('[data-dropdown-toggle]', d);
      if (m) m.hidden = true; if (t) { t.setAttribute('aria-expanded', 'false'); t.classList.remove('pf-m-expanded'); }
    });
  }
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-dropdown-toggle]');
    if (toggle) {
      var d = toggle.closest('[data-dropdown]'), m = $('[data-dropdown-menu]', d);
      var open = m && m.hidden;
      closeDropdowns(d);
      if (m) { m.hidden = !open; toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); toggle.classList.toggle('pf-m-expanded', open); }
      e.preventDefault();
      return;
    }
    if (!e.target.closest('[data-dropdown-menu]')) closeDropdowns();
    else if (e.target.closest('.pf-v6-c-menu__item')) closeDropdowns();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDropdowns(); closeModal(); closePopover(); } });

  // ---------------------------------------------------------------- navigation
  var navToggle = $('#nav-toggle');
  if (navToggle) {
    navToggle.addEventListener('click', function () {
      var sb = $('#page-sidebar'); var collapsed = sb.classList.toggle('pf-m-collapsed');
      sb.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
      navToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      saveNav();
    });
  }
  $$('[data-nav-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var li = b.closest('[data-nav-group]'); var expanded = li.classList.toggle('pf-m-expanded');
      b.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      saveNav();
    });
  });
  // The old React UI kept the sidebar alive across route changes; here each
  // page is a full load, so its state goes to sessionStorage (per tab, like
  // the old app's memory) and the inline script in layouts/app.html puts it
  // back before the first paint.
  function saveNav() {
    var sb = $('#page-sidebar'); if (!sb) return;
    var collapsed = $$('[data-nav-group]:not(.pf-m-expanded) [data-nav-toggle]').map(function (b) { return b.id.replace('pf-nav-expandable-', ''); });
    try { sessionStorage.setItem('ascender.nav', JSON.stringify({ hidden: sb.classList.contains('pf-m-collapsed'), collapsed: collapsed, scroll: sb.scrollTop })); } catch (e) {}
  }
  window.addEventListener('pagehide', saveNav);

  // ---------------------------------------------------------------- modals
  // PatternFly's Modal traps focus and starts on the first focusable
  // element, usually the close button.
  function openModal(id) {
    var m = typeof id === 'string' ? document.getElementById(id) : id;
    if (m) {
      m.hidden = false; document.body.classList.add('pf-v6-c-backdrop__open');
      var first = m.querySelector('button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    }
    return m;
  }
  function closeModal(m) {
    if (!m) { $$('[data-modal]:not([hidden])').forEach(function (x) { if (!x.hasAttribute('data-no-dismiss')) x.hidden = true; }); }
    else m.hidden = true;
    if (!$('[data-modal]:not([hidden])')) document.body.classList.remove('pf-v6-c-backdrop__open');
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open-modal]'); if (o) { openModal(o.getAttribute('data-open-modal')); return; }
    var c = e.target.closest('[data-close-modal]'); if (c) { closeModal(c.closest('[data-modal]')); }
  });
  function confirmModal(opts) {
    var root = $('#ascender-modal-root');
    var items = (opts.items || []).map(function (n) { return '<li><strong>' + esc(n) + '</strong></li>'; }).join('');
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div class="pf-v6-c-modal-box pf-m-danger pf-m-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div class="pf-v6-c-modal-box__close"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="Close" data-close-modal><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><h1 class="pf-v6-c-modal-box__title" id="confirm-title"><span class="pf-v6-c-modal-box__title-icon">' + ICON.warn + '</span><span class="pf-v6-c-modal-box__title-text">' + esc(opts.title) + '</span></h1></header><div class="pf-v6-c-modal-box__body"><div>' + esc(opts.body) + '</div><ul class="pf-v6-c-list" style="margin-top:1rem;">' + items + '</ul>' + (opts.extra || '') + '</div><footer class="pf-v6-c-modal-box__footer"><button class="pf-v6-c-button pf-m-danger" type="button" data-confirm aria-label="' + esc(t('confirm delete')) + '"><span class="pf-v6-c-button__text">' + esc(opts.confirmLabel || t('Delete')) + '</span></button><button class="pf-v6-c-button pf-m-link" type="button" data-close-modal aria-label="' + esc(t('cancel delete')) + '"><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button></footer></div></div></div>');
    root.innerHTML = ''; root.appendChild(m); openModal(m);
    $('[data-confirm]', m).addEventListener('click', function () { this.classList.add('pf-m-in-progress'); this.disabled = true; opts.onConfirm(m); });
    return m;
  }
  function errorModal(title, detail) {
    var root = $('#ascender-modal-root');
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div class="pf-v6-c-modal-box pf-m-danger pf-m-sm" role="dialog" aria-modal="true"><div class="pf-v6-c-modal-box__close"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="Close" data-close-modal><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><h1 class="pf-v6-c-modal-box__title"><span class="pf-v6-c-modal-box__title-icon">' + ICON.warn + '</span><span class="pf-v6-c-modal-box__title-text">' + esc(title) + '</span></h1></header><div class="pf-v6-c-modal-box__body"><p>' + esc(detail) + '</p></div><footer class="pf-v6-c-modal-box__footer"><button class="pf-v6-c-button pf-m-primary" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Close')) + '</span></button></footer></div></div></div>');
    root.innerHTML = ''; root.appendChild(m); openModal(m);
  }
  function toast(variant, title) {
    var g = $('#ascender-toasts'); if (!g) return;
    var li = el('<li class="pf-v6-c-alert-group__item"><div class="pf-v6-c-alert pf-m-' + variant + '" aria-label="' + esc(variant) + ' alert"><div class="pf-v6-c-alert__icon">' + (variant === 'danger' ? ICON.warn : '') + '</div><p class="pf-v6-c-alert__title">' + esc(title) + '</p></div></li>');
    g.appendChild(li); setTimeout(function () { li.remove(); }, 6000);
  }
  // credKindLabel is the type prefix a credential chip carries ("SSH: name").
  function credKindLabel(c) {
    if (!c || !c.kind) return '';
    if (c.cloud === true) return t('Cloud');
    if (c.kind === 'gpg_public_key') return t('GPG Public Key');
    if (c.kind === 'aws' || c.kind === 'ssh') return c.kind.toUpperCase();
    return String(c.kind).replace(/_/g, ' ').replace(/(^|\s)\S/g, function (ch) { return ch.toUpperCase(); });
  }
  function errorText(res) {
    var d = res && res.data; if (!d) return t('Request failed ({0}).', { 0: res && res.status });
    if (typeof d === 'string') return d;
    if (d.detail) return d.detail;
    return Object.keys(d).map(function (k) { return k + ': ' + [].concat(d[k]).join(' '); }).join(' ');
  }

  // Shared helpers for page scripts loaded after app.js (templates.js).
  window.ASCENDER = window.ASCENDER || {};
  window.ASCENDER.ui = { tOr: tOr, api: api, sessionTouch: sessionTouch, el: el, esc: esc, credKindLabel: credKindLabel, openModal: openModal, closeModal: closeModal, confirmModal: confirmModal, errorModal: errorModal, toast: toast, errorText: errorText, lookupModal: lookupModal, optionsList: optionsList, draggableSelectedList: draggableSelectedList, setTooltip: setTooltip, clearTooltip: clearTooltip, pagerNav: pagerNav, alertModal: alertModal, errorDetail: errorDetail, helperError: helperError, statusIcon: statusIcon, pad: pad, applyTheme: applyTheme, deleteUsage: deleteUsage, deleteButtonModal: deleteButtonModal, withUsage: withUsage, usageMessage: usageMessage, ICON: ICON, $: $, $$: $$ };

  // ---------------------------------------------------------------- tooltips
  // PatternFly tooltips (Tooltip) for any [data-tooltip], shown on hover
  // and on keyboard focus. The content is a template[data-tooltip-content]
  // inside the trigger when it needs markup (lines, dates to localise),
  // else the attribute's text, a line per line of it as the old content's
  // divs were. data-tooltip-pos places one (Tooltip's own default is top);
  // the workflow output's show above, the rest below.
  var tip = null, tipSeq = 0;
  function hideTip() {
    if (!tip) return;
    if (tip._for) tip._for.removeAttribute('aria-describedby');
    tip.remove(); tip = null;
  }
  function tipContent(t) {
    var tpl = $('template[data-tooltip-content]', t);
    if (tpl && tpl.parentNode === t) {
      var box = document.createElement('div');
      box.appendChild(tpl.content.cloneNode(true));
      $$('.ascender-datetime', box).forEach(function (s) { var d = new Date(s.getAttribute('data-datetime')); if (!isNaN(d)) s.textContent = d.toLocaleString(); });
      return box.innerHTML;
    }
    var text = t.getAttribute('data-tooltip') || '';
    return text.indexOf('\n') < 0 ? esc(text) : text.split('\n').map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
  }
  // setTooltip changes a trigger's text, and the tooltip's while it shows.
  function setTooltip(node, text) {
    node.setAttribute('data-tooltip', text);
    if (tip && tip._for === node) $('.pf-v6-c-tooltip__content', tip).innerHTML = tipContent(node);
  }
  // clearTooltip takes a trigger's tooltip away, closing it if it shows,
  // as a Tooltip wrapper that went from the page took its tooltip with it.
  function clearTooltip(node) {
    node.removeAttribute('data-tooltip');
    if (tip && tip._for === node) hideTip();
  }
  function showTip(t) {
    if (tip && tip._for === t) return;
    hideTip();
    var pos = t.getAttribute("data-tooltip-pos") || (t.closest("[data-wf-output]") ? "top" : "bottom");
    var id = 'pf-tooltip-' + (++tipSeq);
    tip = el('<div class="pf-v6-c-tooltip pf-m-' + pos + '" role="tooltip" id="' + id + '" style="position: fixed; z-index: 9999; pointer-events: none;"><div class="pf-v6-c-tooltip__arrow"></div><div class="pf-v6-c-tooltip__content">' + tipContent(t) + "</div></div>");
    tip._for = t;
    t.setAttribute('aria-describedby', id);
    document.body.appendChild(tip);
    // A display: contents trigger (Popper's wrapper around its child) has
    // no box of its own: it is placed by the first thing it holds that is
    // drawn (not its content template).
    var box = t;
    while (getComputedStyle(box).display === 'contents') {
      var child = Array.prototype.filter.call(box.children, function (c) { return c.tagName !== 'TEMPLATE'; })[0];
      if (!child) break;
      box = child;
    }
    var r = box.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    // Tooltip's default distance: 15px between the trigger and the box.
    var left = r.left + r.width / 2 - w / 2, top = r.bottom + 15;
    if (pos === "top") top = r.top - h - 15;
    if (pos === "left") { left = r.left - w - 15; top = r.top + r.height / 2 - h / 2; }
    if (pos === "right") { left = r.right + 15; top = r.top + r.height / 2 - h / 2; }
    tip.style.left = Math.max(4, left) + "px"; tip.style.top = Math.max(4, top) + "px";
  }
  document.addEventListener("mouseover", function (e) {
    if (tip && tip._for && !tip._for.isConnected) hideTip();
    var t = e.target.closest && e.target.closest("[data-tooltip]");
    if (t) showTip(t);
  });
  // Leaving the trigger the tooltip shows for hides it, found by the
  // tooltip rather than the attribute, which the trigger may have lost.
  document.addEventListener("mouseout", function (e) {
    if (tip && tip._for && tip._for.contains(e.target) && !tip._for.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener("focusin", function (e) {
    var t = e.target.closest && e.target.closest("[data-tooltip]");
    if (t) showTip(t);
  });
  document.addEventListener("focusout", function (e) {
    if (tip && tip._for && tip._for.contains(e.target) && !tip._for.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener("keydown", function (e) { if (e.key === 'Escape') hideTip(); });
  // A click elsewhere hides it. One on the trigger leaves it showing, as
  // Tooltip stayed while the pointer did (a toggle's new text shows at
  // once), unless the click took the trigger off the page.
  document.addEventListener("click", function (e) {
    if (!tip) return;
    if (tip._for && tip._for.contains(e.target)) {
      setTimeout(function () { if (tip && tip._for && !tip._for.isConnected) hideTip(); }, 0);
      return;
    }
    hideTip();
  }, true);

  // ---------------------------------------------------------------- logout
  $$('[data-logout]').forEach(function (b) { b.addEventListener('click', function () { api('POST', '/api/logout/').then(function (res) { try { sessionStorage.clear(); } catch (e) {} window.location.href = (res && res.data && res.data.logout_url) ? res.data.logout_url : '/login'; }); }); });

  // ---------------------------------------------------------------- session timeout
  (function () {
    var total = parseInt(A.sessionTimeout || 0, 10);
    if (!total || !A.user) return;
    var warn = 10, timer, interval;
    session.expiresAt = Date.now() + total * 1000;
    try { localStorage.setItem(SESSION_KEY, String(session.expiresAt)); } catch (e) {}
    function schedule() {
      clearTimeout(timer); clearInterval(interval);
      var modal = $('#session-modal');
      if (modal && !modal.hidden && session.expiresAt - Date.now() > warn * 1000) closeModal(modal);
      var ms = session.expiresAt - Date.now() - warn * 1000;
      if (ms > 2147483647) ms = 2147483647;
      timer = setTimeout(function () {
        openModal('session-modal'); var c = $('#session-countdown');
        interval = setInterval(function () {
          var left = Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)); if (c) c.textContent = t('{sessionCountdown, plural, one {You will be logged out in # second due to inactivity} other {You will be logged out in # seconds due to inactivity}}', { sessionCountdown: left });
          // Out of time: log out, as the old Session context did, and say so on
          // the login page. Only going there would leave the session to the
          // server's own deadline, which a request made in that last second
          // (the login page's own among them) puts off again. The single
          // sign on stays: an idle timeout does not end it everywhere else.
          if (left <= 0) {
            clearInterval(interval);
            var to = '/login?expired=1&next=' + encodeURIComponent(location.pathname + location.search);
            try { sessionStorage.clear(); } catch (e) {}
            fetch('/api/logout/', { method: 'POST', credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-CSRFToken': csrf } })
              .then(function () { window.location.href = to; }, function () { window.location.href = to; });
          }
        }, 500);
      }, Math.max(ms, 0));
    }
    session.schedule = schedule;
    // Another tab's request moved the deadline.
    window.addEventListener('storage', function (e) {
      if (e.key !== SESSION_KEY || !e.newValue) return;
      var at = Number(e.newValue);
      if (at && at !== session.expiresAt) { session.expiresAt = at; schedule(); }
    });
    $$('[data-session-continue]').forEach(function (b) { b.addEventListener('click', function () { api('GET', '/api/v2/me/'); }); });
    schedule();
  })();

  // ---------------------------------------------------------------- dates
  $$('.ascender-datetime').forEach(function (s) { var d = new Date(s.getAttribute('data-datetime')); if (!isNaN(d)) s.textContent = d.toLocaleString(); });
  // Event timestamps in job output are HH:MM:SS in the browser's zone.
  $$('[data-time]').forEach(function (s) { var d = new Date(s.getAttribute('data-time')); if (!isNaN(d)) { var p2 = function (n) { return n < 10 ? '0' + n : '' + n; }; s.textContent = p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); } });

  // ---------------------------------------------------------------- copy to clipboard
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    if (navigator.clipboard) navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () { toast('success', t('Successfully copied to clipboard!')); });
  });

  // ---------------------------------------------------------------- popovers
  var popover = null;
  function closePopover() { if (popover) { popover.remove(); popover = null; } }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-popover]');
    if (!b) { if (!e.target.closest('.ascender-popover')) closePopover(); return; }
    e.preventDefault();
    if (popover && popover._anchor === b) { closePopover(); return; }
    closePopover();
    popover = el('<div class="pf-v6-c-popover pf-m-bottom ascender-popover" role="dialog" aria-modal="true"><div class="pf-v6-c-popover__arrow"></div><div class="pf-v6-c-popover__content"><div class="pf-v6-c-popover__close"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="Close" data-popover-close><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></div>' + (b.getAttribute('data-popover-header') ? '<header class="pf-v6-c-popover__header"><div class="pf-v6-c-popover__title"><h6 class="pf-v6-c-popover__title-text">' + esc(b.getAttribute('data-popover-header')) + '</h6></div></header>' : '') + '<div class="pf-v6-c-popover__body">' + (b.hasAttribute('data-popover-html') ? b.getAttribute('data-popover-html') : esc(b.getAttribute('data-popover'))) + '</div></div></div>');
    popover._anchor = b;
    document.body.appendChild(popover);
    var r = b.getBoundingClientRect();
    var w = popover.offsetWidth;
    var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + window.scrollX + r.width / 2 - w / 2));
    popover.style.left = left + 'px'; popover.style.top = (r.bottom + window.scrollY + 8) + 'px';
    $('[data-popover-close]', popover).addEventListener('click', closePopover);
  });

  // ---------------------------------------------------------------- expandables
  // Expandable alerts and form field groups (Alert isExpandable,
  // FormFieldGroupExpandable): the toggle flips pf-m-expanded and the body.
  $$('[data-expandable-alert-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.closest('[data-expandable-alert]'), open = !a.classList.contains('pf-m-expanded');
      a.classList.toggle('pf-m-expanded', open); b.setAttribute('aria-expanded', open ? 'true' : 'false');
      var body = $('[data-expandable-alert-body]', a); if (body) body.hidden = !open;
    });
  });
  $$('[data-field-group-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var g = b.closest('[data-field-group-expandable]'), open = !g.classList.contains('pf-m-expanded');
      g.classList.toggle('pf-m-expanded', open); b.setAttribute('aria-expanded', open ? 'true' : 'false');
      var body = $('.pf-v6-c-form__field-group-body', g); if (body) body.hidden = !open;
    });
  });
  // ClipboardCopy and code block copy buttons.
  function copyText(b, text, done) {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    var t = b.getAttribute('data-tooltip'); setTooltip(b, done); showTip(b);
    setTimeout(function () { setTooltip(b, t); }, 1500);
  }
  $$('[data-copy-input]').forEach(function (b) {
    b.addEventListener('click', function () { copyText(b, $('input', b.closest('.pf-v6-c-clipboard-copy')).value, t('Copied')); });
  });
  $$('[data-copy-code]').forEach(function (b) {
    b.addEventListener('click', function () { copyText(b, $('code', b.closest('.pf-v6-c-code-block')).textContent, t('Successfully copied to clipboard!')); });
  });

  // ---------------------------------------------------------------- tab accent
  // PatternFly 6 draws the current tab's underline from two custom
  // properties that the React Tabs component set from the tab's geometry.
  function placeTabAccent(tabs) {
    // Same measurements as Tabs.setAccentStyles: the item's offsetLeft and
    // offsetWidth.
    var cur = $('.pf-v6-c-tabs__item.pf-m-current', tabs);
    if (!cur) return;
    tabs.style.setProperty('--pf-v6-c-tabs--link-accent--length', cur.offsetWidth + 'px');
    tabs.style.setProperty('--pf-v6-c-tabs--link-accent--start', cur.offsetLeft + 'px');
  }
  // Placements outside a click (first paint, fonts arriving) skip the slide
  // animation, as Tabs did with pf-m-initializing-accent.
  function initTabAccent(tabs) {
    tabs.classList.add('pf-m-initializing-accent');
    placeTabAccent(tabs);
    setTimeout(function () { tabs.classList.remove('pf-m-initializing-accent'); }, 0);
  }
  // Tabs that overflow their row get PatternFly's scroll buttons
  // (Tabs.handleScrollButtons, scrollBack and scrollForward).
  function tabInView(list, item) {
    var c = list.getBoundingClientRect(), r = item.getBoundingClientRect();
    return Math.ceil(r.left) >= Math.ceil(c.left) && Math.floor(r.right) <= Math.floor(c.right);
  }
  function syncTabScroll(tabs) {
    var list = $('.pf-v6-c-tabs__list', tabs), tpl = $('template[data-tabs-scroll]', tabs);
    if (!list || !tpl || !list.children.length) return;
    var left = !tabInView(list, list.firstElementChild), right = !tabInView(list, list.lastElementChild);
    var back = $('[data-tabs-back]', tabs), fwd = $('[data-tabs-forward]', tabs);
    if ((left || right) && !back) {
      var frag = tpl.content.cloneNode(true), divs = frag.querySelectorAll('.pf-v6-c-tabs__scroll-button');
      tabs.insertBefore(divs[0], list); tabs.insertBefore(divs[1], list.nextSibling);
      tabs.classList.add('pf-m-scrollable');
      back = $('[data-tabs-back]', tabs); fwd = $('[data-tabs-forward]', tabs);
      back.addEventListener('click', function () {
        var items = Array.prototype.slice.call(list.children), prev = null;
        for (var i = 0; i < items.length; i++) { if (tabInView(list, items[i])) { prev = items[i - 1]; break; } }
        if (prev) list.scrollLeft -= prev.scrollWidth;
      });
      fwd.addEventListener('click', function () {
        var items = Array.prototype.slice.call(list.children), next = null;
        for (var i = items.length - 1; i >= 0; i--) { if (tabInView(list, items[i])) { next = items[i + 1]; break; } }
        if (next) list.scrollLeft += next.scrollWidth;
      });
      left = !tabInView(list, list.firstElementChild); right = !tabInView(list, list.lastElementChild);
    } else if (!left && !right && back) {
      tabs.removeChild(back.parentNode); tabs.removeChild(fwd.parentNode); tabs.classList.toggle('pf-m-scrollable', false); return;
    }
    if (back) { back.disabled = !left; back.setAttribute('aria-hidden', left ? 'false' : 'true'); fwd.disabled = !right; fwd.setAttribute('aria-hidden', right ? 'false' : 'true'); }
  }
  var accentTabs = $$('.pf-v6-c-tabs.pf-m-animate-current');
  accentTabs.forEach(function (tabs) {
    syncTabScroll(tabs);
    var list = $('.pf-v6-c-tabs__list', tabs); if (list) list.addEventListener('scroll', function () { syncTabScroll(tabs); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { accentTabs.forEach(syncTabScroll); });
  window.addEventListener('resize', function () { accentTabs.forEach(syncTabScroll); });
  accentTabs.forEach(initTabAccent);
  // Text widths change once the web fonts load.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { accentTabs.forEach(initTabAccent); });
  window.addEventListener('resize', function () { accentTabs.forEach(placeTabAccent); });

  // ---------------------------------------------------------------- tabs (in-page)
  $$('[data-tabs]').forEach(function (tabs) {
    var card = tabs.parentElement;
    $$('[data-tab]', tabs).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = btn.getAttribute('data-tab');
        $$('[data-tab]', tabs).forEach(function (b) { b.closest('.pf-v6-c-tabs__item').classList.toggle('pf-m-current', b === btn); b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
        $$('[data-tab-panel]', card).forEach(function (p) { p.hidden = p.getAttribute('data-tab-panel') !== idx; });
        placeTabAccent(tabs);
      });
    });
  });

  // ---------------------------------------------------------------- search toolbar
  $$('[data-search-form]').forEach(function (form) {
    var input = $('[data-search-input]', form), submit = $('[data-search-submit]', form), wrap = $('[data-search-submit-wrapper]', form), label = $('[data-search-key-label]', form);
    var ns = form.getAttribute('data-ns');
    function update() { var empty = !input.value.trim(); submit.disabled = empty; if (wrap) wrap.classList.toggle('ascender-search__submit-button-wrapper--disabled', empty); }
    input.addEventListener('input', update); update();
    // A date key (qsConfig.dateFields) searches with a date input and an
    // operator, On or after (__gte) or Before (__lt), kept between keys.
    var textGroup = input.closest('.pf-v6-c-input-group'), dateGroup = $('[data-search-date-group]', form);
    var dateInput = dateGroup && $('[data-search-date-input]', dateGroup), dateSubmit = dateGroup && $('[data-date-submit]', dateGroup);
    var dateOp = 'gte', dateKey = null;
    function updateDate() { var empty = !dateInput.value; dateSubmit.disabled = empty; $('[data-date-submit-wrapper]', dateGroup).classList.toggle('ascender-search__submit-button-wrapper--disabled', empty); }
    if (dateGroup) {
      dateInput.addEventListener('input', updateDate); dateInput.addEventListener('change', updateDate);
      $$('[data-date-operator]', dateGroup).forEach(function (o) {
        o.addEventListener('click', function () { dateOp = o.getAttribute('data-date-operator'); $('[data-date-operator-label]', dateGroup).textContent = o.textContent.trim(); });
      });
    }
    // Advanced is advanced-search.js's.
    $$('[data-search-key]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-search-key') === 'advanced') return;
        input.name = b.getAttribute('data-search-key'); if (label) label.textContent = b.textContent;
        input.value = ''; update();
        dateKey = b.hasAttribute('data-search-date') && dateGroup ? input.name : null;
        if (dateGroup) { dateGroup.hidden = !dateKey; textGroup.hidden = !!dateKey; dateInput.value = ''; updateDate(); }
        // A key with options shows its Filter By select instead.
        var optGroup = null;
        optGroups.forEach(function (g) { var on = g.getAttribute('data-search-options') === input.name; g.hidden = !on; if (on) optGroup = g; });
        if (optGroup) { textGroup.hidden = true; if (dateGroup) dateGroup.hidden = true; $('[data-dropdown-toggle]', optGroup).focus(); return; }
        (dateKey ? dateInput : input).focus();
      });
    });
    // Checking an option adds its value to the search, unchecking removes
    // it (handleFilterDropdownSelect).
    var optGroups = $$('[data-search-options]', form);
    optGroups.forEach(function (g) {
      var name = (ns ? ns + '.' : '') + g.getAttribute('data-search-options');
      $$('[data-search-option]', g).forEach(function (box) {
        box.addEventListener('change', function () {
          var params = new URLSearchParams(location.search), vals = params.getAll(name);
          params.delete('page'); params.delete(name);
          vals = box.checked ? vals.concat([box.value]) : vals.filter(function (v) { return v !== box.value; });
          vals.forEach(function (v) { params.append(name, v); });
          location.search = params.toString();
        });
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var key = dateKey ? dateKey + '__' + dateOp : input.name, value = dateKey ? dateInput.value : input.value.trim();
      if (!value) return;
      var params = new URLSearchParams(location.search);
      params.delete('page');
      params.append((ns ? ns + '.' : '') + key, value);
      location.search = params.toString();
    });
  });
  $$('[data-page-input]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var params = new URLSearchParams(location.search); params.set('page', inp.value); location.search = params.toString();
    });
  });

  // ---------------------------------------------------------------- navigation buttons
  // Buttons that navigated through the router (filter chips, Clear all
  // filters) carry their destination.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button[data-href]');
    if (b && !b.closest('[data-topology-tooltip]')) location.href = b.getAttribute('data-href');
  });

  // ---------------------------------------------------------------- table rows
  $$('[data-list-table]').forEach(function (table) {
    var rows = $$('[data-select-row]', table), all = $('[data-select-all]'), del = $('[data-delete-selected]');
    function sync() {
      var sel = rows.filter(function (r) { return r.checked; });
      // DataListToolbar's select-all is checked or not, never indeterminate.
      if (all) all.checked = rows.length > 0 && sel.length === rows.length;
      if (del) {
        var blocked = sel.filter(function (r) { return r.hasAttribute('data-no-delete'); });
        del.disabled = sel.length === 0 || blocked.length > 0;
        var tipHolder = del.parentNode;
        if (tipHolder && tipHolder.hasAttribute('data-tooltip')) {
          var names = blocked.map(function (r) { return r.closest('[data-row]').getAttribute('data-name'); }).join(', ');
          // data-delete-nouns: the translated plural noun search_toolbar
          // gives; data-delete-denied: a list's own message, before the names.
          var kind = del.getAttribute('data-delete-kind') || 'Item';
          var plural = del.getAttribute('data-delete-nouns') || t(del.getAttribute('data-delete-plural') || (/y$/.test(kind) ? kind.slice(0, -1) + 'ies' : kind + 's'));
          var denied = del.getAttribute('data-delete-denied');
          tipHolder.setAttribute('data-tooltip', blocked.length ? (denied ? tOr(denied + ' {itemsUnableToDelete}', 'You do not have permission to delete {pluralizedItemName}: {itemsUnableToDelete}', { pluralizedItemName: plural, itemsUnableToDelete: names }) : t('You do not have permission to delete {pluralizedItemName}: {itemsUnableToDelete}', { pluralizedItemName: plural, itemsUnableToDelete: names })) : sel.length ? t('Delete') : t('Select a row to delete'));
        }
      }
    }
    rows.forEach(function (r) { r.addEventListener('change', sync); });
    if (all) all.addEventListener('change', function () { rows.forEach(function (r) { r.checked = all.checked; }); sync(); });
    if (del) del.addEventListener('click', function () {
      var sel = rows.filter(function (r) { return r.checked; }).map(function (r) { return r.closest('[data-row]'); });
      if (del.hasAttribute('data-group-delete')) {
        groupDeleteModal(sel.map(function (r) { return { id: r.getAttribute('data-id'), name: r.getAttribute('data-name') }; }), del.getAttribute('data-group-delete'), function (failure) {
          if (failure) groupDeleteFailed(failure, function () { location.reload(); }); else location.reload();
        });
        return;
      }
      var kind = del.getAttribute('data-delete-kind'), base = del.getAttribute('data-api');
      // The title's noun: search_toolbar's translated data-delete-noun(s),
      // or the kind as the template gave it.
      var noun = sel.length > 1 ? (del.getAttribute('data-delete-nouns') || kind + 's') : (del.getAttribute('data-delete-noun') || kind);
      // ToolbarDeleteButton counted what uses a single selected row; for
      // several it gave only its message. data-usage-warning is a message
      // shown whatever is selected (warningMessage).
      var usageKind = del.getAttribute('data-usage-kind');
      function counted(done) {
        if (!usageKind || sel.length !== 1) { done(null); return; }
        del.disabled = true; del.classList.add('pf-m-in-progress');
        deleteUsage(usageKind, sel[0].getAttribute('data-id')).then(function (u) {
          del.disabled = false; del.classList.remove('pf-m-in-progress'); done(u.length ? u : null);
        }, function (r) { del.disabled = false; del.classList.remove('pf-m-in-progress'); usageError(r); });
      }
      counted(function (usage) {
        var msgs = [], warn = del.getAttribute('data-usage-warning');
        if (warn) msgs.push(t(warn, { 0: sel.length }));
        if (usageKind && (usage || sel.length > 1)) msgs.push(usageMessage(del, sel.length));
        var extra = msgs.length || usage ? '<div class="pf-v6-c-alert pf-m-inline pf-m-warning ascender-toolbar-delete-button__warning-message"><div class="pf-v6-c-alert__icon">' + WARN_ICON + '</div><h4 class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">Warning alert:</span><div>' +
          msgs.map(function (x) { return '<div aria-label="' + esc(x) + '">' + esc(x) + '</div>'; }).join('') +
          (usage || []).map(function (u) { return '<div aria-label="' + esc(u[0] + ': ' + u[1]) + '"><span class="ascender-toolbar-delete-button__label">' + esc(u[0]) + '</span><span class="pf-v6-c-badge pf-m-unread">' + esc(String(u[1])) + '</span></div>'; }).join('') + '</div></h4></div>' : '';
        var m = confirmModal({ title: t('Delete {pluralizedItemName}?', { pluralizedItemName: noun }), body: t('This action will delete the following:'), items: sel.map(function (r) { return r.getAttribute('data-name'); }), extra: extra, onConfirm: function (m) {
          // A row of a mixed list (jobs, templates) names its own endpoint.
          Promise.all(sel.map(function (r) { return api('DELETE', r.getAttribute('data-api') || base + r.getAttribute('data-id') + '/'); })).then(function (results) {
            var failed = results.filter(function (r) { return !r.ok; });
            closeModal(m);
            if (failed.length) errorModal(t('Error!'), t(['Failed to delete one or more ', kind.toLowerCase(), 's.'].join('')) + ' ' + errorText(failed[0])); else location.reload();
          });
        } });
        // A credential type in use cannot be deleted.
        if (usage && del.hasAttribute('data-usage-blocks')) $('[data-confirm]', m).disabled = true;
      });
    });
    sync();
    $$('[data-expand-row]', table).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-row]'), exp = row.nextElementSibling; var open = exp.hidden; exp.hidden = !open;
        // Tr isExpanded marked the expandable row, which PatternFly hides
        // without pf-m-expanded; the parent row kept its plain class.
        b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.closest('.pf-v6-c-table__toggle').classList.toggle('pf-m-expanded', open); exp.classList.toggle('pf-m-expanded', open);
      });
    });
    var expandAll = $('[data-expand-all]');
    if (expandAll) expandAll.addEventListener('click', function () {
      var anyClosed = $$('[data-expanded-row]', table).some(function (r) { return r.hidden; });
      $$('[data-expanded-row]', table).forEach(function (r) { r.hidden = !anyClosed; r.classList.toggle('pf-m-expanded', anyClosed); });
      $$('[data-expand-row]', table).forEach(function (b) { b.setAttribute('aria-expanded', anyClosed ? 'true' : 'false'); b.closest('.pf-v6-c-table__toggle').classList.toggle('pf-m-expanded', anyClosed); });
    });
  });
  // ---------------------------------------------------------------- delete warnings
  // relatedResourceDeleteRequests (util/getRelatedResourceDeleteDetails.ts):
  // what still uses an object, counted when its delete is confirmed. Each
  // entry is a label and either an API list (only its count is read) or a
  // function that resolves to a count.
  var DELETE_USAGE = {
    credential: function (id) { return [['Job Templates', 'job_templates/?credentials=' + id], ['Projects', 'projects/?credentials=' + id], ['Inventory Sources', 'inventory_sources/?credentials__id=' + id], ['Credential Input Sources', 'credential_input_sources/?source_credential=' + id], ['Execution Environments', 'execution_environments/?credential=' + id]]; },
    credentialType: function (id) { return [['Credentials', 'credentials/?credential_type__id=' + id]]; },
    inventory: function (id) { return [['Job Templates', 'job_templates/?inventory=' + id], ['Workflow Job Templates', 'workflow_job_templates/?inventory=' + id]]; },
    inventorySource: function (id) { return [['Workflow Job Template Nodes', 'workflow_job_template_nodes/?unified_job_template=' + id], ['Groups', 'inventory_sources/' + id + '/groups/'], ['Hosts', 'inventory_sources/' + id + '/hosts/']]; },
    // The old request counted the project's workflow nodes under this label.
    project: function (id) { return [['Job Templates', 'job_templates/?project=' + id], ['Workflow Job Templates', 'workflow_job_template_nodes/?unified_job_template=' + id], ['Inventory Sources', 'inventory_sources/?source_project=' + id]]; },
    template: function (id) { return [['Workflow Job Template Nodes', 'workflow_job_template_nodes/?unified_job_template=' + id]]; },
    organization: function (id) {
      return ['credentials', 'teams', 'notification_templates', 'execution_environments', 'projects', 'inventories', 'applications'].map(function (c, i) {
        return [['Credentials', 'Teams', 'Notification Templates', 'Execution Environments', 'Projects', 'Inventories', 'Applications'][i], c + '/?organization=' + id];
      });
    },
    executionEnvironment: function (id) {
      return [['Templates', 'unified_job_templates/?execution_environment=' + id], ['Projects', 'projects/?default_environment=' + id], ['Organizations', 'organizations/?default_environment=' + id],
        ['Workflow Job Template Nodes', function () {
          // The nodes that run an inventory source using the environment.
          return usageGet('inventory_sources/?execution_environment=' + id, true).then(function (d) {
            return Promise.all((d.results || []).map(function (s) { return usageGet('workflow_job_template_nodes/?unified_job_template=' + s.id); })).then(function (ds) {
              return ds.reduce(function (n, x) { return n + (x.count || 0); }, 0);
            });
          });
        }]];
    },
    instanceGroup: function (id) { return [['Organizations', 'organizations/?instance_groups=' + id], ['Inventories', 'inventories/?instance_groups=' + id], ['Templates', 'unified_job_templates/?instance_groups=' + id]]; }
  };
  function usageGet(path, all) {
    return api('GET', '/api/v2/' + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'page_size=' + (all ? 200 : 1)).then(function (r) {
      if (!r.ok) throw r;
      return r.data || {};
    });
  }
  // deleteUsage resolves to the [label, count] pairs with a count, or
  // rejects with the response of the request that failed.
  function deleteUsage(kind, id) {
    var reqs = DELETE_USAGE[kind] ? DELETE_USAGE[kind](id) : [];
    return Promise.all(reqs.map(function (q) {
      return typeof q[1] === 'function' ? q[1]() : usageGet(q[1]).then(function (d) { return d.count || 0; });
    })).then(function (counts) {
      return reqs.map(function (q, i) { return [t(q[0]), counts[i]]; }).filter(function (u) { return u[1] > 0; });
    });
  }
  // usageMessage is the warning a delete button or list toolbar gives
  // for n objects: data-usage-one/-other as the template translated them,
  // or data-usage-message, a plural message for the count.
  function usageMessage(b, n) {
    if (b.hasAttribute('data-usage-one')) return b.getAttribute(n === 1 ? 'data-usage-one' : 'data-usage-other');
    var m = b.getAttribute('data-usage-message');
    return m ? t(m, { 0: n }) : '';
  }
  // A failed count is reported as the old buttons did, in its own modal.
  function usageError(r) { errorModal(t('Error!'), errorText(r)); }

  // DeleteButton: "Are you sure you want to delete:", the name, and what
  // still uses the object, counted when the button is pressed.
  var DANGER_ICON = '<svg class="pf-v6-svg" fill="currentColor" aria-hidden="true" role="img" width="1em" height="1em" style="color: var(--pf-t--global--color--status--danger--default);"><svg viewBox="0 0 512 512" class="pf-v6-icon-default"><path d="M504 256c0 136.997-111.043 248-248 248S8 392.997 8 256C8 119.083 119.043 8 256 8s248 111.083 248 248zm-248 50c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z"></path></svg><svg viewBox="0 0 32 32" class="pf-v6-icon-rh-ui"><path d="M16 1C7.729 1 1 7.729 1 16s6.729 15 15 15 15-6.729 15-15S24.271 1 16 1Zm-1.5 8a1.5 1.5 0 1 1 3 0v7a1.5 1.5 0 1 1-3 0V9ZM16 25.001a2 2 0 1 1-.001-3.999A2 2 0 0 1 16 25.001Z"></path></svg></svg>';
  var WARN_ICON = '<svg class="pf-v6-svg" fill="currentColor" viewBox="0 0 32 32" aria-hidden="true" role="img" width="1em" height="1em"><path d="m31.874 28.514-15.011-27a1.001 1.001 0 0 0-1.748 0l-15.011 27A1 1 0 0 0 .978 30H31a1 1 0 0 0 .874-1.486ZM14.5 12a1.5 1.5 0 0 1 3 0v5a1.5 1.5 0 0 1-3 0v-5ZM16 26.001a2 2 0 1 1-.001-3.999A2 2 0 0 1 16 26.001Z"></path></svg>';
  function deleteButtonModal(opts) {
    var warning = '';
    if (opts.usage && opts.usage.length) {
      warning = '<div class="pf-v6-c-alert pf-m-inline pf-m-warning"><div class="pf-v6-c-alert__icon">' + WARN_ICON + '</div><h4 class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">Warning alert:</span><div><div aria-label="' + esc(opts.message) + '">' + esc(opts.message) + '</div><br>' +
        opts.usage.map(function (u) { return '<div aria-label="' + esc(u[0] + ': ' + u[1]) + '"><span class="ascender-delete-button__warning-message ascender-delete-button__label">' + esc(u[0]) + '</span> <span class="pf-v6-c-badge pf-m-unread">' + esc(String(u[1])) + '</span></div>'; }).join('') + '</div></h4></div>';
    }
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(t('Alert modal')) + '" aria-labelledby="alert-modal-header-label" aria-modal="true" class="pf-v6-c-modal-box pf-m-sm"><div class="pf-v6-c-modal-box__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-close-modal><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><div class="ascender-alert-modal__header">' + DANGER_ICON + '<h2 id="alert-modal-header-label" class="pf-v6-c-title pf-m-2xl">' + esc(opts.title) + '</h2></div></header><div class="pf-v6-c-modal-box__body">' + esc(t('Are you sure you want to delete:')) + '<br><strong>' + esc(opts.name) + '</strong>' + warning + '</div><footer class="pf-v6-c-modal-box__footer"><button aria-label="' + esc(t('Confirm Delete')) + '" class="pf-v6-c-button pf-m-danger" type="button" data-confirm><span class="pf-v6-c-button__text">' + esc(t('Delete')) + '</span></button><button aria-label="' + esc(t('Cancel')) + '" class="pf-v6-c-button pf-m-link" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button></footer></div></div></div>');
    var root = $('#ascender-modal-root');
    root.innerHTML = ''; root.appendChild(m); openModal(m);
    $('[data-confirm]', m).addEventListener('click', function () { this.disabled = true; opts.onConfirm(m); });
    return m;
  }
  // withUsage counts what uses the button's object (data-usage-kind and
  // data-usage-id) while the button shows its progress, then calls done
  // with the counts; without a kind it calls done at once.
  function withUsage(b, done) {
    var kind = b.getAttribute('data-usage-kind');
    if (!kind) { done([]); return; }
    b.disabled = true; b.classList.add('pf-m-in-progress');
    deleteUsage(kind, b.getAttribute('data-usage-id')).then(function (usage) {
      b.disabled = false; b.classList.remove('pf-m-in-progress'); done(usage);
    }, function (r) { b.disabled = false; b.classList.remove('pf-m-in-progress'); usageError(r); });
  }
  $$('[data-delete-button]').forEach(function (b) {
    b.addEventListener('click', function () {
      withUsage(b, function (usage) {
        deleteButtonModal({ title: b.getAttribute('data-title'), name: b.getAttribute('data-name'), usage: usage, message: usageMessage(b, 1), onConfirm: function (m) {
          b.disabled = true;
          api('DELETE', b.getAttribute('data-api')).then(function (r) {
            closeModal(m);
            if (r.ok) { location.href = b.getAttribute('data-redirect'); return; }
            b.disabled = false;
            errorModal(t('Error!'), (b.getAttribute('data-error') || t('Failed to delete.')) + ' ' + errorText(r));
          });
        } });
      });
    });
  });

  $$('[data-delete-one]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.hasAttribute('data-group-delete')) {
        groupDeleteModal([{ id: b.getAttribute('data-id'), name: b.getAttribute('data-name') }], b.getAttribute('data-group-delete'), function () { location.href = b.getAttribute('data-redirect'); });
        return;
      }
      // The title and error are the old screens' messages, composed from
      // the kind ("Delete Host", "Failed to delete host."), unless the
      // template gives its translated title (data-delete-title).
      var kind = b.getAttribute('data-delete-kind');
      confirmModal({ title: b.getAttribute('data-delete-title') || tOr('Delete ' + kind, 'Delete'), body: t('This action will delete the following:'), items: [b.getAttribute('data-name')], onConfirm: function (m) {
        api('DELETE', b.getAttribute('data-api')).then(function (r) { closeModal(m); if (r.ok) location.href = b.getAttribute('data-redirect'); else errorModal(t('Error!'), t(['Failed to delete ', kind.toLowerCase(), '.'].join('')) + ' ' + errorText(r)); });
      } });
    });
  });
  $$('[data-project-sync]').forEach(function (b) {
    b.addEventListener('click', function () {
      api('POST', '/api/v2/projects/' + b.getAttribute('data-project-sync') + '/update/').then(function (r) {
        // ProjectSyncButton raised no alert; the status shows the update.
        if (r.ok) location.reload(); else errorModal(t('Project Sync Error'), errorText(r));
      });
    });
  });
  // timeOfDay is the old UI's (util/dates.ts): luxon's
  // toFormat('hh:mm:ss:ms a'), which formats in en-US whatever the
  // browser's locale. "ms" is two tokens, the minute and the second
  // unpadded, not milliseconds: 03:07:09:79 PM.
  function timeOfDay() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    return pad(h % 12 === 0 ? 12 : h % 12) + ':' + pad(m) + ':' + pad(s) + ':' + m + s + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  $$('[data-copy-resource]').forEach(function (b) {
    b.addEventListener('click', function () {
      api('POST', b.getAttribute('data-copy-resource'), { name: b.getAttribute('data-copy-name') + ' @ ' + timeOfDay() }).then(function (r) {
        // Each list's CopyButton had its own errorMessage (data-copy-error).
        if (r.ok) location.reload(); else errorModal(t('Error!'), (b.getAttribute('data-copy-error') || t('Failed to copy.')) + ' ' + errorText(r));
      });
    });
  });

  // ---------------------------------------------------------------- forms
  $$('form[data-validate]').forEach(function (form) {
    // A required lookup marked missing clears once a value is picked, as
    // Formik validated the field again on change.
    form.addEventListener('change', function (e) {
      var id = e.target, group = id && id.matches && id.matches('[data-lookup-id]') && id.closest('.pf-v6-c-form__group');
      var name = group && $('input[data-lookup-name][data-required]', group);
      if (name && $('.ascender-client-error', group)) checkRequired(name);
    });
    form.addEventListener('submit', function (e) {
      var bad = false;
      $$('[required], [data-required]', form).forEach(function (inp) { if (checkRequired(inp)) bad = true; });
      if (bad) { e.preventDefault(); }
    });
    // checkRequired marks a required control missing, or clears the mark,
    // and says whether it is missing.
    function checkRequired(inp) {
      if (inp.disabled || inp.closest('[hidden]')) return false;
      var ctl = inp.closest('.pf-v6-c-form-control'); var group = inp.closest('.pf-v6-c-form__group');
      var missing = !inp.value.trim();
      if (inp.hasAttribute('data-lookup-name')) { missing = !$('[data-lookup-id]', group).value; }
      // FormGroup's error state: the control's status icon and the helper
      // text under it, inside the group's control column.
      // data-error-text-only: a control the old form left unmarked,
      // showing only the message (UserTokenForm's scope).
      if (ctl && !inp.hasAttribute('data-error-text-only')) {
        ctl.classList.toggle('pf-m-error', missing);
        inp.setAttribute('aria-invalid', missing ? 'true' : 'false');
        var status = $('.ascender-client-status', ctl);
        if (missing && !status) {
          var utils = $('.pf-v6-c-form-control__utilities', ctl);
          if (!utils) { utils = el('<span class="pf-v6-c-form-control__utilities"></span>'); ctl.appendChild(utils); }
          utils.insertBefore(el('<span class="pf-v6-c-form-control__icon pf-m-status ascender-client-status">' + ICON.error + '</span>'), utils.firstChild);
        } else if (!missing && status) {
          var u = status.parentNode; u.removeChild(status);
          if (!u.children.length) u.parentNode.removeChild(u);
        }
      }
      var holder = $('.pf-v6-c-form__group-control', group) || group;
      var help = $('.ascender-client-error', group);
      if (missing && !help) { holder.appendChild(el('<div class="pf-v6-c-form__helper-text ascender-client-error"><div class="pf-v6-c-helper-text"><div class="pf-v6-c-helper-text__item pf-m-error"><span class="pf-v6-c-helper-text__item-icon">' + ICON.error + '</span><span class="pf-v6-c-helper-text__item-text">' + esc(inp.hasAttribute('data-lookup-name') ? t('Select a value for this field') : (inp.getAttribute('data-required-message') || t('This field must not be blank'))) + '<span class="pf-v6-screen-reader">: error status;</span></span></div></div></div>')); }
      else if (!missing && help) help.parentNode.removeChild(help);
      return missing;
    }
  });
  // Project form: sub-forms follow the SCM type.
  $$('form[data-project-form]').forEach(function (form) {
    var sel = $('[data-scm-type]', form);
    function show() {
      var t = sel.value;
      $$('[data-subform]', form).forEach(function (s) {
        var on = s.getAttribute('data-subform') === t; s.hidden = !on;
        $$('input,select', s).forEach(function (i) { i.disabled = !on; });
      });
      var wh = $('[data-subform="' + t + '"] [data-webhook-details]', form);
      if (wh) { var en = $('input[name=enable_webhook]', $('[data-subform="' + t + '"]', form)); var showWh = en && en.checked; wh.hidden = !showWh; $$('input,select', wh).forEach(function (i) { i.disabled = !showWh; }); }
      var details = $('[data-subform="' + t + '"] [data-option-details]', form);
      if (details) { var uol = $('input[name=scm_update_on_launch]', $('[data-subform="' + t + '"]', form)); var showDetails = uol && uol.checked; details.hidden = !showDetails; $$('input', details).forEach(function (i) { i.disabled = !showDetails; }); }
      var ee = $('#execution-environments', form); var eeGroup = ee && ee.closest('[data-lookup]');
    }
    sel.addEventListener('change', show);
    $$('input[name=scm_update_on_launch], input[name=enable_webhook]', form).forEach(function (c) { c.addEventListener('change', show); });
    $$('[data-webhook-service]', form).forEach(function (sel2) { sel2.addEventListener('change', function () { var url = $('[data-webhook-url]', sel2.closest('[data-webhook-details]')); if (url && url.getAttribute('data-project-id')) url.value = url.getAttribute('data-origin') + '/api/v2/projects/' + url.getAttribute('data-project-id') + '/' + sel2.value + '/'; }); });
    $$('[data-webhook-key-refresh]', form).forEach(function (b) { b.addEventListener('click', function () { api('POST', b.getAttribute('data-webhook-key-refresh')).then(function (r) { if (r.ok) { var inp = $('input[name=webhook_key]', b.closest('[data-webhook-details]')); if (inp) inp.value = r.data.webhook_key; toast('success', t('Webhook key updated.')); } else errorModal(t('Error!'), errorText(r)); }); }); });
    show();
    // Execution environment lookup only once an organization is chosen.
    var org = $('[name=organization]', form), eeGroup = $('#execution-environments') && $('#execution-environments').closest('[data-lookup]');
    function eeState() { if (!eeGroup) return; var dis = !org.value; $$('[data-lookup-open],input[data-lookup-name]', eeGroup).forEach(function (x) { x.disabled = dis; }); $('.pf-v6-c-form-control', eeGroup).classList.toggle('pf-m-disabled', dis); if (dis) eeGroup.removeAttribute('data-filter'); else eeGroup.setAttribute('data-filter', 'or__organization=' + org.value + '&or__organization__isnull=True'); }
    if (org) { org.addEventListener('change', eeState); eeState(); }
  });

  // ---------------------------------------------------------------- lookups
  function lookupModal(group, opts) {
    opts = opts || {};
    var resource = opts.resource || group.getAttribute('data-resource'), title = opts.title || group.getAttribute('data-title') || t('Select'), filter = opts.filter || group.getAttribute('data-filter') || '';
    var multi = Boolean(opts.multi) || group.hasAttribute('data-multi');
    // displayKey and columns: lookups of objects named by another field
    // (instances by hostname) and with more columns than the name.
    var key = opts.displayKey || group.getAttribute('data-display-key') || 'name';
    var columns = (group.getAttribute('data-columns') || '').split(',').filter(Boolean).map(function (c) { var i = c.indexOf(':'); return { name: c.slice(0, i), key: c.slice(i + 1) }; });
    if (!columns.length) columns = [{ name: t('Name'), key: key }];
    var idInput = $('[data-lookup-id]', group), nameInput = $('[data-lookup-name]', group), hiddenName = $('[data-lookup-hidden-name]', group);
    // isSelectedDraggable: the picks are a DraggableSelectedList above the
    // table, their order the order saved; data-description is the modal's
    // description while something is picked.
    var draggable = multi && group.hasAttribute('data-draggable'), description = group.getAttribute('data-description') || '';
    var selected = [];
    if (multi) { $$('[data-lookup-values] input[data-ref-id]', group).forEach(function (i) { selected.push({ id: i.value, name: i.getAttribute('data-ref-name') || '', kindLabel: i.getAttribute('data-ref-kind-label') || '' }); }); }
    else if (idInput && idInput.value) selected = [{ id: idInput.value, name: nameInput.value }];
    // opts.root: a lookup opened over another modal keeps that one.
    var root = opts.root || $('#ascender-modal-root');
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div class="pf-v6-c-modal-box pf-m-lg" role="dialog" aria-modal="true" aria-labelledby="lookup-title"><div class="pf-v6-c-modal-box__close"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="Close" data-close-modal><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><h1 class="pf-v6-c-modal-box__title" id="lookup-title"><span class="pf-v6-c-modal-box__title-text">' + esc(title) + '</span></h1>' + (description ? '<div class="pf-v6-c-modal-box__description" id="lookup-description" hidden data-lookup-description><b>' + esc(t('Selected')) + '</b><br>' + esc(description) + '</div>' : '') + '</header><div class="pf-v6-c-modal-box__body">' + (draggable ? '<div data-lookup-drag></div>' : '') + '<div class="pf-v6-c-toolbar"><div class="pf-v6-c-toolbar__content"><div class="pf-v6-c-toolbar__content-section"><div class="pf-v6-c-toolbar__group pf-m-filter-group"><div class="pf-v6-c-toolbar__item"><div class="pf-v6-c-input-group"><div class="pf-v6-c-input-group__item pf-m-fill"><span class="pf-v6-c-form-control"><input type="search" aria-label="' + esc(t('Search text input')) + '" placeholder="' + esc(t('Search by name')) + '" data-lookup-search></span></div><div class="pf-v6-c-input-group__item"><button class="pf-v6-c-button pf-m-control" type="button" aria-label="' + esc(t('Search submit button')) + '" data-lookup-go><span class="pf-v6-c-button__icon">' + ICON.search + '</span></button></div></div></div></div><div class="pf-v6-c-toolbar__item pf-m-pagination"><div class="pf-v6-c-pagination pf-m-compact"><div class="pf-v6-c-pagination__total-items" data-lookup-count></div><nav class="pf-v6-c-pagination__nav" aria-label="' + esc(t('Pagination')) + '"><div class="pf-v6-c-pagination__nav-control"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="' + esc(t('Go to previous page')) + '" data-lookup-prev disabled>&#8249;</button></div><div class="pf-v6-c-pagination__nav-control"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="' + esc(t('Go to next page')) + '" data-lookup-next disabled>&#8250;</button></div></nav></div></div></div></div></div><table class="pf-v6-c-table pf-m-compact ascender-lookup-table" role="grid" aria-label="' + esc(title) + '"><thead class="pf-v6-c-table__thead"><tr class="pf-v6-c-table__tr"><th class="pf-v6-c-table__th"><span class="pf-v6-u-screen-reader">' + esc(t('Select')) + '</span></th>' + columns.map(function (c) { return '<th class="pf-v6-c-table__th" scope="col">' + esc(c.name) + '</th>'; }).join('') + '</tr></thead><tbody class="pf-v6-c-table__tbody" data-lookup-rows></tbody></table><div style="margin-top:1rem" data-lookup-chips></div></div><footer class="pf-v6-c-modal-box__footer"><button class="pf-v6-c-button pf-m-primary" type="button" data-lookup-select><span class="pf-v6-c-button__text">' + esc(t('Select')) + '</span></button><button class="pf-v6-c-button pf-m-link" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button></footer></div></div></div>');
    root.innerHTML = ''; root.appendChild(m); openModal(m);
    var page = 1, search = '', count = 0, size = 5;
    function isSel(id) { return selected.some(function (s) { return String(s.id) === String(id); }); }
    var dragList = draggable ? draggableSelectedList({ items: selected, displayKey: 'name', ns: 'lookup', onReorder: function (arr) { selected = arr; }, onRemove: function (item) { selected = selected.filter(function (s) { return String(s.id) !== String(item.id); }); load(); } }) : null;
    function chips() {
      var c = $('[data-lookup-chips]', m);
      if (dragList) {
        var host = $('[data-lookup-drag]', m), desc = $('[data-lookup-description]', m);
        dragList.set(selected);
        host.innerHTML = '';
        if (selected.length) dragList.nodes.forEach(function (n) { host.appendChild(n); });
        if (desc) desc.hidden = !selected.length;
        c.innerHTML = '';
        return;
      }
      c.innerHTML = selected.length ? '<div class="pf-v6-c-label-group"><div class="pf-v6-c-label-group__main"><span class="pf-v6-c-label-group__label">' + esc(t('Selected')) + '</span><ul class="pf-v6-c-label-group__list" role="list">' + selected.map(function (s) { return '<li class="pf-v6-c-label-group__list-item"><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(s.name) + '</span></span><span class="pf-v6-c-label__actions"><button class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button" aria-label="' + esc(t('Remove')) + '" data-lookup-unselect="' + esc(s.id) + '"><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></span></span></li>'; }).join('') + '</ul></div></div>' : '';
      $$('[data-lookup-unselect]', m).forEach(function (u) { u.addEventListener('click', function () { var id = u.getAttribute('data-lookup-unselect'); selected = selected.filter(function (s) { return String(s.id) !== String(id); }); load(); }); });
    }
    function load() {
      var q = '/api/v2/' + resource + '/?order_by=' + key + '&page_size=' + size + '&page=' + page + (search ? '&' + key + '__icontains=' + encodeURIComponent(search) : '') + (filter ? '&' + filter : '');
      api('GET', q).then(function (r) {
        var rows = $('[data-lookup-rows]', m); rows.innerHTML = '';
        if (!r.ok) { rows.innerHTML = '<tr class="pf-v6-c-table__tr"><td class="pf-v6-c-table__td" colspan="' + (columns.length + 1) + '">' + esc(errorText(r)) + '</td></tr>'; return; }
        count = r.data.count;
        (r.data.results || []).forEach(function (item) {
          var tr = el('<tr class="pf-v6-c-table__tr"><td class="pf-v6-c-table__td pf-v6-c-table__check"><div class="' + (multi ? 'pf-v6-c-check' : 'pf-v6-c-radio') + ' pf-m-standalone"><input class="' + (multi ? 'pf-v6-c-check__input' : 'pf-v6-c-radio__input') + '" type="' + (multi ? 'checkbox' : 'radio') + '" name="lookup-choice" aria-label="' + esc(t('Select {0}', { 0: item[key] })) + '"' + (isSel(item.id) ? ' checked' : '') + '></div></td>' + columns.map(function (c, ci) { var v = esc(item[c.key] == null ? '' : String(item[c.key])); return '<td class="pf-v6-c-table__td" data-label="' + esc(c.name) + '">' + (ci === 0 ? '<b>' + v + '</b>' : v) + '</td>'; }).join('') + '</tr>');
          $('input', tr).addEventListener('change', function () {
            if (multi) { if (this.checked) { if (!isSel(item.id)) selected.push({ id: String(item.id), name: item[key], kindLabel: credKindLabel(item) }); } else { selected = selected.filter(function (s) { return String(s.id) !== String(item.id); }); } }
            else selected = [{ id: String(item.id), name: item[key], kindLabel: credKindLabel(item) }];
            chips();
          });
          rows.appendChild(tr);
        });
        var first = count ? (page - 1) * size + 1 : 0, last = Math.min(page * size, count);
        $('[data-lookup-count]', m).innerHTML = '<b>' + first + ' - ' + last + '</b> ' + esc(t('of')) + ' <b>' + count + '</b>';
        $('[data-lookup-prev]', m).disabled = page <= 1; $('[data-lookup-next]', m).disabled = page * size >= count;
        chips();
      });
    }
    $('[data-lookup-go]', m).addEventListener('click', function () { search = $('[data-lookup-search]', m).value; page = 1; load(); });
    $('[data-lookup-search]', m).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search = this.value; page = 1; load(); } });
    $('[data-lookup-prev]', m).addEventListener('click', function () { page--; load(); });
    $('[data-lookup-next]', m).addEventListener('click', function () { page++; load(); });
    $('[data-lookup-select]', m).addEventListener('click', function () {
      if (opts.onSelect) { opts.onSelect(selected, m); return; }
      if (multi) { writeMulti(group, selected); }
      else { var s = selected[0] || { id: '', name: '' }; idInput.value = s.id; nameInput.value = s.name; if (hiddenName) hiddenName.value = s.name; idInput.dispatchEvent(new Event('change', { bubbles: true })); }
      closeModal(m);
    });
    load();
  }
  // ---------------------------------------------------------------- alert modal
  // AlertModal with its header badge (error: times-circle, danger:
  // exclamation-circle), and ErrorDetail: the status behind a Details
  // toggle, then the api's messages. ErrorDetail also printed the method
  // and URL from response.config, which the old fetch client never set,
  // so they were always blank.
  function alertModal(variant, title, label, body, footer) {
    var IC = A.icons || {};
    var badge = variant === 'error' ? IC.alertError : variant === 'danger' ? IC.alertDanger : '';
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(label || t('Alert modal')) + '" aria-labelledby="alert-modal-header-label" aria-modal="true" class="pf-v6-c-modal-box pf-m-sm"><div class="pf-v6-c-modal-box__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-close-modal><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><div class="ascender-alert-modal__header">' + (badge || '') + '<h2 id="alert-modal-header-label" class="pf-v6-c-title pf-m-2xl">' + esc(title) + '</h2></div></header><div class="pf-v6-c-modal-box__body">' + body + '</div>' + (footer ? '<footer class="pf-v6-c-modal-box__footer">' + footer + '</footer>' : '') + '</div></div></div>');
    var root = $('#ascender-modal-root') || document.body;
    root.appendChild(m); openModal(m);
    return m;
  }
  // ErrorDetail's Details toggle, in a modal or a page's ContentError.
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-error-detail-toggle]');
    if (!t) return;
    var open = t.getAttribute('aria-expanded') !== 'true';
    t.setAttribute('aria-expanded', open ? 'true' : 'false');
    var sec = t.closest('[data-error-detail]');
    sec.classList.toggle('pf-m-expanded', open);
    sec.querySelector('.pf-v6-c-expandable-section__content').hidden = !open;
  });
  // InventoryGroupsDeleteModal: delete the groups with everything under
  // them, or delete only the groups and promote their children and hosts
  // (the inventory's groups disassociate). Groups go one at a time, as the
  // old modal did to avoid integrity errors.
  function groupDeleteModal(groups, inventoryId, after) {
    var many = groups.length !== 1;
    var body = esc(t('{0, plural, one {Are you sure you want to delete the group below?} other {Are you sure you want to delete the groups below?}}', { 0: groups.length }))
      + '<div class="ascender-inventory-groups-delete-modal__padding-24-0">' + groups.map(function (g) { return '<li class="ascender-inventory-groups-delete-modal__list-item">' + esc(g.name) + '</li>'; }).join('') + '</div>'
      + '<div><div class="pf-v6-c-radio"><input id="radio-delete" class="pf-v6-c-radio__input" aria-invalid="false" type="radio" name="option"><label class="pf-v6-c-radio__label" for="radio-delete">' + esc(t('Delete All Groups and Hosts')) + '</label></div>'
      + '<div class="pf-v6-c-radio ascender-inventory-groups-delete-modal__margin-top-5"><input id="radio-promote" class="pf-v6-c-radio__input" aria-invalid="false" type="radio" name="option"><label class="pf-v6-c-radio__label" for="radio-promote">' + esc(t('Promote Child Groups and Hosts')) + '</label></div></div>';
    var footer = '<button aria-label="' + esc(t('Confirm Delete')) + '" class="pf-v6-c-button pf-m-danger" type="button" disabled data-group-delete-confirm><span class="pf-v6-c-button__text">' + esc(t('Delete')) + '</span></button><button aria-label="' + esc(t('Close')) + '" class="pf-v6-c-button pf-m-link" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button>';
    var trigger = document.activeElement;
    var m = alertModal('danger', t('{0, plural, one {Delete Group?} other {Delete Groups?}}', { 0: groups.length }), t('Alert modal'), body, footer);
    var confirm = $('[data-group-delete-confirm]', m), option = null;
    $$('input[name=option]', m).forEach(function (r) { r.addEventListener('change', function () { option = r.id === 'radio-promote' ? 'promote' : 'delete'; confirm.disabled = false; }); });
    function done(failure) { m.remove(); closeModal(); after(failure); }
    // Closing hands focus back to the button that opened it, as Modal did.
    m.addEventListener('click', function (e) { if (e.target.closest('[data-close-modal]')) { m.remove(); closeModal(); if (trigger && trigger.focus) trigger.focus(); } });
    confirm.addEventListener('click', function () {
      confirm.disabled = true;
      var i = 0;
      (function next() {
        if (i >= groups.length) { done(null); return; }
        var g = groups[i++];
        var call = option === 'promote'
          ? api('POST', '/api/v2/inventories/' + inventoryId + '/groups/', { id: Number(g.id), disassociate: true })
          : api('DELETE', '/api/v2/groups/' + g.id + '/');
        call.then(function (r) { if (r.ok) next(); else done({ method: option === 'promote' ? 'post' : 'delete', url: option === 'promote' ? '/api/v2/inventories/' + inventoryId + '/groups/' : '/api/v2/groups/' + g.id + '/', r: r }); });
      })();
    });
    return m;
  }
  function groupDeleteFailed(f, then) {
    var em = alertModal('error', t('Error!'), t('deletion error'), esc(t('Failed to delete one or more groups.')) + errorDetail(f.method, f.url, f.r));
    em.addEventListener('click', function (e) { if (e.target.closest('[data-close-modal]')) { em.remove(); closeModal(); if (then) then(); } });
  }
  // pad gives a clock or date field its two digits.
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  // A form field's error as FormGroup showed it: the helper text under the
  // control, and the status icon inside it.
  function helperError(text) { return '<div class="pf-v6-c-form__helper-text"><div class="pf-v6-c-helper-text"><div class="pf-v6-c-helper-text__item pf-m-error"><span class="pf-v6-c-helper-text__item-icon">' + (A.icons || {}).exclamationCircle + '</span><span class="pf-v6-c-helper-text__item-text">' + esc(text) + '<span class="pf-v6-screen-reader">: error status;</span></span></div></div></div>'; }
  function statusIcon() { return '<span class="pf-v6-c-form-control__utilities"><span class="pf-v6-c-form-control__icon pf-m-status">' + (A.icons || {}).exclamationCircle + '</span></span>'; }
  function errorDetail(method, url, r) {
    var data = r && r.data, msg;
    if (!data) msg = '';
    else if (typeof data === 'string') msg = esc(data);
    else if (data.detail) msg = esc(data.detail);
    else {
      var all = [];
      Object.keys(data).forEach(function (k) { all = all.concat(data[k]); });
      msg = '<ul>' + all.filter(function (m) { return typeof m === 'string'; }).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
    }
    var id = 'error-detail-' + Date.now();
    return '<div class="pf-v6-c-expandable-section ascender-error-detail__expandable" data-error-detail><div class="pf-v6-c-expandable-section__toggle"><button aria-expanded="false" class="pf-v6-c-button pf-m-link" type="button" aria-controls="' + id + '" data-error-detail-toggle><span class="pf-v6-c-button__icon pf-m-start"><span class="pf-v6-c-expandable-section__toggle-icon">' + ((A.icons || {}).pfAngleDown || '') + '</span></span><span class="pf-v6-c-button__text">' + esc(t('Details')) + '</span></button></div><div class="pf-v6-c-expandable-section__content" hidden id="' + id + '" role="region"><div class="pf-v6-c-card ascender-error-detail__card"><div class="pf-v6-c-card__body ascender-error-detail__card-body">  <strong>' + esc(String(r && r.status || '')) + '</strong></div><div class="pf-v6-c-card__body ascender-error-detail__card-body" style="max-width: 70vw;">' + msg + '</div></div></div></div>';
  }

  // ---------------------------------------------------------------- pager nav
  // The Pagination nav of a modal's list (OptionsList, the host filter
  // lookup): previous and next, or with full the first and last buttons
  // and the page input as well. The buttons carry attr with their action
  // and the input attr + "-input", for the list to bind.
  function pagerNav(attr, page, pages, full) {
    var IC = Object.assign({}, ICON, A.icons || {}), prev = page > 1, next = page < pages;
    function btn(action, label, icon, enabled) { return '<div class="pf-v6-c-pagination__nav-control' + (full && action === 'first' ? ' pf-m-first' : full && action === 'last' ? ' pf-m-last' : '') + '"><button data-action="' + action + '" aria-label="' + esc(label) + '" class="pf-v6-c-button pf-m-plain"' + (enabled ? '' : ' disabled=""') + ' type="button" ' + attr + '="' + action + '"><span class="pf-v6-c-button__icon">' + icon + '</span></button></div>'; }
    var input = full ? '<div class="pf-v6-c-pagination__nav-page-select"><span class="pf-v6-c-form-control' + (pages > 1 ? '' : ' pf-m-disabled') + '"><input aria-label="' + esc(t('Current page')) + '" min="1" max="' + pages + '" aria-invalid="false" type="number" value="' + page + '"' + (pages > 1 ? '' : ' disabled=""') + ' ' + attr + '-input></span><span aria-hidden="true">' + esc(t('of')) + ' ' + pages + ' ' + esc(pages === 1 ? t('page') : t('pages')) + '</span></div>' : '';
    return '<nav class="pf-v6-c-pagination__nav" aria-label="' + esc(t('Pagination')) + '">' + (full ? btn('first', t('Go to first page'), IC.angleDoubleLeft, prev) : '') + btn('previous', t('Go to previous page'), IC.angleLeft, prev) + input + btn('next', t('Go to next page'), IC.angleRight, next) + (full ? btn('last', t('Go to last page'), IC.angleDoubleRight, next) : '') + '</nav>';
  }

  // ---------------------------------------------------------------- draggable selected list
  // DraggableSelectedList (components/SelectedList): the picks in order,
  // numbered, each with a drag handle and a remove button. A row moves by
  // pointer, the rows following it as it is dragged and going back when it
  // is let go outside the list, or by keyboard: space or enter picks it up
  // and puts it down, the arrow keys move it, escape puts it back. One row
  // cannot be dragged. o: items, displayKey, ns (id prefix), onReorder(items),
  // onRemove(item). Returns nodes (the list, its instructions and its live
  // region, for the caller to place) and set(items).
  function draggableSelectedList(o) {
    var IC = Object.assign({}, ICON, A.icons || {});
    var key = o.displayKey || 'name', helpId = (o.ns || 'lookup') + '-drag-help';
    var items = (o.items || []).slice(), order = null, dragged = null, kbd = false, dropped = false;
    var ul = el('<ul class="pf-v6-c-data-list pf-m-grid-md" role="list" aria-label="' + esc(t('Draggable list to reorder and remove selected items.')) + '" data-cy="draggable-list"></ul>');
    var help = el('<div id="' + esc(helpId) + '" class="pf-v6-screen-reader">' + esc(t('Press space or enter to begin dragging, and use the arrow keys to move the row up or down. Press space or enter again to confirm, or escape to cancel.')) + '</div>');
    var live = el('<div class="pf-v6-screen-reader" aria-live="assertive"></div>');
    function name(it) { return String(it && it[key] != null ? it[key] : ''); }
    // A row is known by its resource's id: names repeat across
    // organizations (galaxy credentials, input inventories). The name
    // stays the row's label, and its id attribute as the old DOM had it.
    function ident(it) { return it && it.id != null && it.id !== '' ? 'id:' + it.id : 'name:' + name(it); }
    function labelOf(k) { var it = cur().filter(function (x) { return ident(x) === k; })[0]; return it ? name(it) : ''; }
    function cur() { return order || items; }
    function say(text) { live.textContent = text; }
    function move(arr, from, to) { var r = arr.slice(), m = r.splice(from, 1)[0]; r.splice(to, 0, m); return r; }
    function row(k) { return Array.prototype.filter.call(ul.children, function (li) { return li.getAttribute('data-drag-key') === k; })[0]; }
    function render() {
      var list = cur(), off = list.length === 1;
      ul.innerHTML = list.map(function (it, i) {
        var n = name(it), k = ident(it);
        return '<li id="' + esc(n) + '" class="pf-v6-c-data-list__item" draggable="' + (!off) + '" aria-pressed="' + (dragged === k) + '" data-drag-key="' + esc(k) + '"><div class="pf-v6-c-data-list__item-row"><div class="pf-v6-c-data-list__item-control" rowid=""><button class="pf-v6-c-data-list__item-draggable-button' + (off ? ' pf-m-disabled' : '') + '" type="button"' + (off ? ' disabled=""' : '') + ' aria-label="' + esc(t('Reorder {label}', { label: n })) + '" aria-describedby="' + esc(helpId) + '" aria-pressed="' + (kbd && dragged === k) + '" data-cy="reorder-' + esc(n) + '" data-drag-handle><span class="pf-v6-c-data-list__item-draggable-icon">' + (IC.gripVertical || '') + '</span></button></div><div class="pf-v6-c-data-list__item-content"><div class="pf-v6-c-data-list__cell"><span id="draggable-item-' + (i + 1) + '">' + (i + 1) + '. ' + esc(n) + '</span></div></div><div class="pf-v6-c-data-list__item-action ascender-draggable-selected-list__remove-action-section" rowid=""><button aria-label="' + esc(t('Remove')) + '" class="pf-v6-c-button pf-m-plain" type="button"' + (dragged !== null ? ' disabled=""' : '') + ' data-drag-remove="' + i + '"><span class="pf-v6-c-button__icon">' + (IC.times || ICON.times) + '</span></button></div></div></li>';
      }).join('');
    }
    // While the pointer drags, the rows themselves move (as React moved
    // them by key): rebuilding them would end the drag.
    function arrange() {
      cur().forEach(function (it, i) {
        var li = row(ident(it)); if (!li) return;
        ul.appendChild(li);
        var span = $('.pf-v6-c-data-list__cell span', li);
        span.id = 'draggable-item-' + (i + 1); span.textContent = (i + 1) + '. ' + name(it);
      });
    }
    function reset() { order = null; dragged = null; kbd = false; }
    function commit() { items = cur().slice(); reset(); render(); if (o.onReorder) o.onReorder(items.slice()); }
    function cancel() { reset(); render(); }
    function focusHandle(k) { var li = row(k), b = li && $('[data-drag-handle]', li); if (b) b.focus(); }
    ul.addEventListener('dragstart', function (e) {
      var li = e.target.closest && e.target.closest('li');
      if (!li || li.getAttribute('draggable') !== 'true') return;
      e.dataTransfer.effectAllowed = 'move';
      // Firefox starts no drag unless the transfer carries something.
      e.dataTransfer.setData('text/plain', li.id);
      dropped = false; dragged = li.getAttribute('data-drag-key'); order = items.slice();
      li.setAttribute('aria-pressed', 'true');
      $$('[data-drag-remove]', ul).forEach(function (b) { b.disabled = true; });
      say(t('Dragging started for {0}.', { 0: labelOf(dragged) }));
    });
    ul.addEventListener('dragover', function (e) {
      e.preventDefault();
      var li = e.target.closest && e.target.closest('li');
      if (!li || dragged === null || kbd) return;
      var keys = cur().map(ident), from = keys.indexOf(dragged), to = keys.indexOf(li.getAttribute('data-drag-key'));
      if (from < 0 || to < 0 || to === from) return;
      order = move(cur(), from, to); arrange();
      say(t('{draggedName} is now at position {0}.', { draggedName: labelOf(dragged), 0: to + 1 }));
    });
    // Only a row takes the drop; let go anywhere else, dragend puts the
    // order back.
    ul.addEventListener('drop', function (e) {
      e.preventDefault();
      if (dragged === null || !(e.target.closest && e.target.closest('li'))) return;
      dropped = true; say(t('Dragging finished.')); commit();
    });
    ul.addEventListener('dragend', function () {
      if (dropped || dragged === null) return;
      say(t('Dragging cancelled. The list is unchanged.')); cancel();
    });
    ul.addEventListener('keydown', function (e) {
      var b = e.target.closest && e.target.closest('[data-drag-handle]');
      if (!b || b.disabled) return;
      var k = b.closest('li').getAttribute('data-drag-key'), n = labelOf(k);
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (kbd) { say(t('Dragging finished.')); commit(); focusHandle(k); return; }
        dragged = k; order = items.slice(); kbd = true; render(); focusHandle(k);
        say(t('Dragging started for {name}. Use the arrow keys to move it.', { name: n }));
        return;
      }
      if (!kbd) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); say(t('Dragging cancelled. The list is unchanged.')); cancel(); focusHandle(k); return; }
      // Tab moves on first, then the list goes back. Putting it back
      // rebuilds the rows: when Tab landed on a control in the list (the
      // row's Remove, another handle), focus goes to that control again.
      if (e.key === 'Tab') {
        say(t('Dragging cancelled. The list is unchanged.'));
        setTimeout(function () {
          var f = document.activeElement, li = f && ul.contains(f) && f.closest('li');
          var to = li && li.getAttribute('data-drag-key'), sel = f && f.hasAttribute('data-drag-remove') ? '[data-drag-remove]' : '[data-drag-handle]';
          cancel();
          var again = to && row(to);
          if (again && $(sel, again)) $(sel, again).focus();
        }, 0);
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var keys = cur().map(ident), from = keys.indexOf(dragged), to = e.key === 'ArrowUp' ? from - 1 : from + 1;
        if (from < 0 || to < 0 || to >= keys.length) return;
        order = move(cur(), from, to); render(); focusHandle(k);
        say(t('{name} is now at position {0}.', { name: n, 0: to + 1 }));
      }
    });
    ul.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-drag-remove]');
      if (!b || b.disabled) return;
      var it = items[parseInt(b.getAttribute('data-drag-remove'), 10)];
      if (it && o.onRemove) o.onRemove(it);
    });
    render();
    return { nodes: [ul, help, live], set: function (list) { items = (list || []).slice(); reset(); render(); } };
  }

  // ---------------------------------------------------------------- options list
  // OptionsList (components/OptionsList): the pick table the launch and
  // Run Command steps used, a PaginatedTable without page sizes under the
  // Selected chips. o: resource (API path under /api/v2/), ns (query
  // string namespace: toolbar and sort header ids), header (plural name),
  // name (the radio cells' name), multi, draggable, searchColumns,
  // sortColumns, params (fixed filters), value() (selected objects),
  // select(item), deselect(item), onChange().
  function optionsList(o) {
    var IC = Object.assign({}, ICON, A.icons || {});
    var size = o.pageSize || 5, displayKey = o.displayKey || 'name';
    var searchColumns = (o.searchColumns && o.searchColumns.length) ? o.searchColumns : [{ name: t('Name'), key: 'name', isDefault: true }];
    var defCol = searchColumns.filter(function (c) { return c.isDefault; })[0] || searchColumns[0];
    var st = { page: 1, order: o.orderBy || 'name', filters: [], key: defCol.key, keyName: defCol.name, data: null, text: '' };
    var box = el('<div class="ascender-options-list__modal-list"></div>'), dragList = null;
    function value() { return o.value() || []; }
    function isSel(item) { return value().some(function (v) { return String(v.id) === String(item.id); }); }
    function selectedHTML() {
      var sel = value();
      if (!sel.length) return '';
      // DraggableSelectedList, placed by render().
      if (o.draggable) return '<div data-drag-slot></div>';
      var chips = sel.map(function (s, i) { return '<li class="pf-v6-c-label-group__list-item"' + (i >= 5 ? ' hidden data-chip-overflowed' : '') + '><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(s[displayKey]) + '</span></span><span class="pf-v6-c-label__actions"><button aria-label="Close ' + esc(s[displayKey]) + '" class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button" data-opt-remove="' + i + '"><span class="pf-v6-c-button__icon">' + (IC.pfClose || ICON.close) + '</span></button></span></span></li>'; }).join('');
      if (sel.length > 5) chips += '<li class="pf-v6-c-label-group__list-item"><button class="pf-v6-c-label pf-m-overflow" type="button" data-chip-overflow data-more="' + esc(t('{0} more', { 0: sel.length - 5 })) + '"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(t('{0} more', { 0: sel.length - 5 })) + '</span></span></button></li>';
      return '<div class="pf-v6-l-split ascender-selected-list__split"><div class="pf-v6-l-split__item ascender-selected-list__split-label-item">' + esc(t('Selected')) + '</div><div class="pf-v6-l-split__item"><div><div class="pf-v6-c-label-group"><div class="pf-v6-c-label-group__main"><ul class="pf-v6-c-label-group__list" aria-label="Label group category" role="list">' + chips + '</ul></div></div></div></div></div>';
    }
    function render() {
      var d = st.data || { count: 0, results: [] }, count = d.count || 0, pages = Math.max(1, Math.ceil(count / size));
      var first = count ? (st.page - 1) * size + 1 : 0, last = Math.min(st.page * size, count), wc = Math.max(2, String(pages).length);
      var top = '<div class="pf-v6-c-toolbar__item pf-m-pagination" style="align-self: center;"><div class="pf-v6-c-pagination ascender-pagination--no-page-sizes" id="options-menu-top-pagination" style="--pf-v6-c-pagination__nav-page-select--c-form-control--width-chars: ' + wc + ';"><div class="pf-v6-c-pagination__total-items"><b>' + first + ' - ' + last + '</b> ' + esc(t('of')) + ' <b>' + count + '</b> ' + esc(t('items')) + '</div>' + pagerNav('data-opt-page', st.page, pages) + '</div></div>';
      var groups = [], byKey = {};
      st.filters.forEach(function (f) { if (!byKey[f[0]]) { byKey[f[0]] = { label: (searchColumns.filter(function (c) { return c.key === f[0]; })[0] || { name: f[0] }).name, chips: [] }; groups.push(byKey[f[0]]); } byKey[f[0]].chips.push(f); });
      var chipRow = groups.length ? '<div class="pf-v6-c-toolbar__content"><div class="pf-v6-c-toolbar__group">' + groups.map(function (g, gi) { return '<div class="pf-v6-c-toolbar__item pf-m-label-group pf-m-label-group"><div class="pf-v6-c-label-group pf-m-category"><div class="pf-v6-c-label-group__main"><div style="display: contents;"><span tabindex="0" class="pf-v6-c-label-group__label"><span aria-hidden="true" id="chip-group-' + gi + '">' + esc(g.label) + '</span></span></div><ul class="pf-v6-c-label-group__list" aria-labelledby="chip-group-' + gi + '" role="list">' + g.chips.map(function (f) { return '<li class="pf-v6-c-label-group__list-item"><span class="pf-v6-c-label pf-m-filled"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(f[1]) + '</span></span><span class="pf-v6-c-label__actions"><button aria-label="Close ' + esc(f[1]) + '" class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button" data-opt-unfilter="' + st.filters.indexOf(f) + '"><span class="pf-v6-c-button__icon">' + (IC.pfClose || ICON.close) + '</span></button></span></span></li>'; }).join('') + '</ul></div></div></div>'; }).join('') + '</div><div class="pf-v6-c-toolbar__group pf-m-action-group-inline"><div class="pf-v6-c-toolbar__item"><button class="pf-v6-c-button pf-m-link pf-m-inline" type="button" data-opt-clear><span class="pf-v6-c-button__text">' + esc(t('Clear all filters')) + '</span></button></div></div></div>' : '<div class="pf-v6-c-toolbar__content pf-m-hidden" hidden=""><div class="pf-v6-c-toolbar__group"></div></div>';
      var keyMenu = searchColumns.length > 1 ? '<div class="pf-v6-c-toolbar__item"><div class="ascender-dropdown" data-dropdown><button class="pf-v6-c-menu-toggle" type="button" aria-label="' + esc(t('Simple key select')) + '" aria-expanded="false" data-dropdown-toggle><span class="pf-v6-c-menu-toggle__text">' + esc(st.keyName) + '</span><span class="pf-v6-c-menu-toggle__controls"><span class="pf-v6-c-menu-toggle__toggle-icon">' + IC.caret + '</span></span></button><div class="pf-v6-c-menu ascender-dropdown__menu" hidden data-dropdown-menu><div class="pf-v6-c-menu__content"><ul class="pf-v6-c-menu__list" role="menu">' + searchColumns.map(function (c) { return '<li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item" type="button" role="menuitem" data-opt-key="' + esc(c.key) + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(c.name) + '</span></span></button></li>'; }).join('') + '</ul></div></div></div></div>' : '<div class="pf-v6-c-toolbar__item"><div class="ascender-search__no-option-dropdown">' + esc(st.keyName) + '</div></div>';
      var empty = !st.text.trim();
      var toolbar = '<div class="pf-v6-c-toolbar" id="' + esc(o.ns) + '-list-toolbar"><div class="pf-v6-c-toolbar__content ascender-data-list-toolbar__content"><div class="pf-v6-c-toolbar__content-section"><div class="pf-v6-c-toolbar__group pf-m-toggle-group pf-m-show"><div class="pf-v6-c-toolbar__toggle"><button aria-haspopup="false" aria-label="Show Filters" class="pf-v6-c-button pf-m-plain" type="button"><span class="pf-v6-c-button__icon">' + IC.filter + '</span></button></div><div class="pf-v6-c-toolbar__item"><div class="pf-v6-c-toolbar__group pf-m-filter-group">' + keyMenu + '<div class="pf-v6-c-toolbar__item"><div class="pf-v6-c-input-group"><div class="pf-v6-c-input-group__item pf-m-fill"><span class="pf-v6-c-form-control"><input data-cy="search-text-input" aria-label="' + esc(t('Search text input')) + '" aria-invalid="false" type="search" value="' + esc(st.text) + '" data-opt-search></span></div><div class="pf-v6-c-input-group__item"><div class="ascender-search__submit-button-wrapper' + (empty ? ' ascender-search__submit-button-wrapper--disabled' : '') + '" data-opt-submit-wrap><button aria-label="' + esc(t('Search submit button')) + '" class="pf-v6-c-button pf-m-control"' + (empty ? ' disabled=""' : '') + ' type="button" data-opt-submit><span class="pf-v6-c-button__icon">' + ICON.search + '</span></button></div></div></div></div></div></div></div><div class="pf-v6-c-toolbar__group"></div>' + top + '</div></div>' + chipRow + '</div>';
      var body;
      if (!d.results || !d.results.length) {
        // o.header is the caller's translated plural name.
        var emptyTitle = t('No {pluralizedItemName} Found', { pluralizedItemName: o.header });
        body = '<div class="pf-v6-c-empty-state"><div class="pf-v6-c-empty-state__content"><div class="pf-v6-c-empty-state__header"><div class="pf-v6-c-empty-state__icon">' + (IC.cubes || '') + '</div><div class="pf-v6-c-empty-state__title"><h4 class="pf-v6-c-empty-state__title-text">' + esc(emptyTitle) + '</h4></div></div><div class="pf-v6-c-empty-state__body">' + esc(t('Please add {pluralizedItemName} to populate this list', { pluralizedItemName: o.header })) + '</div></div></div>';
      } else {
        var cols = o.columns && o.columns.length ? o.columns : [{ name: t('Name'), key: 'name' }];
        var head = cols.map(function (c) {
          var asc = st.order === c.key, desc = st.order === '-' + c.key;
          return '<th tabindex="-1" scope="col" class="pf-v6-c-table__th ascender-header-row__th pf-v6-c-table__sort' + (asc || desc ? ' pf-m-selected' : '') + '"' + (asc ? ' aria-sort="ascending"' : desc ? ' aria-sort="descending"' : '') + ' id="' + esc(o.ns) + '-table-sort-' + esc(c.key) + '"><button type="button" class="pf-v6-c-table__button" data-opt-sort="' + esc(c.key) + '"><div class="pf-v6-c-table__button-content"><span class="pf-v6-c-table__text">' + esc(c.name) + '</span><span class="pf-v6-c-table__sort-indicator">' + (desc ? IC.longArrowDown : asc ? IC.longArrowUp : IC.arrowsV) + '</span></div></button></th>';
        }).join('');
        var rows = d.results.map(function (item, i) {
          var on = isSel(item), nm = o.multi || o.rowName ? item[displayKey] : o.name;
          var cells = o.columns && o.columns.length ? o.columns.map(function (c) { return '<td tabindex="-1" aria-label="' + esc(c.name) + '" data-cy="item-' + esc(item.id) + '-' + esc(c.name) + '" data-label="' + esc(c.key) + '" class="pf-v6-c-table__td">' + esc(item[c.key] == null ? '' : String(item[c.key])) + '</td>'; }).join('')
            : '<td tabindex="-1" data-label="' + esc(item[displayKey]) + '" class="pf-v6-c-table__td" aria-labelledby="' + esc(item.id) + '" data-cy="item-' + esc(item.id) + '"><b>' + esc(item[displayKey]) + '</b></td>';
          return '<tr class="pf-v6-c-table__tr ascender-checkbox-list-item__cursor-default" id="list-item-' + esc(item.id) + '" data-opt-row="' + i + '"><td tabindex="-1" data-label="' + esc(t('Selected')) + '" class="pf-v6-c-table__td pf-v6-c-table__check" id="check-action-item-' + esc(item.id) + '"' + (nm != null && nm !== '' ? ' name="' + esc(nm) + '"' : '') + '><div class="' + (o.multi ? 'pf-v6-c-check' : 'pf-v6-c-radio') + ' pf-m-standalone"><input id="select-' + i + '" class="' + (o.multi ? 'pf-v6-c-check__input' : 'pf-v6-c-radio__input') + '" aria-invalid="false" aria-label="Select row ' + i + '" type="' + (o.multi ? 'checkbox' : 'radio') + '"' + (o.multi ? '' : ' name="radioGroup"') + (on ? ' checked=""' : '') + '></div></td>' + cells + '</tr>';
        }).join('');
        body = '<div class="ascender-paginated-table__overflow-auto"><table aria-label="' + esc(t('{pluralizedItemName} List', { pluralizedItemName: o.header })) + '" role="grid" class="pf-v6-c-table pf-m-grid-md pf-m-compact"><thead class="pf-v6-c-table__thead"><tr class="pf-v6-c-table__tr"><th tabindex="-1" scope="col" class="pf-v6-c-table__th ascender-header-row__th"><span class="pf-v6-u-screen-reader">' + esc(t('Row select')) + '</span></th>' + head + '</tr></thead><tbody role="rowgroup" class="pf-v6-c-table__tbody">' + rows + '</tbody></table></div>' +
          '<div class="pf-v6-c-pagination pf-m-bottom ascender-pagination--no-page-sizes" id="options-menu-bottom-pagination" style="--pf-v6-c-pagination__nav-page-select--c-form-control--width-chars: ' + wc + ';">' + pagerNav('data-opt-page', st.page, pages, true) + '</div>';
      }
      box.innerHTML = (o.noSelected ? '' : selectedHTML()) + toolbar + body;
      var slot = $('[data-drag-slot]', box);
      if (slot) {
        if (!dragList) dragList = draggableSelectedList({ items: value(), displayKey: displayKey, ns: o.ns, onReorder: function (arr) { if (o.reorder) o.reorder(arr); changed(); }, onRemove: function (item) { o.deselect(item); changed(); } });
        dragList.set(value());
        slot.replaceWith.apply(slot, dragList.nodes);
      }
      bind(pages);
    }
    function changed() { if (o.onChange) o.onChange(); render(); }
    function bind(pages) {
      var input = $('[data-opt-search]', box), sub = $('[data-opt-submit]', box), wrap = $('[data-opt-submit-wrap]', box);
      input.addEventListener('input', function () { st.text = input.value; var e = !input.value.trim(); sub.disabled = e; wrap.classList.toggle('ascender-search__submit-button-wrapper--disabled', e); });
      function search() { var v = input.value.trim(); if (!v) return; st.filters.push([st.key, v]); st.text = ''; st.page = 1; load(); }
      sub.addEventListener('click', search);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search(); } });
      $$('[data-opt-key]', box).forEach(function (b) { b.addEventListener('click', function () { st.key = b.getAttribute('data-opt-key'); st.keyName = b.textContent; st.text = input.value; render(); var i2 = $('[data-opt-search]', box); if (i2) i2.focus(); }); });
      $$('[data-opt-unfilter]', box).forEach(function (b) { b.addEventListener('click', function () { st.filters.splice(parseInt(b.getAttribute('data-opt-unfilter'), 10), 1); st.page = 1; load(); }); });
      $$('[data-opt-clear]', box).forEach(function (b) { b.addEventListener('click', function () { st.filters = []; st.page = 1; st.order = o.orderBy || 'name'; load(); }); });
      $$('[data-opt-sort]', box).forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-opt-sort'); st.order = st.order === k ? '-' + k : k; st.page = 1; load(); }); });
      $$('[data-opt-page]', box).forEach(function (b) { b.addEventListener('click', function () { var a = b.getAttribute('data-opt-page'); st.page = a === 'first' ? 1 : a === 'last' ? pages : a === 'previous' ? st.page - 1 : st.page + 1; load(); }); });
      $$('[data-opt-page-input]', box).forEach(function (i) { i.addEventListener('change', function () { var n = parseInt(i.value, 10); if (n >= 1 && n <= pages) { st.page = n; load(); } }); });
      $$('[data-opt-remove]', box).forEach(function (b) { b.addEventListener('click', function () { var item = value()[parseInt(b.getAttribute('data-opt-remove'), 10)]; if (item) { o.deselect(item); changed(); } }); });
      $$('[data-chip-overflow]', box).forEach(function (b) { b.addEventListener('click', function () { var open = b.getAttribute('data-open') === '1'; $$('[data-chip-overflowed]', box).forEach(function (li) { li.hidden = open; }); b.setAttribute('data-open', open ? '0' : '1'); $('.pf-v6-c-label__text', b).textContent = open ? b.getAttribute('data-more') : t('Show less'); }); });
      $$('[data-opt-row]', box).forEach(function (tr) {
        tr.addEventListener('click', function (e) {
          e.preventDefault();
          var item = st.data.results[parseInt(tr.getAttribute('data-opt-row'), 10)];
          if (isSel(item) && o.multi) o.deselect(item); else o.select(item);
          changed();
        });
      });
    }
    function load() {
      var q = new URLSearchParams();
      Object.keys(o.params || {}).forEach(function (k) { if (o.params[k] !== null && o.params[k] !== undefined && o.params[k] !== '') q.append(k, o.params[k]); });
      st.filters.forEach(function (f) { q.append(f[0], f[1]); });
      q.set('order_by', st.order); q.set('page', st.page); q.set('page_size', size);
      return api('GET', '/api/v2/' + o.resource + '/?' + q.toString()).then(function (r) {
        st.data = r.ok ? r.data : { count: 0, results: [] };
        render();
        if (o.onLoad) o.onLoad(st.data);
      });
    }
    box.optionsList = { reload: load, render: render };
    load();
    return box;
  }

  // writeMulti stores the picks of a multi-lookup as hidden inputs and chips.
  function writeMulti(group, selected) {
    var name = group.getAttribute('data-name'), holder = $('[data-lookup-values]', group), chipHolder = $('[data-lookup-chips-holder] > div', group);
    var isCred = group.hasAttribute('data-credentials-lookup');
    holder.innerHTML = selected.map(function (s) { return '<input type="hidden" name="' + esc(name) + '" value="' + esc(s.id) + '" data-ref-id data-ref-name="' + esc(s.name) + '" data-ref-kind-label="' + esc(s.kindLabel || '') + '"><input type="hidden" name="' + esc(name) + '_name" value="' + esc(s.name) + '">' + (isCred ? '<input type="hidden" name="' + esc(name) + '_kind_label" value="' + esc(s.kindLabel || '') + '">' : ''); }).join('');
    chipHolder.innerHTML = selected.length ? '<div class="pf-v6-c-label-group"><div class="pf-v6-c-label-group__main"><ul class="pf-v6-c-label-group__list" role="list">' + selected.map(function (s) { return '<li class="pf-v6-c-label-group__list-item" data-chip="' + esc(s.id) + '"><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + (isCred && s.kindLabel ? '<strong>' + esc(s.kindLabel) + ': </strong>' : '') + esc(s.name) + '</span></span><span class="pf-v6-c-label__actions"><button class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button" aria-label="' + (isCred && s.kindLabel ? esc(s.kindLabel) + ': ' : '') + esc(s.name) + '" data-chip-remove><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></span></span></li>'; }).join('') + '</ul></div></div>' : '';
    bindChipRemove(group);
  }
  function bindChipRemove(group) {
    $$('[data-chip-remove]', group).forEach(function (b) {
      b.onclick = function () {
        var id = b.closest('[data-chip]').getAttribute('data-chip'), sel = [];
        $$('[data-lookup-values] input[data-ref-id]', group).forEach(function (i) { if (String(i.value) !== String(id)) sel.push({ id: i.value, name: i.getAttribute('data-ref-name') || '', kindLabel: i.getAttribute('data-ref-kind-label') || '' }); });
        writeMulti(group, sel);
      };
    });
  }
  $$('[data-lookup]').forEach(function (group) {
    var open = $('[data-lookup-open]', group), clear = $('[data-lookup-clear]', group);
    if (open) open.addEventListener('click', function () { lookupModal(group); });
    if (clear) clear.addEventListener('click', function () { $('[data-lookup-id]', group).value = ''; $('[data-lookup-name]', group).value = ''; var h = $('[data-lookup-hidden-name]', group); if (h) h.value = ''; $('[data-lookup-id]', group).dispatchEvent(new Event('change', { bubbles: true })); });
    if (group.hasAttribute('data-multi')) bindChipRemove(group);
  });
  // Associate buttons open a multi-select lookup and attach every pick.
  $$('[data-associate]').forEach(function (b) {
    b.addEventListener('click', function () {
      closeDropdowns();
      lookupModal(b, { multi: true, resource: b.getAttribute('data-resource'), title: b.getAttribute('data-title'), filter: b.getAttribute('data-filter') || '', onSelect: function (selected, m) {
        Promise.all(selected.map(function (s) { return api('POST', b.getAttribute('data-api'), { id: parseInt(s.id, 10) }); })).then(function (results) {
          closeModal(m); var failed = results.filter(function (r) { return !r.ok; });
          if (failed.length) errorModal(t('Error!'), errorText(failed[0])); else location.reload();
        });
      } });
    });
  });

  // ---------------------------------------------------------------- label select (typeahead)
  $$('[data-label-select]').forEach(function (box) {
    var name = box.getAttribute('data-name'), input = $('[data-label-input]', box), menu = $('[data-label-menu]', box), list = $('[data-label-options]', box);
    var toggle = $('[data-label-toggle]', box), chips = $('[data-label-chips]', box), chipList = $('ul', chips), values = $('[data-label-values]', box), clearWrap = $('[data-label-clear-wrap]', box), caret = $('[data-label-caret]', box);
    var options = null, selected = [], expanded = false;
    $$('[data-chip]', chipList).forEach(function (li) { selected.push({ id: li.getAttribute('data-chip-id'), name: li.getAttribute('data-chip-name') }); });
    function isSel(o) { return selected.some(function (s) { return (s.id && String(s.id) === String(o.id)) || (!s.id && s.name === o.name); }); }
    function render() {
      // LabelGroup: three labels, then an overflow toggle ("N more" / "Show Less").
      var shown = expanded ? selected : selected.slice(0, 3);
      chipList.setAttribute('aria-label', 'Label group category');
      chipList.innerHTML = shown.map(function (s) { return '<li class="pf-v6-c-label-group__list-item" data-chip data-chip-id="' + esc(s.id) + '" data-chip-name="' + esc(s.name) + '"><span class="pf-v6-c-label pf-m-filled"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(s.name) + '</span></span><span class="pf-v6-c-label__actions"><button class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button" aria-label="Close ' + esc(s.name) + '" data-chip-remove><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></span></span></li>'; }).join('')
        + (selected.length > 3 ? '<li class="pf-v6-c-label-group__list-item"><button class="pf-v6-c-label pf-m-overflow" type="button" data-chip-more><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + (expanded ? 'Show Less' : (selected.length - 3) + ' more') + '</span></span></button></li>' : '');
      var more = $('[data-chip-more]', chipList);
      if (more) more.addEventListener('click', function (e) { e.stopPropagation(); expanded = !expanded; render(); var again = $('[data-chip-more]', chipList); if (again) again.focus(); if (menu.hidden) open(); else close(); });
      chips.hidden = selected.length === 0; clearWrap.hidden = selected.length === 0 && !input.value;
      values.innerHTML = selected.map(function (s) { return '<input type="hidden" name="' + esc(name) + '" value="' + esc(s.id) + '" data-ref-id data-ref-name="' + esc(s.name) + '"><input type="hidden" name="' + esc(name) + '_name" value="' + esc(s.name) + '">'; }).join('');
      $$('[data-chip-remove]', chipList).forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); var li = b.closest('[data-chip]'), id = li.getAttribute('data-chip-id'), nm = li.getAttribute('data-chip-name'); selected = selected.filter(function (s) { return !(s.id === id && s.name === nm); }); render(); if (!menu.hidden) renderOptions(); }); });
    }
    function renderOptions() {
      var q = input.value.trim(), ql = q.toLowerCase();
      var opts = (options || []).filter(function (o) { return !ql || o.name.toLowerCase().indexOf(ql) >= 0; });
      var html = opts.map(function (o) { var on = isSel(o); return '<li class="pf-v6-c-menu__list-item" role="none"><label class="pf-v6-c-menu__item" role="option" aria-selected="' + on + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-check"><input class="pf-v6-c-check__input" type="checkbox" data-opt-id="' + esc(o.id) + '"' + (on ? ' checked' : '') + '></span><span class="pf-v6-c-menu__item-text">' + esc(o.name) + '</span></span></label></li>'; }).join('');
      var exact = (options || []).concat(selected).some(function (o) { return o.name.toLowerCase() === ql; });
      if (q && !exact) html += '<li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item" type="button" role="option" data-opt-create="' + esc(q) + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(t('Create')) + ' "' + esc(q) + '"</span></span></button></li>';
      if (!opts.length && !q) html += '<li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item pf-m-aria-disabled" type="button" role="option" aria-disabled="true"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(t('No results found')) + '</span></span></button></li>';
      list.innerHTML = html;
      $$('[data-opt-id]', list).forEach(function (cb) { cb.addEventListener('change', function () { var o = options.filter(function (x) { return String(x.id) === cb.getAttribute('data-opt-id'); })[0]; if (!o) return; if (cb.checked) { if (!isSel(o)) selected.push({ id: String(o.id), name: o.name }); } else selected = selected.filter(function (s) { return String(s.id) !== String(o.id); }); render(); renderOptions(); }); });
      $$('[data-opt-create]', list).forEach(function (b) { b.addEventListener('click', function () { selected.push({ id: '', name: b.getAttribute('data-opt-create') }); input.value = ''; render(); renderOptions(); }); });
    }
    function open() {
      menu.hidden = false; toggle.classList.add('pf-m-expanded'); caret.setAttribute('aria-expanded', 'true');
      if (options) renderOptions(); else api('GET', '/api/v2/' + box.getAttribute('data-resource') + '/?page_size=200&order_by=name').then(function (r) { options = r.ok ? (r.data.results || []) : []; renderOptions(); });
    }
    function close() { menu.hidden = true; toggle.classList.remove('pf-m-expanded'); caret.setAttribute('aria-expanded', 'false'); }
    input.addEventListener('focus', open); input.addEventListener('click', open);
    input.addEventListener('input', function () { clearWrap.hidden = selected.length === 0 && !input.value; if (menu.hidden) open(); else renderOptions(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var v = input.value.trim(); if (!v) return; var o = (options || []).filter(function (x) { return x.name.toLowerCase() === v.toLowerCase(); })[0]; if (o) { if (!isSel(o)) selected.push({ id: String(o.id), name: o.name }); } else if (!selected.some(function (s) { return s.name === v; })) selected.push({ id: '', name: v }); input.value = ''; render(); renderOptions(); }
      else if (e.key === 'Escape') close();
    });
    caret.addEventListener('click', function () { if (menu.hidden) { open(); input.focus(); } else close(); });
    $('[data-label-clear]', box).addEventListener('click', function () { selected = []; input.value = ''; render(); if (!menu.hidden) renderOptions(); });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) close(); });
    render();
  });

  // ---------------------------------------------------------------- typeahead selects
  $$('[data-typeahead]').forEach(function (box) {
    var input = $('[data-typeahead-input]', box), menu = $('[data-typeahead-menu]', box), list = $('[data-typeahead-options]', box), toggle = $('[data-typeahead-toggle]', box);
    var caret = $('[data-typeahead-caret]', box), clearWrap = $('[data-typeahead-clear-wrap]', box), hidden = $('[data-typeahead-value]', box);
    if (!input || input.disabled) return;
    var options = [];
    (box.getAttribute('data-options') || '').split(',').forEach(function (o) { if (o.trim()) options.push({ value: o.trim(), label: o.trim() }); });
    $$('li[data-value]', list).forEach(function (li) { options.push({ value: li.getAttribute('data-value'), label: li.getAttribute('data-label') }); });
    var creatable = !hidden, createLabel = box.getAttribute('data-create-label');
    function open() { menu.hidden = false; toggle.classList.add('pf-m-expanded'); caret.setAttribute('aria-expanded', 'true'); render(); }
    function close() { menu.hidden = true; toggle.classList.remove('pf-m-expanded'); caret.setAttribute('aria-expanded', 'false'); }
    function choose(o) { input.value = o.create ? o.value : o.label; if (hidden) { hidden.value = o.value; hidden.dispatchEvent(new Event('change', { bubbles: true })); } else input.dispatchEvent(new Event('change', { bubbles: true })); if (clearWrap) clearWrap.hidden = !input.value; close(); }
    function render() {
      var q = input.value.trim().toLowerCase();
      var opts = options.filter(function (o) { return !q || o.label.toLowerCase().indexOf(q) >= 0; });
      if (createLabel && creatable && q && !options.some(function (o) { return o.label.toLowerCase() === q; })) opts = opts.concat([{ value: input.value.trim(), label: createLabel + ' "' + input.value.trim() + '"', create: true }]);
      else if (!opts.length && creatable && q) opts = [{ value: input.value.trim(), label: input.value.trim() }];
      list.innerHTML = opts.length ? opts.map(function (o) { return '<li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item" type="button" role="option" data-opt-value="' + esc(o.value) + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(o.label) + '</span></span></button></li>'; }).join('') : '<li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item pf-m-aria-disabled" type="button" role="option" aria-disabled="true"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(t('No results found')) + '</span></span></button></li>';
      $$('[data-opt-value]', list).forEach(function (b) { b.addEventListener('click', function () { var v = b.getAttribute('data-opt-value'); var o = options.filter(function (x) { return x.value === v; })[0] || { value: v, label: v, create: true }; if (o.create === true) options.push({ value: v, label: v }); choose(o); }); });
    }
    box._setOptions = function (list) { options = list.map(function (o) { return typeof o === 'string' ? { value: o, label: o } : o; }); if (!menu.hidden) render(); };
    input.addEventListener('focus', open); input.addEventListener('click', open);
    input.addEventListener('input', function () { if (clearWrap) clearWrap.hidden = !input.value; if (menu.hidden) open(); else render(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter') { e.preventDefault(); var q = input.value.trim().toLowerCase(); var o = options.filter(function (x) { return x.label.toLowerCase() === q; })[0]; if (o) choose(o); else if (creatable) close(); }
    });
    input.addEventListener('blur', function () { if (hidden) { var o = options.filter(function (x) { return x.value === hidden.value; })[0]; input.value = o ? o.label : ''; if (clearWrap) clearWrap.hidden = !input.value; } });
    caret.addEventListener('click', function () { if (menu.hidden) { open(); input.focus(); } else close(); });
    var clear = $('[data-typeahead-clear]', box);
    if (clear) clear.addEventListener('click', function () { input.value = ''; if (hidden) { hidden.value = ''; hidden.dispatchEvent(new Event('change', { bubbles: true })); } else input.dispatchEvent(new Event('change', { bubbles: true })); clearWrap.hidden = true; render(); });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) close(); });
  });

  // ---------------------------------------------------------------- credential forms
  $$('form[data-credential-form]').forEach(function (form) {
    var typeInput = $('[data-type-select] [data-typeahead-value]', form);
    function showType(id) {
      $$('[data-type-form]', form).forEach(function (sub) {
        var on = sub.getAttribute('data-type-form') === String(id);
        if (on === !sub.hidden && sub.hasAttribute('data-type-init')) return;
        sub.setAttribute('data-type-init', '1');
        sub.hidden = !on;
        // Only the visible sub-form carries the canonical element ids.
        var prefix = 't' + sub.getAttribute('data-type-form') + '-';
        $$('[data-id]', sub).forEach(function (el2) { el2.id = on ? el2.getAttribute('data-id') : prefix + el2.getAttribute('data-id'); });
        $$('[data-for]', sub).forEach(function (el2) { el2.htmlFor = on ? el2.getAttribute('data-for') : prefix + el2.getAttribute('data-for'); });
        $$('input,select,textarea,button', sub).forEach(function (el2) {
          if (on) { if (el2.hasAttribute('data-hidden-disabled')) { el2.disabled = false; el2.removeAttribute('data-hidden-disabled'); } }
          else if (!el2.disabled) { el2.disabled = true; el2.setAttribute('data-hidden-disabled', '1'); }
        });
      });
    }
    if (typeInput) { typeInput.addEventListener('change', function () { showType(typeInput.value); }); showType(typeInput.value); }
    else { var current = $('[data-type-form]:not([hidden])', form); showType(current ? current.getAttribute('data-type-form') : ''); }
    $$('[data-toggle-password]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = $('[data-secret-input]', b.closest('[data-secret-group]')); if (!inp) return;
        var show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
        $('[data-icon-show]', b).hidden = show; $('[data-icon-hide]', b).hidden = !show; setTooltip(b, show ? t('Hide') : t('Show'));
      });
    });
    $$('[data-replace]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var group = b.closest('[data-secret-group]'), inp = $('[data-secret-input]', group), ctl = inp.closest('.pf-v6-c-form-control'), toggle = $('[data-toggle-password]', group), ext = $('[data-external-secret]', group), browse = $('[data-file-browse]', group);
        var replaced = b.getAttribute('data-replaced') === '1';
        if (!replaced) { inp.disabled = false; inp.placeholder = ''; inp.value = ''; if (ctl) ctl.classList.remove('pf-m-disabled'); if (toggle) toggle.disabled = false; if (browse) browse.disabled = false; if (ext) ext.disabled = false; b.setAttribute('data-replaced', '1'); b.setAttribute('aria-label', t('Revert field to previously saved value')); setTooltip(b, t('Revert')); inp.focus(); }
        else { inp.disabled = true; inp.placeholder = t('ENCRYPTED'); inp.value = ''; if (ctl) ctl.classList.add('pf-m-disabled'); if (toggle) toggle.disabled = true; if (browse) browse.disabled = true; if (ext) ext.disabled = true; b.removeAttribute('data-replaced'); b.setAttribute('aria-label', t('Replace field with new value')); setTooltip(b, t('Replace')); }
      });
    });
    $$('[data-prompt-toggle]', form).forEach(function (cb) {
      cb.addEventListener('change', function () {
        var group = $('[data-secret-group]', cb.closest('.pf-v6-c-form__group')), inp = $('[data-secret-input]', group), ctl = inp.closest('.pf-v6-c-form-control'), toggle = $('[data-toggle-password]', group), ext = $('[data-external-secret]', group), rep = $('[data-replace]', group);
        var lock = cb.checked || (rep && rep.getAttribute('data-replaced') !== '1');
        inp.disabled = lock; if (ctl) ctl.classList.toggle('pf-m-disabled', lock); if (toggle) toggle.disabled = lock; if (ext) ext.disabled = lock || !!inp.value;
      });
    });
    $$('[data-file-upload]', form).forEach(function (up) {
      var fileInput = $('[data-file-input]', up), name = $('[data-file-name]', up), ta = $('textarea', up), browse = $('[data-file-browse]', up), clear = $('[data-file-clear]', up);
      browse.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var f = fileInput.files[0]; if (!f) return;
        var reader = new FileReader(); reader.onload = function () { ta.value = reader.result; name.value = f.name; clear.disabled = false; ta.dispatchEvent(new Event('input', { bubbles: true })); }; reader.readAsText(f);
      });
      ta.addEventListener('input', function () { clear.disabled = !ta.value && !name.value; });
      clear.addEventListener('click', function () { ta.value = ''; name.value = ''; fileInput.value = ''; clear.disabled = true; });
      if (ta.value) clear.disabled = false;
    });
    $$('[data-plain-input]', form).forEach(function (inp) {
      // The key button is off while the field holds the value it was saved with.
      inp.addEventListener('input', function () { var ext = $('[data-external-secret]', inp.closest('.pf-v6-c-input-group')); if (ext) ext.disabled = !!inp.defaultValue && inp.value === inp.defaultValue; });
    });
  });

  // ---------------------------------------------------------------- hosts and groups
  $$('[data-host-toggle]').forEach(function (sw) {
    sw.addEventListener('change', function () {
      var on = sw.checked; sw.disabled = true;
      api('PATCH', '/api/v2/hosts/' + sw.getAttribute('data-host-toggle') + '/', { enabled: on }).then(function (r) {
        sw.disabled = false; if (!r.ok) { sw.checked = !on; errorModal(t('Error!'), t('Failed to toggle host.') + ' ' + errorText(r)); }
      });
    });
  });
  $$('[data-disassociate-selected]').forEach(function (btn) {
    var table = $('[data-list-table]'); if (!table) return;
    var rows = $$('[data-select-row]', table);
    function sync() { btn.disabled = !rows.some(function (r) { return r.checked; }); }
    rows.forEach(function (r) { r.addEventListener('change', sync); });
    var all = $('[data-select-all]'); if (all) all.addEventListener('change', function () { setTimeout(sync, 0); });
    btn.addEventListener('click', function () {
      var sel = rows.filter(function (r) { return r.checked; }).map(function (r) { return r.closest('[data-row]'); });
      var kind = (btn.getAttribute('data-kind') || 'item').toLowerCase();
      confirmModal({ title: tOr('Disassociate related ' + kind + (sel.length > 1 ? 's' : '') + '?', 'Disassociate?'), body: t('This action will disassociate the following:'), items: sel.map(function (r) { return r.getAttribute('data-name'); }), confirmLabel: t('Disassociate'), onConfirm: function (m) {
        Promise.all(sel.map(function (r) { return api('POST', btn.getAttribute('data-api'), { id: parseInt(r.getAttribute('data-id'), 10), disassociate: true }); })).then(function (results) {
          closeModal(m); var failed = results.filter(function (r) { return !r.ok; });
          if (failed.length) errorModal(t('Error!'), errorText(failed[0])); else location.reload();
        });
      } });
    });
  });
  $$('[data-label-more]').forEach(function (b) {
    b.addEventListener('click', function () {
      api('GET', b.getAttribute('data-label-more')).then(function (r) {
        if (!r.ok) return;
        var ul = b.closest('ul'); ul.innerHTML = (r.data.results || []).map(function (g) { return '<li class="pf-v6-c-label-group__list-item"><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(g.name) + '</span></span></span></li>'; }).join('');
      });
    });
  });
  $$('[data-source-sync], [data-sync-all]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-source-sync') || b.getAttribute('data-sync-all');
      api('POST', url).then(function (r) {
        // InventorySourceSyncButton raised no alert either.
        if (r.ok) location.reload(); else errorModal(t('Inventory Source Sync Error'), t('Failed to sync inventory source.') + ' ' + errorText(r));
      });
    });
  });

  // ---------------------------------------------------------------- code editor
  (function () {
    var CM = window.AscenderCM; if (!CM) return;
    var color = function (n, f) { return 'var(--ascender-code--' + n + ', ' + f + ')'; };
    var BG = color('BackgroundColor', '#141414'), FG = color('Color', '#f8f8f8'), GBG = color('gutter--BackgroundColor', '#232323'), GFG = color('gutter--Color', '#e2e2e2');
    var GACT = color('gutter--active--BackgroundColor', 'rgba(255, 255, 255, 0.031)'), ACT = color('activeLine--BackgroundColor', 'rgba(255, 255, 255, 0.031)'), SEL = color('selection--BackgroundColor', 'rgba(221, 240, 255, 0.2)');
    var CUR = color('cursor--Color', '#a7a7a7'), MATCH = color('searchMatch--BackgroundColor', 'rgba(205, 168, 105, 0.4)'), KW = color('keyword--Color', '#cda869'), STR = color('string--Color', '#8f9d6a');
    var NUM = color('number--Color', '#cf6a4c'), COM = color('comment--Color', '#5f5a60'), VAR = color('variable--Color', '#7587a6'), FN = color('function--Color', '#dad085'), TYPE = color('type--Color', '#9b859d');
    var theme = CM.EditorView.theme({
      '&': { backgroundColor: BG, color: FG, fontSize: '16px' },
      '.cm-content': { caretColor: CUR, fontFamily: 'var(--pf-t--global--font--family--mono, monospace)', paddingTop: '4px', paddingBottom: '4px' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: CUR },
      // As specific as the base theme's own focused-selection rule
      // (&dark.cm-focused > .cm-scroller > .cm-selectionLayer ...), which
      // otherwise wins with its #233: next to the active line's colour it
      // left a selection on that line all but invisible.
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection': { backgroundColor: SEL },
      '.cm-activeLine': { backgroundColor: ACT },
      '.cm-gutters': { backgroundColor: GBG, color: GFG, border: 'none' },
      '.cm-activeLineGutter': { backgroundColor: GACT },
      '.cm-scroller': { scrollbarWidth: 'thin' },
      '.cm-panels': { backgroundColor: GBG, color: GFG },
      '.cm-panels input, .cm-panels button': { fontSize: '14px' },
      '.cm-searchMatch': { backgroundColor: MATCH },
      '.cm-searchMatch.cm-searchMatch-selected': { outline: '1px solid ' + KW }
    }, { dark: true });
    var tg = CM.tags;
    var highlight = CM.HighlightStyle.define([
      { tag: [tg.comment, tg.lineComment, tg.blockComment], color: COM, fontStyle: 'italic' },
      { tag: [tg.keyword, tg.modifier, tg.operatorKeyword], color: KW },
      { tag: [tg.string, tg.special(tg.string), tg.regexp, tg.content], color: STR },
      { tag: [tg.number, tg.bool, tg.null, tg.atom], color: NUM },
      { tag: [tg.variableName, tg.propertyName, tg.attributeName], color: VAR },
      { tag: [tg.function(tg.variableName), tg.function(tg.propertyName)], color: FN },
      { tag: [tg.typeName, tg.className, tg.tagName], color: TYPE },
      { tag: [tg.meta, tg.processingInstruction], color: COM },
      { tag: tg.invalid, color: FG, backgroundColor: NUM }
    ]);
    var LINE = 24, PAD = 8, MAX_ROWS = 50;
    function heightTheme(rows, minRows) {
      if (rows === 'auto') return CM.EditorView.theme({ '&': { minHeight: ((minRows || 1) * LINE + PAD) + 'px', maxHeight: (MAX_ROWS * LINE + PAD) + 'px' }, '.cm-scroller': { overflow: 'auto' } });
      return CM.EditorView.theme({ '&': { height: (rows * LINE + PAD) + 'px' }, '.cm-scroller': { overflow: 'auto' } });
    }
    // A drag handle on the height (PatternFly's pf-m-resize-vertical): on
    // editable editors, and on read-only ones that ask with data-resizable.
    // A dragged height replaces the rows sizing, the editor fills it and
    // scrolls inside it, and it is remembered in localStorage under the
    // field's key (data-height-key, else data-editor-id), so every box for
    // that field opens at it. A double click on the handle forgets it.
    var HANDLE = 16, FILL = CM.EditorView.theme({ '&': { height: '100%', minHeight: 0 }, '.cm-scroller': { height: '100%', overflow: 'auto' } });
    // Storage can throw (private windows, blocked site data); then nothing is kept.
    function savedHeight(key) { try { return key ? localStorage.getItem(key) : null; } catch (e) { return null; } }
    function saveHeight(key, h) { try { if (!key) return; if (h) localStorage.setItem(key, h); else localStorage.removeItem(key); } catch (e) {} }
    function makeResizable(wrap, view, comp, base, key) {
      var resized = !!wrap.style.height;
      function set(on) { if (on === resized) return; resized = on; wrap.classList.toggle('ascender-code-editor__wrapper--resized', on); view.dispatch({ effects: comp.reconfigure(on ? FILL : base) }); }
      function onHandle(e) { var box = wrap.getBoundingClientRect(); return resized && box.right - e.clientX <= HANDLE && box.bottom - e.clientY <= HANDLE; }
      // The handle is the browser's and takes no title of its own, so the
      // wrapper carries one only while the pointer is on a dragged handle.
      var tip = t('Double-click to reset the size');
      function hint(on) { if (on) { if (wrap.title !== tip) wrap.title = tip; } else if (wrap.hasAttribute('title')) wrap.removeAttribute('title'); }
      if (window.ResizeObserver) new ResizeObserver(function () { if (wrap.style.height) { set(true); saveHeight(key, wrap.style.height); } }).observe(wrap);
      wrap.addEventListener('mousemove', function (e) { hint(onHandle(e)); });
      wrap.addEventListener('mouseleave', function () { hint(false); });
      wrap.addEventListener('dblclick', function (e) {
        if (!onHandle(e)) return;
        wrap.style.height = ''; saveHeight(key, null); set(false); hint(false);
      });
    }
    function yamlToJson(src) { if (!src || !src.trim()) return '{}'; var v = CM.jsyaml.load(src); if (!v) return '{}'; if (typeof v !== 'object') throw new Error('yaml is not in object format'); return JSON.stringify(v, null, 2); }
    function jsonToYaml(src) { if (src.trim() === '') return '---\n'; var v = JSON.parse(src); if (Object.keys(v).length === 0) return '---\n'; return CM.jsyaml.dump(v); }
    function language(mode) { if (mode === 'jinja2') return CM.StreamLanguage.define(CM.jinja2); return (mode === 'javascript' || mode === 'json') ? CM.json() : CM.yaml(); }
    // openingAnchor: YAML documents open with the cursor after a leading
    // "---" line, as CodeEditor did.
    function openingAnchor(doc, mode) {
      if (mode !== 'yaml') return 0;
      var at = doc.indexOf('\n'), first = at === -1 ? doc : doc.slice(0, at);
      if (first.trim() !== '---') return 0;
      return at === -1 ? doc.length : at + 1;
    }
    function initEditor(wrap) {
      if (wrap.cmView) return;
      var ta = $('[data-code-editor-value]', wrap), readOnly = wrap.hasAttribute('data-readonly');
      var rows = wrap.getAttribute('data-rows'); rows = rows === 'auto' ? 'auto' : parseInt(rows || '6', 10);
      var mode = wrap.getAttribute('data-mode') || 'yaml';
      var value = ta.value;
      if (mode === 'javascript') { try { value = JSON.stringify(JSON.parse(value), null, 2); } catch (e) {} }
      if (wrap.getAttribute('data-source') === 'json' && mode === 'yaml') { try { value = jsonToYaml(value); } catch (e) {} }
      var lang = new CM.Compartment(), size = new CM.Compartment();
      var baseHeight = heightTheme(rows, parseInt(wrap.getAttribute('data-min-rows') || '1', 10));
      var resizable = !readOnly || wrap.hasAttribute('data-resizable'), heightKey = null;
      if (resizable) {
        var k = wrap.getAttribute('data-height-key') || wrap.getAttribute('data-editor-id');
        heightKey = k ? 'codeEditorHeight:' + k : null;
        wrap.classList.add('ascender-code-editor__wrapper--resizable', 'pf-m-resize-vertical');
        // set before the editor is built, so a remembered height does not flash the default first
        var saved = savedHeight(heightKey);
        if (saved) { wrap.style.height = saved; wrap.classList.add('ascender-code-editor__wrapper--resized'); }
      }
      var lastYaml = mode === 'yaml' ? value : null, jsonEdited = false;
      var view = new CM.EditorView({ parent: wrap, state: CM.EditorState.create({ doc: value, selection: { anchor: openingAnchor(value, mode) }, extensions: [
        CM.lineNumbers(), CM.highlightSpecialChars(), CM.history(), CM.drawSelection(), CM.indentOnInput(), CM.bracketMatching(), CM.highlightSelectionMatches(), CM.search({ top: true }),
        CM.keymap.of([].concat(CM.defaultKeymap, CM.historyKeymap, CM.searchKeymap)), theme, CM.syntaxHighlighting(highlight), lang.of(language(mode)),
        // Only editable editors highlight the active line, as CodeEditor did.
        readOnly ? [CM.EditorView.editable.of(false), CM.EditorState.readOnly.of(true)] : [CM.EditorView.editable.of(true), CM.EditorState.readOnly.of(false), CM.highlightActiveLine(), CM.highlightActiveLineGutter()],
        size.of(wrap.style.height ? FILL : baseHeight),
        CM.EditorView.updateListener.of(function (u) { if (u.docChanged) { var doc = u.state.doc.toString(); ta.value = doc; if (mode === 'javascript') jsonEdited = true; else { lastYaml = doc; jsonEdited = false; } if (!wrap.silent) ta.dispatchEvent(new Event('input', { bubbles: true })); } })
      ] }) });
      ta.value = value; wrap.cmView = view;
      if (resizable) makeResizable(wrap, view, size, baseHeight, heightKey);
      var content = view.contentDOM; content.tabIndex = readOnly ? 0 : -1; content.setAttribute('data-language', mode);
      var id = wrap.getAttribute('data-editor-id');
      if (id) { content.id = id; var label = document.querySelector('label[for="' + id + '"]'); if (label) { if (!label.id) label.id = id + '-label'; content.setAttribute('aria-labelledby', label.id); } }
      var focusWrap = wrap.closest('[data-editor-focus]');
      if (focusWrap && !readOnly) {
        focusWrap.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target === focusWrap) { e.preventDefault(); view.focus(); } });
        content.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); focusWrap.focus(); } });
      }
      var group = wrap.closest('[data-editor-group]');
      if (group) $$('[data-editor-mode]', group).forEach(function (b) {
        b.addEventListener('click', function () {
          var m = b.getAttribute('data-editor-mode'); if (m === mode) return;
          var cur = view.state.doc.toString(), next;
          try { next = (m === 'yaml' && !jsonEdited && lastYaml !== null) ? lastYaml : (m === 'yaml' ? jsonToYaml(cur) : yamlToJson(cur)); }
          catch (err) { errorModal(t('Error!'), err.message); return; }
          mode = m;
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, effects: lang.reconfigure(language(m)) });
          content.setAttribute('data-language', m); ta.value = next;
          $$('[data-editor-mode]', group).forEach(function (x) { var on = x.getAttribute('data-editor-mode') === m; x.classList.toggle('pf-m-primary', on); x.classList.toggle('pf-m-secondary', !on); });
        });
      });
    }
    $$('[data-code-editor]').forEach(initEditor);
    window.ASCENDER = window.ASCENDER || {}; window.ASCENDER.initEditor = initEditor;
  })();

  document.dispatchEvent(new CustomEvent('ascender:ready'));

  // ---------------------------------------------------------------- pending approvals badge
  if (A.user) {
    api('GET', '/api/v2/workflow_approvals/?status=pending&page_size=1').then(function (r) {
      if (!r.ok || !r.data) return; var n = r.data.count || 0; var b = $('#toolbar-workflow-approval-badge');
      if (b) { b.classList.toggle('pf-m-unread', n > 0); b.classList.toggle('pf-m-read', n === 0); var c = $('#toolbar-workflow-approval-count'); if (c) { c.hidden = n === 0; c.textContent = n; } }
    });
  }
})();
(function () {
  var c = document.querySelector('[data-output-scroll-container]');
  if (!c) return;
  var allLines = function () { return Array.prototype.slice.call(c.querySelectorAll('[data-output-line]')); };
  var pageH = function () { return c.clientHeight; };
  document.querySelectorAll('[data-output-scroll]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.getAttribute('data-output-scroll');
      if (a === 'first') c.scrollTop = 0; else if (a === 'last') c.scrollTop = c.scrollHeight; else if (a === 'prev') c.scrollTop -= pageH(); else c.scrollTop += pageH();
    });
  });
  var copy = document.querySelector('[data-copy-output]');
  if (copy) copy.addEventListener('click', function () {
    var text = allLines().map(function (l) { var t = l.querySelector('.ascender-job-event-line-text'); var clone = t.cloneNode(true); var tm = clone.querySelector('.time'); if (tm) tm.remove(); return clone.textContent; }).join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    // OutputToolbar's tooltip said Copied for two seconds.
    var tipUI = (window.ASCENDER || {}).ui || {}, was = copy.getAttribute('data-tooltip');
    if (tipUI.setTooltip) { tipUI.setTooltip(copy, t('Copied')); setTimeout(function () { tipUI.setTooltip(copy, was); }, 2000); }
  });
})();
