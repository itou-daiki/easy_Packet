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

        if (!this.dnsData[domain]) {
            results.push({ type: 'error', text: `*** ${domain} が見つかりません: Non-existent domain` });
            return results;
        }

        const ip = this.dnsData[domain];

        if (ip === 'TIMEOUT') {
            results.push({ type: 'error', text: `*** ${domain} への接続がタイムアウトしました` });
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

        await this.sleep(300);

        if (!this.dnsData[domain]) {
            results.push({ type: 'error', text: `ping: ${domain}: Name or service not known` });
            return results;
        }

        const ip = this.dnsData[domain];

        if (ip === 'TIMEOUT') {
            results.push({ type: 'info', text: `PING ${domain}: 56 data bytes` });
            results.push({ type: 'error', text: 'Request timeout for icmp_seq 0' });
            results.push({ type: 'error', text: 'Request timeout for icmp_seq 1' });
            results.push({ type: 'error', text: 'Request timeout for icmp_seq 2' });
            results.push({ type: 'error', text: '' });
            results.push({ type: 'error', text: `--- ${domain} ping statistics ---` });
            results.push({ type: 'error', text: '3 packets transmitted, 0 packets received, 100% packet loss' });
            return results;
        }

        results.push({ type: 'info', text: `PING ${domain} (${ip}): 56 data bytes` });

        // 4回のpingを送信
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
    }

    // traceroute コマンド
    async traceroute(domain) {
        const results = [];
        results.push({ type: 'command', text: `$ traceroute ${domain}` });

        await this.sleep(500);

        if (!this.dnsData[domain]) {
            results.push({ type: 'error', text: `traceroute: ${domain}: Name or service not known` });
            return results;
        }

        const ip = this.dnsData[domain];

        if (ip === 'TIMEOUT') {
            results.push({ type: 'error', text: `traceroute to ${domain}: タイムアウト` });
            return results;
        }

        results.push({ type: 'info', text: `traceroute to ${domain} (${ip}), 30 hops max, 60 byte packets` });

        const routes = this.routesData[domain] || [
            { ip: "192.168.1.1", name: "my-router.local", time: 1 },
            { ip: ip, name: domain, time: 20 }
        ];

        for (let i = 0; i < routes.length; i++) {
            await this.sleep(1000);
            const hop = routes[i];
            const time1 = (hop.time + Math.random() * 2).toFixed(3);
            const time2 = (hop.time + Math.random() * 2).toFixed(3);
            const time3 = (hop.time + Math.random() * 2).toFixed(3);

            results.push({
                type: 'success',
                text: `${i + 1}  ${hop.name} (${hop.ip})  ${time1} ms  ${time2} ms  ${time3} ms`,
                hopData: hop
            });
        }

        return results;
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
            results.push({ type: 'success', text: '' });
            results.push({ type: 'success', text: 'Ethernet adapter:' });
            results.push({ type: 'success', text: '   IPv4 Address: 192.168.1.100' });
            results.push({ type: 'success', text: '   Subnet Mask: 255.255.255.0' });
            results.push({ type: 'success', text: '   Default Gateway: 192.168.1.1' });
            results.push({ type: 'success', text: '' });
            results.push({ type: 'info', text: `Global IP Address: ${data.ip}` });
        } catch (error) {
            results.push({ type: 'error', text: 'グローバルIPアドレスの取得に失敗しました' });
            results.push({ type: 'info', text: 'ローカルIP: 192.168.1.100' });
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
    async execute(commandLine) {
        const parts = commandLine.trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (command) {
            case 'nslookup':
                if (args.length === 0) {
                    return [{ type: 'error', text: '使い方: nslookup <ドメイン名>' }];
                }
                return await this.nslookup(args[0]);

            case 'ping':
                if (args.length === 0) {
                    return [{ type: 'error', text: '使い方: ping <ドメイン名>' }];
                }
                return await this.ping(args[0]);

            case 'traceroute':
            case 'tracert':
                if (args.length === 0) {
                    return [{ type: 'error', text: '使い方: traceroute <ドメイン名>' }];
                }
                return await this.traceroute(args[0]);

            case 'ipconfig':
            case 'ifconfig':
            case 'whoami':
                return await this.ipconfig();

            case 'clear':
            case 'cls':
                return await this.clear();

            case 'help':
            case '?':
                return await this.help();

            default:
                return [{
                    type: 'error',
                    text: `'${command}' は認識されていません。'help' でコマンド一覧を表示できます。`
                }];
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
