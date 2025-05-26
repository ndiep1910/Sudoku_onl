import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, join_room, leave_room, emit
from flask_cors import CORS
import random
import uuid
import socket
import time
import logging

# Cấu hình logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'

# Cấu hình CORS chi tiết hơn
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:5000", "http://127.0.0.1:5000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "expose_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "max_age": 3600
    }
})

# Cấu hình Socket.IO với các tùy chọn bổ sung
socketio = SocketIO(
    app,
    cors_allowed_origins=["http://localhost:5000", "http://127.0.0.1:5000"],
    async_mode='eventlet',
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e8,
    logger=True,
    engineio_logger=True,
    always_connect=True,
    reconnection=True,
    reconnection_attempts=0,
    reconnection_delay=1000,
    reconnection_delay_max=5000,
    path='/socket.io/',
    transports=['websocket', 'polling']
)

# Thêm middleware để log requests
@app.before_request
def log_request_info():
    logger.debug('Headers: %s', request.headers)
    logger.debug('Body: %s', request.get_data())

def get_ip():
    try:
        hostname = socket.gethostname()
        ip_address = socket.gethostbyname(hostname)
        return ip_address
    except:
        return "127.0.0.1"

rooms_data = {}

def is_valid(board, row, col, num):
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
    board = [[0 for _ in range(9)] for _ in range(9)]
    solve_sudoku(board)
    return board

def generate_sudoku(level):
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
    level = request.args.get('level', 'medium')
    game_board, solution_board = generate_sudoku(level)
    return jsonify({'board': game_board, 'solution': solution_board})

@socketio.on('connect')
def handle_connect():
    logger.info(f'Client connected: {request.sid}')
    emit('connection_established', {'status': 'connected'})

@socketio.on('join_game')
def handle_join_game(data):
    player_id = request.sid
    room_id = data.get('room_id')
    level = data.get('level', 'medium')
    logger.info(f"Player {player_id} trying to join room {room_id}")

    if room_id and room_id in rooms_data:
        # Kiểm tra xem phòng đã có người chơi chưa
        if len(rooms_data[room_id]['players']) < 2:
            # Thêm người chơi vào phòng
            rooms_data[room_id]['players'].append(player_id)
            rooms_data[room_id]['scores'][player_id] = 0
            rooms_data[room_id]['boards'][player_id] = [row[:] for row in rooms_data[room_id]['boards'][rooms_data[room_id]['players'][0]]]
            rooms_data[room_id]['history'][player_id] = []
            join_room(room_id, sid=player_id)

            # Gửi thông tin game cho cả hai người chơi
            for pid in rooms_data[room_id]['players']:
                opponent_id = next(p for p in rooms_data[room_id]['players'] if p != pid)
                logger.info(f"Sending match found to player {pid}")
                emit('match_found', {
                    'room_id': room_id,
                    'board': rooms_data[room_id]['boards'][pid],
                    'solution': rooms_data[room_id]['solution'],
                    'opponent_board': rooms_data[room_id]['boards'][opponent_id],
                    'level': rooms_data[room_id]['level']
                }, room=pid)
        else:
            # Phòng đã đầy
            emit('error', {'message': 'Phòng đã đầy'})
    else:
        # Phòng không tồn tại
        emit('error', {'message': 'Phòng không tồn tại'})

@socketio.on('rejoin_game')
def handle_rejoin_game(data):
    room_id = data.get('room_id')
    player_id = request.sid

    if room_id in rooms_data:
        room = rooms_data[room_id]
        if player_id not in room['players']:
            room['players'].append(player_id)
            room['scores'][player_id] = 0
            room['boards'][player_id] = [row[:] for row in room['boards'][room['players'][0]]]
            room['history'][player_id] = []
            join_room(room_id, sid=player_id)
            emit('match_found', {
                'room_id': room_id,
                'board': room['boards'][player_id],
                'solution': room['solution'],
                'opponent_board': room['boards'][room['players'][0]]
            }, room=player_id)
            emit('message', {'text': f'Người chơi {player_id} đã quay lại phòng.'}, room=room_id, skip_sid=player_id)
        else:
            join_room(room_id, sid=player_id)
            emit('match_found', {
                'room_id': room_id,
                'board': room['boards'][player_id],
                'solution': room['solution'],
                'opponent_board': room['boards'][next(p for p in room['players'] if p != player_id)]
            }, room=player_id)
    else:
        emit('error', {'message': 'Phòng không tồn tại hoặc đã đóng.'}, room=player_id)

@socketio.on('update_board')
def handle_update_board(data):
    room_id = data['room_id']
    row = data['row']
    col = data['col']
    value = data['value']
    player_id = request.sid

    if room_id in rooms_data:
        rooms_data[room_id]['boards'][player_id][row][col] = value
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
    if room_id not in rooms_data:
        return

    solution = rooms_data[room_id]['solution']
    for player_id in rooms_data[room_id]['players']:
        board = rooms_data[room_id]['boards'][player_id]
        completed = True
        for i in range(9):
            for j in range(9):
                if board[i][j] != solution[i][j] and board[i][j] != 0:
                    completed = False
                    break
            if not completed:
                break
        if completed:
            handle_game_completion(room_id, player_id)
            return

@socketio.on('request_new_game')
def handle_request_new_game(data):
    level = data.get('level', 'medium')
    timestamp = data.get('timestamp')
    player_id = request.sid
    logger.info(f"Player {player_id} requested new game with level {level}")

    # Tạo phòng mới
    room_id = str(uuid.uuid4())
    rooms_data[room_id] = {
        'players': [player_id],
        'scores': {player_id: 0},
        'boards': {},
        'solution': None,
        'level': level,
        'history': {player_id: []},
        'created_at': time.time()
    }

    # Tạo bảng Sudoku mới
    board, solution = generate_sudoku(level)
    rooms_data[room_id]['boards'][player_id] = board
    rooms_data[room_id]['solution'] = solution

    # Tham gia phòng
    join_room(room_id, sid=player_id)

    # Gửi thông tin phòng cho người chơi
    emit('waiting', {
        'room_id': room_id,
        'message': 'Đang chờ người chơi thứ hai...'
    })

    logger.info(f"Created new room {room_id} for player {player_id}")

@socketio.on('player_ready')
def handle_player_ready(data):
    room_id = data.get('room_id')
    player_id = request.sid
    
    if room_id in rooms_data:
        room = rooms_data[room_id]
        room['ready_players'].add(player_id)
        logger.info(f"Player {player_id} is ready in room {room_id}")
        logger.info(f"Ready players in room {room_id}: {room['ready_players']}")
        
        # Kiểm tra nếu cả hai người chơi đã sẵn sàng
        if len(room['ready_players']) == 2:
            logger.info(f"Both players are ready in room {room_id}")
            # Gửi tín hiệu bắt đầu game cho cả hai người chơi
            emit('opponent_ready', {'room_id': room_id}, room=room_id)
            
            # Xóa danh sách người chơi đã sẵn sàng
            room['ready_players'].clear()
    else:
        logger.error(f"Room {room_id} not found for player {player_id}")

@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f'Client disconnected: {request.sid}')
    player_id = request.sid
    
    # Tìm và xử lý phòng chứa người chơi bị ngắt kết nối
    for room_id, room_data in list(rooms_data.items()):
        if player_id in room_data['players']:
            logger.info(f'Player {player_id} disconnected from room {room_id}')
            room_data['players'].remove(player_id)
            if player_id in room_data['ready_players']:
                room_data['ready_players'].remove(player_id)
                
            if room_data['players']:
                remaining_player = room_data['players'][0]
                player_score = room_data['scores'].get(player_id, 0)
                emit('game_over', {
                    'winner': {
                        'id': remaining_player,
                        'name': f'Player {remaining_player[:5]}',
                        'score': room_data['scores'].get(remaining_player, 0)
                    },
                    'opponent_score': player_score,
                    'reason': 'Đối thủ đã thoát'
                }, room=remaining_player)
            
            if not room_data['players']:
                logger.info(f'Deleting empty room {room_id}')
                del rooms_data[room_id]
            break

@socketio.on('player_move')
def handle_player_move(data):
    room_id = data['room_id']
    row = data['row']
    col = data['col']
    value = data['value']
    is_correct = data['isCorrect']
    score = data['score']
    player_id = request.sid

    if room_id in rooms_data:
        # Cập nhật bảng của người chơi
        rooms_data[room_id]['boards'][player_id][row][col] = value
        
        # Cập nhật điểm số
        rooms_data[room_id]['scores'][player_id] = score
        
        # Lưu lịch sử nước đi
        move = {
            'row': row,
            'col': col,
            'value': value,
            'is_correct': is_correct,
            'timestamp': time.time()
        }
        rooms_data[room_id]['history'][player_id].append(move)

        # Gửi thông tin cập nhật cho đối thủ
        opponent_id = next(p for p in rooms_data[room_id]['players'] if p != player_id)
        emit('opponent_move', {
            'row': row,
            'col': col,
            'value': value,
            'isCorrect': is_correct,
            'score': score
        }, room=opponent_id)

        # Kiểm tra kết thúc game
        check_game_over(room_id)

@socketio.on('game_completed')
def handle_game_completion(data):
    room_id = data['room_id']
    player_id = request.sid
    time_taken = data['time']
    score = data['score']

    if room_id in rooms_data:
        # Cập nhật điểm số cuối cùng
        rooms_data[room_id]['scores'][player_id] = score
        
        # Gửi thông báo cho đối thủ
        opponent_id = next(p for p in rooms_data[room_id]['players'] if p != player_id)
        emit('game_over', {
            'reason': 'Đối thủ đã hoàn thành',
            'opponent_score': score,
            'winner': {
                'id': player_id,
                'name': f'Player {player_id[:5]}'
            }
        }, room=opponent_id)

        # Xóa phòng sau khi game kết thúc
        del rooms_data[room_id]

@socketio.on('game_lost')
def handle_game_lost(data):
    room_id = data['room_id']
    player_id = request.sid

    if room_id in rooms_data:
        room = rooms_data[room_id]
        other_player = next((p for p in room['players'] if p != player_id), None)

        if other_player:
            player_score = room['scores'].get(player_id, 0)
            other_score = room['scores'].get(other_player, 0)

            # Gửi thông báo cho người thắng
            emit('game_over', {
                'winner': {
                    'id': other_player,
                    'name': f'Player {other_player[:5]}',
                    'score': other_score
                },
                'opponent_score': player_score,
                'reason': 'Đối thủ đã mắc lỗi quá nhiều'
            }, room=other_player)

            # Gửi thông báo cho người thua
            emit('game_over', {
                'winner': {
                    'id': other_player,
                },
                'opponent_score': other_score,
                'reason': 'Đối thủ đã mắc lỗi quá nhiều'
            }, room=player_id)

        del rooms_data[room_id]

def check_player_completion(room_id, player_id):
    if room_id not in rooms_data:
        return False

    room = rooms_data[room_id]
    solution = room['solution']
    board = room['boards'][player_id]

    for i in range(9):
        for j in range(9):
            if board[i][j] != solution[i][j]:
                return False
    return True

if __name__ == '__main__':
    logger.info('Starting server...')
    logger.info('Server will be available at http://localhost:5000')
    
    try:
        # Thêm host và port vào log
        host = '0.0.0.0'
        port = 5000
        logger.info(f'Binding to {host}:{port}')
        
        socketio.run(
            app,
            host=host,
            port=port,
            debug=True,
            use_reloader=False,
            allow_unsafe_werkzeug=True,
            log_output=True
        )
    except Exception as e:
        logger.error(f'Error starting server: {str(e)}')
        raise
