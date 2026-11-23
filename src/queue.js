const MAX_QUEUE = 5;
const pending = [];
let busy = false;

function tick() {
  if (busy) return;
  const job = pending.shift();
  if (!job) return;
  busy = true;
  Promise.resolve()
    .then(job)
    .catch(() => {})
    .finally(() => {
      busy = false;
      setImmediate(tick);
    });
}

function push(job) {
  if (pending.length >= MAX_QUEUE) return false;
  pending.push(job);
  tick();
  return true;
}

function stats() {
  return { busy, queued: pending.length };
}

module.exports = { push, stats };
