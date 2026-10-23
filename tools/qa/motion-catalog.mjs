// Read the live program registry. Adding a venue or score automatically expands
// the audit; there is no separate hand-maintained list of 82 fixtures.
import fs from 'node:fs';
import { SETLISTS } from '../../public/js/programs.js';

export function motionCatalog() {
  const entries = new Map();
  for (const [venue, ids] of Object.entries(SETLISTS)) for (const id of ids) {
    if (!entries.has(id)) entries.set(id, {
      id, venues: [], piece: JSON.parse(fs.readFileSync(new URL(`../../public/music/${id}.json`, import.meta.url))),
    });
    entries.get(id).venues.push(venue);
  }
  return [...entries.values()];
}

export function densestEntry(notes, seconds = 2) {
  const times = notes.slice().sort((a,b) => a-b);
  let best = times[0] || 0, count = 0, end = 0;
  for (let i = 0; i < times.length; i++) {
    while (end < times.length && times[end] < times[i] + seconds) end++;
    if (end - i > count) { best = times[i]; count = end-i; }
  }
  return { start: Math.max(0, best - .5), count };
}

export function motionWindows(piece) {
  const starts = new Map([0, .25, .5, .75, .95].map(f => [+(piece.duration*f).toFixed(4), `duration:${f}`]));
  const sections = new Map();
  for (const track of piece.tracks) {
    const notes = sections.get(track.section) || [];
    for (let i=0;i<track.notes.length;i+=4) notes.push(track.notes[i]);
    sections.set(track.section, notes);
    for (const chair of track.chairs || []) {
      const key = `${track.section}:chair:${chair}`, individual = sections.get(key) || [];
      for (let i=0;i<track.notes.length;i+=4) individual.push(track.notes[i]);
      sections.set(key, individual);
    }
  }
  for (const [sid, notes] of sections) if (notes.length) {
    starts.set(+Math.max(0, notes.reduce((first,time)=>Math.min(first,time),Infinity)-.5).toFixed(4), `entry:${sid}`);
    starts.set(+densestEntry(notes).start.toFixed(4), `dense:${sid}`);
  }
  return [...starts].sort((a,b)=>a[0]-b[0]).map(([start,reason])=>({start,reason}));
}
