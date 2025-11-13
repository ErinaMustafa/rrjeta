// server.js
// Usage: node server.js [HOST] [PORT] [CONNECTION_LIMIT]
// Example: node server.js 0.0.0.0 9000 6

const net = require('net');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const HOST = process.argv[2] || '0.0.0.0';
const PORT = parseInt(process.argv[3],10) || 9000;
const CONNECTION_LIMIT = parseInt(process.argv[4],10) || 6;
const INACTIVITY_MS = 2 * 60 * 1000; // 2 minutes inactivity timeout (mund ta ndryshoni)
const STATS_FILE = 'server_stats.txt';
const LOG_FILE = 'server_logs.txt';
const FILES_DIR = path.join(__dirname,'files');

// Siguro folderin files ekziston
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR);

let clients = {}; // clientId -> { socket, ip, bytesIn, bytesOut, messages, role, lastActive }
let queue = []; // sockets në pritje
let totalBytesIn = 0;
let totalBytesOut = 0;

// ndihmëse
function clientIdForSocket(s) {
  return `${s.remoteAddress}:${s.remotePort}`;
}

function writeLog(line) {
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function updateStatsFile() {
  const active = Object.keys(clients).length;
  const ips = Object.values(clients).map(c => c.ip);
  const perClient = Object.entries(clients).map(([id,c])=>{
    return `${id} msgs=${c.messages} in=${c.bytesIn} out=${c.bytesOut}`;
  }).join('\n');
  const txt = [
    `TIME: ${new Date().toISOString()}`,
    `Active connections: ${active}`,
    `Active IPs: ${ips.join(',')}`,
    `Total bytes in: ${totalBytesIn}`,
    `Total bytes out: ${totalBytesOut}`,
    `Per-client:`,
    perClient
  ].join('\n');
  fs.writeFileSync(STATS_FILE, txt);
}

// STATS command via server terminal
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (input)=> {
  if (input.trim().toUpperCase() === 'STATS') {
    console.log('----- SERVER STATS -----');
    console.log(fs.readFileSync(STATS_FILE,'utf8'));
  } else if (input.trim().toUpperCase() === 'EXIT') {
    console.log('Shutting down server...');
    process.exit(0);
  }
});

// helper: send message to socket and update bytes
function sendToSocket(socket, str) {
  if (!socket || socket.destroyed) return;
  socket.write(str + '\n');
  const id = clientIdForSocket(socket);
  if (clients[id]) {
    clients[id].bytesOut += Buffer.byteLength(str + '\n');
    totalBytesOut += Buffer.byteLength(str + '\n');
  }
}

// handle queued sockets when slot lëshohet
function tryProcessQueue() {
  while (Object.keys(clients).length < CONNECTION_LIMIT && queue.length > 0) {
    const s = queue.shift();
    acceptConnection(s);
  }
}

function acceptConnection(socket) {
  const id = clientIdForSocket(socket);
  clients[id] = {
    socket,
    ip: socket.remoteAddress,
    bytesIn: 0,
    bytesOut: 0,
    messages: 0,
    role: 'read', // default role; client can request admin on connect
    lastActive: Date.now()
  };
  sendToSocket(socket, 'WELCOME Please send "HELLO <name> <role>" e.g. HELLO Erisa admin');
  writeLog(`[${new Date().toISOString()}] CONNECT ${id}`);
  console.log(`Accepted: ${id}. Active: ${Object.keys(clients).length}`);
  setupSocketHandlers(socket);
  updateStatsFile();
}

const server = net.createServer((socket) => {
  // New connection arrives
  const id = clientIdForSocket(socket);
  console.log('Incoming connection from', id);

  if (Object.keys(clients).length >= CONNECTION_LIMIT) {
    // put in queue or refuse
    queue.push(socket);
    sendToSocket(socket, 'BUSY Server busy - you are in queue. Wait or try later.');
    console.log('Queued connection', id, 'Queue length', queue.length);
    return;
  } else {
    acceptConnection(socket);
  }
});

function setupSocketHandlers(socket) {
  const id = clientIdForSocket(socket);

  // timeout for inactivity
  socket.setTimeout(INACTIVITY_MS);
  socket.on('timeout', ()=> {
    writeLog(`[${new Date().toISOString()}] TIMEOUT ${id}`);
    sendToSocket(socket, 'TIMEOUT You were inactive. Closing connection.');
    socket.end();
  });

  socket.on('data', (buf) => {
    const now = Date.now();
    const s = clients[id];
    if (!s) return; // maybe already closed
    s.lastActive = now;
    s.bytesIn += buf.length;
    totalBytesIn += buf.length;
    let text = buf.toString().trim();
    s.messages++;
    writeLog(`[${new Date().toISOString()}] FROM ${id}: ${text}`);
    // messages can contain multiple lines; handle only first command per data chunk for simplicity
    handleClientCommand(socket, text);
    updateStatsFile();
  });

  socket.on('close', ()=> {
    const has = clients[id];
    if (has) {
      writeLog(`[${new Date().toISOString()}] DISCONNECT ${id}`);
      delete clients[id];
      console.log(`Disconnected ${id}. Active: ${Object.keys(clients).length}`);
    } else {
      console.log(`Queue/closed ${id}`);
    }
    tryProcessQueue();
    updateStatsFile();
  });

  socket.on('error', (err)=> {
    writeLog(`[${new Date().toISOString()}] ERROR ${id}: ${err.message}`);
  });
}

function handleClientCommand(socket, line) {
  const id = clientIdForSocket(socket);
  const client = clients[id];
  if (!client) { sendToSocket(socket, 'ERROR unknown client'); return; }

  // Basic priority: respond faster to admin
  const respond = (msg) => {
    if (client.role === 'admin') {
      sendToSocket(socket, msg);
    } else {
      // simulate slight delay for read-only users (to give admin faster responses)
      setTimeout(()=> sendToSocket(socket, msg), 200);
    }
  };

  const parts = line.split(' ');
  const cmd = parts[0].toUpperCase();

  // HELLO <name> <role>
  if (cmd === 'HELLO') {
    const name = parts[1] || 'Anon';
    const role = (parts[2] || 'read').toLowerCase();
    if (role === 'admin') {
      client.role = 'admin';
      respond(`OK Hello ${name}. You are set as ADMIN.`);
    } else {
      client.role = 'read';
      respond(`OK Hello ${name}. You are set as READ-only.`);
    }
    updateStatsFile();
    return;
  }

  // SIMPLE CHAT
  if (cmd === 'MSG') {
    const msg = line.slice(4);
    writeLog(`[CHAT] ${id}: ${msg}`);
    respond('MSG_RECEIVED');
    return;
  }

  // ADMIN COMMANDS (require role admin)
  if (cmd === '/LIST' || cmd === 'LIST') {
    // list files in files dir
    fs.readdir(FILES_DIR, (err, files) => {
      if (err) return respond('ERROR reading files');
      respond('FILES ' + files.join(', '));
    });
    return;
  }

  if (cmd === '/READ' || cmd === 'READ') {
    const filename = parts[1];
    if (!filename) return respond('USAGE: READ <filename>');
    const p = path.join(FILES_DIR, path.basename(filename));
    fs.readFile(p, 'utf8', (err, data) => {
      if (err) return respond('ERROR reading file');
      // send as base64 if binary; here as utf8 text
      respond(`FILEDATA ${filename} ${Buffer.from(data,'utf8').toString('base64')}`);
    });
    return;
  }

  if (cmd === '/UPLOAD' || cmd === 'UPLOAD') {
    // Protocol: client sends "UPLOAD filename <base64data>"
    const filename = parts[1];
    const base64 = parts.slice(2).join(' ');
    if (!filename || !base64) return respond('USAGE: UPLOAD <filename> <base64data>');
    const p = path.join(FILES_DIR, path.basename(filename));
    fs.writeFile(p, Buffer.from(base64,'base64'), (err)=>{
      if (err) return respond('ERROR writing file');
      respond('UPLOAD_OK ' + filename);
      updateStatsFile();
    });
    return;
  }

  if (cmd === '/DOWNLOAD' || cmd === 'DOWNLOAD') {
    const filename = parts[1];
    if (!filename) return respond('USAGE: DOWNLOAD <filename>');
    const p = path.join(FILES_DIR, path.basename(filename));
    fs.readFile(p, (err, data)=>{
      if (err) return respond('ERROR file not found');
      const b64 = data.toString('base64');
      respond(`DOWNLOAD ${filename} ${b64}`);
    });
    return;
  }

  if (cmd === '/DELETE' || cmd === 'DELETE') {
    if (client.role !== 'admin') return respond('ERROR permission denied');
    const filename = parts[1];
    if (!filename) return respond('USAGE: DELETE <filename>');
    const p = path.join(FILES_DIR, path.basename(filename));
    fs.unlink(p, (err)=>{
      if (err) return respond('ERROR deleting file');
      respond('DELETE_OK ' + filename);
      updateStatsFile();
    });
    return;
  }

  if (cmd === '/SEARCH' || cmd === 'SEARCH') {
    const keyword = parts[1];
    if (!keyword) return respond('USAGE: SEARCH <keyword>');
    fs.readdir(FILES_DIR, (err, files)=>{
      if (err) return respond('ERROR reading files');
      const matched = files.filter(f => f.includes(keyword));
      respond('SEARCH_RESULTS ' + matched.join(','));
    });
    return;
  }

  if (cmd === '/INFO' || cmd === 'INFO') {
    const filename = parts[1];
    if (!filename) return respond('USAGE: INFO <filename>');
    const p = path.join(FILES_DIR, path.basename(filename));
    fs.stat(p, (err, st)=>{
      if (err) return respond('ERROR file not found');
      respond(`INFO ${filename} size=${st.size} created=${st.birthtime.toISOString()} modified=${st.mtime.toISOString()}`);
    });
    return;
  }

  // ADMIN-level control: STATS request from client
  if (cmd === '/SERVERSTATS') {
    respond(fs.readFileSync(STATS_FILE,'utf8'));
    return;
  }

  // Unknown
  respond('ERROR unknown command');
}

// periodic stats update
setInterval(updateStatsFile, 10 * 1000); // çdo 10s

server.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
  writeLog(`[${new Date().toISOString()}] SERVER START ${HOST}:${PORT}`);
  updateStatsFile();
});
