// preload.js chạy TRƯỚC index.html, và là nơi duy nhất được nói chuyện với main.js.
// Ta chỉ mở cho trang web đúng những chức năng cần dùng: window.tuDien và window.soTu
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tuDien', {
  // Gửi từ khoá sang main.js (kênh 'tim-tu') và trả về một Promise chứa danh sách kết quả
  tim: (tuKhoa) => ipcRenderer.invoke('tim-tu', tuKhoa),
})

contextBridge.exposeInMainWorld('soTu', {
  // Lưu một từ vào sổ (tu gồm gian_the, phon_the, pinyin, nghia)
  luu: (tu) => ipcRenderer.invoke('so-tu:luu', tu),
  // Xoá một từ khỏi sổ
  boLuu: (tu) => ipcRenderer.invoke('so-tu:bo-luu', tu),
  // Hỏi xem từ (giản thể + phồn thể + pinyin) đã có trong sổ chưa → Promise chứa true / false
  daLuu: (tu) => ipcRenderer.invoke('so-tu:da-luu', tu),
  // Lấy mọi từ đã lưu, mới nhất lên đầu → Promise chứa một mảng
  danhSach: () => ipcRenderer.invoke('so-tu:danh-sach'),
})
