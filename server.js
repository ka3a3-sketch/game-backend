const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

let gameRoom = {
    state: 'WAITING', // WAITING, SPINNING
    players: [],
    timer: 15,
    interval: null,
    botTimeout: null
};

const BOT_NAMES = ["CryptoKing", "LuckyJoe", "TonMaster", "GramWinner", "MoonHodler", "BitSniper"];

console.log(`WebSocket сервер запущен на порту ${PORT}`);

wss.on('connection', (ws) => {
    console.log('Игрок подключился!');
    ws.send(JSON.stringify({ type: 'INIT', room: gameRoom }));

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            if (message.type === 'JOIN_ARENA') {
                // Проверяем, нет ли уже этого игрока в текущем раунде
                const existingPlayer = gameRoom.players.find(p => p.id === message.userId);
                if (existingPlayer) {
                    existingPlayer.bet += message.bet;
                } else {
                    gameRoom.players.push({
                        id: message.userId,
                        name: message.name,
                        bet: message.bet,
                        color: message.color || getRandomColor()
                    });
                }

                broadcastRoomState();

                // Если зашел первый игрок, запускаем таймер появления бота (через 5 секунд, если второй не пришел)
                if (gameRoom.state === 'WAITING' && gameRoom.players.length === 1) {
                    if (gameRoom.botTimeout) clearTimeout(gameRoom.botTimeout);
                    
                    gameRoom.botTimeout = setTimeout(() => {
                        if (gameRoom.state === 'WAITING' && gameRoom.players.length === 1) {
                            addBotToGame();
                        }
                    }, 5000);
                }

                // КАК ТОЛЬКО НАБРАЛОСЬ 2 ИГРОКА — ЗАПУСКАЕМ ТАЙМЕР 15 СЕКУНД
                if (gameRoom.state === 'WAITING' && gameRoom.players.length === 2) {
                    if (gameRoom.botTimeout) clearTimeout(gameRoom.botTimeout);
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

function addBotToGame() {
    if (gameRoom.state !== 'WAITING' || gameRoom.players.length !== 1) return;

    const randomBotName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const randomBet = parseFloat((Math.random() * (0.5 - 0.25) + 0.25).toFixed(2));

    gameRoom.players.push({
        id: 'bot_' + Math.floor(Math.random() * 1000),
        name: randomBotName,
        bet: randomBet,
        color: getRandomColor()
    });

    broadcastRoomState();
    startLobbyTimer();
}

function getRandomColor() {
    const colors = ['#ef4444', '#f97316', '#84cc16', '#06b6d4', '#8b5cf6', '#ec4899'];
    return colors[Math.floor(Math.random() * colors.length)];
}

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
    if (gameRoom.botTimeout) clearTimeout(gameRoom.botTimeout);

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
        winnerId: winningPlayer ? winningPlayer.id : null,
        winnerName: winningPlayer ? winningPlayer.name : 'Никто',
        netWin: netWin.toFixed(2)
    });

    setTimeout(() => {
        gameRoom.players = [];
        gameRoom.state = 'WAITING';
        broadcast({ type: 'RESET_ROOM' });
    }, 7000);
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