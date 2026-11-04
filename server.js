const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

let gameRoom = {
    state: 'WAITING', // WAITING, SPINNING
    players: [],
    timer: 15,
    interval: null
};

const BOT_NAMES = ["CryptoKing", "LuckyJoe", "TonMaster", "GramWinner", "MoonHodler", "BitSniper"];

console.log(`WebSocket сервер запущен на порту ${PORT}`);

// Функция добавления бота в комнату
function ensureBotsInLobby() {
    // Если игра не в процессе вращения и игроков меньше 2 (например, 0 или 1)
    if (gameRoom.state === 'WAITING' && gameRoom.players.length < 2) {
        // Проверяем, есть ли уже боты в комнате
        let botCount = gameRoom.players.filter(p => p.id.startsWith('bot_')).length;
        
        // Если ботов нет вообще, подсаживаем одного или двух ботов для компании
        if (botCount === 0) {
            const randomBotName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            const randomBet = parseFloat((Math.random() * (0.5 - 0.25) + 0.25).toFixed(2));

            gameRoom.players.push({
                id: 'bot_' + Math.floor(Math.random() * 10000),
                name: randomBotName,
                bet: randomBet,
                color: '#ef4444' // Красный цвет для бота
            });

            console.log(`[Лобби] Автоматически добавлен бот ${randomBotName} со ставкой ${randomBet}`);
            broadcastRoomState();
        }
    }
}

// Запускаем проверку лобби каждые 3 секунды (если комната пустая или там только 1 бот/игрок, добавляем активность)
setInterval(() => {
    ensureBotsInLobby();
}, 3000);

wss.on('connection', (ws) => {
    console.log('>>> Игрок подключился!');
    
    // Сразу при подключении отправляем состояние (чтобы игрок сразу видел ботов в лобби)
    ws.send(JSON.stringify({ type: 'INIT', room: gameRoom }));

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'JOIN_ARENA') {
                if (gameRoom.state === 'SPINNING') return;

                // Добавляем или обновляем ставку реального игрока
                let existingPlayer = gameRoom.players.find(p => p.id === message.userId);
                if (existingPlayer) {
                    existingPlayer.bet += message.bet;
                } else {
                    gameRoom.players.push({
                        id: message.userId,
                        name: message.name,
                        bet: message.bet,
                        color: '#3b82f6' // Синий для реального игрока
                    });
                }

                console.log(`Реальный игрок ${message.name} сделал ставку ${message.bet}. Всего игроков: ${gameRoom.players.length}`);
                
                broadcastRoomState();

                // Как только в комнате стало 2 или более игроков (реальный игрок + бот или другой игрок)
                // И таймер еще не запущен — запускаем отсчет 15 секунд!
                if (gameRoom.state === 'WAITING' && !gameRoom.interval && gameRoom.players.length >= 2) {
                    startLobbyTimer();
                }
            }
        } catch (e) {
            console.error('Ошибка обработки сообщения:', e);
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
            gameRoom.interval = null;
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

    console.log(`Раунд завершен! Победитель: ${winningPlayer ? winningPlayer.name : 'Никто'}`);

    broadcast({
        type: 'SPIN_START',
        stopX: randomStopX,
        winnerId: winningPlayer ? winningPlayer.id : null,
        winnerName: winningPlayer ? winningPlayer.name : 'Нитропобедитель',
        netWin: netWin.toFixed(2)
    });

    // Через 7 секунд очищаем комнату, и фоновый setInterval автоматически подсадит нового бота для следующего раунда
    setTimeout(() => {
        gameRoom.players = [];
        gameRoom.state = 'WAITING';
        gameRoom.timer = 15;
        if (gameRoom.interval) {
            clearInterval(gameRoom.interval);
            gameRoom.interval = null;
        }
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