// Dashboard (DashboardGraph, LineChart, ChartTooltip): the job status chart
// of successful and failed runs per day, with its period, job type and
// status selects; and the Recent Jobs and Recent Templates tabs, whose lists
// the server renders when their tab is open.
(function () {
  'use strict';
  var U = window.ASCENDER && window.ASCENDER.ui;
  var root = document.querySelector('[data-job-graph]');
  if (!U || !root || !window.d3) return;
  var d3 = window.d3;
  var id = root.id;

  // A list tab whose list is not on the page loads it.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#dashboard-tab-1, #dashboard-tab-2');
    if (!b) return;
    var key = b.id === 'dashboard-tab-1' ? 'jobs' : 'templates';
    var holder = document.querySelector('[data-dashboard-list="' + key + '"]');
    if (holder && !holder.firstElementChild) {
      e.stopPropagation(); e.preventDefault();
      location.href = '/home?tab=' + key;
    }
  }, true);

  var period = 'month', jobType = 'all', jobStatus = 'all';
  var data = [];

  function setLabel(attr, text) {
    var item = document.querySelector('[' + attr + ']');
    var dd = item && item.closest('[data-dropdown]');
    var label = dd && dd.querySelector('.pf-v6-c-menu-toggle__text');
    if (label) label.textContent = text;
    var menu = dd && dd.querySelector('[data-dropdown-menu]');
    if (menu) menu.hidden = true;
    var tg = dd && dd.querySelector('[data-dropdown-toggle]');
    if (tg) { tg.setAttribute('aria-expanded', 'false'); tg.classList.remove('pf-m-expanded'); }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-graph-period], [data-graph-type], [data-graph-status]');
    if (!b) return;
    var text = b.textContent.trim();
    if (b.hasAttribute('data-graph-period')) { period = b.getAttribute('data-graph-period'); setLabel('data-graph-period', text); load(); }
    else if (b.hasAttribute('data-graph-type')) { jobType = b.getAttribute('data-graph-type'); setLabel('data-graph-type', text); load(); }
    else { jobStatus = b.getAttribute('data-graph-status'); setLabel('data-graph-status', text); draw(); }
  });

  function load() {
    U.api('GET', '/api/v2/dashboard/graphs/jobs/?period=' + encodeURIComponent(period) + '&job_type=' + encodeURIComponent(jobType)).then(function (r) {
      if (!r.ok || !r.data || !r.data.jobs) return;
      var byDay = {}, order = [];
      function add(list, key) {
        (list || []).forEach(function (p) {
          var k = String(p[0]);
          if (!byDay[k]) { byDay[k] = { created: '' }; order.push(k); }
          byDay[k][key] = p[1];
        });
      }
      add(r.data.jobs.successful, 'successful');
      add(r.data.jobs.failed, 'failed');
      // Object.entries orders integer-like keys numerically and the rest
      // as they were added; the epoch seconds are floats in text.
      data = order.map(function (k) {
        var day = byDay[k];
        return { created: new Date(Number(k) * 1000).toISOString().split('T')[0], successful: day.successful, failed: day.failed };
      });
      draw();
    });
  }

  // ChartTooltip.
  function Tooltip(opts) {
    var self = this;
    self.label = opts.label; self.svg = opts.svg; self.colors = opts.colors;
    self.toolTipBase = d3.select(self.svg + ' > svg').append('g');
    self.toolTipBase.attr('id', 'chart-tooltip').attr('overflow', 'visible').style('opacity', 0).style('pointer-events', 'none').attr('transform', 'translate(100, 100)');
    self.boxWidth = 145;
    self.textWidthThreshold = 20;
    self.toolTipPoint = self.toolTipBase.append('rect').attr('transform', 'translate(10, -10) rotate(45)').attr('x', 0).attr('y', 0).attr('height', 20).attr('width', 20).attr('fill', '#393f44');
    self.boundingBox = self.toolTipBase.append('rect').attr('x', 10).attr('y', -41).attr('rx', 2).attr('height', 82).attr('width', self.boxWidth).attr('fill', '#393f44');
    self.circleGreen = self.toolTipBase.append('circle').attr('cx', 26).attr('cy', 0).attr('r', 7).attr('stroke', 'white').attr('fill', self.colors(1));
    self.circleRed = self.toolTipBase.append('circle').attr('cx', 26).attr('cy', 26).attr('r', 7).attr('stroke', 'white').attr('fill', self.colors(0));
    self.successText = self.toolTipBase.append('text').attr('x', 43).attr('y', 4).attr('font-size', 12).attr('fill', 'white').text(t('Successful'));
    self.failText = self.toolTipBase.append('text').attr('x', 43).attr('y', 28).attr('font-size', 12).attr('fill', 'white').text(t('Failed'));
    self.icon = self.toolTipBase.append('text').attr('fill', 'white').attr('stroke', 'white').attr('x', 24).attr('y', 30).attr('font-size', 12).text('!');
    self.jobs = self.toolTipBase.append('text').attr('fill', 'white').attr('x', 137).attr('y', -21).attr('font-size', 12).attr('text-anchor', 'end').text(t('No Jobs'));
    self.successful = self.toolTipBase.append('text').attr('fill', 'white').attr('font-size', 12).attr('x', 122).attr('y', 4).attr('id', 'successful-count').text('0');
    self.failed = self.toolTipBase.append('text').attr('fill', 'white').attr('font-size', 12).attr('x', 122).attr('y', 28).attr('id', 'failed-count').text('0');
    self.date = self.toolTipBase.append('text').attr('fill', 'white').attr('stroke', 'white').attr('x', 20).attr('y', -21).attr('font-size', 12).text(t('Never'));
    self.handleMouseOver = function (event, d) {
      var success = 0, fail = 0, total = 0;
      var pt = d3.pointer(event), x = pt[0], y = pt[1];
      var tooltipPointerX = x + 75;
      var formatTooltipDate = d3.timeFormat('%m/%d');
      if (!event) return;
      var toolTipWidth = self.toolTipBase.node().getBoundingClientRect().width;
      var chartWidth = d3.select(self.svg + '> svg').node().getBoundingClientRect().width;
      var overflow = 100 - (toolTipWidth / chartWidth) * 100;
      var flipped = overflow < (tooltipPointerX / chartWidth) * 100;
      if (d) { success = d.RAN || 0; fail = d.FAIL || 0; total = d.TOTAL || 0; self.date.text(formatTooltipDate(d.DATE)); }
      self.jobs.text(total + ' ' + self.label);
      self.jobsWidth = self.jobs.node().getComputedTextLength();
      self.failed.text('' + fail);
      self.successful.text('' + success);
      self.successTextWidth = self.successful.node().getComputedTextLength();
      self.failTextWidth = self.failed.node().getComputedTextLength();
      var maxTextPerc = (self.jobsWidth / self.boxWidth) * 100;
      var threshold = 40, overage = maxTextPerc / threshold;
      var adjustedWidth = maxTextPerc > threshold ? self.boxWidth * overage : self.boxWidth;
      self.boundingBox.attr('width', adjustedWidth);
      self.toolTipBase.attr('transform', 'translate(' + tooltipPointerX + ', ' + y + ')');
      if (flipped) {
        self.toolTipPoint.attr('transform', 'translate(-20, -10) rotate(45)');
        self.boundingBox.attr('x', -adjustedWidth - 20);
        self.circleGreen.attr('cx', -adjustedWidth); self.circleRed.attr('cx', -adjustedWidth);
        self.icon.attr('x', -adjustedWidth - 2);
        self.successText.attr('x', -adjustedWidth + 17); self.failText.attr('x', -adjustedWidth + 17);
        self.successful.attr('x', -self.successTextWidth - 20 - 12); self.failed.attr('x', -self.failTextWidth - 20 - 12);
        self.date.attr('x', -adjustedWidth - 5);
        self.jobs.attr('x', -self.jobsWidth / 2 - 14);
      } else {
        self.toolTipPoint.attr('transform', 'translate(10, -10) rotate(45)');
        self.boundingBox.attr('x', 10);
        self.circleGreen.attr('cx', 26); self.circleRed.attr('cx', 26);
        self.icon.attr('x', 24);
        self.successText.attr('x', 43); self.failText.attr('x', 43);
        self.successful.attr('x', adjustedWidth - self.successTextWidth); self.failed.attr('x', adjustedWidth - self.failTextWidth);
        self.date.attr('x', 20);
        self.jobs.attr('x', adjustedWidth);
      }
      self.toolTipBase.style('opacity', 1);
      self.toolTipBase.interrupt();
    };
    self.handleMouseOut = function () { self.toolTipBase.transition().delay(15).style('opacity', 0).style('pointer-events', 'none'); };
  }

  // LineChart.
  function draw() {
    var height = 220;
    var margin = { top: 15, right: 15, bottom: 62, left: 70 };
    d3.selectAll('#' + id + ' > *').remove();
    var width = parseInt(d3.select('#' + id).style('width'), 10) - margin.left - margin.right || 700;
    var textColor = getComputedStyle(document.body).getPropertyValue('--pf-t--global--text--color--100').trim() || '#151515';
    var gridColor = getComputedStyle(document.body).getPropertyValue('--pf-t--global--border--color--default').trim() || '#373a41';
    function tweenDash(_d, index, nodes) {
      var l = nodes[index].getTotalLength();
      var i = d3.interpolateString('0,' + l, l + ',' + l);
      return function (val) { return i(val); };
    }
    function transition(path) { path.transition().duration(1000).attrTween('stroke-dasharray', tweenDash); }
    var x = d3.scaleTime().rangeRound([0, width]);
    var y = d3.scaleLinear().range([height, 0]);
    var palette = d3.scaleOrdinal(['#079455', '#912018', '#4e5ba6']);
    var colors = function (series) { return palette(String(series)); };
    var svg = d3.select('#' + id).append('svg').attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom).attr('z', 100)
      .append('g').attr('id', 'chart-container').attr('transform', 'translate(' + margin.left + ', ' + margin.top + ')').attr('fill', '#f7f7f7');
    var tooltip = new Tooltip({ svg: '#' + id, colors: colors, label: t('Jobs') });
    var parseTime = d3.timeParse('%Y-%m-%d');
    var formatted = data.map(function (d) {
      var RAN = Number(d.successful) || 0, FAIL = Number(d.failed) || 0;
      return { DATE: parseTime(d.created) || new Date(), RAN: RAN, FAIL: FAIL, TOTAL: RAN + FAIL };
    });
    var largestY = formatted.reduce(function (aMax, b) { var bMax = Math.max(b.RAN > b.FAIL ? b.RAN : b.FAIL); return aMax > bMax ? aMax : bMax; }, 0);
    x.domain(d3.extent(formatted, function (d) { return d.DATE; }));
    y.domain([0, largestY > 4 ? largestY + Math.max(largestY / 10, 1) : 5]).nice();
    var successLine = d3.line().curve(d3.curveMonotoneX).x(function (d) { return x(d.DATE); }).y(function (d) { return y(d.RAN); });
    var failLine = d3.line().defined(function (d) { return typeof d.FAIL === 'number'; }).curve(d3.curveMonotoneX).x(function (d) { return x(d.DATE); }).y(function (d) { return y(d.FAIL); });
    svg.append('g').attr('class', 'y-axis')
      .call(d3.axisLeft(y).ticks(largestY > 3 ? Math.min(largestY + Math.max(largestY / 10, 1), 10) : 5).tickSize(-width).tickFormat(d3.format('d')))
      .selectAll('line').attr('stroke', gridColor);
    svg.selectAll('.y-axis .tick text').attr('x', -5).style('fill', textColor).style('font-size', '0.875rem');
    svg.append('text').attr('transform', 'rotate(-90)').attr('y', 0 - margin.left).attr('x', 0 - height / 2).attr('dy', '1em')
      .style('text-anchor', 'middle').style('fill', textColor).style('font-size', '0.9375rem').text(t('Job Runs'));
    var maxTicks = Math.round(formatted.length / (formatted.length / 2));
    var ticks = formatted.map(function (d) { return d.DATE; });
    if (formatted.length === 31) ticks = formatted.map(function (d, i) { return i % maxTicks === 0 ? d.DATE : undefined; }).filter(Boolean);
    svg.select('.domain').attr('stroke', gridColor);
    svg.append('g').attr('class', 'x-axis').attr('transform', 'translate(0, ' + height + ')')
      .call(d3.axisBottom(x).tickValues(ticks).tickSize(-height).tickFormat(d3.timeFormat('%-m/%-d')))
      .selectAll('line').attr('stroke', gridColor);
    svg.selectAll('.x-axis .tick text').attr('y', 10).style('fill', textColor).style('font-size', '0.875rem');
    svg.append('text').attr('transform', 'translate(' + (width / 2) + ' , ' + (height + margin.bottom - 5) + ')')
      .style('text-anchor', 'middle').style('fill', textColor).style('font-size', '0.9375rem').text(t('Date'));
    var vertical = svg.append('path').attr('class', 'mouse-line').style('stroke', textColor).style('stroke-width', '3px').style('stroke-dasharray', '3, 3').style('opacity', '0');
    function over(event, d) { tooltip.handleMouseOver(event, d); vertical.transition().style('opacity', '1'); }
    function move(event) { var px = d3.pointer(event)[0]; vertical.attr('d', function () { return 'M' + px + ',' + height + ' ' + px + ',' + 0; }); }
    function out() { tooltip.handleMouseOut(); vertical.transition().style('opacity', 0); }
    var dateFormat = d3.timeFormat('%-m-%-d');
    if (jobStatus !== 'failed') {
      svg.append('path').data([formatted]).attr('class', 'line').style('fill', 'none').style('stroke', function () { return colors(1); }).attr('stroke-width', 2).attr('d', successLine).call(transition);
      svg.selectAll('dot').data(formatted).enter().append('circle').attr('r', 3).style('stroke', function () { return colors(1); }).style('fill', function () { return colors(1); })
        .attr('cx', function (d) { return x(d.DATE); }).attr('cy', function (d) { return y(d.RAN); }).attr('id', function (d) { return 'success-dot-' + dateFormat(d.DATE); })
        .on('mouseover', over).on('mousemove', move).on('mouseout', out);
    }
    if (jobStatus !== 'successful') {
      svg.append('path').data([formatted]).attr('class', 'line').style('fill', 'none').style('stroke', function () { return colors(0); }).attr('stroke-width', 2).attr('d', failLine).call(transition);
      svg.selectAll('dot').data(formatted).enter().append('circle').attr('r', 3).style('stroke', function () { return colors(0); }).style('fill', function () { return colors(0); })
        .attr('cx', function (d) { return x(d.DATE); }).attr('cy', function (d) { return y(d.FAIL); }).attr('id', function (d) { return 'fail-dot-' + dateFormat(d.DATE); })
        .on('mouseover', over).on('mousemove', move).on('mouseout', out);
    }
  }

  // The chart is drawn for the width it has, which the job status tab only
  // has while it is shown.
  window.addEventListener('resize', function () { if (root.offsetWidth) draw(); });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#dashboard-tab-0')) setTimeout(draw, 0);
  });
  load();
})();
