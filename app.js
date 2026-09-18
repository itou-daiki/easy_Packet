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

        // ウィンドウ・コンテナリサイズ対応 (ResizeObserver + デバウンス 100ms)
        let resizeTimeout = null;
        const debouncedResize = () => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.visualizer.setupCanvas();
                this.visualizer.drawStaticNetwork();
            }, 100);
        };

        const canvasWrapper = document.querySelector('.canvas-wrapper') || document.querySelector('.network-diagram');
        if (typeof ResizeObserver !== 'undefined' && canvasWrapper) {
            const observer = new ResizeObserver(() => {
                debouncedResize();
            });
            observer.observe(canvasWrapper);
        }
        window.addEventListener('resize', debouncedResize);
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
        
        // コマンドの種類とドメインを取得
        const parts = commandLine.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const domain = parts[1];

        // 経路データを収集
        let routeData = null;
        const hopDataList = [];

        // 結果を1行ずつ表示
        for (const result of results) {
            if (result.type === 'clear') {
                this.clearConsole();
            } else {
                this.printLine(result);
                this.scrollToBottom();

                // アニメーション制御（最初のコマンド行でのみトリガー）
                if (result.type === 'command') {
                    // ここではまだアニメーションを開始しない
                }

                // tracerouteのホップデータを収集
                if (result.hopData) {
                    hopDataList.push(result.hopData);
                    await this.sleep(50);
                }

                // 1行ずつ表示する遅延（コマンド行以外）
                if (result.type !== 'command') {
                    await this.sleep(200);
                }
            }
        }

        // すべての出力が終わった後にアニメーションを開始
        if (cmd === 'traceroute' || cmd === 'tracert') {
            if (hopDataList.length > 0) {
                routeData = hopDataList;
            }
            this.visualizer.executeAnimation({ type: 'traceroute', route: routeData });
        } else if (cmd === 'ping') {
            // pingの場合もtracerouteデータがあれば使用
            if (this.simulator.routesData[domain]) {
                routeData = this.simulator.routesData[domain];
            }
            this.visualizer.executeAnimation({ type: 'ping', route: routeData });
        } else if (cmd === 'nslookup') {
            this.visualizer.executeAnimation({ type: 'nslookup' });
        } else if (cmd === 'ipconfig' || cmd === 'ifconfig' || cmd === 'whoami') {
            this.visualizer.executeAnimation({ type: 'ipconfig' });
        }

        this.scrollToBottom();
        this.isExecuting = false;
    }

    triggerAnimation(command, fullCommand) {
        // この関数は現在使用されていません
        // executeCommand内で直接visualizer.executeAnimationを呼び出しています
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
