// =============================
// SERVERI TCP në Node.js
// =============================
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORTI = 4000;
const IP_ADRESA = '0.0.0.0';
const MAKS_KLIENTE = 4;

let klientet = [];
let klientetInfo = {}; // -> shtuar për të ruajtur rolin e çdo klienti

let statistika = {
    lidhjeAktive: 0,
    mesazhePerKlient: {},
    trafikuTotalBytes: 0,
};

const server = net.createServer((socket) => {
    if (klientet.length >= MAKS_KLIENTE) {
        socket.write('Serveri është i mbushur. Prit pak...\n');
        socket.destroy();
        return;
    }

    const adresaKlientit = `${socket.remoteAddress}:${socket.remotePort}`;
    klientet.push(socket);
    statistika.lidhjeAktive++;
    statistika.mesazhePerKlient[adresaKlientit] = 0;
    klientetInfo[adresaKlientit] = { roli: 'read' }; // default user

    console.log(`📶 Klient i ri u lidh: ${adresaKlientit}`);

    let kohaFunditMesazhit = Date.now();
    const kontrolloInaktivitetin = setInterval(() => {
        const tani = Date.now();
        const diferenca = (tani - kohaFunditMesazhit) / 1000;
        if (diferenca > 20) {
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

        // 🟢 HAPI 1: kontrollo nëse klienti dërgon HELLO për t’u identifikuar
        if (mesazhi.startsWith('HELLO')) {
            const parts = mesazhi.split(' ');
            const emri = parts[1] || 'Anon';
            const roli = parts[2] || 'read';
            klientetInfo[adresaKlientit] = { emri, roli };
            socket.write(`👋 Përshëndetje ${emri}! Roli yt është: ${roli}\n`);
            return;
        }

        // 🟢 Merr rolin e klientit për të ditur nëse është admin
        const roliKlientit = klientetInfo[adresaKlientit]?.roli || 'read';

        // 🟠 Vetëm admin mund të përdor komandat e plotë
        const vetemAdmin = ['/delete', '/info', '/upload', '/download', '/search'];

        if (roliKlientit !== 'admin' && vetemAdmin.some(k => mesazhi.startsWith(k))) {
            socket.write('⛔ Nuk ke leje për këtë komandë (vetëm admin mundet)\n');
            return;
        }

        // ========================
        // KOMANDAT E SERVERIT
        // ========================
        if (mesazhi === 'STATS') {
            let info = `📊 Statistika:\n`;
            info += `Lidhje aktive: ${statistika.lidhjeAktive}\n`;
            info += `Klientë aktivë:\n`;
            for (let k of klientet) {
                let adr = `${k.remoteAddress}:${k.remotePort}`;
                const r = klientetInfo[adr]?.roli || 'read';
                info += `- ${adr} | Roli: ${r} | Mesazhe: ${statistika.mesazhePerKlient[adr]}\n`;
            }
            info += `Trafik total: ${statistika.trafikuTotalBytes} bytes\n`;
            socket.write(info);
            return;
        }

        // ========================
        // KOMANDAT ADMIN/USER
        // ========================
        if (mesazhi.startsWith('/list')) {
            const files = fs.readdirSync('./server_files');
            socket.write('📁 File në server:\n' + files.join('\n') + '\n');
        } 
        else if (mesazhi.startsWith('/read')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) return socket.write('❌ Përdorimi: /read <filename>\n');
            const filePath = path.join('./server_files', parts[1]);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                socket.write('📄 Përmbajtja:\n' + content + '\n');
            } else socket.write('❌ File nuk ekziston.\n');
        }
        else if (mesazhi.startsWith('/delete')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) return socket.write('❌ Përdorimi: /delete <filename>\n');
            const filePath = path.join('./server_files', parts[1]);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                socket.write('🗑️ File u fshi me sukses.\n');
            } else socket.write('❌ File nuk ekziston.\n');
        }
        else if (mesazhi.startsWith('/info')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) return socket.write('❌ Përdorimi: /info <filename>\n');
            const filePath = path.join('./server_files', parts[1]);
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                socket.write(`ℹ️ Madhësia: ${stats.size} bytes\nKrijuar më: ${stats.birthtime}\nModifikuar më: ${stats.mtime}\n`);
            } else socket.write('❌ File nuk ekziston.\n');
        }
        else {
            socket.write('✅ Mesazhi u pranua nga serveri.\n');
        }
    });

    socket.on('error', (err) => {
        console.log(`⚠️ Gabim me klientin ${adresaKlientit}: ${err.message}`);
    });
});

server.listen(PORTI, IP_ADRESA, () => {
    console.log(`🚀 Serveri është në punë në ${IP_ADRESA}:${PORTI}`);
});
