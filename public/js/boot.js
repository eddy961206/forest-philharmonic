// Which page this is. With no building asked for: the square in the forest
// (buy a ticket, walk to a gate). A building: entered with a ticket from the
// square, or straight in with a room invitation (?room=) - and the old
// lobby is still there with ?lobby. A building without a ticket for it sends
// you to the square first.
const q = new URLSearchParams(location.search);
let ticket = null;
try { ticket = JSON.parse(sessionStorage.getItem('fp-ticket') || 'null'); } catch { /* private mode */ }
const venue = q.get('venue');
if (q.get('room') || (venue && (ticket?.venue === venue || q.has('lobby')))) import('./main.js');
else if (venue) location.replace(location.pathname);
else import('./plaza.js');
