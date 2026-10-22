import { renderApplause, renderHouse } from './crowd.js';

// A worker has no AudioContext. This small adapter supplies the only API used
// by the unchanged synthesizer and exposes transferable PCM channel buffers.
self.onmessage = ({ data: { kind, index, options } }) => {
  const ctx = {
    createBuffer(numberOfChannels, length, sampleRate) {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return { length, sampleRate, channels, getChannelData: channel => channels[channel] };
    },
  };
  const serialize = buffer => ({ length: buffer.length, sampleRate: buffer.sampleRate, channels: buffer.channels });
  if (kind === 'house') {
    const house = renderHouse(ctx, options);
    const buffers = [house.bed, ...house.shots.map(shot => shot.buf)].map(serialize);
    self.postMessage({ kind, index, buffers }, buffers.flatMap(buffer => buffer.channels.map(channel => channel.buffer)));
    return;
  }
  const pair = renderApplause(ctx, options);
  const layers = Object.fromEntries(Object.entries(pair).map(([name, buffer]) => [name, {
    length: buffer.length, sampleRate: buffer.sampleRate, channels: buffer.channels,
  }]));
  self.postMessage({ kind, index, layers }, Object.values(layers).flatMap(buffer => buffer.channels.map(channel => channel.buffer)));
};
