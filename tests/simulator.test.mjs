import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// simulator.js を読み込んで評価
const simulatorCode = fs.readFileSync(path.resolve('simulator.js'), 'utf-8');

function createSimulator() {
  const dummyFetch = async (url) => {
    if (url === 'dns.json') return { json: async () => ({}) };
    if (url === 'routes.json') return { json: async () => ({}) };
    return { json: async () => ({}) };
  };
  const fn = new Function('fetch', `${simulatorCode}; return CommandSimulator;`);
  const CommandSimulator = fn(dummyFetch);
  return new CommandSimulator();
}

test('simulator: 未知のコマンドの挙動スナップショット', async () => {
  const simulator = createSimulator();
  const res = await simulator.execute('unknowncmd');
  assert.equal(res.length, 3);
  assert.equal(res[0].type, 'error');
  assert.match(res[0].text, /❌ 'unknowncmd' は認識されていません/);
  assert.equal(res[1].type, 'info');
});

test('simulator: help コマンドの挙動スナップショット', async () => {
  const simulator = createSimulator();
  const res = await simulator.execute('help');
  assert.ok(res.length > 5);
  assert.equal(res[0].type, 'command');
  assert.equal(res[0].text, '$ help');
  assert.equal(res[1].type, 'info');
  assert.match(res[1].text, /利用可能なコマンド/);
});

test('simulator: clear コマンドの挙動スナップショット', async () => {
  const simulator = createSimulator();
  const res = await simulator.execute('clear');
  assert.equal(res.length, 1);
  assert.equal(res[0].type, 'clear');
  assert.equal(res[0].text, '');
});

test('simulator: 引数なしコマンドのエラー出力スナップショット', async () => {
  const simulator = createSimulator();
  
  const nslookupRes = await simulator.execute('nslookup');
  assert.equal(nslookupRes[0].type, 'error');
  assert.match(nslookupRes[0].text, /ドメイン名が指定されていません/);

  const pingRes = await simulator.execute('ping');
  assert.equal(pingRes[0].type, 'error');
  assert.match(pingRes[0].text, /ドメイン名が指定されていません/);

  const tracerouteRes = await simulator.execute('traceroute');
  assert.equal(tracerouteRes[0].type, 'error');
  assert.match(tracerouteRes[0].text, /ドメイン名が指定されていません/);
});

// 【Phase 7 で反転させること】
// Phase 7-1 で www. 付きホスト名を受け入れるように修正した際、このテストは
// 「エラーにならず正常実行されること」を検証するようにアサーションを反転させる必要があります。
// 意図的なスナップショット固定のため、テスト失敗時に安易にコード側を戻さないでください。
test('【Phase 7 で反転させること】simulator: checkAndSuggestDomain (F-5) 現状挙動スナップショット', async () => {
  const simulator = createSimulator();
  
  // 現状は www. を含む入力がエラーで弾かれる挙動
  const pingWww = await simulator.execute('ping www.google.com');
  assert.equal(pingWww[0].type, 'error');
  assert.match(pingWww[0].text, /URL形式では実行できません/);

  // http:// を含む入力がエラーで弾かれる挙動
  const nslookupHttp = await simulator.execute('nslookup http://google.com');
  assert.equal(nslookupHttp[0].type, 'error');
  assert.match(nslookupHttp[0].text, /URL形式では実行できません/);
});
