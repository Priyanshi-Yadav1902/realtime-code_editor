import { io } from 'socket.io-client';


export const initSocket = () => {
  const env = process.env.REACT_APP_BACKEND_URL;
  const defaultHost = `${window.location.protocol}//${window.location.hostname}:5000`;
  const url = env || defaultHost;

  const options = {
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    forceNew: true,
    reconnectionAttempts: Infinity,
    timeout: 20000,
  };

  try { console.debug('initSocket: connecting to', url, options); } catch (e) {}
  return io(url, options);
};
