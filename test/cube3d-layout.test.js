import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { cube3dLayoutSize, cube3dRectTransform } from '../public/cube3d-layout.js';

test('animated visual bounds never change the WebGL drawing size', () => {
  const canvas = {
    clientWidth: 520, clientHeight: 440,
    getBoundingClientRect() { throw new Error('animated bounds must not size the buffer'); },
  };
  assert.deepEqual(cube3dLayoutSize(canvas), {width: 520, height: 440});
  canvas.clientWidth = 320;
  assert.deepEqual(cube3dLayoutSize(canvas), {width: 320, height: 440});
});

test('different aspect ratios preserve cube proportions and align their centers', () => {
  const home = {left: 20, top: 200, width: 320, height: 180};
  const focus = {left: 30, top: 100, width: 500, height: 400};
  assert.equal(cube3dRectTransform(home, focus, 'matrix(1, 0, 0, 1, 0, -224)'),
    'translate(-100px, -10px) matrix(1, 0, 0, 1, 0, -224) scale(0.45)');
  assert.equal(cube3dRectTransform(focus, focus), 'translate(0px, 0px)  scale(1)');
});

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const transitionFunction = source.match(/function animateBluetooth3dLayout\([\s\S]*?\n\}/)[0];

function transitionHarness(reducedMotion = false) {
  const events = [];
  const animations = [];
  const rect = { left: 30, top: 100, width: 500, height: 400 };
  const context = vm.createContext({
    cube3d: { needsRender: true },
    bluetooth3dLayoutAnimation: null,
    bluetooth3dCanvasPlaceholder: { getBoundingClientRect: () => ({left: 20, top: 200, width: 320, height: 180}) },
    elements: { bluetooth3dCanvas: {
      getBoundingClientRect() { events.push('measure'); return rect; },
      animate(keyframes, options) {
        events.push('animate');
        const animation = {keyframes, options, cancelled: false, cancel() {this.cancelled = true;}};
        animations.push(animation);
        return animation;
      },
    } },
    resizeBluetoothCube3d() { events.push('resize'); },
    drawBluetoothCube3dFrame() { events.push('draw'); },
    getComputedStyle: () => ({transform: 'matrix(1, 0, 0, 1, 0, -224)'}),
    window: {matchMedia: () => ({matches: reducedMotion})},
    cube3dRectTransform,
    timerFocusEnterTransitionMs: 360,
    interfaceEaseOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  });
  vm.runInContext(transitionFunction, context);
  return {context, events, animations, rect};
}

test('resize is drawn before the transition can display a cleared canvas', () => {
  const {context, events, animations, rect} = transitionHarness();
  context.animateBluetooth3dLayout(rect, true);
  assert.deepEqual(events, ['resize', 'draw', 'measure', 'animate']);
  assert.equal(animations[0].options.duration, 360);
  animations[0].onfinish();
  assert.equal(context.bluetooth3dLayoutAnimation, null);
  assert.equal(animations[0].cancelled, true);
});

test('a stale completion cannot interrupt a reversed transition', () => {
  const {context, animations, rect} = transitionHarness();
  context.animateBluetooth3dLayout(rect, true);
  context.animateBluetooth3dLayout(rect, false);
  assert.equal(animations[0].cancelled, true);
  animations[0].onfinish();
  assert.equal(context.bluetooth3dLayoutAnimation, animations[1]);
  assert.equal(animations[1].cancelled, false);
  animations[1].onfinish();
  // Keep the home pose until the background fade finishes and the canvas is reattached.
  assert.equal(context.bluetooth3dLayoutAnimation, animations[1]);
});

test('reduced motion disables travel without losing the destination pose', () => {
  const {context, animations, rect} = transitionHarness(true);
  context.animateBluetooth3dLayout(rect, false);
  assert.equal(animations[0].options.duration, 0);
  assert.match(animations[0].keyframes[1].transform, /scale\(0\.45\)/);
});
