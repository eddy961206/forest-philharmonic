// Which page this is. With no building asked for: the square in the forest
// (buy a ticket, walk to a gate). A building: entered with a ticket from the
// square, or straight in with a room invitation (?room=) - and the old
// lobby is still there with ?lobby. A building without a ticket for it sends
// you to the square first.
import { showRenderStatus } from './render-status.js';

const failed = error => {
  console.error('공연장 시작 실패', error);
  showRenderStatus('공연장을 불러오지 못했어요. 인터넷 연결과 브라우저의 그래픽 지원을 확인하고 다시 불러와 주세요.');
};
const q = new URLSearchParams(location.search);
let ticket = null;
try {
  sessionStorage.setItem('fp-probe', '1');
  sessionStorage.removeItem('fp-probe');
  ticket = JSON.parse(sessionStorage.getItem('fp-ticket') || 'null');
} catch {
  // (nowhere to keep a ticket - all cookies blocked: it came along in the
  // address instead, see tickets.js)
  try { ticket = JSON.parse(q.get('t') || 'null'); } catch { /* not a ticket */ }
}
const venue = q.get('venue');
if (q.get('room') || (venue && (ticket?.venue === venue || q.has('lobby')))) import('./main.js').catch(failed);
else if (venue) location.replace(`${location.pathname}?from=venue`); // (the square says why: see plaza.js)
else import('./plaza.js').catch(failed);
