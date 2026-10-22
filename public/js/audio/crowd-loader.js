import { houseBufferLayout, renderApplause, renderHouse } from './crowd.js';

const PROFILES = [
  { seconds: 5.5, seed: 11 },
  { seconds: 10, seed: 21 },
  { seconds: 10, seed: 22 },
  { seconds: 15, seed: 31, rhythmic: true },
];

// Keep the original synthesizer and PCM format. Only its execution moves off
// the UI thread; Web Audio objects are created in the owning AudioContext.
export function prepareCrowd(ctx, { lite = false, house: preparedHouse = null } = {}) {
  // These are the venue's existing sound-design settings, including both
  // nearby clappers and the full-house wash. The worker changes no PCM math.
  const sr = lite ? 16000 : 24000;
  const profiles = PROFILES.map(profile => ({ ...profile, people: lite ? 200 : 320, sr }));
  const buffers = [];
  const houseLayout = houseBufferLayout();
  let house = preparedHouse;
  let worker = null;
  let pendingKind = null;
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
    result = { welcome: buffers[0], normal: [buffers[1], buffers[2]], finale: buffers[3], house };
    done = true;
    stopWorker();
    resolve(result);
    return result;
  };
  const finishHouseSync = () => {
    if (failure) throw failure;
    if (done) return house;
    try {
      // A direct setMurmur call still starts synchronously. Reuse a transferred
      // house, or let the pending worker response be discarded without copying
      // another nine AudioBuffers when this path has already rendered them.
      if (!house) house = renderHouse(ctx, { lite });
      return house;
    } catch (error) {
      done = true;
      failure = error;
      stopWorker();
      reject(error);
      throw error;
    }
  };
  const finishSync = () => {
    if (failure) throw failure;
    if (done) return result;
    stopWorker();
    try {
      finishHouseSync();
      // A failure after one or more transfers retains those exact buffers.
      for (let i = buffers.length; i < profiles.length; i++) buffers.push(renderApplause(ctx, profiles[i]));
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
    // Request/response is also backpressure: never queue all four PCM pairs
    // while their AudioBuffer copies are being made. A stalled worker falls back.
    clearTimeout(timeout);
    timeout = setTimeout(fallback, 30000);
    pendingKind = house ? 'applause' : 'house';
    worker.postMessage(pendingKind === 'applause'
      ? { kind: 'applause', index: buffers.length, options: profiles[buffers.length] }
      : { kind: 'house', index: -1, options: { lite } });
  };

  try {
    worker = new Worker(new URL('./crowd-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (done) return;
      try {
        if (pendingKind === 'house') {
          const validHouse = data?.kind === 'house' && data.index === -1
            && Array.isArray(data.buffers) && data.buffers.length === houseLayout.length
            && data.buffers.every((buffer, i) => {
              const expected = houseLayout[i];
              return buffer?.length === expected.length && buffer.sampleRate === expected.sampleRate
                && Array.isArray(buffer.channels) && buffer.channels.length === expected.numberOfChannels
                && buffer.channels.every(channel => channel instanceof Float32Array && channel.length === expected.length);
            });
          if (!validHouse) throw new Error('Invalid house worker result');
          if (!house) {
            const copied = data.buffers.map((pcm, i) => {
              const expected = houseLayout[i];
              const buffer = ctx.createBuffer(expected.numberOfChannels, expected.length, expected.sampleRate);
              for (let channel = 0; channel < expected.numberOfChannels; channel++) buffer.getChannelData(channel).set(pcm.channels[channel]);
              return buffer;
            });
            house = { bed: copied[0], shots: houseLayout.slice(1).map((expected, i) => ({ kind: expected.kind, buf: copied[i + 1] })) };
          }
          requestNext();
          return;
        }
        const index = buffers.length;
        const length = Math.floor(profiles[index].seconds * sr);
        const valid = layer => layer?.sampleRate === sr && layer.length === length
          && Array.isArray(layer.channels) && layer.channels.length === 2
          && layer.channels.every(channel => channel instanceof Float32Array && channel.length === length);
        if (data?.kind !== 'applause' || data.index !== index || !valid(data.layers?.close) || !valid(data.layers?.wash)) {
          throw new Error('Invalid applause worker result');
        }
        const pair = {};
        for (const name of ['close', 'wash']) {
          const buffer = ctx.createBuffer(2, length, sr);
          for (let channel = 0; channel < 2; channel++) buffer.getChannelData(channel).set(data.layers[name].channels[channel]);
          pair[name] = buffer;
        }
        buffers.push(pair);
        if (buffers.length === profiles.length) complete(); else requestNext();
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
    finishHouseSync,
    finishSync,
    cancel() {
      if (done) return;
      done = true;
      stopWorker();
      buffers.length = 0;
      house = null;
      resolve(null); // A replaced AudioContext must never receive stale results.
    },
  };
}
