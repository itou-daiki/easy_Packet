// メインアプリケーション
class EasyPacketApp {
    constructor() {
        this.simulator = new CommandSimulator();
        this.visualizer = new NetworkVisualizer('network-canvas');
        this.consoleOutput = document.getElementById('console-output');
        this.consoleInput = document.getElementById('console-input');
        this.setupEventListeners();
        this.commandHistory = [];
        this.historyIndex = -1;
        this.isExecuting = false;

        // ウェルカムメッセージ
        this.printWelcome();
    }

    setupEventListeners() {
        // コマンド入力
        this.consoleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!this.isExecuting) {
                    this.executeCommand();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(1);
            }
        });

        // クイックコマンドボタン
        document.querySelectorAll('.cmd-btn').forEach(button => {
            button.addEventListener('click', () => {
                const cmd = button.getAttribute('data-cmd');
                if (cmd === 'clear') {
                    this.clearConsole();
                } else {
                    this.consoleInput.value = cmd;
                    this.consoleInput.focus();
                    if (!this.isExecuting) {
                        this.executeCommand();
                    }
                }
            });
        });

        // ウィンドウリサイズ対応
        window.addEventListener('resize', () => {
            this.visualizer.setupCanvas();
            this.visualizer.drawStaticNetwork();
        });
    }

    printWelcome() {
        const welcomeLines = [
            { type: 'info', text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
            { type: 'success', text: '   🌐 easyPacket - ネットワーク学習シミュレーター' },
            { type: 'info', text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
            { type: 'success', text: '' },
            { type: 'info', text: 'コマンドを入力してネットワークの動きを学びましょう！' },
            { type: 'info', text: '' },
            { type: 'success', text: '💡 ヒント: 右側のボタンをクリックするか、' },
            { type: 'success', text: '   コンソールに直接入力してください。' },
            { type: 'success', text: '' },
            { type: 'info', text: '📝 コマンド一覧を見るには「help」と入力してください。' },
            { type: 'success', text: '' }
        ];

        welcomeLines.forEach(line => this.printLine(line));
        this.scrollToBottom();
    }

    async executeCommand() {
        const commandLine = this.consoleInput.value.trim();
        if (!commandLine) return;

        this.isExecuting = true;
        this.consoleInput.value = '';
        this.commandHistory.push(commandLine);
        this.historyIndex = this.commandHistory.length;

        // コマンドを実行
        const results = await this.simulator.execute(commandLine);

        // 結果を表示
        for (const result of results) {
            if (result.type === 'clear') {
                this.clearConsole();
            } else {
                this.printLine(result);

                // アニメーション制御
                if (result.type === 'command') {
                    const cmd = commandLine.split(/\s+/)[0].toLowerCase();
                    this.triggerAnimation(cmd, commandLine);
                }

                // tracerouteの場合、ホップごとにアニメーション
                if (result.hopData) {
                    await this.sleep(50);
                }
            }
        }

        this.scrollToBottom();
        this.isExecuting = false;
    }

    triggerAnimation(command, fullCommand) {
        const domain = fullCommand.split(/\s+/)[1];

        switch (command) {
            case 'nslookup':
                this.visualizer.animateNslookup();
                break;

            case 'ping':
                if (domain === 'broken-server.com') {
                    this.visualizer.animateTimeout();
                } else {
                    this.visualizer.animatePing();
                }
                break;

            case 'traceroute':
            case 'tracert':
                // routes.jsonから経路の長さを取得
                this.simulator.routesData[domain]?.length || 4;
                const hopCount = this.simulator.routesData[domain]?.length || 4;
                this.visualizer.animateTraceroute(hopCount);
                break;

            case 'ipconfig':
            case 'ifconfig':
            case 'whoami':
                this.visualizer.animateIpconfig();
                break;
        }
    }

    printLine(result) {
        const line = document.createElement('div');
        line.className = `console-line ${result.type}`;
        line.textContent = result.text;

        // TTLなどの専門用語にツールチップを追加
        if (result.text.includes('ttl=')) {
            line.innerHTML = result.text.replace(
                /ttl=(\d+)/g,
                '<span class="tooltip" title="Time To Live: パケットが通過できるルーターの最大数">ttl=$1</span>'
            );
        }

        this.consoleOutput.appendChild(line);
    }

    scrollToBottom() {
        this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;
    }

    clearConsole() {
        this.consoleOutput.innerHTML = '';
        this.visualizer.clearPackets();
    }

    navigateHistory(direction) {
        if (this.commandHistory.length === 0) return;

        this.historyIndex += direction;

        if (this.historyIndex < 0) {
            this.historyIndex = 0;
        } else if (this.historyIndex >= this.commandHistory.length) {
            this.historyIndex = this.commandHistory.length;
            this.consoleInput.value = '';
            return;
        }

        this.consoleInput.value = this.commandHistory[this.historyIndex];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// アプリケーション初期化
window.addEventListener('DOMContentLoaded', () => {
    window.app = new EasyPacketApp();
});
