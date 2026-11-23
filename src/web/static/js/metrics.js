// Metrics screen (Metrics.tsx, LineChart.tsx): once an instance and a metric
// are chosen, the subsystem metric is read every three seconds and each
// node's readings drawn as a line, the latest fifty kept.
(function () {
  'use strict';
  var U = window.ASCENDER && window.ASCENDER.ui;
  var root = document.querySelector('[data-metrics]');
  if (!U || !root || !window.d3) return;
  var d3 = window.d3;

  var instances = [];
  root.querySelectorAll('[data-metrics-select="instance"] [data-metrics-option]').forEach(function (b) { instances.push(b.getAttribute('data-metrics-option')); });
  var instance = null, metric = null;
  var count = [0];
  var rendered = [];
  var helpText = '';
  var timer = null;
  var generation = 0;
  var chartEl = document.getElementById('chart');
  var emptyEl = root.querySelector('[data-metrics-empty]');

  function fetchData() {
    var gen = generation;
    var params = new URLSearchParams({ subsystemonly: '1', format: 'json' });
    if (instance !== 'All') params.set('node', instance);
    params.set('metric', metric);
    U.api('GET', '/api/v2/metrics/?' + params.toString()).then(function (r) {
      if (gen !== generation) return;
      if (!r.ok) { showError(r.status); return; }
      var data = r.data || {};
      Object.keys(data).forEach(function (k) {
        (data[k].samples || []).forEach(function (sample) {
          instances.forEach(function (i) {
            if (i !== sample.labels.node) return;
            var idx = -1;
            rendered.forEach(function (rd, n) { if (idx === -1 && rd.name === i) idx = n; });
            if (idx === -1) rendered.push({ name: i, values: [{ y: sample.value, x: count.length - 1 }] });
            else rendered[idx].values = rendered[idx].values.concat([{ y: sample.value, x: count.length - 1 }]);
          });
        });
      });
      var shown = rendered;
      if (count.length > 49) shown = rendered.map(function (s) { return { name: s.name, values: s.values.slice(-50) }; });
      helpText = (data[metric] && data[metric].help_text) || '';
      render(shown);
    });
  }

  function showError(status) {
    if (timer) clearInterval(timer);
    var t = document.querySelector('template[data-metrics-error="' + (status === 404 ? '404' : 'other') + '"]');
    var main = document.querySelector('main.pf-v6-c-page__main');
    if (t && main) main.innerHTML = '<section class="pf-v6-c-page__main-section"><div id="" class="pf-v6-c-card"><div class="pf-v6-c-card__body">' + t.innerHTML + ';</div></div></section>';
  }

  var current = [];
  function render(data) {
    current = data;
    if (!data.length) { chartEl.hidden = true; return; }
    chartEl.hidden = false;
    draw(data);
  }

  function draw(data) {
    var margin = 80;
    var width = parseInt(d3.select('#chart').style('width'), 10) - margin || 700;
    var height = 500;
    var duration = 250;
    var circleRadius = 6;
    var circleRadiusHover = 8;

    var smallestY, largestY;
    data.forEach(function (line) {
      line.values.forEach(function (value) {
        if (smallestY === undefined) smallestY = value.y;
        if (value.y < smallestY) smallestY = value.y;
        if (largestY === undefined) largestY = smallestY + 10;
        if (value.y > largestY) largestY = value.y;
      });
    });

    var firstValues = (data[0] && data[0].values) || [];
    var xScale = d3.scaleLinear()
      .domain((d3.max(firstValues, function (d) { return d.x; }) || 0) > 49 ? d3.extent(firstValues, function (d) { return d.x; }) : [0, 50])
      .range([0, width - margin]);
    var yScale = d3.scaleLinear().domain([smallestY, largestY]).range([height - margin, 0]);
    var color = d3.scaleOrdinal(d3.schemeCategory10);

    d3.selectAll('#chart > *').remove();

    function renderTooltip(d) {
      d3.selectAll('.tooltip > *').remove();
      d3.select('#chart').append('span').attr('class', 'tooltip').attr('stroke', 'black').attr('fill', 'white').style('padding-left', '50px');
      var tooltip = {};
      data.forEach(function (datum) {
        datum.values.forEach(function (value) { if (d.x === value.x) tooltip[datum.name] = value.y; });
      });
      Object.keys(tooltip).forEach(function (key, i) {
        d3.select('.tooltip').append('span').attr('class', 'tooltip-text-wrapper').append('text').attr('class', 'tooltip-text')
          .style('color', color(i)).style('padding-right', '20px').text(key + ': ' + tooltip[key]);
      });
    }
    function removeTooltip() {
      d3.select('.tooltip').style('cursor', 'none').selectAll('.tooltip > *').remove();
    }

    d3.selectAll('.legend > *').remove();
    var legendContainer = d3.select('#chart').append('div').style('display', 'flex').attr('class', 'legend')
      .attr('height', '400px').attr('width', '500px').style('padding-left', '50px');
    legendContainer.append('text').attr('class', 'legend-title').attr('x', '100').attr('y', '50').text(t('Legend'));
    data.forEach(function (series, i) {
      if (!series || !series.name) return;
      var item = legendContainer.append('div').style('display', 'flex').attr('id', 'legend-item-container').style('padding-left', '20px');
      item.append('div').style('background-color', color(i)).style('height', '8px').style('width', '8px')
        .style('border-radius', '50%').style('padding', '5px').style('margin-top', '6px');
      item.append('text').style('padding-left', '20px').text(series.name);
    });

    d3.select('#chart').append('div').attr('class', 'help-text').style('padding-left', '50px').style('padding-top', '20px').text(helpText);

    var svg = d3.select('#chart').append('svg').attr('width', (width + margin) + 'px').attr('height', (height + margin) + 'px')
      .append('g').attr('transform', 'translate(' + margin + ', ' + margin + ')');

    var line = d3.line().curve(d3.curveMonotoneX).x(function (d) { return xScale(d.x); }).y(function (d) { return yScale(d.y); });
    var lines = svg.append('g');
    lines.selectAll('.line-group').data(data).enter().append('g').attr('class', 'line-group')
      .append('path').attr('class', 'line').style('fill', 'none')
      .attr('d', function (d) { return line(d.values); })
      .style('stroke', function (d, i) { return color(i); })
      .style('stroke-width', '3px');

    lines.selectAll('circle-group').data(data).enter().append('g').style('fill', function (d, i) { return color(i); })
      .selectAll('circle').data(function (d) { return d.values; }).enter().append('g').attr('class', 'circle')
      .on('mouseover', function (event, d) { if (data.length) renderTooltip(d); })
      .on('mouseout', function () { removeTooltip(); })
      .append('circle').attr('cx', function (d) { return xScale(d.x); }).attr('cy', function (d) { return yScale(d.y); }).attr('r', circleRadius)
      .on('mouseover', function () { d3.select(this).transition().duration(duration).attr('r', circleRadiusHover); })
      .on('mouseout', function () { d3.select(this).transition().duration(duration).attr('r', circleRadius); });

    var xAxis = d3.axisBottom(xScale).ticks(firstValues.length > 5 ? firstValues.length : 5);
    var yAxis = d3.axisLeft(yScale).ticks(5);
    svg.append('g').attr('class', 'x axis').attr('transform', 'translate(0, ' + (height - margin) + ')').call(xAxis);
    svg.append('g').attr('class', 'y axis').call(yAxis);
  }

  window.addEventListener('resize', function () { if (current.length && !chartEl.hidden) draw(current); });

  function restart() {
    generation++;
    count = [0];
    rendered = [];
    current = [];
    d3.selectAll('#chart > *').remove();
    if (timer) clearInterval(timer);
    var ready = instance && metric;
    emptyEl.hidden = !!ready;
    chartEl.hidden = true;
    timer = setInterval(function () {
      count.push(count.length);
      if (instance && metric) fetchData();
    }, 3000);
    if (ready) fetchData();
  }

  root.addEventListener('click', function (e) {
    var o = e.target.closest('[data-metrics-option]');
    if (!o) return;
    var sel = o.closest('[data-metrics-select]');
    var v = o.getAttribute('data-metrics-option');
    sel.querySelector('[data-metrics-label]').textContent = o.textContent.trim();
    var menu = sel.querySelector('[data-dropdown-menu]');
    if (menu) menu.hidden = true;
    var toggle = sel.querySelector('[data-dropdown-toggle]');
    if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.classList.remove('pf-m-expanded'); }
    if (sel.getAttribute('data-metrics-select') === 'instance') instance = v; else metric = v;
    restart();
  });
  restart();
})();
