/* Topology view: MeshGraph and useZoom on d3 v7, with the force layout run
   in topology-worker.js as util/simulationWorker did. Header buttons drive
   the zoom; a node click shows its details in the Tooltip panel, which the
   server renders from the instance partials. */
(function () {
  'use strict';
  var U = (window.ASCENDER || {}).ui;
  var chart = document.querySelector('[data-topology-chart]');
  if (!U || !chart || !window.d3) return;
  var d3 = window.d3, $ = U.$, $$ = U.$$;

  var DEFAULT_RADIUS = 16, DEFAULT_NODE_COLOR = 'white', DEFAULT_NODE_HIGHLIGHT_COLOR = '#eee';
  var DEFAULT_NODE_SYMBOL_TEXT_COLOR = 'black', DEFAULT_NODE_STROKE_COLOR = '#6A6E73', DEFAULT_FONT_SIZE = '12px', LABEL_TEXT_MAX_LENGTH = 15;
  var NODE_STATE_COLOR_KEY = { ready: '#3E8635', 'provision-fail': '#C9190B', 'deprovision-fail': '#C9190B', unavailable: '#C9190B', installed: '#0066CC', provisioning: '#666', deprovisioning: '#666' };
  var LINK_STATE_COLOR_KEY = { established: '#6A6E73', adding: '#3E8635', removing: '#C9190B' };
  var NODE_TYPE_SYMBOL_KEY = { hop: 'h', execution: 'Ex', hybrid: 'Hy', control: 'C' };
  var ICONS = {
    clock: 'M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200zm61.8-104.4l-84.9-61.7c-3.1-2.3-4.9-5.9-4.9-9.7V116c0-6.6 5.4-12 12-12h32c6.6 0 12 5.4 12 12v141.7l66.8 48.6c5.4 3.9 6.5 11.4 2.6 16.8L334.6 349c-3.9 5.3-11.4 6.5-16.8 2.6z',
    checkmark: 'M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z',
    exclaimation: 'M176 432c0 44.112-35.888 80-80 80s-80-35.888-80-80 35.888-80 80-80 80 35.888 80 80zM25.26 25.199l13.6 272C39.499 309.972 50.041 320 62.83 320h66.34c12.789 0 23.331-10.028 23.97-22.801l13.6-272C167.425 11.49 156.496 0 142.77 0H49.23C35.504 0 24.575 11.49 25.26 25.199z',
    minus: 'M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z',
    plus: 'M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z',
  };

  function renderStateColor(s) { return NODE_STATE_COLOR_KEY[s] || ''; }
  function renderLinkStatusColor(s) { return LINK_STATE_COLOR_KEY[s] || '#ccc'; }
  function truncateString(str, num) { return str.length <= num ? str : str.slice(0, num) + '...'; }
  function renderLabelText(state, name) { return typeof state === 'string' && typeof name === 'string' ? truncateString(name, LABEL_TEXT_MAX_LENGTH) : ''; }
  function renderNodeType(t) { return NODE_TYPE_SYMBOL_KEY[t] || ''; }
  function renderLabelIcons(state) {
    if (!state) return false;
    var map = { ready: 'checkmark', installed: 'clock', unavailable: 'exclaimation', 'deprovision-fail': 'exclaimation', 'provision-fail': 'exclaimation', provisioning: 'plus', deprovisioning: 'minus' };
    return ICONS[map[state]] || '';
  }
  function renderIconPosition(state, b) {
    if (!state) return false;
    var m = {
      ready: 'translate(' + (b.x - 4.5) + ', ' + (b.y - 4.5) + '), scale(0.02)',
      installed: 'translate(' + (b.x - 6.5) + ', ' + (b.y - 6.5) + '), scale(0.025)',
      unavailable: 'translate(' + (b.x - 2) + ', ' + (b.y - 4.4) + '), scale(0.02)',
      'provision-fail': 'translate(' + (b.x - 2) + ', ' + (b.y - 4) + '), scale(0.02)',
      'deprovision-fail': 'translate(' + (b.x - 2) + ', ' + (b.y - 4) + '), scale(0.02)',
      provisioning: 'translate(' + (b.x - 4.5) + ', ' + (b.y - 4.5) + '), scale(0.02)',
      deprovisioning: 'translate(' + (b.x - 4.5) + ', ' + (b.y - 4.5) + '), scale(0.02)',
    };
    return m[state] || '';
  }
  function renderLinkState(s) { return { adding: 3, removing: 3 }[s] || null; }
  function markerFor(d) { return d.link_state === 'adding' ? 'url(#end-adding)' : d.link_state === 'removing' ? 'url(#end-removing)' : 'url(#end)'; }

  var data = { nodes: [], links: [] };
  try { data = JSON.parse(document.getElementById('topology-data').textContent); } catch (e) { /* empty mesh */ }
  var storedNodes = data.nodes;
  var tooltip = $('[data-topology-tooltip]'), loader = $('[data-topology-loader]');
  var emptyTooltip = tooltip.innerHTML;
  var controls = $$('[data-topology]');

  // ---------------------------------------------------------------- useZoom
  var zoom = d3.zoom().on('zoom', function (event) { d3.select('.mesh').attr('transform', event.transform.toString()); });
  function parent() { return d3.select('.mesh-svg'); }
  var zoomActions = {
    'zoom-in': function () { parent().transition().call(zoom.scaleBy, 2); },
    'zoom-out': function () { parent().transition().call(zoom.scaleBy, 0.5); },
    'zoom-reset': function () {
      var node = parent().node(); if (!node) return;
      parent().transition().duration(750).call(zoom.transform, d3.zoomIdentity, d3.zoomTransform(node).invert([node.clientWidth / 2, node.clientHeight / 2]));
    },
    'zoom-fit': function () {
      var child = d3.select('.mesh').node(); if (!child) return;
      var bounds = child.getBBox(), fullWidth = width(), fullHeight = height();
      if (bounds.width === 0 || bounds.height === 0) return;
      var midX = bounds.x + bounds.width / 2, midY = bounds.y + bounds.height / 2;
      var scale = 0.8 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight);
      parent().transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY).scale(scale));
    },
    refresh: function () {
      U.api('GET', '/api/v2/mesh_visualizer/').then(function (r) {
        if (!r.ok) { U.errorModal(t('Error!'), U.errorText(r)); return; }
        data = r.data; storedNodes = data.nodes; reset();
      });
    },
  };
  function width() { var n = d3.select('.mesh-svg').node(); return n ? n.clientWidth : 700; }
  function height() { var n = d3.select('.mesh-svg').node(); return n ? n.clientHeight : 600; }
  function showZoomControls(on) { controls.forEach(function (b) { b.disabled = !on; }); }
  controls.forEach(function (b) { b.addEventListener('click', function () { zoomActions[b.getAttribute('data-topology')](); }); });

  // ---------------------------------------------------------------- legend
  var legend = $('[data-topology-legend]'), legendToggle = $('[data-legend-toggle]');
  legendToggle.addEventListener('change', function () {
    if (legendToggle.checked) chart.insertBefore(legend, chart.firstChild); else legend.parentNode.removeChild(legend);
  });

  // ---------------------------------------------------------------- progress
  function setProgress(pct) {
    var bar = $('.pf-v6-c-progress__bar', loader), ind = $('.pf-v6-c-progress__indicator', loader), measure = $('.pf-v6-c-progress__measure', loader);
    bar.setAttribute('aria-valuenow', String(pct)); ind.style.width = pct + '%'; measure.textContent = pct + '%';
  }

  // ---------------------------------------------------------------- details panel
  var selected = null, worker = null;
  function showDetails(node) {
    selected = node;
    if (!node) { tooltip.innerHTML = emptyTooltip; return; }
    fetch('/topology_view/node/' + node.id, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error(t('Failed to get instance.'));
      return r.text();
    }).then(function (html) {
      if (selected !== node) return;
      tooltip.innerHTML = html;
      $$('.ascender-datetime', tooltip).forEach(function (s) { var d = new Date(s.getAttribute('data-datetime')); if (!isNaN(d)) s.textContent = d.toLocaleString(); });
      var go = $('[data-href]', tooltip); if (go) go.addEventListener('click', function () { location.href = go.getAttribute('data-href'); });
      window.ASCENDER.bindInstanceControls(tooltip, { debounce: 100, onToggle: function (on) {
        // update mesh when the user toggles enabled/disabled
        storedNodes = storedNodes.map(function (n) { return n.id === node.id ? Object.assign({}, n, { enabled: on }) : n; });
        d3.selectAll('[class*="id-"]').filter(function () { return this.classList.contains('id-' + node.id); }).attr('stroke-dasharray', on ? '1 0' : '5');
        showDetails(node);
      } });
    }).catch(function (e) { U.errorModal(t('Error!'), t('Failed to get instance.') + ' ' + e.message); });
  }

  // ---------------------------------------------------------------- draw
  function draw() {
    showZoomControls(false);
    var w = chart.clientWidth || 700, h = chart.clientHeight || 600;
    d3.selectAll('#chart > svg').remove();
    var svg = d3.select('#chart').append('svg').attr('aria-label', 'mesh-svg').attr('class', 'mesh-svg').attr('width', w + 'px').attr('height', '100%');
    var mesh = svg.append('g').attr('class', 'mesh');
    if (worker) worker.terminate();
    worker = new Worker('/static/js/topology-worker.js');
    worker.postMessage({ nodes: storedNodes, links: data.links });
    worker.onmessage = function (event) {
      if (event.data.type === 'tick') setProgress(Math.round(event.data.progress * 100));
      else if (event.data.type === 'end') ended(event.data);
    };

    function ended(result) {
      var nodes = result.nodes, links = result.links;
      loader.style.visibility = 'hidden';
      showZoomControls(true);
      // Center the mesh
      var simulation = d3.forceSimulation(nodes).force('center', d3.forceCenter(w / 2, h / 2));
      simulation.tick();
      mesh.append('defs').selectAll('marker').data(['end', 'end-active', 'end-adding', 'end-removing']).join('marker')
        .attr('id', String).attr('viewBox', '0 -5 10 10').attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5');
      mesh.select('#end').attr('refX', 23).attr('fill', '#6A6E73');
      mesh.select('#end-removing').attr('refX', 23).attr('fill', '#C9190B');
      mesh.select('#end-adding').attr('refX', 23).attr('fill', '#3E8635');
      mesh.select('#end-active').attr('refX', 18).attr('fill', '#0066CC');
      mesh.append('g').attr('class', 'links').attr('data-cy', 'links').selectAll('line').data(links).enter().append('line')
        .attr('x1', function (d) { return d.source.x || 0; }).attr('y1', function (d) { return d.source.y || 0; })
        .attr('x2', function (d) { return d.target.x || 0; }).attr('y2', function (d) { return d.target.y || 0; })
        .attr('marker-end', markerFor)
        .attr('class', function (_, i) { return 'link-' + i; })
        .attr('data-cy', function (d) { return d.source.hostname + '-' + d.target.hostname; })
        .style('fill', 'none').style('stroke', function (d) { return renderLinkStatusColor(d.link_state); }).style('stroke-width', '2px')
        .style('stroke-dasharray', function (d) { return renderLinkState(d.link_state); })
        .attr('pointer-events', 'none');
      var node = mesh.append('g').attr('class', 'nodes').attr('data-cy', 'nodes').selectAll('g').data(nodes).enter().append('g')
        .attr('data-cy', function (d) { return 'node-' + d.id; })
        .on('mouseenter', function (_, d) { d3.select(this).style('cursor', 'pointer'); highlightSiblings(d); })
        .on('mouseleave', function (_, d) { deselectSiblings(d); })
        .on('click', function (_, d) { highlightSelected(d); });
      var nodeCircles = node.append('g');
      nodeCircles.append('circle').attr('r', DEFAULT_RADIUS)
        .attr('cx', function (d) { return d.x || 0; }).attr('cy', function (d) { return d.y || 0; })
        .attr('class', function (d) { return 'id-' + d.id; }).attr('fill', DEFAULT_NODE_COLOR)
        .attr('stroke-dasharray', function (d) { return d.enabled ? '1 0' : '5'; })
        .attr('stroke', function (d) { return renderStateColor(d.node_state); });
      node.append('text').text(function (d) { return renderNodeType(d.node_type); })
        .attr('x', function (d) { return d.x || 0; }).attr('y', function (d) { return d.y || 0; })
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'central').attr('fill', DEFAULT_NODE_SYMBOL_TEXT_COLOR);
      var hostNames = node.append('g').attr('class', 'node-state-label');
      hostNames.append('text').attr('x', function (d) { return d.x || 0; }).attr('y', function (d) { return (d.y || 0) + 40; })
        .text(function (d) { return renderLabelText(d.node_state, d.hostname); })
        .attr('class', 'placeholder').attr('fill', 'white').attr('text-anchor', 'middle')
        .each(function () {
          var bbox = this.getBBox(), padding = 10;
          d3.select(this.parentNode).append('rect').attr('x', bbox.x - padding / 2).attr('y', bbox.y).attr('width', bbox.width + padding).attr('height', bbox.height)
            .style('stroke-width', 1).attr('rx', 4).attr('ry', 4).attr('fill', 'white').style('stroke', DEFAULT_NODE_STROKE_COLOR);
        });
      svg.selectAll('text.placeholder').remove();
      hostNames.append('text').attr('x', function (d) { return d.x || 0; }).attr('y', function (d) { return (d.y || 0) + 38; })
        .text(function (d) { return renderLabelText(d.node_state, d.hostname); })
        .attr('font-size', DEFAULT_FONT_SIZE).attr('fill', 'black').attr('text-anchor', 'middle');
      var badges = nodeCircles.append('g').attr('class', 'node-state-badge');
      badges.each(function () {
        var bbox = this.parentNode.getBBox();
        d3.select(this).append('circle').attr('r', 9).attr('cx', bbox.x).attr('cy', bbox.y).attr('fill', function (d) { return renderStateColor(d.node_state); });
        d3.select(this).append('path').attr('class', function (d) { return 'icon-' + d.node_state; }).attr('d', function (d) { return renderLabelIcons(d.node_state); })
          .attr('transform', function (d) { return renderIconPosition(d.node_state, bbox); }).attr('fill', 'white');
      });
      svg.call(zoom);

      function immediate(n) { return links.filter(function (l) { return n.hostname === l.source.hostname || n.hostname === l.target.hostname; }); }
      function highlightSiblings(n) {
        svg.select('circle.id-' + n.id).attr('fill', DEFAULT_NODE_HIGHLIGHT_COLOR);
        immediate(n).forEach(function (s) { svg.selectAll('.link-' + s.index).style('stroke', '#0066CC').style('stroke-width', '3px').attr('marker-end', 'url(#end-active)'); });
      }
      function deselectSiblings(n) {
        svg.select('circle.id-' + n.id).attr('fill', DEFAULT_NODE_COLOR);
        immediate(n).forEach(function (s) {
          svg.selectAll('.link-' + s.index).style('stroke', function (d) { return renderLinkStatusColor(d.link_state); }).style('stroke-width', '2px').attr('marker-end', markerFor);
        });
      }
      function highlightSelected(n) {
        if (svg.select('circle.id-' + n.id).attr('stroke-width') !== null) {
          svg.select('circle.id-' + n.id).datum(n).attr('stroke', function (d) { return renderStateColor(d.node_state); }).attr('stroke-width', null);
          showDetails(null);
          return;
        }
        svg.selectAll('circle').attr('stroke', function (d) { return renderStateColor(d.node_state); }).attr('stroke-width', null);
        svg.select('circle.id-' + n.id).attr('stroke-width', '5px').attr('stroke', '#17b26a');
        showDetails(n);
      }
    }
  }

  function reset() {
    loader.style.visibility = 'visible';
    setProgress(0);
    showDetails(null);
    draw();
  }
  var resizeTimer = null;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(reset, 500); });
  reset();
})();
