/* Templates and jobs behaviour: launching, relaunching, cancelling, the
   survey editor and the job template form. Plain JavaScript on top of the
   helpers app.js exports. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, api = U.api, el = U.el, esc = U.esc, ICON = Object.assign({}, U.ICON, (window.ASCENDER || {}).icons || {});

  var SEGMENTS = { job: 'playbook', project_update: 'project', inventory_update: 'inventory', ad_hoc_command: 'command', system_job: 'management', workflow_job: 'workflow' };
  function jobURL(job) { return '/jobs/' + (SEGMENTS[job.type] || 'playbook') + '/' + job.id + '/output'; }

  // ---------------------------------------------------------------- generic modal
  function modal(opts) {
    var root = $('#ascender-modal-root');
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div class="pf-v6-c-modal-box ' + (opts.size || 'pf-m-md') + (opts.variant ? ' pf-m-' + opts.variant : '') + '" role="dialog" aria-modal="true" aria-labelledby="generic-modal-title"><div class="pf-v6-c-modal-box__close"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="Close" data-close-modal><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><h1 class="pf-v6-c-modal-box__title" id="generic-modal-title">' + (opts.variant === 'danger' ? '<span class="pf-v6-c-modal-box__title-icon">' + ICON.warn + '</span>' : '') + '<span class="pf-v6-c-modal-box__title-text">' + esc(opts.title) + '</span></h1></header><div class="pf-v6-c-modal-box__body" data-modal-body></div><footer class="pf-v6-c-modal-box__footer" data-modal-footer></footer></div></div></div>');
    $('[data-modal-body]', m).innerHTML = opts.body || '';
    $('[data-modal-footer]', m).innerHTML = opts.footer || '';
    root.innerHTML = ''; root.appendChild(m); U.openModal(m);
    return m;
  }

  // ---------------------------------------------------------------- prompt detail
  // PromptDetail (components/PromptDetail): the resource a prompt belongs to,
  // without the keys the prompt overrides, then the prompted values. Returns
  // HTML; variables editors are started with initPromptEditors afterwards.
  var STATUS = ((window.ASCENDER || {}).icons || {}).status || {};
  var VERBOSITY_LABELS = { 0: t('0 (Normal)'), 1: t('1 (Verbose)'), 2: t('2 (More Verbose)'), 3: t('3 (Debug)'), 4: t('4 (Connection Debug)'), 5: t('5 (WinRM Debug)') };
  function titleCase(v) { return String(v || '').toLowerCase().split('_').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
  function filled(v) { return !(v === undefined || v === null || v === '' || v === false); }
  function pdDetail(label, value, o) {
    o = o || {};
    if (o.isEmpty || (!filled(value) && typeof value !== 'number')) return '';
    var cy = o.cy ? ' data-cy="' + o.cy + '-label" id="' + o.cy + '"' : '', cyv = o.cy ? ' data-cy="' + o.cy + '-value"' : '';
    var fw = o.fullWidth ? ' ascender-detail-name--full-width' : '', fwv = o.fullWidth ? ' ascender-detail-value--full-width' : '';
    return '<div><dt class="ascender-detail-name' + fw + '"' + cy + '>' + esc(label) + '</dt><dd class="ascender-detail-value' + fwv + '"' + cyv + '>' + (o.html ? value : esc(value)) + '</dd></div>';
  }
  function pdDeleted(label) { return '<div><dt class="ascender-detail-name">' + esc(label) + '</dt><dd class="ascender-detail-value ascender-detail-value--deleted">' + esc(t('Deleted')) + '</dd></div>'; }
  function pdLink(href, text) { return '<a href="' + esc(href) + '">' + esc(text) + '</a>'; }
  function pdLabels(names, max) {
    max = max || 5;
    var shown = names.slice(0, max).map(function (n) { return '<li class="pf-v6-c-label-group__list-item"><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(n) + '</span></span></span></li>'; }).join('');
    if (names.length > max) shown += '<li class="pf-v6-c-label-group__list-item"><button class="pf-v6-c-label pf-m-overflow" type="button"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(t('{0} more', { 0: names.length - max })) + '</span></span></button></li>';
    return '<div class="pf-v6-c-label-group"><div class="pf-v6-c-label-group__main"><ul class="pf-v6-c-label-group__list" role="list">' + shown + '</ul></div></div>';
  }
  function pdCredChips(creds) {
    return '<div class="pf-v6-c-label-group"><div class="pf-v6-c-label-group__main"><ul class="pf-v6-c-label-group__list" aria-label="Label group category" role="list">' + (creds || []).map(function (c) {
      var kind = U.credKindLabel(c);
      return '<li class="pf-v6-c-label-group__list-item"><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + (kind ? '<strong>' + esc(kind) + ': </strong>' : '') + esc(c.name) + '</span></span></span></li>';
    }).join('') + '</ul></div></div>';
  }
  function pdSparkline(jobs, type) {
    return '<div class="ascender-sparkline__wrapper">' + (jobs || []).map(function (j) {
      var typ = j.type || type;
      return '<div style="display: contents;"><a class="ascender-sparkline__link" aria-label="' + esc(t('View job {0}', { 0: j.id })) + '" href="/jobs/' + (SEGMENTS[typ] || 'playbook') + '/' + j.id + '" data-tooltip data-tooltip-pos="top">' + (STATUS[j.status] || '') + '<template data-tooltip-content><div>' + esc(t('JOB ID:')) + ' ' + j.id + '</div><div>' + esc(t('STATUS:')) + ' ' + esc(String(j.status || '').toUpperCase()) + '</div>' + (j.finished ? '<div>' + esc(t('FINISHED:')) + ' <span class="ascender-datetime" data-datetime="' + esc(j.finished) + '">' + esc(j.finished) + '</span></div>' : '') + '</template></a></div>';
    }).join('') + '</div>';
  }
  function pdVariables(label, value, cy) {
    if (!filled(value)) return '';
    var json = false;
    try { json = typeof JSON.parse(value) === 'object'; } catch (e) { json = false; }
    return '<div class="ascender-variables-detail__wrapper" data-editor-group><div class="ascender-variables-detail__label" data-cy="' + cy + '-label" id="' + cy + '"><div class="pf-v6-l-split pf-m-gutter"><div class="pf-v6-l-split__item pf-m-fill"><div class="pf-v6-l-split pf-m-gutter" style="align-items: baseline;"><div class="pf-v6-l-split__item"><label class="pf-v6-c-form__label" for="' + cy + '-preview" id="' + cy + '-preview-label"><span class="pf-v6-c-form__label-text" style="font-weight: var(--pf-t--global--font--weight--heading--bold);">' + esc(label) + '</span></label></div><div class="pf-v6-l-split__item"><div class="ascender-button-group__group"><button aria-label="YAML" class="pf-v6-c-button ' + (json ? 'pf-m-secondary' : 'pf-m-primary') + ' ascender-multi-button-toggle__small-button toggle-button-yaml" type="button" data-editor-mode="yaml"><span class="pf-v6-c-button__text">YAML</span></button><button aria-label="JSON" class="pf-v6-c-button ' + (json ? 'pf-m-primary' : 'pf-m-secondary') + ' ascender-multi-button-toggle__small-button toggle-button-javascript" type="button" data-editor-mode="javascript"><span class="pf-v6-c-button__text">JSON</span></button></div></div></div></div></div></div><div class="ascender-variables-detail__editor-wrapper" data-cy="' + cy + '-value"><div class="ascender-code-editor__focus-wrapper" tabindex="-1"><div data-cy="code-editor" class="ascender-code-editor__wrapper ascender-code-editor__wrapper--read-only pf-v6-c-form-control" data-code-editor data-readonly data-editor-id="' + cy + '-preview" data-rows="4" data-mode="' + (json ? 'javascript' : 'yaml') + '"><textarea hidden data-code-editor-value>' + esc(value) + '</textarea></div></div></div></div>';
  }
  function pdOptions(items) { return items.length ? '<ul data-pf-content="true" class="pf-v6-c-content--ul">' + items.map(function (i) { return '<li data-pf-content="true" class="pf-v6-c-content--li">' + esc(i) + '</li>'; }).join('') + '</ul>' : ''; }
  function pdTimeout(secs) {
    if (secs === undefined || secs === null) return null;
    if (typeof secs === 'string') return secs;
    return t('{minutes} min {seconds} sec', { minutes: Math.floor(secs / 60), seconds: secs - Math.floor(secs / 60) * 60 });
  }
  function pdEE(ee, isDefault) {
    if (!ee) return '';
    return pdDetail(isDefault ? t('Default Execution Environment') : t('Execution Environment'), pdLink('/execution_environments/' + ee.id + '/details', ee.name), { html: true, cy: 'execution-environment-detail' });
  }
  function promptJobTemplate(r) {
    var sf = r.summary_fields || {}, h = '';
    var opts = [];
    if (r.become_enabled) opts.push(t('Privilege Escalation'));
    if (r.host_config_key) opts.push(t('Provisioning Callbacks'));
    if (r.allow_simultaneous) opts.push(t('Concurrent Jobs'));
    if (r.use_fact_cache) opts.push(t('Fact Storage'));
    if (r.webhook_service) opts.push(t('Webhooks'));
    h += pdDetail(t('Activity'), pdSparkline(sf.recent_jobs, 'job'), { html: true, isEmpty: !sf.recent_jobs || sf.recent_jobs.length === 0 });
    h += pdDetail(t('Job Type'), titleCase(r.job_type));
    h += sf.organization ? pdDetail(t('Organization'), pdLink('/organizations/' + sf.organization.id + '/details', sf.organization.name), { html: true }) : pdDeleted(t('Organization'));
    if (sf.inventory) h += pdDetail(t('Inventory'), pdLink('/inventories/' + (sf.inventory.kind === 'smart' ? 'smart_inventory' : 'inventory') + '/' + sf.inventory.id + '/details', sf.inventory.name), { html: true });
    else if (!r.ask_inventory_on_launch) h += pdDeleted(t('Inventory'));
    h += sf.project ? pdDetail(t('Project'), pdLink('/projects/' + sf.project.id + '/details', sf.project.name), { html: true }) : pdDeleted(t('Project'));
    h += pdEE(sf.execution_environment);
    h += pdDetail(t('Source Control Branch'), r.scm_branch);
    h += pdDetail(t('Playbook'), r.playbook);
    h += pdDetail(t('Forks'), typeof r.forks === 'number' ? String(r.forks) : r.forks);
    h += pdDetail(t('Limit'), r.limit);
    h += pdDetail(t('Verbosity'), VERBOSITY_LABELS[r.verbosity]);
    if (typeof r.diff_mode === 'boolean') h += pdDetail(t('Show Changes'), r.diff_mode ? t('On') : t('Off'));
    h += pdDetail(t(' Job Slicing'), r.job_slice_count);
    h += pdDetail(t('Host Config Key'), r.host_config_key);
    if (r.related && r.related.callback) h += pdDetail(t('Provisioning Callback URL'), location.origin + r.related.callback);
    h += pdDetail(t('Webhook Service'), titleCase(r.webhook_service));
    if (r.related && r.related.webhook_receiver) h += pdDetail(t('Webhook URL'), location.origin + r.related.webhook_receiver);
    h += pdDetail(t('Webhook Key'), r.webhook_key);
    if (sf.webhook_credential) h += pdDetail(t('Webhook Credential'), pdCredChips([sf.webhook_credential]), { html: true, fullWidth: true });
    if (opts.length) h += pdDetail(t('Enabled Options'), pdOptions(opts), { html: true });
    if (sf.credentials) h += pdDetail(t('Credentials'), pdCredChips(sf.credentials), { html: true, fullWidth: true, isEmpty: sf.credentials.length === 0 });
    if (sf.labels && sf.labels.results) h += pdDetail(t('Labels'), pdLabels(sf.labels.results.map(function (l) { return l.name; })), { html: true, fullWidth: true, isEmpty: sf.labels.results.length === 0 });
    var igs = r.instance_groups || [];
    h += pdDetail(t('Instance Groups'), pdLabels(igs.map(function (g) { return g.name; })), { html: true, fullWidth: true, isEmpty: igs.length === 0 });
    if (r.job_tags) h += pdDetail(t('Job Tags'), pdLabels(r.job_tags.split(',')), { html: true, fullWidth: true });
    if (r.skip_tags) h += pdDetail(t('Skip Tags'), pdLabels(r.skip_tags.split(',')), { html: true, fullWidth: true });
    if (r.extra_vars) h += pdVariables(t('Variables'), r.extra_vars, 'prompt-jt-detail-extra-vars');
    return h;
  }
  function promptWorkflowTemplate(r) {
    var sf = r.summary_fields || {}, h = '';
    var opts = [];
    if (r.allow_simultaneous) opts.push(t('Concurrent Jobs'));
    if (r.webhook_service) opts.push(t('Webhooks'));
    h += pdDetail(t('Activity'), pdSparkline(sf.recent_jobs, 'job'), { html: true, isEmpty: !sf.recent_jobs || sf.recent_jobs.length === 0 });
    if (sf.organization) h += pdDetail(t('Organization'), pdLink('/organizations/' + sf.organization.id + '/details', sf.organization.name), { html: true });
    if (sf.inventory) h += pdDetail(t('Inventory'), pdLink('/' + (sf.inventory.kind === 'smart' ? 'smart_inventory' : 'inventory') + '/' + sf.inventory.id + '/details', sf.inventory.name), { html: true });
    h += pdDetail(t('Source Control Branch'), r.scm_branch);
    h += pdDetail(t('Limit'), r.limit);
    h += pdDetail(t('Webhook Service'), titleCase(r.webhook_service));
    h += pdDetail(t('Webhook Key'), r.webhook_key);
    if (r.related && r.related.webhook_receiver) h += pdDetail(t('Webhook URL'), location.origin + r.related.webhook_receiver);
    if (opts.length) h += pdDetail(t('Enabled Options'), pdOptions(opts), { html: true });
    if (sf.webhook_credential) h += pdDetail(t('Webhook Credential'), pdCredChips([sf.webhook_credential]), { html: true, fullWidth: true });
    if (sf.labels && sf.labels.results) h += pdDetail(t('Labels'), pdLabels(sf.labels.results.map(function (l) { return l.name; })), { html: true, fullWidth: true, isEmpty: sf.labels.results.length === 0 });
    if (r.extra_vars) h += pdVariables(t('Variables'), r.extra_vars, 'prompt-wf-jt-detail-variables');
    return h;
  }
  function promptProject(r) {
    var sf = r.summary_fields || {}, h = '', cy = 'prompt-project-detail';
    var opts = [];
    if (r.scm_clean) opts.push(t('Discard local changes before syncing'));
    if (r.scm_delete_on_update) opts.push(t('Delete the project before syncing'));
    if (r.scm_track_submodules) opts.push(t('Track submodules latest commit on branch'));
    if (r.scm_update_on_launch) opts.push(t('Update revision on job launch'));
    if (r.allow_override) opts.push(t('Allow branch override'));
    if (r.scm_type && r.reuse_requirements) opts.push(t('Reuse downloaded requirements'));
    h += sf.organization ? pdDetail(t('Organization'), pdLink('/organizations/' + sf.organization.id + '/details', sf.organization.name), { html: true, cy: cy + '-organization' }) : pdDeleted(t('Organization'));
    h += pdEE(sf.default_environment, true);
    h += pdDetail(t('Source Control Type'), r.scm_type === '' ? t('Manual') : titleCase(r.scm_type), { cy: cy + '-source-control-type' });
    h += pdDetail(t('Source Control URL'), r.scm_url, { cy: cy + '-source-control-url' });
    h += pdDetail(t('Source Control Branch'), r.scm_branch, { cy: cy + '-source-control-branch' });
    h += pdDetail(t('Source Control Refspec'), r.scm_refspec, { cy: cy + '-source-control-refspec' });
    if (sf.credential && sf.credential.id) h += pdDetail(t('Source Control Credential'), pdCredChips([sf.credential]), { html: true, cy: cy + '-source-control-credential' });
    if (sf.signature_validation_credential && sf.signature_validation_credential.id) h += pdDetail(t('Content Signature Validation Credential'), pdCredChips([sf.signature_validation_credential]), { html: true, cy: cy + '-content-signature-validation-credential' });
    if (opts.length) h += pdDetail(t('Enabled Options'), pdOptions(opts), { html: true, cy: cy + '-enabled-options' });
    h += pdDetail(t('Cache Timeout'), (r.scm_update_cache_timeout === 1 ? t('{0} second', { 0: r.scm_update_cache_timeout }) : t('{0} seconds', { 0: r.scm_update_cache_timeout })), { cy: cy + '-cache-timeout' });
    return h;
  }
  function promptInventorySource(r) {
    var sf = r.summary_fields || {}, h = '';
    var opts = [];
    if (r.overwrite) opts.push(t('Overwrite local groups and hosts from remote inventory source'));
    if (r.overwrite_vars) opts.push(t('Overwrite local variables from remote inventory source'));
    if (r.update_on_launch) opts.push(t('Update on launch'));
    h += sf.organization ? pdDetail(t('Organization'), pdLink('/organizations/' + sf.organization.id + '/details', sf.organization.name), { html: true }) : pdDeleted(t('Organization'));
    if (sf.inventory) h += pdDetail(t('Inventory'), pdLink('/inventories/' + sf.inventory.id + '/details', sf.inventory.name), { html: true });
    h += pdDetail(t('Source'), r.source);
    if (sf.source_project) h += pdDetail(t('Project'), pdLink('/projects/' + sf.source_project.id + '/details', sf.source_project.name), { html: true });
    h += pdEE(sf.execution_environment);
    h += pdDetail(t('Inventory File'), r.source_path);
    h += pdDetail(t('Verbosity'), VERBOSITY_LABELS[r.verbosity]);
    h += pdDetail(t('Cache Timeout'), (r.update_cache_timeout === 1 ? t('{0} second', { 0: r.update_cache_timeout }) : t('{0} seconds', { 0: r.update_cache_timeout })));
    h += pdDetail(t('Credential'), pdCredChips(sf.credentials || []), { html: true, fullWidth: true, isEmpty: !sf.credentials || sf.credentials.length === 0 });
    if (opts.length) h += pdDetail(t('Enabled Options'), pdOptions(opts), { html: true, fullWidth: true });
    if (r.source_vars) h += pdVariables(t('Source Variables'), r.source_vars, 'prompt-inventory-source-detail-source-variables');
    return h;
  }
  var RESOURCE_LINKS = { job_template: function (r) { return '/templates/job_template/' + r.id + '/details'; }, project: function (r) { return '/projects/' + r.id + '/details'; },
    inventory_source: function (r) { return '/inventories/inventory/' + r.inventory + '/sources/' + r.id + '/details'; }, workflow_job_template: function (r) { return '/templates/workflow_job_template/' + r.id + '/details'; } };
  function hasPromptData(l) {
    return l.survey_enabled || l.ask_credential_on_launch || l.ask_diff_mode_on_launch || l.ask_inventory_on_launch || l.ask_job_type_on_launch || l.ask_limit_on_launch || l.ask_scm_branch_on_launch ||
      l.ask_skip_tags_on_launch || l.ask_tags_on_launch || l.ask_variables_on_launch || l.ask_verbosity_on_launch || l.ask_execution_environment_on_launch || l.ask_labels_on_launch ||
      l.ask_forks_on_launch || l.ask_job_slice_count_on_launch || l.ask_timeout_on_launch || l.ask_instance_groups_on_launch;
  }
  function promptDetail(resource, launch, overrides, workflowNode) {
    launch = launch || { defaults: {} }; overrides = overrides || {};
    var details = Object.assign({}, resource, { summary_fields: Object.assign({}, resource.summary_fields || {}) }, launch.defaults || {});
    Object.keys(overrides).forEach(function (k) { delete details[k]; delete details.summary_fields[k]; });
    details.type = overrides.nodeType || details.type;
    var link = RESOURCE_LINKS[resource.type];
    var h = '<dl class="ascender-detail-list" gutter="sm">';
    h += pdDetail(t('Name'), link ? pdLink(link(resource), resource.name) : esc(resource.name), { html: true, cy: 'prompt-detail-name' });
    h += pdDetail(t('Description'), details.description, { cy: 'prompt-detail-description' });
    h += pdDetail(t('Type'), titleCase(details.unified_job_type || details.type), { cy: 'prompt-detail-type' });
    if (workflowNode) {
      h += pdDetail(t('Convergence'), workflowNode.all_parents_must_converge ? t('All') : t('Any'), { cy: 'prompt-detail-convergence' });
      if (details.unified_job_type !== 'workflow_approval' && details.type !== 'workflow_approval_template') h += pdDetail(t('Max Retries'), workflowNode.max_retries || 0, { cy: 'prompt-detail-max-retries' });
    }
    h += pdDetail(t('Timeout'), pdTimeout(details.timeout), { cy: 'prompt-detail-timeout' });
    if (details.type === 'project') h += promptProject(details);
    if (details.type === 'inventory_source') h += promptInventorySource(details);
    if (details.type === 'job_template') h += promptJobTemplate(details);
    if (details.type === 'workflow_job_template') h += promptWorkflowTemplate(details);
    var sf = details.summary_fields || {};
    if (details.created) h += '<div><dt class="ascender-detail-name ascender-detail--break-word" data-cy="user-date-detail-label">' + esc(t('Created')) + '</dt><dd class="ascender-detail-value ascender-detail--break-word" data-cy="user-date-detail-value">' + userDate(details.created, sf.created_by) + '</dd></div>';
    if (details.modified) h += '<div><dt class="ascender-detail-name ascender-detail--break-word" data-cy="user-date-detail-label">' + esc(t('Last Modified')) + '</dt><dd class="ascender-detail-value ascender-detail--break-word" data-cy="user-date-detail-value">' + userDate(details.modified, sf.modified_by) + '</dd></div>';
    if (details.type === 'system_job_template') h += pdVariables(t('Variables'), overrides.extra_vars, 'prompt-detail-variables');
    h += '</dl>';
    if (details.type !== 'system_job_template' && hasPromptData(launch) && Object.keys(overrides).length > 0) {
      var o = overrides, p = '';
      if (launch.ask_job_type_on_launch) p += pdDetail(t('Job Type'), titleCase(o.job_type));
      if (launch.ask_credential_on_launch) p += pdDetail(t('Credentials'), pdCredChips(o.credentials || []), { html: true, fullWidth: true });
      if (launch.ask_inventory_on_launch) p += pdDetail(t('Inventory'), o.inventory && o.inventory.name);
      if (launch.ask_execution_environment_on_launch) p += pdDetail(t('Execution Environment'), o.execution_environment && o.execution_environment.name);
      if (launch.ask_instance_groups_on_launch) p += pdDetail(t('Instance Groups'), pdLabels((o.instance_groups || []).map(function (g) { return g.name; })), { html: true, fullWidth: true });
      if (launch.ask_scm_branch_on_launch) p += pdDetail(t('Source Control Branch'), o.scm_branch);
      if (launch.ask_limit_on_launch) p += pdDetail(t('Limit'), o.limit);
      if (Object.prototype.hasOwnProperty.call(o, 'verbosity') && launch.ask_verbosity_on_launch) p += pdDetail(t('Verbosity'), VERBOSITY_LABELS[o.verbosity]);
      if (launch.ask_tags_on_launch) p += pdDetail(t('Job Tags'), pdLabels(filled(o.job_tags) ? o.job_tags.split(',') : []), { html: true, fullWidth: true });
      if (launch.ask_skip_tags_on_launch) p += pdDetail(t('Skip Tags'), pdLabels(filled(o.skip_tags) ? o.skip_tags.split(',') : []), { html: true, fullWidth: true });
      if (launch.ask_labels_on_launch) p += pdDetail(t('Labels'), pdLabels((o.labels || []).map(function (l) { return l.name; })), { html: true, fullWidth: true, isEmpty: (o.labels || []).length === 0 });
      if (launch.ask_forks_on_launch) p += pdDetail(t('Forks'), o.forks);
      if (launch.ask_job_slice_count_on_launch) p += pdDetail(t('Job Slicing'), o.job_slice_count);
      if (launch.ask_timeout_on_launch) p += pdDetail(t('Timeout'), pdTimeout(o.timeout));
      if (launch.ask_diff_mode_on_launch) p += pdDetail(t('Show Changes'), o.diff_mode === true ? t('On') : t('Off'));
      if (launch.survey_enabled || launch.ask_variables_on_launch) p += pdVariables(t('Variables'), o.extra_vars, 'prompt-detail-variables');
      h += '<h2 class="pf-v6-c-title pf-m-h2 ascender-prompt-detail__title">' + esc(t('Prompted Values')) + '</h2><hr class="pf-v6-c-divider ascender-prompt-detail__divider"><dl class="ascender-detail-list ascender-prompt-detail__list" aria-label="' + esc(t('Prompt Overrides')) + '">' + p + '</dl>';
    }
    return h;
  }
  // UserDateDetail: the date, and who by when the API names them.
  function userDate(date, by) {
    var d = esc(new Date(date).toLocaleString());
    if (!by) return d;
    // t() drops the message's <0> markup; the link goes around the name.
    var parts = t('{dateStr} by <0>{username}</0>', { dateStr: '\u0000d', username: '\u0000u' }).split(/(\u0000[du])/);
    return parts.map(function (p) {
      if (p === '\u0000d') return d;
      if (p === '\u0000u') return '<a href="/users/' + by.id + '/details">' + esc(by.username) + '</a>';
      return esc(p);
    }).join('');
  }
  function initPromptEditors(root) { if (window.ASCENDER.initEditor) $$('[data-code-editor]', root).forEach(function (e) { if (!e.cmView) window.ASCENDER.initEditor(e); }); }
  window.ASCENDER.promptDetail = promptDetail;
  window.ASCENDER.initPromptEditors = initPromptEditors;

  // ---------------------------------------------------------------- cancel jobs
  function cancelJobs(items, after) {
    U.confirmModal({ title: items.length > 1 ? t('Cancel Jobs') : t('Cancel Job'), body: t('This action will cancel the following:'), items: items.map(function (i) { return i.name; }), confirmLabel: t('{numJobsToCancel, plural, one {Cancel job} other {Cancel jobs}}', { numJobsToCancel: items.length }), onConfirm: function (m) {
      Promise.all(items.map(function (i) { return api('POST', i.api); })).then(function (results) {
        U.closeModal(m);
        var failed = results.filter(function (r) { return !r.ok; });
        if (failed.length) U.errorModal(t('Error!'), t('Failed to cancel one or more jobs.') + ' ' + U.errorText(failed[0])); else if (after) after(); else location.reload();
      });
    } });
  }
  $$('[data-cancel-job]').forEach(function (b) {
    b.addEventListener('click', function () { cancelJobs([{ api: b.getAttribute('data-cancel-job'), name: b.getAttribute('data-name') }]); });
  });
  var cancelSel = $('[data-cancel-selected]');
  if (cancelSel) {
    var table = $('[data-list-table]');
    function syncCancel() {
      var sel = $$('[data-select-row]', table).filter(function (r) { return r.checked; }).map(function (r) { return r.closest('[data-row]'); });
      cancelSel.disabled = sel.length === 0 || sel.some(function (r) { return !r.hasAttribute('data-cancelable'); });
    }
    $$('[data-select-row], [data-select-all]').forEach(function (r) { r.addEventListener('change', function () { setTimeout(syncCancel, 0); }); });
    cancelSel.addEventListener('click', function () {
      var sel = $$('[data-select-row]', table).filter(function (r) { return r.checked; }).map(function (r) { return r.closest('[data-row]'); });
      cancelJobs(sel.map(function (r) { return { api: r.getAttribute('data-api') + 'cancel/', name: r.getAttribute('data-name') }; }));
    });
  }

  // ---------------------------------------------------------------- relaunch
  function passwordsModal(title, needed, onSubmit) {
    var labels = { ssh_password: t('SSH password'), become_password: t('Privilege escalation password'), ssh_key_unlock: t('Private key passphrase') };
    var fields = needed.map(function (p) {
      var label = labels[p] || (p.indexOf('vault_password') === 0 ? (p.split('.')[1] ? t('Vault password | {credId}', { credId: p.split('.')[1] }) : t('Vault password')) : p);
      return '<div class="pf-v6-c-form__group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="launch-' + esc(p) + '"><span class="pf-v6-c-form__label-text">' + esc(label) + '</span><span class="pf-v6-c-form__label-required" aria-hidden="true">&nbsp;*</span></label></div><div class="pf-v6-c-form__group-control"><span class="pf-v6-c-form-control"><input id="launch-' + esc(p) + '" type="password" required data-password="' + esc(p) + '"></span></div></div>';
    }).join('');
    var m = modal({ title: title, body: '<form class="pf-v6-c-form" novalidate>' + fields + '</form>', footer: '<button class="pf-v6-c-button pf-m-primary" type="button" data-launch-go><span class="pf-v6-c-button__text">' + esc(t('Launch')) + '</span></button><button class="pf-v6-c-button pf-m-link" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button>' });
    $('[data-launch-go]', m).addEventListener('click', function () {
      var pw = {}; $$('[data-password]', m).forEach(function (i) { pw[i.getAttribute('data-password')] = i.value; });
      onSubmit(pw, m);
    });
  }
  function relaunch(url, body, seg) {
    api('GET', url).then(function (r) {
      if (!r.ok) { U.errorModal(t('Error!'), t('Failed to relaunch job.') + ' ' + U.errorText(r)); return; }
      var needed = r.data.passwords_needed_to_start || [];
      function go(passwords, m) {
        var payload = Object.assign({}, body || {});
        // Ad hoc relaunch reads the passwords at the top level, not nested
        // in credential_passwords like the other relaunch endpoints.
        if (passwords && /\/ad_hoc_commands\//.test(url)) Object.assign(payload, passwords);
        else if (passwords) payload.credential_passwords = passwords;
        api('POST', url, payload).then(function (res) {
          if (m) U.closeModal(m);
          if (res.ok) location.href = jobURL(res.data); else U.errorModal(t('Error!'), t('Failed to relaunch job.') + ' ' + U.errorText(res));
        });
      }
      if (needed.length) passwordsModal(t('Launch | {0}', { 0: t('Relaunch job') }), needed, go); else go(null);
    });
  }
  $$('[data-relaunch]').forEach(function (b) {
    b.addEventListener('click', function () {
      var body = {};
      if (b.hasAttribute('data-relaunch-hosts')) body.hosts = b.getAttribute('data-relaunch-hosts');
      if (b.hasAttribute('data-relaunch-body')) { try { body = Object.assign(body, JSON.parse(b.getAttribute('data-relaunch-body'))); } catch (e) {} }
      relaunch(b.getAttribute('data-relaunch'), body, b.getAttribute('data-relaunch-seg'));
    });
  });

  // ---------------------------------------------------------------- launch wizard
  function canLaunchWithoutPrompt(l) {
    return l.can_start_without_user_input && !l.ask_inventory_on_launch && !l.ask_variables_on_launch && !l.ask_limit_on_launch && !l.ask_scm_branch_on_launch &&
      !l.ask_execution_environment_on_launch && !l.ask_labels_on_launch && !l.ask_forks_on_launch && !l.ask_job_slice_count_on_launch && !l.ask_timeout_on_launch &&
      !l.ask_instance_groups_on_launch && !l.survey_enabled && !(l.passwords_needed_to_start || []).length && !(l.variables_needed_to_start || []).length;
  }
  function formGroup(id, label, control, help, required) {
    return '<div class="pf-v6-c-form__group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="' + esc(id) + '"><span class="pf-v6-c-form__label-text">' + esc(label) + '</span>' + (required ? '<span class="pf-v6-c-form__label-required" aria-hidden="true">&nbsp;*</span>' : '') + '</label>' + (help ? '&nbsp;&nbsp;<span class="pf-v6-c-form__group-label-help"><div style="display: contents;"><button aria-label="' + esc(t('More information')) + '" aria-haspopup="true" class="ascender-popover__button pf-v6-c-form__group-label-help" type="button" data-popover="' + esc(help) + '">' + ICON.help + '</button></div></span>' : '') + '</div><div class="pf-v6-c-form__group-control">' + control + '</div></div>';
  }
  function textInput(id, name, value, type, extra) { return '<span class="pf-v6-c-form-control"><input id="' + esc(id) + '" name="' + esc(name) + '" type="' + (type || 'text') + '" value="' + esc(value === undefined || value === null ? '' : value) + '" ' + (extra || '') + '></span>'; }
  function selectInput(id, name, options, value) {
    return '<span class="pf-v6-c-form-control"><select id="' + esc(id) + '" name="' + esc(name) + '">' + options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + (o[2] ? ' disabled' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select><span class="pf-v6-c-form-control__utilities"><span class="pf-v6-c-form-control__toggle-icon">' + ICON.caret + '</span></span></span>';
  }
  var VERBOSITY = [['0', t('0 (Normal)')], ['1', t('1 (Verbose)')], ['2', t('2 (More Verbose)')], ['3', t('3 (Debug)')], ['4', t('4 (Connection Debug)')], ['5', t('5 (WinRM Debug)')]];

  // A pick list: a searchable table of API objects with radio or checkbox selection.
  function pickList(opts) {
    var box = el('<div data-pick-list><div class="pf-v6-c-toolbar"><div class="pf-v6-c-toolbar__content"><div class="pf-v6-c-toolbar__content-section"><div class="pf-v6-c-toolbar__group pf-m-filter-group"><div class="pf-v6-c-toolbar__item"><div class="pf-v6-c-input-group"><div class="pf-v6-c-input-group__item pf-m-fill"><span class="pf-v6-c-form-control"><input type="search" aria-label="' + esc(t('Search text input')) + '" placeholder="' + esc(t('Search by name')) + '" data-pick-search></span></div><div class="pf-v6-c-input-group__item"><button class="pf-v6-c-button pf-m-control" type="button" aria-label="' + esc(t('Search submit button')) + '" data-pick-go><span class="pf-v6-c-button__icon">' + ICON.search + '</span></button></div></div></div></div><div class="pf-v6-c-toolbar__item pf-m-pagination"><div class="pf-v6-c-pagination pf-m-compact"><div class="pf-v6-c-pagination__total-items" data-pick-count></div><nav class="pf-v6-c-pagination__nav" aria-label="' + esc(t('Pagination')) + '"><div class="pf-v6-c-pagination__nav-control"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="' + esc(t('Go to previous page')) + '" data-pick-prev disabled>&#8249;</button></div><div class="pf-v6-c-pagination__nav-control"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="' + esc(t('Go to next page')) + '" data-pick-next disabled>&#8250;</button></div></nav></div></div></div></div></div><table class="pf-v6-c-table pf-m-compact ascender-lookup-table" role="grid" aria-label="' + esc(opts.title) + '"><thead class="pf-v6-c-table__thead"><tr class="pf-v6-c-table__tr"><th class="pf-v6-c-table__th"><span class="pf-v6-u-screen-reader">' + esc(t('Select')) + '</span></th><th class="pf-v6-c-table__th" scope="col">' + esc(t('Name')) + '</th>' + (opts.columns || []).map(function (c) { return '<th class="pf-v6-c-table__th" scope="col">' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody class="pf-v6-c-table__tbody" data-pick-rows></tbody></table><div style="margin-top:1rem" data-pick-chips></div></div>');
    var page = 1, search = '', size = 5, count = 0;
    function isSel(id) { return opts.selected().some(function (s) { return String(s.id) === String(id); }); }
    // isSelectedDraggable: the picks are a DraggableSelectedList above the
    // table, in the order they are kept.
    var dragHost = null, dragList = null;
    if (opts.draggable) {
      dragHost = el('<div data-pick-drag></div>'); box.insertBefore(dragHost, box.firstChild);
      dragList = U.draggableSelectedList({ items: opts.selected(), ns: 'instance-groups', onReorder: function (arr) { opts.reorder(arr); }, onRemove: function (item) { opts.unselect(String(item.id)); load(); } });
    }
    function chips() {
      var c = $('[data-pick-chips]', box), sel = opts.selected();
      if (dragList) {
        dragList.set(sel);
        dragHost.innerHTML = '';
        if (sel.length) dragList.nodes.forEach(function (n) { dragHost.appendChild(n); });
        c.innerHTML = '';
        return;
      }
      c.innerHTML = sel.length ? '<div class="pf-v6-c-label-group"><div class="pf-v6-c-label-group__main"><span class="pf-v6-c-label-group__label">' + esc(t('Selected')) + '</span><ul class="pf-v6-c-label-group__list" role="list">' + sel.map(function (s) { return '<li class="pf-v6-c-label-group__list-item"><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(s.name) + '</span></span><span class="pf-v6-c-label__actions"><button class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button" aria-label="' + esc(t('Remove')) + '" data-pick-unselect="' + esc(s.id) + '"><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></span></span></li>'; }).join('') + '</ul></div></div>' : '';
      $$('[data-pick-unselect]', box).forEach(function (u) { u.addEventListener('click', function () { opts.unselect(u.getAttribute('data-pick-unselect')); load(); }); });
    }
    function load() {
      var q = '/api/v2/' + opts.resource + '/?order_by=name&page_size=' + size + '&page=' + page + (search ? '&name__icontains=' + encodeURIComponent(search) : '') + (opts.filter ? '&' + opts.filter : '');
      api('GET', q).then(function (r) {
        var rows = $('[data-pick-rows]', box); rows.innerHTML = '';
        if (!r.ok) { rows.innerHTML = '<tr class="pf-v6-c-table__tr"><td class="pf-v6-c-table__td" colspan="2">' + esc(U.errorText(r)) + '</td></tr>'; return; }
        count = r.data.count;
        (r.data.results || []).forEach(function (item) {
          var tr = el('<tr class="pf-v6-c-table__tr"><td class="pf-v6-c-table__td pf-v6-c-table__check"><div class="' + (opts.multi ? 'pf-v6-c-check' : 'pf-v6-c-radio') + ' pf-m-standalone"><input class="' + (opts.multi ? 'pf-v6-c-check__input' : 'pf-v6-c-radio__input') + '" type="' + (opts.multi ? 'checkbox' : 'radio') + '" name="pick-' + esc(opts.resource) + '" aria-label="' + esc(t('Select {0}', { 0: item.name })) + '"' + (isSel(item.id) ? ' checked' : '') + '></div></td><td class="pf-v6-c-table__td" data-label="' + esc(t('Name')) + '"><b>' + esc(item.name) + '</b></td>' + (opts.columns || []).map(function (c) { return '<td class="pf-v6-c-table__td">' + esc(c.value(item)) + '</td>'; }).join('') + '</tr>');
          $('input', tr).addEventListener('change', function () { opts.toggle(item, this.checked); chips(); if (!opts.multi) load(); });
          rows.appendChild(tr);
        });
        var first = count ? (page - 1) * size + 1 : 0, last = Math.min(page * size, count);
        $('[data-pick-count]', box).innerHTML = '<b>' + first + ' - ' + last + '</b> ' + esc(t('of')) + ' <b>' + count + '</b>';
        $('[data-pick-prev]', box).disabled = page <= 1; $('[data-pick-next]', box).disabled = page * size >= count;
        chips();
      });
    }
    $('[data-pick-go]', box).addEventListener('click', function () { search = $('[data-pick-search]', box).value; page = 1; load(); });
    $('[data-pick-search]', box).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search = this.value; page = 1; load(); } });
    $('[data-pick-prev]', box).addEventListener('click', function () { page--; load(); });
    $('[data-pick-next]', box).addEventListener('click', function () { page++; load(); });
    load();
    return box;
  }

  function surveyField(q, values) {
    var id = 'survey-question-' + q.variable, name = 'survey_' + q.variable, v = values[q.variable];
    var control;
    if (q.type === 'multiplechoice') {
      var choices = (typeof q.choices === 'string' ? q.choices.split('\n') : q.choices || []).filter(function (c) { return c !== ''; });
      control = selectInput(id, name, [['', t('Select a value'), false]].concat(choices.map(function (c) { return [c, c]; })), v === undefined ? '' : v);
    } else if (q.type === 'multiselect') {
      var ch = (typeof q.choices === 'string' ? q.choices.split('\n') : q.choices || []).filter(function (c) { return c !== ''; });
      var picked = Array.isArray(v) ? v : (typeof v === 'string' && v ? v.split('\n') : []);
      control = '<div class="ascender-form-checkbox-layout" data-multiselect="' + esc(name) + '">' + ch.map(function (c, i) { return '<div class="pf-v6-c-check"><input class="pf-v6-c-check__input" type="checkbox" id="' + esc(id + '-' + i) + '" value="' + esc(c) + '"' + (picked.indexOf(c) >= 0 ? ' checked' : '') + '><label class="pf-v6-c-check__label" for="' + esc(id + '-' + i) + '">' + esc(c) + '</label></div>'; }).join('') + '</div>';
    } else if (q.type === 'textarea') {
      control = '<span class="pf-v6-c-form-control"><textarea id="' + esc(id) + '" name="' + esc(name) + '" rows="3">' + esc(v === undefined ? '' : v) + '</textarea></span>';
    } else if (q.type === 'integer' || q.type === 'float') {
      control = textInput(id, name, v, 'number', (q.min !== undefined && q.min !== null && q.min !== '' ? 'min="' + esc(q.min) + '" ' : '') + (q.max !== undefined && q.max !== null && q.max !== '' ? 'max="' + esc(q.max) + '" ' : '') + (q.type === 'float' ? 'step="any"' : ''));
    } else {
      control = textInput(id, name, v, q.type === 'password' ? 'password' : 'text', (q.min ? 'minlength="' + esc(q.min) + '" ' : '') + (q.max ? 'maxlength="' + esc(q.max) + '"' : ''));
    }
    return formGroup(id, q.question_name, control, q.question_description, q.required);
  }

  function launchTemplate(base, type, name) {
    var isWF = type === 'workflow_job_template';
    Promise.all([api('GET', base + 'launch/')]).then(function (rs) {
      var l = rs[0];
      if (!l.ok) { U.errorModal(t('Error!'), t('Failed to launch template.') + ' ' + U.errorText(l)); return; }
      var launch = l.data;
      var extra = [];
      if (launch.survey_enabled) extra.push(api('GET', base + 'survey_spec/'));
      else extra.push(Promise.resolve({ ok: true, data: {} }));
      if (launch.ask_credential_on_launch && !isWF) extra.push(api('GET', base + 'credentials/?page_size=200')); else extra.push(Promise.resolve({ ok: true, data: { results: [] } }));
      extra.push(api('GET', base));
      Promise.all(extra).then(function (more) {
        var survey = more[0].data || {}, templateCreds = (more[1].data && more[1].data.results) || [], resource = more[2].data || {};
        if (canLaunchWithoutPrompt(launch)) {
          api('POST', base + 'launch/', {}).then(function (r) { if (r.ok) location.href = jobURL(r.data); else U.errorModal(t('Error!'), t('Failed to launch template.') + ' ' + U.errorText(r)); });
          return;
        }
        wizard(base, launch, survey, templateCreds, resource, name, isWF);
      });
    });
  }

  function wizard(base, launch, survey, templateCreds, resource, name, isWF, opts) {
    opts = opts || {};
    var isSchedule = opts.mode === 'schedule';
    var d = launch.defaults || {};
    var values = {
      inventory: d.inventory && d.inventory.id ? { id: d.inventory.id, name: d.inventory.name } : null,
      credentials: (d.credentials || []).map(function (c) { return { id: c.id, name: c.name, credential_type: c.credential_type, passwords_needed: c.passwords_needed || [], vault_id: c.vault_id }; }),
      credential_passwords: {},
      execution_environment: d.execution_environment && d.execution_environment.id ? { id: d.execution_environment.id, name: d.execution_environment.name } : null,
      instance_groups: [],
      labels: (d.labels || []).map(function (l) { return { id: l.id, name: l.name }; }),
      job_type: d.job_type || 'run', scm_branch: d.scm_branch || '', limit: d.limit || '', verbosity: d.verbosity === undefined ? 0 : d.verbosity,
      forks: d.forks === undefined ? 0 : d.forks, job_slice_count: d.job_slice_count === undefined ? 1 : d.job_slice_count, timeout: d.timeout === undefined ? 0 : d.timeout,
      diff_mode: !!d.diff_mode, job_tags: d.job_tags || '', skip_tags: d.skip_tags || '', extra_vars: d.extra_vars || '---',
      survey: {}
    };
    (survey.spec || []).forEach(function (q) { if (q.default !== undefined && q.default !== null && q.default !== '') values.survey[q.variable] = q.type === 'multiselect' && typeof q.default === 'string' ? q.default.split('\n') : q.default; });
    if (opts.initial) {
      // a schedule being edited supplies the values; a new one takes the template's
      var ini = opts.initial;
      if (ini.inventory) values.inventory = { id: ini.inventory.id, name: ini.inventory.name };
      if (ini.credentials) values.credentials = ini.credentials.map(function (c) {
        var inp = c.inputs || {}, needed = [];
        if (inp.password === 'ASK') needed.push('ssh_password'); if (inp.become_password === 'ASK') needed.push('become_password'); if (inp.ssh_key_unlock === 'ASK') needed.push('ssh_key_unlock'); if (inp.vault_password === 'ASK') needed.push('vault_password' + (inp.vault_id ? '.' + inp.vault_id : ''));
        return { id: c.id, name: c.name, credential_type: c.credential_type, kind: c.kind, passwords_needed: c.passwords_needed || needed, vault_id: c.vault_id || inp.vault_id };
      });
      if (ini.execution_environment) values.execution_environment = { id: ini.execution_environment.id, name: ini.execution_environment.name };
      if (ini.instance_groups) values.instance_groups = ini.instance_groups.map(function (g) { return { id: g.id, name: g.name }; });
      if (ini.labels) values.labels = ini.labels.map(function (l) { return { id: l.id, name: l.name }; });
      ['job_type', 'scm_branch', 'limit', 'verbosity', 'forks', 'job_slice_count', 'timeout', 'diff_mode', 'job_tags', 'skip_tags', 'extra_vars'].forEach(function (k) { if (ini[k] !== undefined && ini[k] !== null) values[k] = ini[k]; });
      if (ini.survey) Object.keys(ini.survey).forEach(function (k) { values.survey[k] = ini.survey[k]; });
    }
    var credTypes = {};
    function passwordsNeeded() {
      var needed = [];
      if (!launch.ask_credential_on_launch) return (launch.passwords_needed_to_start || []).slice();
      values.credentials.forEach(function (c) { (c.passwords_needed || []).forEach(function (p) { if (needed.indexOf(p) < 0) needed.push(p); }); });
      return needed;
    }
    var otherPrompts = launch.ask_job_type_on_launch || launch.ask_scm_branch_on_launch || launch.ask_labels_on_launch || launch.ask_forks_on_launch || launch.ask_limit_on_launch || launch.ask_verbosity_on_launch || launch.ask_job_slice_count_on_launch || launch.ask_timeout_on_launch || launch.ask_diff_mode_on_launch || launch.ask_tags_on_launch || launch.ask_skip_tags_on_launch || launch.ask_variables_on_launch;
    var steps = [];
    if (launch.ask_inventory_on_launch) steps.push({ id: 'inventory', name: t('Inventory'), render: renderInventory, validate: function () { return values.inventory ? null : t('An inventory must be selected'); } });
    // credentialsValidator: each of the job template's own credentials must
    // be replaced by one of the same type (a vault one by one with the same
    // vault ID), and a schedule or workflow node cannot keep a credential
    // that asks for a password. Workflow templates are not checked.
    function validateCredentials() {
      if (isWF) return null;
      var missing = [];
      templateCreds.forEach(function (dc) {
        var dv = dc.inputs && dc.inputs.vault_id;
        var kept = values.credentials.some(function (c) { return dv ? c.vault_id === dv : String(c.credential_type) === String(dc.credential_type) && !c.vault_id; });
        if (!kept) {
          var typeName = (dc.summary_fields && dc.summary_fields.credential_type && dc.summary_fields.credential_type.name) || '';
          missing.push(dv ? typeName + ' | ' + dv : typeName);
        }
      });
      if (missing.length) return t('Job Template default credentials must be replaced with one of the same type.  Please select a credential for the following types in order to proceed: {0}', { 0: missing.join(', ') });
      if (isSchedule) {
        var prompting = values.credentials.filter(function (c) { return (c.passwords_needed || []).length > 0; }).map(function (c) { return c.name; });
        if (prompting.length) return t('Credentials that require passwords on launch are not permitted.  Please remove or replace the following credentials with a credential of the same type in order to proceed: {0}', { 0: prompting.join(', ') });
      }
      return null;
    }
    if (launch.ask_credential_on_launch) steps.push({ id: 'credentials', name: t('Credentials'), render: renderCredentials, validate: validateCredentials });
    steps.push({ id: 'passwords', name: t('Credential passwords'), render: renderPasswords, validate: function () { var missing = passwordsNeeded().filter(function (p) { return !values.credential_passwords[p]; }); return missing.length ? t('Provide the passwords needed to start.') : null; }, when: function () { return !isSchedule && passwordsNeeded().length > 0; } });
    if (launch.ask_execution_environment_on_launch) steps.push({ id: 'execution_environment', name: t('Execution Environment'), render: renderEE, validate: function () { return null; } });
    if (launch.ask_instance_groups_on_launch) steps.push({ id: 'instance_groups', name: t('Instance Groups'), render: renderInstanceGroups, validate: function () { return null; } });
    if (otherPrompts) steps.push({ id: 'other', name: t('Other prompts'), render: renderOther, validate: validateOther });
    if (launch.survey_enabled && survey.spec) steps.push({ id: 'survey', name: t('Survey'), render: renderSurvey, validate: validateSurvey });
    steps.push({ id: 'preview', name: t('Preview'), render: renderPreview, validate: function () { return null; }, last: true });
    function active() { return steps.filter(function (s) { return !s.when || s.when(); }); }
    var current = 0, errors = {};
    // The wizard is the modal's only child, as PatternFly's Modal with a
    // Wizard rendered it: its own header and close button, the step list,
    // and the footer's action list (Back, Next | Cancel).
    var title = isSchedule ? t('Prompt | {0}', { 0: name }) : t('Launch | {0}', { 0: name });
    var STEP_DOM = { inventory: ['inventory', 'inventory-step'], credentials: ['credentials', 'credentials-step'], passwords: ['credentialPasswords', 'credential-passwords-step'],
      execution_environment: ['executionEnvironment', 'execution-environment-step'], instance_groups: ['instanceGroups', 'instance-groups-step'], other: ['other', 'other-prompts-step'],
      survey: ['survey', 'survey-step'], preview: ['preview', 'preview-step'] };
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(title) + '" aria-modal="true" class="pf-v6-c-modal-box pf-m-lg"><div class="pf-v6-c-wizard ascender-wizard">' +
      '<div class="pf-v6-c-wizard__header"><div class="pf-v6-c-wizard__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-close-modal><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></div><div class="pf-v6-c-wizard__title"><h2 class="pf-v6-c-wizard__title-text">' + esc(title) + '</h2></div></div>' +
      '<button class="pf-v6-c-wizard__toggle" aria-label="Wizard toggle" aria-expanded="false" type="button"><span class="pf-v6-c-wizard__toggle-list" data-wizard-toggle></span><span class="pf-v6-c-wizard__toggle-icon">' + (ICON.angleRight || '') + '</span></button>' +
      '<div class="pf-v6-c-wizard__outer-wrap"><div class="pf-v6-c-wizard__inner-wrap"><nav class="pf-v6-c-wizard__nav" aria-label="Wizard steps"><ol class="pf-v6-c-wizard__nav-list" role="list" data-wizard-nav></ol></nav><div tabindex="-1" class="pf-v6-c-wizard__main"><div class="pf-v6-c-wizard__main-body" data-wizard-body></div></div></div>' +
      '<footer class="pf-v6-c-wizard__footer"><div class="pf-v6-c-action-list"><div class="pf-v6-c-action-list__group"><div class="pf-v6-c-action-list__item"><button class="pf-v6-c-button pf-m-secondary" type="button" data-wizard-back><span class="pf-v6-c-button__text">' + esc(t('Back')) + '</span></button></div><div class="pf-v6-c-action-list__item"><button class="pf-v6-c-button pf-m-primary" type="submit" data-wizard-next><span class="pf-v6-c-button__text">' + esc(t('Next')) + '</span></button></div></div><div class="pf-v6-c-action-list__group"><div class="pf-v6-c-action-list__item"><button class="pf-v6-c-button pf-m-link" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button></div></div></div></footer>' +
      '</div></div></div></div></div>');
    var root = $('#ascender-modal-root'); root.innerHTML = ''; root.appendChild(m); U.openModal(m);
    function stepName(s) {
      var ids = STEP_DOM[s.id] || [s.id, s.id + '-step'];
      if (errors[s.id]) return '<div class="ascender-step-name__alert-text" id="' + ids[1] + '">' + esc(s.name) + '<span data-tooltip="' + esc(t('This step contains errors')) + '" data-tooltip-pos="right">' + ICON.warn.replace('class="pf-v6-svg"', 'class="pf-v6-svg ascender-step-name__exclamation-circle-icon" style="color: var(--pf-t--global--color--status--danger--default);"') + '</span></div>';
      return '<div id="' + ids[1] + '">' + esc(s.name) + '</div>';
    }
    function nav() {
      var list = active();
      $('[data-wizard-nav]', m).innerHTML = list.map(function (s, i) { var ids = STEP_DOM[s.id] || [s.id]; return '<li class="pf-v6-c-wizard__nav-item"><button id="' + ids[0] + '" class="pf-v6-c-wizard__nav-link' + (i === current ? ' pf-m-current' : '') + '" type="button" data-wizard-go="' + i + '" aria-current="' + (i === current ? 'step' : 'false') + '"><span class="pf-v6-c-wizard__nav-link-main">' + stepName(s) + '</span></button></li>'; }).join('');
      $('[data-wizard-toggle]', m).innerHTML = '<span class="pf-v6-c-wizard__toggle-list-item"><span class="pf-v6-c-wizard__toggle-num">' + (current + 1) + '</span> ' + stepName(list[current]) + '</span>';
      $$('[data-wizard-go]', m).forEach(function (b) { b.addEventListener('click', function () { collect(); current = parseInt(b.getAttribute('data-wizard-go'), 10); show(); }); });
      var next = $('[data-wizard-next]', m), back = $('[data-wizard-back]', m);
      back.disabled = current === 0;
      var step = list[current];
      next.querySelector('.pf-v6-c-button__text').textContent = step.last ? (isSchedule ? t('Save') : t('Launch')) : t('Next');
      next.disabled = step.last && Object.keys(errors).some(function (k) { return errors[k]; });
    }
    function show() {
      var list = active(), step = list[current];
      var body = $('[data-wizard-body]', m); body.innerHTML = '';
      var err = errors[step.id];
      if (err && step.id !== 'preview') body.insertAdjacentHTML('beforeend', '<div class="pf-v6-c-alert pf-m-danger pf-m-inline ascender-inventory-step__error-alert"><div class="pf-v6-c-alert__icon">' + ICON.warn + '</div><p class="pf-v6-c-alert__title"><span class="pf-v6-u-screen-reader">Danger alert:</span>' + esc(err) + '</p></div>');
      step.render(body);
      nav();
    }
    function collect() {
      var body = $('[data-wizard-body]', m);
      $$('[name]', body).forEach(function (i) {
        var n = i.getAttribute('name');
        if (n.indexOf('survey_') === 0) { if (i.type !== 'checkbox') values.survey[n.slice(7)] = i.type === 'number' ? (i.value === '' ? '' : Number(i.value)) : i.value; }
        else if (n.indexOf('credential_passwords.') === 0) values.credential_passwords[n.slice(21)] = i.value;
        else if (i.type === 'checkbox') values[n] = i.checked;
        else if (i.type === 'number') values[n] = i.value === '' ? 0 : Number(i.value);
        else values[n] = i.value;
      });
      $$('[data-multiselect]', body).forEach(function (box) { values.survey[box.getAttribute('data-multiselect').slice(7)] = $$('input:checked', box).map(function (c) { return c.value; }); });
      var ed = $('[data-code-editor]', body);
      if (ed) values.extra_vars = ed.cmView ? ed.cmView.state.doc.toString() : $('[data-code-editor-value]', ed).value;
    }
    function validateAll() { active().forEach(function (s) { errors[s.id] = s.validate(); }); }
    $('[data-wizard-next]', m).addEventListener('click', function () {
      collect();
      var list = active(), step = list[current];
      errors[step.id] = step.validate();
      if (step.last) { validateAll(); if (Object.keys(errors).some(function (k) { return errors[k]; })) { show(); return; } submit(); return; }
      if (errors[step.id]) { show(); return; }
      current++; if (list[current] && list[current].last) validateAll(); show();
    });
    $('[data-wizard-back]', m).addEventListener('click', function () { collect(); if (current > 0) current--; show(); });

    function renderInventory(body) {
      body.appendChild(pickList({ resource: 'inventories', title: t('Inventory'), filter: 'role_level=use_role', selected: function () { return values.inventory ? [values.inventory] : []; },
        toggle: function (item) { values.inventory = { id: item.id, name: item.name }; }, unselect: function () { values.inventory = null; } }));
    }
    function renderCredentials(body) {
      var wrap = el('<div><div class="ascender-credentials-step__display-align-items"><div class="ascender-credentials-step__flex-margin-right"><div class="pf-v6-c-form__group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label"><span class="pf-v6-c-form__label-text">' + esc(t('Selected Category')) + '</span></label></div><div class="pf-v6-c-form__group-control"><span class="pf-v6-c-form-control"><select data-cred-type></select><span class="pf-v6-c-form-control__utilities"><span class="pf-v6-c-form-control__toggle-icon">' + ICON.caret + '</span></span></span></div></div></div><div class="ascender-credentials-step__flex-1-1-75" data-cred-list></div></div></div>');
      body.appendChild(wrap);
      api('GET', '/api/v2/credential_types/?page_size=200&kind__in=ssh,vault,cloud,net,kubernetes&order_by=kind,name').then(function (r) {
        var types = (r.data && r.data.results) || [];
        types.forEach(function (t) { credTypes[t.id] = t; });
        var sel = $('[data-cred-type]', wrap);
        sel.innerHTML = types.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
        // The step opens on Machine, as the old one did (the first ssh type).
        var machine = types.filter(function (t) { return t.kind === 'ssh'; })[0];
        if (machine) sel.value = String(machine.id);
        function list() {
          var typeId = parseInt(sel.value, 10), type = credTypes[typeId];
          var holder = $('[data-cred-list]', wrap); holder.innerHTML = '';
          holder.appendChild(pickList({ resource: 'credentials', title: t('Credentials'), filter: 'credential_type=' + typeId + '&role_level=use_role', multi: type && type.kind === 'vault',
            selected: function () { return values.credentials; },
            toggle: function (item, checked) {
              var vault = type && type.kind === 'vault';
              if (!vault || !checked) values.credentials = values.credentials.filter(function (c) { return vault ? String(c.id) !== String(item.id) : c.credential_type !== typeId; });
              if (checked) {
                var needed = [];
                if (item.inputs) { if (item.inputs.password === 'ASK') needed.push('ssh_password'); if (item.inputs.become_password === 'ASK') needed.push('become_password'); if (item.inputs.ssh_key_unlock === 'ASK') needed.push('ssh_key_unlock'); if (item.inputs.vault_password === 'ASK') needed.push('vault_password' + (item.inputs.vault_id ? '.' + item.inputs.vault_id : '')); }
                values.credentials.push({ id: item.id, name: item.name, credential_type: typeId, kind: item.kind, passwords_needed: needed, vault_id: item.inputs && item.inputs.vault_id });
              }
            },
            unselect: function (id) { values.credentials = values.credentials.filter(function (c) { return String(c.id) !== String(id); }); } }));
        }
        sel.addEventListener('change', list); list();
      });
    }
    function renderPasswords(body) {
      var labels = { ssh_password: t('SSH password'), become_password: t('Privilege escalation password'), ssh_key_unlock: t('Private key passphrase') };
      body.innerHTML += '<form class="pf-v6-c-form" novalidate data-no-submit>' + passwordsNeeded().map(function (p) {
        var label = labels[p] || (p.split('.')[1] ? t('Vault password | {credId}', { credId: p.split('.')[1] }) : t('Vault password'));
        return formGroup('launch-' + p, label, textInput('launch-' + p, 'credential_passwords.' + p, values.credential_passwords[p] || '', 'password'), null, true);
      }).join('') + '</form>';
    }
    function renderEE(body) {
      body.appendChild(pickList({ resource: 'execution_environments', title: t('Execution Environments'), columns: [{ label: t('Image'), value: function (i) { return i.image; } }], selected: function () { return values.execution_environment ? [values.execution_environment] : []; },
        toggle: function (item) { values.execution_environment = { id: item.id, name: item.name }; }, unselect: function () { values.execution_environment = null; } }));
    }
    function renderInstanceGroups(body) {
      body.appendChild(pickList({ resource: 'instance_groups', title: t('Instance Groups'), multi: true, draggable: true, reorder: function (arr) { values.instance_groups = arr; }, selected: function () { return values.instance_groups; },
        toggle: function (item, checked) { values.instance_groups = values.instance_groups.filter(function (g) { return String(g.id) !== String(item.id); }); if (checked) values.instance_groups.push({ id: item.id, name: item.name }); },
        unselect: function (id) { values.instance_groups = values.instance_groups.filter(function (g) { return String(g.id) !== String(id); }); } }));
    }
    function renderOther(body) {
      var html = '';
      if (launch.ask_job_type_on_launch) html += formGroup('prompt-job-type', t('Job Type'), selectInput('prompt-job-type', 'job_type', [['', t('Choose a job type'), true], ['run', t('Run')], ['check', t('Check')]], values.job_type), t('For job templates, select run to execute the playbook. Select check to only check playbook syntax, test environment setup, and report problems without executing the playbook.'), true);
      if (launch.ask_scm_branch_on_launch) html += formGroup('prompt-scm-branch', t('Source Control Branch'), textInput('prompt-scm-branch', 'scm_branch', values.scm_branch), t('Branch to use in job run. Project default used if blank.'));
      if (launch.ask_labels_on_launch) html += formGroup('prompt-labels', t('Labels'), '<div class="pf-v6-c-label-group" data-prompt-labels><div class="pf-v6-c-label-group__main"><ul class="pf-v6-c-label-group__list" role="list">' + values.labels.map(function (l) { return '<li class="pf-v6-c-label-group__list-item"><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(l.name) + '</span></span><span class="pf-v6-c-label__actions"><button class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button" aria-label="' + esc(t('Remove')) + '" data-remove-label="' + esc(l.id || l.name) + '"><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></span></span></li>'; }).join('') + '</ul></div></div><div class="pf-v6-c-input-group" style="margin-top:8px"><div class="pf-v6-c-input-group__item pf-m-fill"><span class="pf-v6-c-form-control"><input type="text" aria-label="' + esc(t('Add label')) + '" placeholder="' + esc(t('Add a label and press Enter')) + '" data-add-label></span></div></div>', t('Optional labels that describe this job template, such as \'dev\' or \'test\'. Labels can be used to group and filter job templates and completed jobs.'));
      if (launch.ask_forks_on_launch) html += formGroup('prompt-forks', t('Forks'), textInput('prompt-forks', 'forks', values.forks, 'number', 'min="0"'), t('The number of parallel or simultaneous processes to use while executing the playbook.'));
      if (launch.ask_limit_on_launch) html += formGroup('prompt-limit', t('Limit'), textInput('prompt-limit', 'limit', values.limit), t('Provide a host pattern to further constrain the list of hosts that will be managed or affected by the playbook. Multiple patterns are allowed.'));
      if (launch.ask_verbosity_on_launch) html += formGroup('prompt-verbosity', t('Verbosity'), selectInput('prompt-verbosity', 'verbosity', VERBOSITY, values.verbosity), t('Control the level of output ansible will produce as the playbook executes.'));
      if (launch.ask_job_slice_count_on_launch) html += formGroup('prompt-job-slicing', t('Job Slicing'), textInput('prompt-job-slicing', 'job_slice_count', values.job_slice_count, 'number', 'min="1"'), t('Divide the work done by this job template into the specified number of job slices, each running the same tasks against a portion of the inventory.'));
      if (launch.ask_timeout_on_launch) html += formGroup('prompt-timeout', t('Timeout'), textInput('prompt-timeout', 'timeout', values.timeout, 'number', 'min="0"'), t('The amount of time (in seconds) to run before the job is canceled.'));
      if (launch.ask_diff_mode_on_launch) html += '<div class="pf-v6-c-form__group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="prompt-diff-mode"><span class="pf-v6-c-form__label-text">' + esc(t('Show Changes')) + '</span></label></div><div class="pf-v6-c-form__group-control"><label class="pf-v6-c-switch" for="prompt-diff-mode"><input id="prompt-diff-mode" class="pf-v6-c-switch__input" role="switch" type="checkbox" name="diff_mode"' + (values.diff_mode ? ' checked' : '') + ' data-switch-label><span class="pf-v6-c-switch__toggle"></span><span class="pf-v6-c-switch__label" aria-hidden="true">' + esc(values.diff_mode ? t('On') : t('Off')) + '</span></label></div></div>';
      if (launch.ask_tags_on_launch) html += formGroup('prompt-job-tags', t('Job Tags'), textInput('prompt-job-tags', 'job_tags', values.job_tags, 'text', 'placeholder="' + esc(t('Select tags')) + '"'), t('Tags are useful when you have a large playbook, and you want to run a specific part of a play or task. Use commas to separate multiple tags.'));
      if (launch.ask_skip_tags_on_launch) html += formGroup('prompt-skip-tags', t('Skip Tags'), textInput('prompt-skip-tags', 'skip_tags', values.skip_tags, 'text', 'placeholder="' + esc(t('Select tags')) + '"'), t('Skip tags are useful when you have a large playbook, and you want to skip specific parts of a play or task. Use commas to separate multiple tags.'));
      if (launch.ask_variables_on_launch) html += '<div class="pf-v6-c-form__group" data-editor-group><div class="ascender-variables-field__header"><div class="pf-v6-l-split pf-m-gutter"><div class="pf-v6-l-split__item"><label for="prompt-variables" class="pf-v6-c-form__label" id="prompt-variables-label"><span class="pf-v6-c-form__label-text">' + esc(t('Variables')) + '</span></label></div><div class="pf-v6-l-split__item"><div class="ascender-button-group__group"><button aria-label="YAML" class="pf-v6-c-button pf-m-primary ascender-multi-button-toggle__small-button toggle-button-yaml" type="button" data-editor-mode="yaml"><span class="pf-v6-c-button__text">YAML</span></button><button aria-label="JSON" class="pf-v6-c-button pf-m-secondary ascender-multi-button-toggle__small-button toggle-button-javascript" type="button" data-editor-mode="javascript"><span class="pf-v6-c-button__text">JSON</span></button></div></div></div></div><div class="ascender-code-editor__focus-wrapper" tabindex="0" data-editor-focus><div data-cy="code-editor" class="ascender-code-editor__wrapper pf-v6-c-form-control" data-code-editor data-editor-id="prompt-variables" data-rows="6" data-mode="yaml"><textarea hidden name="extra_vars_editor" data-code-editor-value>' + esc(values.extra_vars) + '</textarea></div></div></div>';
      body.innerHTML += '<form class="pf-v6-c-form" novalidate data-no-submit data-cy="other-prompts">' + html + '</form>';
      $$('[data-remove-label]', body).forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-remove-label'); values.labels = values.labels.filter(function (l) { return String(l.id || l.name) !== k; }); show(); }); });
      var add = $('[data-add-label]', body);
      if (add) add.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var n = add.value.trim(); if (n) { values.labels.push({ id: '', name: n }); show(); } } });
      $$('[data-switch-label]', body).forEach(function (sw) { sw.addEventListener('change', function () { sw.closest('.pf-v6-c-switch').querySelector('.pf-v6-c-switch__label').textContent = sw.checked ? t('On') : t('Off'); }); });
      var ed = $('[data-code-editor]', body);
      if (ed && window.ASCENDER && window.ASCENDER.initEditor) window.ASCENDER.initEditor(ed);
    }
    function validateOther() {
      if (launch.ask_job_type_on_launch && !values.job_type) return t('Select a job type');
      if (launch.ask_variables_on_launch && window.AscenderCM) { try { window.AscenderCM.jsyaml.load(values.extra_vars || '---'); } catch (e) { return t('Variables must be valid YAML or JSON'); } }
      return null;
    }
    function renderSurvey(body) {
      body.innerHTML += '<form class="pf-v6-c-form" novalidate data-no-submit data-cy="survey-prompts">' + (survey.spec || []).map(function (q) { return surveyField(q, values.survey); }).join('') + '</form>';
    }
    function validateSurvey() {
      var missing = (survey.spec || []).filter(function (q) { var v = values.survey[q.variable]; return q.required && (v === undefined || v === '' || (Array.isArray(v) && !v.length)); });
      if (missing.length) return t('Answer the required questions: {0}', { 0: missing.map(function (q) { return q.question_name; }).join(', ') });
      return null;
    }
    function detail(label, value) { return '<div><dt class="ascender-detail-name">' + esc(label) + '</dt><dd class="ascender-detail-value">' + value + '</dd></div>'; }
    function renderPreview(body) {
      var hasErr = Object.keys(errors).some(function (k) { return errors[k] && k !== 'preview'; });
      var html = hasErr ? '<div class="ascender-preview-step__error-message-wrapper">' + esc(t('Some of the previous step(s) have errors')) + '<span class="ascender-preview-step__exclamation-circle-icon" data-tooltip="' + esc(t('See errors on the left')) + '" data-tooltip-pos="right">' + ICON.warn + '</span></div>' : '';
      // The form only holds the values this launch prompts for.
      var o = {};
      if (launch.ask_inventory_on_launch) o.inventory = values.inventory;
      if (launch.ask_credential_on_launch) o.credentials = values.credentials;
      if (launch.ask_execution_environment_on_launch) o.execution_environment = values.execution_environment;
      if (launch.ask_instance_groups_on_launch) o.instance_groups = values.instance_groups;
      if (launch.ask_job_type_on_launch) o.job_type = values.job_type;
      if (launch.ask_scm_branch_on_launch) o.scm_branch = values.scm_branch;
      if (launch.ask_labels_on_launch) o.labels = values.labels;
      if (launch.ask_forks_on_launch) o.forks = values.forks;
      if (launch.ask_limit_on_launch) o.limit = values.limit;
      if (launch.ask_verbosity_on_launch) o.verbosity = values.verbosity;
      if (launch.ask_job_slice_count_on_launch) o.job_slice_count = values.job_slice_count;
      if (launch.ask_timeout_on_launch) o.timeout = values.timeout;
      if (launch.ask_diff_mode_on_launch) o.diff_mode = values.diff_mode;
      if (launch.ask_tags_on_launch) o.job_tags = values.job_tags;
      if (launch.ask_skip_tags_on_launch) o.skip_tags = values.skip_tags;
      if (launch.ask_variables_on_launch || launch.survey_enabled) o.extra_vars = mergedVars();
      if (launch.survey_enabled && survey.spec) Object.keys(values.survey).forEach(function (k) { o['survey_' + k] = values.survey[k]; });
      var res = Object.assign({ type: isWF ? 'workflow_job_template' : 'job_template' }, resource);
      body.innerHTML += '<div data-cy="prompt-preview">' + html + promptDetail(res, launch, o) + '</div>';
      initPromptEditors(body);
    }
    function chipGroup(names) { return '<div class="pf-v6-c-label-group"><div class="pf-v6-c-label-group__main"><ul class="pf-v6-c-label-group__list" role="list">' + names.map(function (n) { return '<li class="pf-v6-c-label-group__list-item"><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(n) + '</span></span></span></li>'; }).join('') + '</ul></div></div>'; }
    function surveyAnswers(masked) {
      var out = {};
      (survey.spec || []).forEach(function (q) {
        var v = values.survey[q.variable];
        if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) return;
        out[q.variable] = masked && q.type === 'password' ? '$encrypted$' : v;
      });
      return out;
    }
    function mergedVars() {
      var CM = window.AscenderCM, base = {};
      try { if (CM) base = CM.jsyaml.load(launch.ask_variables_on_launch ? (values.extra_vars || '---') : (resource.extra_vars || '---')) || {}; } catch (e) { base = {}; }
      if (typeof base !== 'object' || base === null) base = {};
      var answers = surveyAnswers(true);
      Object.keys(answers).forEach(function (k) { base[k] = answers[k]; });
      try { return CM ? CM.jsyaml.dump(base) : JSON.stringify(base, null, 2); } catch (e) { return JSON.stringify(base, null, 2); }
    }
    function submit() {
      var post = {};
      function set(k, v) { if (v !== undefined && v !== null) post[k] = v; }
      if (Object.keys(values.credential_passwords).length) set('credential_passwords', values.credential_passwords);
      if (launch.ask_inventory_on_launch && values.inventory) set('inventory', values.inventory.id);
      if (launch.ask_credential_on_launch) set('credentials', values.credentials.map(function (c) { return c.id; }));
      if (launch.ask_job_type_on_launch) set('job_type', values.job_type);
      if (launch.ask_limit_on_launch) set('limit', values.limit);
      if (launch.ask_tags_on_launch) set('job_tags', values.job_tags);
      if (launch.ask_skip_tags_on_launch) set('skip_tags', values.skip_tags);
      if (launch.ask_variables_on_launch || launch.survey_enabled) {
        var CM = window.AscenderCM, mergedVars = {};
        try { if (CM) mergedVars = CM.jsyaml.load(launch.ask_variables_on_launch ? (values.extra_vars || '---') : '---') || {}; } catch (e) { mergedVars = {}; }
        if (typeof mergedVars !== 'object' || mergedVars === null) mergedVars = {};
        var answers = surveyAnswers(false);
        Object.keys(answers).forEach(function (k) { mergedVars[k] = answers[k]; });
        set('extra_vars', mergedVars);
      }
      if (launch.ask_scm_branch_on_launch) set('scm_branch', values.scm_branch);
      if (launch.ask_verbosity_on_launch) set('verbosity', Number(values.verbosity));
      if (launch.ask_diff_mode_on_launch) set('diff_mode', !!values.diff_mode);
      if (launch.ask_timeout_on_launch) set('timeout', Number(values.timeout));
      if (launch.ask_forks_on_launch) set('forks', Number(values.forks));
      if (launch.ask_job_slice_count_on_launch) set('job_slice_count', Number(values.job_slice_count));
      if (launch.ask_execution_environment_on_launch && values.execution_environment) set('execution_environment', values.execution_environment.id);
      if (launch.ask_instance_groups_on_launch) set('instance_groups', values.instance_groups.map(function (g) { return g.id; }));
      var next = $('[data-wizard-next]', m); next.disabled = true; next.classList.add('pf-m-in-progress');
      function launchNow() {
        if (isSchedule) { U.closeModal(m); if (opts.onSave) opts.onSave(post, values); return; }
        api('POST', base + 'launch/', post).then(function (r) {
          if (r.ok) { location.href = jobURL(r.data); return; }
          next.disabled = false; next.classList.remove('pf-m-in-progress');
          U.errorModal(t('Error!'), t('Failed to launch job.') + ' ' + U.errorText(r));
        });
      }
      if (launch.ask_labels_on_launch) {
        var org = resource.organization;
        var creates = values.labels.filter(function (l) { return !l.id; }).map(function (l) { return api('POST', '/api/v2/labels/', { name: l.name, organization: org }).then(function (r) { if (r.ok) l.id = r.data.id; else if (r.status === 400) { return api('GET', '/api/v2/labels/?name=' + encodeURIComponent(l.name) + '&organization=' + org).then(function (g) { if (g.ok && g.data.results.length) l.id = g.data.results[0].id; }); } }); });
        Promise.all(creates).then(function () { set('labels', values.labels.filter(function (l) { return l.id; }).map(function (l) { return l.id; })); launchNow(); });
      } else launchNow();
    }
    show();
  }
  $$('[data-launch]').forEach(function (b) {
    b.addEventListener('click', function () { launchTemplate(b.getAttribute('data-launch'), b.getAttribute('data-launch-type'), b.getAttribute('data-launch-name')); });
  });

  // The schedule form opens the same wizard to collect prompted values
  // without launching anything.
  window.ASCENDER.promptWizard = function (base, type, name, opts) {
    var isWF = type === 'workflow_job_template';
    api('GET', base + 'launch/').then(function (l) {
      if (!l.ok) { U.errorModal(t('Error!'), U.errorText(l)); return; }
      var launch = l.data, extra = [];
      if (launch.survey_enabled) extra.push(api('GET', base + 'survey_spec/')); else extra.push(Promise.resolve({ ok: true, data: {} }));
      if (launch.ask_credential_on_launch && !isWF) extra.push(api('GET', base + 'credentials/?page_size=200')); else extra.push(Promise.resolve({ ok: true, data: { results: [] } }));
      extra.push(api('GET', base));
      Promise.all(extra).then(function (more) {
        wizard(base, launch, more[0].data || {}, (more[1].data && more[1].data.results) || [], more[2].data || {}, name, isWF, opts);
      });
    });
  };

  // ---------------------------------------------------------------- job output
  var out = $('[data-output-scroll-container]');
  if (out) {
    var lines = $$('[data-output-line]', out);
    // The old output was a virtual list that placed each event at its
    // measured height rounded to whole pixels (22.5px lines landed 23px
    // apart). Each event's last line takes the rounding as bottom margin.
    function roundEventHeights() {
      var group = [], sum = 0;
      function flush() {
        if (group.length) group[group.length - 1].style.marginBottom = (Math.round(sum) - sum) + 'px';
        group = []; sum = 0;
      }
      lines.forEach(function (l) {
        l.style.marginBottom = '';
        if (l.hidden || l.style.display === 'none') return;
        var uuid = l.getAttribute('data-uuid');
        if (group.length && (!uuid || group[0].getAttribute('data-uuid') !== uuid)) flush();
        group.push(l); sum += l.getBoundingClientRect().height;
        if (!uuid) flush();
      });
      flush();
    }
    roundEventHeights();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(roundEventHeights);
    window.addEventListener('resize', roundEventHeights);
    out.addEventListener('ascender:output-changed', function () { lines = $$('[data-output-line]', out); roundEventHeights(); });
    function childrenOf(uuid) { return lines.filter(function (l) { return l.getAttribute('data-parent') === uuid; }); }
    function setCollapsed(line, collapsed) {
      var uuid = line.getAttribute('data-uuid'); if (!uuid) return;
      line.setAttribute('data-collapsed', collapsed ? '1' : '0');
      var btn = $('[data-output-toggle]', line); if (btn) btn.innerHTML = collapsed ? ICON.angleRight : ICON.angleDown;
      var stack = childrenOf(uuid);
      while (stack.length) {
        var c = stack.pop();
        if (c === line) continue;
        c.hidden = collapsed;
        if (!collapsed && c.getAttribute('data-collapsed') === '1') continue;
        if (c.getAttribute('data-uuid')) stack = stack.concat(childrenOf(c.getAttribute('data-uuid')));
      }
    }
    function markClickable(l) { if (l.hasAttribute('data-host-event')) l.classList.add('ascender-job-event-line--clickable'); }
    lines.forEach(markClickable);
    // Toggles and host events are handled for lines present now and lines
    // that arrive while the job runs.
    out.addEventListener('click', function (e) {
      var line = e.target.closest('[data-output-line]');
      if (!line) return;
      if (e.target.closest('[data-output-toggle]')) {
        setCollapsed(line, line.getAttribute('data-collapsed') !== '1');
        roundEventHeights();
        return;
      }
      if (!line.hasAttribute('data-host-event')) return;
      var jobApi = out.getAttribute('data-job-api');
      if (!jobApi) return;
      var eventsPath = /\/api\/v2\/jobs\//.test(jobApi) ? 'job_events/' : 'events/';
      api('GET', jobApi + eventsPath + '?counter=' + line.getAttribute('data-host-event')).then(function (r) {
        if (!r.ok || !r.data.results.length) return;
        hostEventModal(r.data.results[0]);
      });
    });

    // HostEventModal: the event's host, status, play, task, module and
    // command, its result as JSON and as YAML, and the module's stdout and
    // stderr when it had them.
    function hostEventStatus(ev) {
      var status = null;
      if (ev.event === 'runner_on_unreachable') status = 'unreachable';
      if (ev.failed) status = 'failed';
      if (ev.event === 'runner_on_ok' || ev.event === 'runner_on_async_ok' || ev.event === 'runner_item_on_ok') status = 'ok';
      if (ev.changed) status = 'changed';
      if (ev.event === 'runner_on_skipped') status = 'skipped';
      return status;
    }
    // he's encode: the text shown with its markup characters escaped.
    function encodeText(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]; }); }
    function editorValue(v) {
      if (!v) return '';
      if (typeof v === 'string') return encodeText(v);
      if (Array.isArray(v)) return encodeText(v.join(' '));
      return v;
    }
    function hostStdOut(ev) {
      var d = ev.event_data || {}, res = d.res || {};
      if (d.task_action === 'debug' && res.result && res.result.stdout) return res.result.stdout;
      if (d.task_action === 'yum' && Array.isArray(res.results)) return res.results.join('\n');
      if (res.stdout) return Array.isArray(res.stdout) ? res.stdout.join(' ') : res.stdout;
      return undefined;
    }
    // A React text node: strings as they are, arrays run together, objects
    // and nothing at all left out.
    function detailText(v) {
      if (v === null || v === undefined || v === false || v === true) return '';
      if (Array.isArray(v)) return v.map(detailText).join('');
      if (typeof v === 'object') return '';
      return String(v);
    }
    function hostEventModal(ev) {
      var parts = $('template[data-host-modal-parts]');
      var part = function (sel) { var x = parts && parts.content.querySelector(sel); return x ? x.innerHTML : ''; };
      var d = ev.event_data || {}, res = d.res;
      var jsonObj = editorValue(res);
      var rawErr = res && res.stderr, stdErr = Array.isArray(rawErr) ? rawErr.join('\n') : rawErr;
      var stdOut = hostStdOut(ev);
      var desc = ev.summary_fields && ev.summary_fields.host && ev.summary_fields.host.description;
      var status = hostEventStatus(ev);
      function detail(label, value, html) {
        if (!html && !value && typeof value !== 'number') return '';
        return '<div><dt class="ascender-detail-name">' + esc(label) + '</dt><dd class="ascender-detail-value">' + (html ? value : esc(value)) + '</dd></div>';
      }
      var details = '<dl class="ascender-detail-list" gutter="sm" style="align-items: center; margin-top: 20px;">' +
        detail(t('Host'), detailText(d.host)) + (desc ? detail(t('Description'), detailText(desc)) : '') + (status ? detail(t('Status'), part('[data-status="' + status + '"]'), true) : '') +
        detail(t('Play'), detailText(ev.play)) + detail(t('Task'), detailText(ev.task)) + detail(t('Module'), detailText(d.task_action) || t('No result found')) + detail(t('Command'), detailText(res && res.cmd)) + '</dl>';
      var tabs = [{ key: 0, title: t('Details'), aria: t('Details tab') }, { key: 1, title: t('JSON'), aria: t('JSON tab') }, { key: 2, title: t('YAML'), aria: t('YAML tab') }];
      if (stdOut && stdOut.length) tabs.push({ key: 3, title: t('Output'), aria: t('Output tab') });
      if (stdErr && stdErr.length) tabs.push({ key: 4, title: t('Standard Error'), aria: t('Standard error tab') });
      function empty(title) { return '<div class="pf-v6-c-empty-state"><div class="pf-v6-c-empty-state__content"><div class="pf-v6-c-empty-state__header"><div class="pf-v6-c-empty-state__icon">' + part('[data-icon="cubes"]') + '</div><div class="pf-v6-c-empty-state__title"><h3 class="pf-v6-c-empty-state__title-text">' + esc(title) + '</h3></div></div><div class="pf-v6-c-empty-state__body"></div></div></div>'; }
      function editor(value) { return '<div class="ascender-code-editor__focus-wrapper" tabindex="-1"><div data-cy="code-editor" class="ascender-code-editor__wrapper ascender-code-editor__wrapper--read-only pf-v6-c-form-control" data-code-editor data-readonly data-rows="20" data-mode="javascript"><textarea hidden data-code-editor-value>' + esc(value) + '</textarea></div></div>'; }
      // The JSON and YAML editors exist only while their tab is shown.
      function content(key, active) {
        if (key === 0) return details;
        if (key === 1) return active === 1 && jsonObj ? editor(JSON.stringify(jsonObj, null, 2)) : empty(t('No JSON Available'));
        if (key === 2) {
          if (!(active === 2 && jsonObj)) return empty(t('No YAML Available'));
          var src = JSON.stringify(jsonObj), v = JSON.parse(src), y = (typeof v === 'object' && v !== null ? Object.keys(v) : String(v)).length === 0 ? '---\n' : window.AscenderCM.jsyaml.dump(v);
          return editor(y);
        }
        if (key === 3) return editor(stdOut);
        return editor(stdErr);
      }
      var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(t('Host details modal')) + '" aria-labelledby="host-event-modal-title" aria-modal="true" class="pf-v6-c-modal-box" style="--pf-v6-c-modal-box--Width: 75%;"><div class="pf-v6-c-modal-box__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-close-modal><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><h1 id="host-event-modal-title" class="pf-v6-c-modal-box__title"><span class="pf-v6-c-modal-box__title-text">' + esc(t('Host Details')) + '</span></h1></header><div class="pf-v6-c-modal-box__body">' +
        '<div aria-label="' + esc(t('Tabs')) + '" class="pf-v6-c-tabs pf-m-animate-current" data-host-tabs><ul class="pf-v6-c-tabs__list" role="tablist">' + tabs.map(function (t, i) {
          return '<li class="pf-v6-c-tabs__item' + (i === 0 ? ' pf-m-current' : '') + '" role="presentation"><button type="button" class="pf-v6-c-tabs__link" id="host-event-tab-' + t.key + '" aria-controls="host-event-tab-section-' + t.key + '" role="tab" aria-selected="' + (i === 0) + '" aria-label="' + esc(t.aria) + '" data-host-tab="' + t.key + '"><span class="pf-v6-c-tabs__item-text">' + esc(t.title) + '</span></button></li>';
        }).join('') + '</ul></div>' + tabs.map(function (t, i) {
          return '<section' + (i === 0 ? '' : ' hidden') + ' class="pf-v6-c-tab-content" id="host-event-tab-section-' + t.key + '" aria-labelledby="host-event-tab-' + t.key + '" role="tabpanel" tabindex="0" data-host-section="' + t.key + '">' + content(t.key, 0) + '</section>';
        }).join('') + '</div></div></div></div>');
      var root = $('#ascender-modal-root') || document.body;
      root.innerHTML = ''; root.appendChild(m); U.openModal(m);
      var tabBar = $('[data-host-tabs]', m);
      function accent() {
        var cur = $('.pf-v6-c-tabs__item.pf-m-current', tabBar);
        if (!cur) return;
        tabBar.style.setProperty('--pf-v6-c-tabs--link-accent--length', cur.offsetWidth + 'px');
        tabBar.style.setProperty('--pf-v6-c-tabs--link-accent--start', cur.offsetLeft + 'px');
      }
      function initEditors() { $$('[data-code-editor]', m).forEach(function (w) { if (window.ASCENDER.initEditor) window.ASCENDER.initEditor(w); }); }
      tabBar.classList.add('pf-m-initializing-accent'); accent();
      setTimeout(function () { tabBar.classList.remove('pf-m-initializing-accent'); }, 0);
      initEditors();
      $$('[data-host-tab]', m).forEach(function (b) {
        b.addEventListener('click', function () {
          var key = parseInt(b.getAttribute('data-host-tab'), 10);
          $$('[data-host-tab]', m).forEach(function (x) { var on = x === b; x.parentElement.classList.toggle('pf-m-current', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
          $$('[data-host-section]', m).forEach(function (sct) {
            var k = parseInt(sct.getAttribute('data-host-section'), 10);
            sct.hidden = k !== key;
            if (k === 1 || k === 2) sct.innerHTML = content(k, key);
          });
          accent();
          initEditors();
        });
      });
    }
    var collapseAll = $('[data-output-collapse-all]');
    if (collapseAll) collapseAll.addEventListener('click', function () {
      var anyOpen = lines.some(function (l) { return l.hasAttribute('data-toggle-line') && l.getAttribute('data-collapsed') !== '1'; });
      lines.filter(function (l) { return l.hasAttribute('data-toggle-line'); }).forEach(function (l) { setCollapsed(l, anyOpen); });
      roundEventHeights();
      collapseAll.innerHTML = '<span class="pf-v6-c-button__icon">' + (anyOpen ? ICON.angleRight : ICON.angleDown) + '</span>';
      collapseAll.setAttribute('aria-label', anyOpen ? t('Expand job events') : t('Collapse all job events'));
    });

    // ------------------------------------------------------------ live output
    // While the job runs the page follows its output as JobOutput did over
    // the websocket: new lines are appended, follow mode keeps the view at
    // the end, and only a user gesture upwards turns follow off.
    var live = $('[data-job-live]');
    if (live) {
      var liveURL = live.getAttribute('data-job-live');
      var counter = parseInt(live.getAttribute('data-counter') || '0', 10) || 0;
      var started = live.getAttribute('data-started') || '';
      var running = true, follow = true, finalPolls = 0, pointerDown = false, lastTop = out.scrollTop;
      var followBtn = $('[data-output-follow]');
      var elapsedBadge = $('.ascender-output-toolbar__elapsed-badge');
      function setFollow(on) {
        follow = on;
        if (!followBtn) return;
        followBtn.classList.toggle('pf-m-secondary', on);
        followBtn.classList.toggle('pf-m-primary', !on);
        $('.pf-v6-c-button__text', followBtn).textContent = on ? t('Unfollow') : t('Follow');
      }
      function scrollEnd() { out.scrollTop = out.scrollHeight; lastTop = out.scrollTop; }
      if (followBtn) followBtn.addEventListener('click', function () {
        if (follow) setFollow(false); else { setFollow(true); scrollEnd(); }
      });
      // Follow is only turned off by a real gesture: wheel up, an upward
      // key, or an upward scroll while the pointer or a touch is held down.
      out.addEventListener('wheel', function (e) { if (e.deltaY < 0) setFollow(false); }, { passive: true });
      out.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home' || (e.key === ' ' && e.shiftKey)) setFollow(false);
      });
      out.addEventListener('mousedown', function () { pointerDown = true; out.focus({ preventScroll: true }); });
      window.addEventListener('mouseup', function () { pointerDown = false; });
      out.addEventListener('touchstart', function () { pointerDown = true; }, { passive: true });
      out.addEventListener('touchend', function () { pointerDown = false; });
      out.addEventListener('scroll', function () {
        if (follow && lastTop > out.scrollTop && pointerDown) setFollow(false);
        lastTop = out.scrollTop;
        if (out.scrollHeight - (out.scrollTop + out.clientHeight) <= 2) setFollow(true);
      });
      $$('[data-output-scroll]').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = b.getAttribute('data-output-scroll');
          if (a === 'first' || a === 'prev') setFollow(false);
          if (a === 'last') { scrollEnd(); setFollow(true); }
        });
      });
      // The elapsed badge counts up from the start while the job runs.
      var pad = U.pad;
      var timer = setInterval(function () {
        if (!running || !started || !elapsedBadge) return;
        var secs = Math.max(0, Math.floor((Date.now() - new Date(started).getTime()) / 1000));
        elapsedBadge.textContent = pad(Math.floor(secs / 3600)) + ':' + pad(Math.floor(secs / 60) % 60) + ':' + pad(secs % 60);
      }, 1000);
      var COUNT_LABELS = ['Play Count', 'Task Count', 'Host Count', 'Unreachable Host Count', 'Failed Host Count'];
      function apply(frag) {
        var title = $('[data-live-title] .ascender-job-output__header-title', frag), curTitle = $('.ascender-job-output__header-title');
        if (title && curTitle) curTitle.replaceWith(title);
        var toolbar = $('.ascender-output-toolbar__wrapper'), elapsedGroup = toolbar && $('[aria-label="' + t('Elapsed Time') + '"]', toolbar);
        if (toolbar && elapsedGroup) {
          COUNT_LABELS.forEach(function (n) { var g = $('[aria-label="' + t(n) + '"]', toolbar); if (g) g.remove(); });
          $$('[data-live-counts] > .ascender-output-toolbar__badge-group', frag).forEach(function (g) { toolbar.insertBefore(g, elapsedGroup); });
        }
        var bar = $('.ascender-host-status-bar__wrapper'), newBar = $('[data-live-bar]', frag);
        if (bar && newBar) bar.innerHTML = newBar.innerHTML;
        var added = $$('[data-live-lines] > [data-output-line]', frag);
        // Until the first lines arrive the wrapper shows EmptyOutput in place
        // of the output, for the job's current status.
        var wrapper = out.parentElement, empty = $(':scope > [data-output-empty]', wrapper);
        if (!added.length && empty) {
          var tpl = $('[data-live-empty]', frag), next = tpl && tpl.content.firstElementChild;
          if (next && next.outerHTML !== empty.outerHTML) empty.replaceWith(next);
        }
        if (added.length) {
          if (empty) empty.remove();
          out.hidden = false;
          added.forEach(function (l) {
            var parent = l.getAttribute('data-parent'), p = parent && $('[data-output-line][data-uuid="' + parent + '"]', out);
            if (p && (p.hidden || p.getAttribute('data-collapsed') === '1')) l.hidden = true;
            markClickable(l);
            out.appendChild(l);
          });
          $$('[data-time]', out).forEach(function (s) {
            if (s.hasAttribute('data-time-local')) return;
            var d = new Date(s.getAttribute('data-time'));
            if (!isNaN(d)) s.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
            s.setAttribute('data-time-local', '');
          });
          out.dispatchEvent(new Event('ascender:output-changed'));
        }
        var d = $('[data-live]', frag);
        counter = Math.max(counter, parseInt(d.getAttribute('data-counter') || '0', 10) || 0);
        if (d.getAttribute('data-started')) started = d.getAttribute('data-started');
        if (follow) scrollEnd();
        if (running && !d.hasAttribute('data-running')) finish(d);
      }
      // When the job is done the follow button and cancel action go, search
      // is offered again and follow ends a second later, as JobOutput did.
      function finish(d) {
        running = false;
        clearInterval(timer);
        if (elapsedBadge && d.getAttribute('data-elapsed')) elapsedBadge.textContent = d.getAttribute('data-elapsed');
        var cancel = $('.ascender-output-toolbar__wrapper [data-cancel-job]');
        if (cancel) (cancel.parentElement.getAttribute('style') === 'display: contents;' ? cancel.parentElement : cancel).remove();
        if (followBtn) { followBtn.remove(); followBtn = null; }
        var sItem = $('[data-output-search-disabled]'), sBar = $('#job_output-toolbar');
        if (sItem) { window.ASCENDER.ui.clearTooltip(sItem); sItem.removeAttribute('data-output-search-disabled'); }
        if (sBar) {
          $$('button[disabled], input[disabled]', sBar).forEach(function (x) { if (!x.hasAttribute('data-search-submit') && !x.hasAttribute('data-date-submit')) x.disabled = false; });
          $$('.pf-v6-c-form-control.pf-m-disabled', sBar).forEach(function (x) { x.classList.remove('pf-m-disabled'); });
        }
        setTimeout(function () { follow = false; }, 1000);
      }
      function poll() {
        fetch(liveURL + '?after=' + counter + (location.search.length > 1 ? '&' + location.search.slice(1) : ''), { credentials: 'same-origin', headers: { Accept: 'text/html' } }).then(function (r) {
          var timeout = r.headers.get('Session-Timeout');
          if (timeout && window.ASCENDER.ui.sessionTouch) window.ASCENDER.ui.sessionTouch(Number(timeout));
          return r.ok ? r.text() : null;
        }).then(function (html) {
          if (html) {
            var t = document.createElement('template');
            t.innerHTML = html;
            apply(t.content);
          }
        }).catch(function () {}).then(function () {
          inFlight = false;
          if (again && running) { again = false; schedule(150); return; }
          again = false;
          // A couple of polls after the end pick up the last events.
          if (running) schedule(wsLive ? 5000 : 1500);
          else if (finalPolls++ < 2) schedule(1500);
          else if (ws) { ws.close(); ws = null; }
        });
      }
      // One fetch at a time; a websocket message brings the next one
      // forward, or asks for another once the one in flight is applied.
      var pollTimer = null, pollDue = 0, inFlight = false, again = false;
      function schedule(ms) {
        if (inFlight) { again = true; return; }
        var due = Date.now() + ms;
        if (pollTimer && pollDue <= due) return;
        if (pollTimer) clearTimeout(pollTimer);
        pollDue = due;
        pollTimer = setTimeout(function () { pollTimer = null; inFlight = true; poll(); }, ms);
      }
      // The job's events and status changes arrive over the websocket, as
      // JobOutput subscribed to them; each one fetches the new lines.
      var ws = null, wsLive = false;
      var wsMatch = liveURL.match(/\/jobs\/(\w+)\/(\d+)\/output\/live/);
      var wsGroup = wsMatch && { playbook: 'job_events', command: 'ad_hoc_command_events', project: 'project_update_events', inventory: 'inventory_update_events', management: 'system_job_events' }[wsMatch[1]];
      if (wsGroup && window.WebSocket && running) {
        var wsJob = parseInt(wsMatch[2], 10);
        try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/websocket/'); } catch (e) { ws = null; }
        if (ws) {
          ws.onmessage = function (e) {
            var d; try { d = JSON.parse(e.data); } catch (err) { return; }
            if (d.accept) { var groups = { jobs: ['status_changed', 'summary'] }; groups[wsGroup] = [wsJob]; ws.send(JSON.stringify({ xrftoken: window.ASCENDER.csrf, groups: groups })); return; }
            if (d.groups_current) { wsLive = d.groups_current.indexOf(wsGroup + '-' + wsJob) >= 0; return; }
            if ((d.group_name === wsGroup) || (d.group_name === 'jobs' && d.unified_job_id === wsJob)) schedule(150);
          };
          ws.onclose = function () { wsLive = false; };
        }
      }
      if (follow) scrollEnd();
      schedule(1000);
    }
  }

  // ---------------------------------------------------------------- job template form
  var jtForm = $('form[data-job-template-form]');
  if (jtForm) {
    var projectGroup = $('[data-resource="projects"]', jtForm), projectId = projectGroup && $('[data-lookup-id]', projectGroup);
    var playbookBox = $('[data-playbook-select] [data-typeahead]', jtForm), playbookInput = playbookBox && $('[data-typeahead-input]', playbookBox);
    var branchGroup = $('[data-scm-branch-group]', jtForm), allowOverride = $('[data-project-allow-override]', jtForm);
    var eeGroup = $('[data-resource="execution_environments"]', jtForm);
    function loadProject(initial) {
      var id = projectId.value;
      if (eeGroup) { var dis = !id; $$('[data-lookup-open],input[data-lookup-name]', eeGroup).forEach(function (x) { x.disabled = dis; }); $('.pf-v6-c-form-control', eeGroup).classList.toggle('pf-m-disabled', dis); }
      if (!id) { if (playbookBox && playbookBox._setOptions) playbookBox._setOptions([]); branchGroup.hidden = true; allowOverride.value = 'false'; return; }
      api('GET', '/api/v2/projects/' + id + '/playbooks/').then(function (r) { if (r.ok && playbookBox && playbookBox._setOptions) playbookBox._setOptions(r.data || []); });
      api('GET', '/api/v2/projects/' + id + '/').then(function (r) {
        if (!r.ok) return;
        var ao = !!r.data.allow_override; allowOverride.value = ao ? 'true' : 'false'; branchGroup.hidden = !ao;
        if (!ao) { $('#template-scm-branch').value = ''; }
        if (!initial && eeGroup && r.data.organization) eeGroup.setAttribute('data-filter', 'or__organization=' + r.data.organization + '&or__organization__isnull=True');
      });
    }
    // JobTemplateForm shows the playbook's required error whenever the field
    // is empty, touched or not: validation runs on mount and its helper text
    // ignores touched.
    function playbookBlank() {
      if (!playbookInput) return;
      var group = playbookInput.closest('.pf-v6-c-form__group-control'), help = $('.ascender-client-error', group);
      var server = $('.pf-v6-c-form__helper-text:not(.ascender-client-error)', group);
      var blank = !playbookInput.value.trim();
      var tpl = $('template[data-blank-error]', jtForm);
      if (blank && !help && !server && tpl) group.insertAdjacentHTML('beforeend', tpl.innerHTML);
      else if (!blank && help) help.parentNode.removeChild(help);
      if (!blank && server) server.parentNode.removeChild(server);
    }
    if (playbookInput) { playbookInput.addEventListener('change', playbookBlank); playbookInput.addEventListener('blur', playbookBlank); }
    if (projectId) { projectId.addEventListener('change', function () { if (playbookInput) { playbookInput.value = ''; playbookInput.dispatchEvent(new Event('input', { bubbles: true })); playbookBlank(); } loadProject(false); }); loadProject(true); }
    $$('[data-toggle-subform]', jtForm).forEach(function (cb) {
      var panel = $('[data-subform-panel="' + cb.getAttribute('data-toggle-subform') + '"]', jtForm);
      cb.addEventListener('change', function () { panel.hidden = !cb.checked; });
    });
    $$('[data-switch-label]', jtForm).forEach(function (sw) { sw.addEventListener('change', function () { sw.closest('.pf-v6-c-switch').querySelector('.pf-v6-c-switch__label').textContent = sw.checked ? t('On') : t('Off'); }); });
    var svc = $('[data-webhook-service]', jtForm), url = $('[data-webhook-url]', jtForm), whKey = $('[data-webhook-key]', jtForm);
    var whCred = $('[data-lookup-id][name=webhook_credential]', jtForm), whCredGroup = whCred && whCred.closest('[data-lookup]');
    var whInitial = { service: svc ? svc.getAttribute('data-initial') : '', key: whKey ? whKey.value : '', credId: whCred ? whCred.value : '',
      credName: whCredGroup ? $('[data-lookup-hidden-name]', whCredGroup).value : '' };
    function setWebhookCredential(id, name) {
      if (!whCredGroup) return;
      whCred.value = id; $('[data-lookup-hidden-name]', whCredGroup).value = name; $('[data-lookup-name]', whCredGroup).value = name;
    }
    // As WebhookSubForm did: another service starts with a blank key (a new
    // one is generated on save) and no credential; the saved service gets
    // its key and credential back.
    if (svc) svc.addEventListener('change', function () {
      var rid = svc.getAttribute('data-resource-id');
      url.value = rid && svc.value ? svc.getAttribute('data-origin') + '/api/v2/' + svc.getAttribute('data-resource') + '/' + rid + '/' + svc.value + '/' : t('a new webhook url will be generated on save.').toUpperCase();
      if (svc.value === whInitial.service || svc.value === '') { whKey.value = whInitial.key; setWebhookCredential(whInitial.credId, whInitial.credName); }
      else { whKey.value = ''; setWebhookCredential('', ''); }
    });
    $$('[data-webhook-key-refresh]', jtForm).forEach(function (b) {
      b.addEventListener('click', function () { api('POST', b.getAttribute('data-webhook-key-refresh')).then(function (r) { if (r.ok) { $('[data-webhook-key]', jtForm).value = r.data.webhook_key; U.toast('success', t('Webhook key updated.')); } else U.errorModal(t('Error!'), U.errorText(r)); }); });
    });
    $$('[data-generate-key]', jtForm).forEach(function (b) {
      b.addEventListener('click', function () { var inp = document.getElementById(b.getAttribute('data-generate-key')); var bytes = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(bytes); inp.value = Array.prototype.map.call(bytes, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
    });
  }

  // ---------------------------------------------------------------- tag selects
  // Chips backed by a comma separated hidden value (job and workflow
  // template forms).
  $$('[data-tag-select]').forEach(function (box) {
    var input = $('[data-tag-input]', box), hidden = $('[data-tag-value]', box), chips = $('[data-tag-chips]', box), list = $('ul', chips);
    function tags() { return hidden.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean); }
    function render() {
      var ts = tags(); hidden.value = ts.join(',');
      list.innerHTML = ts.map(function (t) { return '<li class="pf-v6-c-label-group__list-item" data-chip data-chip-name="' + esc(t) + '"><span class="pf-v6-c-label"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(t) + '</span></span><span class="pf-v6-c-label__actions"><button class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button" aria-label="Close ' + esc(t) + '" data-chip-remove><span class="pf-v6-c-button__icon">' + ICON.close + '</span></button></span></span></li>'; }).join('');
      chips.hidden = !ts.length;
      $$('[data-chip-remove]', list).forEach(function (b) { b.addEventListener('click', function () { var n = b.closest('[data-chip]').getAttribute('data-chip-name'); hidden.value = tags().filter(function (t) { return t !== n; }).join(','); render(); }); });
    }
    function add() { var v = input.value.trim(); if (!v) return; var ts = tags(); v.split(',').forEach(function (t) { t = t.trim(); if (t && ts.indexOf(t) < 0) ts.push(t); }); hidden.value = ts.join(','); input.value = ''; render(); }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !input.value) { var ts = tags(); ts.pop(); hidden.value = ts.join(','); render(); } });
    input.addEventListener('blur', add);
    render();
  });

  // ---------------------------------------------------------------- survey list
  var surveyBar = $('[data-survey-toolbar]');
  if (surveyBar) {
    var specEl = $('[data-survey-spec]'), spec = specEl ? JSON.parse(specEl.textContent) : { name: '', description: '', spec: [] };
    var sApi = surveyBar.getAttribute('data-api'), tApi = surveyBar.getAttribute('data-template');
    var toggle = $('[data-survey-enabled]', surveyBar);
    if (toggle) toggle.addEventListener('change', function () {
      api('PATCH', tApi, { survey_enabled: toggle.checked }).then(function (r) {
        // SurveyToolbar's switch kept its one label, Survey Enabled.
        if (!r.ok) { toggle.checked = !toggle.checked; U.errorModal(t('Error!'), t('Failed to update survey.') + ' ' + U.errorText(r)); }
      });
    });
    var del = $('[data-survey-delete]', surveyBar), rows = $$('[data-survey-table] [data-select-row]'), all = $('[data-select-all]', surveyBar);
    function syncSurvey() { var sel = rows.filter(function (r) { return r.checked; }); del.disabled = sel.length === 0; U.setTooltip(del.parentNode, sel.length ? t('Delete survey question') : t('Select a question to delete')); if (all) all.checked = rows.length > 0 && sel.length === rows.length; }
    rows.forEach(function (r) { r.addEventListener('change', syncSurvey); });
    if (all) all.addEventListener('change', function () { rows.forEach(function (r) { r.checked = all.checked; }); syncSurvey(); });
    if (del) del.addEventListener('click', function () {
      var sel = rows.filter(function (r) { return r.checked; }).map(function (r) { return r.closest('[data-row]'); });
      var allSel = sel.length === rows.length;
      U.confirmModal({ title: allSel ? t('Delete Survey') : t('Delete Questions'), body: t('This action will delete the following:'), items: sel.map(function (r) { return r.getAttribute('data-name'); }), onConfirm: function (m) {
        var ids = sel.map(function (r) { return r.getAttribute('data-id'); });
        var p = allSel ? api('DELETE', sApi) : api('POST', sApi, { name: spec.name || '', description: spec.description || '', spec: (spec.spec || []).filter(function (q) { return ids.indexOf(q.variable) < 0; }) });
        p.then(function (r) { U.closeModal(m); if (r.ok) location.reload(); else U.errorModal(t('Error!'), t('Failed to delete survey questions.') + ' ' + U.errorText(r)); });
      } });
    });
    var preview = $('[data-survey-preview]', surveyBar);
    if (preview) preview.addEventListener('click', function () {
      var vals = {};
      (spec.spec || []).forEach(function (q) { if (q.default !== undefined && q.default !== null && q.default !== '') vals[q.variable] = q.type === 'multiselect' && typeof q.default === 'string' ? q.default.split('\n') : q.default; });
      modal({ title: t('Survey Preview'), size: 'pf-m-lg', body: '<form class="pf-v6-c-form" novalidate data-no-submit>' + (spec.spec || []).map(function (q) { return surveyField(q, vals); }).join('') + '</form>', footer: '<button class="pf-v6-c-button pf-m-primary" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Close')) + '</span></button>' });
    });
    var order = $('[data-survey-order]', surveyBar);
    if (order) order.addEventListener('click', function () {
      var qs = (spec.spec || []).slice();
      var m = modal({ title: t('Survey Question Order'), size: 'pf-m-md', body: '<div data-order-list></div>', footer: '<button class="pf-v6-c-button pf-m-primary" type="button" data-order-save><span class="pf-v6-c-button__text">' + esc(t('Save')) + '</span></button><button class="pf-v6-c-button pf-m-link" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button>' });
      function render() {
        $('[data-order-list]', m).innerHTML = '<table class="pf-v6-c-table pf-m-compact" role="grid"><tbody class="pf-v6-c-table__tbody">' + qs.map(function (q, i) { return '<tr class="pf-v6-c-table__tr"><td class="pf-v6-c-table__td"><b>' + esc(q.question_name) + '</b></td><td class="pf-v6-c-table__td">' + esc(q.type) + '</td><td class="pf-v6-c-table__td" style="text-align:right"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="' + esc(t('Move up')) + '" data-move="-1" data-idx="' + i + '"' + (i === 0 ? ' disabled' : '') + '>' + ICON.angleUp + '</button><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="' + esc(t('Move down')) + '" data-move="1" data-idx="' + i + '"' + (i === qs.length - 1 ? ' disabled' : '') + '>' + ICON.angleDown + '</button></td></tr>'; }).join('') + '</tbody></table>';
        $$('[data-move]', m).forEach(function (b) { b.addEventListener('click', function () { var i = parseInt(b.getAttribute('data-idx'), 10), d = parseInt(b.getAttribute('data-move'), 10); var t = qs[i]; qs[i] = qs[i + d]; qs[i + d] = t; render(); }); });
      }
      render();
      $('[data-order-save]', m).addEventListener('click', function () {
        api('POST', sApi, { name: spec.name || '', description: spec.description || '', spec: qs }).then(function (r) { U.closeModal(m); if (r.ok) location.reload(); else U.errorModal(t('Error!'), t('Failed to save survey.') + ' ' + U.errorText(r)); });
      });
    });
    syncSurvey();
  }

  // ---------------------------------------------------------------- survey question form
  var qForm = $('form[data-survey-question-form]');
  if (qForm) {
    var typeSel = $('[data-survey-type]', qForm);
    function showType() {
      var t = typeSel.value;
      $$('[data-survey-for]', qForm).forEach(function (box) {
        var on = box.getAttribute('data-survey-for').split(' ').indexOf(t) >= 0;
        box.hidden = !on;
        $$('input,textarea,select', box).forEach(function (i) { i.disabled = !on; });
      });
      var def = $('#question-default', qForm);
      if (def) def.type = t === 'text' ? 'text' : 'number';
    }
    typeSel.addEventListener('change', showType); showType();
    var choices = $('[data-choices]', qForm);
    function bindRow(row) {
      var text = $('[data-choice-text]', row), tog = $('[data-choice-default]', row), val = $('[data-choice-default-value]', row);
      text.addEventListener('input', function () { tog.disabled = !text.value.trim(); if (!text.value.trim()) { tog.classList.remove('ascender-multiple-choice-field__default-toggle--selected'); val.value = 'off'; } });
      tog.addEventListener('click', function () {
        var on = val.value !== 'on';
        if (on && typeSel.value === 'multiplechoice') { $$('[data-choice-row]', choices).forEach(function (r) { $('[data-choice-default]', r).classList.remove('ascender-multiple-choice-field__default-toggle--selected'); $('[data-choice-default-value]', r).value = 'off'; }); }
        tog.classList.toggle('ascender-multiple-choice-field__default-toggle--selected', on); val.value = on ? 'on' : 'off';
      });
      $('[data-choice-remove]', row).addEventListener('click', function () { if ($$('[data-choice-row]', choices).length > 1) row.remove(); else { text.value = ''; tog.disabled = true; val.value = 'off'; tog.classList.remove('ascender-multiple-choice-field__default-toggle--selected'); } });
    }
    if (choices) {
      $$('[data-choice-row]', choices).forEach(bindRow);
      $('[data-choice-add]', choices).addEventListener('click', function () {
        var last = $$('[data-choice-row]', choices).pop(); var row = last.cloneNode(true);
        $('[data-choice-text]', row).value = ''; $('[data-choice-default]', row).disabled = true; $('[data-choice-default]', row).classList.remove('ascender-multiple-choice-field__default-toggle--selected'); $('[data-choice-default-value]', row).value = 'off';
        last.after(row); bindRow(row); $('[data-choice-text]', row).focus();
      });
    }
  }
})();

// ---------------------------------------------------------------- workflow navigation
// The "Workflow Job n/m" menu on a job spawned by a workflow: a filter box,
// status filters that narrow the node list, and the nodes themselves.
(function () {
  var U = window.ASCENDER && window.ASCENDER.ui; if (!U) return;
  var $ = U.$, $$ = U.$$, esc = U.esc;
  $$('[data-wf-nav]').forEach(function (nav) {
    var toggle = $('[data-wf-nav-toggle]', nav), menu = $('[data-wf-nav-menu]', nav), filter = $('[data-wf-nav-filter]', nav), text = $('[data-wf-nav-text]', nav);
    var label = text.textContent, status = '';
    function apply() {
      var q = (filter.value || '').toLowerCase();
      $$('[data-wf-nav-node]', nav).forEach(function (li) {
        li.hidden = !((!status || li.getAttribute('data-status') === status) && (!q || li.getAttribute('data-label').toLowerCase().indexOf(q) >= 0));
      });
      $$('[data-wf-nav-status]', nav).forEach(function (b) { b.classList.toggle('pf-m-selected', b.getAttribute('data-wf-nav-status') === status); });
      text.innerHTML = status ? '<span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(status === 'failed' ? t('Failed') : t('Successful')) + '</span></span></span>' : esc(label);
    }
    function open(o) {
      menu.hidden = !o; toggle.setAttribute('aria-expanded', o ? 'true' : 'false'); toggle.classList.toggle('pf-m-expanded', o);
      if (o) filter.focus(); else { filter.value = ''; apply(); }
    }
    toggle.addEventListener('click', function () { open(menu.hidden); });
    filter.addEventListener('input', apply);
    $$('[data-wf-nav-status]', nav).forEach(function (b) {
      b.addEventListener('click', function () { var s = b.getAttribute('data-wf-nav-status'); status = status === s ? '' : s; apply(); });
    });
    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) open(false); });
  });
})();

// ---------------------------------------------------------------- notification toggles
// Each switch associates or disassociates a notification template with the
// resource for one event (started/success/error/changed/approvals).
(function () {
  var U = window.ASCENDER && window.ASCENDER.ui; if (!U) return;
  var $$ = U.$$, api = U.api, errorModal = U.errorModal, errorText = U.errorText;
  $$('[data-notification-toggle]').forEach(function (sw) {
    sw.addEventListener('change', function () {
      var on = sw.checked, body = { id: parseInt(sw.getAttribute('data-notification-id'), 10) };
      if (!on) body.disassociate = true;
      sw.disabled = true;
      api('POST', sw.getAttribute('data-notification-toggle'), body).then(function (r) {
        sw.disabled = false;
        if (!r.ok) { sw.checked = !on; errorModal(t('Error!'), t('Failed to toggle notification.') + ' ' + errorText(r)); }
      });
    });
  });
})();
