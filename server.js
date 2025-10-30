// === START FIX ===
const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

// 🔹 Render chỉ cho ghi file trong thư mục /tmp
const FILE = "/tmp/data_khoann.json";

// 🔹 Tạo file dữ liệu rỗng ban đầu nếu chưa có
if (!fs.existsSync(FILE)) {
  const emptyData = { lop: [], sinhvien: [], dangky: [] };
  fs.writeFileSync(FILE, JSON.stringify(emptyData, null, 2));
  console.log("📁 Tạo file trống ban đầu tại", FILE);
}

// 🔹 Kiểm tra server đang hoạt động
app.get("/", (req, res) => {
  res.send("✅ API Khoa_NN is running on Render!");
});

// 🔹 API nhận dữ liệu phân mảnh (POST từ ứng dụng C#)
app.post("/api/khoa_nn", (req, res) => {
  try {
    console.log("📥 Nhận dữ liệu phân mảnh từ client...");

    const body = req.body;
    if (!body.lop || !body.sinhvien || !body.dangky) {
      return res
        .status(400)
        .json({ error: "Thiếu dữ liệu: yêu cầu có lop[], sinhvien[], dangky[]" });
    }

    // Lưu toàn bộ JSON vào file /tmp/data_khoann.json
    fs.writeFileSync(FILE, JSON.stringify(body, null, 2), "utf8");
    console.log("✅ Đã lưu dữ liệu Khoa_NN thành công!");

    res.json({
      message: "Đã nhận dữ liệu Khoa_NN",
      lop: body.lop.length,
      sinhvien: body.sinhvien.length,
      dangky: body.dangky.length,
    });
  } catch (err) {
    console.error("❌ Lỗi khi xử lý dữ liệu:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 API xem dữ liệu hiện tại (GET)
app.get("/api/khoa_nn", (req, res) => {
  try {
    const data = fs.existsSync(FILE)
      ? JSON.parse(fs.readFileSync(FILE, "utf8"))
      : { lop: [], sinhvien: [], dangky: [] };
    res.json(data);
  } catch (err) {
    console.error("❌ Lỗi đọc dữ liệu:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Khởi chạy server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 API Khoa_NN đang chạy tại cổng ${PORT}`);
});
// === END FIX ===