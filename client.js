// client.js
// Usage: node client.js <SERVER_HOST> <PORT> <NAME> <ROLE>
// Example: node client.js 127.0.0.1 9000 Erisa admin
// ROLE: admin or read

const net = require('net');
const fs = require('fs');
const path = require('path');

const SERVER = process.argv[2] || '127.0.0.1';
const PORT = parseInt(process.argv[3],10) || 9000;
const NAME = process.argv[4] || 'Anon';
const ROLE = (process.argv[5] || 'read').toLowerCase();

const socket = new net.Socket();

socket.connect(PORT, SERVER, () => {
  console.log('Connected to server', SERVER+':'+PORT);
  // introduce
  socket.write(`HELLO ${NAME} ${ROLE}\n`);
  showPrompt();
});

socket.on('data', (buf) => {
  const txt = buf.toString().trim();
  // Handle server messages for downloads or filedata
  if (txt.startsWith('FILEDATA ')) {
    // FILEDATA <filename> <base64>
    const parts = txt.split(' ');
    const filename = parts[1];
    const b64 = parts.slice(2).join(' ');
    const out = Buffer.from(b64,'base64');
    fs.writeFileSync(path.join('downloads', filename), out);
    console.log(`Saved received file ${filename} to downloads/`);
    return;
  }
  if (txt.startsWith('DOWNLOAD ')) {
    const parts = txt.split(' ');
    const filename = parts[1];
    const b64 = parts.slice(2).join(' ');
    if (!fs.existsSync('downloads')) fs.mkdirSync('downloads');
    fs.writeFileSync(path.join('downloads', filename), Buffer.from(b64,'base64'));
    console.log(`Downloaded ${filename} -> downloads/${filename}`);
    return;
  }
  console.log('SERVER:', txt);
});

socket.on('close', () => {
  console.log('Connection closed by server');
});

socket.on('error', (err) => {
  console.error('Socket error', err.message);
});

// Simple CLI to send commands
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function showPrompt(){
  rl.question('> ', async (line) => {
    const parts = line.trim().split(' ');
    const cmd = parts[0].toUpperCase();

    if (cmd === '/UPLOAD') {
      // /upload <localpath> <remotefilename>
      const local = parts[1];
      const remote = parts[2] || path.basename(local || '');
      if (!local) { console.log('Usage: /upload <localpath> [remotename]'); return showPrompt(); }
      if (!fs.existsSync(local)) { console.log('Local file not found'); return showPrompt(); }
      const data = fs.readFileSync(local);
      const b64 = data.toString('base64');
      socket.write(`UPLOAD ${remote} ${b64}\n`);
      console.log('Uploading...');
      return showPrompt();
    }

    if (cmd === '/DOWNLOAD') {
      // /download <remotefilename>
      const filename = parts[1];
      if (!filename) { console.log('Usage: /download <filename>'); return showPrompt(); }
      socket.write(`DOWNLOAD ${filename}\n`);
      return showPrompt();
    }

    // other commands: LIST, READ, DELETE, SEARCH, INFO, MSG, /SERVERSTATS
    if (['/LIST','/READ','/DELETE','/SEARCH','/INFO','/SERVERSTATS','LIST','READ','DELETE','SEARCH','INFO'].includes(cmd)) {
      socket.write(line + '\n');
      return showPrompt();
    }

    if (cmd === 'MSG') {
      // send a chat message: MSG text...
      socket.write(line + '\n');
      return showPrompt();
    }

    if (cmd === 'EXIT') {
      socket.end();
      rl.close();
      return;
    }

    console.log('Unknown command. Examples: /list, /read <file>, /upload <local> <remote>, /download <file>, /delete <file>, /search <keyword>, /info <file>, MSG <text>');
    showPrompt();
  });
}
