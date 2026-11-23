/* Notification templates: the Test buttons of the list rows and the details
   (NotificationTemplateListItem / NotificationTemplateDetail), which send
   the test, show the status as Running and poll the notification until it
   settles; the list also raises a toast with the outcome. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  var buttons = document.querySelectorAll('[data-nt-test]');
  if (U) ntForm(U);
  if (!U || !buttons.length) return;
  var $ = U.$, esc = U.esc, el = U.el;
  var NUM_RETRIES = 25, RETRY_TIMEOUT = 5000;
  var detail = document.querySelector('[data-nt-detail]');

  function label(status) {
    var t = document.querySelector('template[data-nt-label="' + status + '"]');
    return t ? t.innerHTML : esc(status);
  }
  function setStatus(btn, status) {
    var holder = detail ? $('[data-nt-status]', detail) : btn.closest('tr').querySelector('[data-nt-status]');
    if (!holder && detail) {
      // The Status row appears once there is a notification.
      var orgRow = Array.prototype.find.call(detail.querySelectorAll('dt'), function (dt) { return dt.textContent === t('Organization'); });
      var row = el('<div><dt class="ascender-detail-name">' + esc(t('Status')) + '</dt><dd class="ascender-detail-value" data-nt-status></dd></div>');
      if (orgRow) orgRow.parentNode.parentNode.insertBefore(row, orgRow.parentNode); else $('dl', detail).appendChild(row);
      holder = $('[data-nt-status]', row);
    }
    if (holder) holder.innerHTML = status ? label(status) : '';
    btn.disabled = status === 'running' || (detail && status === 'pending');
  }
  // useToast: a toast with the template's name and the outcome.
  function addToast(n) {
    var group = $('#ascender-toasts'); if (!group) return;
    var failed = n.status === 'failed';
    var message = n.status === 'successful' ? t('Notification sent successfully') : (n.error === 'timed out' ? t('Notification timed out') : n.error);
    var name = (n.summary_fields && n.summary_fields.notification_template && n.summary_fields.notification_template.name) || '';
    var li = el('<li class="pf-v6-c-alert-group__item"><div class="pf-v6-c-alert pf-m-' + (failed ? 'danger' : 'success') + '" aria-label="' + (failed ? 'Danger' : 'Success') + ' Alert">' +
      '<div class="pf-v6-c-alert__icon">' + (failed ? U.ICON.warn : '') + '</div><p class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">' + (failed ? 'Danger alert:' : 'Success alert:') + '</span>' + esc(name) + '</p>' +
      '<div class="pf-v6-c-alert__action"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-toast-close><span class="pf-v6-c-button__icon">' + U.ICON.close + '</span></button></div>' +
      '<div class="pf-v6-c-alert__description">' + esc(message || '') + '</div></div></li>');
    group.appendChild(li);
    $('[data-toast-close]', li).addEventListener('click', function () { li.remove(); });
    if (!failed) setTimeout(function () { li.remove(); }, 8000);
  }

  Array.prototype.forEach.call(buttons, function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-nt-test');
      setStatus(btn, 'running');
      U.api('POST', '/api/v2/notification_templates/' + id + '/test/', {}).then(function (r) {
        if (!r.ok || !r.data) {
          setStatus(btn, 'error');
          U.errorModal(t('Error!'), (detail ? t('Notification test failed.') : t('Failed to send test notification.')) + ' ' + U.errorText(r));
          return;
        }
        var nid = r.data.notification, retries = NUM_RETRIES;
        function poll() {
          U.api('GET', '/api/v2/notifications/' + nid + '/').then(function (res) {
            var n = res.data || {};
            if (n.status && n.status !== 'pending') {
              if (!detail) addToast(n);
              setStatus(btn, n.status);
              return;
            }
            retries--;
            if (retries > 0) setTimeout(poll, RETRY_TIMEOUT);
          });
        }
        setTimeout(poll, RETRY_TIMEOUT);
      });
    });
  });

  /* NotificationTemplateForm: the type's fields follow the type select,
     the custom messages are reset to the new type's defaults
     (CustomMessagesSubForm) and show only the messages and bodies the type
     uses. */
  function ntForm(U) {
    var form = document.querySelector('[data-nt-form]');
    if (!form) return;
    var q = U.$, qa = U.$$;
    var defaults = {};
    try { defaults = JSON.parse(form.getAttribute('data-defaults') || '{}'); } catch (e) {}
    var select = q('[data-nt-type-select]', form), prev = select.value;
    function setEditor(ta, text) {
      var wrap = ta.closest('[data-code-editor]');
      ta.value = text;
      if (wrap && wrap.cmView) { var v = wrap.cmView; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } }); }
    }
    function get(obj, path) { return path.split('.').reduce(function (o, k) { return o && o[k]; }, obj); }
    function showMessages(type) {
      var showMsg = type !== 'webhook', showBody = ['email', 'matrix', 'pagerduty', 'webhook'].indexOf(type) !== -1;
      qa('[data-nt-message]', form).forEach(function (g) { g.hidden = g.getAttribute('data-nt-message') === 'body' ? !showBody : !showMsg; });
    }
    select.addEventListener('change', function () {
      var type = select.value;
      qa('[data-nt-type]', form).forEach(function (s) { s.hidden = s.getAttribute('data-nt-type') !== type; });
      if (type !== prev) {
        var defs = defaults[type];
        if (defs) qa('[data-nt-msg]', form).forEach(function (ta) { setEditor(ta, get(defs, ta.getAttribute('data-nt-msg')) || ''); });
        prev = type;
      }
      showMessages(type);
    });
    var toggle = q('[data-nt-custom-toggle]', form), sub = q('[data-nt-messages]', form);
    toggle.addEventListener('change', function () {
      sub.hidden = !toggle.checked;
      if (toggle.checked) qa('[data-code-editor]', sub).forEach(function (w) { if (w.cmView) w.cmView.requestMeasure(); });
    });
    qa('[data-nt-toggle-password]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = q('input[type=password], input[type=text]', b.closest('.pf-v6-c-input-group__item'));
        var showing = inp.type === 'password'; inp.type = showing ? 'text' : 'password';
        q('[data-icon-show]', b).hidden = showing; q('[data-icon-hide]', b).hidden = !showing; U.setTooltip(b, showing ? t('Hide') : t('Show'));
      });
    });
    qa('[data-nt-secret]', form).forEach(function (inp) {
      var edited = q('[data-nt-edited]', inp.closest('.pf-v6-c-form__group'));
      inp.addEventListener('input', function () { if (edited) edited.value = '1'; });
    });
    // RevertButton on a secret of the edit screen: back to blank.
    qa('[data-nt-revert]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = document.getElementById(b.getAttribute('data-nt-revert'));
        inp.value = ''; inp.placeholder = '';
        var edited = q('[data-nt-edited]', b.closest('.pf-v6-c-form__group')); if (edited) edited.value = '1';
      });
    });
  }
})();
