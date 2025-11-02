const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const PORT = process.env.PORT || 10000;

// PostgreSQL Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://site3_user:aQTo8AE24JAsIqbg0rC1ZwUsKA7kB3q5@dpg-d43eacali9vc73ctsvg0-a/khoann_db',
  ssl: { rejectUnauthorized: false }
});

// ------------------ LOG HELPER ------------------
function writeLog(msg) {
  console.log(`[${new Date().toLocaleString()}] ${msg}`);
}

// ------------------ INIT TABLES ------------------
async function initTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lop (
        malop VARCHAR(10) PRIMARY KEY,
        tenlop VARCHAR(200),
        khoa VARCHAR(10)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sinhvien (
        masv VARCHAR(10) PRIMARY KEY,
        hoten VARCHAR(200) NOT NULL,
        phai SMALLINT,
        ngaysinh DATE,
        malop VARCHAR(10),
        hocbong FLOAT,
        khoa VARCHAR(10),
        lastmodified BIGINT,
        rowguid UUID DEFAULT gen_random_uuid()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dangky (
        masv VARCHAR(10),
        mamon VARCHAR(10),
        diem1 FLOAT,
        diem2 FLOAT,
        diem3 FLOAT,
        lastmodified BIGINT,
        PRIMARY KEY(masv, mamon)
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
  if (!Array.isArray(rows) || !rows.length) return;
  const query = `
    INSERT INTO lop (malop, tenlop, khoa) 
    VALUES ($1,$2,$3)
    ON CONFLICT (malop) DO UPDATE SET
      tenlop = EXCLUDED.tenlop,
      khoa = EXCLUDED.khoa
  `;
  for (const r of rows) {
    try {
      await pool.query(query, [r.malop, r.tenlop, (r.khoa || 'NN').trim()]);
    } catch (e) {
      writeLog(`❌ Lỗi upsertLop: ${e.message} - ${JSON.stringify(r)}`);
    }
  }
  writeLog(`✅ Lop: ${rows.length} bản ghi đã lưu`);
}

async function upsertSinhVien(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const query = `
    INSERT INTO sinhvien (masv, hoten, phai, ngaysinh, malop, hocbong, khoa, lastmodified)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (masv) DO UPDATE SET
      hoten = EXCLUDED.hoten,
      phai = EXCLUDED.phai,
      ngaysinh = EXCLUDED.ngaysinh,
      malop = EXCLUDED.malop,
      hocbong = EXCLUDED.hocbong,
      khoa = EXCLUDED.khoa,
      lastmodified = EXCLUDED.lastmodified
  `;
  const now = Date.now();
  for (const r of rows) {
    try {
      const phaiVal = (r.phai === true || r.phai === 1) ? 1 : 0;
      await pool.query(query, [
        r.masv,
        r.hoten,
        phaiVal,
r.ngaysinh || null,
        r.malop || null,
        r.hocbong || 0,
        (r.khoa || 'NN').trim(),
        now
      ]);
    } catch (e) {
      writeLog(`❌ Lỗi upsertSinhVien: ${e.message} - ${JSON.stringify(r)}`);
    }
  }
  writeLog(`✅ SinhVien: ${rows.length} bản ghi đã lưu`);
}

async function upsertDangKy(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const query = `
    INSERT INTO dangky (masv, mamon, diem1, diem2, diem3, lastmodified)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (masv, mamon) DO UPDATE SET
      diem1 = EXCLUDED.diem1,
      diem2 = EXCLUDED.diem2,
      diem3 = EXCLUDED.diem3,
      lastmodified = EXCLUDED.lastmodified
  `;
  const now = Date.now();
  for (const r of rows) {
    try {
      await pool.query(query, [
        r.masv,
        r.mamon,
        r.diem1 || 0,
        r.diem2 || 0,
        r.diem3 || 0,
        now
      ]);
    } catch (e) {
      writeLog(`❌ Lỗi upsertDangKy: ${e.message} - ${JSON.stringify(r)}`);
    }
  }
  writeLog(`✅ DangKy: ${rows.length} bản ghi đã lưu`);
}

// ------------------ API ------------------

// Nhận dữ liệu từ Site1
app.post('/api/khoa_nn', async (req, res) => {
  try {
    const data = req.body || {};
    await upsertLop(data.lop);
    await upsertSinhVien(data.sinhvien);
    await upsertDangKy(data.dangky);
    writeLog('📩 Site3 nhận & lưu dữ liệu từ Site1');
    res.json({ ok: true, message: '✅ Nhận dữ liệu thành công!' });
  } catch (err) {
    writeLog('❌ Lỗi nhận dữ liệu từ Site1: ' + err.message);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Xem dữ liệu Site3
app.get('/api/khoa_nn', async (req, res) => {
  try {
    const lop = (await pool.query(`SELECT * FROM lop`)).rows;
    const sinhvien = (await pool.query(`SELECT * FROM sinhvien`)).rows;
    const dangky = (await pool.query(`SELECT * FROM dangky`)).rows;
    res.json({ lop, sinhvien, dangky });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => writeLog(`🌐 Site3 running at port ${PORT}`));