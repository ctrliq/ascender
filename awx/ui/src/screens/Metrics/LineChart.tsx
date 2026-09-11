import type { Untyped } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import * as d3 from 'd3';

export interface LineChartProps {
  data: Untyped[];
  helpText: Untyped;
  [key: string]: unknown;
}

function LineChart({ data, helpText }: LineChartProps) {
  const { t } = useLingui();
  const count = data[0]?.values.length;
  const draw = useCallback(() => {
    const margin = 80;
    const getWidth = () => {
      let width;
      // This is in an a try/catch due to an error from the test runner.
      // Even though the d3.select returns a valid selector with
      // style function, it says it is null in the test
      try {
        width =
          parseInt(d3.select(`#chart`).style('width'), 10) - margin || 700;
      } catch (error) {
        width = 700;
      }

      return width;
    };
    const width = getWidth();
    const height = 500;
    const duration = 250;
    const circleRadius = 6;
    const circleRadiusHover = 8;

    /* Scale */
    let smallestY: Untyped;
    let largestY: Untyped;
    data.map((line) =>
      line.values.forEach((value: Untyped) => {
        if (smallestY === undefined) {
          smallestY = value.y;
        }
        if (value.y < smallestY) {
          smallestY = value.y;
        }
        if (largestY === undefined) {
          largestY = smallestY + 10;
        }
        if (value.y > largestY) {
          largestY = value.y;
        }
      })
    );

    const firstValues: Untyped[] = data[0]?.values ?? [];
    const xScale = d3
      .scaleLinear()
      .domain(
        (d3.max(firstValues, (d: Untyped) => d.x) ?? 0) > 49
          ? (d3.extent(firstValues, (d: Untyped) => d.x) as [number, number])
          : [0, 50]
      )
      .range([0, width - margin]);

    const yScale = d3
      .scaleLinear()
      .domain([smallestY, largestY] as [number, number])
      .range([height - margin, 0]);

    const color = d3.scaleOrdinal<number, string>(d3.schemeCategory10);
    /* Add SVG */
    d3.selectAll(`#chart > *`).remove();

    const renderTooltip = (d: Untyped) => {
      d3.selectAll(`.tooltip > *`).remove();

      d3.select('#chart')
        .append('span')
        .attr('class', 'tooltip')
        .attr('stroke', 'black')
        .attr('fill', 'white')
        .style('padding-left', '50px');
      const tooltip: Record<string, Untyped> = {};
      data.map((datum) => {
        datum.values.forEach((value: Untyped) => {
          if (d.x === value.x) {
            tooltip[datum.name] = value.y;
          }
        });
        return tooltip;
      });
      Object.entries(tooltip).forEach(([key, value], i) => {
        d3.select('.tooltip')
          .append('span')
          .attr('class', 'tooltip-text-wrapper')
          .append('text')
          .attr('class', 'tooltip-text')
          .style('color', color(i))
          .style('padding-right', '20px')
          .text(`${key}: ${value}`);
      });
    };
    const removeTooltip = () => {
      d3.select('.tooltip')
        .style('cursor', 'none')
        .selectAll(`.tooltip > *`)
        .remove();
    };

    // Add legend
    d3.selectAll(`.legend > *`).remove();
    const legendContainer = d3
      .select('#chart')
      .append('div')
      .style('display', 'flex')
      .attr('class', 'legend')
      .attr('height', '400px')
      .attr('width', '500px')
      .style('padding-left', '50px');

    legendContainer
      .append('text')
      .attr('class', 'legend-title')
      .attr('x', '100')
      .attr('y', '50')
      .text(t`Legend`);

    // The key function is where this draws a legend row per series, so it
    // returns nothing and d3's own typing for it does not apply.
    legendContainer.data(data, ((d: Untyped, i: number) => {
      if (d?.name) {
        const legendItemContainer = legendContainer
          .append('div')
          .style('display', 'flex')
          .attr('id', 'legend-item-container')
          .style('padding-left', '20px');

        legendItemContainer
          .append('div')
          .style('background-color', color(i))
          .style('height', '8px')
          .style('width', '8px')
          .style('border-radius', '50%')
          .style('padding', '5px')
          .style('margin-top', '6px');

        legendItemContainer
          .append('text')
          .style('padding-left', '20px')
          .text(d.name);
      }
    }) as Untyped);

    // Add help text to top of chart

    d3.select('#chart')
      .append('div')
      .attr('class', 'help-text')
      .style('padding-left', '50px')
      .style('padding-top', '20px')
      .text(helpText);

    const svg = d3
      .select('#chart')
      .append('svg')
      .attr('width', `${width + margin}px`)
      .attr('height', `${height + margin}px`)
      .append('g')
      .attr('transform', `translate(${margin}, ${margin})`);

    /* Add line into SVG */
    const line = d3
      .line<Untyped>()
      .curve(d3.curveMonotoneX)
      .x((d) => xScale(d.x))
      .y((d) => yScale(d.y));

    const lines = svg.append('g');

    lines
      .selectAll('.line-group')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'line-group')
      .append('path')
      .attr('class', 'line')
      .style('fill', 'none')
      .attr('d', (d: Untyped) => line(d.values))
      .style('stroke', (d, i) => color(i))
      .style('stroke-width', '3px');

    /* Add circles in the line */
    lines
      .selectAll('circle-group')
      .data(data)
      .enter()
      .append('g')
      .style('fill', (d, i) => color(i))
      .selectAll('circle')
      .data((d: Untyped) => d.values)
      .enter()
      .append('g')
      .attr('class', 'circle')
      .on('mouseover', (_event, d) => {
        if (data.length) {
          renderTooltip(d);
        }
      })
      .on('mouseout', () => {
        removeTooltip();
      })
      .append('circle')
      .attr('cx', (d: Untyped) => xScale(d.x))
      .attr('cy', (d: Untyped) => yScale(d.y))
      .attr('r', circleRadius)
      // Regular functions, because d3 binds the hovered element to `this` and
      // an arrow would take the enclosing scope's instead.
      .on('mouseover', function grow(this: SVGCircleElement) {
        d3.select(this)
          .transition()
          .duration(duration)
          .attr('r', circleRadiusHover);
      })
      .on('mouseout', function shrink(this: SVGCircleElement) {
        d3.select(this).transition().duration(duration).attr('r', circleRadius);
      });

    /* Add Axis into SVG */
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(firstValues.length > 5 ? firstValues.length : 5);
    const yAxis = d3.axisLeft(yScale).ticks(5);

    svg
      .append('g')
      .attr('class', 'x axis')
      .attr('transform', `translate(0, ${height - margin})`)
      .call(xAxis);

    svg.append('g').attr('class', 'y axis').call(yAxis);
  }, [data, helpText, t]);

  useEffect(() => {
    draw();
  }, [count, draw]);

  useEffect(() => {
    function handleResize() {
      draw();
    }

    window.addEventListener('resize', handleResize);

    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return <div id="chart" />;
}

export default LineChart;
