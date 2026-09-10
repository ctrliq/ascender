/* eslint-disable no-undef */

// Absolute rather than relative to this file. These five live in
// public/static/js and are served at /static/js by the dev server and by
// Django alike. Relative paths only worked because the bundler used to emit
// this worker into that same directory, which is not where it is served from
// during development.
importScripts('/static/js/d3-collection.v1.min.js');
importScripts('/static/js/d3-dispatch.v1.min.js');
importScripts('/static/js/d3-quadtree.v1.min.js');
importScripts('/static/js/d3-timer.v1.min.js');
importScripts('/static/js/d3-force.v1.min.js');

onmessage = function calculateLayout({ data: { nodes, links } }) {
  const simulation = d3
    .forceSimulation(nodes)
    .force('charge', d3.forceManyBody(15).strength(-50))
    .force(
      'link',
      d3.forceLink(links).id((d) => d.hostname)
    )
    .force('collide', d3.forceCollide(62))
    .force('forceX', d3.forceX(0))
    .force('forceY', d3.forceY(0))
    .stop();

  for (
    let i = 0,
      n = Math.ceil(
        Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())
      );
    i < n;
    ++i
  ) {
    postMessage({ type: 'tick', progress: i / n });
    simulation.tick();
  }

  postMessage({ type: 'end', nodes, links });
};
