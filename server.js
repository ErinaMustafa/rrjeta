// =============================
// SERVERI TCP në Node.js (Final)
// =============================

const net = require('net');
const fs = require('fs');
const path = require('path');

const PORTI = 4000;
const IP_ADRESA = '0.0.0.0';
const MAKS_KLIENTE = 4;

// Sigurohu që folderi ekziston
if (!fs.existsSync('./server_files')) fs.mkdirSync('./server_files');

// Objekt për klientët
let klientet = [];

// Statistika
let statistika = {
    lidhjeAktive: 0,
    mesazhePerKlient: {},
    trafikuTotalBytes: 0,
};

// Ruajtja periodike e statistikave në file
setInterval(() => {
    let statsData = `📊 ${new Date().toLocaleString()}\n` +
        `Lidhje aktive: ${statistika.lidhjeAktive}\n` +
        `Trafik total: ${statistika.trafikuTotalBytes} bytes\n` +
        `------------------------------\n`;
    fs.writeFileSync('server_stats.txt', statsData);
}, 10000);

// Krijo serverin
const server = net.createServer((socket) => {

    if (klientet.length >= MAKS_KLIENTE) {
        socket.write('Serveri është i mbushur. Prit pak...\n');
        socket.destroy();
        return;
    }

    const adresaKlientit = `${socket.remoteAddress}:${socket.remotePort}`;
    socket.isAdmin = false;
    klientet.push(socket);
    statistika.lidhjeAktive++;
    statistika.mesazhePerKlient[adresaKlientit] = 0;

    console.log(`📶 Klient i ri u lidh: ${adresaKlientit}`);

    // Timeout për klientët joaktivë (30 sekonda)
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

        // Identifikimi si ADMIN
        if (mesazhi === 'ADMIN') {
            socket.isAdmin = true;
            socket.write('✅ Identifikim si ADMIN u kry me sukses.\n');
            return;
        }

        // Komanda STATS
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

        // Kufizim komandash për user normal
        const adminCommands = ['/list', '/read', '/delete', '/upload', '/download', '/search', '/info'];
        if (adminCommands.some(cmd => mesazhi.startsWith(cmd)) && !socket.isAdmin) {
            socket.write('🚫 Nuk ke privilegje të mjaftueshme për këtë komandë.\n');
            return;
        }

        // Komanda për listim
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
            // Përgjigje normale + admin më e shpejtë
            if (socket.isAdmin) socket.write('✅ Mesazhi u pranua nga serveri. ⏩ (Admin)\n');
            else setTimeout(() => socket.write('✅ Mesazhi u pranua nga serveri.\n'), 1000);
        }
    });

    // Kur klienti shkëputet
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
