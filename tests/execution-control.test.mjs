/**
 * tests/execution-control.test.mjs
 * 
 * Phase 2 検証テスト:
 * - F-13: 描画例外時の永久ロック解消 (try/finally による isExecuting 復旧)
 * - F-14: 失敗コマンドでの成功アニメーション抑制
 * - 実行中の readOnly / aria-busy 制御と完了後のフォーカス復帰
 * - 中断機能 (abortExecution / Esc)
 * - コンソール出力 500行上限
 */

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const simulatorCode = fs.readFileSync(path.resolve('simulator.js'), 'utf-8');
const visualizerCode = fs.readFileSync(path.resolve('visualizer.js'), 'utf-8');
const appCode = fs.readFileSync(path.resolve('app.js'), 'utf-8');

function createTestAppEnvironment({ onAnimationError = false } = {}) {
  const documentListeners = {};
  const elements = {};

  const inputEl = {
    id: 'console-input',
    value: '',
    readOnly: false,
    placeholder: 'default placeholder',
    attributes: {},
    focused: false,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    removeAttribute(k) { delete this.attributes[k]; },
    getAttribute(k) { return this.attributes[k]; },
    focus() { this.focused = true; },
    addEventListener() {}
  };

  const outputEl = {
    id: 'console-output',
    children: [],
    scrollTop: 0,
    scrollHeight: 100,
    appendChild(child) { this.children.push(child); },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
    },
    get firstChild() { return this.children[0] || null; }
  };

  const abortBtnEl = {
    id: 'abort-btn',
    style: { display: 'none' },
    addEventListener() {}
  };

  const canvasEl = {
    id: 'network-canvas',
    width: 800,
    height: 250,
    style: { width: '', height: '' },
    parentElement: { clientWidth: 800, clientHeight: 250, getBoundingClientRect: () => ({ width: 800, height: 250 }) },
    getBoundingClientRect() { return { width: 800, height: 250 }; },
    getContext() {
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

  elements['console-input'] = inputEl;
  elements['console-output'] = outputEl;
  elements['abort-btn'] = abortBtnEl;
  elements['network-canvas'] = canvasEl;

  const documentMock = {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(selector) {
      if (selector === '.canvas-wrapper') return {
        clientWidth: 800,
        clientHeight: 250,
        getBoundingClientRect: () => ({ width: 800, height: 250 }),
        appendChild() {}
      };
      return null;
    },
    querySelectorAll(selector) {
      return [];
    },
    createElement(tag) {
      return {
        id: '',
        className: '',
        textContent: '',
        innerHTML: '',
        style: {},
        appendChild() {},
        setAttribute() {},
        removeAttribute() {},
        addEventListener() {}
      };
    },
    addEventListener(event, handler) {
      documentListeners[event] = documentListeners[event] || [];
      documentListeners[event].push(handler);
    }
  };

  const windowMock = {
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (cb) => 1
  };

  // アプリケーション環境の構築
  const runner = new Function(
    'window',
    'document',
    'fetch',
    'requestAnimationFrame',
    `
    ${visualizerCode};
    ${simulatorCode};
    ${appCode};
    return { EasyPacketApp, CommandSimulator, NetworkVisualizer };
    `
  );

  const dummyFetch = async () => ({ json: async () => ({}) });
  const { EasyPacketApp, NetworkVisualizer } = runner(windowMock, documentMock, dummyFetch, windowMock.requestAnimationFrame);

  // NetworkVisualizer をラップしてアニメーション履歴を記録
  const animationCalls = [];
  const origExecuteAnimation = NetworkVisualizer.prototype.executeAnimation;
  NetworkVisualizer.prototype.executeAnimation = function(cmdData) {
    animationCalls.push(cmdData);
    if (onAnimationError) {
      throw new Error('Canvas render exception (F-13 simulation)');
    }
    return origExecuteAnimation.call(this, cmdData);
  };

  const app = new EasyPacketApp();
  // 高速化のため sleep を短縮
  app.sleep = () => Promise.resolve();

  return {
    app,
    inputEl,
    outputEl,
    abortBtnEl,
    animationCalls,
    triggerEsc() {
      for (const handler of documentListeners['keydown'] || []) {
        handler({ key: 'Escape', preventDefault() {} });
      }
    }
  };
}

test('F-13: 描画例外が発生しても isExecuting が必ず false に戻り、次コマンドが実行可能', async () => {
  const env = createTestAppEnvironment({ onAnimationError: true });
  
  env.inputEl.value = 'help';
  await env.app.executeCommand();

  // 例外が発生しても isExecuting が false に復帰
  assert.equal(env.app.isExecuting, false, 'isExecuting should be reset to false in finally block');
  assert.equal(env.inputEl.readOnly, false, 'readOnly should be reset');
  assert.equal(env.inputEl.getAttribute('aria-busy'), undefined);

  // 次のコマンドが正常に実行できること
  env.inputEl.value = 'clear';
  await env.app.executeCommand();
  assert.equal(env.app.isExecuting, false);
});

test('F-14: 失敗コマンドでは成功アニメーションが再生されない（failed フラグまたはスキップ）', async () => {
  const env = createTestAppEnvironment({ onAnimationError: false });

  // 引数なし ping (エラーになる)
  env.inputEl.value = 'ping';
  await env.app.executeCommand();

  assert.ok(env.animationCalls.length > 0, 'Animation call should be recorded');
  const lastCall = env.animationCalls[env.animationCalls.length - 1];
  assert.equal(lastCall.failed, true, 'Failed command must NOT trigger successful animation');
});

test('実行制御: 実行中は readOnly と aria-busy が設定され、完了後に解除＆フォーカス復帰', async () => {
  const env = createTestAppEnvironment();
  
  let checkedDuringExecution = false;
  env.app.sleep = async () => {
    // 実行中の状態を検査
    assert.equal(env.app.isExecuting, true);
    assert.equal(env.inputEl.readOnly, true);
    assert.equal(env.inputEl.getAttribute('aria-busy'), 'true');
    assert.equal(env.abortBtnEl.style.display, 'inline-block');
    checkedDuringExecution = true;
  };

  env.inputEl.value = 'help';
  await env.app.executeCommand();

  assert.equal(checkedDuringExecution, true, 'Mid-execution checks should have run');
  assert.equal(env.app.isExecuting, false);
  assert.equal(env.inputEl.readOnly, false);
  assert.equal(env.inputEl.getAttribute('aria-busy'), undefined);
  assert.equal(env.abortBtnEl.style.display, 'none');
  assert.equal(env.inputEl.focused, true, 'Focus should be restored to input after completion');
});

test('中断制御: Esc キーによるコマンド中断', async () => {
  const env = createTestAppEnvironment();

  env.app.sleep = async () => {
    // 実行中に Esc を発火
    env.triggerEsc();
  };

  env.inputEl.value = 'help';
  await env.app.executeCommand();

  assert.equal(env.app.isAborted, true, 'Execution should be marked as aborted');
  assert.equal(env.app.isExecuting, false, 'isExecuting must be restored');
  
  // 中止メッセージが出力されていること
  const hasAbortMessage = env.outputEl.children.some(c => c.textContent && c.textContent.includes('中止'));
  assert.equal(hasAbortMessage, true, 'Abort message should be printed');
});

test('コンソール管理: 出力行数が 500 行に制限されること', async () => {
  const env = createTestAppEnvironment();

  // 600 行を出力
  for (let i = 0; i < 600; i++) {
    env.app.printLine({ type: 'info', text: `line ${i}` });
  }

  assert.equal(env.outputEl.children.length, 500, 'Console output must be capped at 500 lines');
  assert.match(env.outputEl.children[499].textContent, /line 599/);
});
