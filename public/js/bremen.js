import { BREMEN_BEAT, BREMEN_DURATION, BREMEN_PLAYERS, createBremenTrail } from './bremen-score.js';
import { playBremen } from './bremen-audio.js';

export function installBremen({ engine, ui, onOpen }) {
  const button = document.getElementById('bremenTrail');
  let saved = false;
  try { saved = localStorage.getItem('fp-bremen') === 'found'; } catch { /* private mode */ }
  const trail = createBremenTrail(saved);
  const markFound = () => {
    button.textContent = '♬ 브레멘의 밤손님';
    button.setAttribute('aria-label', '브레멘의 밤손님 작은 공연 열기');
  };
  if (saved) markFound();
  let dialog, sound, raf = null, release = null, originalMakeup = 0, makeupNode = null, generation = 0;
  const stop = () => {
    generation++;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null; sound?.stop(); sound = null;
  };
  const finish = () => {
    stop();
    if (engine.makeup && release) {
      const g = engine.makeup.gain, t = engine.ctx.currentTime;
      g.cancelScheduledValues(t); g.setTargetAtTime(originalMakeup, t, .08);
    }
    release?.(); release = null;
    const nextFocus = ui._dialog ? document.getElementById(`${ui._dialog.id}Close`) : button;
    nextFocus?.focus({ preventScroll: true });
  };
  const replay = async () => {
    stop(); const token = generation;
    const status = dialog.querySelector('.bremen-status');
    if (document.activeElement === dialog.querySelector('.bremen-replay')) dialog.querySelector('.bremen-close').focus();
    dialog.querySelector('.bremen-replay').disabled = true;
    try {
      await engine.ctx.resume();
      if (token !== generation || !dialog.open) return;
      sound = playBremen(engine);
      if (sound.missing.length) throw Error(`Missing samples: ${sound.missing.join(', ')}`);
      const picture = dialog.querySelector('svg');
      picture.classList.remove('bremen-running', 'bremen-ended');
      void picture.getBoundingClientRect(); // restart the four entrance animations
      picture.classList.add('bremen-running');
      let chapter = -1;
      const tick = () => {
        if (!sound || !dialog.open) return;
        const t = Math.max(0, engine.ctx.currentTime - sound.start);
        const next = Math.min(4, Math.floor(t / (4 * BREMEN_BEAT)));
        if (next !== chapter) {
          chapter = next;
          status.textContent = next < 4 ? `${BREMEN_PLAYERS[next].name}의 ${BREMEN_PLAYERS[next].role}` : '서로의 어깨를 빌리니, 우리도 작은 오케스트라.';
        }
        dialog.querySelector('.bremen-progress').value = Math.min(1, t / BREMEN_DURATION);
        if (t >= BREMEN_DURATION) {
          picture.classList.add('bremen-ended');
          stop(); status.textContent = '브레멘에 닿기 전, 우리가 머물 집을 찾았어요.';
          dialog.querySelector('.bremen-replay').disabled = false;
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      if (token !== generation || !dialog.open) return;
      stop(); status.textContent = '작은 공연을 준비하지 못했어요. 다시 한 번 불러 주세요.';
      dialog.querySelector('.bremen-replay').disabled = false;
      console.warn('Bremen miniature unavailable', error);
    }
  };
  const open = () => {
    if (!engine.ctx || dialog?.open || release) return;
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'bremen'; dialog.className = 'bremen';
      dialog.setAttribute('aria-labelledby', 'bremenTitle');
      dialog.innerHTML = markup;
      document.body.append(dialog);
      dialog.querySelector('.bremen-close').addEventListener('click', () => dialog.close());
      dialog.querySelector('.bremen-replay').addEventListener('click', replay);
      dialog.addEventListener('close', finish);
      dialog.addEventListener('keydown', e => e.stopPropagation());
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    }
    if (document.pointerLockElement) document.exitPointerLock();
    ui.stickTouch?.release?.(); ui.joy.x = ui.joy.y = 0;
    release = onOpen();
    // Preserve the fully restored value across rapid close/open gestures.
    // Reading an in-flight fade here would make the concert quieter each time.
    if (makeupNode !== engine.makeup) {
      makeupNode = engine.makeup; originalMakeup = makeupNode.gain.value;
    }
    const g = engine.makeup.gain, t = engine.ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(0, t, .08);
    dialog.showModal();
    dialog.querySelector('.bremen-close').focus();
    replay();
  };
  button.addEventListener('click', () => {
    const step = trail.tap(performance.now());
    if (step < 4) { ui.toast(['어디선가 낮은 발굽 소리가…', '작은 발자국 둘이 더 따라왔어요.', '마지막 친구가 기다리고 있어요.'][step - 1], 1800); return; }
    try { localStorage.setItem('fp-bremen', 'found'); } catch { /* private mode */ }
    markFound(); open();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dialog?.open) dialog.close(); });
  // A disabled replay button can lose focus. Even then, venue shortcuts must
  // not run behind the native modal. Default Tab/Escape behaviour is retained.
  document.addEventListener('keydown', e => { if (dialog?.open) e.stopPropagation(); }, true);
  window.addEventListener('pagehide', () => { if (dialog?.open) { dialog.close(); finish(); } });
  return { get active() { return !!dialog?.open; }, get voices() { return sound?.activeVoices || 0; } };
}

// Original vector artwork. A tiny paper theatre keeps the hidden feature at
// zero WebGL draw calls, with no new textures, lights or animation loop at rest.
const markup = `<article class="bremen-card">
  <button class="bremen-close" type="button" aria-label="브레멘 공연 닫기">×</button>
  <p class="bremen-eyebrow">숲길에서 발견한 작은 앙코르 · 01</p>
  <h2 id="bremenTitle">브레멘의 밤손님</h2>
  <p class="bremen-intro">큰 무대가 없어도, 함께라면 음악대.</p>
  <svg viewBox="0 0 600 410" role="img" aria-label="달빛 아래 당나귀 등에 강아지, 고양이, 수탉이 올라 작은 음악대를 이룬 동화책 무대">
    <defs>
      <linearGradient id="bmSky" x2="0" y2="1"><stop stop-color="#152d30"/><stop offset="1" stop-color="#23413a"/></linearGradient>
      <radialGradient id="bmGlow"><stop stop-color="#f0c77a" stop-opacity=".22"/><stop offset="1" stop-color="#f0c77a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="600" height="410" rx="22" fill="url(#bmSky)"/>
    <circle cx="438" cy="86" r="100" fill="url(#bmGlow)"/><circle cx="438" cy="86" r="34" fill="#e4cf91"/>
    <path d="M457 55a34 34 0 0 1-27 62 34 34 0 0 0 27-62" fill="#bcc18b"/>
    <g fill="#e9d8aa" opacity=".7"><circle cx="128" cy="68" r="2"/><circle cx="228" cy="37" r="1.5"/><circle cx="365" cy="46" r="2"/><circle cx="523" cy="128" r="2"/><circle cx="355" cy="143" r="1.5"/><circle cx="79" cy="132" r="1.5"/></g>
    <g fill="#142c2b"><path d="M0 320V178l38-74 38 74-18-4 28 69-24-6 28 83zM480 331l42-94-22 4 28-69-15 3 33-85 33 85-16-3 28 69-23-4 32 94z"/><path d="M38 332l32-77-17 4 22-60-13 3 27-69 26 69-12-3 22 60-17-4 32 77z"/></g>
    <path d="M0 365Q160 319 300 348t300-5v67H0z" fill="#344a39"/>
    <path d="M408 316v-85l64-37 64 37v85" fill="#524332"/><path d="M398 234l74-48 76 48" fill="none" stroke="#20322b" stroke-width="13" stroke-linecap="round"/>
    <rect x="453" y="259" width="36" height="57" rx="16" fill="#d49f51"/><path d="M471 262v51m-15-29h30" stroke="#7a5b35" stroke-width="4"/>
    <ellipse cx="277" cy="367" rx="119" ry="13" fill="#142c2b" opacity=".5"/>
    <g transform="translate(201 259)"><g class="bremen-animal bm-donkey" style="--delay:0s">
      <path d="M-6 57q-25-7-23-35" fill="none" stroke="#8b9690" stroke-width="9" stroke-linecap="round"/>
      <path d="M4 59l-5 42m27-39-1 39m58-39 2 39m25-43 7 43" stroke="#929c95" stroke-width="13" stroke-linecap="round"/>
      <path d="M-4 102h12m12 0h12m49 0h12m17 0h13" stroke="#343b36" stroke-width="8" stroke-linecap="round"/>
      <ellipse cx="52" cy="49" rx="66" ry="32" fill="#9da79c"/><path d="M87 53V12q1-28 25-28t25 24v42" fill="#aeb5a6"/>
      <path d="M104-10q-22-50-8-55 15 8 20 51m7 0q3-53 17-52 11 12-4 57" fill="#aeb5a6" stroke="#7b887e" stroke-width="4"/>
      <ellipse cx="136" cy="18" rx="25" ry="19" fill="#d5d4ba"/><circle cx="121" cy="1" r="4" fill="#24362f"/><circle cx="149" cy="16" r="3" fill="#78816f"/>
      <path d="M120 30q13 8 22 1" fill="none" stroke="#697666" stroke-width="2"/>
      <path d="M92 32l31 5-22 16z" fill="#b95e43"/>
      <g stroke="#d9ac55" stroke-width="8" fill="none" stroke-linecap="round"><path d="M64 42v19q0 18-18 18T28 61V45m12-1v21q0 4 6 4t6-6V42"/><path d="M29 43V28m35 15V20"/></g><path d="M15 15q15 12 29 0l-6 15H23z" fill="#e7c575"/>
    </g></g>
    <g transform="translate(224 180)"><g class="bremen-animal bm-dog" style="--delay:2.143s">
      <path d="M7 43Q-14 36-15 22" fill="none" stroke="#c0925f" stroke-width="9" stroke-linecap="round"/>
      <path d="M14 45v37m22-36v36m44-36v36m20-40 5 40" stroke="#c0925f" stroke-width="10" stroke-linecap="round"/>
      <ellipse cx="54" cy="34" rx="50" ry="25" fill="#c99d66"/><circle cx="103" cy="12" r="25" fill="#d7ad75"/>
      <ellipse cx="86" cy="15" rx="11" ry="25" fill="#7e5940" transform="rotate(-17 86 15)"/><ellipse cx="124" cy="23" rx="20" ry="13" fill="#ead1a3"/><circle cx="139" cy="18" r="6" fill="#343b36"/><circle cx="112" cy="7" r="3.5" fill="#26392f"/>
      <path d="M93 35l17 5-11 17-12-11z" fill="#597d8b"/>
      <path d="M126 34l9 45" stroke="#263c35" stroke-width="8"/><g fill="#d6be86"><circle cx="128" cy="43" r="2"/><circle cx="130" cy="53" r="2"/><circle cx="132" cy="63" r="2"/></g><path d="M129 76l-1 10 16-3-6-9" fill="#263c35"/>
    </g></g>
    <g transform="translate(247 103)"><g class="bremen-animal bm-cat" style="--delay:4.286s">
      <path d="M6 49q-29 0-23-24t-10-21" fill="none" stroke="#ca8050" stroke-width="9" stroke-linecap="round"/>
      <path d="M14 50v29m19-28v28m32-28v28m17-29v29" stroke="#d68d56" stroke-width="9" stroke-linecap="round"/>
      <ellipse cx="43" cy="41" rx="41" ry="24" fill="#d9955e"/>
      <path d="M59 10l-2-25 21 13 21-9-1 28" fill="#dc9a64"/><circle cx="79" cy="17" r="24" fill="#dc9a64"/>
      <path d="M65 12l6 2m14 0 6-2" stroke="#354034" stroke-width="3" stroke-linecap="round"/><path d="M76 21h7l-4 5z" fill="#855b49"/><path d="M56 23l-18-4m19 10-18 3m57-9 18-4m-19 10 18 3" stroke="#ebc393" stroke-width="2"/>
      <path d="M74 39l19 2-11 10z" fill="#8a786c"/>
      <g transform="translate(64 52) rotate(-25)"><path d="M-8-6q-9 4-4 11-10 15 5 17h12q13-2 5-17 5-7-4-11" fill="#9d4d34" stroke="#e2b679" stroke-width="2"/><path d="M0-16v33" stroke="#e7c28c" stroke-width="3"/></g>
    </g></g>
    <g transform="translate(275 39)"><g class="bremen-animal bm-rooster" style="--delay:6.429s">
      <path d="M0 30q-23-35-23-13-22-19-15 3t36 21" fill="#44655d"/>
      <ellipse cx="20" cy="36" rx="28" ry="24" fill="#e3cda2"/><path d="M11 31q22-13 24 15-21 17-24-15" fill="#ae6946"/>
      <path d="M31 24V6q0-17 14-17T59 5v28" fill="#e9d8af"/>
      <path d="M33-6q-9-17 1-16 5 0 6 9 2-22 10-13 3 6-1 13 13-13 14-2l-8 13" fill="#b84f3c"/>
      <circle cx="49" cy="4" r="3" fill="#2a3d32"/><path d="M59 8l17 5-17 7" fill="#c49a48"/><ellipse cx="56" cy="27" rx="5" ry="9" fill="#b84f3c"/>
      <path d="M15 56v13m15-13v13m-21 0h12m2 0h13" stroke="#c49a48" stroke-width="3" stroke-linecap="round"/>
      <path d="M68 15h17l20-10v25L85 21H68" fill="#dcba6e"/><path d="M77 21v12h11V21" fill="none" stroke="#dcba6e" stroke-width="4"/>
    </g></g>
    <g class="bremen-notes" fill="#e6c57f" font-size="25" font-family="serif"><text x="389" y="73">♪</text><text x="176" y="155">♫</text><text x="366" y="220">♪</text></g>
  </svg>
  <p class="bremen-status" role="status" aria-live="polite">네 친구가 길을 따라 오고 있어요.</p>
  <progress class="bremen-progress" max="1" value="0" aria-label="브레멘 작은 공연 진행"></progress>
  <div class="bremen-bottom"><span>네 친구를 위한 오리지널 소품</span><button type="button" class="bremen-replay">한 번 더 만나기 ↺</button></div>
</article>`;
