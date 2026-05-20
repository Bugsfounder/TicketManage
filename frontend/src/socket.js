import { io } from 'socket.io-client';

// Determine the WebSocket URL dynamically based on environment or window location
const SOCKET_URL = import.meta.env.VITE_WS_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : window.location.origin.replace('3000', '5000').replace('5173', '5000')
);

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000
});
