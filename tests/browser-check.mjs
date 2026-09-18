/**
 * browser-check.mjs
 * 
 * ブラウザ環境の canvas レンダリング挙動と F-1（サイズ暴走）を検証するスクリプト。
 * 外部依存なし（Node.js 標準組み込みのみ）。
 */

import fs from 'node:fs';
import path from 'node:path';

// 各ファイルを読み込む
const visualizerCode = fs.readFileSync(path.resolve('visualizer.js'), 'utf-8');
const baseline = JSON.parse(fs.readFileSync(path.resolve('tests/baseline.json'), 'utf-8'));

/**
 * ブラウザ環境の DOM / Canvas 挙動をシミュレート
 */
function createBrowserEnvironment({ containerWidth = 800, containerHeight = 250, dpr = 2 } = {}) {
  const listeners = {
    resize: []
  };

  // Canvas のモック
  const canvasElement = {
    id: 'network-canvas',
    width: 0,
    height: 0,
    style: {
      width: '',
      height: '',
      display: ''
    },
    // ブラウザの CSS / intrinsic size 挙動のシミュレーション:
    // style.width があればそれを優先。
    // なければ canvas.width (intrinsic width) とコンテナ幅 (min-width: 100%) の大きい方
    getBoundingClientRect() {
      if (this.style.width && this.style.width !== '') {
        if (this.style.width.endsWith('%')) {
          const pct = parseFloat(this.style.width) / 100;
          return {
            width: containerWidth * pct,
            height: containerHeight
          };
        }
        return {
          width: parseFloat(this.style.width),
          height: parseFloat(this.style.height || containerHeight)
        };
      }
      const effectiveWidth = this.width > 0 ? Math.max(containerWidth, this.width) : containerWidth;
      return {
        width: effectiveWidth,
        height: containerHeight
      };
    },
    getContext(type) {
      return {
        scale: () => {},
        setTransform: () => {},
        clearRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        fillText: () => {},
        measureText: () => ({ width: 50 }),
        moveTo: () => {},
        lineTo: () => {},
        setLineDash: () => {},
        save: () => {},
        restore: () => {}
      };
    }
  };

  // ラッパー要素 .canvas-wrapper (padding や h2 なしの純粋な領域)
  const canvasWrapper = {
    className: 'canvas-wrapper',
    clientWidth: containerWidth,
    clientHeight: containerHeight,
    classList: { contains: (c) => c === 'canvas-wrapper' },
    getBoundingClientRect() {
      return {
        width: containerWidth,
        height: containerHeight
      };
    },
    appendChild(child) {
      this.children = this.children || [];
      this.children.push(child);
    }
  };

  canvasElement.parentElement = canvasWrapper;

  // 親コンテナ .network-diagram (padding: 15px, h2 あり)
  const diagramElement = {
    className: 'network-diagram',
    clientWidth: containerWidth,
    clientHeight: containerHeight,
    classList: { contains: (c) => c === 'network-diagram' },
    // getBoundingClientRect は padding 15px * 2 = 30px を含む
    getBoundingClientRect() {
      return {
        width: containerWidth + 30,
        height: containerHeight + 30
      };
    },
    appendChild(child) {
      this.children = this.children || [];
      this.children.push(child);
    }
  };

  const documentMock = {
    getElementById(id) {
      if (id === 'network-canvas') return canvasElement;
      if (id === 'replay-animation') return { style: { display: 'none' } };
      return null;
    },
    querySelector(selector) {
      if (selector === '.canvas-wrapper') return canvasWrapper;
      if (selector === '.network-diagram') return diagramElement;
      return null;
    },
    querySelectorAll(selector) {
      return [];
    },
    createElement(tag) {
      return {
        id: '',
        className: '',
        style: {},
        innerHTML: '',
        textContent: '',
        onclick: null
      };
    }
  };

  const windowMock = {
    devicePixelRatio: dpr,
    addEventListener(event, handler) {
      if (listeners[event]) listeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
    },
    requestAnimationFrame(cb) {
      return 1;
    }
  };

  return {
    window: windowMock,
    document: documentMock,
    canvas: canvasElement,
    diagram: diagramElement,
    triggerResize() {
      for (const handler of listeners.resize) {
        handler();
      }
    }
  };
}

console.log('=== easyPacket Browser & Canvas Check (Phase 1 検証) ===');
console.log(`基準値コミット: ${baseline.commit} (${baseline.investigationDate})`);
console.log('環境: DevicePixelRatio = 2 (Retina), 親コンテナ表示幅 = 800px');

const env = createBrowserEnvironment({ containerWidth: 800, containerHeight: 250, dpr: 2 });
globalThis.requestAnimationFrame = env.window.requestAnimationFrame;

// visualizer.js を評価
const runVisualizer = new Function(
  'window',
  'document',
  'requestAnimationFrame',
  `${visualizerCode}; return NetworkVisualizer;`
);

const NetworkVisualizer = runVisualizer(env.window, env.document, env.window.requestAnimationFrame);
const visualizer = new NetworkVisualizer('network-canvas');

// resize ハンドラ登録のシミュレート (app.js:51-54 と同等)
env.window.addEventListener('resize', () => {
  visualizer.setupCanvas();
  visualizer.drawStaticNetwork();
});

const measurements = [];
measurements.push({
  step: '初期化直後 (resize 0)',
  canvasWidth: env.canvas.width,
  cssWidth: env.canvas.getBoundingClientRect().width
});

for (let i = 1; i <= 20; i++) {
  env.triggerResize();
  measurements.push({
    step: `resize ${i}回目`,
    canvasWidth: env.canvas.width,
    cssWidth: env.canvas.getBoundingClientRect().width
  });
}

console.log('\n[実測結果]');
console.table(measurements);

const initialWidth = measurements[0].canvasWidth;
const finalWidth = measurements[measurements.length - 1].canvasWidth;

console.log(`初期 canvas.width: ${initialWidth}px`);
console.log(`20回リサイズ後 canvas.width: ${finalWidth}px`);

// F-1 検証: リサイズで canvas.width が肥大化していないか
if (finalWidth > initialWidth) {
  console.error('\n❌ 【不具合 F-1 検出】canvas.width がリサイズごとに倍増しています！');
  console.error(`   ${initialWidth}px -> ${finalWidth}px (${finalWidth / initialWidth}倍)`);
  console.error('   原因: visualizer.js:15-35 が canvas 自身の実測幅から canvas.width を再計算しているため。');
  console.error('   判定: テスト失敗 (意図通り F-1 バグを捕捉しました)');
  process.exit(1);
} else {
  console.log('\n✅ 【F-1 解消確認】resize しても canvas.width は安定しています。');
  process.exit(0);
}
