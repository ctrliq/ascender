/**
 * The debounce utility creates a debounced version of the provided
 * function. The debounced function delays invocation until after
 * the given time interval (milliseconds) has elapsed since the last
 * time the function was called. This means that if you call the
 * debounced function repeatedly, it will only run once after it
 * stops being called.
 */
const debounce = <Args extends unknown[]>(
  func: (...args: Args) => void,
  interval: number
): ((...args: Args) => void) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, interval);
  };
};

export default debounce;
