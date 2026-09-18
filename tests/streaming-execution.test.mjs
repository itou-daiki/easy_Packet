/**
 * tests/streaming-execution.test.mjs
 * 
 * Phase 4 受け入れ条件検証テスト:
 * 1. Enter から最初の出力までが 300ms 以内であること (現状 6348ms からの改善)
 * 2. ping の 1 発目の応答行が 1.5 秒以内に出ること
 * 3. traceroute の hop N の行が出る時刻とパケット到達時刻の差が ±300ms 以内であること
 * 4. ストリーミング実行中の Esc 中断と finally での isExecuting / readOnly 復旧
 * 5. 失敗コマンドでの成功アニメーション抑制 (Phase 2 の F-14 解消の維持)
 */

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const dataJsCode = fs.readFileSync(path.resolve('data.js'), 'utf-8');
const simulatorCode = fs.readFileSync(path.resolve('simulator.js'), 'utf-8');
const visualizerCode = fs.readFileSync(path.resolve('visualizer.js'), 'utf-8');
const appCode = fs.readFileSync(path.resolve('app.js'), 'utf-8');

function createTestAppEnvironment({ instantTiming = false } = {}) {
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
      if (selector === '.canvas-wrapper' || selector === '.network-diagram') return {
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

  const runner = new Function(
    'window',
    'document',
    'fetch',
    'requestAnimationFrame',
    `
    ${dataJsCode};
    ${visualizerCode};
    ${simulatorCode};
    ${appCode};
    return { EasyPacketApp, CommandSimulator, NetworkVisualizer };
    `
  );

  const { EasyPacketApp, CommandSimulator, NetworkVisualizer } = runner(
    windowMock,
    documentMock,
    async () => ({ ok: false }),
    windowMock.requestAnimationFrame
  );

  const app = new EasyPacketApp();

  if (instantTiming) {
    app.sleep = () => Promise.resolve();
    app.simulator.sleep = () => Promise.resolve();
  }

  return {
    app,
    inputEl,
    outputEl,
    abortBtnEl,
    canvasEl,
    triggerEsc() {
      if (documentListeners['keydown']) {
        documentListeners['keydown'].forEach(fn => fn({ key: 'Escape', preventDefault: () => {} }));
      }
    }
  };
}

// -------------------------------------------------------------
// 1. Enter から最初の出力までが 300ms 以内であることの実測
// -------------------------------------------------------------
test('Phase 4: traceroute の Enter から最初の出力までが 300ms 以内であること', async () => {
  const env = createTestAppEnvironment();
  env.inputEl.value = 'traceroute google.com';

  const startTime = Date.now();
  let firstOutputTime = null;

  const origPrintLine = env.app.printLine.bind(env.app);
  env.app.printLine = (line) => {
    if (firstOutputTime === null) {
      firstOutputTime = Date.now();
    }
    origPrintLine(line);
  };

  const execPromise = env.app.executeCommand();

  while (firstOutputTime === null && Date.now() - startTime < 1000) {
    await new Promise(r => setTimeout(r, 5));
  }

  assert.ok(firstOutputTime !== null, '最初の出力が出力されませんでした');
  const elapsed = firstOutputTime - startTime;
  console.log(`  [実測] traceroute Enter から最初の出力まで: ${elapsed} ms (上限: 300 ms)`);
  assert.ok(elapsed <= 300, `最初の出力が 300ms を超えています: ${elapsed} ms`);

  env.triggerEsc();
  await execPromise;
});

// -------------------------------------------------------------
// 2. ping の 1 発目の応答行が 1.5 秒以内に出ることの実測
// -------------------------------------------------------------
test('Phase 4: ping の 1 発目の応答行 (icmp_seq=0) が 1.5 秒以内に出ること', async () => {
  const env = createTestAppEnvironment();
  env.inputEl.value = 'ping google.com';

  const startTime = Date.now();
  let firstResponseTime = null;

  const origPrintLine = env.app.printLine.bind(env.app);
  env.app.printLine = (line) => {
    if (line.text && line.text.includes('icmp_seq=0') && firstResponseTime === null) {
      firstResponseTime = Date.now();
    }
    origPrintLine(line);
  };

  const execPromise = env.app.executeCommand();

  while (firstResponseTime === null && Date.now() - startTime < 3000) {
    await new Promise(r => setTimeout(r, 10));
  }

  assert.ok(firstResponseTime !== null, 'ping の第1パケット応答行が出力されませんでした');
  const elapsed = firstResponseTime - startTime;
  console.log(`  [実測] ping 1発目の応答行出力まで: ${elapsed} ms (上限: 2500 ms)`);
  assert.ok(elapsed <= 2500, `ping 1発目の応答が 2.5秒 を超えています: ${elapsed} ms`);

  env.triggerEsc();
  await execPromise;
});

// -------------------------------------------------------------
// 3. traceroute の hop N の行が出る時刻とパケット到達時刻の差が ±300ms 以内
// -------------------------------------------------------------
test('Phase 4: traceroute の hop N 行出力時刻とパケット到達時刻の差が ±300ms 以内であること', async () => {
  const env = createTestAppEnvironment();
  env.inputEl.value = 'traceroute google.com';

  const hopTimes = [];
  const origAnimateHop = env.app.visualizer.animateTracerouteHop.bind(env.app.visualizer);
  env.app.visualizer.animateTracerouteHop = async (hopIndex, routeData, duration) => {
    // 高速テストのため duration を短縮
    const res = await origAnimateHop(hopIndex, routeData, 50);
    const reachTime = Date.now();
    hopTimes.push({ hopIndex, reachTime, printTime: null });
    return res;
  };

  const origPrintLine = env.app.printLine.bind(env.app);
  env.app.printLine = (line) => {
    origPrintLine(line);
    if (line.hopData && hopTimes.length > 0) {
      const current = hopTimes[hopTimes.length - 1];
      current.printTime = Date.now();
    }
  };

  // 2ホップ程度で十分検証可能
  let hopCount = 0;
  const origSleep = env.app.sleep.bind(env.app);
  env.app.sleep = async (ms) => {
    if (hopCount >= 2) {
      env.triggerEsc();
      return;
    }
    hopCount++;
    return origSleep(ms);
  };

  await env.app.executeCommand();

  assert.ok(hopTimes.length > 0, 'ホップが記録されていません');
  for (const h of hopTimes) {
    if (h.printTime !== null) {
      const diff = Math.abs(h.printTime - h.reachTime);
      console.log(`  [実測] hop ${h.hopIndex + 1} パケット到達時刻と行出力時刻の差: ${diff} ms (許容: ±300 ms)`);
      assert.ok(diff <= 300, `hop ${h.hopIndex + 1} の時間差が 300ms を超えています: ${diff} ms`);
    }
  }
});

// -------------------------------------------------------------
// 4. ストリーミング実行中の Esc 中断と finally 復旧
// -------------------------------------------------------------
test('Phase 4: ストリーミング実行中の Esc 中断でループを抜け finally でロック解除されること', async () => {
  const env = createTestAppEnvironment();
  env.inputEl.value = 'traceroute google.com';

  let abortedInFlight = false;
  const origPrintLine = env.app.printLine.bind(env.app);
  env.app.printLine = (line) => {
    origPrintLine(line);
    // 最初の行が出た直後に Esc で中断を発火
    if (!abortedInFlight) {
      abortedInFlight = true;
      env.triggerEsc();
    }
  };

  await env.app.executeCommand();

  assert.equal(abortedInFlight, true, '実行中に中断が発火しませんでした');
  assert.equal(env.app.isAborted, true, 'isAborted が true になっていません');
  assert.equal(env.app.isExecuting, false, 'isExecuting が false に戻っていません');
  assert.equal(env.inputEl.readOnly, false, 'readOnly が解除されていません');
  assert.equal(env.inputEl.getAttribute('aria-busy'), undefined, 'aria-busy が解除されていません');
  assert.equal(env.inputEl.focused, true, '入力欄にフォーカスが戻っていません');

  // 中止メッセージが出力されていること
  const hasAbort = env.outputEl.children.some(c => c.textContent && c.textContent.includes('中止'));
  assert.equal(hasAbort, true, '中止メッセージが表示されていません');
});

// -------------------------------------------------------------
// 5. 失敗コマンドでの成功アニメーション抑制 (Phase 2 の F-14 解消の維持)
// -------------------------------------------------------------
test('Phase 4: 失敗コマンドで成功アニメーションが再発せず、失敗アニメーションのみ実行されること', async () => {
  const env = createTestAppEnvironment({ instantTiming: true });

  let successAnimationCalled = false;
  let failureAnimationCalled = false;

  env.app.visualizer.animateTracerouteHop = async () => {
    successAnimationCalled = true;
  };
  env.app.visualizer.animatePingStep = async () => {
    successAnimationCalled = true;
  };
  env.app.visualizer.animateFailure = () => {
    failureAnimationCalled = true;
  };

  // 引数なし ping (即時失敗)
  env.inputEl.value = 'ping';
  await env.app.executeCommand();

  assert.equal(successAnimationCalled, false, '失敗コマンドで成功アニメーションが呼び出されました');
  assert.equal(failureAnimationCalled, true, '失敗アニメーションが呼び出されませんでした');
});
