// メインアプリケーション
class EasyPacketApp {
    constructor() {
        this.simulator = new CommandSimulator();
        this.visualizer = new NetworkVisualizer('network-canvas');
        this.consoleOutput = document.getElementById('console-output');
        this.consoleInput = document.getElementById('console-input');
        this.abortBtn = document.getElementById('abort-btn');
        this.defaultPlaceholder = this.consoleInput ? this.consoleInput.placeholder : '';
        this.commandHistory = [];
        this.historyIndex = -1;
        this.isExecuting = false;
        this.isAborted = false;
        this.currentSleepTimer = null;
        this.currentSleepResolver = null;
        this.setupEventListeners();

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

        // 実行中断用キーハンドラ（documentに登録してフォーカス問わずEscで中断）
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isExecuting) {
                e.preventDefault();
                this.abortExecution();
            }
        });

        // 中止ボタン
        if (this.abortBtn) {
            this.abortBtn.addEventListener('click', () => {
                if (this.isExecuting) {
                    this.abortExecution();
                }
            });
        }

        // クイックコマンドボタン
        document.querySelectorAll('.cmd-btn').forEach(button => {
            button.addEventListener('click', () => {
                if (this.isExecuting) return;
                const cmd = button.getAttribute('data-cmd');
                this.consoleInput.value = cmd;
                this.executeCommand();
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

    setControlsLocked(locked) {
        if (this.consoleInput) {
            this.consoleInput.readOnly = locked;
            if (locked) {
                this.consoleInput.setAttribute('aria-busy', 'true');
                this.consoleInput.placeholder = '⏳ 実行中... (Escで中止)';
            } else {
                this.consoleInput.removeAttribute('aria-busy');
                this.consoleInput.placeholder = this.defaultPlaceholder;
            }
        }

        if (this.abortBtn) {
            this.abortBtn.style.display = locked ? 'inline-block' : 'none';
        }

        document.querySelectorAll('.cmd-btn').forEach(button => {
            button.disabled = locked;
        });
    }

    abortExecution() {
        if (!this.isExecuting || this.isAborted) return;
        this.isAborted = true;
        this.printLine({ type: 'warning', text: '🛑 コマンドの実行を中止しました。' });
        this.scrollToBottom();

        // 進行中のsleepを即時解除
        if (this.currentSleepTimer) {
            clearTimeout(this.currentSleepTimer);
            this.currentSleepTimer = null;
        }
        if (this.currentSleepResolver) {
            this.currentSleepResolver();
            this.currentSleepResolver = null;
        }

        // パケットアニメーション停止
        this.visualizer.clearPackets();
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
        this.isAborted = false;
        this.setControlsLocked(true);

        this.consoleInput.value = '';
        this.commandHistory.push(commandLine);
        this.historyIndex = this.commandHistory.length;

        try {
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
                if (this.isAborted) break;

                if (result.type === 'clear') {
                    this.clearConsole();
                } else {
                    this.printLine(result);
                    this.scrollToBottom();

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

            // 中断されておらず、かつエラーがない場合のみアニメーション実行
            const hasError = Array.isArray(results) && (results.ok === false || results.some(r => r.type === 'error'));
            const isSuccess = !this.isAborted && !hasError;

            if (isSuccess) {
                // すべての出力が終わった後にアニメーションを開始
                if (cmd === 'traceroute' || cmd === 'tracert') {
                    if (hopDataList.length > 0) {
                        routeData = hopDataList;
                    }
                    this.visualizer.executeAnimation({ type: 'traceroute', route: routeData });
                } else if (cmd === 'ping') {
                    if (this.simulator.routesData && this.simulator.routesData[domain]) {
                        routeData = this.simulator.routesData[domain];
                    }
                    this.visualizer.executeAnimation({ type: 'ping', route: routeData });
                } else if (cmd === 'nslookup') {
                    this.visualizer.executeAnimation({ type: 'nslookup' });
                } else if (cmd === 'ipconfig' || cmd === 'ifconfig' || cmd === 'whoami') {
                    this.visualizer.executeAnimation({ type: 'ipconfig' });
                }
            } else if (!this.isAborted && hasError) {
                // 失敗時は失敗アニメーション
                this.visualizer.executeAnimation({ type: cmd, failed: true });
            }
        } catch (error) {
            console.error('コマンド実行中にエラーが発生しました:', error);
            this.printLine({ type: 'error', text: `予期せぬエラーが発生しました: ${error.message || error}` });
        } finally {
            this.isExecuting = false;
            this.setControlsLocked(false);
            this.scrollToBottom();
            if (this.consoleInput) {
                this.consoleInput.focus();
            }
        }
    }

    printLine(result) {
        const line = document.createElement('div');
        line.className = `console-line ${result.type}`;
        line.textContent = result.text;

        // TTLなどの専門用語にツールチップを追加
        if (result.text && result.text.includes('ttl=')) {
            line.innerHTML = result.text.replace(
                /ttl=(\d+)/g,
                '<span class="tooltip" title="Time To Live: パケットが通過できるルーターの最大数">ttl=$1</span>'
            );
        }

        this.consoleOutput.appendChild(line);

        // コンソール出力行数の上限チェック（500行上限）
        while (this.consoleOutput.children.length > 500) {
            this.consoleOutput.removeChild(this.consoleOutput.firstChild);
        }
    }

    scrollToBottom() {
        this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;
    }

    clearConsole() {
        this.consoleOutput.textContent = '';
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
        if (this.isAborted) return Promise.resolve();
        return new Promise(resolve => {
            this.currentSleepResolver = resolve;
            this.currentSleepTimer = setTimeout(() => {
                this.currentSleepTimer = null;
                this.currentSleepResolver = null;
                resolve();
            }, ms);
        });
    }
}

// アプリケーション初期化
window.addEventListener('DOMContentLoaded', () => {
    window.app = new EasyPacketApp();
});
