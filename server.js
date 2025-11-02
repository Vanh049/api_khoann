const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// ------------------ CONFIG ------------------
const PORT = process.env.PORT || 10000;
const SITE1_RECV_URL = 'https://project05-global.somee.com/api/sync/from_khoann';

// ------------------ POSTGRES CONNECTION ------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://site3_user:aQTo8AE24JAsIqbg0rC1ZwUsKA7kB3q5@dpg-d43eacali9vc73ctsvg0-a/khoann_db',
  ssl: { rejectUnauthorized: false }
});

// ------------------ LOG ------------------
function writeLog(msg) {
  console.log(`[${new Date().toLocaleString()}] ${msg}`);
}

// ------------------ INIT TABLES ------------------
async function initTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Lop (
        MaLop TEXT PRIMARY KEY,
        TenLop TEXT,
        Khoa TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS SinhVien (
        MaSV TEXT PRIMARY KEY,
        HoTen TEXT,
        Phai INTEGER,
        NgaySinh TEXT,
        MaLop TEXT,
        HocBong REAL,
        Khoa TEXT,
        LastModified BIGINT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS DangKy (
        MaSV TEXT,
        MaMon TEXT,
        Diem1 REAL,
        Diem2 REAL,
        Diem3 REAL,
        LastModified BIGINT,
        PRIMARY KEY (MaSV, MaMon)
      );
    `);

    writeLog('✅ PostgreSQL tables ready');
  } catch (err) {
    writeLog('❌ Init tables error: ' + err.message);
  }
}
initTables();

// ------------------ UPSERT FUNCTIONS ------------------
async function upsertLop(rows) {
  if (!rows || !rows.length) return;
  const query = `
    INSERT INTO Lop (MaLop, TenLop, Khoa)
    VALUES ($1,$2,$3)
    ON CONFLICT (MaLop) DO UPDATE
      SET TenLop=EXCLUDED.TenLop, Khoa=EXCLUDED.Khoa;
  `;
  for (const r of rows) {
    await pool.query(query, [r.MaLop, r.TenLop, r.Khoa || 'NN']);
  }
  writeLog(`✅ Lop: ${rows.length} bản ghi đã lưu`);
}

async function upsertSinhVien(rows) {
  if (!rows || !rows.length) return;
  const query = `
    INSERT INTO SinhVien (MaSV, HoTen, Phai, NgaySinh, MaLop, HocBong, Khoa, LastModified)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (MaSV) DO UPDATE
      SET HoTen=EXCLUDED.HoTen, Phai=EXCLUDED.Phai, NgaySinh=EXCLUDED.NgaySinh,
          MaLop=EXCLUDED.MaLop, HocBong=EXCLUDED.HocBong, Khoa=EXCLUDED.Khoa,
          LastModified=EXCLUDED.LastModified;
  `;
  const now = Date.now();
  for (const r of rows) {
    await pool.query(query, [
      r.MaSV,
      r.HoTen,
      parseInt(r.Phai) || 0,
      r.NgaySinh,
      r.MaLop,
      parseFloat(r.HocBong) || 0,
      r.Khoa || 'NN',
      now
    ]);
  }
  writeLog(`✅ SinhVien: ${rows.length} bản ghi đã lưu`);
}
async function upsertDangKy(rows) {
  if (!rows || !rows.length) return;
  const query = `
    INSERT INTO DangKy (MaSV, MaMon, Diem1, Diem2, Diem3, LastModified)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (MaSV, MaMon) DO UPDATE
      SET Diem1=EXCLUDED.Diem1, Diem2=EXCLUDED.Diem2, Diem3=EXCLUDED.Diem3,
          LastModified=EXCLUDED.LastModified;
  `;
  const now = Date.now();
  for (const r of rows) {
    await pool.query(query, [
      r.MaSV,
      r.MaMon,
      parseFloat(r.Diem1 || 0),
      parseFloat(r.Diem2 || 0),
      parseFloat(r.Diem3 || 0),
      now
    ]);
  }
  writeLog(`✅ DangKy: ${rows.length} bản ghi đã lưu`);
}

// ------------------ SYNC TO SITE1 ------------------
async function syncToSite1() {
  try {
    const lop = (await pool.query(`SELECT * FROM Lop`)).rows;
    const sv = (await pool.query(`SELECT * FROM SinhVien WHERE LOWER(Khoa)='nn'`)).rows;
    const dk = (await pool.query(`SELECT * FROM DangKy`)).rows;

    const payload = { lop, sinhvien: sv, dangky: dk };
    await axios.post(SITE1_RECV_URL, payload);
    writeLog('✅ Sync dữ liệu NN -> Site1 thành công');
  } catch (err) {
    writeLog('❌ Sync lên Site1 lỗi: ' + err.message);
  }
}

// ------------------ API ------------------
app.post('/api/khoa_nn', async (req, res) => {
  try {
    const data = req.body;
    await upsertLop(data.lop || []);
    await upsertSinhVien(data.sinhvien || []);
    await upsertDangKy(data.dangky || []);

    writeLog('📩 Site3 nhận & lưu dữ liệu từ Site1');

    syncToSite1(); // async

    res.json({ ok: true, message: '✅ Nhận dữ liệu thành công!' });
  } catch (err) {
    writeLog('❌ Lỗi nhận dữ liệu từ Site1: ' + err.message);
    res.status(500).send(err.message);
  }
});

app.get('/api/khoa_nn', async (req, res) => {
  try {
    const lop = (await pool.query(`SELECT * FROM Lop`)).rows;
    const sv = (await pool.query(`SELECT * FROM SinhVien WHERE LOWER(Khoa)='nn'`)).rows;
    const dk = (await pool.query(`SELECT * FROM DangKy`)).rows;
    res.json({ lop, sinhvien: sv, dangky: dk });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ------------------ AUTO SYNC 5 phút ------------------
cron.schedule('*/5 * * * *', () => {
  writeLog('⏱ Auto sync 5 phút chạy...');
  syncToSite1();
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => writeLog(`🌐 Site3 running at port ${PORT}`));