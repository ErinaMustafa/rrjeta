// =============================
// SERVERI TCP në Node.js
// =============================

// Marrim librarinë 'net' që na mundëson të punojmë me socket
const net = require('net');
const fs = require('fs');
const path = require('path');

// Variablat kryesore të serverit
const PORTI = 4000;           // numri i portit ku do dëgjojë serveri
const IP_ADRESA = '0.0.0.0';  // mundëson lidhje nga çdo pajisje në rrjet

// Kufiri maksimal i klientëve që mund të lidhen në të njëjtën kohë
const MAKS_KLIENTE = 4;

// Objekt për me mbajt info për çdo klient
let klientet = [];

// Monitorim statistikor për STATS
let statistika = {
    lidhjeAktive: 0,
    mesazhePerKlient: {},
    trafikuTotalBytes: 0,
};

// Krijo serverin
const server = net.createServer((socket) => {
    // Kontrollo nëse ka vende të lira
    if (klientet.length >= MAKS_KLIENTE) {
        socket.write('Serveri është i mbushur. Prit pak...\n');
        socket.destroy();
        return;
    }

    // Regjistro klientin
    const adresaKlientit = `${socket.remoteAddress}:${socket.remotePort}`;
    klientet.push(socket);
    statistika.lidhjeAktive++;
    statistika.mesazhePerKlient[adresaKlientit] = 0;

    console.log(`📶 Klient i ri u lidh: ${adresaKlientit}`);
    // Vendos timeout për mosaktivitet
let kohaFunditMesazhit = Date.now();

// Kontrollo çdo 5 sekonda nëse klienti është inaktiv
const kontrolloInaktivitetin = setInterval(() => {
    const tani = Date.now();
    const diferenca = (tani - kohaFunditMesazhit) / 1000; // në sekonda

    if (diferenca > 20) { // nëse s’ka dërgu asgjë për 20 sekonda
        socket.write('⏰ Nuk ke dërguar mesazhe për 20 sekonda. Lidhja po mbyllet.\n');
        console.log(`🕒 Klienti ${adresaKlientit} u mbyll për mosaktivitet.`);
        socket.end();
        clearInterval(kontrolloInaktivitetin);
    }
}, 5000);

    // Kur serveri pranon të dhëna nga klienti
    socket.on('data', (data) => {
        const mesazhi = data.toString().trim();
        statistika.trafikuTotalBytes += Buffer.byteLength(data);
        statistika.mesazhePerKlient[adresaKlientit]++;
        kohaFunditMesazhit = Date.now();

        console.log(`💬 [${adresaKlientit}]: ${mesazhi}`);

        // Kontrollo nëse është komandë speciale
        if (mesazhi === 'STATS') {
            let info = `📊 Statistika:\n`;
            info += `Lidhje aktive: ${statistika.lidhjeAktive}\n`;
            info += `Klientë aktivë:\n`;
            for (let k of klientet) {
                let adr = `${k.remoteAddress}:${k.remotePort}`;
                info += `- ${adr} | Mesazhe: ${statistika.mesazhePerKlient[adr]}\n`;
            }
            info += `Trafik total: ${statistika.trafikuTotalBytes} bytes\n`;
            socket.write(info);
            return;
        }

        // Komanda për qasje në file – ADMIN
        if (mesazhi.startsWith('/list')) {
            const files = fs.readdirSync('./server_files');
            socket.write('📁 File në server:\n' + files.join('\n') + '\n');
        } else if (mesazhi.startsWith('/read')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) {
                socket.write('❌ Përdorimi: /read <filename>\n');
                return;
            }
            const filePath = path.join('./server_files', parts[1]);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                socket.write('📄 Përmbajtja:\n' + content + '\n');
            } else {
                socket.write('❌ File nuk ekziston.\n');
            }
        } else if (mesazhi.startsWith('/delete')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) {
                socket.write('❌ Përdorimi: /delete <filename>\n');
                return;
            }
            const filePath = path.join('./server_files', parts[1]);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                socket.write('🗑️ File u fshi me sukses.\n');
            } else {
                socket.write('❌ File nuk ekziston.\n');
            }
        } else if (mesazhi.startsWith('/info')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) {
                socket.write('❌ Përdorimi: /info <filename>\n');
                return;
            }
            const filePath = path.join('./server_files', parts[1]);
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                socket.write(
                    `ℹ️ Madhësia: ${stats.size} bytes\nKrijuar më: ${stats.birthtime}\nModifikuar më: ${stats.mtime}\n`
                );
            } else {
                socket.write('❌ File nuk ekziston.\n');
            }
        } else if (mesazhi === 'PERSHENDETJE') {
            socket.write('👋 Serveri të përshëndet!\n');
        } else {
            // Nëse është mesazh normal
            socket.write('✅ Mesazhi u pranua nga serveri.\n');
        }
    });

    

    // Në rast gabimi
    socket.on('error', (err) => {
        console.log(`⚠️ Gabim me klientin ${adresaKlientit}: ${err.message}`);
    });
});

// Dëgjo lidhjet
server.listen(PORTI, IP_ADRESA, () => {
    console.log(`🚀 Serveri është në punë në ${IP_ADRESA}:${PORTI}`);
});
