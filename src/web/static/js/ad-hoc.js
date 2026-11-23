/* Run Command (components/AdHocCommands): the ad hoc command wizard the
   inventory host and group lists open. Details, Execution Environment,
   Instance Groups, Credential, Credential passwords (when the credential
   asks for them) and Preview, posting to the inventory's ad_hoc_commands. */
(function () {
  'use strict';
  var U = window.ASCENDER && window.ASCENDER.ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, api = U.api, el = U.el, esc = U.esc;
  var IC = Object.assign({}, U.ICON, (window.ASCENDER || {}).icons || {});
  var BRAND = 'Ascender';
  var VERBOSITY = [['0', t('0 (Normal)')], ['1', t('1 (Verbose)')], ['2', t('2 (More Verbose)')], ['3', t('3 (Debug)')], ['4', t('4 (Connection Debug)')], ['5', t('5 (WinRM Debug)')]];
  var VERBOSITY_LABEL = {}; VERBOSITY.forEach(function (v) { VERBOSITY_LABEL[v[0]] = v[1]; });

  function help(text, html) {
    return '<div style="display: contents;"><button aria-label="' + esc(t('More information')) + '" aria-haspopup="true" class="ascender-popover__button pf-v6-c-form__group-label-help" type="button"' + (html ? ' data-popover="" data-popover-html="' + esc(text) + '"' : ' data-popover="' + esc(text) + '"') + '>' + IC.help + '</button></div>';
  }
  function labelHelp(text, html) { return '&nbsp;&nbsp;<span class="pf-v6-c-form__group-label-help">' + help(text, html) + '</span>'; }
  function required() { return '<span class="pf-v6-c-form__label-required" aria-hidden="true">&nbsp;*</span>'; }
  var helperError = U.helperError, statusIcon = U.statusIcon;
  function selectedNames(button) {
    var card = button.closest('.pf-v6-c-card') || document;
    return $$('[data-list-table] [data-select-row]', card).filter(function (c) { return c.checked; }).map(function (c) { var row = c.closest('[data-row]'); return row ? row.getAttribute('data-name') : ''; }).filter(Boolean);
  }

  function open(button) {
    var inventoryID = button.getAttribute('data-run-command');
    var modules = []; try { modules = JSON.parse(button.getAttribute('data-modules') || '[]') || []; } catch (e) { modules = []; }
    var names = selectedNames(button);
    // The inventory's organization (execution environments it may use) and
    // the machine credential type, as AdHocCommands read them.
    Promise.all([api('GET', '/api/v2/inventories/' + inventoryID + '/'), api('GET', '/api/v2/credential_types/?namespace=ssh')]).then(function (rs) {
      var org = rs[0].ok ? rs[0].data.organization : null;
      var sshType = rs[1].ok && rs[1].data.results && rs[1].data.results[0] ? rs[1].data.results[0].id : null;
      wizard(button, inventoryID, modules, names, org, sshType);
    });
  }

  function wizard(button, inventoryID, modules, names, organizationID, credentialTypeID) {
    var v = {
      limit: names.join(', ') || 'all', credentials: [], module_args: '', verbosity: 0, forks: 0, diff_mode: false, become_enabled: '',
      module_name: '', extra_vars: '---', job_type: 'run', credential_passwords: {}, execution_environment: [], instance_groups: []
    };
    var touched = {}, visited = {}, current = 'details', lists = {};
    function inputs() { return (v.credentials[0] && v.credentials[0].inputs) || {}; }
    function asks(key) { return inputs()[key] === 'ASK'; }
    function showPasswords() { return asks('password') || asks('become_password') || asks('ssh_key_unlock'); }
    function argsRequired() { return v.module_name === 'command' || v.module_name === 'shell'; }
    function passwordFields() {
      var f = [];
      if (asks('password')) f.push({ id: 'launch-ssh-password', label: t('SSH password'), key: 'ssh_password' });
      if (asks('ssh_key_unlock')) f.push({ id: 'launch-private-key-passphrase', label: t('Private key passphrase'), key: 'ssh_key_unlock' });
      if (asks('become_password')) f.push({ id: 'launch-privilege-escalation-password', label: t('Privilege escalation password'), key: 'become_password' });
      return f;
    }
    var STEPS = {
      details: { name: t('Details'), nav: 'details', label: 'details-step',
        hasError: function () { if (!visited.details) return false; if (!v.module_name && touched.module_name) return true; return argsRequired() && !v.module_args; },
        touch: function () { touched.module_name = true; touched.module_args = true; }, render: renderDetails },
      executionEnvironment: { name: t('Execution Environment'), nav: 'executionEnvironment', label: 'executionEnvironment-step', hasError: function () { return false; }, touch: function () {}, render: renderEE },
      instanceGroups: { name: t('Instance Groups'), nav: 'instanceGroups', label: 'instanceGroups-step', hasError: function () { return false; }, touch: function () {}, render: renderIG },
      credentials: { name: t('Credential'), nav: 'credentials', label: 'credential-step',
        hasError: function () { return !!visited.credentials && !v.credentials.length && !!touched.credentials; },
        touch: function () { touched.credentials = true; }, render: renderCredential },
      credentialPasswords: { name: t('Credential passwords'), nav: 'credentialPasswords', label: 'credential-passwords-step',
        hasError: function () { return showPasswords() && !!visited.credentialPasswords && passwordFields().some(function (f) { return !v.credential_passwords[f.key]; }); },
        touch: function () { Object.keys(v.credential_passwords).forEach(function (k) { touched['pw.' + k] = true; }); }, render: renderPasswords },
      preview: { name: t('Preview'), nav: 'preview', label: 'preview-step', hasError: function () { return false; }, touch: function () {}, render: renderPreview }
    };
    function order() { var o = ['details', 'executionEnvironment', 'instanceGroups', 'credentials']; if (showPasswords()) o.push('credentialPasswords'); o.push('preview'); return o; }
    function anyErrors() { return order().some(function (id) { return STEPS[id].hasError(); }); }

    var title = esc(t('Run command'));
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + title + '" aria-modal="true" class="pf-v6-c-modal-box pf-m-lg"><div class="pf-v6-c-wizard ascender-wizard" style="overflow: scroll;">' +
      '<div class="pf-v6-c-wizard__header"><div class="pf-v6-c-wizard__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-close-modal><span class="pf-v6-c-button__icon">' + IC.close + '</span></button></div><div class="pf-v6-c-wizard__title"><h2 class="pf-v6-c-wizard__title-text">' + title + '</h2></div></div>' +
      '<button class="pf-v6-c-wizard__toggle" aria-label="Wizard toggle" aria-expanded="false" type="button"><span class="pf-v6-c-wizard__toggle-list" data-wizard-toggle></span><span class="pf-v6-c-wizard__toggle-icon">' + (IC.angleRight || '') + '</span></button>' +
      '<div class="pf-v6-c-wizard__outer-wrap"><div class="pf-v6-c-wizard__inner-wrap"><nav class="pf-v6-c-wizard__nav" aria-label="Wizard steps"><ol class="pf-v6-c-wizard__nav-list" role="list" data-wizard-nav></ol></nav><div tabindex="-1" class="pf-v6-c-wizard__main"><div class="pf-v6-c-wizard__main-body" data-wizard-body></div></div></div>' +
      '<footer class="pf-v6-c-wizard__footer"><div class="pf-v6-c-action-list"><div class="pf-v6-c-action-list__group"><div class="pf-v6-c-action-list__item"><button class="pf-v6-c-button pf-m-secondary" type="button" data-wizard-back><span class="pf-v6-c-button__text">' + esc(t('Back')) + '</span></button></div><div class="pf-v6-c-action-list__item"><button class="pf-v6-c-button pf-m-primary" type="submit" data-wizard-next><span class="pf-v6-c-button__text">' + esc(t('Next')) + '</span></button></div></div><div class="pf-v6-c-action-list__group"><div class="pf-v6-c-action-list__item"><button class="pf-v6-c-button pf-m-link" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button></div></div></div></footer>' +
      '</div></div></div></div></div>');
    var root = $('#ascender-modal-root'); root.innerHTML = ''; root.appendChild(m); U.openModal(m);
    var body = $('[data-wizard-body]', m);

    // StepName: the name, red with an exclamation once the step has errors.
    function stepName(id) {
      var s = STEPS[id];
      if (!s.hasError()) return '<div id="' + s.label + '">' + esc(s.name) + '</div>';
      return '<div class="ascender-step-name__alert-text" id="' + s.label + '">' + esc(s.name) + '<div style="display: contents;" data-tooltip="' + esc(t('This step contains errors')) + '" data-tooltip-pos="right">' + IC.exclamationCircle.replace('<svg ', '<svg style="color: var(--pf-t--global--color--status--danger--default);" ').replace('class="pf-v6-svg"', 'class="pf-v6-svg ascender-step-name__exclamation-circle-icon"') + '</div></div>';
    }
    function nav() {
      var ids = order(), idx = ids.indexOf(current);
      $('[data-wizard-nav]', m).innerHTML = ids.map(function (id) { var on = id === current; return '<li class="pf-v6-c-wizard__nav-item"><button id="' + STEPS[id].nav + '" class="pf-v6-c-wizard__nav-link' + (on ? ' pf-m-current' : '') + '" aria-current="' + (on ? 'step' : 'false') + '" type="button" data-wizard-go="' + id + '"><span class="pf-v6-c-wizard__nav-link-main">' + stepName(id) + '</span></button></li>'; }).join('');
      $('[data-wizard-toggle]', m).innerHTML = '<span class="pf-v6-c-wizard__toggle-list-item"><span class="pf-v6-c-wizard__toggle-num">' + (idx + 1) + '</span> ' + stepName(current) + '</span>';
      $$('[data-wizard-go]', m).forEach(function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-wizard-go'), true); }); });
      var back = $('[data-wizard-back]', m), next = $('[data-wizard-next]', m);
      back.disabled = idx === 0;
      $('.pf-v6-c-button__text', next).textContent = current === 'preview' ? t('Launch') : t('Next');
      next.disabled = current === 'preview' && anyErrors();
    }
    function collect() {
      var ed = $('[data-code-editor]', body);
      if (ed && current === 'details') v.extra_vars = ed.cmView ? ed.cmView.state.doc.toString() : $('[data-code-editor-value]', ed).value;
    }
    function show() { body.innerHTML = ''; body.scrollTop = 0; STEPS[current].render(); nav(); }
    // Wizard onNext and onGoToStep: arriving at the preview visits every
    // step; otherwise the step left is visited and its fields touched.
    function go(id, viaNav) {
      collect();
      if (id === current && viaNav) return;
      // visitAllSteps marks every step, the passwords step too while it is not shown.
      if (id === 'preview') { Object.keys(STEPS).forEach(function (s) { visited[s] = true; STEPS[s].touch(); }); }
      else { visited[current] = true; STEPS[current].touch(); }
      current = id;
      show();
    }
    $('[data-wizard-next]', m).addEventListener('click', function () {
      collect();
      if (current === 'preview') { if (!anyErrors()) launch(); return; }
      var ids = order(); go(ids[ids.indexOf(current) + 1]);
    });
    $('[data-wizard-back]', m).addEventListener('click', function () { collect(); var ids = order(), i = ids.indexOf(current); if (i > 0) { current = ids[i - 1]; show(); } });

    // ------------------------------------------------------------ details
    function renderDetails() {
      var req = argsRequired(), valid = !req || v.module_args !== '';
      var modErr = touched.module_name && !v.module_name;
      var opts = '<option class="" value="" disabled="">' + esc(t('Choose a module')) + '</option>' + modules.map(function (mod) { return '<option class="" value="' + esc(mod) + '"' + (mod === v.module_name ? ' selected' : '') + '>' + esc(mod) + '</option>'; }).join('');
      var argsHelp = v.module_name ? esc(t('These arguments are used with the specified module. You can find information about {0} by clicking ', { 0: v.module_name })) + '<a href="https://docs.ansible.com/ansible/latest/modules/' + esc(v.module_name) + '_module.html" target="_blank" rel="noopener noreferrer"> ' + esc(t('here.')) + '</a>' : esc(t('These arguments are used with the specified module.'));
      var extraHelp = '<div class="ascender-ad-hoc-details-step__tooltip-wrapper"><p>' + esc(t('Pass extra command line changes. There are two ansible command line parameters: ')) + '<br><code>-e</code>, <code>--extra-vars </code><br>' + esc(t('Provide key/value pairs using either YAML or JSON.')) + '</p>JSON:<br><code><pre>{\n  "somevar": "somevalue",\n  "password": "magic"\n}</pre></code>YAML:<br><code><pre>---\nsomevar: somevalue\npassword: magic</pre></code></div>';
      var becomeHelp = '<p>' + esc(t('Enables creation of a provisioning callback URL. Using the URL a host can contact {brandName} and request a configuration update using this job template', { brandName: BRAND })) + '&nbsp;<code>--become </code>' + esc(t('option to the')) + ' &nbsp;<code>ansible </code>' + esc(t('command')) + '</p>';
      var html = '<form novalidate="" autocomplete="off" class="pf-v6-c-form" data-no-submit><div class="ascender-form-column-layout"><div class="ascender-form-full-width-layout">' +
        '<div class="pf-v6-c-form__group" aria-label="' + esc(t('select module')) + '"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="module_name"><span class="pf-v6-c-form__label-text">' + esc(t('Module')) + '</span>' + required() + '</label>' + labelHelp(t('These are the modules that {brandName} supports running commands against.', { brandName: BRAND })) + '</div><div class="pf-v6-c-form__group-control"><span class="pf-v6-c-form-control' + (modErr ? ' pf-m-error' : '') + '"><select id="module_name" aria-label="' + esc(t('Select Input')) + '" aria-invalid="' + (modErr ? 'true' : 'false') + '" data-ah="module_name">' + (v.module_name ? opts : opts.replace('value="" disabled="">', 'value="" disabled="" selected>')) + '</select><span class="pf-v6-c-form-control__utilities">' + (modErr ? '<span class="pf-v6-c-form-control__icon pf-m-status">' + IC.exclamationCircle + '</span>' : '') + '<span class="pf-v6-c-form-control__toggle-icon">' + IC.caret + '</span></span></span>' + (valid ? '' : '<div class="pf-v6-c-form__helper-text"><div class="pf-v6-c-helper-text"><div class="pf-v6-c-helper-text__item pf-m-error"><span class="pf-v6-c-helper-text__item-icon">' + IC.exclamationCircle + '</span><span class="pf-v6-c-helper-text__item-text"><span class="pf-v6-screen-reader">: error status;</span></span></div></div></div>') + '</div></div>' +
        '<div class="pf-v6-c-form__group" data-cy="module_args-form-group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="module_args"><span class="pf-v6-c-form__label-text">' + esc(t('Arguments')) + '</span>' + (req ? required() : '') + '</label>' + labelHelp(argsHelp, true) + '</div><div class="pf-v6-c-form__group-control"><span class="pf-v6-c-form-control' + (valid ? '' : ' pf-m-error') + '"><input id="module_args" aria-label="' + esc(t('Arguments')) + '" aria-invalid="' + (valid ? 'false' : 'true') + '"' + (req ? ' required=""' : '') + ' type="text" value="' + esc(v.module_args) + '" name="module_args" data-ah="module_args">' + (valid ? '' : statusIcon()) + '</span>' + (!valid && touched.module_args ? helperError(t('This field must not be blank')) : '') + '</div></div>' +
        '<div class="pf-v6-c-form__group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="verbosity"><span class="pf-v6-c-form__label-text">' + esc(t('Verbosity')) + '</span></label>' + labelHelp(t('These are the verbosity levels for standard out of the command run that are supported.')) + '</div><div class="pf-v6-c-form__group-control"><span class="pf-v6-c-form-control"><select id="verbosity" aria-label="' + esc(t('Select Input')) + '" aria-invalid="false" data-ah="verbosity">' + VERBOSITY.map(function (o) { return '<option class="" value="' + o[0] + '"' + (String(v.verbosity) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select><span class="pf-v6-c-form-control__utilities"><span class="pf-v6-c-form-control__toggle-icon">' + IC.caret + '</span></span></span></div></div>' +
        '<div class="pf-v6-c-form__group" data-cy="limit-form-group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="limit"><span class="pf-v6-c-form__label-text">' + esc(t('Limit')) + '</span></label>' + labelHelp('<span>' + esc(t("The pattern used to target hosts in the inventory. Leaving the field blank, all, and * will all target all hosts in the inventory. You can find more information about Ansible's host patterns")) + ' <a href="https://docs.ansible.com/ansible/latest/user_guide/intro_patterns.html" target="_blank" rel="noopener noreferrer">' + esc(t('here')) + '</a></span>', true) + '</div><div class="pf-v6-c-form__group-control"><span class="pf-v6-c-form-control"><input id="limit" aria-label="' + esc(t('Limit')) + '" aria-invalid="false" type="text" value="' + esc(v.limit) + '" name="limit" data-ah="limit"></span></div></div>' +
        '<div class="pf-v6-c-form__group" data-cy="template-forks-form-group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="template-forks"><span class="pf-v6-c-form__label-text">' + esc(t('Forks')) + '</span></label>' + labelHelp('<span>' + esc(t('The number of parallel or simultaneous processes to use while executing the playbook. Inputting no value will use the default value from the ansible configuration file.  You can find more information')) + ' <a href="https://docs.ansible.com/ansible/latest/installation_guide/intro_configuration.html#the-ansible-configuration-file" target="_blank" rel="noopener noreferrer">' + esc(t('here.')) + '</a></span>', true) + '</div><div class="pf-v6-c-form__group-control"><span class="pf-v6-c-form-control"><input id="template-forks" min="0" aria-label="' + esc(t('Forks')) + '" aria-invalid="false" type="number" value="' + esc(v.forks) + '" name="forks" data-ah="forks"></span></div></div>' +
        '<div class="ascender-form-column-layout"><div class="pf-v6-c-form__group" aria-label="' + esc(t('Show changes')) + '"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label"><span class="pf-v6-c-form__label-text">' + esc(t('Show changes')) + '</span></label>' + labelHelp(t("If enabled, show the changes made by Ansible tasks, where supported. This is equivalent to Ansible's --diff mode.")) + '</div><div class="pf-v6-c-form__group-control"><label class="pf-v6-c-switch" for="diff_mode"><input id="diff_mode" class="pf-v6-c-switch__input" role="switch" aria-label="' + esc(t('toggle changes')) + '" type="checkbox"' + (v.diff_mode ? ' checked' : '') + ' data-ah="diff_mode"><span class="pf-v6-c-switch__toggle"></span><span class="pf-v6-c-switch__label" aria-hidden="true">' + esc(t('On')) + '</span></label></div></div>' +
        '<div class="pf-v6-c-form__group" name="become_enabled"><div class="pf-v6-c-form__group-control"><div class="ascender-form-checkbox-layout"><div class="pf-v6-c-check"><input id="become_enabled" class="pf-v6-c-check__input" aria-invalid="false" aria-label="' + esc(t('Enable privilege escalation')) + '" type="checkbox"' + (v.become_enabled === true ? ' checked' : '') + ' data-ah="become_enabled"><label class="pf-v6-c-check__label" for="become_enabled"><span>' + esc(t('Enable privilege escalation')) + '&nbsp;' + help(becomeHelp, true) + '</span></label></div></div></div></div></div>' +
        '<div><div class="pf-v6-c-form__group" data-editor-group><div class="ascender-variables-field__header" data-cy="extra_vars-label"><div class="pf-v6-l-split pf-m-gutter"><div class="pf-v6-l-split__item"><label for="extra_vars" class="pf-v6-c-form__label" id="extra_vars-label"><span class="pf-v6-c-form__label-text">' + esc(t('Extra variables')) + '</span></label>' + help(extraHelp, true) + '</div><div class="pf-v6-l-split__item"><div class="ascender-button-group__group"><button aria-label="' + esc(t('YAML')) + '" class="pf-v6-c-button pf-m-primary ascender-multi-button-toggle__small-button toggle-button-yaml" type="button" data-editor-mode="yaml"><span class="pf-v6-c-button__text">' + esc(t('YAML')) + '</span></button><button aria-label="' + esc(t('JSON')) + '" class="pf-v6-c-button pf-m-secondary ascender-multi-button-toggle__small-button toggle-button-javascript" type="button" data-editor-mode="javascript"><span class="pf-v6-c-button__text">' + esc(t('JSON')) + '</span></button></div></div></div></div><div class="ascender-code-editor__focus-wrapper" tabindex="0" data-editor-focus><div data-cy="code-editor" class="ascender-code-editor__wrapper pf-v6-c-form-control" data-code-editor data-editor-id="extra_vars" data-rows="auto" data-min-rows="4" data-mode="yaml"><textarea hidden data-code-editor-value>' + esc(v.extra_vars) + '</textarea></div></div><div class="pf-v6-c-form__helper-text keyboard-help-text" aria-live="polite">' + esc(t('Press Enter to edit. Press ESC to stop editing.')) + '</div></div></div>' +
        '</div></div></form>';
      body.innerHTML = html;
      var ed = $('[data-code-editor]', body);
      if (ed && window.ASCENDER.initEditor) window.ASCENDER.initEditor(ed);
      $('[data-ah="module_name"]', body).addEventListener('change', function () {
        collect();
        // A module other than command and shell clears the arguments' touch.
        if (this.value !== 'command' && this.value !== 'shell') touched.module_args = false;
        v.module_name = this.value; show();
      });
      var args = $('[data-ah="module_args"]', body);
      args.addEventListener('input', function () { var was = argsRequired() && v.module_args === ''; v.module_args = args.value; var now = argsRequired() && v.module_args === ''; if (was !== now) { collect(); show(); var a = $('[data-ah="module_args"]', body); a.focus(); a.setSelectionRange(a.value.length, a.value.length); } else nav(); });
      args.addEventListener('blur', function () { if (!touched.module_args) { touched.module_args = true; if (argsRequired() && !v.module_args) { collect(); show(); } } });
      $('[data-ah="verbosity"]', body).addEventListener('change', function () { v.verbosity = this.value; });
      $('[data-ah="limit"]', body).addEventListener('input', function () { v.limit = this.value; });
      $('[data-ah="forks"]', body).addEventListener('input', function () { v.forks = this.value === '' ? '' : Number(this.value); });
      $('[data-ah="diff_mode"]', body).addEventListener('change', function () { v.diff_mode = this.checked; });
      $('[data-ah="become_enabled"]', body).addEventListener('change', function () { v.become_enabled = this.checked; });
    }

    // ------------------------------------------------------------ pick lists
    function list(key, o) {
      // Each step keeps its list (search, page, sort) while the wizard is open.
      if (!lists[key]) lists[key] = U.optionsList(o); else lists[key].optionsList.render();
      return lists[key];
    }
    function renderEE() {
      var f = el('<form novalidate="" autocomplete="off" class="pf-v6-c-form" data-no-submit><div class="pf-v6-c-form__group" aria-label="' + esc(t('Execution Environment')) + '"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="execution_enviroment"><span class="pf-v6-c-form__label-text">' + esc(t('Execution Environment')) + '</span></label>' + labelHelp(t('Select the Execution Environment you want this command to run inside.')) + '</div><div class="pf-v6-c-form__group-control" data-slot></div></div></form>');
      var params = { or__organization__isnull: 'True' };
      if (organizationID) params.or__organization__id = organizationID;
      $('[data-slot]', f).appendChild(list('ee', { resource: 'execution_environments', ns: 'execution_environments', header: t('Execution Environments'), name: 'execution_environment', params: params,
        searchColumns: [{ name: t('Name'), key: 'name__icontains', isDefault: true }, { name: t('Created By (Username)'), key: 'created_by__username' }, { name: t('Modified By (Username)'), key: 'modified_by__username' }],
        value: function () { return v.execution_environment; }, select: function (item) { v.execution_environment = [item]; }, deselect: function () { v.execution_environment = []; }, onChange: nav }));
      body.appendChild(f);
    }
    function renderIG() {
      var d = el('<div data-cy="instance-groups-prompt"></div>');
      d.appendChild(list('ig', { resource: 'instance_groups', ns: 'instance-groups', header: t('Instance Groups'), multi: true, draggable: true,
        searchColumns: [{ name: t('Name'), key: 'name__icontains', isDefault: true }, { name: t('Credential Name'), key: 'credential__name__icontains' }],
        value: function () { return v.instance_groups; }, select: function (item) { v.instance_groups = v.instance_groups.concat([item]); },
        deselect: function (item) { v.instance_groups = v.instance_groups.filter(function (g) { return String(g.id) !== String(item.id); }); },
        reorder: function (arr) { v.instance_groups = arr; }, onChange: nav }));
      body.appendChild(d);
    }
    function credentialsChanged(before) {
      // useAdHocLaunchSteps: when the number of credentials changes, the
      // prompted passwords reset and each password input the credential
      // has starts empty.
      if (before === v.credentials.length) return;
      var inp = inputs();
      if (!v.credentials[0] || !v.credentials[0].inputs) return;
      if ((inp.password || inp.become_password || inp.ssh_key_unlock) === 'ASK') v.credential_passwords = {};
      Object.keys(inp).forEach(function (k) {
        if (k === 'become_password' || k === 'ssh_key_unlock') v.credential_passwords[k] = '';
        if (k === 'password') v.credential_passwords.ssh_password = '';
      });
    }
    function renderCredential() {
      var err = touched.credentials && !v.credentials.length;
      var wrap = el('<div></div>');
      if (err) wrap.appendChild(el('<div aria-label="Danger Alert" class="pf-v6-c-alert pf-m-inline pf-m-danger ascender-ad-hoc-credential-step__error-alert"><div class="pf-v6-c-alert__icon">' + IC.exclamationCircle + '</div><p class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">Danger alert:</span>A credential must be selected</p></div>'));
      var f = el('<form novalidate="" autocomplete="off" class="pf-v6-c-form" data-no-submit><div class="pf-v6-c-form__group" aria-label="' + esc(t('Machine Credential')) + '"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="credential"><span class="pf-v6-c-form__label-text">' + esc(t('Machine Credential')) + '</span>' + required() + '</label>' + labelHelp(t('Select the credential you want to use when accessing the remote hosts to run the command. Choose the credential containing the username and SSH key or password that Ansible will need to log into the remote hosts.')) + '</div><div class="pf-v6-c-form__group-control" data-slot></div></div></form>');
      var slot = $('[data-slot]', f);
      slot.appendChild(list('cred', { resource: 'credentials', ns: 'credentials', header: t('Machine Credential'), name: 'credential', params: { credential_type: credentialTypeID },
        searchColumns: [{ name: t('Name'), key: 'name__icontains', isDefault: true }, { name: t('Created By (Username)'), key: 'created_by__username__icontains' }, { name: t('Modified By (Username)'), key: 'modified_by__username__icontains' }],
        value: function () { return v.credentials; },
        select: function (item) { var n = v.credentials.length; v.credentials = [item]; credentialsChanged(n); },
        deselect: function () { var n = v.credentials.length; v.credentials = []; credentialsChanged(n); },
        onChange: function () { if (current === 'credentials') { var a = $('.ascender-ad-hoc-credential-step__error-alert', body), h = $('[data-cred-error]', body); if (v.credentials.length) { if (a) a.remove(); if (h) h.remove(); } } nav(); } }));
      if (err) slot.appendChild(el('<div data-cred-error>' + helperError('A credential must be selected') + '</div>').firstChild);
      $$('.pf-v6-c-form__helper-text', slot).forEach(function (h) { h.setAttribute('data-cred-error', ''); });
      wrap.appendChild(f);
      while (wrap.firstChild) body.appendChild(wrap.firstChild);
    }
    function renderPasswords() {
      var html = '<form novalidate="" class="pf-v6-c-form" data-no-submit>' + passwordFields().map(function (fd) {
        var val = v.credential_passwords[fd.key] || '', bad = touched['pw.' + fd.key] && !val;
        return '<div class="pf-v6-c-form__group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="' + fd.id + '"><span class="pf-v6-c-form__label-text">' + esc(fd.label) + '</span>' + required() + '</label>&nbsp;&nbsp;</div><div class="pf-v6-c-form__group-control"><div class="pf-v6-c-input-group" data-secret-group><div class="pf-v6-c-input-group__item pf-m-fill"><div style="display: contents;"><button aria-label="' + esc(t('Toggle Password')) + '" class="pf-v6-c-button pf-m-control" type="button" data-tooltip="' + esc(t('Show')) + '" data-tooltip-pos="top" data-ah-toggle><span class="pf-v6-c-button__text"><span data-icon-show>' + (IC.eyeSlash || '') + '</span><span data-icon-hide hidden>' + (IC.eye || '') + '</span></span></button></div><span class="pf-v6-c-form-control' + (bad ? ' pf-m-error' : '') + '"><input autocomplete="new-password" id="' + fd.id + '" aria-invalid="' + (bad ? 'true' : 'false') + '" required="" type="password" value="' + esc(val) + '" name="credential_passwords.' + fd.key + '" data-ah-pw="' + fd.key + '">' + (bad ? statusIcon() : '') + '</span></div></div>' + (bad ? helperError(t('This field may not be blank')) : '') + '</div></div>';
      }).join('') + '</form>';
      body.innerHTML = html;
      $$('[data-ah-pw]', body).forEach(function (i) {
        i.addEventListener('input', function () { v.credential_passwords[i.getAttribute('data-ah-pw')] = i.value; nav(); });
        i.addEventListener('blur', function () { var k = 'pw.' + i.getAttribute('data-ah-pw'); if (!touched[k]) { touched[k] = true; if (!i.value) show(); } });
      });
      $$('[data-ah-toggle]', body).forEach(function (b) { b.addEventListener('click', function () { var inp = $('input', b.closest('[data-secret-group]')); var showIt = inp.type === 'password'; inp.type = showIt ? 'text' : 'password'; $('[data-icon-show]', b).hidden = showIt; $('[data-icon-hide]', b).hidden = !showIt; U.setTooltip(b, showIt ? t('Hide') : t('Show')); }); });
    }

    // ------------------------------------------------------------ preview
    function detail(label, value) {
      // Detail renders nothing for an empty value; a true one keeps its
      // label and shows no text, as React drops booleans.
      if (!value && typeof value !== 'number') return '';
      return '<div><dt class="ascender-detail-name">' + esc(label) + '</dt><dd class="ascender-detail-value">' + (value === true ? '' : esc(value)) + '</dd></div>';
    }
    function titleCase(k) { return k.split('_').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
    function yamlOf(s) {
      // jsonToYaml(JSON.stringify(extra_vars)): the variables string dumped
      // as one YAML scalar.
      if (s === '') return '---\n';
      if (!Object.keys(Object(s)).length) return '---\n';
      try { return window.AscenderCM.jsyaml.dump(s); } catch (e) { return String(s); }
    }
    function renderPreview() {
      var has = anyErrors();
      var html = has ? '<div class="ascender-ad-hoc-preview-step__error-message-wrapper">' + esc(t('Some of the previous step(s) have errors')) + '<div style="display: contents;" data-tooltip="' + esc(t('See errors on the left')) + '" data-tooltip-pos="right">' + IC.exclamationCircle.replace('class="pf-v6-svg"', 'class="pf-v6-svg ascender-ad-hoc-preview-step__exclamation-circle-icon"') + '</div></div>' : '';
      var d = '';
      ['limit', 'module_args', 'forks', 'diff_mode', 'become_enabled', 'module_name', 'job_type'].forEach(function (k) { d += detail(titleCase(k), v[k]); });
      d += detail(t('Credential'), v.credentials[0] && v.credentials[0].name);
      d += detail(t('Execution Environment'), v.execution_environment[0] && v.execution_environment[0].name);
      if (v.instance_groups.length) d += detail(t('Instance Groups'), v.instance_groups.map(function (g) { return g.name; }).join(', '));
      // {verbosity && <Detail/>}: a verbosity of 0 renders as the text "0".
      if (v.verbosity === 0) d += '0'; else if (v.verbosity) d += detail(t('Verbosity'), VERBOSITY_LABEL[String(v.verbosity)]);
      if (v.extra_vars) d += '<div class="ascender-variables-detail__wrapper" data-editor-group><div class="ascender-variables-detail__label" id=""><div class="pf-v6-l-split pf-m-gutter"><div class="pf-v6-l-split__item pf-m-fill"><div class="pf-v6-l-split pf-m-gutter" style="align-items: baseline;"><div class="pf-v6-l-split__item"><label class="pf-v6-c-form__label" for="-preview" id="-preview-label"><span class="pf-v6-c-form__label-text" style="font-weight: var(--pf-t--global--font--weight--heading--bold);">' + esc(t('Variables')) + '</span></label></div><div class="pf-v6-l-split__item"><div class="ascender-button-group__group"><button aria-label="' + esc(t('YAML')) + '" class="pf-v6-c-button pf-m-primary ascender-multi-button-toggle__small-button toggle-button-yaml" type="button" data-editor-mode="yaml"><span class="pf-v6-c-button__text">' + esc(t('YAML')) + '</span></button><button aria-label="' + esc(t('JSON')) + '" class="pf-v6-c-button pf-m-secondary ascender-multi-button-toggle__small-button toggle-button-javascript" type="button" data-editor-mode="javascript"><span class="pf-v6-c-button__text">' + esc(t('JSON')) + '</span></button></div></div></div></div></div></div><div class="ascender-variables-detail__editor-wrapper"><div class="ascender-code-editor__focus-wrapper" tabindex="-1"><div data-cy="code-editor" class="ascender-code-editor__wrapper ascender-code-editor__wrapper--read-only pf-v6-c-form-control" data-code-editor data-readonly data-editor-id="-preview" data-rows="4" data-mode="yaml"><textarea hidden data-code-editor-value>' + esc(yamlOf(v.extra_vars)) + '</textarea></div></div></div></div>';
      body.innerHTML = html + '<dl class="ascender-detail-list" gutter="sm">' + d + '</dl>';
      var ed = $('[data-code-editor]', body);
      if (ed && window.ASCENDER.initEditor) window.ASCENDER.initEditor(ed);
    }

    // ------------------------------------------------------------ launch
    function launch() {
      var post = { credential: v.credentials[0] && v.credentials[0].id };
      ['become_password', 'ssh_password', 'ssh_key_unlock'].forEach(function (k) { if (k in v.credential_passwords) post[k] = v.credential_passwords[k]; });
      post.execution_environment = v.execution_environment[0] && v.execution_environment[0].id;
      if (v.instance_groups.length) post.instance_groups = v.instance_groups.map(function (g) { return g.id; });
      // The old wizard sent become_enabled as '' until the box was
      // ticked, which the API refuses; an unticked box is sent as false.
      post.limit = v.limit; post.module_args = v.module_args; post.verbosity = Number(v.verbosity); post.forks = v.forks === '' ? 0 : Number(v.forks);
      post.diff_mode = !!v.diff_mode; post.become_enabled = v.become_enabled === true; post.module_name = v.module_name; post.extra_vars = v.extra_vars; post.job_type = v.job_type;
      Object.keys(post).forEach(function (k) { if (post[k] === undefined) delete post[k]; });
      var next = $('[data-wizard-next]', m); next.disabled = true;
      var url = '/api/v2/inventories/' + inventoryID + '/ad_hoc_commands/';
      api('POST', url, post).then(function (r) {
        if (r.ok && r.data && r.data.id) { location.href = '/jobs/command/' + r.data.id + '/output'; return; }
        // The wizard gives way to the error, and the Run Command button
        // with it until the alert is closed.
        U.closeModal(m); m.remove();
        var item = button.closest('.pf-v6-c-toolbar__item'); if (item) item.hidden = true;        var a = U.alertModal('error', t('Error!'), '', esc(t('Failed to launch job.')) + U.errorDetail('POST', url, r));
        var restore = function () { if (item) item.hidden = false; };
        $$('[data-close-modal]', a).forEach(function (b) { b.addEventListener('click', restore); });
      });
    }
    show();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-run-command]');
    if (b && !b.disabled) open(b);
  });
})();
