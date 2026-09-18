// コマンドシミュレーター (Phase 4: ストリーミング化対応)
class CommandSimulator {
    constructor() {
        // オフライン用埋め込みデータで初期化 (data.js から同期的に取得)
        this.dnsData = typeof DEFAULT_DNS_DATA !== 'undefined' ? Object.assign({}, DEFAULT_DNS_DATA) : {};
        this.routesData = typeof DEFAULT_ROUTES_DATA !== 'undefined' ? Object.assign({}, DEFAULT_ROUTES_DATA) : {};
        this.isAborted = false;
        this.currentSleepResolve = null;
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

    abort() {
        this.isAborted = true;
        if (typeof this.currentSleepResolve === 'function') {
            this.currentSleepResolve();
            this.currentSleepResolve = null;
        }
    }

    resetAbort() {
        this.isAborted = false;
        this.currentSleepResolve = null;
    }

    sleep(ms) {
        if (this.isAborted) return Promise.resolve();
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                this.currentSleepResolve = null;
                resolve();
            }, ms);
            this.currentSleepResolve = () => {
                clearTimeout(timer);
                resolve();
            };
        });
    }

    // nslookup コマンド (AsyncGenerator)
    async *nslookup(domain) {
        if (!domain) {
            yield { type: 'error', text: '❌ ドメイン名が指定されていません', failed: true };
            yield { type: 'info', text: '💡 使い方: nslookup <ドメイン名>' };
            yield { type: 'info', text: '例: nslookup google.com' };
            return;
        }

        // URL形式チェック
        const check = this.checkAndSuggestDomain(domain, 'nslookup');
        if (check.hasError) {
            for (const item of check.results) {
                yield Object.assign({}, item, { failed: true });
            }
            return;
        }

        yield { type: 'command', text: `$ nslookup ${domain}` };
        yield { type: 'info', text: 'サーバー:  dns.google' };
        yield { type: 'info', text: 'Address:  8.8.8.8' };
        yield { type: 'success', text: '' };

        await this.sleep(200);
        if (this.isAborted) return;

        // オフラインDNSデータから検索
        const ip = this.dnsData[domain];

        if (!ip || ip === 'TIMEOUT') {
            yield { type: 'error', text: `*** ${domain} が見つかりません: Non-existent domain`, failed: true };
            return;
        }

        yield { type: 'success', text: `名前:    ${domain}` };
        yield { type: 'success', text: `Address: ${ip}` };
    }

    // ping コマンド (AsyncGenerator)
    async *ping(domain) {
        if (!domain) {
            yield { type: 'error', text: '❌ ドメイン名が指定されていません', failed: true };
            yield { type: 'info', text: '💡 使い方: ping <ドメイン名>' };
            yield { type: 'info', text: '例: ping google.com' };
            return;
        }

        // URL形式チェック
        const check = this.checkAndSuggestDomain(domain, 'ping');
        if (check.hasError) {
            for (const item of check.results) {
                yield Object.assign({}, item, { failed: true });
            }
            return;
        }

        yield { type: 'command', text: `$ ping ${domain}` };

        // IP直接指定か、DNSから検索
        const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
        let ip = isIpAddress ? domain : this.dnsData[domain];

        if (!ip) {
            yield { type: 'error', text: `ping: ${domain}: DNS解決に失敗しました`, failed: true };
            return;
        }

        if (ip === 'TIMEOUT') {
            yield { type: 'info', text: `PING ${domain} (192.0.2.99): 56 data bytes` };
            for (let i = 0; i < 4; i++) {
                await this.sleep(400);
                if (this.isAborted) return;
                yield { type: 'error', text: `Request timeout for icmp_seq ${i}` };
            }
            yield { type: 'info', text: '' };
            yield { type: 'info', text: `--- ${domain} ping statistics ---` };
            yield { type: 'error', text: '4 packets transmitted, 0 packets received, 100.0% packet loss', failed: true };
            return;
        }

        // 正常な ping (最初のヘッダー行は即時 yield)
        yield {
            type: 'info',
            text: `PING ${domain} (${ip}): 56 data bytes`,
            pingHeader: { domain, ip }
        };

        const baseTime = domain === 'example-school.ac.jp' ? 5 : 15;
        // 4回のpingを送信 (1発目の応答行は 400ms 以内に出力)
        for (let i = 0; i < 4; i++) {
            await this.sleep(i === 0 ? 400 : 700);
            if (this.isAborted) return;

            const time = (baseTime + Math.random() * 8).toFixed(1);
            const ttl = Math.floor(Math.random() * 8 + 56);
            yield {
                type: 'success',
                text: `64 bytes from ${ip}: icmp_seq=${i} ttl=${ttl} time=${time} ms`,
                pingStep: { seq: i, ip, ttl, time }
            };
        }

        yield { type: 'success', text: '' };
        yield { type: 'success', text: `--- ${domain} ping statistics ---` };
        yield { type: 'success', text: '4 packets transmitted, 4 packets received, 0% packet loss' };
    }

    // traceroute コマンド (AsyncGenerator)
    async *traceroute(domain) {
        if (!domain) {
            yield { type: 'error', text: '❌ ドメイン名が指定されていません', failed: true };
            yield { type: 'info', text: '💡 使い方: traceroute <ドメイン名>' };
            yield { type: 'info', text: '例: traceroute google.com' };
            return;
        }

        // URL形式チェック
        const check = this.checkAndSuggestDomain(domain, 'traceroute');
        if (check.hasError) {
            for (const item of check.results) {
                yield Object.assign({}, item, { failed: true });
            }
            return;
        }

        yield { type: 'command', text: `$ traceroute ${domain}` };

        // IP直接指定か、DNSから検索
        const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
        let ip = isIpAddress ? domain : this.dnsData[domain];

        if (!ip || ip === 'TIMEOUT') {
            yield { type: 'error', text: `traceroute: ${domain}: Name or service not known`, failed: true };
            return;
        }

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

        // 最初のヘッダー行は即時 yield (0ms)
        yield {
            type: 'info',
            text: `traceroute to ${domain} (${ip}), 30 hops max, 60 byte packets`,
            tracerouteHeader: { domain, ip, routes }
        };

        for (let i = 0; i < routes.length; i++) {
            // ホップ行出力前の通信遅延 (パケット飛行時間 400ms と同期)
            await this.sleep(400);
            if (this.isAborted) return;

            const hop = routes[i];
            const baseTime = hop.time || (i + 1) * 6;
            const time1 = (baseTime + Math.random() * 1.5).toFixed(3);
            const time2 = (baseTime + Math.random() * 1.5).toFixed(3);
            const time3 = (baseTime + Math.random() * 1.5).toFixed(3);

            yield {
                type: 'success',
                text: `${i + 1}  ${hop.name} (${hop.ip})  ${time1} ms  ${time2} ms  ${time3} ms`,
                hopData: { ip: hop.ip, name: hop.name, time: baseTime },
                hopIndex: i,
                totalHops: routes.length
            };
        }
    }

    // ipconfig コマンド (AsyncGenerator)
    async *ipconfig() {
        yield { type: 'command', text: `$ ipconfig` };

        await this.sleep(100);
        if (this.isAborted) return;

        yield { type: 'info', text: 'Windows IP Configuration' };
        yield { type: 'info', text: '(※学習用の架空のネットワーク構成です)' };
        yield { type: 'success', text: '' };
        yield { type: 'success', text: 'Ethernet adapter ローカル エリア接続:' };
        yield { type: 'success', text: '   IPv4 アドレス . . . . . . . . . . . : 192.168.1.100' };
        yield { type: 'success', text: '   サブネット マスク . . . . . . . . . : 255.255.255.0' };
        yield { type: 'success', text: '   デフォルト ゲートウェイ . . . . . . : 192.168.1.1' };
        yield { type: 'success', text: '   DNS サーバー. . . . . . . . . . . . : 192.168.1.1' };
        yield { type: 'success', text: '                                         8.8.8.8' };
    }

    // clear コマンド (AsyncGenerator)
    async *clear() {
        yield { type: 'clear', text: '' };
    }

    // help コマンド (AsyncGenerator)
    async *help() {
        yield { type: 'command', text: '$ help' };
        yield { type: 'info', text: '利用可能なコマンド:' };
        yield { type: 'success', text: '  nslookup <domain>  - ドメイン名からIPアドレスを調べる' };
        yield { type: 'success', text: '  ping <domain>      - サーバーへの接続を確認する' };
        yield { type: 'success', text: '  traceroute <domain> - パケットの経路を追跡する' };
        yield { type: 'success', text: '  ipconfig           - 自分のIPアドレスを表示する' };
        yield { type: 'success', text: '  clear              - コンソールをクリアする' };
        yield { type: 'success', text: '  help               - このヘルプを表示する' };
    }

    // コマンド実行
    // URLからドメイン名を抽出
    extractDomain(input) {
        let domain = input
            .replace(/^https?:\/\//, '')  // プロトコルを削除
            .replace(/^www\./, '')         // wwwを削除
            .replace(/\/.*$/, '')          // パス以降を削除
            .replace(/:\d+$/, '')          // ポート番号を削除
            .trim();
        return domain;
    }

    // 入力を正規化して修正案を提示
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

    // メイン実行 (AsyncGenerator: 1行できるたびに即時 yield、かつ await 時に配列としても解決可能)
    execute(commandLine) {
        const gen = this._executeGenerator(commandLine);
        gen.then = (onResolve, onReject) => {
            return (async () => {
                const results = [];
                for await (const item of this._executeGenerator(commandLine)) {
                    results.push(item);
                }
                const hasError = results.some(r => r.type === 'error' || r.failed);
                results.ok = !hasError;
                return results;
            })().then(onResolve, onReject);
        };
        return gen;
    }

    async *_executeGenerator(commandLine) {
        this.resetAbort();
        const parts = commandLine.trim().split(/\s+/);
        const command = parts[0] ? parts[0].toLowerCase() : '';
        const arg = parts.slice(1).join(' ');

        switch (command) {
            case 'nslookup':
                yield* this.nslookup(arg);
                break;

            case 'ping':
                yield* this.ping(arg);
                break;

            case 'traceroute':
            case 'tracert':
                yield* this.traceroute(arg);
                break;

            case 'ipconfig':
            case 'ifconfig':
            case 'whoami':
                yield* this.ipconfig();
                break;

            case 'clear':
            case 'cls':
                yield* this.clear();
                break;

            case 'help':
            case '?':
                yield* this.help();
                break;

            default:
                yield { type: 'error', text: `❌ '${command}' は認識されていません`, failed: true };
                yield { type: 'info', text: '💡 利用可能なコマンド: nslookup, ping, traceroute, ipconfig, clear, help' };
                yield { type: 'info', text: '詳しくは「help」と入力してください' };
                break;
        }
    }

    // 後方互換・一括取得ヘルパー (テスト等用)
    async executeAll(commandLine) {
        const results = [];
        for await (const line of this._executeGenerator(commandLine)) {
            results.push(line);
        }
        const hasError = results.some(r => r.type === 'error' || r.failed);
        results.ok = !hasError;
        return results;
    }
}
