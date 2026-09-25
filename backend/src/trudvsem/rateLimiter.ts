// Простой rate limiter для исходящих запросов к trudvsem: не больше одного запроса
// одновременно и минимальный интервал между вызовами. Раздел 8/12 ТЗ — "ограничение
// частоты запросов" как защита от abuse и от лишней нагрузки на внешний сервис.
// Официальные лимиты trudvsem нигде не опубликованы, поэтому берём консервативное значение.
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
  // Отвязываем очередь от результата/ошибки конкретного вызова — одна упавшая
  // задача не должна блокировать очередь для остальных.
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
