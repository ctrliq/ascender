// The documentation site's script, loaded in the head of every page. It
// applies the theme the application stored before the page paints, then
// wires the theme picker, the navigation toggles and the tabs.
(function () {
  'use strict';
  var DARK = {default: true, dark: true, light: false, awx: false};
  var root = document.documentElement;

  function applyTheme(id) {
    if (!(id in DARK)) id = 'default';
    root.setAttribute('data-theme', id);
    root.classList.toggle('pf-v6-theme-dark', DARK[id]);
    return id;
  }

  var stored = null;
  try { stored = sessionStorage.getItem('theme') || localStorage.getItem('theme'); } catch (e) {}
  var theme = applyTheme(stored || 'default');

  document.addEventListener('DOMContentLoaded', function () {
    var picker = document.getElementById('docs-theme');
    if (picker) {
      picker.value = theme;
      picker.addEventListener('change', function () {
        theme = applyTheme(picker.value);
        try { sessionStorage.setItem('theme', theme); localStorage.setItem('theme', theme); } catch (e) {}
      });
    }

    // The hamburger shows and hides the sidebar.
    var toggle = document.getElementById('nav-toggle');
    var sidebar = document.getElementById('page-sidebar');
    if (toggle && sidebar) {
      if (window.matchMedia('(max-width: 1199px)').matches) {
        sidebar.classList.add('pf-m-collapsed');
        toggle.setAttribute('aria-expanded', 'false');
      }
      toggle.addEventListener('click', function () {
        var collapsed = sidebar.classList.toggle('pf-m-collapsed');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });
    }

    // Expandable navigation groups.
    document.querySelectorAll('[data-nav-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.parentElement;
        var open = item.classList.toggle('pf-m-expanded');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        var sub = item.querySelector(':scope > .pf-v6-c-nav__subnav');
        if (sub) sub.hidden = !open;
      });
    });
    var current = document.querySelector('.pf-v6-c-nav__link[aria-current="page"]');
    if (current && current.scrollIntoView) current.scrollIntoView({block: 'nearest'});

    // Tabs: the panels a page writes become PatternFly tabs, the first
    // one shown. Without this script every panel shows, one after another.
    document.querySelectorAll('[data-tabs]').forEach(function (group, g) {
      var panels = Array.prototype.filter.call(group.children, function (c) { return c.classList.contains('docs-tab'); });
      if (!panels.length) return;
      var tabs = document.createElement('div');
      tabs.className = 'pf-v6-c-tabs';
      var list = document.createElement('ul');
      list.className = 'pf-v6-c-tabs__list';
      list.setAttribute('role', 'tablist');
      tabs.appendChild(list);
      var buttons = panels.map(function (panel, i) {
        var id = 'docs-tabs-' + g + '-' + i;
        var li = document.createElement('li');
        li.className = 'pf-v6-c-tabs__item';
        li.setAttribute('role', 'presentation');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pf-v6-c-tabs__link';
        b.id = id;
        b.setAttribute('role', 'tab');
        var text = document.createElement('span');
        text.className = 'pf-v6-c-tabs__item-text';
        text.textContent = panel.getAttribute('data-tab-label') || String(i + 1);
        b.appendChild(text);
        li.appendChild(b);
        list.appendChild(li);
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', id);
        b.addEventListener('click', function () { select(i); });
        return b;
      });
      function select(n) {
        buttons.forEach(function (b, i) {
          b.parentElement.classList.toggle('pf-m-current', i === n);
          b.setAttribute('aria-selected', i === n ? 'true' : 'false');
          panels[i].hidden = i !== n;
        });
      }
      group.insertBefore(tabs, group.firstChild);
      select(0);
    });
  });
})();
