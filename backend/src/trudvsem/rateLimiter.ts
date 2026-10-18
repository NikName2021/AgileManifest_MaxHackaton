// Запросы к trudvsem — по одному и с минимальным интервалом. Официальных лимитов нет,
// значение консервативное.
const MIN_INTERVAL_MS = 300;

let queue: Promise<void> = Promise.resolve();
let lastCallAt = 0;

export function withTrudvsemRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
    return fn();
  };

  const result = queue.then(run, run);
  // Ошибка одного вызова не должна блокировать очередь.
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
