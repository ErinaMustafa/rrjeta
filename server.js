// =============================
// SERVERI TCP në Node.js (me ADMIN password)
// =============================

const net = require('net');
const fs = require('fs');
const path = require('path');

const PORTI = 4000;
const IP_ADRESA = '0.0.0.0';
const MAKS_KLIENTE = 4;

// <-- Vendos fjalëkalimin e adminit këtu (ndrysho para dorëzimit)
/** Për student: ruajtja e fjalëkalimit në plaintext është e lejueshme për këtë projekt.
    Në prodhim duhet përdorur hash + konfigurim të sigurt. */
const ADMIN_PASSWORD = 'letmein';

if (!fs.existsSync('./server_files')) fs.mkdirSync('./server_files');

let klientet = [];
let statistika = {
    lidhjeAktive: 0,
    mesazhePerKlient: {},
    trafikuTotalBytes: 0,
};

setInterval(() => {
    let statsData = `📊 ${new Date().toLocaleString()}\n` +
        `Lidhje aktive: ${statistika.lidhjeAktive}\n` +
        `Trafik total: ${statistika.trafikuTotalBytes} bytes\n` +
        `------------------------------\n`;
    fs.writeFileSync('server_stats.txt', statsData);
}, 10000);

const server = net.createServer((socket) => {

    if (klientet.length >= MAKS_KLIENTE) {
        socket.write('Serveri është i mbushur. Prit pak...\n');
        socket.destroy();
        return;
    }

    const adresaKlientit = `${socket.remoteAddress}:${socket.remotePort}`;
    socket.isAdmin = false;
    socket.adminAttempts = 0; // numri i tentativave për fjalëkalim
    klientet.push(socket);
    statistika.lidhjeAktive++;
    statistika.mesazhePerKlient[adresaKlientit] = 0;

    console.log(`📶 Klient i ri u lidh: ${adresaKlientit}`);

    socket.setTimeout(30000);
    socket.on('timeout', () => {
        socket.write('⏱️ Nuk u dërgua asnjë mesazh për 30 sekonda, lidhja po mbyllet.\n');
        socket.destroy();
    });

    socket.on('data', (data) => {
        const mesazhi = data.toString().trim();
        statistika.trafikuTotalBytes += Buffer.byteLength(data);
        statistika.mesazhePerKlient[adresaKlientit]++;

        console.log(`💬 [${adresaKlientit}]: ${mesazhi}`);
        fs.appendFileSync('server_log.txt', `[${new Date().toISOString()}] ${adresaKlientit}: ${mesazhi}\n`);

        // Kontroll për komandën ADMIN me fjalëkalim:
        // Miraton formatin: "ADMIN <password>"
        if (mesazhi.toUpperCase().startsWith('ADMIN')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) {
                socket.write('🔒 Përdor: ADMIN <password>\n');
                return;
            }
            const provided = parts.slice(1).join(' ');
            socket.adminAttempts++;
            if (provided === ADMIN_PASSWORD) {
                socket.isAdmin = true;
                socket.write('✅ Identifikim si ADMIN u kry me sukses.\n');
                console.log(`🔐 Klienti ${adresaKlientit} u bë ADMIN`);
            } else {
                socket.write('❌ Fjalëkalim i pasaktë.\n');
                // Opsional: blloko pasi tre tentativat dështojnë
                if (socket.adminAttempts >= 3) {
                    socket.write('🚫 Shumë tentativë te pasakta. Lidhja po mbyllet.\n');
                    socket.destroy();
                }
            }
            return;
        }

        // STATS
        if (mesazhi === 'STATS') {
            let info = `📊 Statistika:\nLidhje aktive: ${statistika.lidhjeAktive}\nKlientë aktivë:\n`;
            for (let k of klientet) {
                let adr = `${k.remoteAddress}:${k.remotePort}`;
                info += `- ${adr} | Mesazhe: ${statistika.mesazhePerKlient[adr]}\n`;
            }
            info += `Trafik total: ${statistika.trafikuTotalBytes} bytes\n`;
            socket.write(info);
            return;
        }

        const adminCommands = ['/list', '/read', '/delete', '/upload', '/download', '/search', '/info'];
        if (adminCommands.some(cmd => mesazhi.startsWith(cmd)) && !socket.isAdmin) {
            socket.write('🚫 Nuk ke privilegje të mjaftueshme për këtë komandë. Përdor ADMIN <password> për t\'u identifikuar.\n');
            return;
        }

        // Komandat ekzistuese: /list, /read, /delete, /info, /upload, /search
        if (mesazhi.startsWith('/list')) {
            const files = fs.readdirSync('./server_files');
            socket.write('📁 File në server:\n' + files.join('\n') + '\n');

        } else if (mesazhi.startsWith('/read')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) return socket.write('❌ Përdorimi: /read <filename>\n');
            const filePath = path.join('./server_files', parts[1]);
            if (fs.existsSync(filePath)) {
                socket.write('📄 Përmbajtja:\n' + fs.readFileSync(filePath, 'utf8') + '\n');
            } else socket.write('❌ File nuk ekziston.\n');

        } else if (mesazhi.startsWith('/delete')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) return socket.write('❌ Përdorimi: /delete <filename>\n');
            const filePath = path.join('./server_files', parts[1]);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                socket.write('🗑️ File u fshi me sukses.\n');
            } else socket.write('❌ File nuk ekziston.\n');

        } else if (mesazhi.startsWith('/info')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) return socket.write('❌ Përdorimi: /info <filename>\n');
            const filePath = path.join('./server_files', parts[1]);
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                socket.write(`ℹ️ Madhësia: ${stats.size} bytes\nKrijuar më: ${stats.birthtime}\nModifikuar më: ${stats.mtime}\n`);
            } else socket.write('❌ File nuk ekziston.\n');

        } else if (mesazhi.startsWith('/upload')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) return socket.write('❌ Përdorimi: /upload <filename>\n');
            fs.writeFileSync(`./server_files/${parts[1]}`, 'Ky është një file i dërguar nga klienti.\n');
            socket.write('📤 File u ngarkua me sukses.\n');

        } else if (mesazhi.startsWith('/search')) {
            const parts = mesazhi.split(' ');
            if (parts.length < 2) return socket.write('❌ Përdorimi: /search <keyword>\n');
            const files = fs.readdirSync('./server_files');
            const results = files.filter(f => f.includes(parts[1]));
            socket.write(results.length ? '🔍 U gjetën:\n' + results.join('\n') : '❌ Asnjë file nuk u gjet.\n');

        } else if (mesazhi === 'PERSHENDETJE') {
            socket.write('👋 Serveri të përshëndet!\n');

        } else {
            if (socket.isAdmin) socket.write('✅ Mesazhi u pranua nga serveri. ⏩ (Admin)\n');
            else setTimeout(() => socket.write('✅ Mesazhi u pranua nga serveri.\n'), 1000);
        }
    });

    socket.on('end', () => {
        console.log(`❌ Klienti u shkëput: ${adresaKlientit}`);
        klientet = klientet.filter((k) => k !== socket);
        statistika.lidhjeAktive--;
    });

    socket.on('error', (err) => {
        console.log(`⚠️ Gabim me klientin ${adresaKlientit}: ${err.message}`);
    });
});

server.listen(PORTI, IP_ADRESA, () => {
    console.log(`🚀 Serveri është në punë në ${IP_ADRESA}:${PORTI}`);
});
