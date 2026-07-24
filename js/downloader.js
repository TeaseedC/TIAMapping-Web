// downloader.js — 文件编码与下载
// 对应 main.py: write_source (UTF-8 BOM + CRLF)
// 用 IIFE 包裹,避免 function 污染全局作用域导致与 app.js 同名冲突
(function () {

// 下载单个文件(UTF-8 BOM,内容应已是 CRLF)
function downloadFile(filename, content) {
    // UTF-8 BOM: \uFEFF
    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 下载多文件打包 ZIP(需 JSZip)
async function downloadZip(zipName, files) {
    if (typeof JSZip === 'undefined') {
        // 回退:逐个下载
        files.forEach(f => downloadFile(f.name, f.content));
        return;
    }
    const zip = new JSZip();
    files.forEach(f => zip.file(f.name, '\uFEFF' + f.content));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.Downloader = { downloadFile, downloadZip };

})();
