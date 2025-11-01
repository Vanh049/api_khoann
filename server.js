const express = require('express');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cron = require('node-cron');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const DB_FILE = './data/site3.db';
const PORT = process.env.PORT || 5000;

// 🟢 Link API Site 1 để đồng bộ ngược (sửa lại đúng domain của bạn)
const SITE1_SYNC_URL = 'https://project05-global.somee.com/api/sync/from_khoann';

// ======================= KHỞI TẠO DATABASE =======================
if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) return console.error('Không thể mở DB:', err);
  console.log('✅ SQLite DB opened:', DB_FILE);
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

// ======================= CÁC HÀM CẬP NHẬT =======================
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

// ======================= HÀM ĐỒNG BỘ NGƯỢC VỀ SITE 1 =======================
async function syncToSite1() {
  try {
    const result = {};
    db.serialize(() => {
      db.all('SELECT * FROM Lop', (e1, lop) => {
        if (e1) return console.error(e1);
        result.lop = lop;
        db.all('SELECT * FROM SinhVien', (e2, sv) => {
          if (e2) return console.error(e2);
          result.sinhvien = sv;
          db.all('SELECT * FROM DangKy', async (e3, dk) => {
            if (e3) return console.error(e3);
            result.dangky = dk;

            try {
              const res = await axios.post(SITE1_SYNC_URL, result);
              console.log(`🔁 Đồng bộ ngược thành công: ${res.status} ${res.statusText}`);
            } catch (err) {
              console.error('⚠️ Lỗi khi đồng bộ ngược về Site 1:', err.message);
            }
          });
        });
      });
    });
  } catch (err) {
    console.error('❌ Lỗi đồng bộ ngược:', err.message);
  }
}

// ======================= API CHÍNH =======================

// Nhận dữ liệu từ Site 1 (đẩy xuống)
app.post('/api/khoa_nn', async (req, res) => {
  try {
    const input = req.body || {};
    await upsertLop(input.lop || []);
    await upsertSinhVien(input.sinhvien || []);
    await upsertDangKy(input.dangky || []);
    res.json({ message: '✅ Đã lưu dữ liệu vào SQLite trên Site 3.' });
  } catch (err) {
    console.error('POST /api/khoa_nn error', err);
    res.status(500).json({ error: err.message });
  }
});

// Cung cấp dữ liệu cho GET
app.get('/api/khoa_nn', (req, res) => {
  const result = {};
  db.serialize(() => {
    db.all('SELECT * FROM Lop', (e1, rows1) => {
      if (e1) return res.status(500).json({ error: e1.message });
      result.lop = rows1 || [];
      db.all('SELECT * FROM SinhVien', (e2, rows2) => {
        if (e2) return res.status(500).json({ error: e2.message });
        result.sinhvien = rows2 || [];
        db.all('SELECT * FROM DangKy', (e3, rows3) => {
          if (e3) return res.status(500).json({ error: e3.message });
          result.dangky = rows3 || [];
          res.json(result);
        });
      });
    });
  });
});

// ======================= LỊCH ĐỒNG BỘ TỰ ĐỘNG =======================
// Chạy mỗi 5 phút: gửi dữ liệu SQLite ngược về Site 1
cron.schedule('*/5 * * * *', () => {
  console.log('⏰ Bắt đầu đồng bộ ngược về Site 1...');
  syncToSite1();
});

// ======================= KHỞI ĐỘNG SERVER =======================
app.listen(PORT, () => console.log(`🚀 API Khoa_NN chạy tại cổng ${PORT}`));
