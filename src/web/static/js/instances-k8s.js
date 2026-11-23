// Instances on Kubernetes: removing (deprovisioning) a node from its detail
// page (RemoveInstanceButton), and associating and disassociating the
// addresses it peers to (InstancePeerList).
(function () {
  var A = window.ASCENDER, U = A && A.ui;
  if (!U) return;
  var $ = U.$, $$ = U.$$, esc = U.esc, api = U.api;
  var IC = Object.assign({}, U.ICON, A.icons || {});

  function modal(title, body, confirmLabel, onConfirm) {
    var footer = '<button aria-label="' + esc(confirmLabel) + '" class="pf-v6-c-button pf-m-danger" type="button" data-k8s-confirm><span class="pf-v6-c-button__text">' + esc(t('Remove')) + '</span></button><button aria-label="' + esc(t('cancel remove')) + '" class="pf-v6-c-button pf-m-link" type="button" data-close-modal><span class="pf-v6-c-button__text">' + esc(t('Cancel')) + '</span></button>';
    var m = U.alertModal('danger', title, t('Alert modal'), body, footer);
    m.addEventListener('click', function (e) { if (e.target.closest('[data-close-modal]')) { m.remove(); U.closeModal(); } });
    $('[data-k8s-confirm]', m).addEventListener('click', function () { this.disabled = true; onConfirm(m); });
  }
  // buildRemoveWarning: the selected instances are in n instance groups.
  function removeWarning(count, n) {
    var label = t('Instance Groups');
    return '<div class="pf-v6-c-alert pf-m-inline pf-m-warning ascender-remove-instance-button__warning-message"><div class="pf-v6-c-alert__icon">' + (IC.warnTriangle || '') + '</div><h4 class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">Warning alert:</span><div>' +
      esc(t('{0, plural, one {This instance is currently being used by other resources. Are you sure you want to delete it?} other {Deprovisioning these instances could impact other resources that rely on them. Are you sure you want to delete anyway?}}', { 0: count })) +
      '<div aria-label="' + esc(label + ': ' + n) + '"><span class="ascender-remove-instance-button__label">' + esc(label) + '</span><span class="pf-v6-c-badge pf-m-unread">' + n + '</span></div></div></h4></div>';
  }
  function failed(m, title, r) {
    m.remove(); U.closeModal();
    U.alertModal('error', t('Error!'), t('Alert modal'), esc(title) + U.errorDetail('patch', '', r));
  }

  // RemoveInstanceButton: the node is deprovisioned; it goes once its
  // jobs are done.
  $$('[data-instance-remove]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-instance-remove'), name = b.getAttribute('data-name');
      var body = '<div>' + esc(t('This action will remove the following instance and you may need to rerun the install bundle for any instance that was previously connected to:')) + '</div><span id="item-to-be-removed-' + esc(id) + '"><strong>' + esc(name) + '</strong><br></span>';
      // relatedResourceDeleteRequests: the groups the instance is in.
      api('GET', '/api/v2/instance_groups/?instances=' + id).then(function (g) {
        var n = g.ok ? g.data.count : 0;
        if (n > 0) body += removeWarning(1, n);
        modal(t('Remove Instances'), body, t('Confirm remove'), function (m) {
          api('PATCH', '/api/v2/instances/' + id + '/', { node_state: 'deprovisioning' }).then(function (r) {
            if (r.ok) { window.location = '/instances'; return; }
            failed(m, t('Failed to remove one or more instances.'), r);
          });
        });
      });
    });
  });

  // The list's Remove: every selected row it may take (data-removable: on
  // Kubernetes the hop and execution nodes added there, anywhere the
  // instances the heartbeat lost). Other rows stay selectable for the
  // health check, so Remove waits until only removable ones are selected.
  $$('[data-instance-remove-selected]').forEach(function (b) {
    function picked() { return $$('[data-row]').filter(function (tr) { var c = $('[data-select-row]', tr); return c && c.checked; }); }
    document.addEventListener('change', function () {
      setTimeout(function () {
        var rows = picked(), ok = rows.length > 0 && rows.every(function (tr) { return tr.hasAttribute('data-removable'); });
        b.disabled = !ok;
        var tip = b.closest('[data-tooltip]'); if (tip) tip.setAttribute('data-tooltip', ok ? t('Remove') : t('Select a row to remove'));
      }, 0);
    });
    b.addEventListener('click', function () {
      var rows = picked().map(function (tr) { return { id: tr.getAttribute('data-id'), name: tr.getAttribute('data-name') }; });
      var body = '<div>' + esc(t('This action will remove the following instance and you may need to rerun the install bundle for any instance that was previously connected to:')) + '</div>' + rows.map(function (r) { return '<span id="item-to-be-removed-' + esc(r.id) + '"><strong>' + esc(r.name) + '</strong><br></span>'; }).join('');
      Promise.all(rows.map(function (r) { return api('GET', '/api/v2/instance_groups/?instances=' + r.id); })).then(function (rs) {
        var n = rs.reduce(function (t, g) { return t + (g.ok ? g.data.count : 0); }, 0);
        if (n > 0) body += removeWarning(rows.length, n);
        modal(t('Remove Instances'), body, t('Confirm remove'), function (m) {
          Promise.all(rows.map(function (r) { return api('PATCH', '/api/v2/instances/' + r.id + '/', { node_state: 'deprovisioning' }); })).then(function (res) {
            var bad = res.filter(function (r) { return !r.ok; })[0];
            if (bad) { failed(m, t('Failed to remove one or more instances.'), bad); return; }
            window.location.reload();
          });
        });
      });
    });
  });

  function savePeers(id, peers) { return api('PATCH', '/api/v2/instances/' + id + '/', { peers: peers }); }

  $$('[data-peer-associate]').forEach(function (b) {
    var id = b.getAttribute('data-peer-associate'), current = JSON.parse(b.getAttribute('data-peers') || '[]') || [];
    b.addEventListener('click', function () {
      var holder = U.el('<div data-resource="receptor_addresses" data-title="' + esc(t('Select Instances')) + '" data-multi data-display-key="address" data-columns="' + esc(t('Address') + ':address,' + t('Port') + ':port') + '"></div>');
      U.lookupModal(holder, { multi: true, filter: b.getAttribute('data-filter') || '', onSelect: function (sel, m) {
        var peers = current.slice();
        sel.forEach(function (s) { if (peers.indexOf(Number(s.id)) < 0) peers.push(Number(s.id)); });
        savePeers(id, peers).then(function (r) {
          if (!r.ok) { failed(m, t('Failed to associate peer.'), r); return; }
          U.closeModal(m);
          try { sessionStorage.setItem('ascender-k8s-toast', t('Peers update on {0}.  Please be sure to run the install bundle for {1} again in order to see changes take effect.', { 0: b.getAttribute('data-hostname'), 1: b.getAttribute('data-hostname') })); } catch (e) { /* storage off */ }
          window.location.reload();
        });
      } });
    });
  });
  try {
    var note = sessionStorage.getItem('ascender-k8s-toast');
    if (note) { sessionStorage.removeItem('ascender-k8s-toast'); U.toast('success', note); }
  } catch (e) { /* storage off */ }

  $$('[data-peer-disassociate]').forEach(function (b) {
    var id = b.getAttribute('data-peer-disassociate'), current = JSON.parse(b.getAttribute('data-peers') || '[]') || [];
    function selected() { return $$('[data-select-row]').filter(function (c) { return c.checked; }); }
    document.addEventListener('change', function (e) { if (e.target.matches && e.target.matches('[data-select-row], #select-all')) setTimeout(function () { b.disabled = !selected().length; }, 0); });
    b.addEventListener('click', function () {
      var rows = selected().map(function (c) { var tr = c.closest('[data-row]'); return { id: Number(tr.getAttribute('data-row')), name: tr.getAttribute('data-name') }; });
      var body = '<div>' + esc(t('This action will disassociate the following:')) + '</div>' + rows.map(function (r) { return '<span><strong>' + esc(r.name) + '</strong><br></span>'; }).join('');
      modal(t('Remove peers?'), body, t('confirm disassociate'), function (m) {
        var drop = rows.map(function (r) { return r.id; });
        savePeers(id, current.filter(function (p) { return drop.indexOf(p) < 0; })).then(function (r) {
          if (r.ok) {
            try { sessionStorage.setItem('ascender-k8s-toast', t('Peer removed. Please be sure to run the install bundle for {0} again in order to see changes take effect.', { 0: b.getAttribute('data-hostname') })); } catch (e) { /* storage off */ }
            window.location.reload();
            return;
          }
          failed(m, t('Failed to disassociate one or more peers.'), r);
        });
      });
    });
  });
})();
