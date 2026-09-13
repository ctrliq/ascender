export default function computeForks(
  memCapacity: number,
  cpuCapacity: number,
  selectedCapacityAdjustment: number
): number {
  const minCapacity = Math.min(memCapacity, cpuCapacity);
  const maxCapacity = Math.max(memCapacity, cpuCapacity);

  return Math.floor(
    minCapacity + (maxCapacity - minCapacity) * selectedCapacityAdjustment
  );
}
