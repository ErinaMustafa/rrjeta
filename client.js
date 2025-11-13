// =============================
// KLIENTI TCP në Node.js
// =============================

const net = require('net');
const readline = require('readline');

// Vendos IP dhe portin e serverit
const SERVER_IP = '0.0.0.0'; // ndrysho me IP-në reale të serverit
const SERVER_PORT = 4000;

// Krijo socket-in për lidhje
const klient = new net.Socket();

// Lexim nga terminali
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Lidhja me server
klient.connect(SERVER_PORT, SERVER_IP, () => {
    console.log('✅ Lidhja me server u kry me sukses!');
    console.log('Shkruaj komandë ose mesazh:');
});

// Kur pranohet përgjigje nga serveri
klient.on('data', (data) => {
    console.log(`📨 Nga serveri: ${data.toString()}`);
});

// Nëse lidhja mbyllet
klient.on('close', () => {
    console.log('🔌 Lidhja me serverin u mbyll.');
});

// Nëse ndodh gabim
klient.on('error', (err) => {
    console.log('⚠️ Gabim: ' + err.message);
});

// Lexo çdo rresht nga përdoruesi dhe dërgo te serveri
rl.on('line', (input) => {
    klient.write(input);
});
