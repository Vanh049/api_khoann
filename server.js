const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(cors());

const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://site3_user:aQTo8AE24JAsIqbg0rC1ZwUsKA7kB3q5@dpg-d43eacali9vc73ctsvg0-a/khoann_db",
  ssl: { rejectUnauthorized: false },
});

function writeLog(msg) {
  console.log(`[${new Date().toLocaleString()}] ${msg}`);
}

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
        PRIMARY KEY (masv, mamon)
      );
    `);

    writeLog("PostgreSQL tables ready.");
  } catch (err) {
    writeLog("Init tables error: " + err.message);
  }
}
initTables();

function normalizeKeys(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const normalized = {};
  for (let key in obj) {
    normalized[key.toLowerCase()] = obj[key];
  }
  return normalized;
}

async function upsertLop(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return;
  const query = `
    INSERT INTO lop (malop, tenlop, khoa)
    VALUES ($1, $2, $3)
    ON CONFLICT (malop) DO NOTHING;
  `;
  for (const item of rows) {
    const r = normalizeKeys(item);
    try {
      await pool.query(query, [
        r.malop?.trim(),
        r.tenlop?.trim(),
        (r.khoa || "NN").trim(),
      ]);
    } catch (e) {
      writeLog(`Error upsertLop: ${e.message} - ${JSON.stringify(r)}`);
    }
  }
  writeLog(`Lop: ${rows.length} records upserted`);
}

async function upsertSinhVien(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return;
  const query = `
    INSERT INTO sinhvien (masv, hoten, phai, ngaysinh, malop, hocbong, khoa, lastmodified)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (masv) DO UPDATE SET
      hoten = EXCLUDED.hoten,
      phai = EXCLUDED.phai,
      ngaysinh = EXCLUDED.ngaysinh,
      malop = EXCLUDED.malop,
      hocbong = EXCLUDED.hocbong,
      khoa = EXCLUDED.khoa,
      lastmodified = EXCLUDED.lastmodified;
  `;
  const now = Date.now();
  for (const item of rows) {
    const r = normalizeKeys(item);
    try {
      const phaiVal = r.phai === true || r.phai === 1 ? 1 : 0;
      await pool.query(query, [
r.masv?.trim(),
        r.hoten?.trim(),
        phaiVal,
        r.ngaysinh || null,
        r.malop?.trim() || null,
        r.hocbong || 0,
        (r.khoa || "NN").trim(),
        now,
      ]);
    } catch (e) {
      writeLog(`Error upsertSinhVien: ${e.message} - ${JSON.stringify(r)}`);
    }
  }
  writeLog(`SinhVien: ${rows.length} records upserted`);
}

async function upsertDangKy(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return;
  const query = `
    INSERT INTO dangky (masv, mamon, diem1, diem2, diem3, lastmodified)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (masv, mamon) DO UPDATE SET
      diem1 = EXCLUDED.diem1,
      diem2 = EXCLUDED.diem2,
      diem3 = EXCLUDED.diem3,
      lastmodified = EXCLUDED.lastmodified;
  `;
  const now = Date.now();
  for (const item of rows) {
    const r = normalizeKeys(item);
    try {
      await pool.query(query, [
        r.masv?.trim(),
        r.mamon?.trim(),
        r.diem1 ?? 0,
        r.diem2 ?? 0,
        r.diem3 ?? 0,
        now,
      ]);
    } catch (e) {
      writeLog(`Error upsertDangKy: ${e.message} - ${JSON.stringify(r)}`);
    }
  }
  writeLog(`DangKy: ${rows.length} records upserted`);
}

app.post("/api/khoa_nn", async (req, res) => {
  try {
    const data = req.body || {};
    await upsertLop(data.lop);
    await upsertSinhVien(data.sinhvien);
    await upsertDangKy(data.dangky);
    writeLog("Site3 synchronized data from Site1 successfully");
    res.json({ ok: true, message: "Đồng bộ thành công" });
  } catch (err) {
    writeLog("Error synchronizing data: " + err.message);
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.delete("/api/khoa_nn/lop/:malop", async (req, res) => {
  try {
    const { malop } = req.params;
    await pool.query("DELETE FROM lop WHERE malop = $1", [malop]);
    writeLog(`Deleted Lop: ${malop}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.delete("/api/khoa_nn/sinhvien/:masv", async (req, res) => {
  try {
    const { masv } = req.params;
    await pool.query("DELETE FROM sinhvien WHERE masv = $1", [masv]);
    writeLog(`Deleted SinhVien: ${masv}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.delete("/api/khoa_nn/dangky/:masv/:mamon", async (req, res) => {
  try {
    const { masv, mamon } = req.params;
    await pool.query("DELETE FROM dangky WHERE masv = $1 AND mamon = $2", [
      masv,
      mamon,
    ]);
    writeLog(`Deleted DangKy: ${masv} - ${mamon}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get("/api/khoa_nn", async (req, res) => {
  try {
    const lop = (await pool.query(`SELECT * FROM lop ORDER BY malop`)).rows;
    const sinhvien = (await pool.query(`SELECT * FROM sinhvien ORDER BY masv`)).rows;
const dangky = (await pool.query(`SELECT * FROM dangky ORDER BY masv, mamon`)).rows;
    res.json({ lop, sinhvien, dangky });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.listen(PORT, () => writeLog(`Site3 running at port ${PORT}`));