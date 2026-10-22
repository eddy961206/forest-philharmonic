import { renderApplause } from './crowd.js';

// A worker has no AudioContext. This small adapter supplies the only API used
// by the unchanged synthesizer and exposes transferable PCM channel buffers.
self.onmessage = ({ data: { index, options } }) => {
  const pair = renderApplause({
    createBuffer(numberOfChannels, length, sampleRate) {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return { length, sampleRate, channels, getChannelData: channel => channels[channel] };
    },
  }, options);
  const layers = Object.fromEntries(Object.entries(pair).map(([name, buffer]) => [name, {
    length: buffer.length, sampleRate: buffer.sampleRate, channels: buffer.channels,
  }]));
  self.postMessage({ index, layers }, Object.values(layers).flatMap(buffer => buffer.channels.map(channel => channel.buffer)));
};
