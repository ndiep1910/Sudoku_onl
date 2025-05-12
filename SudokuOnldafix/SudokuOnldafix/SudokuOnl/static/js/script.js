let board = [];
let solution = [];
let timerInterval;
let startTime;
let incorrectAttempts = 0;
const MAX_INCORRECT_ATTEMPTS = 3;
let currentLevel = 'easy'; // Mức độ mặc định
let history = []; // Mảng lưu trữ các bước đi để hoàn tác

// document.addEventListener('DOMContentLoaded', () => {  // Comment hoặc xóa dòng này
//     startGame('easy'); // Bắt đầu với mức độ dễ khi trang tải xong
// });

function startGame(level) {
    currentLevel = level;
    incorrectAttempts = 0;
    history = []; // Reset lịch sử khi bắt đầu game mới
    document.getElementById('difficulty-menu').style.display = 'none'; // Ẩn menu độ khó
    document.getElementById('game-board').innerHTML = ''; // Xóa bảng cũ
    fetch('/generate_sudoku?level=' + level) // Gọi API để tạo bảng
        .then(response => response.json())
        .then(data => {
            board = data.board;
            solution = data.solution;
            initializeBoard(); // Khởi tạo bảng trên trang
            startTimer(); // Bắt đầu đếm giờ
            displayLevelInfo(level); // Hiển thị thông tin độ khó
        });
}

function startGame(level) {
    currentLevel = level;
    incorrectAttempts = 0;
    history = []; // Reset lịch sử khi bắt đầu game mới
    document.getElementById('difficulty-menu').style.display = 'none'; // Ẩn menu độ khó
    document.getElementById('game-board').innerHTML = ''; // Xóa bảng cũ
    fetch('/generate_sudoku?level=' + level) // Gọi API để tạo bảng
        .then(response => response.json())
        .then(data => {
            board = data.board;
            solution = data.solution;
            initializeBoard(); // Khởi tạo bảng trên trang
            startTimer(); // Bắt đầu đếm giờ
            displayLevelInfo(level); // Hiển thị thông tin độ khó
        });
}

function initializeBoard() {
    const gameBoard = document.getElementById('game-board');
    const table = document.createElement('table');
    for (let i = 0; i < 9; i++) {
        const row = document.createElement('tr');
        for (let j = 0; j < 9; j++) {
            const cell = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.classList.add('cell');
            input.maxLength = 1; // Chỉ cho phép nhập 1 ký tự
            input.dataset.row = i; // Lưu chỉ số hàng
            input.dataset.col = j; // Lưu chỉ số cột
            if (board[i][j] !== 0) {
                input.value = board[i][j];
                input.disabled = true; // Ô số ban đầu không cho sửa
            } else {
                input.addEventListener('input', handleInput); // Xử lý khi nhập
                input.addEventListener('focus', () => highlightRelated(i, j)); // Highlight khi chọn ô
                input.addEventListener('blur', clearHighlight); // Xóa highlight khi bỏ chọn ô
            }
            cell.appendChild(input);
            row.appendChild(cell);
        }
        table.appendChild(row);
    }
    gameBoard.appendChild(table);
}

function handleInput(event) {
    const input = event.target;
    const row = parseInt(input.dataset.row);
    const col = parseInt(input.dataset.col);
    let value = input.value ? parseInt(input.value) : 0; // Chuyển đổi sang số
    // Kiểm tra đầu vào
    if (isNaN(value) || value < 0 || value > 9) {
        input.value = ''; // Xóa giá trị không hợp lệ
        return;
    }
    // Lưu bước đi vào lịch sử
    history.push({ row, col, prevValue: board[row][col], newValue: value });
    board[row][col] = value; // Cập nhật bảng
    if (solution[row][col] === value) {
        input.classList.remove('error'); // Xóa hiệu ứng lỗi
        if (checkWinCondition()) {
            stopTimer();
            showModal('Chúc mừng!', `Bạn đã hoàn thành trong ${document.querySelector('.timer').textContent}`);
        }
    } else {
        input.classList.add('error'); // Thêm hiệu ứng lỗi
        incorrectAttempts++;
        if (incorrectAttempts >= MAX_INCORRECT_ATTEMPTS) {
            stopTimer();
            showModal('Game Over', 'Bạn đã nhập sai quá 3 lần.');
        }
    }
}

function checkWinCondition() {
    for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
            if (board[i][j] !== solution[i][j]) {
                return false; // Chưa hoàn thành
            }
        }
    }
    return true; // Đã hoàn thành
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
        const prevValue = board[row][col]; // Lưu giá trị trước khi xóa
        focusedElement.value = '';
        board[row][col] = 0;
        history.push({ row, col, prevValue: prevValue, newValue: 0 }); // Lưu vào lịch sử
        focusedElement.classList.remove('error'); // Xóa hiệu ứng lỗi
    }
}

function undo() {
    if (history.length > 0) {
        const lastMove = history.pop();
        const input = document.querySelector(`input[data-row="${lastMove.row}"][data-col="${lastMove.col}"]`);
        if (input) {
            input.value = lastMove.prevValue !== 0 ? lastMove.prevValue : '';
            board[lastMove.row][lastMove.col] = lastMove.prevValue;
            input.classList.remove('error'); // Xóa hiệu ứng lỗi
        }
    } else {
        alert('Không còn bước nào để hoàn tác.');
    }
}

function highlightRelated(row, col) {
    clearHighlight(); // Xóa highlight cũ

    const table = document.querySelector('table');
    const cells = table.querySelectorAll('input.cell');
    const selectedValue = parseInt(cells[row * 9 + col].value) || 0;

    // Highlight ô được chọn
    cells[row * 9 + col].style.border = '2px solid #007bff';

    cells.forEach((cell, index) => {
        const cellRow = Math.floor(index / 9);
        const cellCol = index % 9;
        const cellValue = parseInt(cell.value) || 0;

        if (cellValue === selectedValue && selectedValue !== 0) {
            cell.classList.add('highlighted'); // Highlight ô cùng số
        }

        if (cellRow === row || cellCol === col) {
            cell.classList.add('highlighted-row-col'); // Highlight hàng và cột
        }
    });
}

function clearHighlight() {
    const cells = document.querySelectorAll('input.cell');
    cells.forEach(cell => {
        cell.classList.remove('highlighted');
        cell.classList.remove('highlighted-row-col');
        cell.style.border = ''; // Reset viền
    });
}

function displayLevelInfo(level) {
    const difficultyElement = document.getElementById('difficulty');
    const starsElement = document.getElementById('stars');
    difficultyElement.textContent = level.charAt(0).toUpperCase() + level.slice(1); // Viết hoa chữ cái đầu

    let stars = '';
    for (let i = 0; i < (level === 'easy' ? 1 : level === 'medium' ? 2 : 3); i++) {
        stars += '★';
    }
    starsElement.textContent = stars;
}