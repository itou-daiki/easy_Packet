import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

// IPアドレスの各オクテットを数値配列に変換
function parseIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return null;
  }
  return parts;
}

// IPがRFC予約領域または許可リストに含まれるか判定
function isValidEducationalIp(ip) {
  if (ip === "TIMEOUT") return true;
  const octets = parseIpv4(ip);
  if (!octets) return false;
  const [a, b, c, d] = octets;

  // 1. RFC 1918 (プライベートアドレス)
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  // 2. RFC 5737 (ドキュメンテーション用予約アドレス)
  // TEST-NET-1: 192.0.2.0/24
  if (a === 192 && b === 0 && c === 2) return true;
  // TEST-NET-2: 198.51.100.0/24
  if (a === 198 && b === 51 && c === 100) return true;
  // TEST-NET-3: 203.0.113.0/24
  if (a === 203 && b === 0 && c === 113) return true;

  // 3. RFC 6598 (Shared Address / CGNAT)
  // 100.64.0.0/10 (100.64.0.0 - 100.127.255.255)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 4. 実在の公開Web/DNSサーバーおよびその所属網として明示的に許可されたIP
  const ALLOWED_PUBLIC_IPS = new Set([
    "8.8.8.8",          // Google Public DNS (ipconfigのDNSやnslookupサーバー表示)
    "142.251.24.139",   // google.com (実在Webサーバ)
    "142.251.24.0",     // google.com 宛先ネットワーク (/24)
    "20.205.243.166",   // github.com
    "20.205.243.0",     // github.com 宛先ネットワーク (/24)
    "182.22.59.229",    // yahoo.co.jp
    "182.22.59.0",      // yahoo.co.jp 宛先ネットワーク (/24)
    "20.112.52.29",     // microsoft.com
    "20.112.52.0",      // microsoft.com 宛先ネットワーク (/24)
    "54.239.28.85",     // amazon.com
    "198.35.26.96",     // wikipedia.org
    "142.250.207.46",   // youtube.com
    "104.244.42.193"    // twitter.com
  ]);

  return ALLOWED_PUBLIC_IPS.has(ip);
}

test("dns.json のすべてのIPがRFC予約領域または許可済み実在IPであること", () => {
  const dnsJson = JSON.parse(fs.readFileSync(path.resolve("dns.json"), "utf-8"));
  for (const [domain, ip] of Object.entries(dnsJson)) {
    assert.ok(
      isValidEducationalIp(ip),
      `dns.json の ${domain} の IP (${ip}) は RFC予約領域または許可リストに含まれていません`
    );
  }
});

test("routes.json のすべてのホップIPがRFC予約領域または許可済み実在IPであること", () => {
  const routesJson = JSON.parse(fs.readFileSync(path.resolve("routes.json"), "utf-8"));
  for (const [domain, hops] of Object.entries(routesJson)) {
    for (const hop of hops) {
      assert.ok(
        isValidEducationalIp(hop.ip),
        `routes.json の ${domain} ホップ (${hop.name}: ${hop.ip}) は RFC予約領域または許可リストに含まれていません`
      );
    }
  }
});

test("data.js の埋め込みデータ内の全IPがRFC予約領域または許可済み実在IPであること", () => {
  const dataJsContent = fs.readFileSync(path.resolve("data.js"), "utf-8");
  const dummyContext = {};
  const fn = new Function("window", `${dataJsContent}; return { DEFAULT_DNS_DATA, DEFAULT_ROUTES_DATA, DEFAULT_ROUTING_TABLES };`);
  const { DEFAULT_DNS_DATA, DEFAULT_ROUTES_DATA, DEFAULT_ROUTING_TABLES } = fn(dummyContext);

  for (const [domain, ip] of Object.entries(DEFAULT_DNS_DATA)) {
    assert.ok(
      isValidEducationalIp(ip),
      `data.js DEFAULT_DNS_DATA の ${domain} の IP (${ip}) は不正です`
    );
  }

  for (const [domain, hops] of Object.entries(DEFAULT_ROUTES_DATA)) {
    for (const hop of hops) {
      assert.ok(
        isValidEducationalIp(hop.ip),
        `data.js DEFAULT_ROUTES_DATA の ${domain} ホップ (${hop.name}: ${hop.ip}) は不正です`
      );
    }
  }

  // DEFAULT_ROUTING_TABLES の全IP検証
  for (const [key, router] of Object.entries(DEFAULT_ROUTING_TABLES)) {
    assert.ok(
      isValidEducationalIp(router.ip),
      `data.js DEFAULT_ROUTING_TABLES のルータ ${key} の IP (${router.ip}) は不正です`
    );
    for (const entry of router.table) {
      // dest の検証 (0.0.0.0/0 などのデフォルトルートは除外)
      const destIp = entry.dest.split('/')[0];
      if (destIp !== '0.0.0.0') {
        assert.ok(
          isValidEducationalIp(destIp),
          `data.js DEFAULT_ROUTING_TABLES ${key} の宛先 ${entry.dest} (${destIp}) は不正です`
        );
      }
      // nextHop の検証 ("自身", "-", "まだ不明" は除外)
      if (entry.nextHop !== '自身' && entry.nextHop !== '-' && entry.nextHop !== 'まだ不明') {
        assert.ok(
          isValidEducationalIp(entry.nextHop),
          `data.js DEFAULT_ROUTING_TABLES ${key} の次ホップ (${entry.nextHop}) は不正です`
        );
      }
    }
  }
});

test("simulator.js 内にランダムIP生成や禁止された実在組織IPが残っていないこと", () => {
  const simulatorCode = fs.readFileSync(path.resolve("simulator.js"), "utf-8");
  
  // C-2: ランダムIP生成の根絶
  assert.equal(
    /Math\.random\(\)\s*\*\s*220/.test(simulatorCode),
    false,
    "simulator.js に Math.random() * 220 によるランダムIP生成コードが残っています"
  );

  // C-3: Verizon Japan IP (210.81.153.1) の排除
  assert.equal(
    simulatorCode.includes("210.81.153.1"),
    false,
    "simulator.js に Verizon Japan の IP (210.81.153.1) が残っています"
  );

  // C-3: Equinix IP (198.32.176.1) の排除
  assert.equal(
    simulatorCode.includes("198.32.176.1"),
    false,
    "simulator.js に Equinix の IP (198.32.176.1) が残っています"
  );

  // 外部API URL の完全排除
  assert.equal(
    simulatorCode.includes("dns.google/resolve"),
    false,
    "simulator.js に dns.google への外部fetchが残っています"
  );
  assert.equal(
    simulatorCode.includes("api.ipify.org"),
    false,
    "simulator.js に api.ipify.org への外部fetchが残っています"
  );
  assert.equal(
    simulatorCode.includes("ipapi.co"),
    false,
    "simulator.js に ipapi.co への外部fetchが残っています"
  );
});

test("index.html に外部CDNや外部リソースへの依存（http/https）が1件も存在しないこと", () => {
  const indexHtml = fs.readFileSync(path.resolve("index.html"), "utf-8");
  
  // link / script / img タグ等で http:// または https:// が含まれていないこと
  const urlMatches = indexHtml.match(/https?:\/\/[^\s"'`<>]+/g) || [];
  assert.equal(
    urlMatches.length,
    0,
    `index.html に外部URL参照が残っています: ${urlMatches.join(', ')}`
  );

  // cdnjs への参照が完全に排除されていること
  assert.equal(
    indexHtml.includes("cdnjs.cloudflare.com"),
    false,
    "index.html に cdnjs.cloudflare.com への参照が残っています"
  );
});

test("すべての配布JSファイルに外部API/ドメインへのリクエストURLが存在しないこと", () => {
  const jsFiles = ["data.js", "simulator.js", "visualizer.js", "app.js"];
  for (const file of jsFiles) {
    const content = fs.readFileSync(path.resolve(file), "utf-8");
    // http:// または https:// で外部リクエストを送るURL（コメントや例示を除く実コード）を検出
    const fetchMatches = content.match(/fetch\s*\(\s*['"`]https?:\/\/[^'"`]+/g) || [];
    assert.equal(
      fetchMatches.length,
      0,
      `${file} に外部 fetch 呼び出しが残っています: ${fetchMatches.join(', ')}`
    );
  }
});

