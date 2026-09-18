import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// data.js と simulator.js を読み込んで評価
const dataJsCode = fs.readFileSync(path.resolve('data.js'), 'utf-8');
const simulatorCode = fs.readFileSync(path.resolve('simulator.js'), 'utf-8');

function createSimulator(customFetch = null) {
  const dummyFetch = customFetch || (async (url) => {
    // 既定ではネットワーク障害をシミュレート (fetch失敗でも埋め込みデータで動くこと)
    throw new Error('Offline mode (fetch blocked)');
  });
  const fn = new Function('fetch', `
    ${dataJsCode};
    ${simulatorCode};
    return CommandSimulator;
  `);
  const CommandSimulator = fn(dummyFetch);
  const sim = new CommandSimulator();
  // テスト高速化のため sleep を 0ms に短縮
  sim.sleep = () => Promise.resolve();
  return sim;
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

// ==========================================
// Phase 3: 完全オフライン・教材内容修正テスト
// ==========================================

test('Phase 3 (完全オフライン): fetch全遮断でも 4 コマンドがエラーなく完走すること', async () => {
  let fetchCalledCount = 0;
  const blockingFetch = async () => {
    fetchCalledCount++;
    throw new Error('Network disabled');
  };
  const simulator = createSimulator(blockingFetch);

  // 1. nslookup
  const nslookupRes = await simulator.execute('nslookup google.com');
  const nsErrors = nslookupRes.filter(r => r.type === 'error');
  assert.equal(nsErrors.length, 0, 'nslookup にエラー行が含まれています');

  // 2. ping
  const pingRes = await simulator.execute('ping google.com');
  const pingErrors = pingRes.filter(r => r.type === 'error');
  assert.equal(pingErrors.length, 0, 'ping にエラー行が含まれています');

  // 3. traceroute
  const traceRes = await simulator.execute('traceroute google.com');
  const traceErrors = traceRes.filter(r => r.type === 'error');
  assert.equal(traceErrors.length, 0, 'traceroute にエラー行が含まれています');

  // 4. ipconfig
  const ipconfigRes = await simulator.execute('ipconfig');
  const ipErrors = ipconfigRes.filter(r => r.type === 'error');
  assert.equal(ipErrors.length, 0, 'ipconfig にエラー行が含まれています');

  // ipconfig や traceroute の実行中に fetch が呼ばれていないこと (初期 loadData のみ例外)
  // 初期 loadData はコンストラクタで呼ばれるが、コマンド実行中には一切 fetch を呼ばない
  const countBeforeCommands = fetchCalledCount;
  await simulator.execute('ipconfig');
  await simulator.execute('ping google.com');
  assert.equal(fetchCalledCount, countBeforeCommands, 'コマンド実行中に fetch が呼び出されました');
});

test('Phase 3 (C-1): nslookup google.com の解決先が 142.251.24.139 (実在Web) であること', async () => {
  const simulator = createSimulator();
  const res = await simulator.execute('nslookup google.com');
  const addressLine = res.find(r => r.text && r.text.includes('Address: 142.251.24.139'));
  assert.ok(addressLine, 'google.com の解決先アドレスが 142.251.24.139 になっていません');

  // 8.8.8.8 は解決先 (Webサーバー) ではなく、問い合わせ先DNSサーバーとしてのみ表示されること
  const serverLine = res.find(r => r.text && r.text.includes('Address:  8.8.8.8'));
  assert.ok(serverLine, '問い合わせ先DNSサーバーとして 8.8.8.8 が表示されていません');
});

test('Phase 3 (C-1): traceroute google.com の最終目的地が 142.251.24.139 であること', async () => {
  const simulator = createSimulator();
  const res = await simulator.execute('traceroute google.com');
  const lastHop = res.filter(r => r.hopData).pop();
  assert.ok(lastHop, 'traceroute に hopData が含まれていません');
  assert.equal(lastHop.hopData.ip, '142.251.24.139');
  assert.equal(lastHop.hopData.name, 'google.com');
});

test('Phase 3 (F-2, F-9): ipconfig が安全な教育用構成を出力し、外部APIを呼ばないこと', async () => {
  const simulator = createSimulator();
  const res = await simulator.execute('ipconfig');
  const texts = res.map(r => r.text).join('\n');

  assert.match(texts, /192\.168\.1\.100/);
  assert.match(texts, /255\.255\.255\.0/);
  assert.match(texts, /192\.168\.1\.1/);
  assert.match(texts, /8\.8\.8\.8/);
  // 実IP取得失敗メッセージやプライバシー侵害情報がないこと
  assert.doesNotMatch(texts, /グローバルIPアドレスの取得に失敗しました/);
  assert.doesNotMatch(texts, /実際のIPアドレス/);
});

