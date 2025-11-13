// =============================
// KLIENTI TCP në Node.js (me prompt për ADMIN password)
// =============================

const net = require('net');
const readline = require('readline');

const SERVER_IP = '127.0.0.1'; // ndrysho me IP-në reale të serverit
const SERVER_PORT = 4000;

const klient = new net.Socket();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

klient.connect(SERVER_PORT, SERVER_IP, () => {
    console.log('✅ Lidhja me server u kry me sukses!');
    console.log('Shkruaj "ADMIN" për të hyrë si admin (do të kërkohet fjalëkalimi), ose shkruaj mesazh normal:');
});

klient.on('data', (data) => {
    console.log(`📨 Nga serveri: ${data.toString()}`);
});

klient.on('close', () => {
    console.log('🔌 Lidhja me serverin u mbyll.');
    process.exit(0);
});

klient.on('error', (err) => {
    console.log('⚠️ Gabim: ' + err.message);
});

// Kur përdoruesi shtyp line
rl.on('line', (input) => {
    const trimmed = input.trim();
    if (trimmed.toUpperCase() === 'ADMIN') {
        // kërko fjalëkalimin në mënyrë interaktive
        rl.question('Fjalëkalimi i adminit: ', (pwd) => {
            klient.write(`ADMIN ${pwd}`);
        });
    } else {
        // mund të lejojmë edhe formatin ADMIN <pwd> direkt
        klient.write(input);
    }
});
