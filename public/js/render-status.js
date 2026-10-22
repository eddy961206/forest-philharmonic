// Recovery UI stays outside the canvas, including when WebGL cannot start.
export function showRenderStatus(message) {
  const panel = document.getElementById('renderStatus');
  if (!panel) return;
  document.getElementById('renderStatusText').textContent = message;
  document.getElementById('renderRetry').onclick = () => location.reload();
  panel.hidden = false;
}

export function hideRenderStatus() {
  const panel = document.getElementById('renderStatus');
  if (panel) panel.hidden = true;
}

// Three restores its GL objects first. App-owned render-target contents must
// then be regenerated before the animation loop is allowed to run again.
export function watchRenderContext(canvas, { lost, restored }) {
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lost();
    showRenderStatus('화면을 다시 연결하고 있어요. 잠시만 기다려 주세요.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      restored();
      hideRenderStatus();
    } catch (error) {
      lost();
      console.error('화면 복구 실패', error);
      showRenderStatus('화면을 복구하지 못했어요. 다시 불러오기를 눌러 주세요.');
    }
  });
}
