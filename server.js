// =============================
// 🔹 API PHÂN MẢNH KHOA_NN (Site 2 - Render)
// =============================

const express = require("express");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

// =============================
// 🔧 CẤU HÌNH FILE LƯU DỮ LIỆU
// =============================
// Trên Render, chỉ thư mục `/tmp` được ghi
// Nếu chạy local, dùng file cùng thư mục
const FILE =
  process.env.RENDER === "true"
    ? "/tmp/data_khoann.json"
    : path.join(__dirname, "data_khoann.json");

// Nếu chưa có file thì tạo trống
if (!fs.existsSync(FILE)) {
  fs.writeFileSync(
    FILE,
    JSON.stringify({ sinhvien: [], lop: [], dangky: [] }, null, 2)
  );
  console.log("📁 Đã tạo file dữ liệu mới:", FILE);
}

// =============================
// 🩵 ROUTES
// =============================

// Kiểm tra server
app.get("/", (req, res) => {
  res.send("✅ API Khoa_NN is running!");
});

// Nhận dữ liệu từ Site 1
app.post("/api/khoa_nn", (req, res) => {
  console.log("📥 Nhận dữ liệu từ máy chủ...");

  try {
    const input = req.body; // JSON có nhiều bảng (lop, sinhvien, dangky)
    const current = JSON.parse(fs.readFileSync(FILE, "utf8"));

    // Duyệt qua từng bảng
    Object.keys(input).forEach((table) => {
      const newRows = input[table] || [];
      const oldRows = current[table] || [];

      let updated = [...oldRows];
      newRows.forEach((row) => {
        let idx = -1;
        if (table === "lop") idx = oldRows.findIndex((x) => x.MaLop === row.MaLop);
        else if (table === "sinhvien")
          idx = oldRows.findIndex((x) => x.MaSV === row.MaSV);
        else if (table === "dangky")
          idx = oldRows.findIndex(
            (x) => x.MaSV === row.MaSV && x.MaMH === row.MaMH
          );

        if (idx >= 0) updated[idx] = row;
        else updated.push(row);
      });

      current[table] = updated;
    });

    // Ghi lại file
    fs.writeFileSync(FILE, JSON.stringify(current, null, 2));
    console.log("✅ Đã ghi dữ liệu vào:", FILE);

    res.json({
      message: "Đã nhận và cập nhật dữ liệu thành công!",
      tables: Object.keys(input),
    });
  } catch (err) {
    console.error("❌ Lỗi xử lý dữ liệu:", err);
    res.status(500).json({ error: err.message });
  }
});

// Xem toàn bộ dữ liệu hiện có
app.get("/api/khoa_nn", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    res.json(data);
  } catch (err) {
    console.error("❌ Lỗi đọc file:", err);
    res.status(500).json({ error: "Không thể đọc dữ liệu." });
  }
});

// =============================
// 🚀 KHỞI ĐỘNG SERVER
// =============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 API Khoa_NN đang chạy tại cổng ${PORT}`);
  console.log(`📂 File dữ liệu: ${FILE}`);
});