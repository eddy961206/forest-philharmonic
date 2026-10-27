// --------------------------------------------------------------- lobby
// The way in: your name and animal, a ticket from the square, a room to
// make or join - and the entrance itself.
import { VENUE, VENUES, goVenue } from '../scene/venue.js';
import { ENTRANCE } from '../scene/director.js';
import { identity, setName, heldTicket, updateTicket, dropTicket, ticketElement, ticketQuery, EMOJI } from '../tickets.js';
import { RoomClient, listRooms } from '../net/room.js';
import { AVATARS } from '../scene/avatars.js';

export function appleTouchFullscreen() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  // (no keyboard lock: Esc keeps its usual meaning, out of fullscreen)
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

export function createLobby(app) {
  const { S, ui, engine, hall, isTouch } = app;

  // you: the animal drawn on your first visit (kept; see tickets.js)
  const me = identity();
  // (a code is six letters and digits: anything else is no invite at all)
  const invite = ((c) => (/^[A-Z0-9]{6}$/.test(c) ? c : null))((new URLSearchParams(location.search).get('room') || '').trim().toUpperCase());
  ui.initLobby({ avatars: AVATARS, identity: { ...me, emoji: EMOJI[me.avatar] }, invite, venue: VENUE, venues: VENUES });
  // came from the square with a ticket for this building: the usher checks it
  // (a room's address after a reload: your ticket for that very room still counts)
  const held = heldTicket(VENUE);
  const ticket = held && (!invite || held.code === invite) ? held : null;
  if (ticket) ui.ticketMode(ticket, ticketElement(ticket));
  else {
    // Hidden in the initial HTML: scene construction must not flash the old
    // name / venue controls before we know whether this visitor holds a ticket.
    document.getElementById('lobby').hidden = false;
    // Keep direct ?lobby=1 and invitation entry available without a ticket.
    if (!invite && new URLSearchParams(location.search).get('room')) ui.lobbyError('초대 링크의 방 코드가 올바르지 않아요. 아래에서 방 코드를 직접 적어 들어가 보세요.');
  }

  ui.on('enter', async (opt) => {
    const { director } = app;
    if (S.concertStarted || S.joining) return; // (one entrance, however many presses)
    setName(opt.name); // (the animal stays the one you were given)
    // fullscreen and sound must be started inside the click itself. (Only on
    // a phone or tablet, where the browser's bars take a good part of the
    // screen; at a computer it is a choice: ⛶ or Enter.)
    // iPadOS reserves a downward swipe to exit native fullscreen, which
    // conflicts with looking down. Keep it an explicit choice on Apple touch devices.
    if (isTouch && !appleTouchFullscreen()) goFullscreen();
    // never wait on the audio context: some browsers settle it late
    try { engine.ctx.resume().catch(() => {}); } catch { /* ignored */ }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
    if (opt.mode !== 'solo') {
      S.joining = true;
      ui.lobbyBusy(true);
      const room = new RoomClient();
      S.room = room;
      app.sync.wireRoom(room);
      try {
        await room.enter({ name: opt.name, avatar: opt.avatar, venue: VENUE, code: opt.code, create: opt.mode === 'create' ? { title: opt.title, cap: opt.cap, pub: opt.pub } : null });
      } catch (e) {
        if (e.code === 'venue' && VENUES[e.venue]) {
          // the room is in the other building: go there (the invite - or the
          // ticket, now for that building - comes along)
          room.leave();
          ui.lobbyBusy(true); // (on the way: nothing to press meanwhile)
          ui.lobbyError(e.message, { note: true });
          try { localStorage.setItem('fp-venue', e.venue); } catch { /* private mode */ }
          if (ticket) {
            updateTicket({ venue: e.venue });
            // (with storage blocked the ticket lives in the address: it comes along)
            setTimeout(() => { location.href = `${location.pathname}?venue=${e.venue}${ticketQuery({ ...ticket, venue: e.venue })}`; }, 900);
          } else setTimeout(() => goVenue(e.venue, { room: opt.code }), 700);
          return;
        }
        room.leave();
        S.room = null;
        S.joining = false;
        ui.lobbyBusy(false);
        // a room that is gone stays gone: the ticket becomes a seat of your own
        // (a reload is then the usher with that, not the same failure again)
        const gone = e.code === 'notfound';
        if (gone) soloTicket();
        ui.lobbyError(e.message || '방에 들어가지 못했어요.', { dead: gone });
        refreshRooms();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        return;
      }
      S.joining = false;
      ui.lobbyBusy(false);
      // a reload keeps you in the room you made (not a second one)
      if (ticket && S.room?.room) updateTicket({ mode: 'join', code: S.room.room.code });
    } else soloTicket(); // (혼자 보기 after a room would not have you: a reload is the same)
    director.active = true;
    ui.enter(isTouch);
    // you arrive in the foyer, in front of the doors to the stalls
    director.placeAt(ENTRANCE.pos, ENTRANCE.look);
    director.targetFov = director.fov = 64;
    S.concertStarted = true;
    app.graphics.holdQuality(6000);
    hall.setHouseLights(1);
    app.power.requestWakeLock();
    if (S.room && !S.room.isHost && S.pendingJoin !== undefined) app.sync.catchUp(S.pendingJoin);
    S.pendingJoin = undefined;
  });

  // watching alone from now on: the ticket (if any) says so, and the address
  // is this building's - a reload is not the room that is gone
  function soloTicket() {
    if (ticket && ticket.mode !== 'solo') updateTicket({ mode: 'solo', code: undefined });
    try {
      const u = new URL(location.href);
      if (!u.searchParams.has('room')) return;
      u.searchParams.delete('room');
      u.searchParams.set('venue', VENUE);
      if (!ticket) u.searchParams.set('lobby', '1'); // (no ticket: this building's lobby, not the square)
      history.replaceState(null, '', u.pathname + u.search);
    } catch { /* file: */ }
  }

  ui.on('venue', (id) => goVenue(id, { room: invite }));
  ui.on('dropTicket', () => dropTicket()); // (back to the square from a room that is gone: buy afresh)
  async function refreshRooms() {
    try {
      ui.setRooms(await listRooms());
      ui.setOnline(true);
    } catch {
      ui.setOnline(false); // a static host: watching alone only
    }
  }
  refreshRooms();
  ui.on('refreshRooms', refreshRooms);
  setInterval(() => { if (!S.concertStarted && !document.hidden) refreshRooms(); }, 10000);

  return { soloTicket };
}
