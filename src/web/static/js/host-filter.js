/* The smart inventory host filter builder: HostFilterLookup and its
   HostFilterUtils. The field shows the filter as chips; its modal searches
   the organization's hosts and turns the search into the filter. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, el = U.el, esc = U.esc, api = U.api;
  var IC = Object.assign({}, U.ICON, (window.ASCENDER || {}).icons || {});
  var NS = 'smart_hosts';
  var DEFAULTS = { page: 1, page_size: 5, order_by: 'name', not__inventory__kind: 'constructed' };
  var INTEGER = ['id', 'page', 'page_size', 'inventory'];
  var COLUMNS = [
    { name: t('Name'), key: 'name__icontains', isDefault: true },
    { name: t('ID'), key: 'id' },
    { name: t('Group'), key: 'groups__name__icontains' },
    { name: t('Inventory ID'), key: 'inventory' },
    { name: t('Enabled'), key: 'enabled', isBoolean: true },
    { name: t('Instance ID'), key: 'instance_id' },
    { name: t('Last job'), key: 'last_job' },
  ];

  // ------------------------------------------------------------ HostFilterUtils
  // Params are kept as an object of key → string or array of strings, in
  // the order their keys first appeared.
  function addParam(obj, k, v) {
    if (obj[k] === undefined) obj[k] = v;
    else if (Array.isArray(obj[k])) obj[k] = obj[k].concat([v]);
    else obj[k] = [obj[k], v];
  }
  function toSearchParams(string) {
    if (!string) return {};
    var readable = string.replace(/^\?/, '').replace(/&/g, ' and ');
    var orArr = readable.split(/ or /);
    if (orArr.length > 1) orArr = orArr.map(function (s) { return 'or__' + s; });
    var out = {};
    orArr.join(' and ').split(/ and | or /).map(function (s) { return s.split('='); }).forEach(function (kv) {
      var k = kv[0], v = kv[1];
      var key = safeDecode(k), value = safeDecode(v ? v.replace(/"/g, '') : '');
      addParam(out, key, value);
    });
    return out;
  }
  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function escapeString(key, value) { return (value.trim().indexOf(' ') >= 0 || key.indexOf('regex') !== -1) ? '"' + value + '"' : value; }
  function toHostFilter(params) {
    var flat = [];
    Object.keys(params).sort().forEach(function (key) {
      var value = params[key];
      (Array.isArray(value) ? value : [value]).forEach(function (val) { flat.push(key + '=' + escapeString(key, String(val))); });
    });
    var plain = flat.filter(function (e) { return e.indexOf('or__') === -1; });
    var cond = flat.filter(function (e) { return plain.indexOf(e) === -1; }).map(function (e) { return e.replace('or__', 'or '); }).join(' ').trim();
    if (!plain.length && cond) return cond.slice(3);
    if (cond) return plain.join(' and ').concat(' ', cond);
    return plain.join(' and ').trim();
  }
  function modifyHostFilter(value, obj) {
    if (value.indexOf('host_filter=') === -1) return obj;
    var out = {}, hf = {};
    value.split(' ').forEach(function (item) { if (item.indexOf('host_filter') !== -1) hf.host_filter = item.slice('host_filter='.length); });
    Object.keys(obj).forEach(function (k) { if (k.indexOf('host_filter') === -1) out[k] = obj[k]; });
    if (hf.host_filter !== undefined) out.host_filter = hf.host_filter;
    return out;
  }
  function removeHostFilter(filter) {
    if ('host_filter' in filter) { filter.ansible_facts = String(filter.host_filter).substring('ansible_facts__'.length); delete filter.host_filter; }
    return filter;
  }
  // buildChips: one group per key (or__ folded in), its values as chips.
  function buildChips(filter) {
    var out = {};
    Object.keys(filter).forEach(function (param) {
      var parsed = param.replace('or__', ''), value = filter[param];
      out[parsed] = { key: parsed, chips: (Array.isArray(value) ? value : [value]).map(function (v) { return String(v); }) };
    });
    return out;
  }

  // ------------------------------------------------------------ chips
  var uid = 0;
  // ChipGroup: a category's labels, five shown, then "N more".
  function chipGroup(category, chips, cls, max, removable) {
    var id = 'hf-label-' + (++uid);
    var items = chips.map(function (c, i) {
      return '<li class="pf-v6-c-label-group__list-item"' + (i >= max ? ' hidden data-chip-extra' : '') + '><span class="pf-v6-c-label ' + cls + '"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(c.text) + '</span></span>' + (removable ? '<span class="pf-v6-c-label__actions"><button aria-label="Close ' + esc(c.text) + '" class="pf-v6-c-button pf-m-plain pf-m-no-padding" type="button" data-chip-remove="' + esc(c.remove) + '"><span class="pf-v6-c-button__icon">' + IC.close + '</span></button></span>' : '') + '</span></li>';
    }).join('');
    if (chips.length > max) items += '<li class="pf-v6-c-label-group__list-item"><button class="pf-v6-c-label pf-m-overflow" type="button" data-chip-more="' + esc(t('{0} more', { 0: chips.length - max })) + '"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(t('{0} more', { 0: chips.length - max })) + '</span></span></button></li>';
    return '<div class="pf-v6-c-label-group pf-m-category"><div class="pf-v6-c-label-group__main"><span class="pf-v6-c-label-group__label" aria-hidden="true" id="' + id + '">' + esc(category) + '</span><ul class="pf-v6-c-label-group__list" aria-labelledby="' + id + '" role="list">' + items + '</ul></div></div>';
  }
  // The field's chips: every search column in order (an empty wrapper when
  // it has none), then any other key.
  function fieldChips(value) {
    var filters = toSearchParams(value);
    var chips = buildChips(removeHostFilter(modifyHostFilter(value, filters)));
    var colKeys = COLUMNS.map(function (c) { return c.key; });
    var html = COLUMNS.map(function (c) {
      var g = chips[c.key];
      return '<div>' + (g && g.chips.length ? chipGroup(c.name, g.chips.map(function (t) { return { text: t }; }), 'pf-m-outline', 5) : '') + '</div>';
    }).join('');
    Object.keys(chips).filter(function (k) { return chips[k].chips.length && colKeys.indexOf(k) === -1; }).forEach(function (k) {
      html += '<div>' + chipGroup(chips[k].key, chips[k].chips.map(function (t) { return { text: t }; }), 'pf-m-outline', 5) + '</div>';
    });
    return html;
  }

  // ------------------------------------------------------------ the modal
  function openModal(field) {
    var hidden = $('[data-host-filter-value]', field), org = field._orgId();
    var value = hidden.value || '';
    var initial = modifyHostFilter(value, toSearchParams(value));
    var st = { filters: [], page: 1, size: 5, order: 'name', key: 'name__icontains', touched: false, data: null, facts: false, text: '', adv: null, boolOpen: false };
    Object.keys(initial).forEach(function (k) { (Array.isArray(initial[k]) ? initial[k] : [initial[k]]).forEach(function (v) { st.filters.push([k, String(v)]); }); });
    st.touched = st.filters.length > 0;
    var keys = { searchable: [], related: [] };
    U.searchableKeys('/api/v2/hosts/').then(function (k) { keys = k; });

    var m = el('<div class="pf-v6-c-backdrop" data-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(t('Lookup modal')) + '" aria-modal="true" class="pf-v6-c-modal-box pf-m-lg"><div class="pf-v6-c-modal-box__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-hf-close><span class="pf-v6-c-button__icon">' + IC.close + '</span></button></div><header class="pf-v6-c-modal-box__header"><h1 class="pf-v6-c-modal-box__title"><span class="pf-v6-c-modal-box__title-text">' + esc(t('Perform a search to define a host filter')) + '</span></h1></header><div class="pf-v6-c-modal-box__body"><div class="ascender-host-filter-lookup__modal-list" data-hf-list></div></div><footer class="pf-v6-c-modal-box__footer"><button class="pf-v6-c-button pf-m-primary" type="button" data-hf-select><span class="pf-v6-c-button__text">' + esc(t('Select')) + '</span></button><button class="pf-v6-c-button pf-m-link" type="button" data-hf-close><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button></footer></div></div></div>');
    var root = $('#ascender-modal-root') || document.body;
    root.appendChild(m); U.openModal(m);
    var list = $('[data-hf-list]', m), selectBtn = $('[data-hf-select]', m);
    function close() { m.remove(); U.closeModal(); }
    $$('[data-hf-close]', m).forEach(function (b) { b.addEventListener('click', close); });
    selectBtn.addEventListener('click', function () {
      // qsToHostFilter: the search without the list's own parameters.
      var params = {};
      st.filters.forEach(function (f) { addParam(params, f[0], f[1]); });
      hidden.value = toHostFilter(params);
      field._render();
      close();
    });

    function params() {
      var p = new URLSearchParams();
      st.filters.forEach(function (f) { p.append(f[0], f[1]); });
      p.set('page', st.page); p.set('page_size', st.size); p.set('order_by', st.order);
      p.set('not__inventory__kind', 'constructed');
      if (org) p.set('inventory__organization', org);
      return p.toString();
    }
    function load() {
      st.loading = true; render();
      api('GET', '/api/v2/hosts/?' + params()).then(function (r) {
        st.loading = false;
        st.data = r.ok ? r.data : { count: 0, results: [], error: true };
        render();
      });
    }
    function search(k, v) { st.filters.push([k, v]); st.page = 1; st.touched = true; load(); }
    function replace(k, v) { st.filters = st.filters.filter(function (f) { return f[0] !== k; }); search(k, v); }
    function remove(k, v) { var i = -1; st.filters.forEach(function (f, j) { if (i < 0 && f[0] === k && f[1] === v) i = j; }); if (i >= 0) st.filters.splice(i, 1); st.page = 1; st.touched = true; load(); }

    function chipRow() {
      // getChipsByKey: the columns' groups in column order, then the rest;
      // a host_filter search shows as its ansible_facts chip.
      var groups = {}, order = COLUMNS.map(function (c) { return c.key; }).concat(['advanced']);
      st.filters.forEach(function (f) {
        var key = f[0], val = f[1], remove = f[0] + ':' + f[1];
        if (key === 'host_filter') { key = 'ansible_facts'; val = val.substring('ansible_facts__'.length); }
        if (!groups[key]) {
          var col = COLUMNS.filter(function (c) { return c.key === key; })[0];
          groups[key] = { label: col ? col.name + ' (' + key + ')' : key, chips: [] };
          if (order.indexOf(key) === -1) order.push(key);
        }
        groups[key].chips.push({ text: val, remove: remove });
      });
      var keys = order.filter(function (k) { return groups[k] && groups[k].chips.length; });
      if (!keys.length) return '<div class="pf-v6-c-toolbar__content pf-m-hidden" hidden=""><div class="pf-v6-c-toolbar__group"></div></div>';
      return '<div class="pf-v6-c-toolbar__content"><div class="pf-v6-c-toolbar__group">' + keys.map(function (k) { return '<div class="pf-v6-c-toolbar__item pf-m-label-group pf-m-label-group">' + chipGroup(groups[k].label, groups[k].chips, 'pf-m-filled', 3, true) + '</div>'; }).join('') + '</div><div class="pf-v6-c-toolbar__group pf-m-action-group-inline"><div class="pf-v6-c-toolbar__item"><button class="pf-v6-c-button pf-m-link pf-m-inline" type="button" data-hf-clear><span class="pf-v6-c-button__text">' + esc(t('Clear all filters')) + '</span></button></div></div></div>';
    }
    function keySelect() {
      var current = st.key === 'advanced' ? t('Advanced') : COLUMNS.filter(function (c) { return c.key === st.key; })[0].name;
      var items = COLUMNS.concat([{ name: t('Advanced'), key: 'advanced' }]).filter(function (c) { return c.key !== st.key; });
      return '<div class="pf-v6-c-toolbar__item"><div class="ascender-dropdown" data-dropdown><button class="pf-v6-c-menu-toggle" type="button" aria-label="' + esc(t('Simple key select')) + '" aria-expanded="false" data-dropdown-toggle><span class="pf-v6-c-menu-toggle__text">' + esc(current) + '</span><span class="pf-v6-c-menu-toggle__controls"><span class="pf-v6-c-menu-toggle__toggle-icon">' + IC.caret + '</span></span></button><div class="pf-v6-c-menu ascender-dropdown__menu" hidden data-dropdown-menu style="top: 100%;"><div class="pf-v6-c-menu__content"><ul role="listbox" aria-multiselectable="false" class="pf-v6-c-menu__list">' + items.map(function (c, i) { return '<li class="pf-v6-c-menu__list-item" role="none" data-cy="select-option-' + esc(c.key) + '"><button id="select-option-' + esc(c.key) + '" tabindex="' + (i ? -1 : 0) + '" class="pf-v6-c-menu__item" role="option" aria-selected="false" type="button" data-hf-key="' + esc(c.key) + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(c.name) + '</span></span></button></li>'; }).join('') + '</ul></div></div></div></div>';
    }
    function filterInput() {
      var col = COLUMNS.filter(function (c) { return c.key === st.key; })[0];
      if (st.key === 'advanced') return '<div class="pf-v6-c-toolbar__item" data-hf-adv></div>';
      if (col && col.isBoolean) {
        var chip = st.filters.filter(function (f) { return f[0] === st.key; })[0];
        return '<div class="pf-v6-c-toolbar__item"><div class="ascender-dropdown" data-dropdown><button class="pf-v6-c-menu-toggle" type="button" aria-expanded="false" data-dropdown-toggle><span class="pf-v6-c-menu-toggle__text">' + esc(chip ? chip[1] : t('Filter By {name}', { name: col.name })) + '</span><span class="pf-v6-c-menu-toggle__controls"><span class="pf-v6-c-menu-toggle__toggle-icon">' + IC.caret + '</span></span></button><div class="pf-v6-c-menu ascender-dropdown__menu" hidden data-dropdown-menu style="top: 100%;"><div class="pf-v6-c-menu__content"><ul role="listbox" aria-multiselectable="false" class="pf-v6-c-menu__list"><li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item" role="option" aria-selected="false" type="button" data-hf-bool="true"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(t('Yes')) + '</span></span></button></li><li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item" role="option" aria-selected="false" type="button" data-hf-bool="false"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(t('No')) + '</span></span></button></li></ul></div></div></div></div>';
      }
      var empty = !st.text;
      return '<div class="pf-v6-c-toolbar__item"><div class="pf-v6-c-input-group"><div class="pf-v6-c-input-group__item pf-m-fill"><span class="pf-v6-c-form-control"><input data-cy="search-text-input" aria-label="' + esc(t('Search text input')) + '" aria-invalid="false" type="' + (INTEGER.indexOf(st.key) >= 0 ? 'number' : 'search') + '" value="' + esc(st.text) + '" data-hf-text></span></div><div class="pf-v6-c-input-group__item"><div class="ascender-search__submit-button-wrapper' + (empty ? ' ascender-search__submit-button-wrapper--disabled' : '') + '"><button aria-label="' + esc(t('Search submit button')) + '" class="pf-v6-c-button pf-m-control" type="button"' + (empty ? ' disabled=""' : '') + ' data-hf-search><span class="pf-v6-c-button__icon">' + IC.search + '</span></button></div></div></div></div>';
    }
    function sizeMenu(up) {
      return '<div class="pf-v6-c-menu ascender-dropdown__menu pf-m-align-right" hidden data-dropdown-menu' + (up ? '' : ' style="top: 100%;"') + '><div class="pf-v6-c-menu__content"><ul class="pf-v6-c-menu__list" role="listbox">' + [5, 10, 20, 50].map(function (n) { return '<li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item' + (n === st.size ? ' pf-m-selected' : '') + '" role="option" type="button" data-hf-size="' + n + '"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + n + ' ' + esc(t('per page')) + '</span>' + (n === st.size ? '<span class="pf-v6-c-menu__item-select-icon">' + (IC.check || '') + '</span>' : '') + '</span></button></li>'; }).join('') + '</ul></div></div>';
    }
    function render() {
      var d = st.data || { count: 0, results: [] }, count = d.count || 0, pages = Math.max(1, Math.ceil(count / st.size));
      var first = count ? (st.page - 1) * st.size + 1 : 0, last = Math.min(st.page * st.size, count), wc = Math.max(2, String(pages).length);
      var range = '<b>' + first + ' - ' + last + '</b> ' + esc(t('of')) + ' <b>' + count + '</b>';
      var top = count ? '<div class="pf-v6-c-toolbar__item pf-m-pagination" style="align-self: center;"><div class="pf-v6-c-pagination" id="options-menu-top-pagination" style="--pf-v6-c-pagination__nav-page-select--c-form-control--width-chars: ' + wc + ';"><div class="pf-v6-c-pagination__total-items">' + range + ' ' + esc(t('items')) + '</div><div class="pf-v6-c-pagination__page-menu"><div class="ascender-dropdown" data-dropdown><button class="pf-v6-c-menu-toggle pf-m-plain pf-m-text" type="button" aria-label="' + esc(t('Select')) + '" aria-expanded="false" id="options-menu-top-toggle" aria-haspopup="listbox" data-dropdown-toggle><span class="pf-v6-c-menu-toggle__text">' + range + ' </span><span class="pf-v6-c-menu-toggle__controls"><span class="pf-v6-c-menu-toggle__toggle-icon">' + IC.caret + '</span></span></button>' + sizeMenu(false) + '</div></div>' + U.pagerNav('data-hf-page', st.page, pages) + '</div></div>' : '';
      var advanced = st.key === 'advanced';
      var alert = st.facts ? '<div class="pf-v6-c-alert pf-m-info ascender-host-filter-lookup__alert"><div class="pf-v6-c-alert__icon">' + (IC.infoCircle || '') + '</div><h4 class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">Info alert:</span>' + esc(t('Searching by ansible_facts requires special syntax. Refer to the')) + ' <a href="/docs/user-guide/inventories/#smart-host-filter" target="_blank" rel="noopener noreferrer">' + esc(t('documentation')) + '</a> ' + esc(t('for more info.')) + '</h4></div>' : '';
      var toolbar = '<div class="pf-v6-c-toolbar" id="' + NS + '-list-toolbar"><div class="pf-v6-c-toolbar__content ascender-data-list-toolbar__content"><div class="pf-v6-c-toolbar__content-section"><div class="pf-v6-c-toolbar__group pf-m-toggle-group pf-m-show"><div class="pf-v6-c-toolbar__toggle"><button aria-haspopup="false" aria-label="Show Filters" class="pf-v6-c-button pf-m-plain" type="button"><span class="pf-v6-c-button__icon">' + (IC.filter || '') + '</span></button></div><div class="pf-v6-c-toolbar__item"><div class="pf-v6-c-toolbar__group pf-m-filter-group">' + keySelect() + filterInput() + '</div></div></div>' + (advanced ? '' : '<div class="pf-v6-c-toolbar__group"></div>' + top) + '</div></div>' + chipRow() + '</div>';
      var body;
      if (!d.results || !d.results.length) {
        body = st.data ? '<div class="pf-v6-c-empty-state"><div class="pf-v6-c-empty-state__content"><div class="pf-v6-c-empty-state__header"><div class="pf-v6-c-empty-state__icon">' + (IC.cubes || '') + '</div><div class="pf-v6-c-empty-state__title"><h4 class="pf-v6-c-empty-state__title-text">' + esc(t('No {pluralizedItemName} Found', { pluralizedItemName: t('hosts') })) + '</h4></div></div><div class="pf-v6-c-empty-state__body">' + esc(t('Please add {pluralizedItemName} to populate this list', { pluralizedItemName: t('hosts') })) + '</div></div></div>' : '';
      } else {
        var sortTh = function (key, label) {
          var on = st.order === key || st.order === '-' + key, desc = st.order === '-' + key;
          return '<th tabindex="-1" scope="col" class="pf-v6-c-table__th ascender-header-row__th pf-v6-c-table__sort' + (on ? ' pf-m-selected' : '') + '"' + (on ? ' aria-sort="' + (desc ? 'descending' : 'ascending') + '"' : '') + ' id="' + NS + '-table-sort-' + key + '"><button type="button" class="pf-v6-c-table__button" data-hf-sort="' + key + '"><div class="pf-v6-c-table__button-content"><span class="pf-v6-c-table__text">' + esc(label) + '</span><span class="pf-v6-c-table__sort-indicator">' + (on ? (desc ? IC.longArrowDown : IC.longArrowUp) : IC.arrowsV) + '</span></div></button></th>';
        };
        body = '<div class="ascender-paginated-table__overflow-auto"><table aria-label="' + esc(t('{pluralizedItemName} List', { pluralizedItemName: t('hosts') })) + '" role="grid" class="pf-v6-c-table pf-m-grid-md pf-m-compact"><thead class="pf-v6-c-table__thead"><tr class="pf-v6-c-table__tr">' + sortTh('name', t('Name')) + sortTh('description', t('Description')) + '<th tabindex="-1" scope="col" class="pf-v6-c-table__th ascender-header-row__th">' + esc(t('Inventory')) + '</th></tr></thead><tbody role="rowgroup" class="pf-v6-c-table__tbody">' + d.results.map(function (h) {
          return '<tr class="pf-v6-c-table__tr"><td tabindex="-1" data-label="' + esc(t('Name')) + '" class="pf-v6-c-table__td">' + esc(h.name) + '</td><td tabindex="-1" data-label="' + esc(t('Description')) + '" class="pf-v6-c-table__td">' + esc(h.description || '') + '</td><td tabindex="-1" data-label="' + esc(t('Inventory')) + '" class="pf-v6-c-table__td">' + esc(((h.summary_fields || {}).inventory || {}).name || '') + '</td></tr>';
        }).join('') + '</tbody></table></div><div class="pf-v6-c-pagination pf-m-bottom" id="options-menu-bottom-pagination" style="--pf-v6-c-pagination__nav-page-select--c-form-control--width-chars: ' + wc + ';"><div class="pf-v6-c-pagination__page-menu"><div class="ascender-dropdown ascender-dropdown--up" data-dropdown><button class="pf-v6-c-menu-toggle pf-m-plain pf-m-text" type="button" aria-label="' + esc(t('Select')) + '" aria-expanded="false" id="options-menu-bottom-toggle" aria-haspopup="listbox" data-dropdown-toggle><span class="pf-v6-c-menu-toggle__text">' + range + ' ' + esc(t('items')) + '</span><span class="pf-v6-c-menu-toggle__controls"><span class="pf-v6-c-menu-toggle__toggle-icon">' + IC.caret + '</span></span></button>' + sizeMenu(true) + '</div></div>' + U.pagerNav('data-hf-page', st.page, pages, true) + '</div>';
      }
      list.innerHTML = alert + toolbar + body;
      selectBtn.disabled = !st.touched;
      var slot = $('[data-hf-adv]', list);
      if (slot) {
        if (!st.adv) st.adv = U.advancedSearch({
          keys: function () { return keys; }, negative: false, fuzzy: false,
          onSearch: function (k, v) { search(k, v); },
          onAnsibleFacts: function (on) { if (st.facts !== on) { st.facts = on; render(); } },
          factsLocked: function () { return st.filters.some(function (f) { return f[0] === 'host_filter'; }); },
        });
        slot.appendChild(st.adv.el);
        st.adv.refresh();
      }
      wire();
    }
    function wire() {
      var text = $('[data-hf-text]', list), go = $('[data-hf-search]', list);
      if (text) {
        text.addEventListener('input', function () { st.text = text.value; var empty = !st.text; go.disabled = empty; go.parentNode.classList.toggle('ascender-search__submit-button-wrapper--disabled', empty); });
        text.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (st.text) { var v = st.text; st.text = ''; search(st.key, v); } } });
        go.addEventListener('click', function () { if (st.text) { var v = st.text; st.text = ''; search(st.key, v); } });
      }
      $$('[data-hf-key]', list).forEach(function (b) { b.addEventListener('click', function () { st.key = b.getAttribute('data-hf-key'); st.text = ''; if (st.key !== 'advanced' && st.facts) st.facts = false; render(); }); });
      $$('[data-hf-bool]', list).forEach(function (b) { b.addEventListener('click', function () { replace(st.key, b.getAttribute('data-hf-bool')); }); });
      $$('[data-chip-remove]', list).forEach(function (b) { b.addEventListener('click', function () { var kv = b.getAttribute('data-chip-remove'), i = kv.indexOf(':'); remove(kv.slice(0, i), kv.slice(i + 1)); }); });
      $$('[data-chip-more]', list).forEach(function (b) { b.addEventListener('click', function () {
        var ul = b.closest('ul'), open = b.getAttribute('aria-expanded') !== 'true';
        $$('[data-chip-extra]', ul).forEach(function (x) { x.hidden = !open; });
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        $('.pf-v6-c-label__text', b).textContent = open ? t('Show less') : b.getAttribute('data-chip-more');
      }); });
      var clear = $('[data-hf-clear]', list);
      if (clear) clear.addEventListener('click', function () { st.filters = []; st.page = 1; st.touched = true; load(); });
      $$('[data-hf-sort]', list).forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-hf-sort'); st.order = st.order === k ? '-' + k : k; st.touched = true; load(); }); });
      $$('[data-hf-size]', list).forEach(function (b) { b.addEventListener('click', function () { st.size = Number(b.getAttribute('data-hf-size')); st.page = 1; st.touched = true; load(); }); });
      $$('[data-hf-page]', list).forEach(function (b) { b.addEventListener('click', function () {
        var pages = Math.max(1, Math.ceil(((st.data || {}).count || 0) / st.size)), a = b.getAttribute('data-hf-page');
        st.page = a === 'first' ? 1 : a === 'last' ? pages : a === 'previous' ? Math.max(1, st.page - 1) : Math.min(pages, st.page + 1);
        st.touched = true; load();
      }); });
      var pi = $('[data-hf-page-input]', list);
      if (pi) pi.addEventListener('change', function () { var pages = Math.max(1, Math.ceil(((st.data || {}).count || 0) / st.size)); st.page = Math.min(pages, Math.max(1, Number(pi.value) || 1)); st.touched = true; load(); });
    }
    load();
  }

  // ------------------------------------------------------------ the field
  $$('[data-host-filter]').forEach(function (field) {
    var form = field.closest('form'), hidden = $('[data-host-filter-value]', field), chips = $('[data-host-filter-chips]', field), btn = $('#host-filter', field);
    var orgInput = form && $('input[name="organization"]', form);
    field._orgId = function () { return orgInput ? orgInput.value : ''; };
    // SmartInventoryForm: a new smart inventory starts from the search the
    // Hosts list passed in host_filter.
    var fromList = hidden.getAttribute('data-host-filter-param');
    if (!hidden.value && fromList) hidden.value = toHostFilter(toSearchParams(fromList));
    field._render = function () { chips.innerHTML = fieldChips(hidden.value || ''); };
    field._render();
    // Disabled, behind a tooltip, until an organization is chosen.
    function orgState() {
      var none = !field._orgId(), group = $('.pf-v6-c-input-group', field), wrap = $('[data-host-filter-tip]', field);
      btn.disabled = none;
      if (none && !wrap) { wrap = el('<div style="display: contents;" data-host-filter-tip></div>'); group.parentNode.insertBefore(wrap, group); wrap.appendChild(group); }
      else if (!none && wrap) { wrap.parentNode.insertBefore(group, wrap); wrap.remove(); }
      if (none) { group.setAttribute('data-tooltip', t('Please select an organization before editing the host filter')); group.setAttribute('data-tooltip-pos', 'top'); } else U.clearTooltip(group);
    }
    if (orgInput) orgInput.addEventListener('change', orgState);
    btn.addEventListener('click', function () { if (!btn.disabled) openModal(field); });
  });
})();
