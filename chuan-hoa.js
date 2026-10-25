// chuan-hoa.js
// Các hàm "chuẩn hoá" chữ dùng CHUNG cho build-db.js (lúc tạo dữ liệu) và main.js (lúc tìm).
// Hai bên phải chuẩn hoá giống hệt nhau thì mới so khớp được, nên ta chỉ viết một lần ở đây.

// Bỏ dấu tiếng Việt. Ví dụ: "Học tập" → "hoc tap", "Đi" → "di"
function boDau(chuoi) {
  return chuoi
    .toLowerCase()                      // đổi sang chữ thường
    .normalize('NFD')                   // tách dấu ra khỏi chữ: "é" thành "e" + dấu sắc
    .replace(/[̀-ͯ]/g, '')    // xoá các dấu vừa tách ra
    .replace(/đ/g, 'd')                 // "đ" không tách được bằng NFD nên đổi riêng
}

// Biến nghĩa thành chuỗi chỉ gồm các TỪ không dấu, cách nhau đúng một dấu cách,
// và có thêm một dấu cách ở đầu và ở cuối.
// Ví dụ: "học; khoa học (cũ)" → " hoc khoa hoc cu "
// Nhờ dấu cách bao quanh, tìm " hoc " sẽ chỉ khớp đúng TỪ "hoc",
// không khớp nhầm vào giữa từ khác như "khoc" (khóc).
function chuoiTimNghia(chuoi) {
  const chiConChu = boDau(chuoi)
    .replace(/[^a-z0-9]+/g, ' ')        // dấu câu, ngoặc, chữ Hán... đều thành dấu cách
    .trim()
  return ' ' + chiConChu + ' '
}

// Xuất 2 hàm ra ngoài để file khác dùng được bằng require('./chuan-hoa')
module.exports = { boDau, chuoiTimNghia }
