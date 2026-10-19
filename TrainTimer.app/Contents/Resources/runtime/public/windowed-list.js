export function visibleRange(total, scrollTop, height, rowHeight = 37, overscan = 8) {
  const first = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight));
  const count = Math.max(1, Math.ceil(height / rowHeight));
  const start = Math.min(Math.max(0, total - count), Math.max(0, first - overscan));
  const end = Math.min(total, Math.max(first + count + overscan, start + count));
  return { start, end, before: start * rowHeight, after: (total - end) * rowHeight };
}

const lists = new WeakMap();
export function renderWindowedList(container, scroller, entries, renderRow) {
  let state = lists.get(container);
  if (!state) {
    state = { entries: [], nodes: new Map(), key: '', frame: 0, offset: 0 };
    lists.set(container, state);
    state.draw = () => {
      state.frame = 0;
      const { start, end, before, after } = visibleRange(state.entries.length,
        scroller.scrollTop - state.offset, scroller.clientHeight);
      const key = `${start}:${end}`;
      if (state.key === key) return;
      state.key = key;
      const nodes = new Map(), children = [];
      const spacer = (height) => {
        const node = document.createElement('div');
        node.style.height = `${height}px`;
        node.setAttribute('aria-hidden', 'true');
        return node;
      };
      children.push(spacer(before));
      for (let index = start; index < end; index += 1) {
        const entry = state.entries[index];
        const id = entry.solve?.id || entry.id;
        const node = state.nodes.get(id) || state.renderRow(entry);
        node.dataset.windowIndex = String(index);
        node.setAttribute('aria-posinset', String(index + 1));
        node.setAttribute('aria-setsize', String(state.entries.length));
        children.push(node); nodes.set(id, node);
      }
      children.push(spacer(after));
      // Move existing nodes rather than rebuilding focused controls on every scroll.
      const keep = new Set(children);
      for (const child of [...container.children]) if (!keep.has(child)) child.remove();
      children.forEach((node, index) => { if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null); });
      state.nodes = nodes;
    };
    const schedule = () => { if (!state.frame) state.frame = requestAnimationFrame(state.draw); };
    scroller.addEventListener('scroll', schedule, { passive: true });
    state.observer = new ResizeObserver(schedule);
    state.observer.observe(scroller);
    container.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const row = event.target.closest('[data-window-index]');
      if (!row || event.target !== row) return;
      event.preventDefault();
      const current = Number(row.dataset.windowIndex);
      const next = Math.max(0, Math.min(state.entries.length - 1,
        event.key === 'Home' ? 0 : event.key === 'End' ? state.entries.length - 1 : current + (event.key === 'ArrowDown' ? 1 : -1)));
      scroller.scrollTop = state.offset + next * 37;
      state.key = ''; state.draw();
      container.querySelector(`[data-window-index="${next}"]`)?.focus({ preventScroll: true });
    });
  }
  state.entries = entries;
  state.renderRow = renderRow;
  state.key = '';
  state.nodes.clear();
  state.offset = container === scroller ? 0 : container.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  container.classList.add('windowed-history');
  state.draw();
}
