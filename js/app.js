// app.js — UI 交互 + 主流程 + 点位选择模态 + 缓存
// 对应 main.py: GeneratorApp GUI
// 用 IIFE 包裹,避免 let/const/function 污染全局作用域导致与其它脚本同名冲突

(function () {
'use strict';

// ==================== 全局错误捕获 ====================
// 任何 JS 错误都会被捕获并显示到日志区,避免静默失败
window.addEventListener('error', (e) => {
    try {
        const logEl = document.getElementById('log');
        if (logEl) {
            const ts = new Date().toTimeString().slice(0, 8);
            logEl.innerHTML += `<span class="ts">[${ts}]</span> <span class="err">❌ JS错误: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}</span>\n`;
            logEl.scrollTop = logEl.scrollHeight;
        }
        console.error('全局错误:', e.message, e.filename, e.lineno);
    } catch (_) { /* 忽略 */ }
});
window.addEventListener('unhandledrejection', (e) => {
    try {
        const logEl = document.getElementById('log');
        if (logEl) {
            const ts = new Date().toTimeString().slice(0, 8);
            const msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
            logEl.innerHTML += `<span class="ts">[${ts}]</span> <span class="err">❌ Promise未捕获: ${msg}</span>\n`;
            logEl.scrollTop = logEl.scrollHeight;
        }
    } catch (_) { /* 忽略 */ }
});

// 解构放到 init 内,避免顶层依赖失败导致整个脚本中断
let genDb, genFbMapping, genFbPokeBlk;
let downloadFile, downloadZip;

// ==================== 状态 ====================
const state = {
    points: null,
    lastFileName: null,
    lastIncludeM: null,
    currentFile: null,
};

// ==================== DOM 引用 ====================
const $ = id => document.getElementById(id);
const els = {
    fileInput: $('fileInput'),
    dropzone: $('dropzone'),
    fileInfo: $('fileInfo'),
    fileName: $('fileName'),
    filePoints: $('filePoints'),
    statusLed: $('statusLed'),
    statusText: $('statusText'),
    dbName: $('dbName'),
    fbName: $('fbName'),
    genDb: $('genDb'),
    genFb: $('genFb'),
    includeM: $('includeM'),
    pokeBlk: $('pokeBlk'),
    pokeRow: $('pokeRow'),
    dbNumber: $('dbNumber'),
    advEnabled: $('advEnabled'),
    advBody: $('advBody'),
    btnSelect: $('btnSelect'),
    selSummary: $('selSummary'),
    btnGenerate: $('btnGenerate'),
    btnPreview: $('btnPreview'),
    btnClear: $('btnClear'),
    log: $('log'),
    modalMask: $('modalMask'),
    modalClose: $('modalClose'),
    pointBody: $('pointBody'),
    modalOk: $('modalOk'),
    modalCancel: $('modalCancel'),
};

// ==================== 状态指示 ====================
function setStatus(level, text) {
    els.statusLed.className = 'led ' + (level || '');
    els.statusText.textContent = text;
}

// ==================== 日志 ====================
function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function log(msg, cls) {
    const ts = new Date().toTimeString().slice(0, 8);
    const span = cls ? `<span class="${cls}">${escapeHtml(msg)}</span>` : escapeHtml(msg);
    const line = `<span class="ts">[${ts}]</span> ${span}`;
    els.log.innerHTML += line + '\n';
    els.log.scrollTop = els.log.scrollHeight;
}
function clearLog() { els.log.innerHTML = ''; }

// ==================== 文件选择 ====================
function bindFile() {
    if (!els.dropzone || !els.fileInput) {
        console.error('bindFile 失败: dropzone 或 fileInput 元素不存在');
        return;
    }
    // 关键:fileInput 是 dropzone 的子元素,必须阻止它的 click 冒泡到 dropzone,
    // 否则会形成"dropzone click -> fileInput.click() -> 冒泡回 dropzone"的死循环,
    // 导致浏览器拦截点击,文件选择框无法弹出
    els.fileInput.addEventListener('click', e => e.stopPropagation());
    els.dropzone.addEventListener('click', (ev) => {
        ev.preventDefault();
        els.fileInput.click();
    });
    els.fileInput.addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) loadFile(f);
        // 允许重复选择同一文件(change 事件需要 value 重置才会再次触发)
        e.target.value = '';
    });
    ['dragover', 'dragenter'].forEach(ev =>
        els.dropzone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); els.dropzone.classList.add('dragover'); })
    );
    ['dragleave', 'drop'].forEach(ev =>
        els.dropzone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); els.dropzone.classList.remove('dragover'); })
    );
    els.dropzone.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        const f = e.dataTransfer && e.dataTransfer.files[0];
        if (f) loadFile(f);
    });
}

function loadFile(file) {
    state.currentFile = file;
    els.fileName.textContent = file.name;
    resetCache();
    setStatus('busy', '解析中');
    const reader = new FileReader();
    reader.onload = e => {
        try {
            // 解析以获取点数(供显示),实际生成时按当前 includeM 重新解析
            const pts = window.parsePlcTags(e.target.result, els.includeM.checked);
            state.points = pts;
            state.lastFileName = file.name;
            state.lastIncludeM = els.includeM.checked;
            const nIn = pts.filter(p => p.direction === 'input').length;
            const nOut = pts.filter(p => p.direction === 'output').length;
            const nM = pts.filter(p => p.direction === 'm').length;
            els.filePoints.textContent = `${pts.length} 点 · I:${nIn} Q:${nOut} M:${nM}`;
            els.fileInfo.hidden = false;
            setStatus('ok', '就绪');
            updateSelSummary();
            log(`✓ 已加载: ${file.name} (共 ${pts.length} 点,输入 ${nIn},输出 ${nOut},M点 ${nM})`, 'ok');
        } catch (err) {
            setStatus('err', '解析失败');
            els.fileInfo.hidden = true;
            log(`❌ 解析失败: ${err.message}`, 'err');
            alert(`解析失败:\n${err.message}`);
        }
    };
    reader.onerror = () => {
        setStatus('err', '读取失败');
        log('❌ 文件读取失败', 'err');
    };
    reader.readAsArrayBuffer(file);
}

// ==================== 缓存管理(等价 Python bug 5 修复)====================
function resetCache() {
    state.points = null;
    state.lastFileName = null;
    state.lastIncludeM = null;
    updateSelSummary();
}

// 解析(带缓存):文件名 + includeM 未变则复用缓存(保留用户选择),否则重新解析
async function loadPoints() {
    if (!state.currentFile) {
        return { error: '未选择 PLCTags.xlsx' };
    }
    const includeM = els.includeM.checked;
    const name = state.currentFile.name;
    if (state.points && state.lastFileName === name && state.lastIncludeM === includeM) {
        return { points: state.points };
    }
    // 重新解析
    const buf = await state.currentFile.arrayBuffer();
    try {
        const points = window.parsePlcTags(buf, includeM);
        state.points = points;
        state.lastFileName = name;
        state.lastIncludeM = includeM;
        // 更新显示
        const nIn = points.filter(p => p.direction === 'input').length;
        const nOut = points.filter(p => p.direction === 'output').length;
        const nM = points.filter(p => p.direction === 'm').length;
        els.filePoints.textContent = `${points.length} 点 · I:${nIn} Q:${nOut} M:${nM}`;
        return { points };
    } catch (err) {
        state.points = null;
        state.lastFileName = null;
        state.lastIncludeM = null;
        return { error: err.message };
    }
}

// 获取用于生成/预览的点位(应用高级设置)
async function getPointsForGen() {
    const { points, error } = await loadPoints();
    if (error) return { error };
    if (!els.advEnabled.checked) {
        // 未启用高级设置,强制全部选中
        points.forEach(p => p.selected = true);
    }
    return { points };
}

function updateSelSummary() {
    if (!els.advEnabled.checked) {
        els.selSummary.textContent = '未启用高级设置(将映射全部点位)';
        return;
    }
    if (!state.points) {
        els.selSummary.textContent = '已启用,尚未选择点位(将映射全部)';
        return;
    }
    const total = state.points.length;
    const sel = state.points.filter(p => p.selected).length;
    els.selSummary.textContent = sel === total
        ? `将映射全部 ${total} 个点位`
        : `已选 ${sel} / ${total} 个点位`;
}

// ==================== POKE_BLK / 高级设置 联动 ====================
function bindToggles() {
    els.pokeBlk.addEventListener('change', () => {
        els.pokeRow.classList.toggle('active', els.pokeBlk.checked);
    });
    els.includeM.addEventListener('change', async () => {
        resetCache();
        // 若已加载文件,重新解析以更新点数
        if (state.currentFile) {
            const buf = await state.currentFile.arrayBuffer();
            try {
                const points = window.parsePlcTags(buf, els.includeM.checked);
                state.points = points;
                state.lastFileName = state.currentFile.name;
                state.lastIncludeM = els.includeM.checked;
                const nIn = points.filter(p => p.direction === 'input').length;
                const nOut = points.filter(p => p.direction === 'output').length;
                const nM = points.filter(p => p.direction === 'm').length;
                els.filePoints.textContent = `${points.length} 点 · I:${nIn} Q:${nOut} M:${nM}`;
                els.fileInfo.hidden = false;
                updateSelSummary();
                log(`✓ M点开关变更: 重新解析为 ${points.length} 点(M点 ${nM})`, 'accent');
            } catch (err) {
                log(`❌ 重新解析失败: ${err.message}`, 'err');
            }
        }
    });
    els.advEnabled.addEventListener('change', () => {
        els.advBody.classList.toggle('active', els.advEnabled.checked);
        updateSelSummary();
    });
}

// ==================== 点位选择模态 ====================
function bindModal() {
    els.btnSelect.addEventListener('click', openSelectWindow);
    els.modalClose.addEventListener('click', closeModal);
    els.modalCancel.addEventListener('click', closeModal);
    els.modalMask.addEventListener('click', e => { if (e.target === els.modalMask) closeModal(); });
    els.modalOk.addEventListener('click', onModalOk);
    // 工具栏按钮
    document.querySelectorAll('[data-sel]').forEach(btn => {
        btn.addEventListener('click', () => bulkSelect(btn.dataset.sel));
    });
}

async function openSelectWindow() {
    const { points, error } = await loadPoints();
    if (error) { alert('请先选择有效的 PLCTags.xlsx:\n' + error); return; }
    if (!points.length) { alert('xlsx 中未找到 IO 点'); return; }

    // 渲染表格
    const tbody = els.pointBody;
    tbody.innerHTML = '';
    points.forEach((p, idx) => {
        const tr = document.createElement('tr');
        // 复选框
        const tdSel = document.createElement('td');
        tdSel.style.textAlign = 'center';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = p.selected;
        cb.dataset.idx = idx;
        tdSel.appendChild(cb);
        tr.appendChild(tdSel);
        // 名称
        const tdName = document.createElement('td');
        tdName.textContent = p.name;
        tr.appendChild(tdName);
        // 地址
        const tdAddr = document.createElement('td');
        tdAddr.textContent = p.address;
        tr.appendChild(tdAddr);
        // 类型
        const tdType = document.createElement('td');
        tdType.textContent = p.dataType;
        tr.appendChild(tdType);
        // 方向
        const tdDir = document.createElement('td');
        tdDir.className = 'cell-dir';
        if (p.direction === 'm') {
            const sel = document.createElement('select');
            [['输入', 'input'], ['输出', 'output']].forEach(([txt, val]) => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = txt;
                if (p.mDirection === val) opt.selected = true;
                sel.appendChild(opt);
            });
            sel.dataset.idx = idx;
            tdDir.appendChild(sel);
        } else {
            tdDir.textContent = p.direction === 'input' ? '输入' : '输出';
        }
        tr.appendChild(tdDir);
        tbody.appendChild(tr);
    });

    els.modalMask.hidden = false;
}

function closeModal() {
    els.modalMask.hidden = true;
}

function onModalOk() {
    // 把模态里的选择写回 point 对象(缓存)
    const rows = els.pointBody.querySelectorAll('tr');
    rows.forEach(tr => {
        const cb = tr.querySelector('input[type="checkbox"]');
        const idx = parseInt(cb.dataset.idx, 10);
        const p = state.points[idx];
        p.selected = cb.checked;
        const sel = tr.querySelector('select');
        if (sel) p.mDirection = sel.value;
    });
    closeModal();
    updateSelSummary();
    log('点位选择已更新: ' + els.selSummary.textContent, 'accent');
}

function bulkSelect(mode) {
    const rows = els.pointBody.querySelectorAll('tr');
    rows.forEach(tr => {
        const cb = tr.querySelector('input[type="checkbox"]');
        const sel = tr.querySelector('select');
        const idx = parseInt(cb.dataset.idx, 10);
        const p = state.points[idx];
        switch (mode) {
            case 'all': cb.checked = true; break;
            case 'none': cb.checked = false; break;
            case 'input':
                if (p.direction === 'input') cb.checked = true;
                else if (p.direction === 'm' && sel) cb.checked = sel.value === 'input';
                else cb.checked = false;
                break;
            case 'output':
                if (p.direction === 'output') cb.checked = true;
                else if (p.direction === 'm' && sel) cb.checked = sel.value === 'output';
                else cb.checked = false;
                break;
        }
    });
}

// ==================== 生成 / 预览 ====================
function bindActions() {
    els.btnGenerate.addEventListener('click', onGenerate);
    els.btnPreview.addEventListener('click', onPreview);
    els.btnClear.addEventListener('click', clearLog);
}

async function onGenerate() {
    const { points, error } = await getPointsForGen();
    if (error) { alert('错误:\n' + error); return; }

    const dbName = els.dbName.value.trim() || 'IO映射';
    const fbName = els.fbName.value.trim() || 'IO映射FB';
    const usePoke = els.pokeBlk.checked;

    const nIn = points.filter(p => p.direction === 'input').length;
    const nOut = points.filter(p => p.direction === 'output').length;
    const nM = points.filter(p => p.direction === 'm').length;
    const nSel = points.filter(p => p.selected).length;
    log(`开始生成: ${state.currentFile.name}`);
    log(`✓ 解析成功: 共 ${points.length} 点(输入${nIn},输出${nOut},M点${nM}),已选 ${nSel}`, 'ok');
    updateSelSummary();

    if (usePoke) {
        const numStr = els.dbNumber.value.trim();
        const dbNum = parseInt(numStr, 10);
        if (isNaN(dbNum)) { alert('DB 编号必须是整数:\n' + numStr); return; }
        log(`⚠ POKE_BLK 模式已启用,DB 编号=${dbNum}`, 'warn');
        log('⚠ 块移动覆盖整个字节范围(含未用位),仅适用于 IO 地址连续/可整体搬运场景', 'warn');
        log('⚠ DB 结构体偏移按 Bool 按位排列计算,如 TIA 中 DB 布局不同请手动调整偏移', 'warn');
    }

    const files = [];
    if (els.genDb.checked) {
        files.push({ name: `${dbName}.db`, content: genDb(points, dbName) });
        log(`✓ 生成 DB: ${dbName}.db`, 'ok');
    }
    if (els.genFb.checked) {
        const content = usePoke
            ? genFbPokeBlk(points, fbName, dbName, parseInt(els.dbNumber.value, 10) || 0)
            : genFbMapping(points, fbName, dbName);
        files.push({ name: `${fbName}.scl`, content });
        log(`✓ 生成 FB1: ${fbName}.scl${usePoke ? ' (POKE_BLK 模式)' : ''}`, 'ok');
    }

    if (!files.length) { alert('未选择任何生成项'); return; }

    // 下载:多文件打包 ZIP,单文件直接下载
    if (files.length === 1) {
        downloadFile(files[0].name, files[0].content);
    } else {
        await downloadZip('TIA-IO-Mapper-output.zip', files);
    }
    log('━━━ 完成 ━━━', 'accent');
    log('提示: TIA V18 → 项目树 → 外部源 → 右键 → 从文件导入', 'accent');
}

async function onPreview() {
    const { points, error } = await getPointsForGen();
    if (error) { alert('错误:\n' + error); return; }

    const dbName = els.dbName.value.trim() || 'IO映射';
    const fbName = els.fbName.value.trim() || 'IO映射FB';
    const usePoke = els.pokeBlk.checked;
    const nSel = points.filter(p => p.selected).length;

    clearLog();
    log('══════════════════════════════════════', 'sep');
    log(`预览生成结果 (已选 ${nSel}/${points.length} 个点位)`, 'accent');
    log('══════════════════════════════════════', 'sep');
    log('');
    log('───── DB ─────', 'sep');
    log(genDb(points, dbName));
    log('───── FB1(映射逻辑)─────', 'sep');
    if (usePoke) {
        const dbNum = parseInt(els.dbNumber.value, 10) || 0;
        log(`[POKE_BLK 模式 DB编号=${dbNum}]`, 'warn');
        log(genFbPokeBlk(points, fbName, dbName, dbNum));
    } else {
        log(genFbMapping(points, fbName, dbName));
    }
}

// ==================== 初始化 ====================
function init() {
    console.log('[app.js] init() 开始执行, readyState =', document.readyState);
    // 先绑定事件(不依赖外部模块),确保文件选择等功能始终可用
    try {
        bindFile();
        bindToggles();
        bindModal();
        bindActions();
        console.log('[app.js] 事件绑定完成');
    } catch (e) {
        console.error('[app.js] 事件绑定异常:', e);
        setStatus('err', '初始化失败');
        log(`❌ 初始化失败: ${e.message}`, 'err');
        return;
    }
    // 再加载依赖(放到 init 内,避免顶层解构失败导致整个脚本中断)
    try {
        if (!window.Generator) throw new Error('window.Generator 未定义(请检查 generator.js 是否加载成功)');
        if (!window.Downloader) throw new Error('window.Downloader 未定义(请检查 downloader.js 是否加载成功)');
        ({ genDb, genFbMapping, genFbPokeBlk } = window.Generator);
        ({ downloadFile, downloadZip } = window.Downloader);
        setStatus('', '待机');
        log('系统就绪 // 静态页面版 // 文件本地处理', 'accent');
        console.log('[app.js] 初始化完成, 依赖加载成功');
    } catch (e) {
        setStatus('err', '依赖加载失败');
        log(`❌ 依赖加载失败: ${e.message}`, 'err');
        log('⚠ 文件选择仍可用,但生成/预览功能可能异常', 'warn');
        console.error('[app.js] 依赖加载失败:', e);
    }
}

// 健壮的 DOM 就绪检查:兼容 DOMContentLoaded 已触发的情况
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOMContentLoaded 已触发(脚本异步加载等情况),直接执行
    init();
}

})();
