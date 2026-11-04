const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

let gameRoom = {
    state: 'WAITING',
    players: [],
    timer: 15,
    interval: null,
    botTimeout: null
};

const BOT_NAMES = ["CryptoKing", "LuckyJoe", "TonMaster", "GramWinner", "MoonHodler", "BitSniper"];

console.log(`WebSocket сервер запущен на порту ${PORT}`);

wss.on('connection', (ws) => {
    console.log('>>> Новый игрок успешно подключился по WebSocket!');
    ws.send(JSON.stringify({ type: 'INIT', room: gameRoom }));

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Получено сообщение от клиента:', message.type);

            if (message.type === 'JOIN_ARENA') {
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
                console.log(`Игрок ${message.name} вошел. Всего игроков в комнате: ${gameRoom.players.length}`);

                // Если вы зашли один, запускаем таймер бота на 5 секунд
                if (gameRoom.state === 'WAITING' && gameRoom.players.length === 1) {
                    if (gameRoom.botTimeout) clearTimeout(gameRoom.botTimeout);
                    
                    console.лох ? null : console.log('Таймер бота запущен (ждем 5 секунд)...');
                    gameRoom.botTimeout = setTimeout(() => {
                        if (gameRoom.state === 'WAITING' && gameRoom.players.length === 1) {
                            addBotToGame();
                        }
                    }, 5000);
                }

                // Если набралось 2 игрока (вы + бот или другой игрок) -> запуск 15 секунд
                if (gameRoom.state === 'WAITING' && gameRoom.players.length === 2) {
                    if (gameRoom.botTimeout) clearTimeout(gameRoom.botTimeout);
                    startLobbyTimer();
                }
            }
        } catch (e) {
            console.error('Ошибка парсинга сообщения:', e);
        }
    });

    ws.on('close', () => {
        console.log('Игрок отключился от сервера');
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

    console.log(`Бот ${randomBotName} автоматически добавлен в игру со ставкой ${randomBet}`);
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
    console.log('Начался обратный отсчет 15 секунд до старта!');

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

    console.log(`Раунд завершен! Победитель: ${winningPlayer ? winningPlayer.name : 'Никто'}`);

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