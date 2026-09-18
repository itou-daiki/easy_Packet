/**
 * easyPacket - ネットワークデータ定義
 * 完全静的・オフラインで動作させるためのデータ定義ファイル
 */

const DEFAULT_DNS_DATA = {
  // C-1修正: google.com を 8.8.8.8 (DNSリゾルバ) から実在WebサーバIPに修正
  "google.com": "142.251.24.139",
  "github.com": "20.205.243.166",
  "example-school.ac.jp": "192.0.2.1",
  "broken-server.com": "TIMEOUT",
  "yahoo.co.jp": "182.22.59.229",
  "microsoft.com": "20.112.52.29",
  "amazon.com": "54.239.28.85",
  "wikipedia.org": "198.35.26.96",
  "youtube.com": "142.250.207.46",
  "twitter.com": "104.244.42.193"
};

const DEFAULT_ROUTES_DATA = {
  "google.com": [
    { "ip": "192.168.1.1", "name": "my-router.local", "time": 1 },
    { "ip": "10.0.0.1", "name": "provider-router-1.isp.net", "time": 15 },
    { "ip": "203.0.113.5", "name": "ix-router.net", "time": 20 },
    // C-1修正: 8.8.8.8 / google-dns.com を実在WebサーバIPに修正
    { "ip": "142.251.24.139", "name": "google.com", "time": 22 }
  ],
  "github.com": [
    { "ip": "192.168.1.1", "name": "my-router.local", "time": 1 },
    { "ip": "10.0.0.1", "name": "provider-router-1.isp.net", "time": 12 },
    { "ip": "198.51.100.1", "name": "backbone-router.net", "time": 25 },
    { "ip": "20.205.243.166", "name": "github.com", "time": 30 }
  ],
  "example-school.ac.jp": [
    { "ip": "192.168.1.1", "name": "my-router.local", "time": 1 },
    { "ip": "10.0.0.1", "name": "provider-router-1.isp.net", "time": 10 },
    { "ip": "192.0.2.1", "name": "example-school.ac.jp", "time": 18 }
  ],
  "yahoo.co.jp": [
    { "ip": "192.168.1.1", "name": "my-router.local", "time": 1 },
    { "ip": "10.0.0.1", "name": "provider-router-1.isp.net", "time": 8 },
    // C-3修正: 210.81.153.1 (Verizon Japan) を RFC 5737 TEST-NET-3 に置換
    { "ip": "203.0.113.20", "name": "jp-backbone.net", "time": 15 },
    { "ip": "182.22.59.229", "name": "yahoo.co.jp", "time": 19 }
  ],
  "microsoft.com": [
    { "ip": "192.168.1.1", "name": "my-router.local", "time": 1 },
    { "ip": "10.0.0.1", "name": "provider-router-1.isp.net", "time": 14 },
    { "ip": "198.51.100.2", "name": "azure-edge.net", "time": 28 },
    { "ip": "20.112.52.29", "name": "microsoft.com", "time": 32 }
  ]
};

const DEFAULT_ROUTING_TABLES = {
  // あなたのPC (192.168.1.100)
  "pc": {
    "name": "あなたのPC (192.168.1.100)",
    "ip": "192.168.1.100",
    "table": [
      { "dest": "192.168.1.0/24", "dist": 0, "nextHop": "自身", "note": "ローカルLAN" },
      { "dest": "192.168.1.1", "dist": 1, "nextHop": "192.168.1.1", "note": "ホームルータ" },
      { "dest": "10.0.0.0/8", "dist": 2, "nextHop": "192.168.1.1", "note": "プロバイダ網" },
      { "dest": "0.0.0.0/0", "dist": "既定", "nextHop": "192.168.1.1", "note": "デフォルトルート" },
      { "dest": "198.51.100.0/24", "dist": "まだ不明", "nextHop": "-", "note": "遠隔バックボーン" }
    ]
  },
  // ホームルータ (192.168.1.1)
  "192.168.1.1": {
    "name": "my-router.local (192.168.1.1)",
    "ip": "192.168.1.1",
    "table": [
      { "dest": "192.168.1.0/24", "dist": 0, "nextHop": "自身", "note": "家庭内LAN" },
      { "dest": "10.0.0.0/8", "dist": 1, "nextHop": "10.0.0.1", "note": "プロバイダ接続" },
      { "dest": "203.0.113.0/24", "dist": 2, "nextHop": "10.0.0.1", "note": "インターネットIX" },
      { "dest": "0.0.0.0/0", "dist": "既定", "nextHop": "10.0.0.1", "note": "デフォルトルート" },
      { "dest": "198.51.100.0/24", "dist": "まだ不明", "nextHop": "-", "note": "外部バックボーン" }
    ]
  },
  // プロバイダルータ (10.0.0.1)
  "10.0.0.1": {
    "name": "provider-router-1.isp.net (10.0.0.1)",
    "ip": "10.0.0.1",
    "table": [
      { "dest": "10.0.0.0/8", "dist": 0, "nextHop": "自身", "note": "ISP内部網" },
      { "dest": "192.168.1.0/24", "dist": 1, "nextHop": "192.168.1.1", "note": "加入者網" },
      { "dest": "203.0.113.0/24", "dist": 1, "nextHop": "203.0.113.5", "note": "国内IX網" },
      { "dest": "198.51.100.0/24", "dist": 1, "nextHop": "198.51.100.1", "note": "バックボーン網" },
      { "dest": "0.0.0.0/0", "dist": "既定", "nextHop": "203.0.113.5", "note": "デフォルトルート" }
    ]
  },
  // IXルータ (203.0.113.5)
  "203.0.113.5": {
    "name": "ix-router.net (203.0.113.5)",
    "ip": "203.0.113.5",
    "table": [
      { "dest": "203.0.113.0/24", "dist": 0, "nextHop": "自身", "note": "IX相互接続点" },
      { "dest": "10.0.0.0/8", "dist": 1, "nextHop": "10.0.0.1", "note": "ISP網" },
      { "dest": "142.251.24.0/24", "dist": 1, "nextHop": "142.251.24.139", "note": "Google網" }
    ]
  },
  // バックボーンルータ (198.51.100.1)
  "198.51.100.1": {
    "name": "backbone-router.net (198.51.100.1)",
    "ip": "198.51.100.1",
    "table": [
      { "dest": "198.51.100.0/24", "dist": 0, "nextHop": "自身", "note": "基幹網" },
      { "dest": "10.0.0.0/8", "dist": 1, "nextHop": "10.0.0.1", "note": "ISP網" },
      { "dest": "20.205.243.0/24", "dist": 1, "nextHop": "20.205.243.166", "note": "GitHub網" }
    ]
  },
  // 国内バックボーン (203.0.113.20)
  "203.0.113.20": {
    "name": "jp-backbone.net (203.0.113.20)",
    "ip": "203.0.113.20",
    "table": [
      { "dest": "203.0.113.0/24", "dist": 0, "nextHop": "自身", "note": "国内基幹網" },
      { "dest": "10.0.0.0/8", "dist": 1, "nextHop": "10.0.0.1", "note": "ISP網" },
      { "dest": "182.22.59.0/24", "dist": 1, "nextHop": "182.22.59.229", "note": "Yahoo網" }
    ]
  },
  // Microsoft向けエッジルータ (198.51.100.2)
  "198.51.100.2": {
    "name": "azure-edge.net (198.51.100.2)",
    "ip": "198.51.100.2",
    "table": [
      { "dest": "198.51.100.0/24", "dist": 0, "nextHop": "自身", "note": "エッジ接続網" },
      { "dest": "10.0.0.0/8", "dist": 1, "nextHop": "10.0.0.1", "note": "ISP網" },
      { "dest": "20.112.52.0/24", "dist": 1, "nextHop": "20.112.52.29", "note": "Microsoft網" }
    ]
  }
};

// ブラウザ・Node.js 両対応のエクスポート
if (typeof window !== 'undefined') {
  window.DEFAULT_DNS_DATA = DEFAULT_DNS_DATA;
  window.DEFAULT_ROUTES_DATA = DEFAULT_ROUTES_DATA;
  window.DEFAULT_ROUTING_TABLES = DEFAULT_ROUTING_TABLES;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_DNS_DATA, DEFAULT_ROUTES_DATA, DEFAULT_ROUTING_TABLES };
}
