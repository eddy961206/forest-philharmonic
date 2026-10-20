// Stage layout shared by the audio engine (where each section sounds from)
// and the scene (where each musician sits). Units are metres.
// Audience sits at +z looking toward -z; the stage front edge is z = 0.

export const STAGE_Y = 1.1;
export const PODIUM = { x: 0, z: -2.4 };

const C = PODIUM;
const at = (r, deg, rise = 0) => {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.sin(a), z: C.z - r * Math.cos(a), y: STAGE_Y + rise };
};

// Riser heights for the tiers behind the strings
const R1 = 0.3;
const R2 = 0.6;
const R3 = 0.9;

export const SECTIONS = {
  vn1: { ko: '제1바이올린', color: '#f6a8bd', chairs: [at(2.6, -68), at(2.6, -47), at(3.95, -59)] },
  vn2: { ko: '제2바이올린', color: '#f8c9a0', chairs: [at(2.6, -25), at(3.95, -40), at(3.95, -22)] },
  va: { ko: '비올라', color: '#c8b5e8', chairs: [at(2.6, 25), at(3.95, 21)] },
  vc: { ko: '첼로', color: '#9fdccb', chairs: [at(2.6, 50), at(3.95, 44)] },
  cb: { ko: '콘트라베이스', color: '#93bde3', chairs: [at(4.9, 63, R1)] },
  harp: { ko: '하프', color: '#f3cff8', chairs: [at(5.1, -74, R1)] },
  fl: { ko: '플루트', color: '#c3e6ff', chairs: [at(5.2, -8, R1)] },
  ob: { ko: '오보에', color: '#ffdc93', chairs: [at(5.2, 8, R1)] },
  cl: { ko: '클라리넷', color: '#bde6a7', chairs: [at(6.45, -8, R2)] },
  bn: { ko: '바순', color: '#ebb682', chairs: [at(6.45, 8, R2)] },
  hn: { ko: '호른', color: '#ffe36e', chairs: [at(6.6, -27, R2), at(6.6, -19, R2)] },
  tp: { ko: '트럼펫', color: '#ffb661', chairs: [at(7.7, 17, R3)] },
  timp: { ko: '팀파니', color: '#ea8a6d', chairs: [at(8.0, -3, R3)] },
  piano: { ko: '피아노', color: '#a8ece9', chairs: [{ x: -5.05, z: -0.95, y: STAGE_Y }] },
  // choir on two risers behind the orchestra: sopranos, altos, tenors, basses
  choir: { ko: '합창단', color: '#ffe9b5', standing: true, chairs: [
    at(8.9, -37, 1.25), at(8.9, -22, 1.25), at(8.9, -7, 1.25), at(8.9, 7, 1.25), at(8.9, 22, 1.25), at(8.9, 37, 1.25),
    at(9.65, -31, 1.6), at(9.65, -18, 1.6), at(9.65, -6, 1.6), at(9.65, 6, 1.6), at(9.65, 18, 1.6), at(9.65, 31, 1.6),
  ] },
};
export const CHOIR_VOICES = ['소프라노', '소프라노', '소프라노', '알토', '알토', '알토', '테너', '테너', '테너', '베이스', '베이스', '베이스'];

// Directivity: which way each section mostly radiates (unit xz vector).
// Strings & woodwinds project toward the hall; horn bells face backward.
export function sectionFacing(id) {
  if (id === 'hn') return { x: 0.15, z: -1 };
  if (id === 'piano') return { x: 0.55, z: 0.85 }; // lid opens toward the audience
  return { x: 0, z: 1 };
}

// Acoustic centre of a section (average of its chairs, at instrument height)
export function sectionCenter(id) {
  const ch = SECTIONS[id].chairs;
  const p = { x: 0, y: 0, z: 0 };
  for (const c of ch) { p.x += c.x; p.y += c.y; p.z += c.z; }
  p.x /= ch.length; p.y = p.y / ch.length + 0.9; p.z /= ch.length;
  if (id === 'piano') { p.x += 1.3; }
  if (id === 'choir') { p.y += 0.3; }
  return p;
}

// Who sits where. Every character is an original forest animal.
export const CAST = {
  vn1: [
    { species: 'rabbit', name: '루나', title: '악장', fur: '#fbf6ef', outfit: 'dress' },
    { species: 'cat', name: '모모', fur: '#f2a65a', outfit: 'tail' },
    { species: 'squirrel', name: '도토', fur: '#b8693a', outfit: 'tail' },
  ],
  vn2: [
    { species: 'fox', name: '여름', fur: '#e8823a', outfit: 'dress' },
    { species: 'sheep', name: '구름', fur: '#f6f1e7', outfit: 'tail' },
    { species: 'mouse', name: '치즈', fur: '#b9b2ab', outfit: 'dress' },
  ],
  va: [
    { species: 'raccoon', name: '라쿤', fur: '#8f8a85', outfit: 'tail' },
    { species: 'deer', name: '노루', fur: '#c48b57', outfit: 'dress' },
  ],
  vc: [
    { species: 'bear', name: '곰돌', fur: '#8a5a3b', outfit: 'tail' },
    { species: 'panda', name: '판다', fur: '#f4f1ea', outfit: 'tail' },
  ],
  cb: [{ species: 'bear', name: '큰곰', fur: '#5e3d29', outfit: 'tail', big: true }],
  harp: [{ species: 'deer', name: '사슴', fur: '#d4a06c', outfit: 'dress' }],
  fl: [{ species: 'cat', name: '하양', fur: '#f5f2ee', outfit: 'dress' }],
  ob: [{ species: 'dog', name: '시바', fur: '#d99a55', outfit: 'tail' }],
  cl: [{ species: 'mouse', name: '쥐돌', fur: '#9a948f', outfit: 'tail' }],
  bn: [{ species: 'hedgehog', name: '밤송', fur: '#a5856a', outfit: 'tail' }],
  hn: [
    { species: 'koala', name: '코코', fur: '#a3a6ab', outfit: 'tail' },
    { species: 'lion', name: '레오', fur: '#e0a95b', outfit: 'tail' },
  ],
  tp: [{ species: 'fox', name: '불꽃', fur: '#d9662b', outfit: 'tail' }],
  timp: [{ species: 'panda', name: '둥둥', fur: '#f4f1ea', outfit: 'tail' }],
  piano: [{ species: 'cat', name: '쇼팽', fur: '#6f6a70', outfit: 'tail' }],
  choir: [
    { species: 'rabbit', name: '토토', fur: '#f6e9dc', outfit: 'dress' },
    { species: 'cat', name: '나비', fur: '#d8c8b4', outfit: 'dress' },
    { species: 'deer', name: '루비', fur: '#c99a6b', outfit: 'dress' },
    { species: 'sheep', name: '솜이', fur: '#f3eee4', outfit: 'dress' },
    { species: 'mouse', name: '콩이', fur: '#aaa39b', outfit: 'dress' },
    { species: 'squirrel', name: '밤이', fur: '#a9643a', outfit: 'dress' },
    { species: 'fox', name: '단풍', fur: '#d9742e', outfit: 'tail' },
    { species: 'dog', name: '보리', fur: '#c28e55', outfit: 'tail' },
    { species: 'raccoon', name: '너구', fur: '#8b8683', outfit: 'tail' },
    { species: 'bear', name: '우람', fur: '#7a4f33', outfit: 'tail' },
    { species: 'lion', name: '사자왕', fur: '#d9a35a', outfit: 'tail' },
    { species: 'panda', name: '흑백', fur: '#f4f1ea', outfit: 'tail' },
  ],
};

export const CONDUCTOR = { species: 'owl', name: '부엉 선생', title: '지휘자', fur: '#9b7653', outfit: 'tail' };
