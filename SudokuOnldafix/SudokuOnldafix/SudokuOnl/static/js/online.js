const socket = io.connect('http://' + document.domain + ':' + location.port);
let room_id;
let board;
let solution;
let timerInterval;
let startTime;
let incorrectAttempts = 0;
const MAX_INCORRECT_ATTEMPTS = 3;
let currentGameLevel = 'easy';
// Mức độ hiện tại của ván chơi
socket.on('connect', function() {
    console.log('Connected to server');
    socket.emit('join_game'); // Gửi yêu cầu tham gia mặc định
    document.getElementById('waiting').style.display = 'block';
    document.getElementById('difficulty-menu').style.display = 'block'; // Hiển thị menu độ khó
});
socket.on('waiting', function(data) {
    document.getElementById('waiting').innerText = data.message;
    document.getElementById('game-area').style.display = 'none'; // Ẩn bảng khi chờ
});
socket.on('match_found', function(data) {
    console.log('Match found!', data);
    room_id = data.room_id;
    board = data.board;
    solution = data.solution;
    document.getElementById('waiting').style.display = 'none';
    document.getElementById('game-area').style.display = 'block';
    document.getElementById('difficulty-menu').style.display = 'none'; // Ẩn menu độ khó
    initializeBoard();
    startTimer();
});
socket.on('board_updated', function(data) {
    console.log('Board updated:', data);
    board = data.board;
    updateBoardDisplay(data);
});
socket.on('game_over', function(data) {
    console.log('Game Over:', data);
    stopTimer();
    showModal(data.winner ? `Người thắng là: ${data.winner.name} (Score: ${data.winner.score})` : "Game Over", data.reason);
});
socket.on('opponent_disconnected', function(data) {
    console.log('Opponent Disconnected:', data);
    stopTimer();
    showModal("Đối thủ đã ngắt kết nối", "Bạn thắng!");
});
function initializeBoard() {
    const gameBoard = document.getElementById('game-board');
    gameBoard.innerHTML = '';
    const table = document.createElement('table');
    for (let i = 0; i < 9; i++) {
        const row = document.createElement('tr');
        for (let j = 0; j < 9; j++) {
            const cell = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.classList.add('cell');
            input.maxLength = 1;
            input.dataset.row = i;
            input.dataset.col = j;
            if (board[i][j] !== 0) {
                input.value = board[i][j];
                input.disabled = true;
            } else {
                input.addEventListener('input', handleInput);
                input.addEventListener('focus', () => highlightRelated(i, j));
                input.addEventListener('blur', clearHighlight);
            }
            cell.appendChild(input);
            row.appendChild(cell);
        }
        table.appendChild(row);
    }
    gameBoard.appendChild(table);
    displayLevelInfo(currentGameLevel);
    // Hiển thị độ khó khi khởi tạo bảng
}
function handleInput(event) {
    const input = event.target;
    const row = parseInt(input.dataset.row);
    const col = parseInt(input.dataset.col);
    let value = input.value ? parseInt(input.value) : 0;
    if (isNaN(value) || value < 0 || value > 9) {
        input.value = '';
        return;
    }
    socket.emit('update_board', {
        room_id: room_id,
        row: row,
        col: col,
        value: value
    });
}
function updateBoardDisplay(data) {
    const input = document.querySelector(`input[data-row="${data.row}"][data-col="${data.col}"]`);
    if (!input) return;
    input.value = data.value !== 0 ? data.value : '';
    if (data.correct) {
        input.classList.remove('error'); // Loại bỏ class 'error' nếu có
    } else {
        input.classList.add('error');
        incorrectAttempts++;
        if (incorrectAttempts >= MAX_INCORRECT_ATTEMPTS) {
            showModal("Game Over", "Too many incorrect attempts");
            stopTimer();
        }
    }
}
function clearError(row, col) {
    const input = document.querySelector(`input[data-row="${row}"][data-col="${col}"]`);
    if (input) {
        input.classList.remove('error');
    }
}
function startTimer() {
    startTime = new Date();
    const timerElement = document.querySelector('.timer');
    timerInterval = setInterval(() => {
        const elapsedTime = Math.floor((new Date() - startTime) / 1000);
        timerElement.textContent = formatTime(elapsedTime);
    }, 1000);
}
function stopTimer() {
    clearInterval(timerInterval);
}
function formatTime(time) {
    const minutes = Math.floor(time / 60).toString().padStart(2, '0');
    const seconds = (time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}
function showModal(title, message) {
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-message').textContent = message;
    document.getElementById('result-modal').style.display = 'block';
}
function closeModal() {
    document.getElementById('result-modal').style.display = 'none';
}
function eraseCell() {
    const focusedElement = document.activeElement;
    if (focusedElement.tagName === 'INPUT' && !focusedElement.disabled) {
        const row = parseInt(focusedElement.dataset.row);
        const col = parseInt(focusedElement.dataset.col);
        focusedElement.value = '';
        socket.emit('update_board', {
            room_id: room_id,
            row: row,
            col: col,
            value: 0
        });
        clearError(row, col); // Đảm bảo xóa class 'error'
    }
}
function undo() {
    // Implement undo functionality (if needed)
    alert("Undo is not implemented yet.");
}
function highlightRelated(row, col) {
    clearHighlight(); // Clear previous highlights
    const table = document.querySelector('table');
    const cells = table.querySelectorAll('input.cell');
    const selectedValue = parseInt(cells[row * 9 + col].value) || 0;
    // Highlight the selected cell
    cells[row * 9 + col].style.border = '2px solid #007bff';
    cells.forEach((cell, index) => {
        const cellRow = Math.floor(index / 9);
        const cellCol = index % 9;
        const cellValue = parseInt(cell.value) || 0;
        if (cellValue === selectedValue && selectedValue !== 0) {
            cell.classList.add('highlighted');
        }
        if (cellRow === row || cellCol === col) {
            cell.classList.add('highlighted-row-col');
        }
    });
}
function clearHighlight() {
    const cells = document.querySelectorAll('input.cell');
    cells.forEach(cell => {
        cell.classList.remove('highlighted');
        cell.classList.remove('highlighted-row-col');
        cell.style.border = ''; // Reset border
    });
}
function requestNewGame(level) {
    currentGameLevel = level;
    socket.emit('request_new_game', {
        level: level
    });
    // Gửi yêu cầu độ khó
    document.getElementById('waiting').style.display = 'block'; // Hiển thị thông báo chờ
    document.getElementById('game-area').style.display = 'none';
    // Ẩn bảng
    document.getElementById('difficulty-menu').style.display = 'none'; // Ẩn menu độ khó
    displayLevelInfo(level);
    // Hiển thị độ khó đã chọn
}
function displayLevelInfo(level) {
    const difficultyElement = document.querySelector('.level');
    const starsElement = document.querySelector('.share');
    // Tạm dùng .share để hiển thị sao
    if (difficultyElement && starsElement) {
        difficultyElement.textContent = level.charAt(0).toUpperCase() + level.slice(1);
        // Viết hoa chữ cái đầu
        let stars = '';
        for (let i = 0; i < (level === 'easy' ? 1 : level === 'medium' ? 2 : 3); i++) {
            stars += ' ★ ';
        }
        starsElement.textContent = stars;
    }
}