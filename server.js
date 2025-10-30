// === START FIX ===
const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

//  Render không cho ghi ngoài /tmp, nên phải lưu ở đây
const FILE = "/tmp/data_khoann.json";

// Nếu chưa có file thì tạo rỗng
if (!fs.existsSync(FILE)) {
  const emptyData = { lop: [], sinhvien: [], dangky: [] };
  fs.writeFileSync(FILE, JSON.stringify(emptyData, null, 2));
  console.log(" Tạo file trống ban đầu tại", FILE);
}

//  Route kiểm tra server
app.get("/", (req, res) => {
  res.send(" API Khoa_NN is running on Render!");
});

//  API nhận dữ liệu phân mảnh (từ máy chủ C# gửi xuống)
app.post("/api/khoa_nn", (req, res) => {
  try {
    console.log(" Nhận dữ liệu phân mảnh từ client...");

    // Dữ liệu gồm lop[], sinhvien[], dangky[]
    const body = req.body;
    if (!body.lop || !body.sinhvien || !body.dangky) {
      return res.status(400).json({ error: "Thiếu dữ liệu lop/sinhvien/dangky" });
    }

    // Lưu thẳng toàn bộ JSON vào file
    fs.writeFileSync(FILE, JSON.stringify(body, null, 2), "utf8");
    console.log(" Đã lưu dữ liệu Khoa_NN thành công!");

    res.json({
      message: "Đã nhận dữ liệu Khoa_NN",
      lop: body.lop.length,
      sinhvien: body.sinhvien.length,
      dangky: body.dangky.length,
    });
  } catch (err) {
    console.error(" Lỗi khi xử lý dữ liệu:", err);
    res.status(500).json({ error: err.message });
  }
});

//  API xem dữ liệu hiện tại (hiển thị đầy đủ lop[], sinhvien[], dangky[])
app.get("/api/khoa_nn", (req, res) => {
  try {
    const data = fs.existsSync(FILE)
      ? JSON.parse(fs.readFileSync(FILE, "utf8"))
      : { lop: [], sinhvien: [], dangky: [] };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(` API Khoa_NN đang chạy tại cổng ${PORT}`);
});
// === END FIX ===