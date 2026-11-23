/* Schedules: the enable switches, the detail page's occurrence toggle and
   the schedule form (frequency menus, sub-forms, date and time pickers and
   the prompt wizard). Plain JavaScript on top of the helpers app.js exports. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, api = U.api, esc = U.esc, pad = U.pad;

  // ---------------------------------------------------------------- toggles
  $$('[data-schedule-toggle]').forEach(function (sw) {
    sw.addEventListener('change', function () {
      var url = sw.getAttribute('data-schedule-toggle'), want = sw.checked;
      sw.disabled = true;
      api('PATCH', url, { enabled: want }).then(function (r) {
        sw.disabled = false;
        if (!r.ok) { sw.checked = !want; U.errorModal(t('Error!'), t('Failed to toggle schedule.') + ' ' + U.errorText(r)); return; }
        var label = sw.closest('.pf-v6-c-switch');
        if (label) U.setTooltip(label, r.data.enabled ? t('Schedule is active') : t('Schedule is inactive'));
      });
    });
  });

  // ---------------------------------------------------------------- occurrences
  $$('[data-occurrence-toggle]').forEach(function (group) {
    $$('[data-occurrence-mode]', group).forEach(function (b) {
      b.addEventListener('click', function () {
        var mode = b.getAttribute('data-occurrence-mode');
        $$('[data-occurrence-mode]', group).forEach(function (x) { var on = x === b; x.classList.toggle('pf-m-primary', on); x.classList.toggle('pf-m-secondary', !on); });
        $$('[data-occurrences]').forEach(function (list) { list.hidden = list.getAttribute('data-occurrences') !== mode; });
      });
    });
  });

  // ---------------------------------------------------------------- the form
  var form = $('[data-schedule-form]');
  if (!form) return;
  var cfg = {};
  try { cfg = JSON.parse($('[data-schedule-config]', form).textContent) || {}; } catch (e) { cfg = {}; }

  function timeLabel(h, m) { var ap = h < 12 ? 'AM' : 'PM', hh = h % 12; if (hh === 0) hh = 12; return hh + ':' + pad(m) + ' ' + ap; }
  function quarterHour(d) { var t = new Date(d.getTime()); t.setSeconds(0, 0); var m = t.getMinutes(); var up = Math.ceil(m / 15) * 15; t.setMinutes(up); return t; }

  // A new form starts in the browser's zone at the next quarter hour, as
  // the old form did.
  if (form.hasAttribute('data-fresh')) {
    var tzSel = $('[data-timezone]', form);
    var zone = (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone;
    if (tzSel && zone && Array.prototype.some.call(tzSel.options, function (o) { return o.value === zone; })) tzSel.value = zone;
    var q = quarterHour(new Date());
    var sd = $('[name="startDate"]', form), st = $('[name="startTime"]', form);
    if (sd) sd.value = q.getFullYear() + '-' + pad(q.getMonth() + 1) + '-' + pad(q.getDate());
    if (st) st.value = timeLabel(q.getHours(), q.getMinutes());
    var tomorrow = new Date(q.getTime() + 24 * 3600 * 1000);
    $$('[name$=".endDate"]', form).forEach(function (i) { i.value = tomorrow.getFullYear() + '-' + pad(tomorrow.getMonth() + 1) + '-' + pad(tomorrow.getDate()); });
    $$('[name$=".endTime"]', form).forEach(function (i) { i.value = timeLabel(q.getHours(), q.getMinutes()); });
  }

  // time zone links
  var tz = $('[data-timezone]', form);
  if (tz) {
    var warn = $('[data-timezone-warning]', form);
    function checkZone() {
      var link = (cfg.zoneLinks || {})[tz.value];
      if (!warn) return;
      warn.hidden = !link;
      if (link) $('[data-timezone-warning-text]', warn).textContent = t('Warning: {selectedValue} is a link to {0} and will be saved as that.', { selectedValue: tz.value, 0: link });
    }
    tz.addEventListener('change', checkZone);
    checkZone();
  }

  // frequency menus
  $$('[data-frequency-select]', form).forEach(function (box) {
    var toggle = $('[data-frequency-toggle]', box), menu = $('[data-frequency-menu]', box);
    var options = $$('[data-frequency-option]', box), none = $('[data-frequency-none]', box);
    var prefix = options.length && options[0].name === 'exceptionFrequency' ? 'exceptionOptions' : 'frequencyOptions';
    function open(v) { menu.hidden = !v; toggle.setAttribute('aria-expanded', v ? 'true' : 'false'); toggle.classList.toggle('pf-m-expanded', v); }
    function sync() {
      var any = options.some(function (o) { return o.checked; });
      $('.pf-v6-c-menu-toggle__text', toggle).textContent = any ? t('Select frequency') : box.getAttribute('data-none-label');
      options.forEach(function (o) {
        o.closest('[role="option"]').setAttribute('aria-selected', o.checked ? 'true' : 'false');
        var sub = $('[data-subform="' + prefix + '.' + o.value + '"]', form);
        if (sub) sub.hidden = !o.checked;
      });
      if (prefix === 'frequencyOptions') { var details = $('[data-frequency-details]', form); if (details) details.hidden = !any; }
    }
    toggle.addEventListener('click', function () { open(menu.hidden); });
    options.forEach(function (o) { o.addEventListener('change', sync); });
    if (none) none.addEventListener('click', function () { options.forEach(function (o) { o.checked = false; }); sync(); open(false); });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) open(false); });
    sync();
  });

  // sub-forms
  $$('[data-subform]', form).forEach(function (sub) {
    var interval = $('[data-interval]', sub), label = $('[data-interval-label]', sub);
    if (interval && label) {
      var plural = function () { label.textContent = t(label.getAttribute('data-msgid'), { intervalValue: interval.value }); };
      interval.addEventListener('input', plural);
      plural();
    }
    var endRadios = $$('[data-end-group] input[type="radio"]', sub);
    function syncEnd() {
      var v = (endRadios.filter(function (r) { return r.checked; })[0] || {}).value;
      var after = $('[data-end-after]', sub), onDate = $('[data-end-ondate]', sub);
      if (after) after.hidden = v !== 'after';
      if (onDate) onDate.hidden = v !== 'onDate';
    }
    endRadios.forEach(function (r) { r.addEventListener('change', syncEnd); });
    var runOn = $$('[data-run-on] input[type="radio"]', sub);
    function syncRunOn() {
      var v = (runOn.filter(function (r) { return r.checked; })[0] || {}).value;
      $$('[data-run-on-field]', sub).forEach(function (f) {
        var on = f.getAttribute('data-run-on-field') === v;
        f.classList.toggle('pf-m-disabled', !on);
        $$('input, select', f).forEach(function (i) { i.disabled = !on; });
      });
    }
    runOn.forEach(function (r) { r.addEventListener('change', syncRunOn); });
    if (runOn.length) syncRunOn();
  });

  // date pickers: the calendar button opens the browser's picker
  $$('[data-date-picker]', form).forEach(function (dp) {
    var text = $('[data-date-input]', dp), native = $('[data-date-native]', dp), btn = $('[data-date-toggle]', dp);
    btn.addEventListener('click', function () {
      native.value = /^\d{4}-\d{2}-\d{2}$/.test(text.value) ? text.value : '';
      if (native.showPicker) { try { native.showPicker(); return; } catch (e) { /* fall through */ } }
      native.click();
    });
    native.addEventListener('change', function () { if (native.value) { text.value = native.value; text.dispatchEvent(new Event('change', { bubbles: true })); } });
  });

  // time pickers: a menu of quarter hours
  var times = [];
  for (var h = 0; h < 24; h++) for (var m = 0; m < 60; m += 15) times.push(timeLabel(h, m));
  $$('[data-time-picker]', form).forEach(function (tp) {
    var input = $('[data-time-input]', tp), menu = $('[data-time-menu]', tp), list = $('[data-time-list]', tp);
    list.innerHTML = times.map(function (t) { return '<li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item" type="button" role="option" data-time-value="' + esc(t) + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(t) + '</span></span></button></li>'; }).join('');
    function open(v) { menu.hidden = !v; if (v) { var cur = $('[data-time-value="' + input.value + '"]', list); if (cur) cur.scrollIntoView({ block: 'nearest' }); } }
    input.addEventListener('focus', function () { open(true); });
    input.addEventListener('click', function () { open(true); });
    $$('[data-time-value]', list).forEach(function (b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); input.value = b.getAttribute('data-time-value'); input.dispatchEvent(new Event('change', { bubbles: true })); open(false); }); });
    document.addEventListener('click', function (e) { if (!tp.contains(e.target)) open(false); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Tab') open(false); });
  });

  // the prompt wizard stores what it collected for the server
  var promptBtn = $('[data-schedule-prompt]', form), hidden = $('[data-prompt-values]', form), save = $('[data-schedule-save]', form);
  if (promptBtn && window.ASCENDER.promptWizard) {
    var initial = cfg.promptInitial || null;
    promptBtn.addEventListener('click', function () {
      window.ASCENDER.promptWizard(form.getAttribute('data-prompt-base'), form.getAttribute('data-prompt-type'), form.getAttribute('data-prompt-name'), {
        mode: 'schedule', initial: initial,
        onSave: function (post, values) {
          hidden.value = JSON.stringify(post);
          initial = { inventory: values.inventory, credentials: values.credentials, execution_environment: values.execution_environment, instance_groups: values.instance_groups, labels: values.labels,
            job_type: values.job_type, scm_branch: values.scm_branch, limit: values.limit, verbosity: values.verbosity, forks: values.forks, job_slice_count: values.job_slice_count, timeout: values.timeout,
            diff_mode: values.diff_mode, job_tags: values.job_tags, skip_tags: values.skip_tags, extra_vars: values.extra_vars, survey: values.survey };
          if (save) save.disabled = false;
        }
      });
    });
  }
})();
