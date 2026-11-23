/* Applications and tokens: ClipboardCopy's expansion toggle, the modals
   that show a new application's client secret or a new token once, and ApplicationForm's rule that an
   authorization-code application needs redirect URIs. Built on the helpers
   app.js exports. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, esc = U.esc, el = U.el;



  // ---------------------------------------------------------------- ClipboardCopy
  $$('[data-clipboard-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var root = b.closest('[data-clipboard-expansion]');
      var open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      root.classList.toggle('pf-m-expanded', open);
      $('.pf-v6-c-clipboard-copy__expandable-content', root).hidden = !open;
    });
  });

  // ---------------------------------------------------------------- one-time modals
  // The create posts render the new object's page with its secret; the URL
  // becomes that page's so a reload does not post again.
  $$('[data-open-on-load]').forEach(function (m) { U.openModal(m); });
  var replace = $('[data-replace-url]');
  if (replace && window.history && history.replaceState) history.replaceState(null, '', replace.getAttribute('data-replace-url'));

  // ---------------------------------------------------------------- ApplicationForm
  $$('form[data-application-form]').forEach(function (form) {
    var grant = $('#authType', form), uris = $('[data-redirect-uris]', form);
    if (!grant || !uris) return;
    var label = $('label[for=redirect_uris]', form);
    grant.addEventListener('change', function () {
      var need = grant.value === 'authorization-code';
      var star = $('.pf-v6-c-form__label-required', label);
      if (need && !star) label.appendChild(el('<span class="pf-v6-c-form__label-required" aria-hidden="true">&nbsp;*</span>'));
      if (!need && star) label.removeChild(star);
      if (need) uris.setAttribute('required', ''); else uris.removeAttribute('required');
    });
  });
})();
