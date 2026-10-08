const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')                      // path: ghép đường dẫn file cho đúng trên mọi hệ điều hành
const { DatabaseSync } = require('node:sqlite')   // DatabaseSync: đọc cơ sở dữ liệu SQLite (có sẵn trong Node)

// Mở file từ điển ở chế độ CHỈ ĐỌC — ứng dụng chỉ tra cứu, không bao giờ sửa dữ liệu.
// __dirname là thư mục chứa file main.js này, nên chạy từ đâu cũng tìm đúng file.
// (File này được tạo bằng lệnh: npm run build-db)
const db = new DatabaseSync(path.join(__dirname, 'data', 'tu-dien.db'), { readOnly: true })

// Chuẩn bị sẵn 2 câu lệnh tìm kiếm (prepared statement), dùng lại cho mọi lần tìm.
// Dấu ? là chỗ trống, lúc chạy mới điền từ khoá vào — không ghép chuỗi trực tiếp vào SQL.
// ORDER BY length(...) để từ ngắn (khớp sát nhất) hiện lên trước.

// Tìm theo chữ Hán: khớp phần đầu của chữ giản thể HOẶC phồn thể
const lenhTimChuHan = db.prepare(`
  SELECT gian_the, phon_the, pinyin, nghia FROM tu
  WHERE gian_the LIKE ? OR phon_the LIKE ?
  ORDER BY length(gian_the)
  LIMIT 20
`)

// Tìm theo pinyin: khớp phần đầu của cột pinyin_tim (đã chuẩn hoá sẵn, ví dụ "xuexi")
const lenhTimPinyin = db.prepare(`
  SELECT gian_the, phon_the, pinyin, nghia FROM tu
  WHERE pinyin_tim LIKE ?
  ORDER BY length(pinyin_tim)
  LIMIT 20
`)

// Chuẩn hoá pinyin người dùng gõ về cùng dạng với cột pinyin_tim.
// "nǐ hǎo", "ni3 hao3", "Ni Hao" đều thành "nihao"; "nǚ" / "nu:3" / "nv" đều thành "nv"
function chuanHoaPinyin(chuoi) {
  return chuoi
    .toLowerCase()                       // viết thường
    .normalize('NFD')                    // tách dấu ra khỏi chữ: "ǎ" thành "a" + dấu thanh
    .replace(/u\u0308/g, 'v')            // "ü" lúc này là "u" + dấu hai chấm → đổi thành "v"
    .replace(/[\u0300-\u036f]/g, '')     // xoá các dấu thanh còn lại
    .replace(/u:/g, 'v')                 // kiểu gõ "u:" cũng là chữ ü → "v"
    .replace(/[0-9\s]/g, '')             // bỏ số thanh điệu và dấu cách
}

// Đăng ký "dịch vụ" tên 'tim-tu': khi giao diện (index.html) hỏi, hàm này chạy và trả kết quả về
ipcMain.handle('tim-tu', (suKien, tuKhoa) => {
  tuKhoa = String(tuKhoa || '').trim()
  if (tuKhoa === '') {
    return []   // không có gì để tìm
  }

  // Có ít nhất một chữ Hán (trong khoảng mã Unicode \u4e00–\u9fff) → tìm theo chữ Hán
  if (/[\u4e00-\u9fff]/.test(tuKhoa)) {
    // Thêm % vào cuối nghĩa là "bắt đầu bằng từ khoá"
    return lenhTimChuHan.all(tuKhoa + '%', tuKhoa + '%')
  }

  // Còn lại coi là pinyin
  const pinyin = chuanHoaPinyin(tuKhoa)
  if (pinyin === '') {
    return []   // ví dụ người dùng chỉ gõ số → chuẩn hoá xong không còn gì
  }
  return lenhTimPinyin.all(pinyin + '%')
})

function taoCuaSo() {
  const cuaSo = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),  // file chạy trước trang, làm "cầu nối" an toàn
      contextIsolation: true,                       // tách riêng code trang web và code preload
      nodeIntegration: false,                       // trang web KHÔNG được dùng thẳng Node (an toàn hơn)
    },
  })
  cuaSo.loadFile('index.html')
}

app.whenReady().then(taoCuaSo)
app.on('window-all-closed', () => app.quit())
