// コマンドシミュレーター
class CommandSimulator {
    constructor() {
        this.dnsData = {};
        this.routesData = {};
        this.loadData();
    }

    async loadData() {
        try {
            const [dnsResponse, routesResponse] = await Promise.all([
                fetch('dns.json'),
                fetch('routes.json')
            ]);
            this.dnsData = await dnsResponse.json();
            this.routesData = await routesResponse.json();
        } catch (error) {
            console.error('データの読み込みに失敗しました:', error);
        }
    }

    // nslookup コマンド
    async nslookup(domain) {
        const results = [];
        results.push({ type: 'command', text: `$ nslookup ${domain}` });

        await this.sleep(500);

        try {
            // DNS over HTTPS (Google Public DNS) を使用して実際のIPアドレスを取得
            const response = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
            const data = await response.json();

            if (data.Status !== 0 || !data.Answer || data.Answer.length === 0) {
                results.push({ type: 'error', text: `*** ${domain} が見つかりません: Non-existent domain` });
                return results;
            }

            const ip = data.Answer[0].data;

            results.push({ type: 'info', text: 'サーバー:  dns.google' });
            results.push({ type: 'info', text: 'Address:  8.8.8.8' });
            results.push({ type: 'success', text: '' });
            results.push({ type: 'success', text: `名前:    ${domain}` });
            results.push({ type: 'success', text: `Address: ${ip}` });

            return results;
        } catch (error) {
            results.push({ type: 'error', text: `*** DNS問い合わせに失敗しました: ${error.message}` });
            return results;
        }
    }

    // ping コマンド
    async ping(domain) {
        const results = [];
        results.push({ type: 'command', text: `$ ping ${domain}` });

        await this.sleep(300);

        try {
            // DNS over HTTPS を使用して実際のIPアドレスを取得
            const response = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
            const data = await response.json();

            if (data.Status !== 0 || !data.Answer || data.Answer.length === 0) {
                results.push({ type: 'error', text: `ping: ${domain}: Name or service not known` });
                return results;
            }

            const ip = data.Answer[0].data;

            results.push({ type: 'info', text: `PING ${domain} (${ip}): 56 data bytes` });

            // 4回のpingを送信（シミュレーション）
            for (let i = 0; i < 4; i++) {
                await this.sleep(800);
                const time = (Math.random() * 35 + 15).toFixed(1);
                const ttl = Math.floor(Math.random() * 10 + 54);
                results.push({
                    type: 'success',
                    text: `64 bytes from ${ip}: icmp_seq=${i} ttl=${ttl} time=${time} ms`
                });
            }

            results.push({ type: 'success', text: '' });
            results.push({ type: 'success', text: `--- ${domain} ping statistics ---` });
            results.push({ type: 'success', text: '4 packets transmitted, 4 packets received, 0% packet loss' });

            return results;
        } catch (error) {
            results.push({ type: 'error', text: `ping: ${domain}: DNS解決に失敗しました` });
            return results;
        }
    }

    // traceroute コマンド
    async traceroute(domain) {
        const results = [];
        results.push({ type: 'command', text: `$ traceroute ${domain}` });

        await this.sleep(500);

        try {
            // DNS over HTTPS を使用して実際のIPアドレスを取得
            const dnsResponse = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
            const dnsData = await dnsResponse.json();

            if (dnsData.Status !== 0 || !dnsData.Answer || dnsData.Answer.length === 0) {
                results.push({ type: 'error', text: `traceroute: ${domain}: Name or service not known` });
                return results;
            }

            const ip = dnsData.Answer[0].data;

            results.push({ type: 'info', text: `traceroute to ${domain} (${ip}), 30 hops max, 60 byte packets` });
            results.push({ type: 'info', text: '実際の経路を取得中...' });

            // 実際のtraceroute情報を外部APIから取得
            const routes = await this.fetchRealTraceroute(domain);

            if (routes && routes.length > 0) {
                results.push({ type: 'success', text: `(※${domain}の実際のIP: ${ip} から推定した経路)` });

                for (let i = 0; i < routes.length; i++) {
                    await this.sleep(800);
                    const hop = routes[i];

                    results.push({
                        type: 'success',
                        text: `${i + 1}  ${hop.name} (${hop.ip})  ${hop.time1} ms  ${hop.time2} ms  ${hop.time3} ms`,
                        hopData: hop
                    });
                }
            } else {
                // フォールバック: APIが使えない場合はシミュレーション
                results.push({ type: 'warning', text: '(※実際の経路取得に失敗、シミュレーションで表示)' });

                const fallbackRoutes = this.routesData[domain] || [
                    { ip: "192.168.1.1", name: "my-router.local", time: 1 },
                    { ip: "10.0.0.1", name: "isp-gateway.net", time: 10 },
                    { ip: ip, name: domain, time: 25 }
                ];

                for (let i = 0; i < fallbackRoutes.length; i++) {
                    await this.sleep(1000);
                    const hop = fallbackRoutes[i];
                    const time1 = (hop.time + Math.random() * 2).toFixed(3);
                    const time2 = (hop.time + Math.random() * 2).toFixed(3);
                    const time3 = (hop.time + Math.random() * 2).toFixed(3);

                    results.push({
                        type: 'success',
                        text: `${i + 1}  ${hop.name} (${hop.ip})  ${time1} ms  ${time2} ms  ${time3} ms`,
                        hopData: { ip: hop.ip, name: hop.name, time: hop.time }
                    });
                }
            }

            return results;
        } catch (error) {
            results.push({ type: 'error', text: `traceroute: エラーが発生しました: ${error.message}` });
            return results;
        }
    }

    // 実際のtraceroute情報を取得（Geolocationベースの推定）
    async fetchRealTraceroute(domain) {
        try {
            // DNS解決で実際のIPアドレスを取得
            const dnsResponse = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
            const dnsData = await dnsResponse.json();

            if (dnsData.Status !== 0 || !dnsData.Answer || dnsData.Answer.length === 0) {
                return null;
            }

            const targetIP = dnsData.Answer[0].data;

            // 目的地のGeolocation情報を取得
            const geoResponse = await fetch(`https://ipapi.co/${targetIP}/json/`);

            if (!geoResponse.ok) {
                console.log('Geolocation API failed, using fallback');
                return null;
            }

            const geoData = await geoResponse.json();

            // 地理情報を元に現実的な経路を生成
            return this.generateRealisticRoute(domain, targetIP, geoData);
        } catch (error) {
            console.error('Real traceroute error:', error);
            return null;
        }
    }

    // 地理情報を元に現実的な経路を生成
    generateRealisticRoute(domain, targetIP, geoData) {
        const routes = [];
        let cumulativeTime = 0;

        // 1. ローカルルーター (Home Router)
        cumulativeTime += 1 + Math.random() * 1;
        routes.push({
            ip: "192.168.1.1",
            name: "home-router.local",
            time: cumulativeTime,
            time1: (cumulativeTime + Math.random() * 0.5).toFixed(3),
            time2: (cumulativeTime + Math.random() * 0.5).toFixed(3),
            time3: (cumulativeTime + Math.random() * 0.5).toFixed(3)
        });

        // 2. ISPゲートウェイ (ISP Gateway)
        cumulativeTime += 3 + Math.random() * 2;
        routes.push({
            ip: "10.0.0.1",
            name: "gateway.isp.net",
            time: cumulativeTime,
            time1: (cumulativeTime + Math.random() * 1).toFixed(3),
            time2: (cumulativeTime + Math.random() * 1).toFixed(3),
            time3: (cumulativeTime + Math.random() * 1).toFixed(3)
        });

        // 3. ISP地域ルーター (Regional ISP Router)
        cumulativeTime += 4 + Math.random() * 3;
        routes.push({
            ip: "203.0.113.10",
            name: "core-router.isp.net",
            time: cumulativeTime,
            time1: (cumulativeTime + Math.random() * 1.5).toFixed(3),
            time2: (cumulativeTime + Math.random() * 1.5).toFixed(3),
            time3: (cumulativeTime + Math.random() * 1.5).toFixed(3)
        });

        // 国・地域に応じた中間ホップを追加
        const country = geoData.country_code || 'US';
        const org = geoData.org || 'Unknown';

        // 4. バックボーンネットワーク
        if (country !== 'JP') {
            // 国際接続の場合
            cumulativeTime += 15 + Math.random() * 10;
            routes.push({
                ip: "198.32.176.1",
                name: "international-ix.net",
                time: cumulativeTime,
                time1: (cumulativeTime + Math.random() * 3).toFixed(3),
                time2: (cumulativeTime + Math.random() * 3).toFixed(3),
                time3: (cumulativeTime + Math.random() * 3).toFixed(3)
            });
        }

        // 5. 地域バックボーン
        cumulativeTime += 8 + Math.random() * 5;
        const regionName = country === 'JP' ? 'jp-backbone' :
                          country === 'US' ? 'us-backbone' :
                          'global-backbone';
        routes.push({
            ip: `${Math.floor(Math.random() * 220) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.1`,
            name: `${regionName}.net`,
            time: cumulativeTime,
            time1: (cumulativeTime + Math.random() * 2).toFixed(3),
            time2: (cumulativeTime + Math.random() * 2).toFixed(3),
            time3: (cumulativeTime + Math.random() * 2).toFixed(3)
        });

        // 6. CDN/サービスプロバイダのエッジ (該当する場合)
        if (org.toUpperCase().includes('GOOGLE') ||
            org.toUpperCase().includes('AMAZON') ||
            org.toUpperCase().includes('CLOUDFLARE') ||
            org.toUpperCase().includes('MICROSOFT')) {
            cumulativeTime += 3 + Math.random() * 2;
            const cdnName = org.toUpperCase().includes('GOOGLE') ? 'google-edge' :
                           org.toUpperCase().includes('AMAZON') ? 'aws-edge' :
                           org.toUpperCase().includes('CLOUDFLARE') ? 'cloudflare-edge' :
                           org.toUpperCase().includes('MICROSOFT') ? 'azure-edge' :
                           'cdn-edge';
            routes.push({
                ip: `${Math.floor(Math.random() * 220) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.2`,
                name: `${cdnName}.net`,
                time: cumulativeTime,
                time1: (cumulativeTime + Math.random() * 1).toFixed(3),
                time2: (cumulativeTime + Math.random() * 1).toFixed(3),
                time3: (cumulativeTime + Math.random() * 1).toFixed(3)
            });
        }

        // 7. 最終目的地
        cumulativeTime += 2 + Math.random() * 2;
        routes.push({
            ip: targetIP,
            name: domain,
            time: cumulativeTime,
            time1: (cumulativeTime + Math.random() * 1).toFixed(3),
            time2: (cumulativeTime + Math.random() * 1).toFixed(3),
            time3: (cumulativeTime + Math.random() * 1).toFixed(3)
        });

        return routes;
    }

    // ipconfig コマンド
    async ipconfig() {
        const results = [];
        results.push({ type: 'command', text: `$ ipconfig` });

        await this.sleep(500);

        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();

            results.push({ type: 'info', text: 'Windows IP Configuration' });
            results.push({ type: 'info', text: '(※ローカル情報は学習用の架空のデータです)' });
            results.push({ type: 'success', text: '' });
            results.push({ type: 'success', text: 'Ethernet adapter:' });
            results.push({ type: 'success', text: '   IPv4 Address: 192.168.1.100' });
            results.push({ type: 'success', text: '   Subnet Mask: 255.255.255.0' });
            results.push({ type: 'success', text: '   Default Gateway: 192.168.1.1' });
            results.push({ type: 'success', text: '' });
            results.push({ type: 'info', text: `Global IP Address: ${data.ip} (実際のIPアドレス)` });
        } catch (error) {
            results.push({ type: 'error', text: 'グローバルIPアドレスの取得に失敗しました' });
            results.push({ type: 'info', text: 'ローカルIP: 192.168.1.100 (学習用の架空のデータ)' });
        }

        return results;
    }

    // clear コマンド
    async clear() {
        return [{ type: 'clear', text: '' }];
    }

    // help コマンド
    async help() {
        const results = [];
        results.push({ type: 'command', text: '$ help' });
        results.push({ type: 'info', text: '利用可能なコマンド:' });
        results.push({ type: 'success', text: '  nslookup <domain>  - ドメイン名からIPアドレスを調べる' });
        results.push({ type: 'success', text: '  ping <domain>      - サーバーへの接続を確認する' });
        results.push({ type: 'success', text: '  traceroute <domain> - パケットの経路を追跡する' });
        results.push({ type: 'success', text: '  ipconfig           - 自分のIPアドレスを表示する' });
        results.push({ type: 'success', text: '  clear              - コンソールをクリアする' });
        results.push({ type: 'success', text: '  help               - このヘルプを表示する' });
        return results;
    }

    // コマンド実行
    // URLからドメイン名を抽出
    extractDomain(input) {
        // https://, http://, /などを削除
        let domain = input
            .replace(/^https?:\/\//, '')  // プロトコルを削除
            .replace(/^www\./, '')         // wwwを削除
            .replace(/\/.*$/, '')          // パス以降を削除
            .replace(/:\d+$/, '')          // ポート番号を削除
            .trim();
        
        return domain;
    }

    // 入力を正規化して修正案を提示
    // URL形式をチェックして修正案を提示
    checkAndSuggestDomain(input, command) {
        const original = input;
        const domain = this.extractDomain(input);
        
        // URL形式が検出された場合
        if (domain !== original) {
            return {
                hasError: true,
                results: [
                    { type: 'error', text: `❌ URL形式では実行できません: ${original}` },
                    { type: 'info', text: '' },
                    { type: 'info', text: '💡 正しい形式はドメイン名のみです：' },
                    { type: 'success', text: `   ${command} ${domain}` },
                    { type: 'info', text: '' },
                    { type: 'info', text: 'コマンドを修正して再度実行してください。' }
                ]
            };
        }
        
        return { hasError: false, results: [] };
    }

    async execute(commandLine) {
        const parts = commandLine.trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        let results;
        switch (command) {
            case 'nslookup':
                if (args.length === 0) {
                    results = [
                        { type: 'error', text: '❌ ドメイン名が指定されていません' },
                        { type: 'info', text: '💡 使い方: nslookup <ドメイン名>' },
                        { type: 'info', text: '例: nslookup google.com' }
                    ];
                    break;
                }
                // URL形式チェック
                const nslookupCheck = this.checkAndSuggestDomain(args[0], 'nslookup');
                if (nslookupCheck.hasError) {
                    results = nslookupCheck.results;
                    break;
                }
                results = await this.nslookup(args[0]);
                break;

            case 'ping':
                if (args.length === 0) {
                    results = [
                        { type: 'error', text: '❌ ドメイン名が指定されていません' },
                        { type: 'info', text: '💡 使い方: ping <ドメイン名>' },
                        { type: 'info', text: '例: ping google.com' }
                    ];
                    break;
                }
                // URL形式チェック
                const pingCheck = this.checkAndSuggestDomain(args[0], 'ping');
                if (pingCheck.hasError) {
                    results = pingCheck.results;
                    break;
                }
                results = await this.ping(args[0]);
                break;

            case 'traceroute':
            case 'tracert':
                if (args.length === 0) {
                    results = [
                        { type: 'error', text: '❌ ドメイン名が指定されていません' },
                        { type: 'info', text: '💡 使い方: traceroute <ドメイン名>' },
                        { type: 'info', text: '例: traceroute google.com' }
                    ];
                    break;
                }
                // URL形式チェック
                const tracerouteCheck = this.checkAndSuggestDomain(args[0], 'traceroute');
                if (tracerouteCheck.hasError) {
                    results = tracerouteCheck.results;
                    break;
                }
                results = await this.traceroute(args[0]);
                break;

            case 'ipconfig':
            case 'ifconfig':
            case 'whoami':
                results = await this.ipconfig();
                break;

            case 'clear':
            case 'cls':
                results = await this.clear();
                break;

            case 'help':
            case '?':
                results = await this.help();
                break;

            default:
                results = [
                    { type: 'error', text: `❌ '${command}' は認識されていません` },
                    { type: 'info', text: '💡 利用可能なコマンド: nslookup, ping, traceroute, ipconfig, clear, help' },
                    { type: 'info', text: '詳しくは「help」と入力してください' }
                ];
                break;
        }

        const hasError = Array.isArray(results) && results.some(r => r.type === 'error');
        results.ok = !hasError;
        return results;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
