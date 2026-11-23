/* Access management: removing roles (ResourceAccessList chips, the user and
   team Roles tabs), associating a user with teams, and the two wizards that
   grant roles (AddResourceRole for a resource's Access tab,
   UserAndTeamAccessAdd for a user's or team's Roles tab). Built on the
   helpers app.js exports; markup follows the old PatternFly components. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, api = U.api, esc = U.esc, el = U.el;
  var IC = window.ASCENDER_ACCESS_ICONS || {};

  function reload() { location.reload(); }

  // ---------------------------------------------------------------- alert modal
  // AlertModal with a danger title, a body and action buttons.
  function alertModal(opts) {
    var root = $('#ascender-modal-root');
    var actions = (opts.actions || []).map(function (a, i) {
      return '<button class="pf-v6-c-button ' + a.cls + '" type="button" aria-label="' + esc(a.aria || a.label) + '" data-alert-action="' + i + '"><span class="pf-v6-c-button__text">' + esc(a.label) + '</span></button>';
    }).join('');
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div class="pf-v6-c-modal-box pf-m-' + (opts.variant || 'danger') + ' pf-m-sm" role="dialog" aria-modal="true" aria-labelledby="alert-modal-title"' + (opts.aria ? ' aria-label="' + esc(opts.aria) + '"' : '') + '><div class="pf-v6-c-modal-box__close"><button class="pf-v6-c-button pf-m-plain" type="button" aria-label="Close" data-close-modal><span class="pf-v6-c-button__icon">' + U.ICON.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><h1 class="pf-v6-c-modal-box__title" id="alert-modal-title"><span class="pf-v6-c-modal-box__title-icon">' + U.ICON.warn + '</span><span class="pf-v6-c-modal-box__title-text">' + esc(opts.title) + '</span></h1></header><div class="pf-v6-c-modal-box__body">' + opts.body + '</div><footer class="pf-v6-c-modal-box__footer">' + actions + '</footer></div></div></div>');
    root.innerHTML = ''; root.appendChild(m); U.openModal(m);
    $$('[data-alert-action]', m).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = opts.actions[+b.getAttribute('data-alert-action')];
        if (a.onClick) a.onClick(m, b); else U.closeModal(m);
      });
    });
    return m;
  }
  function failure(m, title, text, r) {
    U.closeModal(m);
    U.errorModal(title, text + (r ? ' ' + U.errorText(r) : ''));
  }

  // ---------------------------------------------------------------- remove access
  // DeleteRoleConfirmationModal: a role held directly is taken from the
  // user, one given to a team is taken from the team.
  $$('[data-access-remove]').forEach(function (b) {
    b.addEventListener('click', function () {
      var role = b.getAttribute('data-role-name'), teamID = b.getAttribute('data-team-id');
      var body = teamID
        ? esc(t('Are you sure you want to remove {0} access from {1}?  Doing so affects all members of the team.', { 0: role, 1: b.getAttribute('data-team-name') })) + '<br><br>' + esc(t('If you only want to remove access for this particular user, please remove them from the team.'))
        : esc(t('Are you sure you want to remove {0} access from {username}?', { 0: role, username: b.getAttribute('data-username') }));
      alertModal({ title: teamID ? t('Remove Team Access') : t('Remove User Access'), body: body, actions: [
        { label: t('Delete'), aria: t('Confirm delete'), cls: 'pf-m-danger', onClick: function (m, btn) {
          btn.disabled = true;
          var url = teamID ? '/api/v2/teams/' + teamID + '/roles/' : '/api/v2/users/' + b.getAttribute('data-user-id') + '/roles/';
          api('POST', url, { id: +b.getAttribute('data-role-id'), disassociate: true }).then(function (r) {
            if (r.ok) reload(); else failure(m, t('Error!'), t('Failed to delete role'), r);
          });
        } },
        { label: t('Cancel'), cls: 'pf-m-link' }
      ] });
    });
  });

  // A role on the user's or team's Roles tab.
  $$('[data-role-disassociate]').forEach(function (b) {
    b.addEventListener('click', function () {
      var kind = b.getAttribute('data-kind'), owner = b.getAttribute('data-owner');
      alertModal({ title: t('Disassociate role!'), variant: 'danger', aria: t('Disassociate role'),
        body: '<div>' + esc(t('This action will disassociate the following role from {0}:', { 0: b.getAttribute('data-resource-name') })) + '<br><strong>' + esc(b.getAttribute('data-role-name')) + '</strong></div>',
        actions: [
          { label: t('Disassociate'), aria: t('Confirm disassociate'), cls: 'pf-m-danger', onClick: function (m, btn) {
            btn.disabled = true;
            api('POST', '/api/v2/' + (kind === 'team' ? 'teams' : 'users') + '/' + owner + '/roles/', { id: +b.getAttribute('data-role-id'), disassociate: true }).then(function (r) {
              if (r.ok) reload(); else failure(m, t('Error!'), t('Failed to delete role.'), r);
            });
          } },
          { label: t('Cancel'), aria: t('Cancel'), cls: 'pf-m-link' }
        ] });
    });
  });

  // "N more" on a role chip group shows the rest.
  $$('[data-chip-overflow]').forEach(function (b) {
    b.addEventListener('click', function () {
      var group = b.closest('[data-chip-group]');
      var open = b.getAttribute('data-open') !== '1';
      $$('[data-chip-overflowed]', group).forEach(function (li) { li.hidden = !open; });
      b.setAttribute('data-open', open ? '1' : '0');
      $('.pf-v6-c-label__text', b).textContent = open ? t('Show less') : b.getAttribute('data-more');
    });
  });

  // ---------------------------------------------------------------- user teams
  // UserTeamList: Associate grants the member role of the chosen teams;
  // Disassociate removes all three team roles from the user.
  $$('[data-user-teams-associate]').forEach(function (b) {
    b.addEventListener('click', function () {
      var uid = b.getAttribute('data-user-id');
      U.lookupModal(document.createElement('div'), { resource: 'teams', title: t('Select Teams'), multi: true, onSelect: function (selected, m) {
        if (!selected.length) { U.closeModal(m); return; }
        Promise.all(selected.map(function (t) {
          return api('GET', '/api/v2/teams/' + t.id + '/').then(function (r) {
            var role = r.ok && r.data.summary_fields.object_roles.member_role;
            return role ? api('POST', '/api/v2/users/' + uid + '/roles/', { id: role.id }) : r;
          });
        })).then(function (results) {
          var bad = results.filter(function (r) { return !r.ok; })[0];
          if (bad) failure(m, t('Error!'), t('Failed to associate.'), bad); else reload();
        });
      } });
    });
  });
  $$('[data-user-teams-disassociate]').forEach(function (b) {
    var table = $('table[data-list-table]');
    function selectedRows() { return table ? $$('[data-select-row]:checked', table).map(function (c) { return c.closest('tr'); }) : []; }
    if (table) table.addEventListener('change', function () { b.disabled = selectedRows().length === 0; });
    b.addEventListener('click', function () {
      var rows = selectedRows(), uid = b.getAttribute('data-user-id');
      if (!rows.length) return;
      alertModal({ title: t('Disassociate related team(s)?'), variant: 'danger',
        body: '<div>' + esc(t('This action will disassociate all roles for this user from the selected teams.')) + '</div><br>' + rows.map(function (r) { return '<span><strong>' + esc(r.getAttribute('data-name')) + '</strong><br></span>'; }).join(''),
        actions: [
          { label: t('Disassociate'), aria: t('confirm disassociate'), cls: 'pf-m-danger', onClick: function (m, btn) {
            btn.disabled = true;
            var calls = [];
            rows.forEach(function (row) {
              var roles = JSON.parse(row.getAttribute('data-roles') || '{}');
              ['admin_role', 'member_role', 'read_role'].forEach(function (k) { if (roles[k]) calls.push(api('POST', '/api/v2/users/' + uid + '/roles/', { id: roles[k].id, disassociate: true })); });
            });
            Promise.all(calls).then(function (results) {
              var bad = results.filter(function (r) { return !r.ok; })[0];
              if (bad) failure(m, t('Error!'), t('Failed to disassociate one or more teams.'), bad); else reload();
            });
          } },
          { label: t('Cancel'), aria: t('Cancel'), cls: 'pf-m-link' }
        ] });
    });
  });

  // ---------------------------------------------------------------- wizard shell
  // The PatternFly wizard of AddResourceRole/UserAndTeamAccessAdd. steps
  // are {name, render(body), canNext(), next?: label}; save runs on the last.
  function wizard(opts) {
    var root = $('#ascender-modal-root');
    var current = 0, reached = 0;
    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(opts.title()) + '" aria-modal="true" class="pf-v6-c-modal-box pf-m-lg"><div class="pf-v6-c-wizard ascender-wizard" style="overflow: scroll;">'
      + '<div class="pf-v6-c-wizard__header"><div class="pf-v6-c-wizard__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-wiz-close><span class="pf-v6-c-button__icon">' + U.ICON.close + '</span></button></div><div class="pf-v6-c-wizard__title"><h2 class="pf-v6-c-wizard__title-text" data-wiz-title></h2></div></div>'
      + '<button class="pf-v6-c-wizard__toggle" aria-label="Wizard toggle" aria-expanded="false" type="button"><span class="pf-v6-c-wizard__toggle-list"><span class="pf-v6-c-wizard__toggle-list-item" data-wiz-toggle></span></span><span class="pf-v6-c-wizard__toggle-icon">' + (IC.caret || '') + '</span></button>'
      + '<div class="pf-v6-c-wizard__outer-wrap"><div class="pf-v6-c-wizard__inner-wrap"><nav class="pf-v6-c-wizard__nav" aria-label="Wizard steps"><ol class="pf-v6-c-wizard__nav-list" role="list" data-wiz-nav></ol></nav><div tabindex="-1" class="pf-v6-c-wizard__main" role="region" data-wiz-main><div class="pf-v6-c-wizard__main-body" data-wiz-body></div></div></div>'
      + '<footer class="pf-v6-c-wizard__footer"><div class="pf-v6-c-action-list"><div class="pf-v6-c-action-list__group"><div class="pf-v6-c-action-list__item"><button class="pf-v6-c-button pf-m-secondary" type="button" data-wiz-back><span class="pf-v6-c-button__text">' + esc(t('Back')) + '</span></button></div><div class="pf-v6-c-action-list__item"><button class="pf-v6-c-button pf-m-primary" type="submit" data-wiz-next><span class="pf-v6-c-button__text">' + esc(t('Next')) + '</span></button></div></div><div class="pf-v6-c-action-list__group"><div class="pf-v6-c-action-list__item"><button class="pf-v6-c-button pf-m-link" type="button" data-wiz-cancel><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button></div></div></div></footer>'
      + '</div></div></div></div></div>');
    root.innerHTML = ''; root.appendChild(m); U.openModal(m);
    var steps = opts.steps;
    function close() { U.closeModal(m); }
    $('[data-wiz-close]', m).addEventListener('click', close);
    $('[data-wiz-cancel]', m).addEventListener('click', close);
    function update() {
      // Next follows what the step allows, without rebuilding the step.
      var s = steps[current], last = current === steps.length - 1;
      var next = $('[data-wiz-next]', m);
      next.disabled = !s.canNext();
      $('.pf-v6-c-button__text', next).textContent = last ? t('Save') : (s.next || t('Next'));
      $('[data-wiz-back]', m).disabled = current === 0;
      $('[data-wiz-title]', m).textContent = opts.title();
      m.querySelector('[role=dialog]').setAttribute('aria-label', opts.title());
    }
    function render() {
      var s = steps[current];
      $('[data-wiz-nav]', m).innerHTML = steps.map(function (st, i) {
        var disabled = i > reached;
        return '<li class="pf-v6-c-wizard__nav-item"><button' + (disabled ? ' disabled' : '') + ' id="' + (i + 1) + '" class="pf-v6-c-wizard__nav-link' + (i === current ? ' pf-m-current' : '') + (disabled ? ' pf-m-disabled' : '') + '"' + (disabled ? ' aria-disabled="true"' : '') + ' aria-current="' + (i === current ? 'step' : 'false') + '" type="button" data-wiz-go="' + i + '"><span class="pf-v6-c-wizard__nav-link-main">' + esc(st.name) + '</span></button></li>';
      }).join('');
      $$('[data-wiz-go]', m).forEach(function (b) { b.addEventListener('click', function () { var i = +b.getAttribute('data-wiz-go'); if (i <= reached) { current = i; render(); } }); });
      $('[data-wiz-toggle]', m).innerHTML = '<span class="pf-v6-c-wizard__toggle-num">' + (current + 1) + '</span> ' + esc(s.name);
      $('[data-wiz-main]', m).setAttribute('aria-label', s.name + ' content');
      var body = $('[data-wiz-body]', m);
      body.innerHTML = '';
      s.render(body, update);
      update();
    }
    $('[data-wiz-back]', m).addEventListener('click', function () { if (current > 0) { current--; render(); } });
    $('[data-wiz-next]', m).addEventListener('click', function () {
      if (!steps[current].canNext()) return;
      if (current === steps.length - 1) {
        this.disabled = true;
        opts.save(m);
        return;
      }
      current++;
      if (current > reached) reached = current;
      render();
    });
    // Choosing again on step 1 forgets how far the wizard had got.
    return { render: render, resetReach: function () { reached = current; }, modal: m };
  }

  // ---------------------------------------------------------------- picker steps
  function cards(list, selectedKey, onPick, gridClass) {
    return (gridClass ? '<div class="' + gridClass + '">' : '') + list.map(function (c) {
      var sel = c.key === selectedKey;
      return '<div role="button" tabindex="0" data-cy="add-role-' + esc(c.cy || c.key) + '" class="ascender-selectable-card__item' + (sel ? ' ascender-selectable-card__item--selected' : '') + '" aria-label="' + esc(c.label) + '" data-card="' + esc(c.key) + '"><div class="ascender-selectable-card__indicator' + (sel ? ' ascender-selectable-card__indicator--selected' : '') + '"></div><div class="ascender-selectable-card__contents"><b>' + esc(c.label) + '</b><p class="ascender-selectable-card__description"></p></div></div>';
    }).join('') + (gridClass ? '</div>' : '');
  }
  function bindCards(body, onPick) {
    $$('[data-card]', body).forEach(function (c) {
      function pick() { onPick(c.getAttribute('data-card')); }
      c.addEventListener('click', pick);
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
  }
  function selectedChips(items, key, onRemove) {
    if (!items.length) return '';
    return '<div class="pf-v6-l-split ascender-selected-list__split"><div class="pf-v6-l-split__item ascender-selected-list__split-label-item">' + esc(t('Selected')) + '</div><div class="pf-v6-l-split__item"><div><div class="pf-v6-c-label-group"><div class="pf-v6-c-label-group__main"><ul class="pf-v6-c-label-group__list" aria-label="Label group category" role="list">'
      + items.map(function (it, i) { return '<li class="pf-v6-c-label-group__list-item"><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(it[key]) + '</span></span>' + (onRemove ? '<span class="pf-v6-c-label__actions"><button aria-label="Close ' + esc(it[key]) + '" class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button"' + (onRemove === 'inert' ? '' : ' data-unselect="' + i + '"') + '><span class="pf-v6-c-button__icon">' + (IC.close || U.ICON.close) + '</span></button></span>' : '') + '</span></li>'; }).join('')
      + '</ul></div></div></div></div></div>';
  }

  // SelectResourceStep: a searchable, sortable page of items with checkboxes
  // and the chosen ones as chips above.
  function resourceStep(conf, selected, onChange) {
    var state = { page: 1, search: '', key: conf.search[0].key, order: conf.sort[0].key };
    return function (body, update) {
      function draw() {
        var q = conf.api + '?page_size=5&page=' + state.page + '&order_by=' + encodeURIComponent(state.order) + (state.search ? '&' + state.key + '=' + encodeURIComponent(state.search) : '') + (conf.filter ? '&' + conf.filter : '');
        api('GET', q).then(function (r) {
          var results = r.ok ? r.data.results : [], count = r.ok ? r.data.count : 0;
          var pages = Math.max(1, Math.ceil(count / 5)), first = count ? (state.page - 1) * 5 + 1 : 0, last = Math.min(state.page * 5, count);
          var keyName = conf.search.filter(function (s) { return s.key === state.key; })[0].name;
          var html = '<div>' + esc(conf.intro) + '</div>' + selectedChips(selected, conf.display, true)
            + '<div class="pf-v6-c-toolbar" id="resource-list-toolbar"><div class="pf-v6-c-toolbar__content ascender-data-list-toolbar__content"><div class="pf-v6-c-toolbar__content-section"><div class="pf-v6-c-toolbar__group pf-m-toggle-group pf-m-show"><div class="pf-v6-c-toolbar__toggle"><button aria-haspopup="false" aria-label="Show Filters" class="pf-v6-c-button pf-m-plain" type="button"><span class="pf-v6-c-button__icon">' + (IC.filter || '') + '</span></button></div><div class="pf-v6-c-toolbar__item"><div class="pf-v6-c-toolbar__group pf-m-filter-group">'
            + '<div class="pf-v6-c-toolbar__item"><div class="ascender-dropdown"><button class="pf-v6-c-menu-toggle" type="button" aria-label="' + esc(t('Simple key select')) + '" aria-expanded="false" data-key-toggle><span class="pf-v6-c-menu-toggle__text">' + esc(keyName) + '</span><span class="pf-v6-c-menu-toggle__controls"><span class="pf-v6-c-menu-toggle__toggle-icon">' + (IC.caret || '') + '</span></span></button><div class="pf-v6-c-menu ascender-dropdown__menu" hidden data-key-menu><div class="pf-v6-c-menu__content"><ul class="pf-v6-c-menu__list" role="menu">' + conf.search.map(function (s) { return '<li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item" type="button" role="menuitem" data-key="' + esc(s.key) + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(s.name) + '</span></span></button></li>'; }).join('') + '</ul></div></div></div></div>'
            + '<div class="pf-v6-c-toolbar__item"><div class="pf-v6-c-input-group"><div class="pf-v6-c-input-group__item pf-m-fill"><span class="pf-v6-c-form-control"><input data-cy="search-text-input" aria-label="' + esc(t('Search text input')) + '" aria-invalid="false" type="search" value="' + esc(state.search) + '" data-res-search></span></div><div class="pf-v6-c-input-group__item"><div class="ascender-search__submit-button-wrapper' + (state.search ? '' : ' ascender-search__submit-button-wrapper--disabled') + '" data-res-go-wrap><button aria-label="' + esc(t('Search submit button')) + '" class="pf-v6-c-button pf-m-control"' + (state.search ? '' : ' disabled') + ' type="button" data-res-go><span class="pf-v6-c-button__icon">' + (IC.search || U.ICON.search) + '</span></button></div></div></div></div>'
            + '</div></div></div><div class="pf-v6-c-toolbar__group"></div><div class="pf-v6-c-toolbar__item pf-m-pagination" style="align-self: center;"><div class="pf-v6-c-pagination ascender-pagination--no-page-sizes" id="options-menu-top-pagination" style="--pf-v6-c-pagination__nav-page-select--c-form-control--width-chars: 2;"><div class="pf-v6-c-pagination__total-items"><b>' + first + ' - ' + last + '</b> ' + esc(t('of')) + ' <b>' + count + '</b> ' + esc(t('items')) + '</div><nav class="pf-v6-c-pagination__nav" aria-label="' + esc(t('Pagination')) + '"><div class="pf-v6-c-pagination__nav-control"><button data-action="previous" aria-label="' + esc(t('Go to previous page')) + '" class="pf-v6-c-button pf-m-plain"' + (state.page <= 1 ? ' disabled' : '') + ' type="button" data-res-page="' + (state.page - 1) + '"><span class="pf-v6-c-button__icon">' + (IC.left || '') + '</span></button></div><div class="pf-v6-c-pagination__nav-control"><button data-action="next" aria-label="' + esc(t('Go to next page')) + '" class="pf-v6-c-button pf-m-plain"' + (state.page >= pages ? ' disabled' : '') + ' type="button" data-res-page="' + (state.page + 1) + '"><span class="pf-v6-c-button__icon">' + (IC.right || '') + '</span></button></div></nav></div></div></div></div></div>';
          html += '<div class="ascender-paginated-table__overflow-auto"><table aria-label="' + esc(t('{pluralizedItemName} List', { pluralizedItemName: t('Items') })) + '" role="grid" class="pf-v6-c-table pf-m-grid-md pf-m-compact"><thead class="pf-v6-c-table__thead"><tr class="pf-v6-c-table__tr"><th tabindex="-1" scope="col" class="pf-v6-c-table__th ascender-header-row__th"><span class="pf-v6-u-screen-reader">' + esc(t('Row select')) + '</span></th>'
            + conf.columns.map(function (c) {
              var asc = state.order === c.key, desc = state.order === '-' + c.key;
              return '<th tabindex="-1" scope="col" class="pf-v6-c-table__th ascender-header-row__th pf-v6-c-table__sort' + (asc || desc ? ' pf-m-selected' : '') + '"' + (asc ? ' aria-sort="ascending"' : desc ? ' aria-sort="descending"' : '') + ' id="resource-table-sort-' + esc(c.key) + '"><button type="button" class="pf-v6-c-table__button" data-res-sort="' + esc(asc ? '-' + c.key : c.key) + '"><div class="pf-v6-c-table__button-content"><span class="pf-v6-c-table__text">' + esc(c.name) + '</span><span class="pf-v6-c-table__sort-indicator">' + (asc ? IC.up : desc ? IC.down : IC.sort) + '</span></div></button></th>';
            }).join('') + '</tr></thead><tbody role="rowgroup" class="pf-v6-c-table__tbody">'
            + results.map(function (it, i) {
              var on = selected.some(function (s) { return s.id === it.id; });
              return '<tr class="pf-v6-c-table__tr ascender-checkbox-list-item__cursor-default" id="list-item-' + it.id + '"><td tabindex="-1" data-label="' + esc(t('Selected')) + '" class="pf-v6-c-table__td pf-v6-c-table__check" id="check-action-item-' + it.id + '" name="' + esc(it[conf.display]) + '"><div class="pf-v6-c-check pf-m-standalone"><input id="select-' + i + '" class="pf-v6-c-check__input" aria-invalid="false" aria-label="Select row ' + i + '" type="checkbox"' + (on ? ' checked' : '') + ' data-res-row="' + i + '"></div></td>'
                + conf.columns.map(function (c) { return '<td tabindex="-1" data-label="' + esc(c.key) + '" class="pf-v6-c-table__td" aria-label="' + esc(c.name) + '" data-cy="item-' + it.id + '-' + esc(c.name) + '">' + esc(it[c.key] === undefined || it[c.key] === null ? '' : it[c.key]) + '</td>'; }).join('') + '</tr>';
            }).join('') + '</tbody></table></div>';
          if (count > 5) {
            html += '<div class="pf-v6-c-pagination pf-m-bottom ascender-pagination--no-page-sizes" id="options-menu-bottom-pagination" style="--pf-v6-c-pagination__nav-page-select--c-form-control--width-chars: 2;"><nav class="pf-v6-c-pagination__nav" aria-label="' + esc(t('Pagination')) + '">'
              + '<div class="pf-v6-c-pagination__nav-control pf-m-first"><button data-action="first" aria-label="' + esc(t('Go to first page')) + '" class="pf-v6-c-button pf-m-plain"' + (state.page <= 1 ? ' disabled' : '') + ' type="button" data-res-page="1"><span class="pf-v6-c-button__icon">' + (IC.first || '') + '</span></button></div>'
              + '<div class="pf-v6-c-pagination__nav-control"><button data-action="previous" aria-label="' + esc(t('Go to previous page')) + '" class="pf-v6-c-button pf-m-plain"' + (state.page <= 1 ? ' disabled' : '') + ' type="button" data-res-page="' + (state.page - 1) + '"><span class="pf-v6-c-button__icon">' + (IC.left || '') + '</span></button></div>'
              + '<div class="pf-v6-c-pagination__nav-page-select"><span class="pf-v6-c-form-control"><input aria-label="' + esc(t('Current page')) + '" min="1" max="' + pages + '" aria-invalid="false" type="number" value="' + state.page + '" data-res-page-input></span><span aria-hidden="true">' + esc(t('of')) + ' ' + pages + ' ' + esc(pages === 1 ? t('page') : t('pages')) + '</span></div>'
              + '<div class="pf-v6-c-pagination__nav-control"><button data-action="next" aria-label="' + esc(t('Go to next page')) + '" class="pf-v6-c-button pf-m-plain"' + (state.page >= pages ? ' disabled' : '') + ' type="button" data-res-page="' + (state.page + 1) + '"><span class="pf-v6-c-button__icon">' + (IC.right || '') + '</span></button></div>'
              + '<div class="pf-v6-c-pagination__nav-control pf-m-last"><button data-action="last" aria-label="' + esc(t('Go to last page')) + '" class="pf-v6-c-button pf-m-plain"' + (state.page >= pages ? ' disabled' : '') + ' type="button" data-res-page="' + pages + '"><span class="pf-v6-c-button__icon">' + (IC.last || '') + '</span></button></div></nav></div>';
          }
          body.innerHTML = html;
          $$('[data-res-row]', body).forEach(function (cb) {
            cb.addEventListener('change', function () {
              var it = results[+cb.getAttribute('data-res-row')];
              var idx = selected.findIndex(function (s) { return s.id === it.id; });
              if (cb.checked && idx < 0) selected.push(it); else if (!cb.checked && idx >= 0) selected.splice(idx, 1);
              onChange(); draw(); update();
            });
          });
          $$('[data-unselect]', body).forEach(function (x) { x.addEventListener('click', function () { selected.splice(+x.getAttribute('data-unselect'), 1); onChange(); draw(); update(); }); });
          $$('[data-res-page]', body).forEach(function (x) { x.addEventListener('click', function () { state.page = +x.getAttribute('data-res-page'); draw(); }); });
          var pi = $('[data-res-page-input]', body);
          if (pi) pi.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var n = Math.min(pages, Math.max(1, +pi.value || 1)); state.page = n; draw(); } });
          $$('[data-res-sort]', body).forEach(function (x) { x.addEventListener('click', function () { state.order = x.getAttribute('data-res-sort'); state.page = 1; draw(); }); });
          var input = $('[data-res-search]', body), go = $('[data-res-go]', body), wrap = $('[data-res-go-wrap]', body);
          input.addEventListener('input', function () { go.disabled = !input.value; wrap.classList.toggle('ascender-search__submit-button-wrapper--disabled', !input.value); });
          function search() { state.search = input.value; state.page = 1; draw(); }
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search(); } });
          go.addEventListener('click', search);
          var kt = $('[data-key-toggle]', body), km = $('[data-key-menu]', body);
          kt.addEventListener('click', function () { km.hidden = !km.hidden; kt.setAttribute('aria-expanded', km.hidden ? 'false' : 'true'); });
          $$('[data-key]', body).forEach(function (k) { k.addEventListener('click', function () { state.key = k.getAttribute('data-key'); km.hidden = true; $('.pf-v6-c-menu-toggle__text', kt).textContent = $('.pf-v6-c-menu__item-text', k).textContent; }); });
        });
      }
      draw();
    };
  }

  // SelectRoleStep: the roles as checkbox cards, two per row.
  function roleStep(intro, rolesFn, selectedResources, displayKey, chosen) {
    return function (body, update) {
      function draw() {
        var roles = rolesFn();
        var keys = Object.keys(roles);
        body.innerHTML = '<div>' + esc(intro) + '</div><div>' + selectedChips(selectedResources, displayKey, 'inert') + '</div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">'
          + keys.map(function (k) {
            var r = roles[k], on = chosen.some(function (c) { return c.id === r.id; });
            return '<div class="ascender-checkbox-card__wrapper"><div class="pf-v6-c-check ascender-checkbox-card__checkbox"><input id="checkbox-card-' + r.id + '" class="pf-v6-c-check__input" aria-invalid="false" aria-label="' + esc(r.name) + '" type="checkbox" value="' + r.id + '"' + (on ? ' checked' : '') + ' data-role-key="' + esc(k) + '"><label class="pf-v6-c-check__label" for="checkbox-card-' + r.id + '"><div style="font-weight: bold;">' + esc(r.name) + '</div><div>' + esc(r.description || '') + '</div></label></div></div>';
          }).join('') + '</div>';
        $$('[data-role-key]', body).forEach(function (cb) {
          cb.addEventListener('change', function () {
            var r = roles[cb.getAttribute('data-role-key')];
            var idx = chosen.findIndex(function (c) { return c.id === r.id; });
            if (cb.checked && idx < 0) chosen.push({ id: r.id, name: r.name }); else if (!cb.checked && idx >= 0) chosen.splice(idx, 1);
            update();
          });
        });
      }
      draw();
    };
  }

  var USER_COLS = { search: [{ name: t('Username'), key: 'username__icontains' }, { name: t('First Name'), key: 'first_name__icontains' }, { name: t('Last Name'), key: 'last_name__icontains' }],
    sort: [{ name: t('Username'), key: 'username' }], columns: [{ name: t('Username'), key: 'username' }, { name: t('First Name'), key: 'first_name' }, { name: t('Last Name'), key: 'last_name' }], display: 'username', api: '/api/v2/users/', filter: 'is_superuser=false' };
  var TEAM_COLS = { search: [{ name: t('Name'), key: 'name__icontains' }, { name: t('Created By (Username)'), key: 'created_by__username' }, { name: t('Modified By (Username)'), key: 'modified_by__username' }],
    sort: [{ name: t('Name'), key: 'name' }], columns: [{ name: t('Name'), key: 'name' }], display: 'name', api: '/api/v2/teams/' };
  var RESOURCE_INTRO = t("Choose the resources that will be receiving new roles.  You'll be able to select the roles to apply in the next step.  Note that the resources chosen here will receive all roles chosen in the next step.");
  var ROLE_INTRO = t('Choose roles to apply to the selected resources.  Note that all selected roles will be applied to all selected resources.');

  // ---------------------------------------------------------------- AddResourceRole
  $$('[data-access-add]').forEach(function (b) {
    b.addEventListener('click', function () {
      var roles = JSON.parse(b.getAttribute('data-roles') || '{}');
      var noTeams = b.getAttribute('data-no-teams') === 'true';
      var type = null, picked = [], chosen = [], w;
      function selectable() {
        var out = {};
        Object.keys(roles).forEach(function (k) { if (!(type === 'teams' && roles[k].user_only)) out[k] = roles[k]; });
        return out;
      }
      var resStep = null;
      w = wizard({
        title: function () { return type === 'users' ? t('Add User Roles') : type === 'teams' ? t('Add Team Roles') : t('Add Roles'); },
        steps: [
          { name: t('Select a Resource Type'), canNext: function () { return type !== null; }, render: function (body, update) {
            var list = [{ key: 'users', label: t('Users') }];
            if (!noTeams) list.push({ key: 'teams', label: t('Teams') });
            body.innerHTML = '<div style="display: flex; flex-wrap: wrap;"><div style="width: 100%; margin-bottom: 10px;">' + esc(t("Choose the type of resource that will be receiving new roles.  For example, if you'd like to add new roles to a set of users please choose Users and click Next.  You'll be able to select the specific resources in the next step.")) + '</div>' + cards(list, type) + '</div>';
            bindCards(body, function (k) {
              if (type !== k) { picked.length = 0; chosen.length = 0; resStep = null; w.resetReach(); }
              type = k; w.render();
            });
          } },
          { name: t('Select Items from List'), canNext: function () { return picked.length > 0; }, render: function (body, update) {
            if (!resStep) resStep = resourceStep(Object.assign({ intro: RESOURCE_INTRO }, type === 'users' ? USER_COLS : TEAM_COLS), picked, function () { chosen.length = 0; });
            resStep(body, update);
          } },
          { name: t('Select Roles to Apply'), canNext: function () { return chosen.length > 0; }, render: function (body, update) {
            roleStep(ROLE_INTRO, selectable, picked, type === 'users' ? 'username' : 'name', chosen)(body, update);
          } }
        ],
        save: function (m) {
          var calls = [];
          picked.forEach(function (res) {
            chosen.forEach(function (role) {
              calls.push(api('POST', '/api/v2/' + (type === 'users' ? 'users' : 'teams') + '/' + res.id + '/roles/', { id: role.id }));
            });
          });
          Promise.all(calls).then(function (results) {
            var bad = results.filter(function (r) { return !r.ok; })[0];
            if (bad) failure(m, t('Error!'), t('Failed to assign roles properly'), bad); else reload();
          });
        }
      });
      w.render();
    });
  });

  // ---------------------------------------------------------------- UserAndTeamAccessAdd
  var RESOURCE_TYPES = [
    { key: 'jobTemplate', label: t('Job templates'), api: '/api/v2/job_templates/', search: [{ name: t('Name'), key: 'name__icontains' }, { name: t('Playbook name'), key: 'playbook__icontains' }, { name: t('Created By (Username)'), key: 'created_by__username__icontains' }, { name: t('Modified By (Username)'), key: 'modified_by__username__icontains' }] },
    { key: 'workflowJobTemplate', label: t('Workflow job templates'), api: '/api/v2/workflow_job_templates/', search: [{ name: t('Name'), key: 'name__icontains' }, { name: t('Playbook name'), key: 'playbook__icontains' }, { name: t('Created By (Username)'), key: 'created_by__username__icontains' }, { name: t('Modified By (Username)'), key: 'modified_by__username__icontains' }] },
    { key: 'credential', label: t('Credentials'), api: '/api/v2/credentials/', search: [{ name: t('Name'), key: 'name__icontains' }, { name: t('Source Control URL'), key: 'scm_url__icontains' }, { name: t('Modified By (Username)'), key: 'modified_by__username__icontains' }, { name: t('Created By (Username)'), key: 'created_by__username__icontains' }] },
    { key: 'inventory', label: t('Inventories'), api: '/api/v2/inventories/', search: [{ name: t('Name'), key: 'name__icontains' }, { name: t('Created By (Username)'), key: 'created_by__username__icontains' }, { name: t('Modified By (Username)'), key: 'modified_by__username__icontains' }] },
    { key: 'project', label: t('Projects'), api: '/api/v2/projects/', search: [{ name: t('Name'), key: 'name__icontains' }, { name: t('Source Control URL'), key: 'scm_url__icontains' }, { name: t('Modified By (Username)'), key: 'modified_by__username__icontains' }, { name: t('Created By (Username)'), key: 'created_by__username__icontains' }] },
    { key: 'organization', label: t('Organizations'), api: '/api/v2/organizations/', search: [{ name: t('Name'), key: 'name__icontains' }, { name: t('Created By (Username)'), key: 'created_by__username__icontains' }, { name: t('Modified By (Username)'), key: 'modified_by__username__icontains' }] },
    { key: 'instanceGroup', label: t('Instance Groups'), api: '/api/v2/instance_groups/', search: [{ name: t('Name'), key: 'name__icontains' }, { name: t('Created By (Username)'), key: 'created_by__username__icontains' }, { name: t('Modified By (Username)'), key: 'modified_by__username__icontains' }] }
  ];
  $$('[data-roles-add]').forEach(function (b) {
    b.addEventListener('click', function () {
      var kind = b.getAttribute('data-kind'), owner = b.getAttribute('data-owner');
      var rt = null, picked = [], chosen = [], resStep = null, w;
      function selectable() {
        var first = picked[0], out = {};
        var roles = (first && first.summary_fields && first.summary_fields.object_roles) || {};
        Object.keys(roles).forEach(function (k) { if (!(kind === 'team' && first.type === 'organization' && roles[k].user_only)) out[k] = roles[k]; });
        return out;
      }
      w = wizard({
        title: function () { return kind === 'team' ? t('Add team permissions') : t('Add user permissions'); },
        steps: [
          { name: t('Add resource type'), canNext: function () { return rt !== null; }, render: function (body) {
            body.innerHTML = cards(RESOURCE_TYPES.map(function (t) { return { key: t.key, label: t.label }; }), rt && rt.key, null, 'ascender-user-and-team-access-add__grid');
            bindCards(body, function (k) {
              var next = RESOURCE_TYPES.filter(function (t) { return t.key === k; })[0];
              if (rt !== next) { picked.length = 0; chosen.length = 0; resStep = null; w.resetReach(); }
              rt = next; w.render();
            });
          } },
          { name: t('Select items from list'), canNext: function () { return picked.length > 0; }, render: function (body, update) {
            if (!resStep) resStep = resourceStep({ intro: RESOURCE_INTRO, search: rt.search, sort: [{ name: t('Name'), key: 'name' }], columns: [{ name: t('Name'), key: 'name' }], display: 'name', api: rt.api }, picked, function () { chosen.length = 0; });
            resStep(body, update);
          } },
          // UserAndTeamAccessAdd let Save run with no role chosen.
          { name: t('Select roles to apply'), canNext: function () { return true; }, render: function (body, update) {
            roleStep(ROLE_INTRO, selectable, picked, 'name', chosen)(body, update);
          } }
        ],
        save: function (m) {
          // Every selected resource gets the chosen roles, matched by name.
          var calls = [];
          picked.forEach(function (res) {
            var roles = (res.summary_fields && res.summary_fields.object_roles) || {};
            chosen.forEach(function (role) {
              Object.keys(roles).forEach(function (k) {
                if (roles[k].name === role.name) calls.push(api('POST', '/api/v2/' + (kind === 'team' ? 'teams' : 'users') + '/' + owner + '/roles/', { id: roles[k].id }));
              });
            });
          });
          Promise.all(calls).then(function (results) {
            var bad = results.filter(function (r) { return !r.ok; })[0];
            if (bad) failure(m, t('Error!'), t('Failed to associate role'), bad); else reload();
          });
        }
      });
      w.render();
    });
  });

  // ---------------------------------------------------------------- user form
  var userForm = $('form[data-user-form]');
  if (userForm) {
    $$('[data-toggle-password]', userForm).forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = $('[data-secret-input]', b.closest('[data-secret-group]'));
        var show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
        $('[data-icon-show]', b).hidden = show; $('[data-icon-hide]', b).hidden = !show; U.setTooltip(b, show ? t('Hide') : t('Show'));
      });
    });
    // The theme select previews the theme, as UserForm's applyTheme did.
    var theme = $('[data-theme-preview]', userForm);
    if (theme && U.applyTheme) theme.addEventListener('change', function () { U.applyTheme(theme.value); });
  }
})();
