// One 100 ms display clock while explicitly playing; never start audio or retain files.
export function createPlaybackTicker(update, clock = globalThis) {
  let timer;
  return {
    start() { if (timer === undefined) timer = clock.setInterval(update, 100); },
    stop() { if (timer !== undefined) { clock.clearInterval(timer); timer = undefined; } },
  };
}
