const { app, BrowserWindow } = require('electron')

function taoCuaSo() {
  const cuaSo = new BrowserWindow({ width: 800, height: 600 })
  cuaSo.loadFile('index.html')
}

app.whenReady().then(taoCuaSo)
app.on('window-all-closed', () => app.quit())