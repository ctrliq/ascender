/* Advanced search: the "Advanced" key every list toolbar offered
   (DataListToolbar, Search, AdvancedSearch, LookupTypeInput,
   RelatedLookupTypeInput), and the search group the smart inventory host
   filter builder reuses. Plain JavaScript on the helpers app.js exports. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, el = U.el, esc = U.esc, api = U.api;
  var IC = Object.assign({}, U.ICON, (window.ASCENDER || {}).icons || {});
  var DOCS = '/docs/user-guide/user-interface/#search';

  // ------------------------------------------------------------ popper menus
  // Select's menus were appended to the body and placed under their toggle
  // (bottom-start, or bottom-end for the actions kebab), no narrower than it.
  var openMenu = null;
  function closeMenu() { if (openMenu) { var m = openMenu; openMenu = null; m.remove(); if (m._onClose) m._onClose(); } }
  function placeMenu(menu, anchor, end) {
    var r = anchor.getBoundingClientRect();
    menu.style.cssText = 'position: absolute; inset: 0px auto auto 0px; z-index: 9999; opacity: 1; transition: opacity cubic-bezier(0.54, 1.5, 0.38, 1.11); min-width: ' + r.width + 'px;';
    document.body.appendChild(menu);
    var x = r.left + window.scrollX, y = r.bottom + window.scrollY;
    if (end) x = r.right + window.scrollX - menu.offsetWidth;
    menu.style.transform = 'translate(' + Math.round(x) + 'px, ' + Math.round(y) + 'px)';
  }
  function showMenu(menu, anchor, end, onClose) {
    closeMenu();
    menu._onClose = onClose;
    placeMenu(menu, anchor, end);
    openMenu = menu;
    menu._anchor = anchor;
  }
  document.addEventListener('mousedown', function (e) {
    if (openMenu && !openMenu.contains(e.target) && !(openMenu._anchor && openMenu._anchor.contains(e.target))) closeMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  function optionHTML(o, first) {
    return '<li class="pf-v6-c-menu__list-item' + (o.disabled ? ' pf-m-disabled' : '') + '" role="none"><button' + (o.id ? ' id="' + esc(o.id) + '"' : '') + ' tabindex="' + (first ? '0' : '-1') + '" class="pf-v6-c-menu__item"' + (o.disabled ? ' disabled' : '') + ' role="option" aria-selected="false" type="button" data-value="' + esc(o.value) + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(o.label || o.value) + '</span></span>' + (o.description ? '<span class="pf-v6-c-menu__item-description"><span>' + esc(o.description) + '</span></span>' : '') + '</button></li>';
  }

  // ------------------------------------------------------------ typeahead select
  // A Select with a typeahead MenuToggle: typing filters the options, the
  // clear button empties it, picking an option closes it.
  function typeahead(o) {
    var st = { value: null, filter: '', open: false, disabled: false };
    var tog = el('<div class="pf-v6-c-menu-toggle pf-m-typeahead"><div class="pf-v6-c-text-input-group pf-m-plain"><div class="pf-v6-c-text-input-group__main" autocomplete="off"><span class="pf-v6-c-text-input-group__text"><input class="pf-v6-c-text-input-group__text-input" aria-label="' + esc(o.label) + '" placeholder="' + esc(o.placeholder) + '" type="text" value=""></span></div></div><button type="button" class="pf-v6-c-menu-toggle__button" aria-expanded="false" aria-label="Menu toggle" tabindex="-1"><span class="pf-v6-c-menu-toggle__controls"><span class="pf-v6-c-menu-toggle__toggle-icon">' + (IC.caret || '') + '</span></span></button></div>');
    var input = $('input', tog), group = $('.pf-v6-c-text-input-group', tog), btn = $('.pf-v6-c-menu-toggle__button', tog);
    function cls() {
      tog.className = ['pf-v6-c-menu-toggle', st.open ? 'pf-m-expanded' : '', st.disabled ? 'pf-m-disabled' : '', o.cls || '', 'pf-m-typeahead'].filter(Boolean).join(' ');
      btn.setAttribute('aria-expanded', st.open ? 'true' : 'false');
      btn.disabled = st.disabled;
    }
    function sync() {
      cls();
      if (input.value !== (st.filter || st.value || '')) input.value = st.filter || st.value || '';
      var utils = $('.pf-v6-c-text-input-group__utilities', group);
      if ((st.filter || st.value) && !utils) {
        utils = el('<div class="pf-v6-c-text-input-group__utilities"><button aria-label="' + esc(t('Clear')) + '" class="pf-v6-c-button pf-m-plain" type="button"><span class="pf-v6-c-button__icon">' + IC.times + '</span></button></div>');
        group.appendChild(utils);
        $('button', utils).addEventListener('click', function (e) { e.stopPropagation(); st.filter = ''; set(null, true); });
      } else if (!(st.filter || st.value) && utils) utils.remove();
    }
    function menuHTML() {
      var opts = o.options().filter(function (x) { return !st.filter || String(x.value).toLowerCase().indexOf(st.filter.toLowerCase()) >= 0; });
      var body;
      if (!opts.length) body = optionHTML({ value: 'no-results', label: t('No results found'), disabled: true }, true);
      else if (opts.some(function (x) { return x.group; })) {
        // Key select: direct keys, a divider, then related keys.
        var groups = [], first = true;
        ['Direct Keys', 'Related Keys'].forEach(function (g) {
          var in_ = opts.filter(function (x) { return x.group === g; });
          if (!in_.length) return;
          groups.push('<section class="pf-v6-c-menu__group"><h1 class="pf-v6-c-menu__group-title">' + g + '</h1>' + in_.map(function (x) { var h = optionHTML(x, first); first = false; return h; }).join('') + '</section>');
        });
        body = groups.join('<hr class="pf-v6-c-divider">');
      } else body = opts.map(function (x, i) { return optionHTML(x, i === 0); }).join('');
      return '<div' + (o.menuId ? ' id="' + o.menuId + '"' : '') + ' class="pf-v6-c-menu' + (o.menuCls ? ' ' + o.menuCls : '') + '"' + (o.menuLabel ? ' aria-label="' + esc(o.menuLabel) + '"' : '') + '><div class="pf-v6-c-menu__content"><ul role="listbox" aria-multiselectable="false" class="pf-v6-c-menu__list" style="' + (o.listStyle || 'max-height: 300px; overflow: auto;') + '">' + body + '</ul></div></div>';
    }
    var menu = null;
    function render() {
      if (!st.open) return;
      var m = el(menuHTML());
      m.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-value]');
        if (!b || b.disabled) return;
        st.filter = ''; close(); set(b.getAttribute('data-value'), true);
      });
      if (menu && openMenu === menu) { menu.replaceWith(m); m._onClose = menu._onClose; m._anchor = tog; openMenu = m; placeMenu(m, tog); }
      else showMenu(m, tog, false, function () { st.open = false; st.filter = ''; sync(); });
      menu = m;
    }
    function open() { if (st.disabled || st.open) return; st.open = true; sync(); render(); }
    function close() { if (menu && openMenu === menu) closeMenu(); st.open = false; st.filter = ''; sync(); }
    function set(v, user) { st.value = v; sync(); if (user && o.onChange) o.onChange(v); }
    input.addEventListener('click', open);
    input.addEventListener('input', function () { st.filter = input.value; if (!st.open) open(); else { sync(); render(); } });
    btn.addEventListener('click', function () { if (st.open) close(); else open(); });
    cls();
    return {
      el: tog,
      get: function () { return st.value; },
      set: function (v) { set(v, false); },
      disable: function (d) { st.disabled = d; if (d && st.open) close(); sync(); },
    };
  }

  // ------------------------------------------------------------ AdvancedSearch
  var LOOKUPS = [ // descriptions are messages, translated where shown
    ['exact', 'Exact match (default lookup if not specified).', function () { return true; }],
    ['iexact', 'Case-insensitive version of exact.', function (t) { return t === 'string'; }],
    ['contains', 'Field contains value.', function (t) { return t === 'string'; }],
    ['icontains', 'Case-insensitive version of contains', function (t) { return t === 'string'; }],
    ['startswith', 'Field starts with value.', function (t) { return t !== 'datetime'; }],
    ['istartswith', 'Case-insensitive version of startswith.', function (t) { return t !== 'datetime'; }],
    ['endswith', 'Field ends with value.', function (t) { return t !== 'datetime'; }],
    ['iendswith', 'Case-insensitive version of endswith.', function (t) { return t !== 'datetime'; }],
    ['regex', 'Field matches the given regular expression.', function () { return true; }],
    ['iregex', 'Case-insensitive version of regex.', function () { return true; }],
    ['gt', 'Greater than comparison.', function (t) { return t !== 'json'; }],
    ['gte', 'Greater than or equal to comparison.', function (t) { return t !== 'json'; }],
    ['lt', 'Less than comparison.', function (t) { return t !== 'json'; }],
    ['lte', 'Less than or equal to comparison.', function (t) { return t !== 'json'; }],
    ['isnull', 'Check whether the given field or related object is null; expects a boolean value.', function () { return true; }],
    ['in', "Check whether the given field's value is present in the list provided; expects a comma-separated list of items.", function () { return true; }],
  ];

  // advancedSearch builds the search group. opts: keys() → {searchable:
  // [{key,type}], related: [key]}, onSearch(key, value), negative (bool),
  // fuzzy (bool), onAnsibleFacts(bool), factsLocked() (an ansible_facts
  // filter already set while editing a host filter), state (to restore).
  function advancedSearch(opts) {
    var negative = opts.negative !== false, fuzzy = opts.fuzzy !== false;
    var root = el('<div class="ascender-advanced-search__group"></div>');
    var value = '';
    function keys() { return opts.keys() || { searchable: [], related: [] }; }
    function directKey(k) { return keys().searchable.filter(function (x) { return x.key === k; })[0]; }
    function isRelated(k) { return k && keys().related.indexOf(k) >= 0 && !directKey(k); }

    var prefix = typeahead({ label: t('Set type typeahead'), placeholder: t('Set type'), menuCls: 'setTypeSelect', menuLabel: t('Set type select'), options: function () {
      var o = [{ id: 'and-option-select', value: 'and', description: t('Returns results that satisfy this one as well as other filters.  This is the default set type if nothing is selected.') }, { id: 'or-option-select', value: 'or', description: t('Returns results that satisfy this one or any other filters.') }];
      if (negative) o.push({ id: 'not-option-select', value: 'not', description: t('Returns results that have values other than this one as well as other filters.') });
      return o;
    } });
    var key = typeahead({ label: t('Key typeahead'), placeholder: t('Key'), menuCls: 'keySelect', menuLabel: t('Key select'), options: function () {
      var k = keys(), direct = k.searchable.map(function (x) { return x.key; });
      return direct.map(function (x) { return { id: 'select-option-' + x, value: x, group: 'Direct Keys' }; })
        .concat(k.related.filter(function (x) { return direct.indexOf(x) < 0; }).map(function (x) { return { id: 'select-option-' + x, value: x, group: 'Related Keys' }; }));
    }, onChange: function () { keyChanged(); } });
    var lookup = typeahead({ label: t('Lookup typeahead'), placeholder: t('Lookup type'), cls: 'lookupSelect', menuId: 'set-lookup-typeahead', listStyle: 'max-height: 300px; overflow-y: auto;', options: function () {
      var ty = (directKey(key.get()) || {}).type || 'string';
      return LOOKUPS.filter(function (l) { return l[2](ty); }).map(function (l) { return { id: l[0] + '-option-select', value: l[0], description: t(l[1]) }; });
    }, onChange: function () { lookupChanged(); } });
    var related = typeahead({ label: t('Related search type typeahead'), placeholder: t('Related search type'), cls: 'lookupSelect', menuId: 'set-lookup-typeahead', listStyle: 'max-height: 300px; overflow-y: auto;', options: function () {
      var o = [{ id: 'name-option-select', value: 'name__icontains', description: t('Fuzzy search on name field.') }, { id: 'name-exact-option-select', value: 'name', description: t('Exact search on name field.') }, { id: 'id-option-select', value: 'id', description: t('Exact search on id field.') }];
      if (fuzzy) o.push({ id: 'search-option-select', value: 'search', description: t('Fuzzy search on id, name or description fields.') });
      return o;
    }, onChange: function () { lookupChanged(); } });
    var prefixWrap = el('<div style="display: contents;"></div>');
    var inputGroup = el('<div class="pf-v6-c-input-group"><span class="pf-v6-c-form-control"><input data-cy="advanced-search-text-input" aria-label="' + esc(t('Advanced search value input')) + '" aria-invalid="false" type="search" value=""></span><div class="pf-v6-c-input-group__item"><div class="ascender-advanced-search__submit-button-wrapper ascender-advanced-search__submit-button-wrapper--disabled"><button aria-label="' + esc(t('Search submit button')) + '" class="pf-v6-c-button pf-m-control" disabled type="button"><span class="pf-v6-c-button__icon">' + IC.search + '</span></button></div></div></div>');
    var input = $('input', inputGroup), submit = $('button', inputGroup), submitWrap = $('.ascender-advanced-search__submit-button-wrapper', inputGroup), control = $('.pf-v6-c-form-control', inputGroup);
    var docs = el('<div style="display: contents;"><a target="_blank" href="' + DOCS + '" rel="noopener noreferrer" class="pf-v6-c-button pf-m-plain" data-tooltip="' + esc(t('Advanced search documentation')) + '" data-tooltip-pos="bottom"><span class="pf-v6-c-button__icon">' + (IC.questionCircle || '') + '</span></a></div>');

    function lookupSel() { return isRelated(key.get()) ? related : lookup; }
    function layout() {
      var k = key.get(), facts = k === 'ansible_facts';
      root.innerHTML = '';
      if (!facts) {
        // Set type is disabled, behind a tooltip, for a related fuzzy search.
        var fuzzySearch = lookupSel().get() === 'search';
        prefixWrap.innerHTML = '';
        prefixWrap.appendChild(prefix.el);
        prefix.disable(fuzzySearch);
        if (fuzzySearch) { prefix.el.setAttribute('data-tooltip', t('Set type disabled for related search field fuzzy searches')); prefix.el.setAttribute('data-tooltip-pos', 'top'); } else { U.clearTooltip(prefix.el); }
        root.appendChild(fuzzySearch ? prefixWrap : prefix.el);
      }
      root.appendChild(key.el);
      if (!facts) root.appendChild(lookupSel().el);
      root.appendChild(inputGroup);
      root.appendChild(docs);
      syncInput();
    }
    function locked() { return key.get() === 'ansible_facts' && opts.factsLocked && opts.factsLocked(); }
    function syncInput() {
      var k = key.get(), dis = !k || locked();
      input.disabled = dis;
      control.classList.toggle('pf-m-disabled', dis);
      input.value = !k ? t('First, select a key') : value;
      if (k === 'labels' && lookupSel().get() === 'search') input.placeholder = 'e.g. label_1,label_2'; else input.removeAttribute('placeholder');
      if (locked()) { control.setAttribute('data-tooltip', t('Remove the current search related to ansible facts to enable another search using this key.')); control.setAttribute('data-tooltip-pos', 'top'); } else U.clearTooltip(control);
      var empty = !value;
      submit.disabled = empty;
      submitWrap.classList.toggle('ascender-advanced-search__submit-button-wrapper--disabled', empty);
    }
    function keyChanged() {
      var k = key.get();
      if (k === 'ansible_facts') prefix.set(null);
      if (opts.onAnsibleFacts) opts.onAnsibleFacts(k === 'ansible_facts');
      lookup.set(null);
      related.set(isRelated(k) && k !== 'ansible_facts' ? 'name__icontains' : null);
      layout();
    }
    function lookupChanged() {
      if (lookupSel().get() === 'search') prefix.set(null);
      layout();
    }
    input.addEventListener('input', function () { value = input.value; syncInput(); });
    function doSearch() {
      if (!value) return;
      var p = prefix.get() === 'and' ? null : prefix.get();
      var k = key.get();
      var actual = [p, k, k === 'ansible_facts' ? null : lookupSel().get()].filter(Boolean).join('__');
      var v = value;
      value = ''; syncInput();
      if (k === 'ansible_facts') opts.onSearch('host_filter', actual + '__' + v, state());
      else opts.onSearch(actual, v, state());
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
    submit.addEventListener('click', function (e) { e.preventDefault(); doSearch(); });
    function state() { return { prefix: prefix.get(), key: key.get(), lookup: lookup.get(), related: related.get() }; }
    if (opts.state) {
      prefix.set(opts.state.prefix || null); key.set(opts.state.key || null);
      lookup.set(opts.state.lookup || null); related.set(opts.state.related || null);
      if (opts.onAnsibleFacts) opts.onAnsibleFacts(opts.state.key === 'ansible_facts');
    }
    layout();
    return { el: root, refresh: syncInput, state: state };
  }

  // searchableKeys is getSearchableKeys plus the related search fields, out
  // of a list's OPTIONS.
  var keyCache = {};
  function searchableKeys(url) {
    if (!url) return Promise.resolve({ searchable: [], related: [] });
    if (!keyCache[url]) keyCache[url] = api('OPTIONS', url).then(function (r) {
      var get = (r.ok && r.data && r.data.actions && r.data.actions.GET) || {};
      return {
        searchable: Object.keys(get).filter(function (k) { return get[k] && get[k].filterable; }).map(function (k) { return { key: k, type: get[k].type }; }),
        related: ((r.ok && r.data && r.data.related_search_fields) || []).map(function (f) { return f.indexOf('__search') !== -1 ? f.slice(0, -8) : f; }),
      };
    });
    return keyCache[url];
  }

  // ------------------------------------------------------------ list toolbars
  // DataListToolbar with the Advanced key chosen: the search group takes the
  // input's place, the toolbar's controls fold into an Actions kebab and
  // the pagination goes.
  function kebabItems(actions) {
    var items = [];
    $$('.pf-v6-c-toolbar__item', actions).forEach(function (item) {
      var c = $('a.pf-v6-c-button, button.pf-v6-c-button, button.pf-v6-c-menu-toggle', item);
      if (!c) return;
      var text = (c.textContent || '').trim();
      items.push({ el: c, text: text, href: c.tagName === 'A' ? c.getAttribute('href') : null, disabled: c.disabled, tip: !!c.closest('[data-tooltip]') });
    });
    return items;
  }
  function enterAdvanced(form, restore) {
    if (form._advanced) return;
    var toolbar = form.closest('.pf-v6-c-toolbar'), section = form.closest('.pf-v6-c-toolbar__content-section');
    var simpleItem = $('[data-search-input]', form).closest('.pf-v6-c-toolbar__item');
    var keyItem = $('[data-dropdown]', form) && $('[data-dropdown]', form).closest('.pf-v6-c-toolbar__item');
    var actions = $('[data-toolbar-actions]', toolbar), pager = $('[data-toolbar-pagination]', toolbar);
    var label = $('[data-search-key-label]', form); if (label) label.textContent = t('Advanced');
    form._key = 'advanced';
    simpleItem.hidden = true;
    var ns = form.getAttribute('data-ns'), keys = { searchable: [], related: [] };
    var adv = advancedSearch({
      keys: function () { return keys; },
      state: restore,
      onSearch: function (k, v, st) {
        try { sessionStorage.setItem('ascender.advancedSearch', JSON.stringify({ path: location.pathname, ns: ns, state: st })); } catch (e) { /* storage off */ }
        var params = new URLSearchParams(location.search);
        params.delete('page'); params.delete((ns ? ns + '.' : '') + 'page');
        params.append((ns ? ns + '.' : '') + k, v);
        location.search = params.toString();
      },
    });
    searchableKeys(form.getAttribute('data-options-api')).then(function (k) { keys = k; });
    var item = el('<div class="pf-v6-c-toolbar__item" data-advanced-item></div>');
    item.appendChild(adv.el);
    keyItem.parentNode.insertBefore(item, keyItem.nextSibling);
    var kebab = null;
    if (actions) {
      actions.hidden = true;
      if (kebabItems(actions).length) {
        kebab = el('<div class="pf-v6-c-toolbar__item" data-advanced-kebab><button class="pf-v6-c-menu-toggle pf-m-plain" type="button" aria-label="' + esc(t('Actions')) + '" aria-expanded="false" data-cy="actions-kebab-toogle"><span class="pf-v6-c-menu-toggle__text">' + (IC.ellipsisV || '') + '</span></button></div>');
        actions.parentNode.insertBefore(kebab, actions);
        var kb = $('button', kebab);
        kb.addEventListener('click', function () {
          if (openMenu && openMenu._anchor === kb) { closeMenu(); return; }
          var list = kebabItems(actions);
          var m = el('<div class="pf-v6-c-menu"><div class="pf-v6-c-menu__content"><ul role="menu" class="pf-v6-c-menu__list">' + list.map(function (it, i) {
            var li = it.href
              ? '<li class="pf-v6-c-menu__list-item" role="none"><a tabindex="' + (i ? -1 : 0) + '" class="pf-v6-c-menu__item" role="menuitem" href="' + esc(it.href) + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(it.text) + '</span></span></a></li>'
              : '<li class="pf-v6-c-menu__list-item' + (it.disabled ? ' pf-m-disabled' : '') + '" role="none"><button tabindex="' + (i ? -1 : 0) + '" class="pf-v6-c-menu__item"' + (it.disabled ? ' disabled' : '') + ' role="menuitem" type="button" data-kebab-index="' + i + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(it.text) + '</span></span></button></li>';
            return it.tip ? '<div style="display: contents;">' + li + '</div>' : li;
          }).join('') + '</ul></div></div>');
          m.addEventListener('click', function (e) {
            var b = e.target.closest('button[data-kebab-index]');
            if (!b || b.disabled) return;
            closeMenu();
            list[Number(b.getAttribute('data-kebab-index'))].el.click();
          });
          kb.setAttribute('aria-expanded', 'true');
          showMenu(m, kb, true, function () { kb.setAttribute('aria-expanded', 'false'); });
        });
      }
    }
    if (pager) pager.hidden = true;
    form._advanced = { item: item, kebab: kebab, simpleItem: simpleItem, actions: actions, pager: pager };
  }
  function leaveAdvanced(form) {
    var a = form._advanced; if (!a) return;
    closeMenu();
    a.item.remove(); if (a.kebab) a.kebab.remove();
    a.simpleItem.hidden = false;
    if (a.actions) a.actions.hidden = false;
    if (a.pager) a.pager.hidden = false;
    form._advanced = null;
  }
  $$('[data-search-form]').forEach(function (form) {
    var input = $('[data-search-input]', form);
    form._key = input.name;
    // The key menu leaves out the key already chosen.
    var toggle = $('[data-dropdown-toggle]', form);
    if (toggle) toggle.addEventListener('click', function () {
      $$('[data-search-key]', form).forEach(function (b) { b.closest('.pf-v6-c-menu__list-item').hidden = b.getAttribute('data-search-key') === form._key; });
    }, true);
    $$('[data-search-key]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-search-key');
        if (k === 'advanced') { enterAdvanced(form); return; }
        leaveAdvanced(form);
        form._key = k;
      });
    });
    // After an advanced search the toolbar stays on Advanced with the same
    // selections, as the old Search component's state did.
    try {
      var saved = JSON.parse(sessionStorage.getItem('ascender.advancedSearch') || 'null');
      if (saved && saved.path === location.pathname && saved.ns === form.getAttribute('data-ns') && $('[data-search-key="advanced"]', form)) {
        sessionStorage.removeItem('ascender.advancedSearch');
        enterAdvanced(form, saved.state);
      }
    } catch (e) { /* storage off */ }
  });

  U.advancedSearch = advancedSearch;
  U.searchableKeys = searchableKeys;
  U.typeahead = typeahead;
})();
