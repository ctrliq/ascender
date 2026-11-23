// Credential plugins in the credential form (screens/Credential/shared/
// CredentialPlugins): a field's key button opens the External Secret
// Management System wizard, which picks an external credential and the
// metadata the field is looked up with; the field then shows that
// credential in place of its input, and the form posts it as a hidden
// plugin.<field> input the server saves as an input source. Also the
// form's Test button (ExternalTestModal), the GCE service account upload
// (GceFileUploadField) and the Vault command of WorkloadIdentityInfo.
(function () {
  var A = window.ASCENDER, U = A.ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, el = U.el, esc = U.esc, api = U.api;
  var IC = Object.assign({}, U.ICON, A.icons || {});
  var form = $('form[data-credential-form]');
  if (!form) return;

  var WORKLOAD_IDENTITY_LOOKUPS = ['hashivault_kv_oidc', 'hashivault_ssh_oidc'];
  var TEST_TIP = t('Click this button to verify connection to the secret management system using the selected credential and specified inputs.');

  // ---------------------------------------------------------------- form pieces
  function help(text) {
    return '&nbsp;&nbsp;' + (text ? '<span class="pf-v6-c-form__group-label-help"><div style="display: contents;"><button aria-label="' + esc(t('More information')) + '" aria-haspopup="true" class="ascender-popover__button pf-v6-c-form__group-label-help" type="button" data-popover="' + esc(text) + '">' + IC.help + '</button></div></span>' : '');
  }
  function requiredMark() { return '<span class="pf-v6-c-form__label-required" aria-hidden="true">&nbsp;*</span>'; }
  var helperError = U.helperError, statusIcon = U.statusIcon;

  // metadataFields renders a plugin type's metadata as MetadataStep and
  // ExternalTestModal did: a select for choices, a text input or textarea
  // otherwise. name(id) is the input's name; err(id) its error, if any.
  function metadataFields(fields, required, values, name, err) {
    return fields.map(function (f) {
      if (f.type && f.type !== 'string') return '';
      var req = required.indexOf(f.id) >= 0, id = 'credential-' + f.id, val = values[f.id] == null ? '' : String(values[f.id]);
      var label = '<div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="' + esc(id) + '"><span class="pf-v6-c-form__label-text">' + esc(f.label) + '</span>' + (req ? requiredMark() : '') + '</label>' + help(f.help_text) + '</div>';
      if (f.choices) {
        return '<div class="pf-v6-c-form__group">' + label + '<div class="pf-v6-c-form__group-control"><span class="pf-v6-c-form-control"><select id="' + esc(id) + '" name="' + esc(name(f.id)) + '" aria-invalid="false" data-meta="' + esc(f.id) + '">' + f.choices.map(function (c) { return '<option value="' + esc(c) + '"' + (c === val ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select><span class="pf-v6-c-form-control__utilities"><span class="pf-v6-c-form-control__toggle-icon">' + IC.caret + '</span></span></span></div></div>';
      }
      var e = err(f.id);
      var control = f.multiline
        ? '<span class="pf-v6-c-form-control pf-m-textarea pf-m-resize-both' + (e ? ' pf-m-error' : '') + '"><textarea id="' + esc(id) + '" aria-invalid="' + (e ? 'true' : 'false') + '"' + (req ? ' required=""' : '') + ' name="' + esc(name(f.id)) + '" data-meta="' + esc(f.id) + '">' + esc(val) + '</textarea>' + (e ? statusIcon() : '') + '</span>'
        : '<span class="pf-v6-c-form-control' + (e ? ' pf-m-error' : '') + '"><input id="' + esc(id) + '" aria-invalid="' + (e ? 'true' : 'false') + '"' + (req ? ' required=""' : '') + ' type="text" value="' + esc(val) + '" name="' + esc(name(f.id)) + '" data-meta="' + esc(f.id) + '">' + (e ? statusIcon() : '') + '</span>';
      return '<div class="pf-v6-c-form__group" data-cy="credential-' + esc(f.id) + '-form-group">' + label + '<div class="pf-v6-c-form__group-control">' + control + (e ? helperError(e) : '') + '</div></div>';
    }).join('');
  }
  // Formik validated on change: a required field shows its error while
  // it is blank, once the form has been submitted.
  function liveRequired(box, required, errs) {
    $$('[data-meta]', box).forEach(function (i) {
      var id = i.getAttribute('data-meta');
      if (required.indexOf(id) < 0 || i.tagName === 'SELECT') return;
      i.addEventListener('input', function () {
        if (!errs.shown) return;
        var blank = !i.value.trim(), ctl = i.closest('.pf-v6-c-form-control'), grp = i.closest('.pf-v6-c-form__group-control');
        if (blank) errs[id] = t('This field must not be blank'); else delete errs[id];
        ctl.classList.toggle('pf-m-error', blank); i.setAttribute('aria-invalid', blank ? 'true' : 'false');
        var util = $('.pf-v6-c-form-control__utilities', ctl), help = $('.pf-v6-c-form__helper-text', grp);
        if (blank && !util) ctl.appendChild(el(statusIcon()));
        if (!blank && util) util.remove();
        if (blank && !help) grp.appendChild(el(helperError(errs[id])));
        if (!blank && help) help.remove();
      });
    });
  }
  function readMetadata(box, values) {
    $$('[data-meta]', box).forEach(function (i) { values[i.getAttribute('data-meta')] = i.value; });
  }
  function blankRequired(fields, required, values) {
    var errs = {};
    fields.forEach(function (f) { if (required.indexOf(f.id) >= 0 && (!f.type || f.type === 'string') && !f.choices && !String(values[f.id] == null ? '' : values[f.id]).trim()) errs[f.id] = t('This field must not be blank'); });
    return errs;
  }

  // jobTemplateLookup is JobTemplateLookup: the template a lookup that
  // logs in as the job is tested as. state.job_template holds {id, name}.
  function jobTemplateLookup(state, required, tooltip, changed) {
    var jt = state.job_template;
    var g = el('<div class="pf-v6-c-form__group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="job_template"><span class="pf-v6-c-form__label-text">' + esc(t('Job Template')) + '</span>' + (required ? requiredMark() : '') + '</label>' + help(tooltip) + '</div><div class="pf-v6-c-form__group-control"><div class="pf-v6-c-input-group"><div class="pf-v6-c-input-group__item"><button id="job_template-open" aria-label="' + esc(t('Search')) + '" class="pf-v6-c-button pf-m-control" type="button"><span class="pf-v6-c-button__icon">' + IC.search + '</span></button></div><div class="pf-v6-c-input-group__item pf-m-fill"><span class="pf-v6-c-form-control"><input id="job_template" aria-invalid="false" type="text" value="' + esc(jt ? jt.name : '') + '"></span></div></div></div></div>');
    var input = $('#job_template', g);
    $('#job_template-open', g).addEventListener('click', function () {
      var root = el('<div></div>');
      document.body.appendChild(root);
      var holder = el('<div data-resource="job_templates" data-title="' + esc(t('Select {0}', { 0: t('Job Template') })) + '"><input data-lookup-id value="' + esc(jt ? jt.id : '') + '"><input data-lookup-name value="' + esc(jt ? jt.name : '') + '"></div>');
      U.lookupModal(holder, { root: root, onSelect: function (sel, m) {
        jt = sel[0] ? { id: Number(sel[0].id), name: sel[0].name } : null;
        state.job_template = jt; input.value = jt ? jt.name : '';
        U.closeModal(m); root.remove(); changed();
      } });
      root.addEventListener('click', function (e) { if (e.target.closest('[data-close-modal]')) root.remove(); });
    });
    // A typed name is matched against the templates when it is left.
    input.addEventListener('change', function () {
      var name = input.value.trim();
      if (!name) { jt = null; state.job_template = null; changed(); return; }
      api('GET', '/api/v2/job_templates/?name=' + encodeURIComponent(name)).then(function (r) {
        var hit = r.ok && r.data.results && r.data.results[0];
        jt = hit ? { id: hit.id, name: hit.name } : null; state.job_template = jt; changed();
      });
    });
    return g;
  }

  // ---------------------------------------------------------------- test alert
  // CredentialPluginTestAlert: a toast with the credential's name and how
  // the test went, and the claims a token was signed with, if one was.
  function clearTestAlert() { $$('[data-plugin-test-alert]').forEach(function (x) { x.remove(); }); }
  function testAlert(name, r) {
    clearTestAlert();
    var ok = r.ok, data = r.data || {}, msg;
    if (ok) msg = t('Test passed');
    else if (data && typeof data.inputs === 'string') {
      msg = data.inputs;
      if (msg.indexOf('HTTP') === 0) {
        var parts = msg.split('\n');
        try { var j = JSON.parse(parts[1] || ''); msg = parts[0] + (j && j.errors && j.errors[0] ? ': ' + j.errors[0] : ''); } catch (e) { msg = data.inputs; }
      }
    } else msg = t('Something went wrong with the request to test this credential and metadata.');
    var claims = data && data.details && data.details.sent_jwt_payload;
    var variant = ok ? 'success' : 'danger', title = ok ? 'Success alert:' : 'Danger alert:';
    var claimsHTML = claims ? '<div class="pf-v6-c-expandable-section" id="credential-plugin-test-claims" data-claims><div class="pf-v6-c-expandable-section__toggle"><button aria-expanded="false" class="pf-v6-c-button pf-m-link" type="button" data-claims-toggle><span class="pf-v6-c-button__icon pf-m-start"><span class="pf-v6-c-expandable-section__toggle-icon">' + (IC.pfAngleDown || '') + '</span></span><span class="pf-v6-c-button__text">' + esc(t('Claims sent')) + '</span></button></div><div class="pf-v6-c-expandable-section__content" hidden role="region"><div class="pf-v6-c-code-block"><div class="pf-v6-c-code-block__content"><pre class="pf-v6-c-code-block__pre"><code class="pf-v6-c-code-block__code">' + esc(JSON.stringify(claims, null, 2)) + '</code></pre></div></div></div></div>' : '';
    var box = el('<div data-plugin-test-alert><ul role="list" class="pf-v6-c-alert-group pf-m-toast"><li class="pf-v6-c-alert-group__item"><div class="pf-v6-c-alert pf-m-' + variant + '"><div class="pf-v6-c-alert__icon">' + (ok ? IC.checkCircle : IC.exclamationCircle) + '</div><h4 class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">' + title + '</span><b id="credential-plugin-test-name">' + esc(name) + '</b><p id="credential-plugin-test-message">' + esc(msg) + '</p>' + claimsHTML + '</h4><div class="pf-v6-c-alert__action"><button aria-label="Close ' + title + ' alert: [object Object]" class="pf-v6-c-button pf-m-plain" type="button" data-alert-close><span class="pf-v6-c-button__icon">' + IC.close + '</span></button></div></div></li></ul></div>');
    document.body.appendChild(box);
    $('[data-alert-close]', box).addEventListener('click', function () { box.remove(); });
    var t = $('[data-claims-toggle]', box);
    if (t) t.addEventListener('click', function () { var open = t.getAttribute('aria-expanded') !== 'true'; t.setAttribute('aria-expanded', String(open)); $('[data-claims]', box).classList.toggle('pf-m-expanded', open); $('.pf-v6-c-expandable-section__content', box).hidden = !open; });
  }
  // withTestJobTemplate: the template picked goes by id, and only to the test.
  function withTestJobTemplate(meta, jt) { var out = Object.assign({}, meta); if (jt) out.job_template_id = jt.id; return out; }

  // ---------------------------------------------------------------- field state
  var areas = {};
  function typeFormOf(node) { return node.closest('[data-type-form]'); }
  function area(tf, field) {
    var key = tf.getAttribute('data-type-form') + ':' + field;
    if (!areas[key]) { var b = $('[data-external-secret="' + field + '"]', tf); if (!b) return null; areas[key] = b.closest('[data-plugin-area]'); }
    return areas[key];
  }
  function pluginInput(tf, field) { return $('input[data-plugin-value="' + field + '"]', tf); }
  function readPlugin(tf, field) { var i = pluginInput(tf, field); if (!i || !i.value) return null; try { return JSON.parse(i.value); } catch (e) { return null; } }
  function writePlugin(tf, field, val) {
    var i = pluginInput(tf, field);
    if (!val) { if (i) i.remove(); return; }
    if (!i) { i = el('<input type="hidden" name="plugin.' + esc(field) + '" data-plugin-value="' + esc(field) + '">'); $('.ascender-form-column-layout', tf).appendChild(i); }
    i.value = JSON.stringify(val);
  }
  // CredentialPluginSelected: the credential's chip, the key button that
  // edits the lookup, and why the field has no input.
  function showSelected(tf, field, val) {
    var a = area(tf, field); if (!a || !val || !val.credential) return;
    var kind = U.credKindLabel(val.credential);
    // CredentialChip translated these two; the others are the kind title-cased.
    if (kind === 'Cloud' || kind === 'GPG Public Key') kind = t(kind);
    var label = (kind ? kind + ': ' : '') + val.credential.name;
    var holder = el('<div><div class="ascender-credential-plugin-selected__credential"><span class="pf-v6-c-label pf-m-outline ascender-credential-plugin-selected__spaced-credential-chip"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + (kind ? '<strong>' + esc(kind) + ': </strong>' : '') + esc(val.credential.name) + '</span></span><span class="pf-v6-c-label__actions"><button aria-label="' + esc(label) + '" class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button" data-plugin-clear><span class="pf-v6-c-button__icon">' + IC.close + '</span></button></span></span><div style="display: contents;"><button aria-label="' + esc(t('Edit Credential Plugin Configuration')) + '" class="pf-v6-c-button pf-m-control" type="button" data-tooltip="' + esc(t('Edit Credential Plugin Configuration')) + '" data-tooltip-pos="top" data-plugin-edit><span class="pf-v6-c-button__icon">' + IC.key + '</span></button></div></div><p class="ascender-credential-plugin-selected__help-text">' + esc(t('This field will be retrieved from an external secret management system using the specified credential.')) + '</p></div>');
    var old = $$('[data-plugin-selected="' + field + '"]', tf), anchor = old[0] || a;
    Array.prototype.slice.call(holder.children).forEach(function (n) { n.setAttribute('data-plugin-selected', field); anchor.parentNode.insertBefore(n, anchor); });
    old.forEach(function (n) { n.remove(); });
    if (a.parentNode) a.remove();
    writePlugin(tf, field, val);
    $('[data-plugin-clear]', tf.querySelector('[data-plugin-selected="' + field + '"]')).addEventListener('click', function () { clearSelected(tf, field); });
    $('[data-plugin-edit]', tf.querySelector('[data-plugin-selected="' + field + '"]')).addEventListener('click', function () { wizard(tf, field, readPlugin(tf, field)); });
  }
  // onClearPlugin: the field gets its input back, empty.
  function clearSelected(tf, field) {
    var a = area(tf, field), old = $$('[data-plugin-selected="' + field + '"]', tf);
    if (a && old.length) old[0].parentNode.insertBefore(a, old[0]);
    old.forEach(function (n) { n.remove(); });
    writePlugin(tf, field, null);
    if (!a) return;
    var inp = $('[name="inputs.' + field + '"]', a);
    if (inp && !inp.disabled) { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    var b = $('[data-external-secret]', a); if (b) b.disabled = false;
  }

  // ---------------------------------------------------------------- wizard
  function wizard(tf, field, initial) {
    var v = { credential: (initial && initial.credential) || null, inputs: Object.assign({}, (initial && initial.inputs) || {}), job_template: null };
    var step = 0, meta = null, metaFor = null, errs = {}, list = null;
    var root = $('#ascender-modal-root') || document.body;
    var m = el('<div class="pf-v6-c-backdrop" data-modal data-plugin-wizard><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(t('External Secret Management System')) + '" aria-modal="true" class="pf-v6-c-modal-box pf-m-lg"><div class="pf-v6-c-wizard ascender-wizard"><div class="pf-v6-c-wizard__header"><div class="pf-v6-c-wizard__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-wiz-close><span class="pf-v6-c-button__icon">' + IC.close + '</span></button></div><div class="pf-v6-c-wizard__title"><h2 class="pf-v6-c-wizard__title-text">' + esc(t('External Secret Management System')) + '</h2></div></div><button class="pf-v6-c-wizard__toggle" aria-label="Wizard toggle" aria-expanded="false" type="button"><span class="pf-v6-c-wizard__toggle-list"><span class="pf-v6-c-wizard__toggle-list-item" data-wiz-toggle></span></span><span class="pf-v6-c-wizard__toggle-icon">' + (IC.angleRight || '') + '</span></button><div class="pf-v6-c-wizard__outer-wrap"><div class="pf-v6-c-wizard__inner-wrap"><nav class="pf-v6-c-wizard__nav" aria-label="Wizard steps"><ol class="pf-v6-c-wizard__nav-list" role="list" data-wiz-nav></ol></nav><div tabindex="-1" class="pf-v6-c-wizard__main"><div class="pf-v6-c-wizard__main-body" data-wiz-body></div></div></div><footer class="pf-v6-c-wizard__footer" data-wiz-footer></footer></div></div></div></div></div>');
    root.appendChild(m); U.openModal(m);
    var body = $('[data-wiz-body]', m);
    function close() { m.remove(); U.closeModal(); clearTestAlert(); }
    function btn(id, variant, text, disabled) { return '<button id="' + id + '" class="pf-v6-c-button pf-m-' + variant + '"' + (disabled ? ' disabled=""' : '') + ' type="button"><span class="pf-v6-c-button__text">' + esc(text) + '</span></button>'; }
    function chrome() {
      var names = [t('Credential'), t('Metadata')];
      $('[data-wiz-nav]', m).innerHTML = names.map(function (n, i) {
        var cur = i === step, dis = i === 1 && !v.credential;
        return '<li class="pf-v6-c-wizard__nav-item"><button' + (dis ? ' disabled=""' : '') + ' id="' + (i + 1) + '" class="pf-v6-c-wizard__nav-link' + (cur ? ' pf-m-current' : '') + (dis ? ' pf-m-disabled' : '') + '"' + (dis ? ' aria-disabled="true"' : '') + ' aria-current="' + (cur ? 'step' : 'false') + '" type="button" data-wiz-go="' + i + '"><span class="pf-v6-c-wizard__nav-link-main">' + esc(n) + '</span></button></li>';
      }).join('');
      $('[data-wiz-toggle]', m).innerHTML = '<span class="pf-v6-c-wizard__toggle-num">' + (step + 1) + '</span> ' + esc(names[step]);
      $('[data-wiz-footer]', m).innerHTML = step === 0
        ? btn('credential-plugin-prompt-next', 'primary', t('Next'), !v.credential) + btn('credential-plugin-prompt-cancel', 'link', t('Cancel'))
        : btn('credential-plugin-prompt-next', 'primary', t('OK'), !v.credential) + '<div style="display: contents;"><button id="credential-plugin-prompt-test" class="pf-v6-c-button pf-m-secondary" type="button" data-tooltip="' + esc(TEST_TIP) + '" data-tooltip-pos="top"><span class="pf-v6-c-button__text">' + esc(t('Test')) + '</span></button></div>' + btn('credential-plugin-prompt-back', 'secondary', t('Back')) + btn('credential-plugin-prompt-cancel', 'link', t('Cancel'));
      $$('[data-wiz-go]', m).forEach(function (b) { b.addEventListener('click', function () { go(Number(b.getAttribute('data-wiz-go'))); }); });
      $('#credential-plugin-prompt-next', m).addEventListener('click', function () { if (step === 0) go(1); else save(); });
      $('#credential-plugin-prompt-cancel', m).addEventListener('click', close);
      var back = $('#credential-plugin-prompt-back', m); if (back) back.addEventListener('click', function () { go(0); });
      var test = $('#credential-plugin-prompt-test', m); if (test) test.addEventListener('click', runTest);
    }
    function go(i) {
      if (step === 1) readMetadata(body, v.inputs);
      step = i; errs = {}; render();
    }
    function render() {
      chrome();
      body.innerHTML = '';
      if (step === 0) {
        list = U.optionsList({ resource: 'credentials', ns: 'credential', header: t('Items'), rowName: true, noSelected: true, params: { credential_type__kind: 'external' }, orderBy: 'name',
          searchColumns: [{ name: t('Name'), key: 'name__icontains', isDefault: true }, { name: t('Created By (Username)'), key: 'created_by__username__icontains' }, { name: t('Modified By (Username)'), key: 'modified_by__username__icontains' }],
          value: function () { return v.credential ? [v.credential] : []; },
          select: function (item) { v.credential = item; }, deselect: function () { v.credential = null; },
          onChange: chrome });
        body.appendChild(list);
        return;
      }
      var typeID = v.credential.credential_type || v.credential.credential_type_id;
      if (meta && metaFor === typeID) { renderMetadata(); return; }
      body.innerHTML = '<div class="pf-v6-c-empty-state"><div class="pf-v6-c-empty-state__content"><div class="pf-v6-c-empty-state__icon"><svg class="pf-v6-c-spinner" role="progressbar" viewBox="0 0 100 100" aria-label="Contents"><circle class="pf-v6-c-spinner__path" cx="50" cy="50" r="45" fill="none"></circle></svg></div></div></div>';
      api('GET', '/api/v2/credential_types/' + typeID + '/').then(function (r) {
        if (step !== 1) return;
        if (!r.ok) { body.innerHTML = '<div class="pf-v6-c-empty-state"><div class="pf-v6-c-empty-state__content"><div class="pf-v6-c-empty-state__title"><h4 class="pf-v6-c-empty-state__title-text">' + esc(t('Something went wrong...')) + '</h4></div></div></div>'; return; }
        var inputs = r.data.inputs || {};
        meta = { fields: inputs.metadata || [], required: inputs.required || [], asJob: WORKLOAD_IDENTITY_LOOKUPS.indexOf(r.data.namespace) >= 0 };
        metaFor = typeID;
        meta.fields.forEach(function (f) {
          if (v.inputs[f.id]) return;
          v.inputs[f.id] = f.type === 'string' && f.choices ? (f.default || f.choices[0]) : '';
        });
        renderMetadata();
      });
    }
    function renderMetadata() {
      body.innerHTML = '';
      if (!meta.fields.length) return;
      var f = el('<form novalidate="" autocomplete="off" class="pf-v6-c-form"><div class="ascender-form-full-width-layout">' + metadataFields(meta.fields, meta.required, v.inputs, function (id) { return 'inputs.' + id; }, function (id) { return errs[id]; }) + '</div></form>');
      f.addEventListener('submit', function (e) { e.preventDefault(); });
      liveRequired(f, meta.required, errs);
      if (meta.asJob) $('.ascender-form-full-width-layout', f).appendChild(jobTemplateLookup(v, false, t('Only used by the test, which logs in to Vault as a job from this template would. Jobs log in as themselves.'), function () {}));
      body.appendChild(f);
    }
    function runTest() {
      readMetadata(body, v.inputs);
      api('POST', '/api/v2/credentials/' + v.credential.id + '/test/', { metadata: withTestJobTemplate(v.inputs, v.job_template) }).then(function (r) { testAlert(v.credential.name, r); });
    }
    // onSubmit: the required metadata has to be there.
    function save() {
      readMetadata(body, v.inputs);
      errs = meta ? blankRequired(meta.fields, meta.required, v.inputs) : {};
      if (Object.keys(errs).length) { errs.shown = true; renderMetadata(); chrome(); return; }
      close();
      var inputs = {};
      (meta ? meta.fields : []).forEach(function (fd) { inputs[fd.id] = v.inputs[fd.id]; });
      showSelected(tf, field, { credential: v.credential, inputs: meta ? inputs : v.inputs, touched: true });
    }
    m.addEventListener('click', function (e) { if (e.target.closest('[data-wiz-close]')) close(); });
    render();
  }

  // ---------------------------------------------------------------- external test
  // ExternalTestModal: the form's inputs, with metadata typed here, tried
  // against the saved credential (when it is of this type) or the type.
  function formValue(tf, field) {
    var p = readPlugin(tf, field);
    if (p) return p;
    var inp = $('[name="inputs.' + field + '"]', tf);
    if (!inp) return undefined;
    if (inp.type === 'checkbox') return inp.checked;
    if (inp.disabled && inp.placeholder === t('ENCRYPTED')) return '$encrypted$';
    return inp.value;
  }
  function externalTest() {
    var tf = $('[data-type-form]:not([hidden])', form); if (!tf) return;
    var spec; try { spec = JSON.parse(tf.getAttribute('data-type-test') || '{}'); } catch (e) { spec = {}; }
    var fields = spec.metadata || [], required = spec.required || [], asJob = WORKLOAD_IDENTITY_LOOKUPS.indexOf(spec.namespace) >= 0;
    var values = {}, state = { job_template: null }, errs = {};
    fields.forEach(function (f) { values[f.id] = f.type === 'string' && f.choices ? (f.default || f.choices[0]) : ''; });
    var root = $('#ascender-modal-root') || document.body;
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(t('Test External Credential')) + '" aria-modal="true" class="pf-v6-c-modal-box pf-m-sm"><div class="pf-v6-c-modal-box__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-test-close><span class="pf-v6-c-button__icon">' + IC.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><h1 class="pf-v6-c-modal-box__title"><span class="pf-v6-c-modal-box__title-text">' + esc(t('Test External Credential')) + '</span></h1></header><div class="pf-v6-c-modal-box__body" data-test-body></div><footer class="pf-v6-c-modal-box__footer"><button id="run-external-credential-test" class="pf-v6-c-button pf-m-primary" type="button"><span class="pf-v6-c-button__text">' + esc(t('Run')) + '</span></button><button id="cancel-external-credential-test" class="pf-v6-c-button pf-m-link" type="button" data-test-close><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button></footer></div></div></div>');
    root.appendChild(m); U.openModal(m);
    var body = $('[data-test-body]', m), run = $('#run-external-credential-test', m);
    function runState() { run.disabled = asJob && !state.job_template; }
    function render() {
      var f = el('<form novalidate="" autocomplete="off" class="pf-v6-c-form"><div class="ascender-form-full-width-layout">' + metadataFields(fields, required, values, function (id) { return id; }, function (id) { return errs[id]; }) + '</div></form>');
      f.addEventListener('submit', function (e) { e.preventDefault(); });
      liveRequired(f, required, errs);
      if (asJob) $('.ascender-form-full-width-layout', f).appendChild(jobTemplateLookup(state, true, t('The test logs in to Vault as a job from this template would, with a token carrying its claims.'), runState));
      body.innerHTML = ''; body.appendChild(f); runState();
    }
    run.addEventListener('click', function () {
      readMetadata(body, values);
      errs = blankRequired(fields, required, values);
      if (Object.keys(errs).length) { errs.shown = true; render(); return; }
      var inputs = {};
      (spec.fields || []).forEach(function (id) { var val = formValue(tf, id); if (val !== undefined) inputs[id] = val; });
      var typeID = tf.getAttribute('data-type-form'), credID = form.getAttribute('data-credential-id');
      var path = credID && form.getAttribute('data-credential-type') === typeID ? '/api/v2/credentials/' + credID + '/test/' : '/api/v2/credential_types/' + typeID + '/test/';
      api('POST', path, { inputs: inputs, metadata: withTestJobTemplate(values, state.job_template) }).then(function (r) { testAlert(($('[name="name"]', form) || {}).value || '', r); });
    });
    m.addEventListener('click', function (e) { if (e.target.closest('[data-test-close]')) { m.remove(); U.closeModal(); clearTestAlert(); } });
    render();
  }

  // ---------------------------------------------------------------- GCE upload
  // GceFileUploadField: a service account key fills in the email address,
  // the project and the private key.
  function gceUpload(up) {
    var tf = typeFormOf(up), file = $('[data-gce-input]', up), name = $('[data-gce-filename]', up), text = $('[data-gce-text]', up), clear = $('[data-gce-clear]', up), helpItem = $('[data-gce-help]', up);
    var HELP = t('Select a JSON formatted service account key to autopopulate the following fields.'), ERR = t('There was an error parsing the file. Please check the file formatting and try again.');
    function setHelp(err) {
      helpItem.className = 'pf-v6-c-helper-text__item' + (err ? ' pf-m-error' : '');
      helpItem.innerHTML = err ? '<span class="pf-v6-c-helper-text__item-icon">' + IC.exclamationCircle + '</span><span class="pf-v6-c-helper-text__item-text">' + esc(err) + '<span class="pf-v6-screen-reader">: error status;</span></span>' : '<span class="pf-v6-c-helper-text__item-text">' + esc(HELP) + '</span>';
    }
    function setField(id, val) {
      var inp = $('[name="inputs.' + id + '"]', tf); if (!inp || inp.disabled) return;
      inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    $('[data-gce-browse]', up).addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () {
      var f = file.files[0]; if (!f) return;
      name.value = f.name; setHelp(null);
      var rd = new FileReader();
      rd.onload = function () {
        text.value = rd.result; clear.disabled = false;
        try { var j = JSON.parse(rd.result); setField('username', j.client_email || ''); setField('project', j.project_id || ''); setField('ssh_key_data', j.private_key || ''); setHelp(null); }
        catch (e) { setHelp(ERR); }
      };
      rd.readAsText(f);
    });
    // The text area only shows what was read.
    text.addEventListener('input', function () { text.value = text.defaultValue; });
    clear.addEventListener('click', function () { name.value = ''; text.value = ''; file.value = ''; clear.disabled = true; setField('username', ''); setField('project', ''); setField('ssh_key_data', ''); });
  }

  // ---------------------------------------------------------------- wiring
  $$('[data-external-secret]', form).forEach(function (b) {
    b.addEventListener('click', function () { var tf = typeFormOf(b); wizard(tf, b.getAttribute('data-external-secret'), readPlugin(tf, b.getAttribute('data-external-secret'))); });
  });
  $$('input[data-plugin-value]', form).forEach(function (i) { var tf = typeFormOf(i), v = readPlugin(tf, i.getAttribute('data-plugin-value')); if (v) showSelected(tf, i.getAttribute('data-plugin-value'), v); });
  var testBtn = $('[data-external-test]', form);
  if (testBtn) {
    testBtn.addEventListener('click', externalTest);
    var typeInput = $('[data-type-select] [data-typeahead-value]', form);
    if (typeInput) typeInput.addEventListener('change', function () {
      var tf = $('[data-type-form="' + typeInput.value + '"]', form);
      testBtn.hidden = !tf || tf.getAttribute('data-type-kind') !== 'external';
    });
  }
  $$('[data-gce-upload]', form).forEach(gceUpload);
  // WorkloadIdentityInfo names the mount the credential logs in through.
  $$('[data-wi-vault-command]', form).forEach(function (cmd) {
    var tf = typeFormOf(cmd), ap = $('[name="inputs.default_auth_path"]', tf), issuer = cmd.getAttribute('data-issuer');
    if (ap) ap.addEventListener('input', function () { cmd.value = 'vault write auth/' + (ap.value || 'jwt') + '/config oidc_discovery_url="' + issuer + '" bound_issuer="' + issuer + '"'; });
  });
})();
