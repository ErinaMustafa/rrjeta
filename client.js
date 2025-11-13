const net = require('net');
const readline = require('readline');

const PORT = 6000;
const HOST = '192.168.1.100'; // ← IP e laptopit ku është serveri (ndryshoje këtë)

const client = new net.Socket();

client.connect(PORT, HOST, () => {
  console.log(`✅ Connected to server at ${HOST}:${PORT}`);
});

client.on('data', (data) => {
  console.log('📩 ' + data.toString());
});

client.on('close', () => {
  console.log('❌ Connection closed');
});

client.on('error', (err) => {
  console.error('⚠️ Error:', err.message);
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on('line', (input) => {
  client.write(input);
});