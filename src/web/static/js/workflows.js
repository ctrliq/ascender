/* Workflow job template form and workflow approvals: the webhook sub-form,
   approve and deny (row, bulk and detail buttons) and cancelling the
   workflow an approval belongs to. Plain JavaScript on top of the helpers
   app.js exports. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, api = U.api, el = U.el, esc = U.esc, ICON = U.ICON;

  // A toast that survives the reload an action ends with.
  var FLASH = 'ascender-flash';
  function flashAndReload(msg) {
    try { sessionStorage.setItem(FLASH, msg); } catch (e) {}
    location.reload();
  }
  try {
    var pending = sessionStorage.getItem(FLASH);
    if (pending) { sessionStorage.removeItem(FLASH); U.toast('success', pending); }
  } catch (e) {}

  // Tooltips that name a date: {dt} becomes the browser's local time.
  $$('[data-dt-title]').forEach(function (n) {
    var d = new Date(n.getAttribute('data-dt'));
    var when = isNaN(d) ? '' : d.toLocaleString();
    U.setTooltip(n, n.getAttribute('data-dt-title').replace('{dt}', when));
  });

  // ---------------------------------------------------------------- workflow template form
  var form = $('form[data-workflow-template-form]');
  if (form) {
    var enable = $('[data-enable-webhook]', form), details = $('[data-webhook-details]', form);
    var svc = $('[data-webhook-service]', form), url = $('[data-webhook-url]', form), key = $('[data-webhook-key]', form);
    var credBox = $('[data-webhook-credential]', form), credGroup = credBox && $('[data-lookup]', credBox);
    var templateId = form.getAttribute('data-template-id'), origin = form.getAttribute('data-origin');
    var initial = {
      service: svc ? svc.getAttribute('data-initial') : '', url: url ? url.value : '', key: key ? key.value : '',
      credId: credGroup ? $('[data-lookup-id]', credGroup).value : '', credName: credGroup ? $('[data-lookup-hidden-name]', credGroup).value : ''
    };
    function setCredential(id, name) {
      if (!credGroup) return;
      $('[data-lookup-id]', credGroup).value = id; $('[data-lookup-hidden-name]', credGroup).value = name; $('[data-lookup-name]', credGroup).value = name;
    }
    function credentialFor(service) {
      if (!credBox) return;
      credBox.hidden = !service;
      if (service) credGroup.setAttribute('data-filter', 'credential_type__namespace=' + service + '_token');
    }
    // Turning webhooks on restores what the template had; off clears it.
    if (enable) enable.addEventListener('change', function () {
      details.hidden = !enable.checked;
      if (enable.checked) {
        svc.value = initial.service; url.value = initial.url; key.value = initial.key; setCredential(initial.credId, initial.credName);
        credentialFor(initial.service);
      } else {
        svc.value = ''; url.value = ''; key.value = ''; setCredential('', '');
      }
    });
    if (svc) svc.addEventListener('change', function () {
      var val = svc.value;
      url.value = templateId ? origin + '/api/v2/workflow_job_templates/' + templateId + '/' + val + '/' : t('a new webhook url will be generated on save.').toUpperCase();
      if (val === initial.service || val === '') { key.value = initial.key; setCredential(initial.credId, initial.credName); }
      else { key.value = ''; setCredential('', ''); }
      credentialFor(val);
    });
    $$('[data-webhook-key-refresh]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        api('POST', b.getAttribute('data-webhook-key-refresh')).then(function (r) {
          if (r.ok) key.value = r.data.webhook_key; else U.errorModal(t('Error!'), U.errorText(r));
        });
      });
    });
  }

  // ---------------------------------------------------------------- approve and deny
  var DONE = { approve: t('Successfully Approved'), deny: t('Successfully Denied') };
  $$('[data-approval-vote]').forEach(function (b) {
    b.addEventListener('click', function () {
      var vote = b.getAttribute('data-approval-vote');
      b.disabled = true;
      api('POST', b.getAttribute('data-api') + vote + '/').then(function (r) {
        if (r.ok) { flashAndReload(DONE[vote]); return; }
        b.disabled = false;
        U.errorModal(t('Error!'), (vote === 'approve' ? t('Failed to approve {0}.', { 0: b.getAttribute('data-name') }) : t('Failed to deny {0}.', { 0: b.getAttribute('data-name') })) + ' ' + U.errorText(r));
      });
    });
  });

  // Toolbar buttons act on the selected rows; any row the user cannot act
  // on disables them, with the reason as their tooltip.
  var bulk = $$('[data-approval-bulk]');
  if (bulk.length) {
    var table = $('[data-list-table]');
    var rows = table ? $$('[data-select-row]', table) : [];
    function selected() { return rows.filter(function (r) { return r.checked; }).map(function (r) { return r.closest('[data-row]'); }); }
    function sync() {
      var sel = selected();
      var blocked = sel.filter(function (row) { return $('[data-select-row]', row).hasAttribute('data-cannot-act'); }).map(function (row) { return row.getAttribute('data-name'); });
      bulk.forEach(function (b) {
        var vote = b.getAttribute('data-approval-bulk'), tip = b.closest('[data-approval-bulk-tip]');
        b.disabled = sel.length === 0 || blocked.length > 0;
        var approve = vote === 'approve';
        if (sel.length === 0) U.setTooltip(tip, approve ? t('Select a row to approve') : t('Select a row to deny'));
        else if (blocked.length) U.setTooltip(tip, approve ? t('You are unable to act on the following workflow approvals: {itemsUnableToApprove}', { itemsUnableToApprove: blocked.join(', ') }) : t('You are unable to act on the following workflow approvals: {itemsUnableToDeny}', { itemsUnableToDeny: blocked.join(', ') }));
        else U.setTooltip(tip, approve ? t('Approve') : t('Deny'));
      });
    }
    rows.forEach(function (r) { r.addEventListener('change', sync); });
    var all = $('[data-select-all]');
    if (all) all.addEventListener('change', sync);
    bulk.forEach(function (b) {
      b.addEventListener('click', function () {
        var vote = b.getAttribute('data-approval-bulk');
        b.disabled = true;
        Promise.all(selected().map(function (row) { return api('POST', '/api/v2/workflow_approvals/' + row.getAttribute('data-id') + '/' + vote + '/'); })).then(function (results) {
          var failed = results.filter(function (r) { return !r.ok; });
          if (failed.length) { U.errorModal(t('Error!'), (vote === 'approve' ? t('Failed to approve one or more workflow approval.') : t('Failed to deny one or more workflow approval.')) + ' ' + U.errorText(failed[0])); sync(); return; }
          location.reload();
        });
      });
    });
    sync();
  }

  // ---------------------------------------------------------------- cancel workflow
  function cancelModal(title, message, onConfirm) {
    var root = $('#ascender-modal-root');
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div class="pf-v6-c-modal-box pf-m-danger pf-m-sm" role="dialog" aria-modal="true" aria-label="' + esc(title) + '" aria-labelledby="cancel-workflow-title"><div class="pf-v6-c-modal-box__close"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="Close" data-close-modal><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><h1 class="pf-v6-c-modal-box__title" id="cancel-workflow-title"><span class="pf-v6-c-modal-box__title-icon">' + ICON.warn + '</span><span class="pf-v6-c-modal-box__title-text">' + esc(title) + '</span></h1></header><div class="pf-v6-c-modal-box__body">' + esc(message) + '</div><footer class="pf-v6-c-modal-box__footer"><button id="cancel-job-confirm-button" aria-label="' + esc(t('Confirm cancel job')) + '" class="pf-v6-c-button pf-m-danger" type="button" data-confirm><span class="pf-v6-c-button__text">' + esc(t('Confirm cancellation')) + '</span></button><button id="cancel-job-return-button" aria-label="' + esc(t('Return')) + '" class="pf-v6-c-button pf-m-secondary" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Return')) + '</span></button></footer></div></div></div>');
    root.innerHTML = ''; root.appendChild(m); U.openModal(m);
    $('[data-confirm]', m).addEventListener('click', function () { U.closeModal(m); onConfirm(); });
  }
  $$('[data-cancel-workflow]').forEach(function (b) {
    b.addEventListener('click', function () {
      cancelModal(t('Cancel Workflow'), b.getAttribute('data-message'), function () {
        api('POST', b.getAttribute('data-cancel-workflow')).then(function (r) {
          if (r.ok || r.status === 405) {
            if (b.getAttribute('data-toast')) flashAndReload(b.getAttribute('data-toast')); else location.reload();
            return;
          }
          U.errorModal(t('Error!'), U.errorText(r));
        });
      });
    });
  });
})();
