// The d3 the worker uses arrives through importScripts at runtime, from the
// standalone d3-force build rather than from the package @types/d3 describes,
// so it is named separately here rather than declared as a global.

/** A force, which the simulation is given one of per named slot below. */
interface WorkerForce {
  /** Charge only: how hard the bodies push each other apart. */
  strength?: (n: number) => WorkerForce;
  /** Link only: what identifies the node at either end of a link. */
  id?: (accessor: (d: { hostname: string }) => string) => WorkerForce;
}

/**
 * The simulation itself, which is run to completion here rather than ticked
 * on a timer: the worker reports its progress and posts the laid out nodes.
 */
interface WorkerSimulation {
  force: (name: string, force: WorkerForce) => WorkerSimulation;
  stop: () => WorkerSimulation;
  tick: () => WorkerSimulation;
  alphaMin: () => number;
  alphaDecay: () => number;
}

interface WorkerD3 {
  forceSimulation: (nodes: unknown[]) => WorkerSimulation;
  forceManyBody: (n?: number) => Required<Pick<WorkerForce, 'strength'>>;
  forceLink: (links: unknown[]) => Required<Pick<WorkerForce, 'id'>>;
  forceCollide: (n: number) => WorkerForce;
  forceX: (n: number) => WorkerForce;
  forceY: (n: number) => WorkerForce;
}
declare function importScripts(...urls: string[]): void;

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

// `self` is the worker's own global scope, which is where those five leave d3.
// eslint-disable-next-line no-restricted-globals
const workerD3 = (self as unknown as { d3: WorkerD3 }).d3;

onmessage = function calculateLayout({ data: { nodes, links } }) {
  const simulation = workerD3
    .forceSimulation(nodes)
    .force('charge', workerD3.forceManyBody(15).strength(-50))
    .force(
      'link',
      workerD3.forceLink(links).id((d: { hostname: string }) => d.hostname)
    )
    .force('collide', workerD3.forceCollide(62))
    .force('forceX', workerD3.forceX(0))
    .force('forceY', workerD3.forceY(0))
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
