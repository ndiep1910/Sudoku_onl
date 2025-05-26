let myBoard; // Bảng của người chơi
let solution;
let timerInterval;
let startTime;
let incorrectAttempts = 0;
const MAX_INCORRECT_ATTEMPTS = 3;
let currentGameLevel = "easy";
let score = 0;
let gameCompleted = false;
let isGameStarted = false;
let timeLimit;
let countdownInterval;
let moveHistory = [];

// Khởi tạo game khi trang được tải
document.addEventListener("DOMContentLoaded", () => {
  // Hiển thị menu độ khó và ẩn game area
  document.getElementById("difficulty-menu").style.display = "block";
  document.getElementById("game-area").style.display = "none";
});

function getTimeLimit(level) {
  switch (level) {
    case "easy":
      return 5 * 60; // 5 phút
    case "medium":
      return 8 * 60; // 8 phút
    case "hard":
      return 10 * 60; // 10 phút
    default:
      return 5 * 60;
  }
}

// Hàm tạo bảng Sudoku mới
function generateSudokuBoard(level) {
  // Tạo bảng giải pháp hoàn chỉnh
  solution = Array(9)
    .fill()
    .map(() => Array(9).fill(0));
  fillDiagonal();
  solveSudoku(solution);

  // Tạo bảng chơi bằng cách xóa một số ô dựa trên độ khó
  myBoard = JSON.parse(JSON.stringify(solution));
  const cellsToRemove = level === "easy" ? 40 : level === "medium" ? 50 : 60;
  removeCells(cellsToRemove);

  return { board: myBoard, solution: solution };
}

// Điền các ô chéo (3x3) đầu tiên
function fillDiagonal() {
  for (let i = 0; i < 9; i += 3) {
    fillBox(i, i);
  }
}

// Điền một ô 3x3
function fillBox(row, col) {
  let num;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      do {
        num = Math.floor(Math.random() * 9) + 1;
      } while (!isValid(solution, row + i, col + j, num));
      solution[row + i][col + j] = num;
    }
  }
}

// Kiểm tra xem số có hợp lệ ở vị trí đó không
function isValid(board, row, col, num) {
  // Kiểm tra hàng
  for (let x = 0; x < 9; x++) {
    if (board[row][x] === num) return false;
  }

  // Kiểm tra cột
  for (let x = 0; x < 9; x++) {
    if (board[x][col] === num) return false;
  }

  // Kiểm tra ô 3x3
  let startRow = row - (row % 3);
  let startCol = col - (col % 3);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[i + startRow][j + startCol] === num) return false;
    }
  }

  return true;
}

// Giải Sudoku bằng backtracking
function solveSudoku(board) {
  let row = -1;
  let col = -1;
  let isEmpty = true;

  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if (board[i][j] === 0) {
        row = i;
        col = j;
        isEmpty = false;
        break;
      }
    }
    if (!isEmpty) break;
  }

  if (isEmpty) return true;

  for (let num = 1; num <= 9; num++) {
    if (isValid(board, row, col, num)) {
      board[row][col] = num;
      if (solveSudoku(board)) return true;
      board[row][col] = 0;
    }
  }
  return false;
}

// Xóa một số ô để tạo bảng chơi
function removeCells(count) {
  let removed = 0;
  while (removed < count) {
    let row = Math.floor(Math.random() * 9);
    let col = Math.floor(Math.random() * 9);
    if (myBoard[row][col] !== 0) {
      myBoard[row][col] = 0;
      removed++;
    }
  }
}

function initializeBoard() {
  const gameBoard = document.getElementById("game-board");
  gameBoard.innerHTML = "";

  const table = document.createElement("table");

  // Khởi tạo phần hiển thị lịch sử nước đi
  const historyElement = document.querySelector(".move-history");
  if (historyElement) {
    historyElement.innerHTML = `
      <h3 style="color: #343a40; margin-bottom: 10px;">Lịch sử nước đi:</h3>
      <div class="history-container" style="max-height: 200px; overflow-y: auto; padding: 10px; background-color: #f8f9fa; border-radius: 5px;"></div>
    `;
  }

  for (let i = 0; i < 9; i++) {
    const row = document.createElement("tr");
    for (let j = 0; j < 9; j++) {
      const cell = document.createElement("td");
      const input = document.createElement("input");

      input.type = "text";
      input.classList.add("cell");
      input.maxLength = 1;
      input.dataset.row = i;
      input.dataset.col = j;

      if (myBoard[i][j] !== 0) {
        input.value = myBoard[i][j];
        input.disabled = true;
      } else {
        input.addEventListener("input", handleInput);
        input.addEventListener("focus", () => highlightRelated(i, j));
        input.addEventListener("blur", clearHighlight);
      }

      cell.appendChild(input);
      row.appendChild(cell);
    }
    table.appendChild(row);
  }

  gameBoard.appendChild(table);
  displayLevelInfo(currentGameLevel);
  updateScoreDisplay();
}

function handleInput(event) {
  if (!isGameStarted || gameCompleted) {
    return;
  }

  const input = event.target;
  const row = parseInt(input.dataset.row);
  const col = parseInt(input.dataset.col);
  let value = input.value ? parseInt(input.value) : 0;

  if (isNaN(value) || value < 0 || value > 9) {
    input.value = "";
    return;
  }

  const isCorrect = value === 0 || value === solution[row][col];

  if (!isCorrect) {
    incorrectAttempts++;
    input.classList.add("error");

    if (incorrectAttempts >= MAX_INCORRECT_ATTEMPTS) {
      gameCompleted = true;
      showModal("Game Over", "Đã sai quá nhiều lần");
      stopTimer();
      return;
    }
  } else {
    input.classList.remove("error");
    myBoard[row][col] = value;

    if (value !== 0) {
      // Tăng điểm khi điền đúng
      score += 10;
      updateMoveHistory(row, col, value);
      updateScoreDisplay();
    }

    if (checkBoardCompletion()) {
      gameCompleted = true;
      showModal(
        "Chúc mừng!",
        `Bạn đã hoàn thành bảng Sudoku!\nĐiểm số: ${score}`
      );
      stopTimer();
    }
  }
}

function startTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  startTime = new Date();
  timeLimit = getTimeLimit(currentGameLevel);
  const timerElement = document.querySelector(".timer");

  if (timerElement) {
    timerElement.textContent = formatTime(timeLimit);
    countdownInterval = setInterval(() => {
      if (!gameCompleted) {
        const elapsedTime = Math.floor((new Date() - startTime) / 1000);
        const remainingTime = Math.max(0, timeLimit - elapsedTime);
        timerElement.textContent = formatTime(remainingTime);

        if (remainingTime <= 0) {
          gameCompleted = true;
          const endTime = new Date();
          const timeTaken = Math.floor((endTime - startTime) / 1000);
          const { filledCells, correctCells } = updateGameProgress();
          score = calculateScore(timeTaken, incorrectAttempts, correctCells);

          showModal("Hết thời gian!", "Game kết thúc!");
          stopTimer();
        }
      }
    }, 1000);
  }
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function formatTime(time) {
  const minutes = Math.floor(time / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (time % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function showModal(title, message) {
  const modal = document.getElementById("result-modal");
  const titleElement = document.getElementById("result-title");
  const messageElement = document.getElementById("result-message");

  if (modal && titleElement && messageElement) {
    titleElement.textContent = title;

    const endTime = new Date();
    const timeTaken = Math.floor((endTime - startTime) / 1000);
    const { filledCells, correctCells } = updateGameProgress();
    score = calculateScore(timeTaken, incorrectAttempts, correctCells);

    let scoreMessage = `\nThời gian: ${formatTime(timeTaken)}`;
    scoreMessage += `\nSố ô đúng: ${correctCells}/81`;
    scoreMessage += `\nSố lần sai: ${incorrectAttempts}`;
    scoreMessage += `\nĐiểm số: ${score}`;

    messageElement.textContent = message + scoreMessage;
    modal.style.display = "block";
  }
}

function closeModal() {
  document.getElementById("result-modal").style.display = "none";
  if (gameCompleted) {
    document.getElementById("difficulty-menu").style.display = "block";
    document.getElementById("game-area").style.display = "none";
  }
}

function updateScoreDisplay() {
  const scoreElement = document.querySelector(".score");
  if (scoreElement) {
    let scoreText = `Điểm của bạn: ${score}`;
    const { filledCells, correctCells } = updateGameProgress();
    scoreText += `\nSố ô đúng: ${correctCells}/81`;
    scoreText += `\nSố lần sai: ${incorrectAttempts}`;
    scoreElement.textContent = scoreText;
  }
}

function calculateScore(timeTaken, incorrectAttempts, correctCells) {
  const baseScore = 1000;
  const timeDeduction = Math.floor(timeTaken / 10);
  const incorrectDeduction = incorrectAttempts * 50;
  const correctCellsBonus = correctCells * 10;

  return Math.max(
    0,
    baseScore - timeDeduction - incorrectDeduction + correctCellsBonus
  );
}

function updateGameProgress() {
  if (!isGameStarted || gameCompleted) {
    return { filledCells: 0, correctCells: 0 };
  }

  let filledCells = 0;
  let correctCells = 0;

  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if (myBoard[i][j] !== 0) {
        filledCells++;
        if (myBoard[i][j] === solution[i][j]) {
          correctCells++;
        }
      }
    }
  }

  const progressElement = document.querySelector(".progress");
  if (progressElement) {
    const progress = Math.floor((correctCells / 81) * 100);
    progressElement.textContent = `Tiến độ: ${progress}%`;
  }

  return { filledCells, correctCells };
}

function checkBoardCompletion() {
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if (myBoard[i][j] !== solution[i][j]) {
        return false;
      }
    }
  }
  return true;
}

function highlightRelated(row, col) {
  clearHighlight();
  const table = document.querySelector("table");
  const cells = table.querySelectorAll("input.cell");
  const selectedValue = parseInt(cells[row * 9 + col].value) || 0;

  cells[row * 9 + col].style.border = "2px solid #007bff";
  cells.forEach((cell, index) => {
    const cellRow = Math.floor(index / 9);
    const cellCol = index % 9;
    const cellValue = parseInt(cell.value) || 0;
    if (cellValue === selectedValue && selectedValue !== 0) {
      cell.classList.add("highlighted");
    }
    if (cellRow === row || cellCol === col) {
      cell.classList.add("highlighted-row-col");
    }
  });
}

function clearHighlight() {
  const cells = document.querySelectorAll("input.cell");
  cells.forEach((cell) => {
    cell.classList.remove("highlighted");
    cell.classList.remove("highlighted-row-col");
    cell.style.border = "";
  });
}

function displayLevelInfo(level) {
  const difficultyElement = document.querySelector(".level");
  const starsElement = document.querySelector(".share");
  if (difficultyElement && starsElement) {
    difficultyElement.textContent =
      level.charAt(0).toUpperCase() + level.slice(1);
    let stars = "";
    for (
      let i = 0;
      i < (level === "easy" ? 1 : level === "medium" ? 2 : 3);
      i++
    ) {
      stars += " ★ ";
    }
    starsElement.textContent = stars;
  }
}

function requestNewGame(level) {
  currentGameLevel = level;
  const { board, solution: newSolution } = generateSudokuBoard(level);
  myBoard = board;
  solution = newSolution;
  isGameStarted = true;
  gameCompleted = false;
  incorrectAttempts = 0;
  score = 0;
  moveHistory = [];

  // Ẩn menu độ khó và hiển thị game area
  document.getElementById("difficulty-menu").style.display = "none";
  document.getElementById("game-area").style.display = "flex";

  initializeBoard();
  startTimer();
}

function eraseCell() {
  const focusedElement = document.activeElement;
  if (focusedElement.tagName === "INPUT" && !focusedElement.disabled) {
    const row = parseInt(focusedElement.dataset.row);
    const col = parseInt(focusedElement.dataset.col);
    focusedElement.value = "";
    myBoard[row][col] = 0;
    focusedElement.classList.remove("error");
    updateScoreDisplay();
  }
}

function undo() {
  // Implement undo functionality (if needed)
  alert("Undo is not implemented yet.");
}

function updateMoveHistory(row, col, value) {
  const historyContainer = document.querySelector(".history-container");
  if (historyContainer) {
    const move = document.createElement("div");
    move.style.padding = "5px";
    move.style.borderBottom = "1px solid #eee";
    move.style.fontSize = "0.9em";
    move.textContent = `Ô [${row + 1},${col + 1}]: ${value}`;
    historyContainer.appendChild(move);
    historyContainer.scrollTop = historyContainer.scrollHeight;
  }
}

function resetGameState() {
  myBoard = null;
  solution = null;
  incorrectAttempts = 0;
  score = 0;
  gameCompleted = false;
  isGameStarted = false;
  moveHistory = [];
  stopTimer();

  // Reset UI elements
  const timerElement = document.querySelector(".timer");
  if (timerElement) {
    timerElement.textContent = "00:00";
  }

  // Xóa các highlight và lỗi
  const cells = document.querySelectorAll("input.cell");
  cells.forEach((cell) => {
    cell.classList.remove("error", "highlighted", "highlighted-row-col");
    cell.style.border = "";
  });

  // Reset phần hiển thị lịch sử
  const historyElement = document.querySelector(".move-history");
  if (historyElement) {
    historyElement.innerHTML = `
      <h3 style="color: #343a40; margin-bottom: 10px;">Lịch sử nước đi:</h3>
      <div class="history-container" style="max-height: 200px; overflow-y: auto; padding: 10px; background-color: #f8f9fa; border-radius: 5px;"></div>
    `;
  }
}
