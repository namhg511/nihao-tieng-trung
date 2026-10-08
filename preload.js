// preload.js chạy TRƯỚC index.html, và là nơi duy nhất được nói chuyện với main.js.
// Ta chỉ mở cho trang web đúng một chức năng: window.tuDien.tim(tuKhoa)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tuDien', {
  // Gửi từ khoá sang main.js (kênh 'tim-tu') và trả về một Promise chứa danh sách kết quả
  tim: (tuKhoa) => ipcRenderer.invoke('tim-tu', tuKhoa),
})
