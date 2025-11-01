const express = require('express');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cron = require('node-cron');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// ------------------ CONFIG ------------------
const DATA_DIR = './data';
const DB_FILE = path.join(DATA_DIR, 'site3.db');
const LOG_FILE = path.join(DATA_DIR, 'log.txt');
const BACKUP_JSON = path.join(DATA_DIR, 'site3_backup.json');
const PORT = process.env.PORT || 10000;

// URL Site1 để gửi dữ liệu
const SITE1_RECV_URL = 'https://project05-global.somee.com/api/sync/from_khoann';

// ------------------ PREPARE FOLDERS ------------------
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '');
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');

// ------------------ HELPER LOG ------------------
function writeLog(msg) {
  const logLine = `[${new Date().toLocaleString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
  console.log(msg);
}

// ------------------ INIT SQLITE ------------------
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) return writeLog('❌ DB lỗi: ' + err);
  writeLog('✅ DB Site3 mở thành công');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS Lop (
    MaLop TEXT PRIMARY KEY,
    TenLop TEXT,
    Khoa TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS SinhVien (
    MaSV TEXT PRIMARY KEY,
    HoTen TEXT,
    Phai INTEGER,
    NgaySinh TEXT,
    MaLop TEXT,
    HocBong REAL,
    Khoa TEXT,
    LastModified INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS DangKy (
    MaSV TEXT,
    MaMon TEXT,
    Diem1 REAL,
    Diem2 REAL,
    Diem3 REAL,
    LastModified INTEGER,
    PRIMARY KEY (MaSV, MaMon)
  )`);
});

// ------------------ UPSERT FUNCTIONS ------------------
function upsertLop(rows) {
  return new Promise(resolve => {
    if (!rows.length) return resolve();
    const stmt = db.prepare(`INSERT OR REPLACE INTO Lop (MaLop,TenLop,Khoa) VALUES (?,?,?)`);
    rows.forEach(r => stmt.run(r.MaLop, r.TenLop, "NN"));
    stmt.finalize(resolve);
  });
}

function upsertSinhVien(rows) {
  return new Promise(resolve => {
    if (!rows.length) return resolve();
    const stmt = db.prepare(`INSERT OR REPLACE INTO SinhVien VALUES (?,?,?,?,?,?,?,?)`);
    const now = Date.now();
    rows.forEach(r => stmt.run(r.MaSV, r.HoTen, r.Phai, r.NgaySinh, r.MaLop, r.HocBong, "NN", now));
    stmt.finalize(resolve);
  });
}

function upsertDangKy(rows) {
  return new Promise(resolve => {
    if (!rows.length) return resolve();
    const stmt = db.prepare(`INSERT OR REPLACE INTO DangKy VALUES (?,?,?,?,?,?)`);
    const now = Date.now();
    rows.forEach(r => stmt.run(r.MaSV, r.MaMon, r.Diem1, r.Diem2, r.Diem3, now));
    stmt.finalize(resolve);
  });
}
// ------------------ BACKUP JSON ------------------
function backupJSON() {
  db.all(`SELECT * FROM Lop`, (_, lop) => {
    db.all(`SELECT * FROM SinhVien`, (_, sv) => {
      db.all(`SELECT * FROM DangKy`, (_, dk) => {
        const data = { lop, sinhvien: sv, dangky: dk };
        fs.writeFileSync(BACKUP_JSON, JSON.stringify(data, null, 2), 'utf-8');
        writeLog('💾 Backup JSON xong: site3_backup.json');
      });
    });
  });
}

// ------------------ SYNC TO SITE1 ------------------
async function syncToSite1() {
  db.all(`SELECT * FROM Lop`, (_, lop) => {
    db.all(`SELECT * FROM SinhVien WHERE Khoa='NN'`, (_, sv) => {
      db.all(`SELECT * FROM DangKy`, async (_, dk) => {
        const payload = { lop, sinhvien: sv, dangky: dk };
        try {
          await axios.post(SITE1_RECV_URL, payload);
          writeLog('✅ Sync dữ liệu NN -> Site1 thành công');
        } catch (err) {
          writeLog('❌ Sync lên Site1 lỗi: ' + err.message);
        }
      });
    });
  });
}

// ------------------ API NHẬN DỮ LIỆU ------------------
app.post('/api/khoa_nn', async (req, res) => {
  try {
    const data = req.body;
    await upsertLop(data.lop || []);
    await upsertSinhVien(data.sinhvien || []);
    await upsertDangKy(data.dangky || []);
    writeLog('📩 Site3 nhận & lưu dữ liệu từ Site1');

    // Backup JSON
    backupJSON();

    // Gửi lại Site1 nếu có thay đổi
    syncToSite1();

    res.json({ ok: true, message: '✅ Nhận dữ liệu thành công!' });
  } catch (err) {
    writeLog('❌ Lỗi nhận dữ liệu từ Site1: ' + err.message);
    res.status(500).send(err.message);
  }
});

// ------------------ API LẤY DỮ LIỆU ------------------
app.get('/api/khoa_nn', (req, res) => {
  db.all(`SELECT * FROM Lop`, (_, lop) => {
    db.all(`SELECT * FROM SinhVien WHERE Khoa='NN'`, (_, sv) => {
      db.all(`SELECT * FROM DangKy`, (_, dk) => {
        res.json({ lop, sinhvien: sv, dangky: dk });
      });
    });
  });
});

// ------------------ AUTO SYNC 5 PHÚT ------------------
cron.schedule('*/5 * * * *', () => {
  writeLog('⏱ Auto sync 5 phút chạy...');
  syncToSite1();
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => writeLog(`🌐 Site3 chạy tại port ${PORT}`));