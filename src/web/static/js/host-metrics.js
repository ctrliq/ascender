/* Host Metrics: HostMetricsDeleteButton, which soft deletes the selected
   hosts after an AlertModal listing them. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  var btn = document.querySelector('[data-host-metrics-delete]');
  if (!U || !btn) return;
  var $ = U.$, $$ = U.$$, esc = U.esc, el = U.el;
  var table = $('[data-list-table]');
  var rows = table ? $$('[data-select-row]', table) : [];
  function selected() { return rows.filter(function (r) { return r.checked; }).map(function (r) { return r.closest('[data-row]'); }); }
  function sync() { btn.disabled = selected().length === 0; }
  rows.forEach(function (r) { r.addEventListener('change', sync); });
  var all = $('[data-select-all]'); if (all) all.addEventListener('change', function () { setTimeout(sync, 0); });
  sync();

  // ExclamationCircleIcon as AlertModal's danger header drew it.
  var DANGER = '<svg class="pf-v6-svg" fill="currentColor" aria-hidden="true" role="img" width="1em" height="1em" style="color: var(--pf-t--global--color--status--danger--default);"><svg viewBox="0 0 512 512" class="pf-v6-icon-default"><path d="M504 256c0 136.997-111.043 248-248 248S8 392.997 8 256C8 119.083 119.043 8 256 8s248 111.083 248 248zm-248 50c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z"></path></svg><svg viewBox="0 0 32 32" class="pf-v6-icon-rh-ui"><path d="M16 1C7.729 1 1 7.729 1 16s6.729 15 15 15 15-6.729 15-15S24.271 1 16 1Zm-1.5 8a1.5 1.5 0 1 1 3 0v7a1.5 1.5 0 1 1-3 0V9ZM16 25.001a2 2 0 1 1-.001-3.999A2 2 0 0 1 16 25.001Z"></path></svg></svg>';

  btn.addEventListener('click', function () {
    var sel = selected(); if (!sel.length) return;
    var items = sel.map(function (r) { var n = r.getAttribute('data-name'); return '<span id="item-to-be-deleted-' + esc(n) + '"><strong>' + esc(n) + '</strong><br></span>'; }).join('');
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(t('Alert modal')) + '" aria-labelledby="alert-modal-header-label" aria-modal="true" class="pf-v6-c-modal-box pf-m-sm"><div class="pf-v6-c-modal-box__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-close-modal><span class="pf-v6-c-button__icon">' + U.ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><div class="ascender-alert-modal__header">' + DANGER + '<h2 id="alert-modal-header-label" class="pf-v6-c-title pf-m-2xl">' + esc(t('Soft delete {pluralizedItemName}?', { pluralizedItemName: t('Host Metrics') })) + '</h2></div></header><div class="pf-v6-c-modal-box__body"><div>' + esc(t('This action will soft delete the following:')) + '</div>' + items + '</div><footer class="pf-v6-c-modal-box__footer"><button aria-label="' + esc(t('confirm delete')) + '" class="pf-v6-c-button pf-m-danger" type="button" data-confirm><span class="pf-v6-c-button__text">' + esc(t('Delete')) + '</span></button><button aria-label="' + esc(t('cancel delete')) + '" class="pf-v6-c-button pf-m-link" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button></footer></div></div></div>');
    var root = $('#ascender-modal-root'); root.innerHTML = ''; root.appendChild(m); U.openModal(m);
    $('[data-confirm]', m).addEventListener('click', function () {
      this.disabled = true;
      Promise.all(sel.map(function (r) { return U.api('DELETE', '/api/v2/host_metrics/' + r.getAttribute('data-id') + '/'); })).then(function (results) {
        U.closeModal(m);
        var failed = results.filter(function (r) { return !r.ok; });
        if (failed.length) { U.errorModal(t('Error!'), U.errorText(failed[0])); return; }
        location.reload();
      });
    });
  });
})();
