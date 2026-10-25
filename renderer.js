// renderer.js — toàn bộ code JavaScript chạy trong cửa sổ (index.html)

// =====================================================================
// 1. ĐỔI PINYIN SỐ SANG PINYIN CÓ DẤU: "xue2 xi2" → "xuéxí", "nu:3" → "nǚ"
// =====================================================================

// Bảng dấu cho từng nguyên âm: vị trí 0..3 ứng với thanh 1..4
const BANG_DAU = {
  a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ',
  A: 'ĀÁǍÀ', E: 'ĒÉĚÈ', I: 'ĪÍǏÌ', O: 'ŌÓǑÒ', U: 'ŪÚǓÙ', 'Ü': 'ǕǗǙǛ',
}

// Đổi MỘT âm tiết, ví dụ "xue2" → "xué"
function doiAmTiet(amTiet) {
  // Tách phần chữ và số thanh ở cuối. Không đúng dạng (dấu câu, chữ cái lẻ...) thì giữ nguyên
  const khop = amTiet.match(/^([a-zA-Z:]+)([1-5])$/)
  if (!khop) {
    return amTiet
  }

  // "u:" và "v" đều là cách viết của chữ ü
  let chu = khop[1].replace(/u:/g, 'ü').replace(/U:/g, 'Ü').replace(/v/g, 'ü').replace(/V/g, 'Ü')
  const thanh = Number(khop[2])

  // Thanh 5 (thanh nhẹ) không có dấu → chỉ cần bỏ số
  if (thanh === 5) {
    return chu
  }

  // Tìm vị trí nguyên âm sẽ mang dấu, theo quy tắc:
  //   1) có "a" thì đặt trên a; 2) không thì có "e" đặt trên e;
  //   3) có "ou" thì đặt trên o; 4) còn lại đặt trên nguyên âm CUỐI CÙNG
  const thuong = chu.toLowerCase()
  let viTriDau = thuong.indexOf('a')
  if (viTriDau === -1) viTriDau = thuong.indexOf('e')
  if (viTriDau === -1) viTriDau = thuong.indexOf('ou')
  if (viTriDau === -1) {
    for (let i = thuong.length - 1; i >= 0; i--) {
      if ('aeiouü'.includes(thuong[i])) {
        viTriDau = i
        break
      }
    }
  }

  // Không có nguyên âm nào (ví dụ "m2", "ng4") → không đặt dấu được, chỉ bỏ số
  if (viTriDau === -1) {
    return chu
  }

  // Thay nguyên âm đó bằng chữ có dấu tương ứng trong bảng
  const nguyenAm = chu[viTriDau]
  const coDau = BANG_DAU[nguyenAm][thanh - 1]
  return chu.slice(0, viTriDau) + coDau + chu.slice(viTriDau + 1)
}

// Đổi cả chuỗi pinyin: tách theo dấu cách, đổi từng âm tiết, rồi nối liền lại
function doiPinyinSangDau(pinyin) {
  return pinyin.split(' ').map(doiAmTiet).join('')
}

// Hàm nhỏ giúp tạo một thẻ HTML có sẵn lớp CSS và chữ bên trong.
// Dùng textContent (không dùng innerHTML) để chữ trong từ điển luôn được hiện đúng là chữ.
function taoThe(tenThe, lopCss, chu) {
  const the = document.createElement(tenThe)
  if (lopCss) the.className = lopCss
  if (chu !== undefined) the.textContent = chu
  return the
}

// =====================================================================
// 2. SIDEBAR: bấm mục nào thì hiện trang đó
// =====================================================================
const cacMucMenu = document.querySelectorAll('.muc-menu')
const oTim = document.getElementById('oTim')

cacMucMenu.forEach((muc) => {
  muc.addEventListener('click', () => {
    // Mục bị khoá ("Sắp có") thì không làm gì — trình duyệt cũng tự chặn nút disabled
    if (muc.disabled) return

    // Bỏ tô nổi ở mọi mục, rồi tô nổi mục vừa bấm
    cacMucMenu.forEach((m) => m.classList.remove('dang-chon'))
    muc.classList.add('dang-chon')

    // Ẩn mọi trang, rồi hiện trang ứng với mục vừa bấm (dựa vào data-trang)
    document.querySelectorAll('.trang').forEach((t) => t.classList.remove('dang-hien'))
    document.getElementById('trang-' + muc.dataset.trang).classList.add('dang-hien')

    // Quay về trang Tra từ thì đặt sẵn con trỏ vào ô tìm để gõ được ngay.
    // Từ đang hiện có thể vừa được lưu / bỏ lưu ở trang Sổ từ → hỏi lại sổ để nút Lưu hiện đúng.
    if (muc.dataset.trang === 'tra-tu') {
      oTim.focus()
      const nutLuu = chiTiet.querySelector('.nut-luu')
      if (nutLuu) dongBoNutLuu(nutLuu, danhSachTu[chiSoChon])
    }

    // Mở trang Sổ từ thì đọc lại sổ, vì có thể vừa lưu thêm từ ở trang Tra từ
    if (muc.dataset.trang === 'so-tu') taiSoTu()
  })
})

// =====================================================================
// 3. TRANG TRA TỪ
// =====================================================================
const ketQua = document.getElementById('ketQua')
const chiTiet = document.getElementById('chiTiet')

let danhSachTu = []   // các từ tìm được ở lần tìm gần nhất
let chiSoChon = -1    // vị trí của từ đang chọn trong danhSachTu (-1 = chưa chọn gì)
let lanTim = 0        // đếm số lần tìm, để bỏ qua kết quả cũ về muộn khi gõ nhanh

// Hai hàm dưới đây nhận thêm tham số "khung" = vẽ vào ô nào trên trang.
// Nhờ vậy trang Tra từ (chiTiet) và trang Sổ từ (chiTietSoTu) dùng chung được một hàm.

// Hiện một lời nhắn vào khung (dùng khi ô trống, không tìm thấy, sổ trống...)
function hienLoiNhan(khung, chuHan, dong1, dong2) {
  khung.innerHTML = ''
  const loiNhan = taoThe('div', 'loi-nhan')
  loiNhan.appendChild(taoThe('div', 'chu-han', chuHan))
  loiNhan.appendChild(taoThe('div', '', dong1))
  if (dong2) loiNhan.appendChild(taoThe('div', '', dong2))
  khung.appendChild(loiNhan)
}

// Hiện chi tiết của một từ vào khung
// khiDoi: chuyển tiếp cho nút Lưu (xem taoNutLuu), trang Tra từ không cần nên bỏ trống
function hienChiTiet(khung, tu, khiDoi) {
  khung.innerHTML = ''

  khung.appendChild(taoThe('div', 'chu-han chu-to', tu.gian_the))          // chữ Hán rất to
  khung.appendChild(taoThe('div', 'pinyin-to', doiPinyinSangDau(tu.pinyin))) // pinyin có dấu

  // Chữ phồn thể: chỉ hiện khi khác chữ giản thể
  if (tu.phon_the !== tu.gian_the) {
    const dongPhonThe = taoThe('div', 'phon-the', 'Phồn thể: ')
    dongPhonThe.appendChild(taoThe('span', 'chu-han', tu.phon_the))
    khung.appendChild(dongPhonThe)
  }

  khung.appendChild(taoNutLuu(tu, khiDoi))

  // Các nghĩa: tách theo dấu ";" và hiện thành danh sách đánh số (thẻ <ol>)
  const danhSachNghia = taoThe('ol', 'danh-sach-nghia')
  tu.nghia.split(';').map((n) => n.trim()).filter((n) => n !== '').forEach((n) => {
    danhSachNghia.appendChild(taoThe('li', '', n))
  })
  khung.appendChild(danhSachNghia)
}

// Tạo MỘT dòng trong danh sách (dùng chung cho Tra từ và Sổ từ)
function taoDongTu(tu) {
  const dong = taoThe('li', 'dong-ket-qua')

  // Hàng trên: chữ Hán to + pinyin nhỏ màu xám
  const dongTren = taoThe('div', 'dong-tren')
  dongTren.appendChild(taoThe('span', 'chu-han', tu.gian_the))
  dongTren.appendChild(taoThe('span', 'pinyin', doiPinyinSangDau(tu.pinyin)))
  dong.appendChild(dongTren)

  // Hàng dưới: chỉ lấy nghĩa đầu tiên (phần trước dấu ";"), CSS sẽ tự cắt "…" nếu dài
  dong.appendChild(taoThe('div', 'nghia-ngan', tu.nghia.split(';')[0].trim()))

  return dong
}

// Vẽ nút theo trạng thái: đã lưu → "★ Đã lưu" (nền hồng), chưa lưu → "☆ Lưu"
function veNutLuu(nut, daLuu) {
  nut.textContent = daLuu ? '★ Đã lưu' : '☆ Lưu'
  nut.title = daLuu ? 'Bấm để bỏ lưu' : 'Bấm để lưu vào sổ từ'   // chữ hiện khi rê chuột
  nut.classList.toggle('da-luu', daLuu)   // toggle(lớp, true/false): thêm hoặc gỡ lớp CSS
}

// Hỏi sổ từ xem từ này đã lưu chưa, rồi vẽ nút cho đúng.
// Gọi khi vừa tạo nút, và khi quay lại một trang mà sổ từ có thể đã bị đổi ở trang khác.
async function dongBoNutLuu(nut, tu) {
  // Khoá nút trong lúc hỏi (để không bấm nhầm khi chưa rõ trạng thái)
  nut.disabled = true
  const daLuu = await window.soTu.daLuu(tu)
  // Trong lúc chờ, người dùng có thể đã chuyển sang từ khác và nút này đã bị xoá khỏi trang.
  // isConnected = false nghĩa là nút không còn trên trang → không cần làm gì nữa.
  if (!nut.isConnected) return
  veNutLuu(nut, daLuu)
  nut.disabled = false
}

// Tạo nút Lưu / Bỏ lưu cho một từ. Bấm lần nữa thì đảo trạng thái.
// Trạng thái hiện tại chỉ nằm ở MỘT chỗ: lớp CSS "da-luu" trên nút (do veNutLuu đặt).
// khiDoi (không bắt buộc): hàm được gọi sau mỗi lần lưu / bỏ lưu thành công,
// để trang Sổ từ cập nhật danh sách của nó.
function taoNutLuu(tu, khiDoi) {
  const nut = taoThe('button', 'nut nut-luu', '☆ Lưu')
  dongBoNutLuu(nut, tu)

  nut.addEventListener('click', async () => {
    nut.disabled = true   // chặn bấm 2 lần liên tiếp trong lúc đang ghi
    try {
      // Đang lưu → bỏ lưu; chưa lưu → lưu. Cả hai hàm đều trả về trạng thái mới.
      const dangLuu = nut.classList.contains('da-luu')
      const daLuu = dangLuu ? await window.soTu.boLuu(tu) : await window.soTu.luu(tu)
      veNutLuu(nut, daLuu)
      if (khiDoi) khiDoi(daLuu)
    } catch (loi) {
      console.error('Không cập nhật được sổ từ:', loi)   // lỗi thì nút giữ nguyên trạng thái cũ
    }
    nut.disabled = false
    oTim.focus()   // trả con trỏ về ô tìm để vẫn dùng được phím ↑ ↓ (trang khác thì không có tác dụng)
  })

  return nut
}

// Chọn từ thứ "chiSo" trong danh sách: tô nền dòng đó và hiện chi tiết bên phải
function chonTu(chiSo) {
  // Bỏ tô nền ở dòng đang chọn cũ (nếu có)
  const dongCu = ketQua.children[chiSoChon]
  if (dongCu) dongCu.classList.remove('dang-chon')

  chiSoChon = chiSo
  const dongMoi = ketQua.children[chiSo]
  dongMoi.classList.add('dang-chon')
  // Nếu dòng đang nằm ngoài vùng nhìn thấy thì cuộn danh sách vừa đủ để thấy nó
  dongMoi.scrollIntoView({ block: 'nearest' })

  hienChiTiet(chiTiet, danhSachTu[chiSo])
}

// Vẽ lại toàn bộ danh sách kết quả ở cột trái
function hienDanhSach() {
  ketQua.innerHTML = ''
  ketQua.scrollTop = 0   // lần tìm mới thì cuộn danh sách về đầu
  chiSoChon = -1

  danhSachTu.forEach((tu, chiSo) => {
    const dong = taoDongTu(tu)

    // Bấm chuột vào dòng thì chọn từ đó
    dong.addEventListener('click', () => {
      chonTu(chiSo)
      oTim.focus()   // giữ con trỏ trong ô tìm để vẫn dùng được phím ↑ ↓
    })

    ketQua.appendChild(dong)
  })
}

// Mỗi lần gõ (hoặc xoá) một ký tự trong ô tìm kiếm thì chạy đoạn này.
// "async" cho phép dùng "await" để chờ kết quả từ từ điển.
async function timKiem() {
  const tuKhoa = oTim.value.trim()
  lanTim = lanTim + 1
  const lanNay = lanTim   // ghi nhớ đây là lần tìm thứ mấy

  // Ô trống: xoá danh sách và hiện lời hướng dẫn
  if (tuKhoa === '') {
    danhSachTu = []
    hienDanhSach()
    hienLoiNhan(chiTiet, '学', 'Thử gõ: 学习, xuexi, ni hao, học', 'Gõ chữ Hán, pinyin hoặc nghĩa tiếng Việt (có dấu hay không dấu đều được)')
    return
  }

  // Nhờ main.js tìm trong data/tu-dien.db qua cầu nối window.tuDien (preload.js)
  const timDuoc = await window.tuDien.tim(tuKhoa)

  // Trong lúc chờ mà người dùng đã gõ thêm → kết quả này đã cũ, bỏ qua
  if (lanNay !== lanTim) return

  danhSachTu = timDuoc
  hienDanhSach()

  if (danhSachTu.length === 0) {
    hienLoiNhan(chiTiet, '？', 'Không tìm thấy từ nào')
  } else {
    chonTu(0)   // tự chọn kết quả đầu tiên
  }
}

oTim.addEventListener('input', timKiem)

// Phím tắt trong ô tìm: ↑ ↓ để di chuyển giữa các kết quả, Esc để xoá ô tìm
oTim.addEventListener('keydown', (suKien) => {
  if (suKien.key === 'ArrowDown' && chiSoChon < danhSachTu.length - 1) {
    suKien.preventDefault()   // chặn hành vi mặc định (đưa con trỏ chữ về cuối ô)
    chonTu(chiSoChon + 1)
  } else if (suKien.key === 'ArrowUp' && chiSoChon > 0) {
    suKien.preventDefault()   // chặn hành vi mặc định (đưa con trỏ chữ về đầu ô)
    chonTu(chiSoChon - 1)
  } else if (suKien.key === 'Escape') {
    oTim.value = ''
    timKiem()
  }
})

// =====================================================================
// 4. TRANG SỔ TỪ: danh sách từ đã lưu
// =====================================================================
const tieuDeSoTu = document.getElementById('tieuDeSoTu')
const khungSoTu = document.getElementById('khungSoTu')
const dsSoTu = document.getElementById('dsSoTu')
const chiTietSoTu = document.getElementById('chiTietSoTu')
const soTuTrong = document.getElementById('soTuTrong')

// Bấm một dòng trong sổ: tô nền dòng đó, hiện chi tiết bên phải
function chonTuTrongSo(dong, tu) {
  dsSoTu.querySelectorAll('.dang-chon').forEach((d) => d.classList.remove('dang-chon'))
  dong.classList.add('dang-chon')

  // Bỏ lưu ở đây thì dòng chưa biến mất ngay mà chỉ mờ đi (lớp "da-bo-luu"),
  // để lỡ tay còn bấm "☆ Lưu" lại được. Lần sau mở trang Sổ từ thì dòng đó mới mất hẳn.
  hienChiTiet(chiTietSoTu, tu, (daLuu) => {
    dong.classList.toggle('da-bo-luu', !daLuu)
    capNhatTieuDeSoTu()
  })
}

// Ghi số từ lên tiêu đề: đếm các dòng KHÔNG bị bỏ lưu
function capNhatTieuDeSoTu() {
  const soTu = dsSoTu.querySelectorAll('.dong-ket-qua:not(.da-bo-luu)').length
  tieuDeSoTu.textContent = 'Sổ từ (' + soTu + ' từ)'
}

// Đọc sổ từ (qua main.js) rồi vẽ lại cả trang
async function taiSoTu() {
  const cacTu = await window.soTu.danhSach()

  tieuDeSoTu.textContent = 'Sổ từ (' + cacTu.length + ' từ)'

  // Sổ trống: ẩn khung 2 cột, hiện câu hướng dẫn
  const trong = cacTu.length === 0
  khungSoTu.hidden = trong
  soTuTrong.hidden = !trong
  if (trong) {
    hienLoiNhan(soTuTrong, '☆', 'Chưa có từ nào. Hãy tra từ và bấm ☆ Lưu.')
    return
  }

  // Có từ: vẽ từng dòng, gắn sự kiện bấm cho mỗi dòng
  dsSoTu.innerHTML = ''
  dsSoTu.scrollTop = 0
  cacTu.forEach((tu) => {
    const dong = taoDongTu(tu)
    dong.addEventListener('click', () => chonTuTrongSo(dong, tu))
    dsSoTu.appendChild(dong)
  })

  // Tự chọn sẵn từ đầu tiên (từ mới lưu nhất), giống trang Tra từ
  chonTuTrongSo(dsSoTu.firstChild, cacTu[0])
}

// =====================================================================
// 5. TRANG ÔN TẬP: flashcard 10 từ
// =====================================================================
// Pinyin viết dạng có số (giống từ điển), khi hiện sẽ được đổi sang có dấu
const boTu = [
  { chu: '你好', pinyin: 'ni3 hao3',    nghia: 'Xin chào' },
  { chu: '学习', pinyin: 'xue2 xi2',    nghia: 'Học tập' },
  { chu: '谢谢', pinyin: 'xie4 xie5',   nghia: 'Cảm ơn' },
  { chu: '朋友', pinyin: 'peng2 you5',  nghia: 'Bạn bè' },
  { chu: '中国', pinyin: 'Zhong1 guo2', nghia: 'Trung Quốc' },
  { chu: '学校', pinyin: 'xue2 xiao4',  nghia: 'Trường học' },
  { chu: '老师', pinyin: 'lao3 shi1',   nghia: 'Giáo viên' },
  { chu: '学生', pinyin: 'xue2 sheng1', nghia: 'Học sinh' },
  { chu: '家人', pinyin: 'jia1 ren2',   nghia: 'Gia đình' },
  { chu: '工作', pinyin: 'gong1 zuo4',  nghia: 'Công việc' },
]
let viTri = 0

const chu = document.getElementById('chu')
const nghia = document.getElementById('nghia')
const nutXem = document.getElementById('nutXem')
const nutTruoc = document.getElementById('nutTruoc')
const nutTiep = document.getElementById('nutTiep')
const nutNgauNhien = document.getElementById('nutNgauNhien')
const dem = document.getElementById('dem')

// Hiện từ ở vị trí viTri lên thẻ, nghĩa ẩn sẵn
function hienTu() {
  const tu = boTu[viTri]
  chu.textContent = tu.chu
  nghia.textContent = doiPinyinSangDau(tu.pinyin) + ' — ' + tu.nghia
  nghia.style.visibility = 'hidden'
  nutXem.textContent = 'Xem nghĩa'
  dem.textContent = (viTri + 1) + ' / ' + boTu.length
}

// Bật / tắt phần nghĩa
nutXem.addEventListener('click', () => {
  if (nghia.style.visibility === 'visible') {
    nghia.style.visibility = 'hidden'
    nutXem.textContent = 'Xem nghĩa'
  } else {
    nghia.style.visibility = 'visible'
    nutXem.textContent = 'Ẩn nghĩa'
  }
})

// Từ tiếp theo (hết bộ thì quay về từ đầu)
nutTiep.addEventListener('click', () => {
  viTri = (viTri + 1) % boTu.length
  hienTu()
})

// Từ trước (đang ở từ đầu thì nhảy về từ cuối)
nutTruoc.addEventListener('click', () => {
  viTri = (viTri - 1 + boTu.length) % boTu.length
  hienTu()
})

// Chọn ngẫu nhiên một từ
nutNgauNhien.addEventListener('click', () => {
  viTri = Math.floor(Math.random() * boTu.length)
  hienTu()
})

// =====================================================================
// 6. KHỞI ĐỘNG: chuẩn bị sẵn các trang và đặt con trỏ vào ô tìm
// =====================================================================
hienTu()      // flashcard hiện sẵn từ đầu tiên
timKiem()     // ô tìm đang trống → hiện lời hướng dẫn
oTim.focus()  // tự focus ô tìm khi mở app
