/* Original browser implementation inspired by smear-style cursor motion. */
window.installTerminalCursorSmear = function (terminal) {
  const host = terminal.element;
  const screen = host?.querySelector('.xterm-screen');
  if (!host || !screen) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'terminal-cursor-smear';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '5',
  });
  const context = canvas.getContext('2d');
  if (!context) return;
  host.appendChild(canvas);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const caret = { target: null, tail: null, width: 8 };
  const pointer = { target: null, tail: null, width: 5 };
  let frame = 0;
  let previousTime = 0;
  let disposed = false;
  let ratio = 1;

  function clear() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    caret.target = caret.tail = pointer.target = pointer.tail = null;
    context.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    canvas.dataset.active = 'false';
  }
  function resize() {
    clear();
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.style.width = `${host.clientWidth}px`;
    canvas.style.height = `${host.clientHeight}px`;
    canvas.width = Math.round(host.clientWidth * ratio);
    canvas.height = Math.round(host.clientHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function move(state, x, y, width) {
    if (disposed || reduced.matches || document.hidden) return;
    const next = { x, y };
    state.width = width;
    if (!state.target) state.tail = { ...next };
    state.target = next;
    // Long output jumps should not paint a stripe across the whole terminal.
    const dx = x - state.tail.x, dy = y - state.tail.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 140) state.tail = { x: x - dx / distance * 140, y: y - dy / distance * 140 };
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function ribbon(state, dt, mouse) {
    if (!state.target || !state.tail) return false;
    const { target, tail, width } = state;
    const dx = target.x - tail.x, dy = target.y - tail.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.4) { state.tail = { ...target }; return false; }
    const nx = -dy / distance * width / 2, ny = dx / distance * width / 2;
    const gradient = context.createLinearGradient(tail.x, tail.y, target.x, target.y);
    const color = terminal.options.theme?.cursor || '#8FB39A';
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, color);
    context.fillStyle = gradient;
    context.globalAlpha = mouse ? 0.38 : 0.52;
    context.beginPath();
    context.moveTo(tail.x + nx * 0.15, tail.y + ny * 0.15);
    context.lineTo(target.x + nx, target.y + ny);
    context.lineTo(target.x - nx, target.y - ny);
    context.lineTo(tail.x - nx * 0.15, tail.y - ny * 0.15);
    context.closePath();
    context.fill();
    const follow = 1 - Math.exp(-dt / (mouse ? 42 : 55));
    tail.x += dx * follow;
    tail.y += dy * follow;
    return true;
  }
  function draw(time) {
    frame = 0;
    if (disposed || reduced.matches || document.hidden) { clear(); return; }
    const dt = previousTime ? Math.min(time - previousTime, 40) : 16;
    previousTime = time;
    context.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    const caretMoving = ribbon(caret, dt, false);
    const pointerMoving = ribbon(pointer, dt, true);
    const moving = caretMoving || pointerMoving;
    canvas.dataset.active = String(moving);
    if (moving) frame = requestAnimationFrame(draw);
    else previousTime = 0;
  }
  function cursorMoved() {
    if (document.activeElement !== terminal.textarea) return;
    const buffer = terminal.buffer.active;
    const row = buffer.baseY + buffer.cursorY - buffer.viewportY;
    if (row < 0 || row >= terminal.rows) { clear(); return; }
    const surface = screen.getBoundingClientRect(), bounds = host.getBoundingClientRect();
    const cellWidth = surface.width / terminal.cols;
    const cellHeight = surface.height / terminal.rows;
    const column = Math.min(buffer.cursorX, terminal.cols - 1);
    move(caret, surface.left - bounds.left + (column + 0.5) * cellWidth,
      surface.top - bounds.top + (row + 0.5) * cellHeight, cellWidth);
  }
  function pointerMoved(event) {
    if (!finePointer.matches || event.pointerType === 'touch') return;
    const bounds = host.getBoundingClientRect();
    move(pointer, event.clientX - bounds.left, event.clientY - bounds.top, 5);
  }
  function pointerLeft() { pointer.target = pointer.tail = null; }
  function focused() { clear(); cursorMoved(); }
  const subscriptions = [terminal.onCursorMove(cursorMoved), terminal.onRender(cursorMoved),
    terminal.onScroll(clear), terminal.onResize(resize)];
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  host.addEventListener('pointermove', pointerMoved, { passive: true });
  host.addEventListener('pointerleave', pointerLeft);
  terminal.textarea.addEventListener('focus', focused);
  terminal.textarea.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);
  reduced.addEventListener('change', clear);
  finePointer.addEventListener('change', clear);
  function pageHidden(event) {
    clear();
    if (!event.persisted) dispose();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    subscriptions.forEach((subscription) => subscription.dispose());
    observer.disconnect();
    host.removeEventListener('pointermove', pointerMoved);
    host.removeEventListener('pointerleave', pointerLeft);
    terminal.textarea.removeEventListener('focus', focused);
    terminal.textarea.removeEventListener('blur', clear);
    document.removeEventListener('visibilitychange', clear);
    reduced.removeEventListener('change', clear);
    finePointer.removeEventListener('change', clear);
    window.removeEventListener('pagehide', pageHidden);
    canvas.remove();
  }
  window.addEventListener('pagehide', pageHidden);
  resize();
  return { dispose };
};
