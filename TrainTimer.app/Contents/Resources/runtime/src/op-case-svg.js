import { opCaseDiagramForCase } from './op-case-diagrams.js';

export function opCaseSvgMarkup(kind, caseId, options = {}) {
  const diagram = typeof kind === 'object' && kind ? kind : opCaseDiagramForCase(kind, caseId);
  if (!diagram?.poster) return '';
  const className = ['op-case-svg', `op-case-svg-${diagram.kind}`, options.className].filter(Boolean).join(' ');
  const title = options.title || opDiagramTitle(diagram);
  const { width, height, shapes } = diagram.poster;
  return `
    <svg class="${escapeAttribute(className)}" viewBox="0 0 ${escapeAttribute(width)} ${escapeAttribute(height)}" role="img" aria-label="${escapeAttribute(title)}" xmlns="http://www.w3.org/2000/svg">
      <title>${escapeText(title)}</title>
      ${posterShapeMarkup(shapes)}
    </svg>
  `;
}

function opDiagramTitle(diagram) {
  const kind = diagram.kind.toUpperCase();
  const label = `${diagram.name || diagram.caseId}${diagram.pdfLabel ? ` · ${diagram.pdfLabel}` : ''}`;
  return label.toUpperCase().startsWith(`${kind} `) ? label : `${kind} ${label}`;
}

function posterShapeMarkup(shapes) {
  return (Array.isArray(shapes) ? shapes : [])
    .map((shape) => {
        if (shape.type === 'rect') {
          return `<rect x="${escapeAttribute(shape.x)}" y="${escapeAttribute(shape.y)}" width="${escapeAttribute(shape.width)}" height="${escapeAttribute(shape.height)}" fill="${escapeAttribute(shape.fill)}"/>`;
        }
        const attrs = [
          `d="${escapeAttribute(shape.d)}"`,
          `fill="${escapeAttribute(shape.fill || 'none')}"`,
        ];
        if (shape.stroke) attrs.push(`stroke="${escapeAttribute(shape.stroke)}"`);
        if (shape.strokeWidth) attrs.push(`stroke-width="${escapeAttribute(shape.strokeWidth)}"`);
        if (shape.strokeLinecap) attrs.push(`stroke-linecap="${escapeAttribute(shape.strokeLinecap)}"`);
        if (shape.strokeLinejoin) attrs.push(`stroke-linejoin="${escapeAttribute(shape.strokeLinejoin)}"`);
        return `<path ${attrs.join(' ')}/>`;
      })
      .join('');
}

function escapeText(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
