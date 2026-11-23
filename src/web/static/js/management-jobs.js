// Management jobs list (ManagementJobListItem, LaunchManagementPrompt): the
// rocket launches a system job and opens its output; the cleanup jobs first
// ask how many days of data to keep.
(function () {
  'use strict';
  var U = window.ASCENDER && window.ASCENDER.ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, esc = U.esc;
  var MAX_RETENTION = 99999;

  // Resolves to null once the job's output opens, or to the error to show:
  // a request that never got a response counts as a failed launch too, so
  // the callers always re-enable their buttons.
  function launch(id, body) {
    var url = '/api/v2/system_job_templates/' + id + '/launch/';
    return U.api('POST', url, body).then(function (r) {
      if (r.ok && r.data && r.data.id) { location.href = '/jobs/management/' + r.data.id + '/output'; return null; }
      return { url: url, r: r };
    }, function (e) {
      return { url: url, r: { status: 0, ok: false, data: { detail: (e && e.message) || String(e) } } };
    });
  }

  var days = {};
  var prompt = $('#mj-launch-prompt');
  var current = null;

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mj-launch]');
    if (b) {
      var id = b.getAttribute('data-mj-launch');
      if (b.hasAttribute('data-mj-prompt')) {
        current = b;
        $('[data-mj-days]', prompt).value = days[id] === undefined ? 30 : days[id];
        $('[data-mj-confirm]', prompt).disabled = false;
        U.openModal(prompt);
        return;
      }
      b.disabled = true;
      launch(id, {}).then(function (err) {
        b.disabled = false;
        if (err) U.alertModal('error', t('Error!'), '', esc(t('Failed to launch job.')) + U.errorDetail('POST', err.url, err.r));
      });
      return;
    }
    var c = e.target.closest('[data-mj-confirm]');
    if (c && current) {
      var jid = current.getAttribute('data-mj-launch'), btn = current;
      c.disabled = true; btn.disabled = true;
      launch(jid, { extra_vars: { days: Number(days[jid] === undefined ? 30 : days[jid]) } }).then(function (err) {
        c.disabled = false; btn.disabled = false;
        if (err) U.alertModal('danger', t('Management job launch error'), t('Management job launch error'), U.errorDetail('POST', err.url, err.r));
      });
    }
  });

  if (prompt) {
    $('[data-mj-days]', prompt).addEventListener('input', function (e) {
      if (!current) return;
      var v = Number(e.target.value);
      if (isNaN(v)) v = 0;
      v = Math.min(Math.max(v, 0), MAX_RETENTION);
      days[current.getAttribute('data-mj-launch')] = v;
      if (String(v) !== e.target.value) e.target.value = v;
    });
  }
})();
