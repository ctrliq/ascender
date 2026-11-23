/* Settings edit forms (screens/Setting/shared): each field's value as Formik
   held it, the revert buttons (RevertButton), the switches, the file
   uploads, the confirmation modals and the logging form's conditions. On
   submit the changed values go to the server typed, as the old form sent
   them. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  var form = document.querySelector('[data-settings-form]');
  if (!U || !form) return;
  var $ = U.$, $$ = U.$$, esc = U.esc;
  var kind = form.getAttribute('data-settings-kind');
  var UNSET = { unset: true };

  function parse(s) { if (s === null || s === '') return UNSET; try { return JSON.parse(s); } catch (e) { return UNSET; } }
  function same(a, b) {
    if (a === UNSET || b === UNSET) return a === b;
    if (a !== null && typeof a === 'object') return false;
    return a === b;
  }
  function truthy(v) { return v !== UNSET && Boolean(v); }

  var fields = {};
  $$('[data-setting]', form).forEach(function (g) {
    var key = g.getAttribute('data-setting');
    var f = {
      key: key, group: g, kind: g.getAttribute('data-kind'), type: g.getAttribute('data-type') || '',
      def: parse(g.getAttribute('data-default')), initial: parse(g.getAttribute('data-initial')), value: parse(g.getAttribute('data-current')),
      revert: $('[data-revert]', g), control: $('[data-control]', g), disabled: false
    };
    f.edited = !same(f.value, f.initial) || (f.value !== null && typeof f.value === 'object' && f.value !== f.initial && JSON.stringify(f.value) !== JSON.stringify(f.initial));
    fields[key] = f;
  });
  function val(key) { var f = fields[key]; return f ? f.value : UNSET; }

  // RevertButton: Revert puts the default back, Undo the initial value.
  function revertState(f) {
    var init = f.initial === UNSET || f.initial === null ? '' : f.initial;
    var cur = f.value, revertable = true, match = false;
    if (same(cur, f.def) && !same(cur, init)) revertable = false;
    if (same(cur, f.def) && same(cur, init)) match = true;
    return { revertable: revertable, disabled: f.disabled || match };
  }
  function syncRevert(f) {
    if (!f.revert) return;
    var s = revertState(f), label = s.revertable ? t('Revert') : t('Undo');
    f.revert.setAttribute('aria-label', label); $('.pf-v6-c-button__text', f.revert).textContent = label;
    f.revert.disabled = s.disabled;
  }

  // show draws a value into the field's control.
  function show(f) {
    var v = f.value === UNSET ? '' : f.value, c = f.control;
    switch (f.kind) {
      case 'boolean': c.checked = truthy(v); break;
      case 'object': {
        var text = v === null ? 'null' : String(v), wrap = c.closest('[data-code-editor]');
        if (wrap && wrap.cmView) { wrap.silent = true; var view = wrap.cmView; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); wrap.silent = false; }
        c.value = text; break;
      }
      case 'ee': {
        var name = $('[data-lookup-name]', f.group), hidden = $('[data-lookup-hidden-name]', f.group);
        c.value = v && typeof v === 'object' ? v.id : ''; name.value = v && typeof v === 'object' ? v.name : ''; if (hidden) hidden.value = name.value; break;
      }
      case 'file': {
        c.value = v === null ? '' : String(v);
        var clear = $('[data-file-clear]', f.group); if (clear) clear.disabled = !c.value && !$('[data-file-name]', f.group).value;
        if (f.type === 'dataURL') drawPreview(f);
        break;
      }
      default: c.value = v === null ? '' : String(v);
    }
  }
  function drawPreview(f) {
    var box = $('[data-file-preview]', f.group); if (!box) return;
    var v = f.value === UNSET ? '' : f.value;
    if (v) { box.innerHTML = ''; var img = document.createElement('img'); img.src = v; img.alt = $('[data-file-name]', f.group).value; img.height = 200; img.width = 200; img.setAttribute('height', '200px'); img.setAttribute('width', '200px'); box.appendChild(img); }
    else box.innerHTML = box.getAttribute('data-empty') || box.innerHTML;
  }

  function changed(f) { f.edited = true; syncRevert(f); onChange(f.key); }

  Object.keys(fields).forEach(function (key) {
    var f = fields[key], c = f.control;
    if (!c) return;
    if (f.kind === 'file') { var box = $('[data-file-preview]', f.group); if (box && !f.value) box.setAttribute('data-empty', box.innerHTML); }
    if (f.kind === 'boolean') {
      c.addEventListener('change', function () {
        var on = !truthy(f.value);
        f.value = on;
        if (on && f.group.hasAttribute('data-confirm-on')) U.openModal('settings-local-auth-modal');
        changed(f);
      });
    } else if (f.kind === 'ee') {
      c.addEventListener('change', function () {
        var name = $('[data-lookup-name]', f.group).value;
        f.value = c.value ? { id: parseInt(c.value, 10), name: name } : null;
        f.disabled = f.value === null;
        changed(f);
      });
    } else {
      c.addEventListener(c.tagName === 'SELECT' ? 'change' : 'input', function () { f.value = c.value; changed(f); });
    }
    if (f.revert) {
      f.revert.addEventListener('click', function () {
        var s = revertState(f), init = f.initial === UNSET || f.initial === null ? '' : f.initial;
        f.value = s.revertable ? f.def : init;
        if (f.kind === 'file') { var n = $('[data-file-name]', f.group); if (n) n.value = ''; }
        if (f.kind === 'ee') { f.value = null; f.disabled = true; }
        show(f); changed(f);
      });
    }
  });

  // EncryptedField's PasswordInput: the eye toggles what the input shows.
  $$('[data-setting-toggle-password]', form).forEach(function (b) {
    b.addEventListener('click', function () {
      var inp = $('input[type=password], input[type=text]', b.closest('.pf-v6-c-input-group__item'));
      var showing = inp.type === 'password'; inp.type = showing ? 'text' : 'password';
      $('[data-icon-show]', b).hidden = showing; $('[data-icon-hide]', b).hidden = !showing; U.setTooltip(b, showing ? t('Hide') : t('Show'));
    });
  });

  // FileUploadField: a file read as text (certificates) or as a data URL
  // (logos), its name, and Clear.
  $$('[data-setting-upload]', form).forEach(function (up) {
    var f = fields[up.closest('[data-setting]').getAttribute('data-setting')];
    var input = $('[data-file-input]', up), name = $('[data-file-name]', up), clear = $('[data-file-clear]', up), dataURL = up.hasAttribute('data-as-image');
    $('[data-file-browse]', up).addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var file = input.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { name.value = file.name; f.value = reader.result; show(f); changed(f); };
      if (dataURL) reader.readAsDataURL(file); else reader.readAsText(file);
    });
    clear.addEventListener('click', function () { name.value = ''; input.value = ''; f.value = ''; show(f); changed(f); });
  });

  // drawAlert puts a plain inline alert into out (body is HTML).
  var AIC = (window.ASCENDER || {}).icons || {};
  var ALERT_ICON = { info: AIC.infoCircle, warning: AIC.warnTriangle, danger: AIC.exclamationCircle, success: AIC.checkCircle };
  var ALERT_SR = { info: 'Info alert:', warning: 'Warning alert:', danger: 'Danger alert:', success: 'Success alert:' };
  function drawAlert(out, variant, title, body) {
    out.innerHTML = '<div class="pf-v6-c-alert pf-m-inline pf-m-plain pf-m-' + variant + '"><div class="pf-v6-c-alert__icon">' + (ALERT_ICON[variant] || '') +
      '</div><p class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">' + esc(ALERT_SR[variant]) + '</span>' + esc(title) + '</p>' +
      (body ? '<div class="pf-v6-c-alert__description">' + body + '</div>' : '') + '</div>';
    out.hidden = false;
  }

  // LDAP CA Certificate: Fetch from server reads the chain the server of the
  // URI field presents (unverified) and puts what to trust into the field,
  // showing each certificate's fingerprint to check before saving.
  $$('[data-cert-fetch]', form).forEach(function (b) {
    var g = b.closest('[data-setting]'), f = fields[g.getAttribute('data-setting')];
    var uriKey = b.getAttribute('data-cert-fetch'), tlsKey = uriKey.replace(/SERVER_URI$/, 'START_TLS');
    var out = $('[data-cert-fetch-result]', g), name = $('[data-file-name]', g);
    function draw(variant, title, body) { drawAlert(out, variant, title, body); }
    function chain(d) {
      var trustedFrom = d.leaf_only ? 0 : 1;
      return d.certificates.map(function (c, i) {
        var role = i === 0 ? t('Server certificate') : (c.is_ca ? t('Certificate authority') : t('Intermediate certificate'));
        if (i >= trustedFrom) role += ' (' + t('added to the field') + ')';
        return '<p class="ascender-cert-fetch__chain"><strong>' + esc(role) + '</strong></p>' +
          '<dl class="pf-v6-c-description-list pf-m-horizontal pf-m-compact ascender-cert-fetch__chain">' +
          [[t('Subject'), c.subject], [t('Issuer'), c.issuer], [t('Expires'), c.not_after], ['SHA-256', c.sha256_fingerprint]].map(function (row) {
            return '<div class="pf-v6-c-description-list__group"><dt class="pf-v6-c-description-list__term">' + esc(row[0]) + '</dt><dd class="pf-v6-c-description-list__description">' + esc(row[1]) + '</dd></div>';
          }).join('') + '</dl>';
      }).join('');
    }
    var clear = $('[data-file-clear]', g), revert = $('[data-revert]', g);
    [clear, revert].forEach(function (x) { if (x) x.addEventListener('click', function () { out.hidden = true; }); });
    b.addEventListener('click', function () {
      var uri = val(uriKey);
      uri = uri === UNSET || uri === null ? '' : String(uri).trim();
      if (!uri) { draw('danger', t('Enter an LDAP Server URI to fetch its certificate.')); return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      U.api('POST', '/api/v2/settings/ldap/certificate/', { server_uri: uri }).then(function (r) {
        var d = r.data || {};
        if (r.status !== 200) {
          var msg = (d.server_uri && d.server_uri[0]) || d.error || d.detail || t('The certificate could not be fetched.');
          draw('danger', t('The certificate could not be fetched.'), esc(msg));
          return;
        }
        f.value = d.ca_cert; name.value = t('Fetched from {server}', { server: d.server }); show(f); changed(f);
        var notes = [];
        if (d.leaf_only) notes.push(t('The server sent only its own certificate, so that certificate is trusted as is and must be fetched again when it is renewed. Upload the certificate of the authority that issued it instead to avoid this.'));
        if (/^ldap:\/\//i.test(uri) && !truthy(val(tlsKey))) notes.push(t('LDAP Start TLS is off: an ldap:// server does not use TLS, or this certificate, until it is on.'));
        var body = notes.map(function (n) { return '<p>' + esc(n) + '</p>'; }).join('') + chain(d);
        if (d.trusted) draw('info', t('The system trust store already accepts this server. Saving its certificate here is optional.'), body);
        else draw('warning', t('The certificate was read without verification. Check its fingerprint with the LDAP server administrator before saving.'), body);
      }, function () {
        draw('danger', t('The certificate could not be fetched.'));
      }).then(function () { b.disabled = false; b.removeAttribute('aria-busy'); });
    });
  });

  // LDAP Test (its modal): a bind with the settings the form holds now, saved
  // or not (the organization and team maps aside), and a login as a
  // directory user when a username is given. Nothing is saved.
  var testModal = document.getElementById('settings-ldap-test-modal');
  if (testModal) {
    var testOut = $('[data-ldap-test-result]', testModal), pfx = testModal.getAttribute('data-ldap-prefix');
    var testRun = $('[data-ldap-test-run]', testModal), testUser = $('[data-ldap-test-username]', testModal), testPass = $('[data-ldap-test-password]', testModal);
    var TEST_KEYS = ['SERVER_URI', 'BIND_DN', 'BIND_PASSWORD', 'START_TLS', 'CA_CERT', 'USER_SEARCH', 'USER_DN_TEMPLATE', 'USER_ATTR_MAP',
      'GROUP_SEARCH', 'GROUP_TYPE', 'GROUP_TYPE_PARAMS', 'REQUIRE_GROUP', 'DENY_GROUP', 'USER_FLAGS_BY_GROUP'];
    var TLS = { ldaps: t('LDAPS (TLS from the start)'), start_tls: t('Start TLS'), none: t('None: passwords cross the network unencrypted') };
    var STAGE = {
      connect: t('Could not connect to the LDAP server.'), bind: t('Connected, but the bind failed.'), configuration: t('The LDAP settings are not valid.'),
      local_account: t('The login would not be tried against LDAP.'), search: t('The user was not found.'), user_bind: t('The user was found, but the login failed.'),
      require_group: t('The login was refused by LDAP Require Group.'), deny_group: t('The login was refused by LDAP Deny Group.'),
      groups: t('The login worked, but the groups could not be read.'), flags: t('The login worked, but LDAP User Flags By Group could not be checked.'), login: t('The login failed.')
    };
    var DN_FROM = { USER_DN_TEMPLATE: t('LDAP User DN Template'), USER_SEARCH: t('LDAP User Search') };
    function dl(rows) {
      return '<dl class="pf-v6-c-description-list pf-m-horizontal pf-m-compact ascender-cert-fetch__chain">' + rows.filter(Boolean).map(function (r) {
        return '<div class="pf-v6-c-description-list__group"><dt class="pf-v6-c-description-list__term">' + esc(r[0]) + '</dt><dd class="pf-v6-c-description-list__description">' + (r[2] ? r[1] : esc(r[1])) + '</dd></div>';
      }).join('') + '</dl>';
    }
    function list(items) { return items.length ? items.map(function (i) { return esc(i); }).join('<br>') : esc(t('None')); }
    function bindRows(d) {
      return [[t('Server'), d.server_uri], [t('Encryption'), TLS[d.tls] || d.tls], [t('Bound as'), d.anonymous ? t('Anonymous') : d.bind_dn], d.whoami ? [t('Server says'), d.whoami] : null];
    }
    function loginRows(l) {
      var rows = [[t('Username'), l.username]];
      if (l.dn_from) rows.push([t('DN found with'), DN_FROM[l.dn_from] || l.dn_from]);
      if (l.matches !== null && l.matches !== undefined) rows.push([t('Search matches'), String(l.matches)]);
      if (l.dn) rows.push([t('User DN'), l.dn]);
      if (l.search_errors && l.search_errors.length) rows.push([t('Search errors'), list(l.search_errors), true]);
      // A group requirement refused the login: what the directory says.
      if (l.member_of) rows.push([t('memberOf (direct groups)'), list(l.member_of), true]);
      if (l.groups && !l.ok) rows.push([t('Groups found by LDAP Group Search'), list(l.groups), true]);
      if (l.groups_error) rows.push([t('Group search error'), l.groups_error]);
      return rows;
    }
    function fieldErrors(d) {
      return Object.keys(d).map(function (k) {
        var m = Array.isArray(d[k]) ? d[k].join(' ') : String(d[k]);
        var lf = fields[k], label = lf ? $('.pf-v6-c-form__label-text', lf.group).textContent : (k === 'username' ? t('Username') : k === 'password' ? t('Password') : k);
        return '<p>' + esc(label) + ': ' + esc(m) + '</p>';
      }).join('');
    }
    // The form's value of a setting as Save would send it: the JSON editors' text parsed.
    function formValue(key) {
      var f = fields[key], v = val(key);
      if (!f || v === UNSET) return UNSET;
      if (v === null) return '';
      if (f.kind === 'object' && typeof v === 'string') {
        if (!v.trim() || v.trim() === 'null') return null;
        try { return JSON.parse(v); } catch (e) { return v; }
      }
      return v;
    }
    // Opening the modal starts afresh.
    $$('[data-open-modal="settings-ldap-test-modal"]', form).forEach(function (b) {
      b.addEventListener('click', function () { testOut.hidden = true; testOut.innerHTML = ''; testPass.value = ''; });
    });
    function run() {
      var body = { server: testModal.getAttribute('data-ldap-test') };
      TEST_KEYS.forEach(function (k) { var v = formValue(pfx + k); if (v !== UNSET) body[pfx + k] = v; });
      var user = testUser.value.trim();
      if (user) { body.username = user; body.password = testPass.value; }
      testRun.disabled = true; testRun.setAttribute('aria-busy', 'true');
      drawAlert(testOut, 'info', user ? t('Testing the connection and a login as {user}…', { user: user }) : t('Testing the connection…'));
      U.api('POST', '/api/v2/settings/ldap/test/', body).then(function (r) {
        var d = r.data || {};
        if (r.status === 200) {
          var bindNote = d.tls === 'none' ? '<p>' + esc(t('The connection is not encrypted.')) + '</p>' : '';
          if (!d.login) {
            drawAlert(testOut, d.tls === 'none' ? 'warning' : 'success', t('Connected and bound to the LDAP server.'), bindNote + dl(bindRows(d)));
            return;
          }
          var l = d.login, html = '<p class="ascender-ldap-test__section"><strong>' + esc(t('Connection')) + '</strong></p>' + dl(bindRows(d)) +
            '<p class="ascender-ldap-test__section"><strong>' + esc(t('Login')) + '</strong></p>';
          if (l.ok) {
            var a = l.attributes || {}, fl = l.flags || {};
            var rows = loginRows(l);
            Object.keys(a).forEach(function (k) {
              var label = { first_name: t('First name'), last_name: t('Last name'), email: t('Email') }[k] || k;
              rows.push([label, a[k] === null ? t('Not in the directory') : a[k]]);
            });
            rows.push([t('Groups'), list(l.groups || []), true]);
            Object.keys(fl).forEach(function (k) { rows.push([{ is_superuser: t('System administrator'), is_system_auditor: t('System auditor') }[k] || k, fl[k] ? t('Yes') : t('No')]); });
            drawAlert(testOut, 'success', t('The login as {user} would succeed.', { user: l.username }), bindNote + html + dl(rows));
            return;
          }
          var why = (l.hint ? '<p>' + esc(l.hint) + '</p>' : '') + (l.error ? '<p><code>' + esc(l.error) + '</code></p>' : '');
          drawAlert(testOut, 'danger', STAGE[l.stage] || t('The login failed.'), why + html + dl(loginRows(l)));
          return;
        }
        if (r.status === 400 && d.stage) {
          drawAlert(testOut, 'danger', STAGE[d.stage] || t('The LDAP test failed.'), (d.hint ? '<p>' + esc(d.hint) + '</p>' : '') + '<p><code>' + esc(d.error) + '</code></p>');
          return;
        }
        drawAlert(testOut, 'danger', t('The LDAP test failed.'), fieldErrors(d));
      }, function () {
        drawAlert(testOut, 'danger', t('The LDAP test failed.'));
      }).then(function () { testRun.disabled = false; testRun.removeAttribute('aria-busy'); });
    }
    testRun.addEventListener('click', run);
    [testUser, testPass].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); } }); });
  }

  // DISABLE_LOCAL_AUTH: Confirm keeps the switch on, Cancel turns it off.
  var localConfirm = $('[data-alert-confirm="local-auth"]'), localCancel = $('[data-alert-cancel="local-auth"]');
  if (localConfirm) localConfirm.addEventListener('click', function () { var f = fields.DISABLE_LOCAL_AUTH; f.value = true; show(f); changed(f); U.closeModal(localConfirm.closest('[data-modal]')); });
  if (localCancel) localCancel.addEventListener('click', function () { var f = fields.DISABLE_LOCAL_AUTH; f.value = false; show(f); changed(f); });

  // InputAlertField: the redirect URL is locked until its warning is confirmed.
  var alertBtn = $('[data-input-alert]', form), redirectConfirm = $('[data-alert-confirm="login-redirect"]');
  if (alertBtn) alertBtn.addEventListener('click', function () { U.openModal('settings-login-redirect-modal'); });
  if (redirectConfirm) redirectConfirm.addEventListener('click', function () {
    var f = fields.LOGIN_REDIRECT_OVERRIDE; U.closeModal(redirectConfirm.closest('[data-modal]'));
    if (!f) return;
    f.disabled = false; f.control.disabled = false; f.control.closest('.pf-v6-c-form-control').classList.remove('pf-m-disabled');
    var b = $('[data-input-alert]', f.group); if (b) b.parentNode.remove();
    syncRevert(f);
  });
  if (fields.LOGIN_REDIRECT_OVERRIDE) fields.LOGIN_REDIRECT_OVERRIDE.disabled = fields.LOGIN_REDIRECT_OVERRIDE.control.disabled;
  if (fields.DEFAULT_EXECUTION_ENVIRONMENT) fields.DEFAULT_EXECUTION_ENVIRONMENT.disabled = fields.DEFAULT_EXECUTION_ENVIRONMENT.value === null;

  // LoggingEdit: the switch needs a host and a type, the host and type are
  // required once it is on, and two fields follow the protocol.
  var NOTE = t('Cannot enable log aggregator without providing logging aggregator host and logging aggregator type.');
  function setRequired(f, on) {
    var label = $('.pf-v6-c-form__label', f.group), mark = $('.pf-v6-c-form__label-required', label);
    if (on && !mark) label.insertAdjacentHTML('beforeend', '<span class="pf-v6-c-form__label-required" aria-hidden="true">&nbsp;*</span>');
    if (!on && mark) mark.remove();
    if (f.kind === 'input') { if (on) f.control.setAttribute('required', ''); else f.control.removeAttribute('required'); }
  }
  function onChange(key) {
    if (kind !== 'logging') return;
    var en = fields.LOG_AGGREGATOR_ENABLED;
    if (en && (key === 'LOG_AGGREGATOR_ENABLED' || key === 'LOG_AGGREGATOR_HOST' || key === 'LOG_AGGREGATOR_TYPE' || key === null)) {
      var locked = !truthy(val('LOG_AGGREGATOR_ENABLED')) && (!truthy(val('LOG_AGGREGATOR_HOST')) || !truthy(val('LOG_AGGREGATOR_TYPE')));
      en.disabled = locked; en.control.disabled = locked; syncRevert(en);
      var help = $('[data-popover-html]', en.group);
      if (help) help.setAttribute('data-popover-html', esc(en.group.getAttribute('data-help') || '') + (locked ? '<br><br>' + esc(NOTE) : ''));
      $$('[data-required-when-enabled]', form).forEach(function (g) { setRequired(fields[g.getAttribute('data-setting')], truthy(val('LOG_AGGREGATOR_ENABLED'))); });
    }
    if (key === 'LOG_AGGREGATOR_PROTOCOL' || key === null) {
      $$('[data-cond]', form).forEach(function (g) {
        var on = g.getAttribute('data-cond-values').split(',').indexOf(String(val(g.getAttribute('data-cond')))) !== -1;
        g.hidden = !on;
      });
    }
  }

  // Revert all to default.
  var revertAll = $('[data-alert-confirm="revert-all"]');
  if (revertAll) revertAll.addEventListener('click', function () {
    revertAll.disabled = true;
    $('[data-settings-action]', form).value = 'revert';
    $('[data-settings-values]', form).value = '';
    form.submit();
  });

  // Save: the values the user changed, typed as the form held them.
  form.addEventListener('submit', function () {
    $('[data-settings-action]', form).value = '';
    var out = {};
    Object.keys(fields).forEach(function (key) { var f = fields[key]; if (f.edited && f.value !== UNSET) out[key] = f.value; });
    $('[data-settings-values]', form).value = JSON.stringify(out);
  });
})();
