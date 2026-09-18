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

// ブラウザ・Node.js 両対応のエクスポート
if (typeof window !== 'undefined') {
  window.DEFAULT_DNS_DATA = DEFAULT_DNS_DATA;
  window.DEFAULT_ROUTES_DATA = DEFAULT_ROUTES_DATA;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_DNS_DATA, DEFAULT_ROUTES_DATA };
}
