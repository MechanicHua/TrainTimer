import test from 'node:test';
import assert from 'node:assert/strict';
import { opPdfAlgorithms } from '../src/op-pdf-algorithms.js';
import {
  opCaseDiagramForCase,
  opCaseDiagrams,
} from '../src/op-case-diagrams.js';
import { opPosterDiagramShapes } from '../src/op-poster-diagram-shapes.js';
import { opCaseSvgMarkup } from '../src/op-case-svg.js';
import { recognizeOpCase } from '../src/op-analysis.js';

const posterFills = new Set(['#0788cf', '#087fbd', '#a7abad', '#1e2529', '#ffffff', 'none']);

test('loads one poster-traced diagram for every PDF-backed OP case', () => {
  assert.equal(opCaseDiagrams.length, 78);
  assert.equal(opCaseDiagrams.filter((diagram) => diagram.kind === 'oll').length, 57);
  assert.equal(opCaseDiagrams.filter((diagram) => diagram.kind === 'pll').length, 21);

  const diagramKeys = new Set(opCaseDiagrams.map((diagram) => `${diagram.kind}:${diagram.caseId}`));
  const pdfKeys = new Set(opPdfAlgorithms.map((item) => `${item.kind}:${item.caseId}`));
  assert.deepEqual(diagramKeys, pdfKeys);
  assert.deepEqual(new Set(opCaseDiagrams.map((diagram) => diagram.caseId)), new Set(Object.keys(opPosterDiagramShapes)));
});

test('poster-traced OP diagrams are backed by recognizable facelets', () => {
  for (const diagram of opCaseDiagrams) {
    const recognition = recognizeOpCase(diagram.facelets, diagram.kind);
    assert.equal(recognition?.caseId, diagram.caseId, `${diagram.kind}:${diagram.caseId} should recognize from diagram facelets`);
    assert.equal(diagram.recognitionCaseId, diagram.caseId);
    assert.equal(diagram.recognitionConfidence, 'unique');
    assert.equal(opCaseDiagramForCase(diagram.kind, diagram.caseId), diagram);
  }
});

test('poster diagram data is source-derived vector data from the formula-table icon layer', () => {
  for (const diagram of opCaseDiagrams) {
    assert.ok(diagram.poster, `${diagram.caseId} should have poster data`);
    assert.ok(Number.isInteger(diagram.poster.width) && diagram.poster.width > 0, diagram.caseId);
    assert.ok(Number.isInteger(diagram.poster.height) && diagram.poster.height > 0, diagram.caseId);
    assert.ok(Array.isArray(diagram.poster.shapes) && diagram.poster.shapes.length > 0, diagram.caseId);

    const fills = new Set(diagram.poster.shapes.map((shape) => shape.fill));
    assert.ok(fills.has(diagram.kind === 'oll' ? '#0788cf' : '#087fbd'), `${diagram.caseId} should include poster blue`);
    if (diagram.kind === 'oll') {
      assert.ok(fills.has('#a7abad'), `${diagram.caseId} should include poster gray stickers`);
      assert.equal(fills.has('#ffffff'), false, `${diagram.caseId} should not synthesize white arrows`);
      assert.equal(fills.has('#1e2529'), false, `${diagram.caseId} should not synthesize PLL side marks`);
    } else {
      assert.ok(fills.has('#ffffff'), `${diagram.caseId} should include poster white arrows/grid`);
      assert.ok(fills.has('#1e2529'), `${diagram.caseId} should include poster black side marks`);
    }

    for (const shape of diagram.poster.shapes) {
      assert.ok(posterFills.has(shape.fill), `${diagram.caseId} ${shape.fill}`);
      if (shape.type === 'rect') {
        assert.ok(Number.isInteger(shape.x), `${diagram.caseId} rect x`);
        assert.ok(Number.isInteger(shape.y), `${diagram.caseId} rect y`);
        assert.ok(Number.isInteger(shape.width) && shape.width > 0, `${diagram.caseId} rect width`);
        assert.ok(Number.isInteger(shape.height) && shape.height > 0, `${diagram.caseId} rect height`);
      } else {
        assert.equal(shape.type, 'path');
        assert.match(shape.d, /^[MLZ0-9 .-]+$/);
        assert.match(shape.d, /^M/);
        if (shape.fill === 'none') {
          assert.equal(shape.stroke, '#ffffff', `${diagram.caseId} open arrow paths should be stroked`);
          assert.ok(Number(shape.strokeWidth) > 0, `${diagram.caseId} stroked arrows should set width`);
        } else {
          assert.match(shape.d, /Z$/);
        }
      }
    }
  }
});

test('poster stickers use a fixed square 3x3 template', () => {
  for (const diagram of opCaseDiagrams) {
    const stickerRects = diagram.poster.shapes
      .filter((shape) => shape.type === 'rect' && ['#0788cf', '#087fbd', '#a7abad'].includes(shape.fill))
      .slice(0, 9);
    assert.equal(stickerRects.length, 9, diagram.caseId);
    const sizes = new Set(stickerRects.map((shape) => `${shape.width}x${shape.height}`));
    assert.equal(sizes.size, 1, `${diagram.caseId} should use one sticker size`);
    for (const rect of stickerRects) {
      assert.equal(rect.width, rect.height, `${diagram.caseId} stickers should be square`);
    }
    const xs = [...new Set(stickerRects.map((shape) => shape.x))].sort((a, b) => a - b);
    const ys = [...new Set(stickerRects.map((shape) => shape.y))].sort((a, b) => a - b);
    assert.equal(xs.length, 3, `${diagram.caseId} should have three grid columns`);
    assert.equal(ys.length, 3, `${diagram.caseId} should have three grid rows`);
    assert.equal(xs[1] - xs[0], xs[2] - xs[1], `${diagram.caseId} should have stable column spacing`);
    assert.equal(ys[1] - ys[0], ys[2] - ys[1], `${diagram.caseId} should have stable row spacing`);
  }
});

test('OLL side marks stay on fixed formula-table slots', () => {
  const expectedSlots = new Set([
    '26,19,22,3',
    '51,19,22,3',
    '76,19,22,3',
    '26,102,22,3',
    '51,102,22,3',
    '76,102,22,3',
    '19,26,3,22',
    '19,51,3,22',
    '19,76,3,22',
    '102,26,3,22',
    '102,51,3,22',
    '102,76,3,22',
  ]);

  for (const diagram of opCaseDiagrams.filter((item) => item.kind === 'oll')) {
    const sideMarks = diagram.poster.shapes.slice(9);
    assert.ok(sideMarks.length >= 2, `${diagram.caseId} should preserve formula-table side marks`);
    assert.ok(sideMarks.length <= expectedSlots.size, `${diagram.caseId} should not duplicate side marks`);

    const slots = new Set();
    for (const shape of sideMarks) {
      assert.equal(shape.type, 'rect', `${diagram.caseId} side marks should be fixed rect slots`);
      assert.equal(shape.fill, '#0788cf', `${diagram.caseId} side marks should use poster blue`);
      const slot = `${shape.x},${shape.y},${shape.width},${shape.height}`;
      assert.ok(expectedSlots.has(slot), `${diagram.caseId} unexpected side mark slot ${slot}`);
      assert.equal(slots.has(slot), false, `${diagram.caseId} duplicate side mark slot ${slot}`);
      slots.add(slot);
    }
  }
});

test('PLL arrows are coordinate overlay strokes with solid heads', () => {
  for (const diagram of opCaseDiagrams.filter((item) => item.kind === 'pll')) {
    const arrowStrokes = diagram.poster.shapes.filter((shape) => shape.stroke === '#ffffff');
    const arrowHeads = diagram.poster.shapes.filter((shape) => shape.fill === '#ffffff' && !shape.stroke);
    assert.ok(arrowStrokes.length > 0, `${diagram.caseId} should include coordinate arrow strokes`);
    assert.ok(arrowHeads.length >= arrowStrokes.length, `${diagram.caseId} should include arrow heads`);

    for (const shape of arrowStrokes) {
      assert.equal(shape.type, 'path', `${diagram.caseId} arrows should be vector paths`);
      assert.equal(shape.fill, 'none', `${diagram.caseId} arrow strokes should not be filled contours`);
      assert.equal((shape.d.match(/M/g) || []).length, 1, `${diagram.caseId} arrow path should be one continuous contour`);
      assert.equal((shape.d.match(/L/g) || []).length, 1, `${diagram.caseId} arrow stroke should be one coordinate segment`);
      assert.doesNotMatch(shape.d, /ZM/, `${diagram.caseId} arrow path should not concatenate tiny fragments`);
    }
  }
});

test('G perm arrows are two one-way three-cycles from the poster', () => {
  const expectedGPermArrows = {
    'pll-ga': [
      'M39 88L39 44',
      'M44 39L88 39',
      'M89.5 42.5L42.5 89.5',
      'M89.5 62.5L69.5 42.5',
      'M62.5 42.5L42.5 62.5',
      'M44 66L88 66',
    ],
    'pll-gb': [
      'M89.5 89.5L42.5 42.5',
      'M39 44L39 88',
      'M44 93L88 93',
      'M42.5 62.5L62.5 42.5',
      'M66 44L66 88',
      'M62.5 89.5L42.5 69.5',
    ],
    'pll-gc': [
      'M89.5 89.5L42.5 42.5',
      'M39 44L39 88',
      'M44 93L88 93',
      'M44 66L88 66',
      'M89.5 69.5L69.5 89.5',
      'M62.5 89.5L42.5 69.5',
    ],
    'pll-gd': [
      'M39 88L39 44',
      'M44 39L88 39',
      'M89.5 42.5L42.5 89.5',
      'M66 88L66 44',
      'M62.5 42.5L42.5 62.5',
      'M42.5 69.5L62.5 89.5',
    ],
  };

  for (const [caseId, expected] of Object.entries(expectedGPermArrows)) {
    const diagram = opCaseDiagramForCase('pll', caseId);
    const strokes = diagram.poster.shapes.filter((shape) => shape.stroke === '#ffffff').map((shape) => shape.d);
    const heads = diagram.poster.shapes.filter((shape) => shape.fill === '#ffffff' && !shape.stroke);
    assert.deepEqual(strokes, expected, `${caseId} should preserve poster G-perm arrow directions`);
    assert.equal(heads.length, expected.length, `${caseId} should use one arrow head per one-way arrow`);
  }
});

test('renders every OP case as accessible inline SVG without generated cube primitives or bitmap resources', () => {
  for (const item of opPdfAlgorithms) {
    const svg = opCaseSvgMarkup(item.kind, item.caseId);
    const diagram = opCaseDiagramForCase(item.kind, item.caseId);
    assert.match(svg, /<svg\b/);
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title>/);
    assert.match(svg, new RegExp(`${item.pdfLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.equal((svg.match(/<(path|rect)\b/g) || []).length, diagram.poster.shapes.length);
    assert.doesNotMatch(svg, /<image\b/i);
    assert.doesNotMatch(svg, /<foreignObject\b/i);
    assert.doesNotMatch(svg, /<marker\b/i);
    assert.doesNotMatch(svg, /<line\b/i);
    assert.doesNotMatch(svg, /marker-end|marker-start/i);
  }
});
