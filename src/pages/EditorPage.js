import React, { useState, useRef, useEffect, useCallback } from "react";
import Client from '../components/Client';
import Editor from '../components/Editor';
import ACTIONS from '../Actions';
import { initSocket } from "../socket";
import toast from 'react-hot-toast';
import { useLocation, useParams, useNavigate } from "react-router-dom";
const EditorPage = () => {
  const Location= useLocation();
  const reactNavigator = useNavigate();
  const socketRef= useRef(null);
  const editorGetCodeRef = useRef(null);
  const [socketInstance, setSocketInstance] = useState(null);
  const [joined, setJoined] = useState(false);
  const [username, setUsername] = useState(Location?.state?.username || localStorage.getItem('username') || '');
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); 
  const { roomId } = useParams();
  const[clients, setClients]=useState([]);
  const connectErrorShownRef = useRef(false);
  const lastJoinToastRef = useRef(null);
  const joinAttemptsRef = useRef(0);
  const joinRetryTimeoutRef = useRef(null);
  const didInitiateJoinRef = useRef(false);
  const joinedRef = useRef(joined);
  
  
  useEffect(() => {
    
    let initialName = username;
    if (!initialName) {
      const promptName = window.prompt('Enter your name to join the room');
      if (!promptName) {
        
        reactNavigator('/');
        return;
      }
      initialName = promptName.trim();
      localStorage.setItem('username', initialName);
      setUsername(initialName);
    }

   
    setClients([{ socketId: 'temp-local', username: initialName }]);

    
    let __anySocketHandler = null;

  const init = async () => {
      if (socketRef.current) return;
      socketRef.current = initSocket();
      setSocketInstance(socketRef.current);
      try { window.__socket = socketRef.current; } catch (e) {}
    
      try {
        __anySocketHandler = (event, ...args) => {
          console.debug('SOCKET EVENT (client):', event, args);
        };
        socketRef.current.onAny && socketRef.current.onAny(__anySocketHandler);
      } catch (e) {}
      
      const attemptJoin = (name) => {
        try {
          if (!socketRef.current) return;
          console.log('Attempting to join room:', roomId, 'as:', name);
          socketRef.current.emit(ACTIONS.JOIN, { roomId, username: name });
          joinAttemptsRef.current = (joinAttemptsRef.current || 0) + 1;
         
          if (joinAttemptsRef.current < 4) {
            if (joinRetryTimeoutRef.current) clearTimeout(joinRetryTimeoutRef.current);
            joinRetryTimeoutRef.current = setTimeout(() => {
              if (!joinedRef.current) attemptJoin(name);
            }, 2000);
          }
        } catch (e) { console.error('attemptJoin error', e); }
      };

      socketRef.current.on('connect', () => {
        console.log('socket connected (client)', socketRef.current.id);
        setConnectionStatus('connected');
        if (connectErrorShownRef.current) {
          toast.success('Connected to server');
          connectErrorShownRef.current = false;
        }

        
        if (!didInitiateJoinRef.current) {
          didInitiateJoinRef.current = true;
          console.debug('Starting join attempts for', initialName);
          attemptJoin(initialName);
        } else {
          console.debug('Join already initiated, skipping duplicate start');
        }
      });
      socketRef.current.on('reconnect_attempt', (attempt) => {
        console.log('reconnect attempt', attempt);
        setConnectionStatus('connecting');
      });
      
      socketRef.current.io.on('upgrade', () => {
        console.log('socket transport upgraded (client)');
      });
      
      const handleErrors = (e) => {
        console.error('socket connection error', e && e.message ? e.message : e);
        setConnectionStatus('disconnected');
        if (!connectErrorShownRef.current) {
          toast.error('Socket connection failed; will retry automatically.');
          connectErrorShownRef.current = true;
        }
      };
      socketRef.current.on('connect_error', handleErrors);

      
      socketRef.current.on('disconnect', (reason) => {
        console.warn('socket disconnected', reason);
        setConnectionStatus('disconnected');
        setJoined(false);
        if (!connectErrorShownRef.current) {
          toast.error('Disconnected from server');
          connectErrorShownRef.current = true;
        }
      });
   const handleJoin = ({ clients, username: joinedUser, socketId }) => {
  console.debug('ACTIONS.JOINED payload received on client:', { 
    clients, 
    joinedUser, 
    socketId,
    myUsername: initialName,
    mySocketId: socketRef.current?.id 
  });

  
  if (joinedUser && joinedUser !== initialName && socketId !== socketRef.current?.id) {
    if (lastJoinToastRef.current !== joinedUser) {
      toast.success(`${joinedUser} joined the room.`);
      console.log(`${joinedUser} joined the room.`);
      lastJoinToastRef.current = joinedUser;
    }
  }

  
  if (Array.isArray(clients)) {
    
    const merged = Array.isArray(clients) ? [...clients] : [];
    if (!merged.some(c => c.username === initialName)) {
      merged.push({ socketId: socketRef.current?.id || 'local', username: initialName });
    }
    setClients(merged);
    console.debug('Client state `clients` updated to (merged):', merged);
  } else {
    console.error('Invalid clients data received:', clients);
  }
};


      const handleDisconnect = ({socketId, username, clients: updatedClients}) => {
        toast.success(`${username} left the room.`);
        if (Array.isArray(updatedClients)) {
          setClients(updatedClients);
        } else {
          setClients((prev) => prev.filter(c => c.socketId !== socketId));
        }
      };
      socketRef.current.on(ACTIONS.JOINED, handleJoin);
      socketRef.current.on('join_ack', ({ success, roomId: ackRoom }) => {
        if (success && ackRoom === roomId) {
          toast.success('You joined the room successfully.');
          setJoined(true);
          try { console.debug('CLIENT: received join_ack, joined=true, socketId=', socketRef.current?.id); } catch (e) {}
          
         
          try {
            socketRef.current.emit('get_clients', { roomId });
            setTimeout(() => { try { socketRef.current && socketRef.current.emit('get_clients', { roomId }); } catch (e) {} }, 500);
            setTimeout(() => { try { socketRef.current && socketRef.current.emit('get_clients', { roomId }); } catch (e) {} }, 1500);
          } catch (e) { console.error('get_clients emit failed', e); }
          console.debug('join_ack received, requested get_clients (with retries)');
        }
      });
      socketRef.current.on(ACTIONS.DISCONNECTED, handleDisconnect);
      
    };
  init();
  return () => {
      if (socketRef.current) {
        socketRef.current.off(ACTIONS.JOINED);
        socketRef.current.off(ACTIONS.DISCONNECTED);
        socketRef.current.off('connect_error');
        try { __anySocketHandler && socketRef.current.offAny && socketRef.current.offAny(__anySocketHandler); } catch (e) {}
        socketRef.current.disconnect && socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (joinRetryTimeoutRef.current) {
        clearTimeout(joinRetryTimeoutRef.current);
        joinRetryTimeoutRef.current = null;
      }
      joinAttemptsRef.current = 0;
    };
  }, [roomId, username, reactNavigator]);

  const [runOutput, setRunOutput] = useState(null);
  const [language, setLanguage] = useState('javascript');

  const handleRun = async () => {
    try {
      const getCode = editorGetCodeRef.current;
      if (!getCode) { toast.error('Editor not ready'); return; }
      const code = getCode();
        
        try {
          if (socketRef.current) {
            socketRef.current.emit(ACTIONS.CODE_CHANGE, { roomId, code });
          }
        } catch (e) {}
      
      try { console.debug('Run requested', { roomId, socketId: socketRef.current?.id, language: 'javascript', code }); } catch (e) {}
      setRunOutput({ running: true });
      const resp = await fetch((process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000') + '/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code, socketId: socketRef.current?.id, username }),
      });
      const json = await resp.json();
      try { console.debug('Run response', json); } catch (e) {}
      setRunOutput({ running: false, result: json });
        
        try {
          if (socketRef.current) {
            socketRef.current.emit('run_result', { roomId, result: json });
          }
        } catch (e) {}
      
      socketRef.current.on('run_result', ({ result }) => {
        try {
          
          if (socketRef.current && result && result.socketId !== socketRef.current.id) {
            setRunOutput({ running: false, result });
          }
        } catch (e) {}
      });
    } catch (e) {
      setRunOutput({ running: false, error: String(e) });
    }
  };

  
  useEffect(() => {
    joinedRef.current = joined;
  }, [joined]);

  const handleLeave = () => {
    const uname = username;
    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.LEAVE, { roomId, username: uname });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    toast.success('You left the room.');
    reactNavigator('/');
  };

  const onRegister = useCallback((fn) => { editorGetCodeRef.current = fn; }, []);

  return (
    <div className="mainWrap">
      <div className="aside">
        <div className="asideInner">
          <div className="logo">
            <img className="logoImage" src="/code-sync.png"  alt="logo"/>
          </div>
          <h3>Connected</h3>
          <div className="clientsList">
            {clients.map((client) => (
              <Client key={client.socketId} username={client.username} />
            ))}
          </div>
        </div>
        <div className="asideButtons">
          <button className="btn copyBtn" onClick={() => {
            try { navigator.clipboard.writeText(roomId); toast.success('Room ID copied'); } catch (e) { console.error(e); }
          }}>Copy Room ID</button>
          <button className="btn syncBtn" onClick={() => { try { socketRef.current && socketRef.current.emit('get_clients', { roomId }); toast('Syncing...'); } catch (e) { console.error(e); } }}>Sync roster</button>
          <button className="btn leaveBtn" onClick={handleLeave}>Leave</button>
        </div>
      </div>
      <div className="editorWrap">
        <div className="editorHeader">
          <div className="title">Realtime Editor</div>
          <div className="meta">Room: {roomId} • Users: {clients.length}</div>
          <div style={{ marginLeft: 12 }}>
            <span style={{ padding: '4px 8px', borderRadius: 12, background: connectionStatus === 'connected' ? '#22c55e' : connectionStatus === 'connecting' ? '#f59e0b' : '#ef4444', color: '#fff', fontSize: 12 }}>
              {connectionStatus}
            </span>
          </div>
        </div>

        <Editor socket={socketInstance} roomId={roomId} joined={joined} onRegister={onRegister} />

        <div className="runControls">
          <label style={{ color: '#cbd5e1', marginRight: 8 }}>Language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, marginRight: 12 }}>
            <option value="javascript">JavaScript (Node)</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c">C</option>
            <option value="cpp">C++</option>
            <option value="bash">Shell</option>
          </select>
          <button className="btn syncBtn runBtn" onClick={handleRun}>Run</button>
          {runOutput && runOutput.running && <span className="runStatus">Running...</span>}
        </div>
        <div className="runOutputWrapper">
          {runOutput && runOutput.result && (
            <div className="runOutput">
              {runOutput.result.stdout && (
                <div className="run-section stdout">
                  <strong>stdout</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{runOutput.result.stdout}</pre>
                </div>
              )}
              {runOutput.result.stderr && (
                <div className="run-section stderr">
                  <strong>stderr</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{runOutput.result.stderr}</pre>
                </div>
              )}
              {runOutput.result.compileError && (
                <div className="run-section compile">
                  <strong>compile</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{runOutput.result.compileError}</pre>
                </div>
              )}
            </div>
          )}
          {runOutput && runOutput.error && <div className="runError">{runOutput.error}</div>}
        </div>
      </div>
    
    </div>
  );
};

export default EditorPage;
