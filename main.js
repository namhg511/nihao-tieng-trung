const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')                      // path: ghép đường dẫn file cho đúng trên mọi hệ điều hành
const { DatabaseSync } = require('node:sqlite')   // DatabaseSync: đọc cơ sở dữ liệu SQLite (có sẵn trong Node)
const { boDau, chuoiTimNghia } = require('./chuan-hoa')  // hàm chuẩn hoá chữ, dùng chung với build-db.js

// Số kết quả tối đa trả về cho mỗi lần tìm
const SO_KET_QUA_TOI_DA = 50

// Mở file từ điển ở chế độ CHỈ ĐỌC — ứng dụng chỉ tra cứu, không bao giờ sửa dữ liệu.
// __dirname là thư mục chứa file main.js này, nên chạy từ đâu cũng tìm đúng file.
// (File này được tạo bằng lệnh: npm run build-db)
const db = new DatabaseSync(path.join(__dirname, 'data', 'tu-dien.db'), { readOnly: true })

// =====================================================================
// SỔ TỪ VỰNG: file SQLite RIÊNG (so-tu.db), nằm trong thư mục dữ liệu của người dùng.
// app.getPath('userData') trên Windows là C:\Users\<tên>\AppData\Roaming\nihao-tieng-trung
// File tự được tạo ở lần mở app đầu tiên. Đây là file duy nhất app được GHI vào.
// =====================================================================
const soTuDb = new DatabaseSync(path.join(app.getPath('userData'), 'so-tu.db'))

// "IF NOT EXISTS": chỉ tạo bảng nếu chưa có — mở app lần sau thì bỏ qua, dữ liệu cũ vẫn còn.
// UNIQUE (gian_the, pinyin): không cho có 2 hàng trùng CẢ giản thể LẪN pinyin.
//   行 [xing2] (đi) và 行 [hang2] (hàng) khác pinyin → lưu được cả hai.
//   Lưu 行 [xing2] lần thứ hai → SQLite từ chối.
soTuDb.exec(`
  CREATE TABLE IF NOT EXISTS so_tu (
    id        INTEGER PRIMARY KEY,
    gian_the  TEXT NOT NULL,
    phon_the  TEXT NOT NULL,
    pinyin    TEXT NOT NULL,
    nghia     TEXT NOT NULL,
    ngay_luu  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),  -- ví dụ "2026-10-25 14:30:05"
    UNIQUE (gian_the, pinyin)
  )
`)

// Lưu một từ. "OR IGNORE": nếu từ đã có (vi phạm UNIQUE) thì lặng lẽ bỏ qua thay vì báo lỗi.
// Không ghi cột ngay_luu — SQLite tự điền giá trị DEFAULT (giờ hiện tại).
const lenhLuuTu = soTuDb.prepare(`
  INSERT OR IGNORE INTO so_tu (gian_the, phon_the, pinyin, nghia)
  VALUES (?, ?, ?, ?)
`)

// Kiểm tra một từ đã có trong sổ chưa (có hàng nào thì trả về 1, không thì không trả về gì)
const lenhKiemTraDaLuu = soTuDb.prepare(`
  SELECT 1 FROM so_tu WHERE gian_the = ? AND pinyin = ?
`)

// Giao diện gửi sang có thể là bất cứ thứ gì → ép về chuỗi cho chắc
function chuoi(giaTri) {
  return String(giaTri ?? '')
}

// Dịch vụ 'so-tu:luu': lưu từ vào sổ, trả về true khi từ đã nằm trong sổ
ipcMain.handle('so-tu:luu', (suKien, tu) => {
  lenhLuuTu.run(chuoi(tu.gian_the), chuoi(tu.phon_the), chuoi(tu.pinyin), chuoi(tu.nghia))
  return true
})

// Dịch vụ 'so-tu:da-luu': từ này (giản thể + pinyin) đã có trong sổ chưa? → true / false
ipcMain.handle('so-tu:da-luu', (suKien, gianThe, pinyin) => {
  return lenhKiemTraDaLuu.get(chuoi(gianThe), chuoi(pinyin)) !== undefined
})

// =====================================================================
// TRA TỪ ĐIỂN (tu-dien.db, chỉ đọc)
// =====================================================================

// Chuẩn bị sẵn 3 câu lệnh tìm kiếm (prepared statement), dùng lại cho mọi lần tìm.
// Dấu ? là chỗ trống, lúc chạy mới điền từ khoá vào — không ghép chuỗi trực tiếp vào SQL.
// ORDER BY length(...) để từ ngắn (khớp sát nhất) hiện lên trước.

// Tìm theo chữ Hán: khớp phần đầu của chữ giản thể HOẶC phồn thể
const lenhTimChuHan = db.prepare(`
  SELECT gian_the, phon_the, pinyin, nghia FROM tu
  WHERE gian_the LIKE ? OR phon_the LIKE ?
  ORDER BY length(gian_the)
  LIMIT ${SO_KET_QUA_TOI_DA}
`)

// Tìm theo pinyin: khớp phần đầu của cột pinyin_tim (đã chuẩn hoá sẵn, ví dụ "xuexi")
const lenhTimPinyin = db.prepare(`
  SELECT id, gian_the, phon_the, pinyin, pinyin_tim, nghia FROM tu
  WHERE pinyin_tim LIKE ?
  ORDER BY length(pinyin_tim)
  LIMIT ${SO_KET_QUA_TOI_DA}
`)

// Tìm theo nghĩa tiếng Việt: cột nghia_tim có dạng " hoc hoc tap " (xem chuan-hoa.js),
// nên tìm "% hoc %" (có dấu cách hai bên) là chỉ khớp đúng TỪ "hoc", không khớp "khoc".
// Không đặt LIMIT ở đây vì còn phải xếp hạng (khớp chính xác lên đầu) rồi mới cắt bớt.
const lenhTimNghia = db.prepare(`
  SELECT id, gian_the, phon_the, pinyin, nghia FROM tu
  WHERE nghia_tim LIKE ?
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
    .replace(/[^a-z]/g, '')              // bỏ số thanh điệu, dấu cách và mọi ký tự lạ (như %)
}

// Có dấu "chỉ tiếng Việt mới có" không? (đ, ă, â, ê, ô, ơ, ư, dấu nặng, dấu hỏi, dấu ngã)
// Pinyin không dùng các dấu này, nên gõ "học" thì chắc chắn không phải pinyin.
// (Dấu sắc và dấu huyền thì cả hai bên đều có, như "xué" và "hóc", nên không tính.)
function laTiengVietChacChan(chuoi) {
  return /[đ\u0306\u0302\u031b\u0323\u0309\u0303]/.test(chuoi.toLowerCase().normalize('NFD'))
}

// Viết thường + gộp nhiều dấu cách thành một, GIỮ NGUYÊN dấu tiếng Việt.
// normalize('NFC') để chữ "ọ" dù bàn phím gõ ra kiểu nào cũng thành cùng một ký tự.
function vietThuongGiuDau(chuoi) {
  return chuoi.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim()
}

// Thoát các ký tự đặc biệt (. * ? ( ) ...) để đưa một chuỗi bất kỳ vào regex an toàn
function thoatRegex(chuoi) {
  return chuoi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Tìm theo nghĩa tiếng Việt và xếp hạng. Trả về danh sách { tu, hang, viTri } — hạng càng nhỏ càng tốt:
//   0 = có một nghĩa đúng bằng từ khoá      (gõ "học" → 学: "học; học tập; ...")
//   1 = có một nghĩa bắt đầu bằng từ khoá   (gõ "học" → 学生: "học sinh; ...")
//   2 = từ khoá nằm đâu đó trong nghĩa      (gõ "học" → "khoa học")
function timTheoNghia(tuKhoa) {
  const tuKhoaKhongDau = chuoiTimNghia(tuKhoa).trim()   // "Học  sinh!" → "hoc sinh"
  if (tuKhoaKhongDau === '') return []

  // Người dùng có gõ dấu không? Có thì phải khớp đúng dấu: "học" không được ra "hộc".
  // Gõ không dấu "hoc" thì ra cả hai — vì không biết người dùng muốn chữ nào.
  const tuKhoaCoDau = vietThuongGiuDau(tuKhoa)
  const coGoDau = boDau(tuKhoaCoDau) !== tuKhoaCoDau

  // Regex kiểm tra nghĩa có chứa đúng TỪ có dấu đó không.
  // (?<![\p{L}\p{N}]) và (?![\p{L}\p{N}]): ngay trước và ngay sau không được dính chữ cái/chữ số,
  // nên "học" khớp trong "khoa học" nhưng không khớp trong "họcx". Cờ 'u' để regex hiểu chữ có dấu.
  const mauCoDau = new RegExp('(?<![\\p{L}\\p{N}])' + thoatRegex(tuKhoaCoDau) + '(?![\\p{L}\\p{N}])', 'u')

  // Bước 1: SQLite lọc thô theo dạng KHÔNG dấu (đã bỏ dấu ở cả hai phía)
  const ungVien = lenhTimNghia.all('% ' + tuKhoaKhongDau + ' %')

  // Bước 2: JavaScript lọc tiếp theo dấu (nếu có gõ dấu) và tính hạng cho từng từ
  const tuKhoaSoSanh = coGoDau ? tuKhoaCoDau : tuKhoaKhongDau
  const ketQua = []
  for (const tu of ungVien) {
    const nghiaCoDau = vietThuongGiuDau(tu.nghia)
    if (coGoDau && !mauCoDau.test(nghiaCoDau)) {
      continue   // gõ "học" mà nghĩa chỉ có "hộc" → bỏ
    }

    // So từng nghĩa nhỏ (cách nhau bởi ";"), bỏ phần chú thích trong ngoặc như "(cũ)".
    // Gõ có dấu thì so có dấu; gõ không dấu thì so không dấu.
    // viTri = nghĩa khớp là nghĩa thứ mấy (0 = nghĩa đầu tiên, tức nghĩa chính của từ)
    let hang = 2
    let viTri = 0
    const cacNghia = nghiaCoDau.split(';')
    for (let i = 0; i < cacNghia.length; i++) {
      const gon = cacNghia[i].replace(/\([^)]*\)/g, ' ')
      const nghiaSoSanh = coGoDau ? vietThuongGiuDau(gon) : chuoiTimNghia(gon).trim()
      if (nghiaSoSanh === tuKhoaSoSanh) {
        hang = 0
        viTri = i
        break
      }
      if (hang === 2 && nghiaSoSanh.startsWith(tuKhoaSoSanh + ' ')) {
        hang = 1
        viTri = i
      }
    }
    ketQua.push({ tu, hang, viTri })
  }
  return ketQua
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

  // Còn lại có thể là pinyin ("xuexi") HOẶC nghĩa tiếng Việt ("học", "hoc").
  // Gõ "hoc" thì không biết là kiểu nào → tìm cả hai rồi gộp lại.
  const tatCa = timTheoNghia(tuKhoa)

  // Chỉ tìm pinyin khi từ khoá không chứa dấu riêng của tiếng Việt.
  // (Nếu không, "ăn" bỏ dấu thành "an" sẽ kéo theo cả đống pinyin "an...")
  const pinyin = chuanHoaPinyin(tuKhoa)
  if (pinyin !== '' && !laTiengVietChacChan(tuKhoa)) {
    for (const tu of lenhTimPinyin.all(pinyin + '%')) {
      // Pinyin khớp trọn ("xuexi" = "xuexi") là hạng 0, chỉ khớp phần đầu là hạng 1
      tatCa.push({ tu, hang: tu.pinyin_tim === pinyin ? 0 : 1, viTri: 0 })
    }
  }

  // Xếp hạng: hạng nhỏ lên trước; cùng hạng thì khớp ở nghĩa chính (nghĩa đầu) lên trước,
  // rồi đến từ ngắn hơn, rồi nghĩa ngắn hơn
  tatCa.sort((a, b) =>
    a.hang - b.hang ||
    a.viTri - b.viTri ||
    a.tu.gian_the.length - b.tu.gian_the.length ||
    a.tu.nghia.length - b.tu.nghia.length
  )

  // Bỏ từ bị trùng (một từ có thể vừa khớp pinyin vừa khớp nghĩa), rồi lấy tối đa 50 từ
  const daCo = new Set()
  const ketQua = []
  for (const { tu } of tatCa) {
    if (daCo.has(tu.id)) continue
    daCo.add(tu.id)
    ketQua.push({ gian_the: tu.gian_the, phon_the: tu.phon_the, pinyin: tu.pinyin, nghia: tu.nghia })
    if (ketQua.length === SO_KET_QUA_TOI_DA) break
  }
  return ketQua
})

function taoCuaSo() {
  const cuaSo = new BrowserWindow({
    width: 1100,       // kích thước mặc định khi mở app
    height: 700,
    minWidth: 900,     // không cho kéo cửa sổ nhỏ hơn mức này (tránh vỡ bố cục)
    minHeight: 600,
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
