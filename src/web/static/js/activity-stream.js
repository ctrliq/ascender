/* Activity Stream: ActivityStreamDetailButton's "Event detail" modal. Each
   row carries its modal in an inert <template>; opening it clones the
   markup and starts the read-only changes editor. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$;

  $$('[data-activity-detail]').forEach(function (b) {
    b.addEventListener('click', function () {
      var tpl = $('template[data-activity-detail-modal="' + b.getAttribute('data-activity-detail') + '"]');
      if (!tpl) return;
      var root = $('#ascender-modal-root');
      root.innerHTML = '';
      root.appendChild(tpl.content.cloneNode(true));
      var m = root.firstElementChild;
      // dates in the cloned markup are localized as the page's were
      $$('.ascender-datetime', m).forEach(function (s) { var d = new Date(s.getAttribute('data-datetime')); if (!isNaN(d)) s.textContent = d.toLocaleString(); });
      U.openModal(m);
      if (window.ASCENDER.initEditor) $$('[data-code-editor]', m).forEach(function (e) { window.ASCENDER.initEditor(e); });
    });
  });
})();
