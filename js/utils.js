// utils.js — 数据模型 + 名称处理 + 地址解析
// 对应 main.py: IOPoint dataclass / needs_quote / fmt_member / fmt_phys / fmt_db_ref / _parse_addr / _byte_span
// 用 IIFE 包裹,避免 function/const 污染全局作用域
(function () {

// ==================== 数据模型 ====================
// 对应 Python IOPoint dataclass
function createIOPoint(name, path, dataType, address, comment, direction) {
    return {
        name, path, dataType, address, comment,
        direction,            // 'input' | 'output' | 'm'
        selected: true,       // 是否参与映射(高级选项可改)
        mDirection: 'input'  // 仅 M 点用(对应 Python 的 m_direction)
    };
}

// ==================== 名称处理 ====================
// 合法字符:ASCII 字母数字下划线 + 中文 + 全角括号（）
// 含其他字符(半角括号、空格、运算符等)需双引号包裹
// 正则等价 Python: [^A-Za-z0-9_\u4e00-\u9fff（）]
const ILLEGAL_CHAR_RE = /[^A-Za-z0-9_\u4e00-\u9fff（）]/;

function needsQuote(name) {
    return ILLEGAL_CHAR_RE.test(name);
}

function fmtMember(name) {
    return needsQuote(name) ? `"${name}"` : name;
}

function fmtPhys(name) {
    // 当前规则:直接用符号名(已去掉 X 前缀)
    return `"${name}"`;
}

function fmtDbRef(dbName, struct, member) {
    return `"${dbName}".${struct}.${fmtMember(member)}`;
}

// ==================== 地址解析(POKE_BLK 用)====================
// 区域码: I=16#81, Q=16#82, M=16#83, DB=16#84
const AREA_CODE = { 'I': '16#81', 'Q': '16#82', 'M': '16#83', 'DB': '16#84' };

// 解析 %I0.3 -> {area:'I', byte:0, bit:3}; %M0.0 -> {area:'M', byte:0, bit:0}
function parseAddr(addr) {
    const s = addr.trim().replace(/^%/, '');
    if (!s) return null;
    const areaChar = s[0].toUpperCase();
    if (!AREA_CODE[areaChar]) return null;
    const rest = s.slice(1);
    if (rest.includes('.')) {
        const parts = rest.split('.');
        const byte = parseInt(parts[0], 10);
        const bit = parseInt(parts[1], 10);
        if (isNaN(byte) || isNaN(bit)) return null;
        return { area: areaChar, byte, bit };
    }
    const byte = parseInt(rest, 10);
    return isNaN(byte) ? null : { area: areaChar, byte, bit: 0 };
}

// 计算一组点(同区)的最小/最大字节地址,返回 {min, max}
function byteSpan(points) {
    const bytes = points
        .map(p => parseAddr(p.address))
        .filter(a => a)
        .map(a => a.byte);
    if (!bytes.length) return null;
    return { min: Math.min(...bytes), max: Math.max(...bytes) };
}

// 暴露到全局
window.IOUtils = {
    createIOPoint, needsQuote, fmtMember, fmtPhys, fmtDbRef,
    AREA_CODE, parseAddr, byteSpan
};

})();
