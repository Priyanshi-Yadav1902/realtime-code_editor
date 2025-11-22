

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const ACTIONS = require('./src/Actions');


const app = express();
const server = http.createServer(app);
app.use(cors());
app.use(express.json());


const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST"],
  },
});

const userSocketMap = {};
const roomData = {};


const getAllConnectedClients = (roomId) => {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => ({
      socketId,
      username: userSocketMap[socketId],
    })
  );
};


const recipientsSummary = (clients) => {
  try {
    return clients.map(c => `${c.username || 'unknown'}@${c.socketId}`).join(', ');
  } catch (e) { return JSON.stringify(clients || []); }
};


io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.id);

 
  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    console.log(`🔗 ${socket.id} -> ${ACTIONS.JOIN} room=${roomId} user=${username}`);
    userSocketMap[socket.id] = username;
    socket.join(roomId);

    const clients = getAllConnectedClients(roomId);

   
    if (roomData[roomId]) {
      
      socket.emit(ACTIONS.SYNC_CODE, roomData[roomId]);
      console.log(`↩ Sent ${ACTIONS.SYNC_CODE} to ${socket.id}`);
    }

    const { code, language } = roomData[roomId] || {};
    clients.forEach(({ socketId }) => {
      io.to(socketId).emit(ACTIONS.JOINED, {
        clients,
        username,
        socketId: socket.id,
        code,
        language,
      });
    });
    
    try {
      io.to(socket.id).emit('join_ack', { success: true, roomId, username });
      console.log(`↪ join_ack sent to ${socket.id}`);
    } catch (e) {
      console.error('Failed to send join_ack', e);
    }
  });

 
  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
      console.log(`⚠️ Emitted ${ACTIONS.DISCONNECTED} for ${socket.id} in ${roomId}`);
    });
    delete userSocketMap[socket.id];
  });

 
  const handleCodeChange = ({ roomId, code }) => {
    try {
      console.log(`📝 ${socket.id} -> code-change room=${roomId} len=${(code||'').length}`);
      roomData[roomId] = { ...(roomData[roomId] || {}), code };
  
      try {
        const clientsForRoom = getAllConnectedClients(roomId);
        const recipientIds = clientsForRoom.map(c => c.socketId);
        console.log(`↪️ Forwarding ${ACTIONS.SYNC_CODE} to ${recipientIds.length} recipients:`, recipientsSummary(clientsForRoom));
      } catch (e) {
        console.error('Error building recipients list', e);
      }
  
  socket.in(roomId).emit(ACTIONS.SYNC_CODE, { code});
  try { console.log(`↪️ Broadcasted ${ACTIONS.SYNC_CODE} from ${socket.id} to room ${roomId} (excluding sender)`); } catch (e) {}
    } catch (e) { console.error('Error handling code-change', e); }
  };

 
  socket.on(ACTIONS.CODE_CHANGE, handleCodeChange);
  socket.on('code-change', handleCodeChange);

 
  socket.on(ACTIONS.LANGUAGE_CHANGE, ({ roomId, language }) => {
    console.log(`🌐 ${socket.id} -> ${ACTIONS.LANGUAGE_CHANGE} room=${roomId} lang=${language}`);
    roomData[roomId] = { ...(roomData[roomId] || {}), language };
    socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, { language });
  });

  socket.on('provide_code', ({ toSocketId, code, roomId }) => {
    console.log(` ${socket.id} -> provide_code room=${roomId} to=${toSocketId}`);
    io.to(toSocketId).emit('provide_code', { code, roomId });
  });

  socket.on('run_result', ({ roomId, result }) => {
    console.log(` ${socket.id} -> run_result room=${roomId}`);
    io.in(roomId).emit('run_result', { result });
  });

  
  socket.on('get_clients', ({ roomId }) => {
    try {
      const clients = getAllConnectedClients(roomId);
      io.to(socket.id).emit(ACTIONS.JOINED, {
        clients,
        username: userSocketMap[socket.id] || socket.username,
        socketId: socket.id,
      });
      console.log(` get_clients for ${socket.id} in ${roomId}`);
    } catch (e) { console.error(e); }
  });

});



app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});


app.post("/run", async (req, res) => {
  try {
    const { language, code } = req.body;
    if (!language || !code) {
      return res.status(400).json({ error: "language and code required" });
    }

    const tmpDir = os.tmpdir();
    const id = Date.now() + "_" + Math.floor(Math.random() * 10000);
    let srcPath, runCmd, runArgs = [];

    
    const tryFind = (candidates) => {
      for (const c of candidates) {
        try {
          const r = spawnSync(c, ["--version"], { stdio: "ignore" });
          if (r.status === 0) return c;
        } catch (e) {}
      }
      return null;
    };

    
    const lang = (language || '').toLowerCase();
    const cleanupPaths = [];

    if (["js", "javascript", "node"].includes(lang)) {
      srcPath = path.join(tmpDir, `run_${id}.js`);
      fs.writeFileSync(srcPath, code, "utf8");
      cleanupPaths.push(srcPath);
      runCmd = process.execPath;
      runArgs = [srcPath];

    } else if (["py", "python"].includes(lang)) {
      srcPath = path.join(tmpDir, `run_${id}.py`);
      fs.writeFileSync(srcPath, code, "utf8");
      cleanupPaths.push(srcPath);
      const py = tryFind(["python3", "python"]);
      if (!py) return res.status(400).json({ error: "python not found", socketId: req.body.socketId || null, requestIp: req.ip });
      runCmd = py;
      runArgs = [srcPath];

    } else if (["sh", "bash"].includes(lang)) {
      srcPath = path.join(tmpDir, `run_${id}.sh`);
      fs.writeFileSync(srcPath, code, "utf8");
      try { fs.chmodSync(srcPath, 0o755); } catch (e) {}
      cleanupPaths.push(srcPath);
      const sh = tryFind(["bash", "sh"]);
      if (!sh) return res.status(400).json({ error: "shell not available", socketId: req.body.socketId || null, requestIp: req.ip });
      runCmd = sh;
      runArgs = [srcPath];

    } else if (["cpp", "c++"].includes(lang)) {
      srcPath = path.join(tmpDir, `run_${id}.cpp`);
      const exePath = path.join(tmpDir, `run_${id}.out`);
      fs.writeFileSync(srcPath, code, "utf8");
      cleanupPaths.push(srcPath);
      cleanupPaths.push(exePath);
      const gpp = tryFind(["g++", "clang++"]);
      if (!gpp) return res.status(400).json({ error: "C++ compiler not found", socketId: req.body.socketId || null, requestIp: req.ip });
      const compile = spawnSync(gpp, [srcPath, "-O2", "-std=c++17", "-o", exePath]);
      if (compile.error || compile.status !== 0) {
        return res.json({ compileError: compile.stderr?.toString() || String(compile.error), socketId: req.body.socketId || null, requestIp: req.ip });
      }
      runCmd = exePath;

    } else if (["c"].includes(lang)) {
      srcPath = path.join(tmpDir, `run_${id}.c`);
      const exePath = path.join(tmpDir, `run_${id}.out`);
      fs.writeFileSync(srcPath, code, "utf8");
      cleanupPaths.push(srcPath);
      cleanupPaths.push(exePath);
      const gcc = tryFind(["gcc", "clang"]);
      if (!gcc) return res.status(400).json({ error: "C compiler not found", socketId: req.body.socketId || null, requestIp: req.ip });
      const compile = spawnSync(gcc, [srcPath, "-O2", "-std=c11", "-o", exePath]);
      if (compile.error || compile.status !== 0) {
        return res.json({ compileError: compile.stderr?.toString() || String(compile.error), socketId: req.body.socketId || null, requestIp: req.ip });
      }
      runCmd = exePath;

    } else if (["java", "jav"].includes(lang)) {
    
      const className = 'Main';
      srcPath = path.join(tmpDir, `${className}.java`);
      fs.writeFileSync(srcPath, code, "utf8");
      cleanupPaths.push(srcPath);
      const javac = tryFind(["javac"]);
      const javaCmd = tryFind(["java"]);
      if (!javac || !javaCmd) return res.status(400).json({ error: "Java (javac/java) not found", socketId: req.body.socketId || null, requestIp: req.ip });
      const compile = spawnSync(javac, [srcPath]);
      if (compile.error || compile.status !== 0) {
        return res.json({ compileError: compile.stderr?.toString() || String(compile.error), socketId: req.body.socketId || null, requestIp: req.ip });
      }
      runCmd = javaCmd;
      runArgs = ['-cp', tmpDir, className];

    } else {
      return res.status(400).json({ error: "Unsupported language", socketId: req.body.socketId || null, requestIp: req.ip });
    }

    
    const child = spawn(runCmd, runArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const killTimer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch (e) {}
    }, 5000);

    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));

    child.on("close", (code) => {
      clearTimeout(killTimer);
      res.json({ stdout, stderr, exitCode: code });
    });

  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});


const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(` Server running on http://${HOST}:${PORT}`);
});
