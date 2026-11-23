/* Inventory source form and detail: the source type switches the sub-form
   (InventorySourceForm's resetSubFormFields), the project fills the
   inventory file choices, and deleting a source deletes its hosts and
   groups first as InventorySourceDetail did. Plain JavaScript on top of the
   helpers app.js exports. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, api = U.api, esc = U.esc;

  // ---------------------------------------------------------------- delete
  $$('[data-delete-source]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-delete-source');
      // DeleteButton, with what still uses the source counted first.
      U.withUsage(b, function (usage) {
        U.deleteButtonModal({ title: t('Delete inventory source'), name: b.getAttribute('data-name'), usage: usage, message: U.usageMessage(b, 1), onConfirm: function (m) {
          Promise.all([api('DELETE', url + 'hosts/'), api('DELETE', url + 'groups/'), api('DELETE', url)]).then(function (results) {
            U.closeModal(m);
            var failed = results.filter(function (r) { return !r.ok; });
            if (failed.length) U.errorModal(t('Error!'), t('Failed to delete inventory source {name}.', { name: b.getAttribute('data-name') }) + ' ' + U.errorText(failed[0]));
            else location.href = b.getAttribute('data-redirect');
          });
        } });
      });
    });
  });

  // ---------------------------------------------------------------- form
  var form = $('form[data-source-form]');
  if (!form) return;
  var namespaces = JSON.parse(form.getAttribute('data-namespaces') || '{}');
  var varsHelp = JSON.parse(form.getAttribute('data-source-vars-help') || '{}');
  var initial = form.hasAttribute('data-initial') ? JSON.parse(form.getAttribute('data-initial')) : null;
  var select = $('[data-source-select]', form), details = $('[data-source-details]', form);
  var credGroup = $('[data-credential-group]', form), credStar = $('[data-credential-required]', form), credName = $('input[data-lookup-name]', credGroup);
  var projGroup = $('[data-resource="projects"]', form), projID = projGroup && $('[data-lookup-id]', projGroup);
  var pathBox = $('[data-source-path-select] [data-typeahead]', form), pathInput = pathBox && $('[data-typeahead-input]', pathBox);
  var allowOverride = $('[data-project-allow-override]', form);
  var uol = $('[data-update-on-launch]', form), cache = $('[data-cache-timeout]', form);
  var VMWARE_DEFAULT = 'community.vmware.vmware_vm_inventory';

  function setLookup(group, ref) {
    if (!group) return;
    $('[data-lookup-id]', group).value = ref ? ref.id : '';
    $('[data-lookup-hidden-name]', group).value = ref ? ref.name : '';
    $('[data-lookup-name]', group).value = ref ? ref.name : '';
  }
  function setEditor(text) {
    var ed = $('[data-code-editor]', form);
    if (!ed) return;
    if (ed.cmView) ed.cmView.dispatch({ changes: { from: 0, to: ed.cmView.state.doc.length, insert: text }, selection: { anchor: Math.min(ed.cmView.state.selection.main.anchor, text.length) } });
    $('[data-code-editor-value]', ed).value = text;
  }
  function setField(name, value) {
    var el = $('[name="' + name + '"]', form);
    if (!el) return;
    if (el.type === 'checkbox') { el.checked = !!value; el.dispatchEvent(new Event('change', { bubbles: true })); }
    else el.value = value === null || value === undefined ? '' : value;
  }
  function updateOnLaunchHelp(project) {
    var h = '<div>' + esc(t('Each time a job runs using this inventory, refresh the inventory from the selected source before executing job tasks.')) + '</div><br>';
    if (project && project.id) h += '<div>' + esc(t('If you want the Inventory Source to update on launch, click on Update on Launch, and also go to ')) + '<a href="/projects/' + project.id + '/details"> ' + esc(project.name) + ' </a>' + esc(t('and click on Update Revision on Launch.')) + '</div>';
    var b = $('[data-update-on-launch-help] [data-popover-html]', form);
    if (b) b.setAttribute('data-popover-html', h);
  }
  function showFor(source) {
    details.hidden = !source || source === 'custom';
    $$('[data-scm-only]', form).forEach(function (el) { el.hidden = source !== 'scm'; });
    var branch = $('[data-scm-branch-group]', form);
    if (branch) branch.hidden = source !== 'scm' || allowOverride.value !== 'true';
    $$('[data-vmware-only]', form).forEach(function (el) { el.hidden = source !== 'vmware'; });
    var ns = namespaces[source];
    credGroup.setAttribute('data-filter', source === 'scm' ? 'credential_type__kind=cloud' : (ns ? 'credential_type__namespace=' + ns.namespace : ''));
    var required = !!(ns && ns.required);
    credStar.hidden = !required;
    if (required) credName.setAttribute('required', ''); else credName.removeAttribute('required');
    var hb = $('[data-source-vars-help] [data-popover-html]', form);
    if (hb) hb.setAttribute('data-popover-html', varsHelp[source] || '');
  }
  function loadPaths(projectId) {
    if (!pathBox || !pathBox._setOptions) return;
    if (!projectId) { pathBox._setOptions([]); return; }
    api('GET', '/api/v2/projects/' + projectId + '/inventories/').then(function (r) {
      pathBox._setOptions(((r.ok && r.data) || []).concat(['/ (project root)']));
    });
    api('GET', '/api/v2/projects/' + projectId + '/').then(function (r) {
      if (!r.ok) return;
      allowOverride.value = r.data.allow_override ? 'true' : 'false';
      showFor(select.value);
      updateOnLaunchHelp({ id: r.data.id, name: r.data.name });
    });
  }
  // autoPopulate: a lookup with exactly one choice picks it.
  function autoPopulate(group, query) {
    api('GET', query + (query.indexOf('?') >= 0 ? '&' : '?') + 'page_size=2').then(function (r) {
      if (r.ok && r.data && r.data.count === 1) {
        var o = r.data.results[0];
        setLookup(group, { id: o.id, name: o.name });
        $('[data-lookup-id]', group).dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }
  function resetSubForm(source) {
    if (initial && source === initial.source) {
      ['source_path', 'scm_branch', 'enabled_var', 'enabled_value', 'host_filter', 'verbosity', 'update_cache_timeout', 'vmware_plugin'].forEach(function (k) { setField(k, initial[k]); });
      ['overwrite', 'overwrite_vars', 'update_on_launch'].forEach(function (k) { setField(k, initial[k]); });
      setLookup(credGroup, initial.credential && initial.credential.id ? initial.credential : null);
      setLookup(projGroup, initial.source_project && initial.source_project.id ? initial.source_project : null);
      allowOverride.value = initial.project_allow_override ? 'true' : 'false';
      if (pathInput) pathInput.value = initial.source_path || '';
      setEditor(initial.source_vars || '---\n');
      loadPaths(initial.source_project && initial.source_project.id);
      return;
    }
    setLookup(credGroup, null);
    setLookup(projGroup, null);
    allowOverride.value = 'false';
    ['source_path', 'scm_branch', 'enabled_var', 'enabled_value', 'host_filter'].forEach(function (k) { setField(k, ''); });
    if (pathInput) pathInput.value = '';
    setField('verbosity', '1');
    setField('update_cache_timeout', '0');
    ['overwrite', 'overwrite_vars', 'update_on_launch'].forEach(function (k) { setField(k, false); });
    setField('vmware_plugin', VMWARE_DEFAULT);
    setEditor(source === 'vmware' ? '---\nhostnames:\n  - config.name' : '---\n');
    loadPaths(null);
    updateOnLaunchHelp(null);
    var autoCred = !initial || initial.source !== source;
    var ns = namespaces[source];
    // EC2SubForm never auto-populated its credential; SCM has no credential
    // auto-population (only the project).
    if (ns && autoCred && source !== 'ec2') autoPopulate(credGroup, '/api/v2/credentials/?credential_type__namespace=' + encodeURIComponent(ns.namespace));
    if (source === 'scm' && autoCred) autoPopulate(projGroup, '/api/v2/projects/?role_level=use_role');
  }
  select.addEventListener('change', function () { resetSubForm(select.value); showFor(select.value); });
  if (projID) projID.addEventListener('change', function () {
    setField('scm_branch', '');
    if (pathInput) { pathInput.value = ''; pathInput.dispatchEvent(new Event('input', { bubbles: true })); }
    loadPaths(projID.value);
  });
  if (uol) uol.addEventListener('change', function () {
    cache.hidden = !uol.checked;
    if (!uol.checked) setField('update_cache_timeout', '0');
  });
  showFor(select.value);
})();
