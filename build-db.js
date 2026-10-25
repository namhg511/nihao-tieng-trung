// build-db.js
// Script này đọc file từ điển data/CVDICT.u8 rồi chép toàn bộ vào một file
// cơ sở dữ liệu SQLite (data/tu-dien.db) để sau này tìm kiếm cho nhanh.
// Chạy bằng lệnh: npm run build-db

// ---------------------------------------------------------------------------
// 1. Nạp các thư viện có sẵn của Node (không cần cài thêm gì)
// ---------------------------------------------------------------------------
const fs = require('fs')                          // fs: đọc / xoá file trên máy
const { DatabaseSync } = require('node:sqlite')   // DatabaseSync: làm việc với SQLite
const { chuoiTimNghia } = require('./chuan-hoa')  // hàm chuẩn hoá nghĩa, dùng chung với main.js

// Đường dẫn tới file từ điển gốc và file cơ sở dữ liệu sẽ tạo ra
const FILE_TU_DIEN = 'data/CVDICT.u8'
const FILE_DB = 'data/tu-dien.db'

// ---------------------------------------------------------------------------
// 2. Các hàm nhỏ để chuẩn bị chữ dùng cho việc tìm kiếm
// ---------------------------------------------------------------------------

// (Hàm bỏ dấu tiếng Việt nằm trong file chuan-hoa.js, dùng chung với main.js)

// Chuẩn bị pinyin để tìm: "xue2 xi2" → "xuexi", "nu:3 ren2" → "nvren"
function pinyinTim(pinyin) {
  return pinyin
    .toLowerCase()                      // viết thường
    .replace(/u:/g, 'v')                // "u:" (chữ ü) đổi thành "v" như khi gõ bàn phím
    .replace(/[0-9\s]/g, '')            // bỏ các số thanh điệu và dấu cách
}

// ---------------------------------------------------------------------------
// 3. Đọc file từ điển và tách từng dòng thành các phần
// ---------------------------------------------------------------------------

// Đọc cả file thành một chuỗi văn bản (mã hoá UTF-8 để giữ đúng chữ Hán, chữ Việt)
const noiDung = fs.readFileSync(FILE_TU_DIEN, 'utf8')

// Cắt thành từng dòng (\r?\n để chạy đúng cả file kiểu Windows lẫn Linux)
const cacDong = noiDung.split(/\r?\n/)

// Mẫu (regex) để tách một dòng, ví dụ:  學習 学习 [xue2 xi2] /học/tìm hiểu/
//   (\S+)        → phồn thể  (學習)
//   (\S+)        → giản thể  (学习)
//   \[([^\]]*)\] → pinyin trong ngoặc vuông (xue2 xi2)
//   \/(.*)\/     → phần nghĩa nằm giữa hai dấu / ở đầu và cuối (học/tìm hiểu)
const MAU_DONG = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/$/

const danhSachTu = []   // chứa các từ tách được
let soDongLoi = 0       // đếm số dòng không đúng mẫu

for (const dong of cacDong) {
  // Bỏ qua dòng trống và dòng chú thích (bắt đầu bằng #)
  if (dong.trim() === '' || dong.startsWith('#')) {
    continue
  }

  // Thử tách dòng theo mẫu; không khớp thì đếm lỗi rồi chuyển sang dòng sau
  const khop = dong.match(MAU_DONG)
  if (!khop) {
    soDongLoi++
    continue
  }

  // khop[1..4] là 4 phần trong ngoặc tròn của mẫu ở trên
  const phonThe = khop[1]
  const gianThe = khop[2]
  const pinyin = khop[3]
  // Các nghĩa cách nhau bằng "/", ta nối lại bằng "; " cho dễ đọc
  const nghia = khop[4].split('/').join('; ')

  danhSachTu.push({
    phonThe,
    gianThe,
    pinyin,
    pinyinTim: pinyinTim(pinyin),
    nghia,
    nghiaTim: chuoiTimNghia(nghia),
  })
}

// ---------------------------------------------------------------------------
// 4. Tạo file cơ sở dữ liệu mới (xoá file cũ nếu đã có)
// ---------------------------------------------------------------------------

// Xoá file cũ để lần nào chạy cũng tạo lại từ đầu, không bị trùng dữ liệu
if (fs.existsSync(FILE_DB)) {
  fs.unlinkSync(FILE_DB)
}

// Mở (và tự tạo) file cơ sở dữ liệu
const db = new DatabaseSync(FILE_DB)

// Tạo bảng "tu" — mỗi hàng là một từ trong từ điển
db.exec(`
  CREATE TABLE tu (
    id         INTEGER PRIMARY KEY,  -- số thứ tự, SQLite tự tăng
    phon_the   TEXT NOT NULL,        -- chữ phồn thể
    gian_the   TEXT NOT NULL,        -- chữ giản thể
    pinyin     TEXT NOT NULL,        -- pinyin gốc, ví dụ "xue2 xi2"
    pinyin_tim TEXT NOT NULL,        -- pinyin để tìm, ví dụ "xuexi"
    nghia      TEXT NOT NULL,        -- nghĩa tiếng Việt
    nghia_tim  TEXT NOT NULL         -- nghĩa bỏ dấu, chỉ còn các từ, ví dụ " hoc hoc tap "
  )
`)

// ---------------------------------------------------------------------------
// 5. Ghi tất cả các từ vào bảng trong MỘT transaction
// ---------------------------------------------------------------------------
// Nếu ghi từng từ riêng lẻ, SQLite phải lưu xuống ổ đĩa sau mỗi lần → rất chậm.
// Gói tất cả giữa BEGIN và COMMIT thì chỉ lưu một lần ở cuối → nhanh hơn nhiều.

// Chuẩn bị sẵn câu lệnh thêm một hàng; dấu ? sẽ được thay bằng giá trị thật
const lenhThem = db.prepare(`
  INSERT INTO tu (phon_the, gian_the, pinyin, pinyin_tim, nghia, nghia_tim)
  VALUES (?, ?, ?, ?, ?, ?)
`)

db.exec('BEGIN')
try {
  for (const tu of danhSachTu) {
    lenhThem.run(tu.phonThe, tu.gianThe, tu.pinyin, tu.pinyinTim, tu.nghia, tu.nghiaTim)
  }
  db.exec('COMMIT')     // lưu tất cả xuống file
} catch (loi) {
  db.exec('ROLLBACK')   // có lỗi thì huỷ hết, không để file dở dang
  throw loi
}

// ---------------------------------------------------------------------------
// 6. Tạo index (giống mục lục của sách) để tìm theo các cột này nhanh hơn
// ---------------------------------------------------------------------------
// Tạo sau khi đã nạp xong dữ liệu sẽ nhanh hơn tạo trước rồi mới nạp.
db.exec(`
  CREATE INDEX idx_gian_the   ON tu (gian_the);
  CREATE INDEX idx_phon_the   ON tu (phon_the);
  CREATE INDEX idx_pinyin_tim ON tu (pinyin_tim);
`)

// ---------------------------------------------------------------------------
// 7. In kết quả ra màn hình và thử tìm một từ
// ---------------------------------------------------------------------------
console.log('Số từ đã nạp:', danhSachTu.length)
console.log('Số dòng lỗi :', soDongLoi)

// Thử tìm các từ có pinyin bắt đầu bằng "xuexi", lấy 3 kết quả đầu
const ketQuaThu = db
  .prepare("SELECT gian_the, phon_the, pinyin, nghia FROM tu WHERE pinyin_tim LIKE 'xuexi%' LIMIT 3")
  .all()

console.log("\nThử tìm pinyin_tim LIKE 'xuexi%':")
for (const tu of ketQuaThu) {
  console.log(`  ${tu.gian_the} (${tu.phon_the}) [${tu.pinyin}] — ${tu.nghia}`)
}

// Đóng cơ sở dữ liệu khi xong việc
db.close()
