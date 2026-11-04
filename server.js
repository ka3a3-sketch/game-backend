const { WebSocketServer } = require('ws');

// Render сам назначает порт через переменные окружения, либо используем 8080
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

let gameRoom = {
    state: 'WAITING',
    players: [],
    timer: 15,
    interval: null
};

console.log(`WebSocket сервер запущен на порту ${PORT}`);

wss.on('connection', (ws) => {
    console.log('Игрок подключился!');
    ws.send(JSON.stringify({ type: 'INIT', room: gameRoom }));

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            if (message.type === 'JOIN_ARENA') {
                const newPlayer = {
                    id: message.userId,
                    name: message.name,
                    bet: message.bet,
                    color: message.color || '#3b82f6'
                };

                gameRoom.players.push(newPlayer);
                broadcastRoomState();

                if (gameRoom.state === 'WAITING' && gameRoom.players.length === 1) {
                    startLobbyTimer();
                }
            }
        } catch (e) {
            console.error('Ошибка:', e);
        }
    });

    ws.on('close', () => {
        console.log('Игрок отключился');
    });
});

function startLobbyTimer() {
    gameRoom.timer = 15;
    gameRoom.state = 'WAITING';

    if (gameRoom.interval) clearInterval(gameRoom.interval);

    gameRoom.interval = setInterval(() => {
        gameRoom.timer--;
        broadcast({ type: 'TIMER_UPDATE', timer: gameRoom.timer });

        if (gameRoom.timer <= 0) {
            clearInterval(gameRoom.interval);
            triggerGameSpin();
        }
    }, 1000);
}

function triggerGameSpin() {
    gameRoom.state = 'SPINNING';
    let totalBank = gameRoom.players.reduce((sum, p) => sum + p.bet, 0);
    let randomStopX = Math.random() * 340;

    let currentX = 0;
    let winningPlayer = gameRoom.players[0];

    gameRoom.players.forEach(p => {
        let sliceWidth = totalBank > 0 ? (p.bet / totalBank) * 340 : 0;
        p.xStart = currentX;
        p.xEnd = currentX + sliceWidth;
        currentX += sliceWidth;

        if (randomStopX >= p.xStart && randomStopX <= p.xEnd) {
            winningPlayer = p;
        }
    });

    let commission = totalBank * 0.05;
    let netWin = totalBank - commission;

    broadcast({
        type: 'SPIN_START',
        stopX: randomStopX,
        winner: winningPlayer ? winningPlayer.name : 'Никто',
        netWin: netWin.toFixed(2)
    });

    setTimeout(() => {
        gameRoom.players = [];
        gameRoom.state = 'WAITING';
        broadcast({ type: 'RESET_ROOM' });
    }, 6000);
}

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify(data));
        }
    });
}

function broadcastRoomState() {
    broadcast({
        type: 'ROOM_UPDATE',
        players: gameRoom.players,
        totalBank: gameRoom.players.reduce((sum, p) => sum + p.bet, 0)
    });
}