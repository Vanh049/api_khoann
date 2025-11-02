const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const PORT = process.env.PORT || 10000;

// PostgreSQL Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://site3_user:password@host:port/khoann_db',
  ssl: { rejectUnauthorized: false }
});

// ------------------ LOG ------------------
function writeLog(msg) {
  console.log(`[${new Date().toLocaleString()}] ${msg}`);
}

// ------------------ INIT TABLES ------------------
async function initTables() {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Lop (
        MaLop VARCHAR(10) PRIMARY KEY,
        TenLop VARCHAR(200),
        Khoa VARCHAR(10)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS SinhVien (
        MaSV VARCHAR(10) PRIMARY KEY,
        HoTen VARCHAR(200) NOT NULL,
        Phai SMALLINT,
        NgaySinh DATE,
        MaLop VARCHAR(10),
        HocBong FLOAT,
        Khoa VARCHAR(10),
        LastModified BIGINT,
        rowguid UUID DEFAULT gen_random_uuid()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS DangKy (
        MaSV VARCHAR(10),
        MaMon VARCHAR(10),
        Diem1 FLOAT,
        Diem2 FLOAT,
        Diem3 FLOAT,
        LastModified BIGINT,
        PRIMARY KEY(MaSV, MaMon)
      );
    `);

    writeLog('✅ PostgreSQL tables ready');
  } catch (err) {
    writeLog('❌ Init tables error: ' + err.message);
  }
}
initTables();

// ------------------ UPSERT ------------------
async function upsertLop(rows) {
  if (!rows?.length) return;
  const query = `
    INSERT INTO Lop (MaLop, TenLop, Khoa)
    VALUES ($1,$2,$3)
    ON CONFLICT (MaLop) DO UPDATE SET
      TenLop = EXCLUDED.TenLop,
      Khoa = EXCLUDED.Khoa;
  `;
  for (const r of rows) {
    await pool.query(query, [r.MaLop || r.malop, r.TenLop || r.tenlop, (r.Khoa || r.khoa || 'NN').trim()]);
  }
  writeLog(`✅ Lop: ${rows.length} bản ghi đã lưu`);
}

async function upsertSinhVien(rows) {
  if (!rows?.length) return;
  const query = `
    INSERT INTO SinhVien (MaSV, HoTen, Phai, NgaySinh, MaLop, HocBong, Khoa, LastModified)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (MaSV) DO UPDATE SET
      HoTen = EXCLUDED.HoTen,
      Phai = EXCLUDED.Phai,
      NgaySinh = EXCLUDED.NgaySinh,
      MaLop = EXCLUDED.MaLop,
      HocBong = EXCLUDED.HocBong,
      Khoa = EXCLUDED.Khoa,
      LastModified = EXCLUDED.LastModified;
  `;
  const now = Date.now();
  for (const r of rows) {
    // Mapping key: PascalCase từ Site1 hoặc lowercase từ SQLite trước đây
    const MaSV = r.MaSV || r.masv;
    const HoTen = r.HoTen || r.hoten || '';
    if (!MaSV) {
      writeLog(`⚠️ SinhVien bị bỏ qua vì thiếu MaSV: ${JSON.stringify(r)}`);
      continue;
    }
const Phai = r.Phai ?? r.phai ?? 0;
    const NgaySinh = r.NgaySinh || r.ngaysinh || null;
    const MaLop = r.MaLop || r.malop || null;
    const HocBong = r.HocBong ?? r.hocbong ?? 0;
    const Khoa = (r.Khoa || r.khoa || 'NN').trim();

    await pool.query(query, [MaSV, HoTen, Phai, NgaySinh, MaLop, HocBong, Khoa, now]);
  }
  writeLog(`✅ SinhVien: ${rows.length} bản ghi đã lưu`);
}

async function upsertDangKy(rows) {
  if (!rows?.length) return;
  const query = `
    INSERT INTO DangKy (MaSV, MaMon, Diem1, Diem2, Diem3, LastModified)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (MaSV, MaMon) DO UPDATE SET
      Diem1 = EXCLUDED.Diem1,
      Diem2 = EXCLUDED.Diem2,
      Diem3 = EXCLUDED.Diem3,
      LastModified = EXCLUDED.LastModified;
  `;
  const now = Date.now();
  for (const r of rows) {
    const MaSV = r.MaSV || r.masv;
    const MaMon = r.MaMon || r.mamon;
    if (!MaSV || !MaMon) continue;
    await pool.query(query, [
      MaSV,
      MaMon,
      r.Diem1 ?? r.diem1 ?? 0,
      r.Diem2 ?? r.diem2 ?? 0,
      r.Diem3 ?? r.diem3 ?? 0,
      now
    ]);
  }
  writeLog(`✅ DangKy: ${rows.length} bản ghi đã lưu`);
}

// ------------------ API ------------------

// Nhận dữ liệu từ Site1
app.post('/api/khoa_nn', async (req, res) => {
  try {
    const data = req.body;
    await upsertLop(data.lop || []);
    await upsertSinhVien(data.sinhvien || []);
    await upsertDangKy(data.dangky || []);
    writeLog('📩 Site3 nhận & lưu dữ liệu từ Site1');
    res.json({ ok: true, message: '✅ Nhận dữ liệu thành công!' });
  } catch (err) {
    writeLog('❌ Lỗi nhận dữ liệu từ Site1: ' + err.message);
    res.status(500).send(err.message);
  }
});

// Xem dữ liệu Site3
app.get('/api/khoa_nn', async (req, res) => {
  try {
    const lop = (await pool.query(`SELECT * FROM Lop`)).rows;
    const sinhvien = (await pool.query(`SELECT * FROM SinhVien`)).rows;
    const dangky = (await pool.query(`SELECT * FROM DangKy`)).rows;
    res.json({ lop, sinhvien, dangky });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => writeLog(`🌐 Site3 running at port ${PORT}`));