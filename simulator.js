// コマンドシミュレーター
class CommandSimulator {
    constructor() {
        // オフライン用埋め込みデータで初期化 (data.js から同期的に取得)
        this.dnsData = typeof DEFAULT_DNS_DATA !== 'undefined' ? Object.assign({}, DEFAULT_DNS_DATA) : {};
        this.routesData = typeof DEFAULT_ROUTES_DATA !== 'undefined' ? Object.assign({}, DEFAULT_ROUTES_DATA) : {};
        this.loadData();
    }

    async loadData() {
        try {
            const [dnsResponse, routesResponse] = await Promise.all([
                fetch('dns.json'),
                fetch('routes.json')
            ]);
            if (dnsResponse.ok) this.dnsData = await dnsResponse.json();
            if (routesResponse.ok) this.routesData = await routesResponse.json();
        } catch (error) {
            // オフライン時・file:// 環境は埋め込みデータをそのまま使用
        }
    }

    // nslookup コマンド
    async nslookup(domain) {
        const results = [];
        results.push({ type: 'command', text: `$ nslookup ${domain}` });

        await this.sleep(300);

        // オフラインDNSデータから検索
        const ip = this.dnsData[domain];

        if (!ip || ip === 'TIMEOUT') {
            results.push({ type: 'error', text: `*** ${domain} が見つかりません: Non-existent domain` });
            return results;
        }

        results.push({ type: 'info', text: 'サーバー:  dns.google' });
        results.push({ type: 'info', text: 'Address:  8.8.8.8' });
        results.push({ type: 'success', text: '' });
        results.push({ type: 'success', text: `名前:    ${domain}` });
        results.push({ type: 'success', text: `Address: ${ip}` });

        return results;
    }

    // ping コマンド
    async ping(domain) {
        const results = [];
        results.push({ type: 'command', text: `$ ping ${domain}` });

        await this.sleep(200);

        // IP直接指定か、DNSから検索
        const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
        let ip = isIpAddress ? domain : this.dnsData[domain];

        if (!ip) {
            results.push({ type: 'error', text: `ping: ${domain}: DNS解決に失敗しました` });
            return results;
        }

        if (ip === 'TIMEOUT') {
            results.push({ type: 'info', text: `PING ${domain} (192.0.2.99): 56 data bytes` });
            for (let i = 0; i < 4; i++) {
                await this.sleep(300);
                results.push({ type: 'error', text: `Request timeout for icmp_seq ${i}` });
            }
            results.push({ type: 'info', text: '' });
            results.push({ type: 'info', text: `--- ${domain} ping statistics ---` });
            results.push({ type: 'error', text: '4 packets transmitted, 0 packets received, 100.0% packet loss' });
            return results;
        }

        results.push({ type: 'info', text: `PING ${domain} (${ip}): 56 data bytes` });

        // 4回のpingを送信
        for (let i = 0; i < 4; i++) {
            await this.sleep(300);
            const time = (Math.random() * 20 + 10).toFixed(1);
            const ttl = Math.floor(Math.random() * 8 + 56);
            results.push({
                type: 'success',
                text: `64 bytes from ${ip}: icmp_seq=${i} ttl=${ttl} time=${time} ms`
            });
        }

        results.push({ type: 'success', text: '' });
        results.push({ type: 'success', text: `--- ${domain} ping statistics ---` });
        results.push({ type: 'success', text: '4 packets transmitted, 4 packets received, 0% packet loss' });

        return results;
    }

    // traceroute コマンド
    async traceroute(domain) {
        const results = [];
        results.push({ type: 'command', text: `$ traceroute ${domain}` });

        await this.sleep(300);

        // IP直接指定か、DNSから検索
        const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
        let ip = isIpAddress ? domain : this.dnsData[domain];

        if (!ip || ip === 'TIMEOUT') {
            results.push({ type: 'error', text: `traceroute: ${domain}: Name or service not known` });
            return results;
        }

        results.push({ type: 'info', text: `traceroute to ${domain} (${ip}), 30 hops max, 60 byte packets` });

        // 経路データ (routesData) を取得、未登録ドメインはRFC 5737準拠のデフォルト経路
        let routes = this.routesData[domain];
        if (!routes) {
            routes = [
                { ip: "192.168.1.1", name: "my-router.local", time: 1 },
                { ip: "10.0.0.1", name: "provider-router-1.isp.net", time: 10 },
                { ip: "198.51.100.1", name: "ix-router.net", time: 18 },
                { ip: "203.0.113.1", name: "backbone-router.net", time: 24 },
                { ip: ip, name: domain, time: 28 }
            ];
        }

        for (let i = 0; i < routes.length; i++) {
            await this.sleep(300);
            const hop = routes[i];
            const baseTime = hop.time || (i + 1) * 6;
            const time1 = (baseTime + Math.random() * 1.5).toFixed(3);
            const time2 = (baseTime + Math.random() * 1.5).toFixed(3);
            const time3 = (baseTime + Math.random() * 1.5).toFixed(3);

            results.push({
                type: 'success',
                text: `${i + 1}  ${hop.name} (${hop.ip})  ${time1} ms  ${time2} ms  ${time3} ms`,
                hopData: { ip: hop.ip, name: hop.name, time: baseTime }
            });
        }

        return results;
    }

    // ipconfig コマンド (F-2, F-9 解消: 外部通信ゼロ・安全な教育用構成)
    async ipconfig() {
        const results = [];
        results.push({ type: 'command', text: `$ ipconfig` });

        await this.sleep(300);

        results.push({ type: 'info', text: 'Windows IP Configuration' });
        results.push({ type: 'info', text: '(※学習用の架空のネットワーク構成です)' });
        results.push({ type: 'success', text: '' });
        results.push({ type: 'success', text: 'Ethernet adapter ローカル エリア接続:' });
        results.push({ type: 'success', text: '   IPv4 アドレス . . . . . . . . . . . : 192.168.1.100' });
        results.push({ type: 'success', text: '   サブネット マスク . . . . . . . . . : 255.255.255.0' });
        results.push({ type: 'success', text: '   デフォルト ゲートウェイ . . . . . . : 192.168.1.1' });
        results.push({ type: 'success', text: '   DNS サーバー. . . . . . . . . . . . : 192.168.1.1' });
        results.push({ type: 'success', text: '                                         8.8.8.8' });

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
