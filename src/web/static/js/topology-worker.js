/* Topology view layout: util/simulationWorker. The force simulation runs
   to completion here on the standalone d3-force v1 builds, reporting its
   progress, and posts the laid out nodes back. */
importScripts('/static/js/d3-collection.v1.min.js');
importScripts('/static/js/d3-dispatch.v1.min.js');
importScripts('/static/js/d3-quadtree.v1.min.js');
importScripts('/static/js/d3-timer.v1.min.js');
importScripts('/static/js/d3-force.v1.min.js');
var d3 = self.d3;
onmessage = function (event) {
  var nodes = event.data.nodes, links = event.data.links;
  var simulation = d3.forceSimulation(nodes)
    .force('charge', d3.forceManyBody(15).strength(-50))
    .force('link', d3.forceLink(links).id(function (d) { return d.hostname; }))
    .force('collide', d3.forceCollide(62))
    .force('forceX', d3.forceX(0))
    .force('forceY', d3.forceY(0))
    .stop();
  for (var i = 0, n = Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())); i < n; ++i) {
    postMessage({ type: 'tick', progress: i / n });
    simulation.tick();
  }
  postMessage({ type: 'end', nodes: nodes, links: links });
};
