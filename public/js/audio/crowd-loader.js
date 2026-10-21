import { renderApplause } from './crowd.js';

const PROFILES = [
  { seconds: 5.5, people: 120, seed: 11 },
  { seconds: 10, people: 170, seed: 21 },
  { seconds: 10, people: 170, seed: 22 },
  { seconds: 15, people: 240, seed: 31, rhythmic: true },
];

// Keep the original synthesizer and PCM format. Only its execution moves off
// the UI thread; Web Audio objects are created in the owning AudioContext.
export function prepareCrowd(ctx) {
  const buffers = [];
  let worker = null;
  let timeout = null;
  let done = false;
  let result = null;
  let failure = null;
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });

  const stopWorker = () => {
    clearTimeout(timeout);
    timeout = null;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
  };
  const complete = () => {
    result = { welcome: buffers[0], normal: [buffers[1], buffers[2]], finale: buffers[3] };
    done = true;
    stopWorker();
    resolve(result);
    return result;
  };
  const finishSync = () => {
    if (failure) throw failure;
    if (done) return result;
    stopWorker();
    try {
      // A failure after one or more transfers retains those exact buffers.
      for (let i = buffers.length; i < PROFILES.length; i++) buffers.push(renderApplause(ctx, PROFILES[i]));
      return complete();
    } catch (error) {
      done = true;
      failure = error;
      reject(error);
      throw error;
    }
  };
  const fallback = event => {
    event?.preventDefault?.();
    if (done) return;
    try { finishSync(); } catch { /* the preparation promise reports the error */ }
  };
  const requestNext = () => {
    // Request/response is also backpressure: never queue all four PCM buffers
    // while their AudioBuffer copies are being made. A stalled worker falls back.
    clearTimeout(timeout);
    timeout = setTimeout(fallback, 30000);
    worker.postMessage({ index: buffers.length, options: PROFILES[buffers.length] });
  };

  try {
    worker = new Worker(new URL('./crowd-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (done) return;
      try {
        const index = buffers.length;
        const length = Math.floor(PROFILES[index].seconds * 44100);
        if (data?.index !== index || data.sampleRate !== 44100 || data.length !== length || !Array.isArray(data.channels) || data.channels.length !== 2 || !data.channels.every(channel => channel instanceof Float32Array && channel.length === length)) {
          throw new Error('Invalid applause worker result');
        }
        const buffer = ctx.createBuffer(2, length, 44100);
        for (let channel = 0; channel < 2; channel++) buffer.getChannelData(channel).set(data.channels[channel]);
        buffers.push(buffer);
        if (buffers.length === PROFILES.length) complete(); else requestNext();
      } catch {
        fallback();
      }
    };
    worker.onerror = worker.onmessageerror = fallback;
    requestNext();
  } catch {
    fallback(); // Older browsers, CSP restrictions, or a failed Worker constructor.
  }

  return {
    promise,
    finishSync,
    cancel() {
      if (done) return;
      done = true;
      stopWorker();
      buffers.length = 0;
      resolve(null); // A replaced AudioContext must never receive stale results.
    },
  };
}
