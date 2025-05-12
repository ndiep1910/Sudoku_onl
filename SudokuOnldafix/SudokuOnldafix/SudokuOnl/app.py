import eventlet
eventlet.monkey_patch()  # Phải gọi monkey_patch() đầu tiên

from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, join_room, leave_room, rooms, emit
import random
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'  # Đảm bảo bạn có một secret key an toàn
socketio = SocketIO(app)  # Loại bỏ cors_allowed_origins (xem giải thích bên dưới)

# Sử dụng Flask-CORS nếu cần thiết (xem giải thích bên dưới)
# from flask_cors import CORS
# CORS(app)

rooms_data = {}  # Quản lý thông tin phòng chi tiết


def is_valid(board, row, col, num):
    """Kiểm tra tính hợp lệ của số trong bảng Sudoku."""
    for x in range(9):
        if board[row][x] == num and x != col:
            return False
    for x in range(9):
        if board[x][col] == num and x != row:
            return False
    start_row, start_col = 3 * (row // 3), 3 * (col // 3)
    for i in range(3):
        for j in range(3):
            if board[i + start_row][j + start_col] == num and (i + start_row, j + start_col) != (row, col):
                return False
    return True


def solve_sudoku(board):
    """Giải bảng Sudoku (đệ quy, quay lui)."""
    for row in range(9):
        for col in range(9):
            if board[row][col] == 0:
                for num in range(1, 10):
                    if is_valid(board, row, col, num):
                        board[row][col] = num
                        if solve_sudoku(board):
                            return True
                        board[row][col] = 0
                return False
    return True


def generate_full_board():
    """Tạo một bảng Sudoku hoàn chỉnh."""
    board = [[0 for _ in range(9)] for _ in range(9)]
    solve_sudoku(board)
    return board


def generate_sudoku(level):
    """Tạo bảng Sudoku với độ khó khác nhau."""
    board = generate_full_board()
    solution_board = [row[:] for row in board]
    game_board = [row[:] for row in board]
    cells_to_remove = {'easy': 40, 'medium': 50, 'hard': 60}.get(level, 50)

    while cells_to_remove > 0:
        row, col = random.randint(0, 8), random.randint(0, 8)
        if game_board[row][col] != 0:
            game_board[row][col] = 0
            cells_to_remove -= 1

    return game_board, solution_board


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/practice')
def practice():
    return render_template('practice.html')


@app.route('/online')
def online():
    return render_template('online.html')


@app.route('/generate_sudoku')
def generate_sudoku_route():
    """API để tạo bảng Sudoku (cho chế độ offline)."""
    level = request.args.get('level', 'medium')
    game_board, solution_board = generate_sudoku(level)
    return jsonify({'board': game_board, 'solution': solution_board})


@socketio.on('connect')
def handle_connect():
    print('Client connected')


@socketio.on('join_game')
def handle_join_game():
    """Xử lý khi người chơi tham gia vào hàng đợi hoặc phòng."""
    player_id = request.sid
    print(f"Player {player_id} joined")

    available_room_id = next(
        (room_id for room_id, room_data in rooms_data.items() if len(room_data['players']) < 2),
        None
    )

    if available_room_id:
        rooms_data[available_room_id]['players'].append(player_id)
        rooms_data[available_room_id]['scores'][player_id] = 0
        join_room(available_room_id, sid=player_id)

        game_board = rooms_data[available_room_id]['board']
        solution_board = rooms_data[available_room_id]['solution']

        emit('match_found', {
            'room_id': available_room_id,
            'board': game_board,
            'solution': solution_board
        }, room=available_room_id)
    else:
        room_id = str(uuid.uuid4())  # Tạo ID phòng duy nhất
        game_board, solution_board = generate_sudoku('medium')  # Tạo bảng và lời giải
        rooms_data[room_id] = {
            'players': [player_id],
            'board': game_board,
            'solution': solution_board,  # Thêm solution vào đây
            'level': 'medium',  # Mặc định là medium
            'scores': {player_id: 0}
        }
        join_room(room_id, sid=player_id)
        emit('waiting', {'message': 'Đang chờ người chơi khác...'}, room=room_id)


@socketio.on('rejoin_game')
def handle_rejoin_game(data):
    """Xử lý khi người chơi cố gắng kết nối lại vào phòng."""
    room_id = data.get('room_id')
    player_id = request.sid

    if room_id in rooms_data:
        room = rooms_data[room_id]
        if player_id not in room['players']:
            room['players'].append(player_id)
            room['scores'][player_id] = 0  # Hoặc khôi phục điểm số nếu cần
            join_room(room_id, sid=player_id)
            emit('match_found', {
                'room_id': room_id,
                'board': room['board'],
                'solution': room['solution']
            }, room=player_id)
            emit('message', {'text': f'Người chơi {player_id} đã quay lại phòng.'}, room=room_id, skip_sid=player_id)
        else:
            # Người chơi đã ở trong phòng (trường hợp không nên xảy ra nếu logic client đúng)
            join_room(room_id, sid=player_id)
            emit('match_found', {
                'room_id': room_id,
                'board': room['board'],
                'solution': room['solution']
            }, room=player_id)
    else:
        emit('error', {'message': 'Phòng không tồn tại hoặc đã đóng.'}, room=player_id)


@socketio.on('update_board')
def handle_update_board(data):
    """Xử lý khi người chơi cập nhật bảng."""
    room_id = data['room_id']
    row = data['row']
    col = data['col']
    value = data['value']
    player_id = request.sid

    if room_id in rooms_data:
        rooms_data[room_id]['board'][row][col] = value
        correct = (value != 0 and value == rooms_data[room_id]['solution'][row][col])

        if correct:
            rooms_data[room_id]['scores'][player_id] += 1

        emit('board_updated', {
            'row': row,
            'col': col,
            'value': value,
            'correct': correct
        }, room=room_id)

        check_game_over(room_id)


def check_game_over(room_id):
    """Kiểm tra xem trò chơi đã kết thúc chưa."""
    if room_id not in rooms_data:
        return

    board = rooms_data[room_id]['board']
    solution = rooms_data[room_id]['solution']

    for i in range(9):
        for j in range(9):
            if board[i][j] != solution[i][j] and board[i][j] != 0:
                return  # Chưa kết thúc

    # Xác định người thắng
    scores = rooms_data[room_id]['scores']
    winner_id = max(scores, key=scores.get)
    winner_score = scores[winner_id]
    winner_name = f"Player {rooms_data[room_id]['players'].index(winner_id) + 1}"

    emit('game_over', {
        'winner': {
            'name': winner_name,
            'score': winner_score
        }
    }, room=room_id)


@socketio.on('request_new_game')
def handle_request_new_game(data):
    """Xử lý khi người chơi yêu cầu ván chơi mới với độ khó."""
    room_id = data['room_id']
    level = data['level']

    if room_id in rooms_data:
        rooms_data[room_id]['level'] = level
        game_board, solution_board = generate_sudoku(level)
        rooms_data[room_id]['board'] = game_board
        rooms_data[room_id]['solution'] = solution_board
        # Reset điểm số
        for player in rooms_data[room_id]['players']:
            rooms_data[room_id]['scores'][player] = 0

        emit('match_found', {
            'room_id': room_id,
            'board': game_board,
            'solution': solution_board
        }, room=room_id)


@socketio.on('disconnect')
def handle_disconnect():
    """Xử lý khi người chơi ngắt kết nối."""
    player_id = request.sid
    for room_id, room in list(rooms_data.items()):
        if player_id in room['players']:
            room['players'].remove(player_id)
            emit('opponent_disconnected', {'message': 'Đối thủ đã ngắt kết nối.'}, room=room_id, skip_sid=player_id)
            del room['scores'][player_id]
            if len(room['players']) < 2:
                emit('waiting', {'message': 'Đang chờ người chơi khác...'}, room=room_id)
            if len(room['players']) == 0:
                del rooms_data[room_id]
            break


if __name__ == '__main__':
    import eventlet.wsgi
    eventlet.wsgi.server(eventlet.listen(('', 5000)), app)  # Chạy với eventlet