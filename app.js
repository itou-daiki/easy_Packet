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
        if (this.simulator && typeof this.simulator.abort === 'function') {
            this.simulator.abort();
        }
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
        if (this.simulator && typeof this.simulator.resetAbort === 'function') {
            this.simulator.resetAbort();
        }
        this.setControlsLocked(true);

        this.consoleInput.value = '';
        this.commandHistory.push(commandLine);
        this.historyIndex = this.commandHistory.length;

        // コマンドの種類とドメインを取得
        const parts = commandLine.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const domain = parts[1] || '';

        let hasError = false;
        let routeData = null;
        let hopDataList = [];

        try {
            // traceroute や ping の場合、既定経路データがあれば取得
            if (this.simulator.routesData && this.simulator.routesData[domain]) {
                routeData = this.simulator.routesData[domain];
            }

            // ストリーミング実行: 1行受け取るたびに即時描画・アニメーション同期
            for await (const result of this.simulator.execute(commandLine)) {
                if (this.isAborted) break;

                if (result.type === 'clear') {
                    this.clearConsole();
                    continue;
                }

                if (result.type === 'error' || result.failed) {
                    hasError = true;
                }

                // 1. traceroute のヘッダーを受け取った時点でルート表示を更新
                if (result.tracerouteHeader) {
                    if (result.tracerouteHeader.routes) {
                        routeData = result.tracerouteHeader.routes;
                    }
                    if (this.visualizer && typeof this.visualizer.setupRoute === 'function') {
                        this.visualizer.setupRoute(routeData);
                    }
                }

                // 2. traceroute のホップ行 (hopData) のアニメーション同期
                if (result.hopData) {
                    hopDataList.push(result.hopData);
                    if (!this.isAborted && !hasError && this.visualizer && typeof this.visualizer.animateTracerouteHop === 'function') {
                        // パケットが hop N に到達するアニメーション (所要時間 350ms)
                        // 到達直後にホップ行をコンソールに出力することで、パケット到達と行出力の時刻差を実質 0ms に同期
                        await this.visualizer.animateTracerouteHop(result.hopIndex, routeData || hopDataList, 350);
                    }
                }

                // 3. ping のステップ行 (pingStep) のアニメーション同期
                if (result.pingStep) {
                    if (!this.isAborted && !hasError && this.visualizer && typeof this.visualizer.animatePingStep === 'function') {
                        await this.visualizer.animatePingStep(routeData, 350);
                    }
                }

                // 4. nslookup / ipconfig の開始時アニメーション
                if (result.type === 'command') {
                    if (cmd === 'nslookup' && !hasError) {
                        this.visualizer.animateNslookup();
                    } else if ((cmd === 'ipconfig' || cmd === 'ifconfig' || cmd === 'whoami') && !hasError) {
                        this.visualizer.animateIpconfig();
                    }
                }

                // コンソールに行を出力（即座に描画）
                this.printLine(result);
                this.scrollToBottom();

                // コマンド行以外は、スムーズな描画と中断検知のために極短い遅延を挟む
                if (result.type !== 'command') {
                    await this.sleep(20);
                }
            }

            // 終了後のアニメーション処理 (失敗時は失敗アニメーション)
            if (!this.isAborted && hasError) {
                // 失敗時は失敗アニメーション (PC -> ルータで赤色パケット消滅)
                this.visualizer.executeAnimation({ type: cmd, failed: true });
            } else if (!this.isAborted && !hasError) {
                // 成功時の最終記録 (「🔄 アニメーション再生」ボタン用)
                if (cmd === 'traceroute' || cmd === 'tracert') {
                    this.visualizer.lastCommand = { type: 'traceroute', route: routeData || hopDataList };
                } else if (cmd === 'ping') {
                    this.visualizer.lastCommand = { type: 'ping', route: routeData };
                } else {
                    this.visualizer.lastCommand = { type: cmd };
                }
                const replayBtn = document.getElementById('replay-animation');
                if (replayBtn) replayBtn.style.display = 'block';
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
