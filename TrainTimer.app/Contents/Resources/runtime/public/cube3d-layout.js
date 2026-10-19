// PerspectiveCamera keeps vertical FOV fixed. A uniform height-based scale keeps
// the cube's proportions intact even when the two canvas aspect ratios differ.
export function cube3dRectTransform(rect, base, baseTransform = 'none') {
  const dx = rect.left + rect.width / 2 - base.left - base.width / 2;
  const dy = rect.top + rect.height / 2 - base.top - base.height / 2;
  const scale = rect.height / base.height;
  return `translate(${dx}px, ${dy}px) ${baseTransform === 'none' ? '' : baseTransform} scale(${scale})`;
}

export function cube3dLayoutSize(canvas) {
  // clientWidth/Height describe layout; boundingClientRect includes animated scale.
  return { width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) };
}
