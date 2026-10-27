// ------------------------------------------------------- the leaf programme
// Tonight as you lived it: counted once a second, kept on this device,
// handed to you when the evening ends (and on the programme panel anytime).
import { VENUE } from '../scene/venue.js';
import { levelName } from '../scene/hallplan.js';
import { Leaf } from '../evening.js';

export function createLeafProgramme(app) {
  const { S, settings, ui, perf, camera, bestSeat } = app;

  setInterval(() => {
    if (!S.concertStarted) return;
    const d = app.director;
    const seat = d.mode === 'seat' ? d.seat : d.mode === 'cinema' ? d.returnTo?.seat : null;
    const ear = d.mode === 'cinema' && settings.fixedEar && bestSeat ? { x: bestSeat.x, y: bestSeat.y + 1.2, z: bestSeat.z } : camera.position;
    const room = S.room;
    S.leaf.tick({
      playing: perf.playing,
      piece: perf.piece,
      seat: seat && seat.index >= 0 ? seat.label : null,
      level: levelName(d.feet + 0.1),
      ear,
      cinema: d.mode === 'cinema',
      sections: perf.playingSections ? [...perf.playingSections] : [],
      people: room ? [...room.members.values()].filter((m) => m.id !== room.id).map((m) => m.name) : [],
    });
  }, 1000);

  function endEvening() {
    S.intervalDone = false; // a new evening has its own interval
    S.playedTonight.clear();
    if (!S.leaf.worthKeeping) return;
    S.leaf.save();
    ui.showLeaf(S.leaf.card(), Leaf.history());
    S.leaf = new Leaf(VENUE);
  }
  ui.on('leaf', () => ui.showLeaf(S.leaf.worthKeeping ? S.leaf.card() : null, Leaf.history()));
  window.addEventListener('pagehide', () => S.leaf.save());

  return { endEvening };
}
