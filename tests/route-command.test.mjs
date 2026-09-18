import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

function createSimulator() {
  const dataJsContent = fs.readFileSync(path.resolve('data.js'), 'utf-8');
  const simulatorJsContent = fs.readFileSync(path.resolve('simulator.js'), 'utf-8');

  const dummyFetch = () => Promise.reject(new Error('offline'));
  const fn = new Function('fetch', `
    ${dataJsContent}
    ${simulatorJsContent}
    return CommandSimulator;
  `);
  const CommandSimulator = fn(dummyFetch);
  const sim = new CommandSimulator();
  // テスト高速化のため sleep を 0ms に短縮
  sim.sleep = () => Promise.resolve();
  return sim;
}

test('route (引数なし): PCの距離ベクトル型経路表が3列形式で正しく表示されること', async () => {
  const sim = createSimulator();
  const results = await sim.execute('route');

  assert.equal(results.ok, true, 'route コマンドは成功すること');
  assert.equal(results[0].type, 'command');
  assert.equal(results[0].text, '$ route');

  const fullText = results.map(r => r.text).join('\n');

  // 紙教材「第５回 ルータ模型の情報交換カード」準拠の3列ヘッダー確認
  assert.match(fullText, /宛先\s+距離\s+次ホップ/);
  assert.match(fullText, /あなたのPC.*経路表/);

  // 距離の語彙: 0 (自身), 1, 2, まだ不明
  assert.match(fullText, /192\.168\.1\.0\/24\s+0\s+自身/);
  assert.match(fullText, /192\.168\.1\.1\s+1\s+192\.168\.1\.1/);
  assert.match(fullText, /10\.0\.0\.0\/8\s+2\s+192\.168\.1\.1/);
  assert.match(fullText, /0\.0\.0\.0\/0\s+既定\s+192\.168\.1\.1/);
  assert.match(fullText, /198\.51\.100\.0\/24\s+まだ不明\s+-/);
});

test('route google.com: 経路上各ルータの経路表・転送判断・次ホップ選定が順次出力されること', async () => {
  const sim = createSimulator();
  const results = await sim.execute('route google.com');

  assert.equal(results.ok, true, 'route google.com は成功すること');
  assert.equal(results[0].type, 'command');
  assert.equal(results[0].text, '$ route google.com');

  const fullText = results.map(r => r.text).join('\n');

  // ホップ1 (PC)
  assert.match(fullText, /\[ホップ 1\] あなたのPC/);
  assert.match(fullText, /👉 転送判断:.*デフォルトルート.*192\.168\.1\.1/);

  // ホップ2 (ホームルータ)
  assert.match(fullText, /\[ホップ 2\] my-router\.local/);
  assert.match(fullText, /👉 転送判断:.*10\.0\.0\.1/);

  // ホップ3 (ISPルータ)
  assert.match(fullText, /\[ホップ 3\] provider-router-1\.isp\.net/);
  assert.match(fullText, /👉 転送判断:.*203\.0\.113\.5/);

  // ホップ4 (IXルータ)
  assert.match(fullText, /\[ホップ 4\] ix-router\.net/);
  assert.match(fullText, /👉 転送判断:.*142\.251\.24\.139/);

  // 目的地到達
  assert.match(fullText, /🎯 目的地 google\.com \(142\.251\.24\.139\) にパケットが到着しました/);

  // アニメーション同期用 hopData が各ホップに付与されていること
  const hopEntries = results.filter(r => r.hopData);
  assert.equal(hopEntries.length >= 4, true, '各ホップに hopData が付与されていること');
  assert.equal(hopEntries[0].hopIndex, 0);
  assert.equal(hopEntries[0].hopData.ip, '192.168.1.1');
});

test('route 未知ドメイン: エラーとなり failed フラグが立つこと', async () => {
  const sim = createSimulator();
  const results = await sim.execute('route unknown-domain-xyz.com');

  assert.equal(results.ok, false, '存在しないドメインは ok=false');
  const errorEntry = results.find(r => r.type === 'error');
  assert.ok(errorEntry, 'error 行が出力されること');
  assert.equal(errorEntry.failed, true);
  assert.match(errorEntry.text, /route: unknown-domain-xyz\.com: Name or service not known/);
});

test('route URL形式: checkAndSuggestDomain により修正案内が出ること', async () => {
  const sim = createSimulator();
  const results = await sim.execute('route https://google.com');

  assert.equal(results.ok, false);
  const errorEntry = results.find(r => r.type === 'error');
  assert.ok(errorEntry);
  assert.match(errorEntry.text, /URL形式では実行できません/);
  const fullText = results.map(r => r.text).join('\n');
  assert.match(fullText, /route google\.com/);
});

test('help コマンドに route が含まれること', async () => {
  const sim = createSimulator();
  const results = await sim.execute('help');
  const fullText = results.map(r => r.text).join('\n');
  assert.match(fullText, /route \[domain\]\s+-\s+経路表（ルーティングテーブル）の表示/);
});
