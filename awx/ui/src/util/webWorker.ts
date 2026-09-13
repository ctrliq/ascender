export default function webWorker(): Worker {
  return new Worker(new URL('./simulationWorker.js', import.meta.url));
}
