// generator.js — DB/FB1 生成器
// 对应 main.py: gen_db / gen_fb_mapping / gen_fb_mapping_pokeblk
// 行尾统一 \r\n(满足 TIA V18 导入要求)
// 用 IIFE 包裹,避免 const/function 污染全局作用域导致与 utils.js 同名冲突
(function () {
    const { fmtMember, fmtPhys, fmtDbRef, parseAddr, byteSpan, AREA_CODE } = window.IOUtils;
    const CRLF = '\r\n';

function selectedPoints(points) {
    return points.filter(p => p.selected);
}

function ceil8(n) {
    return (n + 7) >>> 3;
}

// ==================== DB 生成 ====================
function genDb(points, dbName) {
    const pts = selectedPoints(points);
    const inputs = pts.filter(p => p.direction === 'input');
    const outputs = pts.filter(p => p.direction === 'output');
    const mIn = pts.filter(p => p.direction === 'm' && p.mDirection === 'input');
    const mOut = pts.filter(p => p.direction === 'm' && p.mDirection === 'output');
    const hasM = mIn.length > 0 || mOut.length > 0;

    const lines = [
        `DATA_BLOCK "${dbName}"`,
        "{ S7_Optimized_Access := 'FALSE' }",
        'VERSION : 0.1',
        'NON_RETAIN',
        '   STRUCT',
        '      输入 : Struct'
    ];
    inputs.forEach(p => lines.push(`         ${fmtMember(p.name)} : ${p.dataType};`));
    lines.push('      END_STRUCT;');
    lines.push('      输出 : Struct');
    outputs.forEach(p => lines.push(`         ${fmtMember(p.name)} : ${p.dataType};`));
    lines.push('      END_STRUCT;');

    if (hasM) {
        lines.push('      M点 : Struct');
        if (mIn.length) {
            lines.push('         输入 : Struct');
            mIn.forEach(p => lines.push(`            ${fmtMember(p.name)} : ${p.dataType};`));
            lines.push('         END_STRUCT;');
        }
        if (mOut.length) {
            lines.push('         输出 : Struct');
            mOut.forEach(p => lines.push(`            ${fmtMember(p.name)} : ${p.dataType};`));
            lines.push('         END_STRUCT;');
        }
        lines.push('      END_STRUCT;');
    }

    lines.push('   END_STRUCT;');
    lines.push('');
    lines.push('');
    lines.push('BEGIN');
    lines.push('');
    lines.push('END_DATA_BLOCK');
    return lines.join(CRLF) + CRLF;
}

// ==================== FB1 逐位赋值 ====================
function genFbMapping(points, fbName, dbName) {
    const pts = selectedPoints(points);
    const inputs = pts.filter(p => p.direction === 'input');
    const outputs = pts.filter(p => p.direction === 'output');
    const mIn = pts.filter(p => p.direction === 'm' && p.mDirection === 'input');
    const mOut = pts.filter(p => p.direction === 'm' && p.mDirection === 'output');

    const lines = [
        `FUNCTION_BLOCK "${fbName}"`,
        "{ S7_Optimized_Access := 'TRUE' }",
        'VERSION : 0.1',
        '',
        '',
        'BEGIN',
        '    // ===== 输入映射:物理输入 -> 虚拟DB ====='
    ];
    inputs.forEach(p => lines.push(`    ${fmtDbRef(dbName, '输入', p.name)} := ${fmtPhys(p.name)};`));

    if (mIn.length) {
        lines.push('');
        lines.push('    // ===== M点输入映射:M点 -> 虚拟DB =====');
        mIn.forEach(p => lines.push(`    ${fmtDbRef(dbName, 'M点.输入', p.name)} := ${fmtPhys(p.name)};`));
    }

    lines.push('');
    lines.push('    // ===== 输出映射:虚拟DB -> 物理输出 =====');
    outputs.forEach(p => lines.push(`    ${fmtPhys(p.name)} := ${fmtDbRef(dbName, '输出', p.name)};`));

    if (mOut.length) {
        lines.push('');
        lines.push('    // ===== M点输出映射:虚拟DB -> M点 =====');
        mOut.forEach(p => lines.push(`    ${fmtPhys(p.name)} := ${fmtDbRef(dbName, 'M点.输出', p.name)};`));
    }

    lines.push('END_FUNCTION_BLOCK');
    return lines.join(CRLF) + CRLF;
}

// ==================== FB1 POKE_BLK 块移动 ====================
function genFbPokeBlk(points, fbName, dbName, dbNumber) {
    const pts = selectedPoints(points);
    const inputs = pts.filter(p => p.direction === 'input');
    const outputs = pts.filter(p => p.direction === 'output');
    const mIn = pts.filter(p => p.direction === 'm' && p.mDirection === 'input');
    const mOut = pts.filter(p => p.direction === 'm' && p.mDirection === 'output');

    // DB 结构体偏移(基于 Bool 按位排列假设)
    const inOff = 0;
    const outOff = ceil8(inputs.length) + ceil8(mIn.length);
    const mInOff = ceil8(inputs.length);
    const mOutOff = ceil8(inputs.length) + ceil8(mIn.length) + ceil8(outputs.length);
    const mStructOff = ceil8(inputs.length) + ceil8(mIn.length) + ceil8(outputs.length) + ceil8(mOut.length);
    const mInSubOff = 0;
    const mOutSubOff = ceil8(mIn.length);

    const lines = [
        `FUNCTION_BLOCK "${fbName}"`,
        "{ S7_Optimized_Access := 'TRUE' }",
        'VERSION : 0.1',
        '',
        '   VAR_TEMP',
        `      dbNum : DInt;  // "${dbName}" 的运行时编号`,
        '   END_VAR',
        '',
        '',
        'BEGIN',
        `    // 获取 DB "${dbName}" 的编号(POKE_BLK 需要数字编号)`,
        `    dbNum := ${dbNumber};  // 用户填写的 DB 编号,如不符请在 TIA 核对`,
        ''
    ];

    function emit(comment, srcArea, srcDb, srcOff, dstArea, dstDb, dstOff, count, warn) {
        lines.push(`    // ${comment}`);
        if (warn) lines.push(`    // ⚠ 警告: ${warn}`);
        lines.push(`    POKE_BLK(area_src := ${srcArea}, dbNumber_src := ${srcDb}, byteOffset_src := ${srcOff},`);
        lines.push(`             area_dest := ${dstArea}, dbNumber_dest := ${dstDb}, byteOffset_dest := ${dstOff},`);
        lines.push(`             count := ${count});`);
        lines.push('');
    }

    function isContinuousIo(pts) {
        // 检测一组点的 IO 地址是否连续且无空洞,且与 DB 结构体字节数一致。
        // 返回 { ok, reason }:ok=true 表示可用 POKE_BLK
        if (!pts.length) return { ok: true, reason: null };
        const span = byteSpan(pts);
        if (!span) return { ok: false, reason: '无法解析地址' };
        const ioSpan = span.max - span.min + 1;
        const dbBytes = ceil8(pts.length);
        if (ioSpan !== dbBytes) {
            return { ok: false, reason: `IO地址跨度(${ioSpan}字节)与DB结构体(${dbBytes}字节)不匹配` };
        }
        // 检测地址连续性:点位数 == ioSpan * 8 表示无空洞
        if (pts.length !== ioSpan * 8) {
            return { ok: false, reason: `IO地址跨度内存在空洞(跨度${ioSpan}字节应含${ioSpan * 8}个点,实际${pts.length}个)` };
        }
        return { ok: true, reason: null };
    }

    function emitBitAssignment(groupName, pts, dbStructPath) {
        // 输入型逐位赋值回退:物理点 -> DB
        lines.push(`    // ===== ${groupName}:地址不连续,自动回退到逐位赋值 =====`);
        pts.forEach(p => lines.push(`    ${fmtDbRef(dbName, dbStructPath, p.name)} := ${fmtPhys(p.name)};`));
        lines.push('');
    }

    function emitBitAssignmentOutput(groupName, pts, dbStructPath) {
        // 输出型逐位赋值回退:DB -> 物理点
        lines.push(`    // ===== ${groupName}:地址不连续,自动回退到逐位赋值 =====`);
        pts.forEach(p => lines.push(`    ${fmtPhys(p.name)} := ${fmtDbRef(dbName, dbStructPath, p.name)};`));
        lines.push('');
    }

    // 输入区 -> DB 输入结构体
    if (inputs.length) {
        const { ok, reason } = isContinuousIo(inputs);
        if (ok) {
            const span = byteSpan(inputs);
            const ioSpan = span.max - span.min + 1;
            const dbBytes = ceil8(inputs.length);
            emit(`输入块移动: %I${span.min}.0~%I${span.max}.7 (IO${ioSpan}字节,DB${dbBytes}字节) -> DB 输入结构体(偏移${inOff})`,
                '16#81', 0, span.min, '16#84', 'dbNum', inOff, ioSpan, null);
        } else {
            lines.push(`    // ⚠ 输入组 POKE_BLK 不可用: ${reason}`);
            emitBitAssignment('输入映射', inputs, '输入');
        }
    }
    // M点输入区 -> DB M点.输入
    if (mIn.length) {
        const { ok, reason } = isContinuousIo(mIn);
        if (ok) {
            const span = byteSpan(mIn);
            const ioSpan = span.max - span.min + 1;
            const dbBytes = ceil8(mIn.length);
            const absOff = mStructOff + mInSubOff;
            emit(`M点输入块移动: %M${span.min}.0~%M${span.max}.7 (IO${ioSpan}字节,DB${dbBytes}字节) -> DB M点.输入(偏移${absOff})`,
                '16#83', 0, span.min, '16#84', 'dbNum', absOff, ioSpan, null);
        } else {
            lines.push(`    // ⚠ M点输入组 POKE_BLK 不可用: ${reason}`);
            emitBitAssignment('M点输入映射', mIn, 'M点.输入');
        }
    }
    // DB 输出结构体 -> 输出区
    if (outputs.length) {
        const { ok, reason } = isContinuousIo(outputs);
        if (ok) {
            const span = byteSpan(outputs);
            const ioSpan = span.max - span.min + 1;
            const dbBytes = ceil8(outputs.length);
            emit(`输出块移动: DB 输出结构体(偏移${outOff}, DB${dbBytes}字节,IO${ioSpan}字节) -> %Q${span.min}.0~%Q${span.max}.7`,
                '16#84', 'dbNum', outOff, '16#82', 0, span.min, ioSpan, null);
        } else {
            lines.push(`    // ⚠ 输出组 POKE_BLK 不可用: ${reason}`);
            emitBitAssignmentOutput('输出映射', outputs, '输出');
        }
    }
    // DB M点.输出 -> M点输出区
    if (mOut.length) {
        const { ok, reason } = isContinuousIo(mOut);
        if (ok) {
            const span = byteSpan(mOut);
            const ioSpan = span.max - span.min + 1;
            const dbBytes = ceil8(mOut.length);
            const absOff = mStructOff + mOutSubOff;
            emit(`M点输出块移动: DB M点.输出(偏移${absOff}, DB${dbBytes}字节,IO${ioSpan}字节) -> %M${span.min}.0~%M${span.max}.7`,
                '16#84', 'dbNum', absOff, '16#83', 0, span.min, ioSpan, null);
        } else {
            lines.push(`    // ⚠ M点输出组 POKE_BLK 不可用: ${reason}`);
            emitBitAssignmentOutput('M点输出映射', mOut, 'M点.输出');
        }
    }

    lines.push('END_FUNCTION_BLOCK');
    return lines.join(CRLF) + CRLF;
}

window.Generator = { genDb, genFbMapping, genFbPokeBlk };
})();
