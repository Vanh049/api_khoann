const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(require('cors')());

// =============================
// DỮ LIỆU PHÂN MẢNH KHOA_NN
// =============================
const FILE = 'data_khoann.json';

// Nếu chưa có file thì tạo rỗng
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ sinhvien: [] }, null, 2));

// API nhận dữ liệu phân mảnh (từ máy chủ gửi xuống)
app.post('/api/khoa_nn', (req, res) => {
  const newData = req.body; // mảng sinh viên từ máy chủ
  let currentData = JSON.parse(fs.readFileSync(FILE, 'utf8')).sinhvien;

  // UPSERT: thêm mới hoặc cập nhật nếu đã tồn tại
  newData.forEach(sv => {
    const idx = currentData.findIndex(x => x.MaSV === sv.MaSV);
    if (idx >= 0) {
      currentData[idx] = sv; // update sinh viên đã tồn tại
    } else {
      currentData.push(sv);   // thêm sinh viên mới
    }
  });

  // Ghi lại file JSON
  fs.writeFileSync(FILE, JSON.stringify({ sinhvien: currentData }, null, 2));
  res.json({ message: 'Đã nhận dữ liệu Khoa_NN', received: newData.length });
});

// API hiển thị dữ liệu hiện có (máy chủ có thể gọi GET để xem lại)
app.get('/api/khoa_nn', (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  res.json(data.sinhvien);
});

// Khởi động server
const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`API Khoa_NN chạy tại cổng ${PORT}`));
