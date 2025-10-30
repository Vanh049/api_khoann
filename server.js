const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// =============================
// DỮ LIỆU PHÂN MẢNH KHOA_NN
// =============================

// ✅ Render không cho ghi ngoài /tmp, nên phải lưu ở đây
const FILE = "/tmp/data_khoann.json";

// Nếu chưa có file thì tạo rỗng
if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, JSON.stringify({ sinhvien: [] }, null, 2));
  console.log("📁 Tạo file trống ban đầu tại", FILE);
}

// Route kiểm tra server
app.get("/", (req, res) => {
  res.send("✅ API Khoa_NN is running on Render!");
});

// API nhận dữ liệu phân mảnh (từ máy chủ gửi xuống)
app.post("/api/khoa_nn", (req, res) => {
  try {
    console.log("📥 Nhận dữ liệu từ client...");
    const newData = req.body.sinhvien || req.body || [];
    const current = fs.existsSync(FILE)
      ? JSON.parse(fs.readFileSync(FILE, "utf8")).sinhvien || []
      : [];

    // UPSERT: thêm mới hoặc cập nhật nếu đã tồn tại
    newData.forEach((sv) => {
      const idx = current.findIndex((x) => x.MaSV === sv.MaSV);
      if (idx >= 0) current[idx] = sv;
      else current.push(sv);
    });

    // Ghi lại file
    fs.writeFileSync(FILE, JSON.stringify({ sinhvien: current }, null, 2));
    console.log(`✅ Đã cập nhật ${newData.length} sinh viên.`);

    res.json({
      message: "Đã nhận dữ liệu Khoa_NN",
      count: newData.length,
    });
  } catch (err) {
    console.error("❌ Lỗi khi xử lý dữ liệu:", err);
    res.status(500).json({ error: err.message });
  }
});

// API xem dữ liệu hiện tại
app.get("/api/khoa_nn", (req, res) => {
  try {
    const data = fs.existsSync(FILE)
      ? JSON.parse(fs.readFileSync(FILE, "utf8"))
      : { sinhvien: [] };
    res.json(data.sinhvien);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000; // vẫn fallback 10000 nếu chạy local
app.listen(PORT, () => {
  console.log(`🚀 API Khoa_NN đang chạy tại cổng ${PORT}`);
});