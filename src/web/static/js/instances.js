/* Instances and instance groups: the capacity adjustment Slider,
   InstanceToggle, HealthCheckButton with its HealthCheckAlert, the
   instance detail's DisassociateButton, and ContainerGroupForm's pod spec
   checkbox and mesh node lookup. Built on the helpers app.js exports. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, esc = U.esc, el = U.el;

  // computeForks
  function forks(mem, cpu, adj) {
    var lo = Math.min(mem, cpu), hi = Math.max(mem, cpu);
    return Math.floor(lo + (hi - lo) * adj);
  }

  // bindInstanceControls wires the sliders and switches under root. The
  // topology view binds its details panel with its own debounce (the
  // Tooltip's was 100ms) and an onToggle that refreshes the panel rather
  // than the page.
  function bindInstanceControls(root, opts) {
  opts = opts || {};
  var wait = opts.debounce || 200;
  // ---------------------------------------------------------------- Slider
  $$('[data-capacity-slider]', root).forEach(function (s) {
    if (s.classList.contains('pf-m-disabled')) return;
    var id = s.getAttribute('data-capacity-slider'), mem = +s.getAttribute('data-mem'), cpu = +s.getAttribute('data-cpu');
    var rail = $('.pf-v6-c-slider__rail', s), thumb = $('.pf-v6-c-slider__thumb', s);
    var label = $('[data-forks]', s.closest('[data-cy=slider-holder]'));
    var value = parseFloat(s.getAttribute('data-value')) || 0, timer = null;
    function show(v) {
      value = v;
      s.style.setProperty('--pf-v6-c-slider--value', (v * 100 / 1) + '%');
      thumb.setAttribute('aria-valuenow', String(v)); thumb.setAttribute('aria-valuetext', String(v));
      var n = forks(mem, cpu, v);
      if (label) label.textContent = t('{forks, plural, one {# fork} other {# forks}}', { forks: n });
    }
    // handleChangeValue: rounded to hundredths, sent after 200ms of quiet.
    function change(v) {
      v = Math.max(0, Math.min(1, v));
      v = Math.round(v * 100) / 100;
      show(v);
      clearTimeout(timer);
      timer = setTimeout(function () {
        U.api('PATCH', '/api/v2/instances/' + id + '/', { capacity_adjustment: v }).then(function (r) {
          if (!r.ok) U.errorModal(t('Error!'), (opts.debounce ? t('Failed to update instance.') : t('Failed to update capacity adjustment.')) + ' ' + U.errorText(r));
        });
      }, wait);
    }
    function fromEvent(e) {
      var box = rail.getBoundingClientRect();
      return (e.clientX - box.left) / box.width;
    }
    function drag(e) { e.preventDefault(); change(fromEvent(e)); }
    function stop() { document.removeEventListener('pointermove', drag); document.removeEventListener('pointerup', stop); }
    function start(e) { e.preventDefault(); thumb.focus(); change(fromEvent(e)); document.addEventListener('pointermove', drag); document.addEventListener('pointerup', stop); }
    rail.addEventListener('pointerdown', start);
    thumb.addEventListener('pointerdown', start);
    thumb.addEventListener('keydown', function (e) {
      var step = 0.1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); change(value + step); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); change(value - step); }
      else if (e.key === 'Home') { e.preventDefault(); change(0); }
      else if (e.key === 'End') { e.preventDefault(); change(1); }
    });
  });

  // ---------------------------------------------------------------- InstanceToggle
  $$('[data-instance-toggle]', root).forEach(function (sw) {
    sw.addEventListener('change', function () {
      var on = sw.checked; sw.disabled = true;
      U.api('PATCH', '/api/v2/instances/' + sw.getAttribute('data-instance-toggle') + '/', { enabled: on }).then(function (r) {
        if (r.ok) { if (opts.onToggle) opts.onToggle(on); else location.reload(); return; }
        sw.disabled = false; sw.checked = !on;
        U.errorModal(t('Error!'), t('Failed to toggle instance.') + ' ' + U.errorText(r));
      });
    });
  });
  }
  bindInstanceControls(document);
  window.ASCENDER.bindInstanceControls = bindInstanceControls;

  // ---------------------------------------------------------------- HealthCheckAlert
  function healthCheckAlert() {
    var holder = $('[data-health-check-alert-holder]'), tpl = $('template[data-health-check-alert-tpl]');
    if (!holder || !tpl) return;
    holder.innerHTML = '';
    var a = tpl.content.firstElementChild.cloneNode(true);
    $('[data-reload]', a).addEventListener('click', function () { location.reload(); });
    $('[data-close-alert]', a).addEventListener('click', function () { holder.innerHTML = ''; });
    holder.appendChild(a);
  }

  // ---------------------------------------------------------------- HealthCheckButton (lists)
  $$('[data-health-check-selected]').forEach(function (btn) {
    var table = $('[data-list-table]'); if (!table) return;
    var rows = $$('[data-select-row]', table), wrap = btn.parentNode;
    var always = btn.hasAttribute('data-always-disabled'), pending = btn.classList.contains('pf-m-in-progress');
    // canRunHealthCheck followed the node type of the row selected last.
    var canRun = true, order = [];
    function sync() {
      var sel = rows.filter(function (r) { return r.checked; });
      order = order.filter(function (r) { return r.checked; });
      sel.forEach(function (r) { if (order.indexOf(r) < 0) order.push(r); });
      if (order.length) canRun = order[order.length - 1].closest('[data-row]').getAttribute('data-node-type') === 'execution';
      btn.disabled = always || !canRun || !sel.length;
      U.setTooltip(wrap, sel.length ? t('{selectedItemsCount, plural, one {Click to run a health check on the selected instance.} other {Click to run a health check on the selected instances.}}', { selectedItemsCount: sel.length }) : t('Select an instance to run a health check.'));
    }
    rows.forEach(function (r) { r.addEventListener('change', sync); });
    var all = $('[data-select-all]'); if (all) all.addEventListener('change', function () { setTimeout(sync, 0); });
    sync();
    btn.addEventListener('click', function () {
      var sel = rows.filter(function (r) { return r.checked; }).map(function (r) { return r.closest('[data-row]'); })
        .filter(function (row) { return row.getAttribute('data-node-type') === 'execution'; });
      btn.disabled = true;
      Promise.all(sel.map(function (row) { return U.api('POST', '/api/v2/instances/' + row.getAttribute('data-id') + '/health_check/', {}); })).then(function (results) {
        var failed = results.filter(function (r) { return !r.ok; });
        rows.forEach(function (r) { r.checked = false; }); if (all) all.checked = false; order = []; sync();
        if (failed.length) { U.errorModal(t('Error!'), t('Failed to run a health check on one or more instances.') + ' ' + U.errorText(failed[0])); return; }
        healthCheckAlert();
      });
    });
    if (pending) btn.disabled = true;
  });

  // ---------------------------------------------------------------- Run health check (details)
  $$('[data-health-check]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.disabled = true;
      U.api('POST', '/api/v2/instances/' + btn.getAttribute('data-health-check') + '/health_check/', {}).then(function (r) {
        if (!r.ok) { btn.disabled = false; U.errorModal(t('Error!'), t('Failed to disassociate one or more instances.') + ' ' + U.errorText(r)); return; }
        healthCheckAlert();
      });
    });
  });

  // ---------------------------------------------------------------- DisassociateButton (instance details)
  $$('[data-disassociate-instance]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var root = $('#ascender-modal-root'), name = btn.getAttribute('data-name');
      // The note is a Lingui markup message the page rendered.
      var tpl = btn.parentNode.querySelector('template[data-policy-note-html]');
      var note = btn.hasAttribute('data-policy-note') && tpl ? tpl.innerHTML + '<br><br>' : '';
      var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(t('Alert modal')) + '" aria-labelledby="alert-modal-header-label" aria-modal="true" class="pf-v6-c-modal-box pf-m-sm"><div class="pf-v6-c-modal-box__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-close-modal><span class="pf-v6-c-button__icon">' + U.ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><div class="ascender-alert-modal__header"><h2 id="alert-modal-header-label" class="pf-v6-c-title pf-m-2xl">' + esc(t('Disassociate instance from instance group?')) + '</h2></div></header><div class="pf-v6-c-modal-box__body">' + note + esc(t('This action will disassociate the following:')) + '<br><span class="pf-v6-c-chip"><span class="pf-v6-c-chip__content"><span class="pf-v6-c-chip__text">' + esc(name) + '</span></span></span></div><footer class="pf-v6-c-modal-box__footer"><button aria-label="' + esc(t('confirm disassociate')) + '" class="pf-v6-c-button pf-m-danger" type="button" data-confirm><span class="pf-v6-c-button__text">' + esc(t('Disassociate')) + '</span></button><button aria-label="' + esc(t('Cancel')) + '" class="pf-v6-c-button pf-m-link" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button></footer></div></div></div>');
      root.innerHTML = ''; root.appendChild(m); U.openModal(m);
      $('[data-confirm]', m).addEventListener('click', function () {
        this.disabled = true;
        U.api('POST', btn.getAttribute('data-api'), { id: parseInt(btn.getAttribute('data-disassociate-instance'), 10), disassociate: true }).then(function (r) {
          U.closeModal(m);
          if (r.ok) { location.href = btn.getAttribute('data-redirect'); return; }
          U.errorModal(t('Error!'), t('Failed to disassociate one or more instances.') + ' ' + U.errorText(r));
        });
      });
    });
  });

  // ---------------------------------------------------------------- ContainerGroupForm
  $$('form[data-container-group-form]').forEach(function (form) {
    var toggle = $('[data-override-toggle]', form), sub = $('[data-override-subform]', form);
    if (toggle && sub) toggle.addEventListener('change', function () {
      sub.hidden = !toggle.checked;
      // The editor was laid out while hidden; measure it again.
      if (toggle.checked) $$('[data-code-editor]', sub).forEach(function (e) { if (e.cmView) e.cmView.requestMeasure(); });
    });
    // A group behind a mesh node takes no credential of its own.
    var mesh = $('#container-group-mesh-node', form), holder = $('[data-credential-holder]', form);
    var meshID = mesh ? $('[data-lookup-id]', mesh.closest('[data-lookup]')) : null;
    if (meshID && holder) meshID.addEventListener('change', function () {
      var on = Boolean(meshID.value);
      holder.hidden = on;
      if (on) {
        var group = $('[data-lookup]', holder);
        $('[data-lookup-id]', group).value = ''; $('[data-lookup-name]', group).value = '';
      }
    });
  });
})();
