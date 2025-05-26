// Khai báo biến toàn cục
let myBoard = null;
let opponentBoard = null;
let solution = null;
let room_id = null;
let score = 0;
let opponentScore = 0;
let incorrectAttempts = 0;
let gameCompleted = false;
let isGameStarted = false;
let startTime = null;
let timerInterval = null;
let countdownInterval = null;
let timeLimit = 0;
let currentGameLevel = "medium";
let moveHistory = [];
let isOnlineMode = true;
const MAX_INCORRECT_ATTEMPTS = 3;

// Xử lý sự kiện kết nối
socket.on("connect", () => {
  console.log("Connected to server with ID:", socket.id);
  // Không reset game state khi kết nối lại để tránh mất trạng thái phòng
  if (!room_id) {
    resetGameState();
  }
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
  showModal(
    "Lỗi kết nối",
    "Không thể kết nối đến máy chủ. Vui lòng thử lại sau."
  );
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
  showModal(
    "Mất kết nối",
    "Kết nối đến máy chủ đã bị ngắt. Vui lòng tải lại trang."
  );
});

// Khởi tạo game khi trang được tải
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing game...");

  // Hiển thị menu độ khó và ẩn game area
  document.getElementById("difficulty-menu").style.display = "block";
  document.getElementById("game-area").style.display = "none";
  document.getElementById("waiting").style.display = "none";

  // Thêm event listeners cho các nút độ khó
  const easyButton = document.getElementById("easy-btn");
  const mediumButton = document.getElementById("medium-btn");
  const hardButton = document.getElementById("hard-btn");

  if (easyButton) {
    easyButton.addEventListener("click", () => {
      console.log("Easy button clicked");
      requestNewGame("easy");
    });
  }
  if (mediumButton) {
    mediumButton.addEventListener("click", () => {
      console.log("Medium button clicked");
      requestNewGame("medium");
    });
  }
  if (hardButton) {
    hardButton.addEventListener("click", () => {
      console.log("Hard button clicked");
      requestNewGame("hard");
    });
  }
});

// Định nghĩa hàm requestNewGame
function requestNewGame(level) {
  console.log("Requesting new game with level:", level);
  currentGameLevel = level;

  // Kiểm tra xem đã có room_id chưa
  if (room_id) {
    // Nếu đã có room_id, tham gia vào phòng đó
    socket.emit("join_game", {
      room_id: room_id,
      level: level,
    });
  } else {
    // Nếu chưa có room_id, tạo game mới
    resetGameState();
    // Hiển thị màn hình chờ
    document.getElementById("waiting").style.display = "block";
    document.getElementById("game-area").style.display = "none";
    document.getElementById("difficulty-menu").style.display = "none";
    document.getElementById("waiting").innerText =
      "Đang chờ người chơi thứ hai...";

    // Gửi yêu cầu tạo game mới
    socket.emit("request_new_game", {
      level: level,
      timestamp: new Date().getTime(),
    });
  }
}

// Xử lý sự kiện chờ đối thủ
socket.on("waiting", function (data) {
  console.log("Waiting for opponent:", data);
  if (data.room_id) {
    room_id = data.room_id; // Lưu room_id khi nhận được
  }
  document.getElementById("waiting").style.display = "block";
  document.getElementById("waiting").innerText = data.message;
  document.getElementById("game-area").style.display = "none";
  document.getElementById("difficulty-menu").style.display = "none";
});

// Xử lý sự kiện tìm thấy đối thủ
socket.on("match_found", function (data) {
  console.log("Match found!", data);
  if (!data || !data.board || !data.solution) {
    console.error("Invalid match data received:", data);
    showModal("Lỗi", "Dữ liệu game không hợp lệ. Vui lòng thử lại.");
    return;
  }

  // Chỉ reset game state nếu chưa có room_id
  if (!room_id) {
    resetGameState();
  }

  room_id = data.room_id;
  myBoard = JSON.parse(JSON.stringify(data.board));
  opponentBoard = JSON.parse(JSON.stringify(data.opponent_board || data.board));
  solution = data.solution;
  isGameStarted = true;

  // Hiển thị game area cho cả hai người chơi
  document.getElementById("waiting").style.display = "none";
  document.getElementById("game-area").style.display = "flex";
  document.getElementById("difficulty-menu").style.display = "none";

  initializeBoard();
  displayLevelInfo(data.level || currentGameLevel);
  startTimer();

  // Gửi xác nhận đã sẵn sàng
  socket.emit("player_ready", {
    room_id: room_id,
  });
});

// Thêm sự kiện xử lý khi người chơi sẵn sàng
socket.on("opponent_ready", function (data) {
  console.log("Opponent is ready:", data);
  if (isGameStarted) {
    // Bắt đầu game khi cả hai người chơi đã sẵn sàng
    startTimer();
  }
});

// Xử lý sự kiện cập nhật bảng
socket.on("board_updated", function (data) {
  console.log("Board updated:", data);
  if (data.board) {
    myBoard = data.board;
    updateBoardDisplay(data);
  }

  // Cập nhật bàn cờ đối thủ
  if (data.opponent_board) {
    opponentBoard = data.opponent_board;
    const opponentCells = document.querySelectorAll(".opponent-cell");
    opponentCells.forEach((cell) => {
      const row = parseInt(cell.dataset.row);
      const col = parseInt(cell.dataset.col);
      const value = opponentBoard[row][col];

      if (value !== 0) {
        if (data.correct) {
          cell.value = "★";
          cell.classList.add("correct-move");
        } else {
          cell.value = "";
          cell.classList.remove("correct-move");
        }
      }
    });
  }

  // Cập nhật điểm số
  if (data.score !== undefined) {
    opponentScore = data.score;
    updateScoreDisplay();
  }
});

socket.on("game_over", function (data) {
  if (!gameCompleted) {
    gameCompleted = true;
    stopTimer();
    const endTime = new Date();
    const timeTaken = Math.floor((endTime - startTime) / 1000);

    let message = "";
    if (data.reason === "Đối thủ đã mắc lỗi quá nhiều") {
      message = `Bạn thắng!\nThời gian: ${formatTime(
        timeTaken
      )}\nĐiểm của bạn: ${score}\nĐiểm đối thủ: ${data.opponent_score}`;
    } else if (data.reason === "Đối thủ đã hoàn thành") {
      message = `Đối thủ đã hoàn thành trước!\nThời gian: ${formatTime(
        timeTaken
      )}\nĐiểm của bạn: ${score}\nĐiểm đối thủ: ${data.opponent_score}`;
    } else if (data.reason === "Đối thủ đã thoát") {
      message = `Bạn thắng!\nĐối thủ đã thoát khỏi trận đấu\nĐiểm của bạn: ${score}`;
    } else {
      message = `Thời gian: ${formatTime(
        timeTaken
      )}\nĐiểm của bạn: ${score}\nĐiểm đối thủ: ${data.opponent_score}`;
      if (data.winner) {
        message += `\nNgười thắng: ${data.winner.name}`;
      }
    }

    showModal(data.reason || "Game Over", message);
  }
});

socket.on("opponent_disconnected", function (data) {
  console.log("Opponent Disconnected:", data);
  if (!gameCompleted) {
    gameCompleted = true;
    stopTimer();
    showModal(
      "Bạn thắng!",
      "Đối thủ đã thoát khỏi trận đấu\nĐiểm của bạn: " + score
    );
  }
});

socket.on("opponent_completed", function (data) {
  if (!gameCompleted) {
    showModal(
      "Game Over",
      `Đối thủ đã hoàn thành bảng Sudoku!\nĐiểm số của họ: ${data.score}`
    );
    gameCompleted = true;
    stopTimer();
  }
});

socket.on("opponent_lost", function (data) {
  if (!gameCompleted) {
    showModal("Bạn thắng!", "Đối thủ đã mắc quá nhiều lỗi");
    gameCompleted = true;
    stopTimer();
  }
});

socket.on("opponent_move", function (data) {
  const input = document.querySelector(
    `.opponent-cell[data-row="${data.row}"][data-col="${data.col}"]`
  );
  if (input) {
    if (data.isCorrect) {
      input.value = "★"; // Hiển thị ngôi sao cho nước đi đúng
      input.classList.add("correct-move");
    } else {
      input.value = ""; // Ẩn nước đi sai
      input.classList.remove("correct-move");
    }
  }
  opponentScore = data.score;
  updateScoreDisplay();
});

socket.on("game_result", function (data) {
  if (!gameCompleted) {
    gameCompleted = true;
    stopTimer();

    let message = "";
    if (data.winner) {
      if (data.winner === "draw") {
        message = `Hòa!\nĐiểm của bạn: ${score}\nĐiểm đối thủ: ${data.opponentScore}`;
      } else if (data.winner === "you") {
        message = `Bạn thắng!\nĐiểm của bạn: ${score}\nĐiểm đối thủ: ${data.opponentScore}`;
      } else {
        message = `Bạn thua!\nĐiểm của bạn: ${score}\nĐiểm đối thủ: ${data.opponentScore}`;
      }
    } else {
      message = `Hết thời gian!\nĐiểm của bạn: ${score}\nĐiểm đối thủ: ${data.opponentScore}`;
    }

    showModal("Kết thúc game", message);
  }
});

function initializeBoard() {
  const gameBoard = document.getElementById("game-board");
  const opponentBoardElement = document.getElementById("opponent-board");
  gameBoard.innerHTML = "";

  if (isOnlineMode && opponentBoardElement) {
    opponentBoardElement.innerHTML = "";
    opponentBoardElement.style.transform = "scale(0.2)"; // Thu nhỏ bảng đối thủ
    opponentBoardElement.style.transformOrigin = "top left";
    opponentBoardElement.style.marginLeft = "20px";
  }

  const table = document.createElement("table");
  const opponentTable = isOnlineMode ? document.createElement("table") : null;

  for (let i = 0; i < 9; i++) {
    const row = document.createElement("tr");
    const opponentRow = isOnlineMode ? document.createElement("tr") : null;
    for (let j = 0; j < 9; j++) {
      const cell = document.createElement("td");
      const opponentCell = isOnlineMode ? document.createElement("td") : null;
      const input = document.createElement("input");
      const opponentInput = isOnlineMode
        ? document.createElement("input")
        : null;

      input.type = "text";
      input.classList.add("cell");
      input.maxLength = 1;
      input.dataset.row = i;
      input.dataset.col = j;

      if (myBoard && myBoard[i][j] !== 0) {
        input.value = myBoard[i][j];
        input.disabled = true;
      } else {
        input.addEventListener("input", handleInput);
        input.addEventListener("focus", () => highlightRelated(i, j));
        input.addEventListener("blur", clearHighlight);
      }

      cell.appendChild(input);
      row.appendChild(cell);

      if (isOnlineMode) {
        opponentInput.type = "text";
        opponentInput.classList.add("cell", "opponent-cell");
        opponentInput.maxLength = 1;
        opponentInput.dataset.row = i;
        opponentInput.dataset.col = j;
        opponentInput.disabled = true;
        opponentInput.style.textAlign = "center";
        opponentInput.style.width = "20px"; // Thu nhỏ ô input
        opponentInput.style.height = "20px";
        opponentInput.style.fontSize = "0.8em";
        opponentInput.style.padding = "0";
        opponentInput.style.backgroundColor = "#f8f9fa";
        opponentInput.style.border = "1px solid #dee2e6";

        // Hiển thị đề ban đầu cho bàn cờ đối thủ
        if (opponentBoard && opponentBoard[i][j] !== 0) {
          opponentInput.value = opponentBoard[i][j];
        }

        opponentCell.appendChild(opponentInput);
        opponentRow.appendChild(opponentCell);
      }
    }
    table.appendChild(row);
    if (isOnlineMode) {
      opponentTable.appendChild(opponentRow);
    }
  }

  gameBoard.appendChild(table);
  if (isOnlineMode && opponentBoardElement) {
    opponentBoardElement.appendChild(opponentTable);
  }

  displayLevelInfo(currentGameLevel);
  if (isOnlineMode) {
    updateScoreDisplay();
  }

  // Khởi tạo phần hiển thị lịch sử nước đi
  const historyElement = document.querySelector(".move-history");
  if (historyElement) {
    historyElement.innerHTML = `
      <h3 style="color: #343a40; margin-bottom: 10px;">Lịch sử nước đi:</h3>
      <div class="history-container" style="max-height: 200px; overflow-y: auto; padding: 10px; background-color: #f8f9fa; border-radius: 5px;"></div>
    `;
  }
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
      if (isOnlineMode) {
        socket.emit("game_lost", {
          room_id: room_id,
          reason: "Too many incorrect attempts",
          score: score,
        });
      }
      showModal("Game Over", "Đã sai quá nhiều lần");
      stopTimer();
      return;
    }
  } else {
    input.classList.remove("error");
    myBoard[row][col] = value;

    if (value !== 0) {
      // Tăng điểm khi điền đúng, không phân biệt online/offline
      score += 10;
      updateMoveHistory(row, col, value);
      updateScoreDisplay();
    }

    if (checkBoardCompletion()) {
      gameCompleted = true;
      const endTime = new Date();
      const timeTaken = Math.floor((endTime - startTime) / 1000);

      if (isOnlineMode) {
        socket.emit("game_completed", {
          room_id: room_id,
          time: timeTaken,
          score: score,
          reason: "Game completed",
        });
      }

      showModal(
        "Chúc mừng!",
        `Bạn đã hoàn thành bảng Sudoku!\nĐiểm số: ${score}`
      );
      stopTimer();
    }
  }

  if (isOnlineMode) {
    socket.emit("player_move", {
      room_id: room_id,
      row: row,
      col: col,
      value: value,
      isCorrect: isCorrect,
      score: score,
    });
  }
}

function updateBoardDisplay(data) {
  const input = document.querySelector(
    `input[data-row="${data.row}"][data-col="${data.col}"]`
  );
  if (!input) return;
  input.value = data.value !== 0 ? data.value : "";
  if (data.correct) {
    input.classList.remove("error");
  } else {
    input.classList.add("error");
    incorrectAttempts++;
    if (incorrectAttempts >= MAX_INCORRECT_ATTEMPTS) {
      showModal("Game Over", "Đã sai quá nhiều lần");
      stopTimer();
    }
  }
}

function getTimeLimit(level) {
  if (isOnlineMode) {
    switch (level.toLowerCase()) {
      case "easy":
        return 5 * 60; // 5 phút
      case "medium":
        return 8 * 60; // 8 phút
      case "hard":
        return 10 * 60; // 10 phút
      default:
        return 8 * 60;
    }
  }
  return 0; // Không giới hạn thời gian cho chế độ offline
}

function startTimer() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  startTime = new Date();
  timeLimit = getTimeLimit(currentGameLevel);
  const timerElement = document.querySelector(".timer");

  if (timerElement) {
    // Hiển thị thời gian ban đầu
    timerElement.textContent = formatTime(timeLimit);

    // Bắt đầu đếm ngược
    countdownInterval = setInterval(() => {
      if (!gameCompleted) {
        const currentTime = new Date();
        const elapsedTime = Math.floor((currentTime - startTime) / 1000);
        const remainingTime = Math.max(0, timeLimit - elapsedTime);

        // Cập nhật hiển thị thời gian
        timerElement.textContent = formatTime(remainingTime);

        // Kiểm tra nếu hết thời gian
        if (remainingTime <= 0) {
          clearInterval(countdownInterval);
          gameCompleted = true;
          const endTime = new Date();
          const timeTaken = Math.floor((endTime - startTime) / 1000);
          const { filledCells, correctCells } = updateGameProgress();
          score = calculateScore(timeTaken, incorrectAttempts, correctCells);

          if (isOnlineMode) {
            socket.emit("time_up", {
              room_id: room_id,
              score: score,
              correctCells: correctCells,
              filledCells: filledCells,
            });
          }

          showModal("Hết thời gian!", "Thời gian chơi đã kết thúc!");
        }
      }
    }, 1000);
  }
}

function stopTimer() {
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
    messageElement.textContent = message;
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

function eraseCell() {
  const focusedElement = document.activeElement;
  if (focusedElement.tagName === "INPUT" && !focusedElement.disabled) {
    const row = parseInt(focusedElement.dataset.row);
    const col = parseInt(focusedElement.dataset.col);
    focusedElement.value = "";
    myBoard[row][col] = 0;
    focusedElement.classList.remove("error");

    if (isOnlineMode) {
      socket.emit("player_move", {
        room_id: room_id,
        row: row,
        col: col,
        value: 0,
        isCorrect: true,
        score: score,
      });
    }

    updateScoreDisplay();
  }
}

function undo() {
  // Implement undo functionality (if needed)
  alert("Undo is not implemented yet.");
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
    // Hiển thị cấp độ khó với định dạng rõ ràng hơn
    const levelText = level.charAt(0).toUpperCase() + level.slice(1);
    difficultyElement.textContent = `Cấp độ: ${levelText}`;

    // Hiển thị số sao tương ứng với độ khó
    let stars = "";
    const starCount = level === "easy" ? 1 : level === "medium" ? 2 : 3;
    for (let i = 0; i < starCount; i++) {
      stars += "★";
    }
    starsElement.textContent = `Độ khó: ${stars}`;
  }
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

function resetGameState() {
  myBoard = null;
  opponentBoard = null;
  solution = null;
  incorrectAttempts = 0;
  score = 0;
  gameCompleted = false;
  isGameStarted = false;
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

  moveHistory = []; // Xóa lịch sử nước đi

  // Reset phần hiển thị lịch sử
  const historyElement = document.querySelector(".move-history");
  if (historyElement) {
    historyElement.innerHTML = `
      <h3 style="color: #343a40; margin-bottom: 10px;">Lịch sử nước đi:</h3>
      <div class="history-container" style="max-height: 200px; overflow-y: auto; padding: 10px; background-color: #f8f9fa; border-radius: 5px;"></div>
    `;
  }
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

function updateScoreDisplay() {
  const scoreElement = document.querySelector(".score");
  if (scoreElement) {
    let scoreText = `Điểm của bạn: ${score}`;
    const { filledCells, correctCells } = updateGameProgress();
    scoreText += `\nSố ô đúng: ${correctCells}/81`;
    scoreElement.textContent = scoreText;
  }

  if (isOnlineMode) {
    const opponentScoreElement = document.querySelector(".opponent-score");
    if (opponentScoreElement) {
      opponentScoreElement.textContent = `Điểm đối thủ: ${opponentScore}`;
    }
  }
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

function updateOpponentBoard(data) {
  const opponentCells = document.querySelectorAll(".opponent-cell");
  opponentCells.forEach((cell) => {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const value = opponentBoard[row][col];

    if (value !== 0) {
      if (data.correct) {
        cell.value = "★";
        cell.classList.add("correct-move");
      } else {
        cell.value = "";
        cell.classList.remove("correct-move");
      }
    }
  });
}

function handleCellClick(cell) {
  if (gameCompleted || cell.classList.contains("fixed")) return;

  // Xóa highlight khỏi tất cả các ô
  document.querySelectorAll(".cell").forEach((c) => {
    c.classList.remove("highlight");
  });

  // Highlight ô được chọn và các ô liên quan
  highlightRelatedCells(cell);

  // Hiển thị bàn phím số
  const rect = cell.getBoundingClientRect();
  const keyboard = document.querySelector(".number-keyboard");
  keyboard.style.display = "flex";
  keyboard.style.left = `${rect.left}px`;
  keyboard.style.top = `${rect.bottom + 5}px`;

  // Lưu ô đang được chọn
  selectedCell = cell;

  // Thêm sự kiện click cho bàn phím số
  document.querySelectorAll(".number-keyboard button").forEach((button) => {
    button.onclick = () => {
      const value = button.textContent;
      if (value === "X") {
        cell.textContent = "";
        cell.classList.remove("correct", "incorrect");
      } else {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const currentValue = parseInt(value);

        // Kiểm tra tính hợp lệ của nước đi
        if (isValidMove(row, col, currentValue)) {
          cell.textContent = value;
          cell.classList.add("correct");
          cell.classList.remove("incorrect");

          // Cập nhật điểm số
          const { filledCells, correctCells } = updateGameProgress();
          const currentTime = new Date();
          const timeTaken = Math.floor((currentTime - startTime) / 1000);
          score = calculateScore(timeTaken, incorrectAttempts, correctCells);

          // Cập nhật hiển thị điểm số
          const scoreElement = document.querySelector(".score");
          if (scoreElement) {
            scoreElement.textContent = `Điểm: ${score}`;
          }

          // Thêm nước đi vào lịch sử
          const move = {
            row: row,
            col: col,
            value: currentValue,
            timestamp: new Date().toLocaleTimeString(),
          };
          moveHistory.push(move);

          // Cập nhật hiển thị lịch sử
          updateMoveHistory();

          // Kiểm tra chiến thắng
          if (checkWin()) {
            gameCompleted = true;
            clearInterval(countdownInterval);
            const endTime = new Date();
            const timeTaken = Math.floor((endTime - startTime) / 1000);
            const { filledCells, correctCells } = updateGameProgress();
            score = calculateScore(timeTaken, incorrectAttempts, correctCells);

            if (isOnlineMode) {
              socket.emit("game_completed", {
                room_id: room_id,
                score: score,
                correctCells: correctCells,
                filledCells: filledCells,
              });
            }

            showModal("Chúc mừng!", "Bạn đã hoàn thành trò chơi!");
          }
        } else {
          cell.textContent = value;
          cell.classList.add("incorrect");
          cell.classList.remove("correct");
          incorrectAttempts++;
        }
      }
      keyboard.style.display = "none";
    };
  });
}

function updateMoveHistory() {
  const historyContainer = document.querySelector(".move-history");
  if (!historyContainer) return;

  // Xóa lịch sử cũ
  historyContainer.innerHTML = "";

  // Hiển thị 5 nước đi gần nhất
  const recentMoves = moveHistory.slice(-5).reverse();
  recentMoves.forEach((move) => {
    const moveElement = document.createElement("div");
    moveElement.className = "move-item";
    moveElement.textContent = `Ô [${move.row + 1},${move.col + 1}] = ${
      move.value
    } (${move.timestamp})`;
    historyContainer.appendChild(moveElement);
  });
}
