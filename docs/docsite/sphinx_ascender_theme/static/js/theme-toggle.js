(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var link = document.querySelector('.asc-theme-toggle');
    if (!link) {
      return;
    }
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var root = document.documentElement;
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('ascender-docs-theme', next);
      } catch (e) {}
      root.setAttribute('data-theme', next);
    });
  });
})();
