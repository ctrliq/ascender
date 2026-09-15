import React, { useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { useLingui } from '@lingui/react/macro';
import { PageContextConsumer } from '@patternfly/react-core';
import ChartTooltip from './ChartTooltip';
import type { ChartPoint } from './ChartTooltip';

/** One day of the dashboard's job graph, as DashboardGraph assembles it. */
export interface JobGraphDay {
  /** The day, as an ISO date. */
  created: string;
  successful?: number;
  failed?: number;
}

export interface LineChartProps {
  id: string;
  data: JobGraphDay[];
  height: number;
  /**
   * PatternFly's page context, which the chart redraws on: the width it has
   * changes when the sidebar opens. PatternFly 4 called this isNavOpen, which
   * is the name that was read here until now, and 6 has no such property.
   */
  pageContext: { isSidebarOpen?: boolean };
  /** Which series the graph is showing: all, successful or failed. */
  jobStatus: string;
}

function LineChart({
  id,
  data,
  height,
  pageContext,
  jobStatus,
}: LineChartProps) {
  const { isSidebarOpen } = pageContext;
  const { t } = useLingui();

  // Methods
  const draw = useCallback(() => {
    const margin = { top: 15, right: 15, bottom: 62, left: 70 };

    const getWidth = () => {
      let width;
      // This is in an a try/catch due to an error from the test runner.
      // Even though the d3.select returns a valid selector with
      // style function, it says it is null in the test
      try {
        width =
          parseInt(d3.select(`#${id}`).style('width'), 10) -
            margin.left -
            margin.right || 700;
      } catch (error) {
        width = 700;
      }
      return width;
    };

    // Clear our chart container element first
    d3.selectAll(`#${id} > *`).remove();
    const width = getWidth();

    const textColor =
      getComputedStyle(document.body)
        .getPropertyValue('--pf-t--global--text--color--100')
        .trim() || '#151515';
    const gridColor =
      getComputedStyle(document.body)
        .getPropertyValue('--pf-t--global--border--color--default')
        .trim() || '#373a41';

    // The selection the line was drawn into: one path element holding the
    // whole series, which is what call() hands this.
    function transition(
      path: d3.Selection<SVGPathElement, ChartPoint[], HTMLElement, unknown>
    ) {
      path.transition().duration(1000).attrTween('stroke-dasharray', tweenDash);
    }

    // d3 calls this with (datum, index, nodes); only the last two are used.
    // d3 calls this with (datum, index, nodes), and the element is reached
    // through the last two rather than through this: an arrow function here
    // would not have the element as its this at all.
    function tweenDash(
      _datum: unknown,
      index: number,
      nodes: ArrayLike<SVGPathElement>
    ) {
      const l = (nodes[index] as SVGPathElement).getTotalLength();
      const i = d3.interpolateString(`0,${l}`, `${l},${l}`);
      return (val: number) => i(val);
    }

    const x = d3.scaleTime().rangeRound([0, width]);
    const y = d3.scaleLinear().range([height, 0]);

    // [success, fail, total]
    // d3 keys an ordinal scale by string; this chart passes the series
    // number, which the scale stringifies on the way in.
    const palette = d3.scaleOrdinal(['#079455', '#912018', '#4e5ba6']);
    const colors = (series: number) => palette(String(series));
    const svg = d3
      .select(`#${id}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      // .attr('id', 'foo')
      .attr('z', 100)
      .append('g')
      .attr('id', 'chart-container')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)
      .attr('fill', '#f7f7f7');
    // Tooltip
    const tooltip = new ChartTooltip({
      svg: `#${id}`,
      colors,
      label: t`Jobs`,
    });
    const parseTime = d3.timeParse('%Y-%m-%d');

    const formattedData = data.reduce(
      (
        formatted: ChartPoint[],
        { created, successful, failed }: JobGraphDay
      ) => {
        const DATE = parseTime(created) || new Date();
        const RAN = Number(successful) || 0;
        const FAIL = Number(failed) || 0;
        const TOTAL = RAN + FAIL;
        return formatted.concat({ DATE, RAN, FAIL, TOTAL });
      },
      []
    );
    // Scale the range of the data
    const largestY = formattedData.reduce((a_max: number, b: ChartPoint) => {
      const b_max = Math.max(b.RAN > b.FAIL ? b.RAN : b.FAIL);
      return a_max > b_max ? a_max : b_max;
    }, 0);
    x.domain(
      d3.extent(formattedData, (d: ChartPoint) => d.DATE) as [Date, Date]
    );
    y.domain([
      0,
      largestY > 4 ? largestY + Math.max(largestY / 10, 1) : 5,
    ]).nice();

    const successLine = d3
      .line<ChartPoint>()
      .curve(d3.curveMonotoneX)
      .x((d: ChartPoint) => x(d.DATE))
      .y((d: ChartPoint) => y(d.RAN));

    const failLine = d3
      .line<ChartPoint>()
      .defined((d: ChartPoint) => typeof d.FAIL === 'number')
      .curve(d3.curveMonotoneX)
      .x((d: ChartPoint) => x(d.DATE))
      .y((d: ChartPoint) => y(d.FAIL));
    // Add the Y Axis
    svg
      .append('g')
      .attr('class', 'y-axis')
      .call(
        d3
          .axisLeft(y)
          .ticks(
            largestY > 3
              ? Math.min(largestY + Math.max(largestY / 10, 1), 10)
              : 5
          )
          .tickSize(-width)
          .tickFormat(d3.format('d'))
      )
      .selectAll('line')
      .attr('stroke', gridColor);
    svg
      .selectAll('.y-axis .tick text')
      .attr('x', -5)
      .style('fill', textColor)
      .style('font-size', '0.875rem');

    // text label for the y axis
    svg
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - margin.left)
      .attr('x', 0 - height / 2)
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .style('fill', textColor)
      .style('font-size', '0.9375rem')
      .text(t`Job Runs`);

    // Add the X Axis
    let ticks;
    const maxTicks = Math.round(
      formattedData.length / (formattedData.length / 2)
    );
    ticks = formattedData.map((d: ChartPoint) => d.DATE);
    if (formattedData.length === 31) {
      ticks = formattedData
        .map((d: ChartPoint, i: number) =>
          i % maxTicks === 0 ? d.DATE : undefined
        )
        .filter((item): item is Date => Boolean(item));
    }

    svg.select('.domain').attr('stroke', gridColor);

    svg
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0, ${height})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues(ticks)
          .tickSize(-height)
          // d3 types the formatter by the scale's own domain, which is a
          // Date here, and the axis by the wider NumberValue it accepts.
          .tickFormat(
            d3.timeFormat('%-m/%-d') as unknown as (
              domainValue: d3.NumberValue
            ) => string
          ) // "1/19"
      ) // "Jan-01"
      .selectAll('line')
      .attr('stroke', gridColor);

    svg
      .selectAll('.x-axis .tick text')
      .attr('y', 10)
      .style('fill', textColor)
      .style('font-size', '0.875rem');

    // text label for the x axis
    svg
      .append('text')
      .attr(
        'transform',
        `translate(${width / 2} , ${height + margin.bottom - 5})`
      )
      .style('text-anchor', 'middle')
      .style('fill', textColor)
      .style('font-size', '0.9375rem')
      .text(t`Date`);
    const vertical = svg
      .append('path')
      .attr('class', 'mouse-line')
      .style('stroke', textColor)
      .style('stroke-width', '3px')
      .style('stroke-dasharray', '3, 3')
      .style('opacity', '0');

    const handleMouseOver = (event: MouseEvent, d: ChartPoint) => {
      tooltip.handleMouseOver(event, d);
      // show vertical line
      vertical.transition().style('opacity', '1');
    };
    const handleMouseMove = function mouseMove(event: MouseEvent) {
      const [pointerX] = d3.pointer(event);
      vertical.attr('d', () => `M${pointerX},${height} ${pointerX},${0}`);
    };

    const handleMouseOut = () => {
      // hide tooltip
      tooltip.handleMouseOut();
      // hide vertical line
      vertical.transition().style('opacity', 0);
    };

    const dateFormat = d3.timeFormat('%-m-%-d');

    if (jobStatus !== 'failed') {
      // Add the success line path.
      svg
        .append('path')
        .data([formattedData])
        .attr('class', 'line')
        .style('fill', 'none')
        .style('stroke', () => colors(1))
        .attr('stroke-width', 2)
        .attr('d', successLine)
        .call(transition);

      // create our success line circles

      svg
        .selectAll('dot')
        .data<ChartPoint>(formattedData)
        .enter()
        .append('circle')
        .attr('r', 3)
        .style('stroke', () => colors(1))
        .style('fill', () => colors(1))
        .attr('cx', (d: ChartPoint) => x(d.DATE))
        .attr('cy', (d: ChartPoint) => y(d.RAN))
        .attr('id', (d: ChartPoint) => `success-dot-${dateFormat(d.DATE)}`)
        .on('mouseover', (event: MouseEvent, d: ChartPoint) =>
          handleMouseOver(event, d)
        )
        .on('mousemove', handleMouseMove)
        .on('mouseout', handleMouseOut);
    }

    if (jobStatus !== 'successful') {
      // Add the failed line path.
      svg
        .append('path')
        .data([formattedData])
        .attr('class', 'line')
        .style('fill', 'none')
        .style('stroke', () => colors(0))
        .attr('stroke-width', 2)
        .attr('d', failLine)
        .call(transition);

      // create our failed line circles

      svg
        .selectAll('dot')
        .data<ChartPoint>(formattedData)
        .enter()
        .append('circle')
        .attr('r', 3)
        .style('stroke', () => colors(0))
        .style('fill', () => colors(0))
        .attr('cx', (d: ChartPoint) => x(d.DATE))
        .attr('cy', (d: ChartPoint) => y(d.FAIL))
        .attr('id', (d: ChartPoint) => `fail-dot-${dateFormat(d.DATE)}`)
        .on('mouseover', handleMouseOver)
        .on('mousemove', handleMouseMove)
        .on('mouseout', handleMouseOut);
    }
  }, [data, height, id, jobStatus, t]);

  useEffect(() => {
    draw();
  }, [draw, isSidebarOpen]);

  useEffect(() => {
    function handleResize() {
      draw();
    }

    window.addEventListener('resize', handleResize);

    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return <div id={id} style={{ marginTop: '3rem' }} />;
}

// PatternFly's page context says whether the nav is open, which changes the
// width the chart has to draw in.
const withPageContext = (Component: React.ComponentType<LineChartProps>) =>
  function contextComponent(props: Omit<LineChartProps, 'pageContext'>) {
    return (
      <PageContextConsumer>
        {(pageContext: { isSidebarOpen?: boolean }) => (
          <Component {...props} pageContext={pageContext} />
        )}
      </PageContextConsumer>
    );
  };

export default withPageContext(LineChart);
