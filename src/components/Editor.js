import React, { useEffect, useRef } from 'react';
import ACTIONS from '../Actions';

import Codemirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/theme/dracula.css';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';

 



let __realtimeEditorCreated = false;

const Editor = ({ socket, roomId, joined, onRegister }) => {
  const textareaRef = useRef(null);
  const cmRef = useRef(null);
  const createdByThisInstance = useRef(false);
  const emitTimeoutRef = useRef(null);
  const socketPropRef = useRef(socket);
  const joinedPropRef = useRef(joined);

  
  useEffect(() => {
    if (!textareaRef.current) return;
    if (cmRef.current) return;
    if (__realtimeEditorCreated) return;

    const cm = Codemirror.fromTextArea(textareaRef.current, {
      mode: { name: 'javascript', json: true },
      theme: 'dracula',
      autoCloseTags: true,
      autoCloseBrackets: true,
      lineNumbers: true,
      readOnly: false,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
    });

    cm.setSize('100%', '100%');
    if (!cm.getValue()) cm.setValue('');
    try { cm.focus(); cm.setCursor(cm.lastLine(), 0); } catch (e) {}

    cm.on('change', (instance, changes) => {
      if (changes.origin !== 'setValue') {
        const code = instance.getValue();
        try {
          try {
            if (window && window.__RT_DEBUG) {
              console.debug('EDITOR CHANGE', { origin: changes.origin, from: changes.from, to: changes.to, textLen: (code||'').length, joined: !!joinedPropRef.current, hasSocket: !!socketPropRef.current });
            }
          } catch (e) {}

          const activeSocket = socketPropRef.current;
          const activeJoined = joinedPropRef.current;
          if (activeSocket && activeJoined) {
            if (emitTimeoutRef.current) clearTimeout(emitTimeoutRef.current);
            emitTimeoutRef.current = setTimeout(() => {
              try {
                try { console.debug('EMIT: ACTIONS.CODE_CHANGE', { roomId, len: (code||'').length, socketId: activeSocket && activeSocket.id }); } catch (e) {}
                activeSocket.emit(ACTIONS.CODE_CHANGE, { roomId, code });
                try { activeSocket.emit('code-change', { roomId, code }); } catch (e) {}
              } catch (e) { console.error('emit error', e); }
              emitTimeoutRef.current = null;
            }, 300);
          }
        } catch (e) {}
        
      }
    });

    cmRef.current = cm;
    createdByThisInstance.current = true;
    __realtimeEditorCreated = true;

  
    try {
      if (typeof onRegister === 'function') {
        onRegister(() => (cmRef.current ? cmRef.current.getValue() : ''));
      }
    } catch (e) {}

    return () => {
      if (createdByThisInstance.current && cmRef.current) {
        try { cmRef.current.toTextArea(); } catch (e) {}
        cmRef.current = null;
        createdByThisInstance.current = false;
        __realtimeEditorCreated = false;
      }
      try {
        if (typeof onRegister === 'function') onRegister(null);
      } catch (e) {}
      if (emitTimeoutRef.current) {
        clearTimeout(emitTimeoutRef.current);
        emitTimeoutRef.current = null;
      }
    };
  }, []); 
  useEffect(() => {
    if (!socket) return;
    socketPropRef.current = socket;
    joinedPropRef.current = joined;
  }, [socket, joined]);

  
  useEffect(() => {
    socketPropRef.current = socket;
    joinedPropRef.current = joined;
    
    const handleIncomingCode = (payload) => {
      try {
        const { code, fromSocketId } = payload || {};
        
        try { if (fromSocketId && socket && socket.id === fromSocketId) { console.debug('IGNORING own SYNC_CODE'); return; } } catch (e) {}
        if (cmRef.current && typeof code === 'string') {
          try { console.debug('RECV: ACTIONS.SYNC_CODE len=', (code||'').length, 'from=', fromSocketId); } catch (e) {}
          
          if (cmRef.current.getValue() !== code) cmRef.current.setValue(code);
        }
      } catch (e) { console.error('handleIncomingCode error', e); }
    };

    
    const handleRequestCode = ({ toSocketId, roomId: reqRoom }) => {
      try {
        const code = cmRef.current ? cmRef.current.getValue() : '';
        if (socket && toSocketId) {
        
          socket.emit('provide_code', { toSocketId, code, roomId: reqRoom });
        }
      } catch (e) { console.error('handleRequestCode error', e); }
    };

  socket && socket.on && socket.on(ACTIONS.SYNC_CODE, handleIncomingCode);
  
  socket && socket.on && socket.on('sync-code', handleIncomingCode);
  socket && socket.on && socket.on('request_code', handleRequestCode);

    const handleProvideCode = ({ fromSocketId, code, roomId: reqRoom }) => {
      try {
        
        if (typeof code === 'string' && cmRef.current) {
          if (cmRef.current.getValue() !== code) cmRef.current.setValue(code);
        }
      } catch (e) { console.error('handleProvideCode error', e); }
    };
  socket && socket.on && socket.on('provide_code', handleProvideCode);

    return () => {
  try { socket && socket.off && socket.off(ACTIONS.SYNC_CODE, handleIncomingCode); } catch (e) {}
  try { socket && socket.off && socket.off('sync-code', handleIncomingCode); } catch (e) {}
  try { socket && socket.off && socket.off('request_code', handleRequestCode); } catch (e) {}
  try { socket && socket.off && socket.off('provide_code', handleProvideCode); } catch (e) {}
    };
  }, [socket, joined, roomId, onRegister]);

  return (
    <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
      <textarea id="realtimeEditor" ref={textareaRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}

export default Editor;
