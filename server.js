const express = require('express');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cron = require('node-cron');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// ------------------ CONFIG ------------------
const DB_FILE = './data/site3.db';
const LOG_FILE = './data/log.txt';
const PORT = process.env.PORT || 5000;

// ✅ API Site 1 để sync ngược
const SITE1_SYNC_URL = 'https://project05-global.somee.com/api/sync/from_khoann';

// ------------------ PREPARE FOLDERS ------------------
if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
if (!fs.existsSync('./data/site3.db')) fs.writeFileSync(DB_FILE, '');
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');

// ✅ Log ra file để debug Render
function writeLog(msg) {
  const data = `[${new Date().toLocaleString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, data);
  console.log(msg);
}

// ------------------ INIT SQLITE ------------------
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) return writeLog('❌ Không thể mở DB: ' + err);
  writeLog('✅ SQLite DB opened: ' + DB_FILE);
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
    LastModified INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS DangKy (
    MaSV TEXT,
    MaMon TEXT,
    Diem1 REAL,
    Diem2 REAL,
    Diem3 REAL,
    PRIMARY KEY (MaSV, MaMon)
  )`);
});

// ------------------ UPSERT FUNCTIONS ------------------
function upsertLop(rows) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(rows) || rows.length === 0) return resolve();
    const stmt = db.prepare(`INSERT OR REPLACE INTO Lop VALUES (?, ?, ?)`);
    db.serialize(() => {
      rows.forEach(r => stmt.run(r.MaLop, r.TenLop, r.Khoa));
      stmt.finalize(err => err ? reject(err) : resolve());
    });
  });
}

function upsertSinhVien(rows) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(rows) || rows.length === 0) return resolve();
    const stmt = db.prepare(`INSERT OR REPLACE INTO SinhVien VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const now = Date.now();
    db.serialize(() => {
      rows.forEach(r => stmt.run(r.MaSV, r.HoTen, r.Phai, r.NgaySinh, r.MaLop, r.HocBong, now));
      stmt.finalize(err => err ? reject(err) : resolve());
    });
  });
}

function upsertDangKy(rows) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(rows) || rows.length === 0) return resolve();
    const stmt = db.prepare(`INSERT OR REPLACE INTO DangKy VALUES (?, ?, ?, ?, ?)`);
    db.serialize(() => {
      rows.forEach(r => stmt.run(r.MaSV, r.MaMon, r.Diem1, r.Diem2, r.Diem3));
      stmt.finalize(err => err ? reject(err) : resolve());
    });
  });
}

// ------------------ SYNC TO SITE 1 ------------------
async function syncToSite1() {
  try {
    const result = {};
    db.serialize(() => {
      db.all('SELECT * FROM Lop', (e1, lop) => {
        if (e1) return writeLog(e1);
        result.lop = lop;
        db.all('SELECT * FROM SinhVien', (e2, sv) => {
          if (e2) return writeLog(e2);
          result.sinhvien = sv;
          db.all('SELECT * FROM DangKy', async (e3, dk) => {
            if (e3) return writeLog(e3);
            result.dangky = dk;

            try {
              const res = await axios.post(SITE1_SYNC_URL, result);
              writeLog(`🔁 Sync lên Site1 OK: ${res.status}`);
            } catch (err) {
              writeLog(`⚠️ Sync lỗi: ${err.message}`);
            }
          });
        });
      });
    });
  } catch (err) {
    writeLog('❌ Lỗi sync: ' + err.message);
  }
}

// ------------------ API ------------------
app.post('/api/khoa_nn', async (req, res) => {
  try {
    const input = req.body || {};
    await upsertLop(input.lop || []);
    await upsertSinhVien(input.sinhvien || []);
    await upsertDangKy(input.dangky || []);
    writeLog("✅ Nhận & lưu dữ liệu từ Site1");
    res.json({ message: '✅ Đã lưu dữ liệu vào Site3' });
  } catch (err) {
    writeLog(`❌ /api/khoa_nn: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET xem data
app.get('/api/khoa_nn', (req, res) => {
  const result = {};
  db.serialize(() => {
    db.all('SELECT * FROM Lop', (e1, rows1) => {
      if (e1) return res.status(500).json({ error: e1.message });
      result.lop = rows1;
      db.all('SELECT * FROM SinhVien', (e2, rows2) => {
        if (e2) return res.status(500).json({ error: e2.message });
        result.sinhvien = rows2;
        db.all('SELECT * FROM DangKy', (e3, rows3) => {
          if (e3) return res.status(500).json({ error: e3.message });
          result.dangky = rows3;
          res.json(result);
        });
      });
    });
  });
});

// ✅ API ping test
app.get('/api/ping', (req, res) => res.send("✅ Site3 OK"));

// ✅ API status
app.get('/api/status', (req, res) => {
  const size = fs.statSync(DB_FILE).size;
  res.json({
    status: "running",
    db_file: DB_FILE,
    db_size_bytes: size
  });
});

// ------------------ AUTO SYNC EVERY 5 MIN ------------------
cron.schedule('*/5 * * * *', () => {
  writeLog("⏰ Sync lên Site1...");
  syncToSite1();
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => writeLog(`🚀 Site3 chạy tại port ${PORT}`));
