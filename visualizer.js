// ネットワーク可視化
class NetworkVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.packets = [];
        this.currentRoute = null; // 現在表示中の経路
        this.lastCommand = null; // 最後に実行したコマンド
        this.setupCanvas();
        this.drawStaticNetwork();
        this.animate();
        this.setupReplayButton();
    }

    setupCanvas() {
        // Retinaディスプレイ対応
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
    }

    setupReplayButton() {
        const replayBtn = document.createElement('button');
        replayBtn.id = 'replay-animation';
        replayBtn.innerHTML = '🔄 アニメーション再生';
        replayBtn.className = 'replay-btn';
        replayBtn.style.display = 'none';
        replayBtn.onclick = () => this.replayLastAnimation();
        
        const diagramDiv = document.querySelector('.network-diagram');
        diagramDiv.appendChild(replayBtn);
    }

    replayLastAnimation() {
        if (this.lastCommand) {
            this.clearPackets();
            this.executeAnimation(this.lastCommand);
        }
    }

    executeAnimation(commandData) {
        this.lastCommand = commandData;
        const replayBtn = document.getElementById('replay-animation');
        if (replayBtn) replayBtn.style.display = 'block';

        switch (commandData.type) {
            case 'nslookup':
                this.animateNslookup();
                break;
            case 'ping':
                this.animatePing(commandData.route);
                break;
            case 'traceroute':
                this.animateTraceroute(commandData.route);
                break;
            case 'ipconfig':
                this.animateIpconfig();
                break;
        }
    }

    // 動的にノードを生成（tracerouteの経路に基づく）
    generateNodes(routeData) {
        const nodes = [];
        const startY = this.height / 2;
        const spacing = Math.min(150, (this.width - 100) / (routeData.length + 1));

        nodes.push({
            x: 50,
            y: startY,
            label: '🖥️ あなたのPC',
            color: '#667eea',
            name: 'pc'
        });

        routeData.forEach((hop, index) => {
            nodes.push({
                x: 50 + spacing * (index + 1),
                y: startY,
                label: hop.name.length > 20 ? hop.name.substring(0, 17) + '...' : hop.name,
                color: '#48bb78',
                name: hop.name,
                ip: hop.ip
            });
        });

        return nodes;
    }

    // 静的なネットワーク図を描画
    drawStaticNetwork() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        if (this.currentRoute && this.currentRoute.length > 0) {
            // tracerouteの経路を表示
            const nodes = this.generateNodes(this.currentRoute);
            
            // 接続線を描画
            for (let i = 0; i < nodes.length - 1; i++) {
                this.drawConnection(nodes[i], nodes[i + 1]);
            }

            // ノードを描画
            nodes.forEach(node => this.drawNode(node));
            
            this.dynamicNodes = nodes;
        } else {
            // デフォルトの構成図
            this.nodes = {
                pc: { x: 50, y: this.height / 2, label: '🖥️ あなたのPC', color: '#667eea' },
                router1: { x: 200, y: this.height / 2, label: '🔀 ルーター1', color: '#48bb78' },
                isp: { x: 350, y: this.height / 2, label: '☁️ ISP', color: '#ed8936' },
                router2: { x: 500, y: this.height / 2 - 60, label: '🔀 ルーター2', color: '#48bb78' },
                dns: { x: 500, y: this.height / 2 + 60, label: '🌐 DNS', color: '#9f7aea' },
                server: { x: 650, y: this.height / 2, label: '🖥️ サーバー', color: '#38b2ac' }
            };

            // 接続線を描画
            this.drawConnection(this.nodes.pc, this.nodes.router1);
            this.drawConnection(this.nodes.router1, this.nodes.isp);
            this.drawConnection(this.nodes.isp, this.nodes.router2);
            this.drawConnection(this.nodes.isp, this.nodes.dns);
            this.drawConnection(this.nodes.router2, this.nodes.server);

            // ノードを描画
            for (const key in this.nodes) {
                this.drawNode(this.nodes[key]);
            }
        }
    }

    drawConnection(node1, node2) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#cbd5e0';
        this.ctx.lineWidth = 2;
        this.ctx.moveTo(node1.x, node1.y);
        this.ctx.lineTo(node2.x, node2.y);
        this.ctx.stroke();
    }

    drawNode(node) {
        // ノードの円
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
        this.ctx.fillStyle = node.color;
        this.ctx.fill();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // ラベル
        this.ctx.fillStyle = '#2d3748';
        this.ctx.font = '11px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(node.label, node.x, node.y + 35);
        
        // IPアドレス表示（ある場合）
        if (node.ip) {
            this.ctx.font = '9px monospace';
            this.ctx.fillStyle = '#718096';
            this.ctx.fillText(node.ip, node.x, node.y + 48);
        }
    }

    // パケットを追加
    addPacket(route, color = '#ff6b6b', speed = 2) {
        this.packets.push({
            route: route,
            currentIndex: 0,
            progress: 0,
            color: color,
            speed: speed,
            active: true
        });
    }

    // アニメーションループ
    animate() {
        this.drawStaticNetwork();

        // すべてのパケットを描画
        this.packets = this.packets.filter(packet => {
            if (!packet.active) return false;

            const currentNode = packet.route[packet.currentIndex];
            const nextNode = packet.route[packet.currentIndex + 1];

            if (!nextNode) {
                packet.active = false;
                return false;
            }

            // 現在の位置を計算
            const x = currentNode.x + (nextNode.x - currentNode.x) * packet.progress;
            const y = currentNode.y + (nextNode.y - currentNode.y) * packet.progress;

            // パケットを描画
            this.drawPacket(x, y, packet.color);

            // 進行度を更新
            packet.progress += 0.01 * packet.speed;

            if (packet.progress >= 1) {
                packet.progress = 0;
                packet.currentIndex++;
            }

            return true;
        });

        requestAnimationFrame(() => this.animate());
    }

    drawPacket(x, y, color) {
        // パケットの描画
        this.ctx.beginPath();
        this.ctx.arc(x, y, 8, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // パケットの光る効果
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 15);
        gradient.addColorStop(0, color + 'aa');
        gradient.addColorStop(1, color + '00');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 15, 0, Math.PI * 2);
        this.ctx.fill();
    }

    // nslookupのアニメーション
    animateNslookup() {
        this.currentRoute = null;
        const route = [this.nodes.pc, this.nodes.router1, this.nodes.isp, this.nodes.dns];
        this.addPacket(route, '#9f7aea', 3);

        // 応答パケット
        setTimeout(() => {
            const returnRoute = [this.nodes.dns, this.nodes.isp, this.nodes.router1, this.nodes.pc];
            this.addPacket(returnRoute, '#68d391', 3);
        }, 1000);
    }

    // pingのアニメーション（実際の経路データを使用）
    animatePing(routeData) {
        if (routeData && routeData.length > 0) {
            this.currentRoute = routeData;
            this.drawStaticNetwork();
            
            setTimeout(() => {
                const nodes = this.dynamicNodes;
                this.addPacket(nodes, '#ff6b6b', 2.5);

                // 応答パケット
                setTimeout(() => {
                    const returnRoute = [...nodes].reverse();
                    this.addPacket(returnRoute, '#68d391', 2.5);
                }, nodes.length * 400);
            }, 100);
        } else {
            // デフォルトの経路
            this.currentRoute = null;
            const route = [this.nodes.pc, this.nodes.router1, this.nodes.isp, this.nodes.router2, this.nodes.server];
            this.addPacket(route, '#ff6b6b', 2.5);

            setTimeout(() => {
                const returnRoute = [this.nodes.server, this.nodes.router2, this.nodes.isp, this.nodes.router1, this.nodes.pc];
                this.addPacket(returnRoute, '#68d391', 2.5);
            }, 1500);
        }
    }

    // tracerouteのアニメーション（実際の経路を段階的に表示）
    animateTraceroute(routeData) {
        if (!routeData || routeData.length === 0) {
            this.currentRoute = null;
            return;
        }

        this.currentRoute = routeData;
        this.drawStaticNetwork();

        const nodes = this.dynamicNodes;

        // ホップごとにアニメーション
        for (let i = 0; i < nodes.length - 1; i++) {
            setTimeout(() => {
                const route = nodes.slice(0, i + 2);
                this.addPacket(route, '#ffd666', 2);

                // 応答パケット
                setTimeout(() => {
                    const returnRoute = [...route].reverse();
                    this.addPacket(returnRoute, '#68d391', 2);
                }, 300);
            }, i * 1000);
        }
    }

    // ipconfigのアニメーション
    animateIpconfig() {
        this.currentRoute = null;
        // PCからルーターへの情報取得
        const route = [this.nodes.pc, this.nodes.router1];
        this.addPacket(route, '#667eea', 4);

        setTimeout(() => {
            const returnRoute = [this.nodes.router1, this.nodes.pc];
            this.addPacket(returnRoute, '#68d391', 4);
        }, 500);
    }

    // すべてのパケットをクリア
    clearPackets() {
        this.packets = [];
    }
}
