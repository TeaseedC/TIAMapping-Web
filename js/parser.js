// parser.js — xlsx 解析
// 对应 main.py: parse_plctags
// 依赖: SheetJS (XLSX 全局变量)
// 用 IIFE 包裹,避免 function 污染全局作用域
(function () {

function parsePlcTags(arrayBuffer, includeM) {
    if (typeof XLSX === 'undefined') {
        throw new Error('SheetJS 未加载');
    }
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    // 优先找 "PLC Tags" sheet,否则取第一个
    let wsName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'plc tags');
    if (!wsName) wsName = wb.SheetNames[0];
    if (!wsName) throw new Error('xlsx 中未找到工作表');
    const ws = wb.Sheets[wsName];

    // 数组形式读取(每行为数组)
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) throw new Error('xlsx 为空');

    // 表头定位
    const header = rows[0];
    const col = {};
    header.forEach((h, i) => { if (h !== '' && h != null) col[h] = i; });
    const required = ['Name', 'Path', 'Data Type', 'Logical Address'];
    for (const r of required) {
        if (!(r in col)) throw new Error(`表头缺少必要列: ${r}`);
    }
    const iName = col['Name'];
    const iPath = col['Path'];
    const iDtype = col['Data Type'];
    const iAddr = col['Logical Address'];
    const iComment = col['Comment'] != null ? col['Comment'] : -1;

    const points = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const name = String(row[iName] ?? '').trim();
        const addr = String(row[iAddr] ?? '').trim();
        if (!name || !addr) continue;

        const addrU = addr.toUpperCase();
        let direction;
        if (addrU.startsWith('%I')) direction = 'input';
        else if (addrU.startsWith('%Q')) direction = 'output';
        else if (addrU.startsWith('%M') && includeM) direction = 'm';
        else continue;

        const path = String(row[iPath] ?? '').trim();
        const dataType = String(row[iDtype] ?? 'Bool').trim() || 'Bool';
        const comment = iComment >= 0 ? String(row[iComment] ?? '').trim() : '';

        points.push(window.IOUtils.createIOPoint(name, path, dataType, addr, comment, direction));
    }
    return points;
}

window.parsePlcTags = parsePlcTags;

})();
