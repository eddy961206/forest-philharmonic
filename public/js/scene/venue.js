// Which venue this page shows. Decided once at load (the scene, the walking
// plan and the acoustics are built for one venue): ?venue=sphere in the URL,
// else the last venue chosen, else the forest concert hall.
export const VENUES = {
  hall: {
    id: 'hall', ko: '숲속 필하모닉 홀', short: '숲속 홀', title: '숲속 필하모닉',
    intro: '달빛 숲 가장자리의 4층 그랜드 콘서트홀. 로비에서 걸어 들어가 마음에 드는 자리에 앉아 공연을 시작하면, 동물 오케스트라와 합창단이 오늘 밤 마흔한 곡을 들려드립니다.',
  },
  sphere: {
    id: 'sphere', ko: '스피어', short: '스피어', title: '스피어',
    intro: '숲길 건너의 둥근 공연장. 높이 73m, 축구장 두 개 넓이의 16K 스크린이 머리 위를 온통 감싸는 공연장. 200 레벨 통로로 들어가 자리를 잡으면, 동물 오케스트라의 연주에 맞춰 돔 전체가 숲이 되고 바다가 되고 밤하늘이 됩니다.',
  },
};

function pick() {
  try {
    const q = new URLSearchParams(location.search).get('venue');
    if (q && VENUES[q]) return q;
    const s = localStorage.getItem('fp-venue');
    if (s && VENUES[s]) return s;
  } catch { /* private mode */ }
  return 'hall';
}

export const VENUE = pick();
export const IS_SPHERE = VENUE === 'sphere';

// switch venues: a fresh page for the other building (keeps a room code)
export function goVenue(id, { room = null } = {}) {
  if (!VENUES[id]) return;
  try { localStorage.setItem('fp-venue', id); } catch { /* ignore */ }
  const u = new URL(location.href);
  u.searchParams.set('venue', id);
  if (room) u.searchParams.set('room', room); else u.searchParams.delete('room');
  if (!room) u.searchParams.set('lobby', '1'); // (no ticket: the lobby there, not the square)
  location.href = u.toString();
}
