/* ============================================================
   vim.js — 一个真正模态的 vim，跑在 xterm.js 里
   模式：NORMAL / INSERT / VISUAL / 命令行(: / ?)
   ============================================================ */
window.VimEditor = (function(){

  const R = '\x1b[0m';
  const c = {
    fg:   '\x1b[38;2;217;213;204m',
    soft: '\x1b[38;2;108;114;104m',
    grn:  '\x1b[38;2;143;179;154m',
    grn2: '\x1b[38;2;110;140;116m',
    sand: '\x1b[38;2;194;161;122m',
    cyan: '\x1b[38;2;140;166;170m',
    red:  '\x1b[38;2;198;122;110m',
    bar:  '\x1b[48;2;42;45;40m',
    sel:  '\x1b[7m',
    hit:  '\x1b[48;2;62;70;58m\x1b[38;2;212;178;132m',
  };
  const P = (t, col) => col + t + R;

  /* 显示宽度：全角/制表符按 2 列算 */
  const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6\u2500-\u257F\u2580-\u259F]/;
  const dw = s => { let n = 0; for (const ch of String(s)) n += (ch === '\t' ? 2 : (WIDE.test(ch) ? 2 : 1)); return n; };
  const dwSlice = (s, a, b) => dw(String(s).slice(a, b));

  let T = null, H = null;                 // term 与宿主回调
  const V = {
    on:false, path:'', lines:[''], dirty:false, readonly:false,
    cy:0, cx:0, top:0, left:0, mode:'n', num:true,
    msg:'', count:'', op:'', cmd:'', cmode:'', pend:'',
    sy:0, sx:0, regs:{}, undo:[], redo:[], search:'', sdir:1,
  };

  /* ---------- 基础工具 ---------- */
  const ll = i => (V.lines[i] || '').length;
  const clampCy = () => { V.cy = Math.max(0, Math.min(V.lines.length - 1, V.cy)); };
  const clampCx = () => {
    const L = ll(V.cy);
    const max = V.mode === 'i' ? L : Math.max(0, L - 1);
    V.cx = Math.max(0, Math.min(max, V.cx));
  };
  const firstBlank = i => { const t = V.lines[i] || ''; const m = t.match(/\S/); return m ? m.index : 0; };
  const text = () => V.lines.join('\n');
  const snapshot = () => ({ lines: V.lines.slice(), cy: V.cy, cx: V.cx });
  const pushUndo = () => { V.undo.push(snapshot()); if (V.undo.length > 200) V.undo.shift(); V.redo.length = 0; };

  /* ---------- 词移动 ---------- */
  const isWord = ch => /[A-Za-z0-9_\u4e00-\u9fa5]/.test(ch || '');
  function nextWord(cy, cx){
    let t = V.lines[cy] || '';
    let i = cx;
    if (i >= t.length) { return (cy < V.lines.length - 1) ? [cy + 1, firstBlank(cy + 1)] : [cy, Math.max(0, t.length - 1)]; }
    if (isWord(t[i])) { while (i < t.length && isWord(t[i])) i++; }
    else { while (i < t.length && !isWord(t[i])) i++; }
    while (i < t.length && /\s/.test(t[i])) i++;
    return [cy, Math.min(i, Math.max(0, t.length - 1))];
  }
  function prevWord(cy, cx){
    let t = V.lines[cy] || '';
    let i = cx - 1;
    if (i < 0) return cy > 0 ? [cy - 1, Math.max(0, ll(cy - 1) - 1)] : [0, 0];
    while (i > 0 && /\s/.test(t[i])) i--;
    if (isWord(t[i])) { while (i > 0 && isWord(t[i - 1])) i--; }
    else { while (i > 0 && !isWord(t[i - 1])) i--; }
    return [cy, i];
  }
  function endWord(cy, cx){
    const t = V.lines[cy] || '';
    let i = cx + 1;
    while (i < t.length && !isWord(t[i])) i++;
    while (i + 1 < t.length && isWord(t[i + 1])) i++;
    return [cy, Math.min(i, Math.max(0, t.length - 1))];
  }

  /* ---------- 移动 ---------- */
  function move(d, n){
    n = n || 1;
    switch (d){
      case 'h': V.cx = Math.max(0, V.cx - n); break;
      case 'l': V.cx = Math.min(Math.max(0, ll(V.cy) - 1), V.cx + n); break;
      case 'j': V.cy = Math.min(V.lines.length - 1, V.cy + n); break;
      case 'k': V.cy = Math.max(0, V.cy - n); break;
      case 'w': for (let i=0;i<n;i++){ const r = nextWord(V.cy, V.cx); V.cy=r[0]; V.cx=r[1]; } break;
      case 'b': for (let i=0;i<n;i++){ const r = prevWord(V.cy, V.cx); V.cy=r[0]; V.cx=r[1]; } break;
      case 'e': for (let i=0;i<n;i++){ const r = endWord(V.cy, V.cx); V.cy=r[0]; V.cx=r[1]; } break;
      case '0': V.cx = 0; break;
      case '^': V.cx = firstBlank(V.cy); break;
      case '$': V.cx = Math.max(0, ll(V.cy) - 1); break;
      case 'G': V.cy = (V.countRaw ? parseInt(V.countRaw) : V.lines.length) - 1; V.cx = firstBlank(V.cy); break;
      case 'gg': V.cy = (V.countRaw ? parseInt(V.countRaw) : 1) - 1; V.cx = firstBlank(V.cy); break;
      case '{': { let i = V.cy; while (i > 0 && (V.lines[i-1]||'').trim() !== '') i--; while (i > 0 && (V.lines[i-1]||'').trim() === '') i--; V.cy = i; V.cx = firstBlank(i); break; }
      case '}': { let i = V.cy; while (i < V.lines.length-1 && (V.lines[i+1]||'').trim() !== '') i++; while (i < V.lines.length-1 && (V.lines[i+1]||'').trim() === '') i++; V.cy = i; V.cx = firstBlank(i); break; }
    }
    clampCy(); clampCx();
  }
  const MOTIONS = 'hjklwbe0$^G{}';

  /* ---------- 删除 / 复制 ---------- */
  function normSel(){
    const a = [V.sy, V.sx], b = [V.cy, V.cx];
    return (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]))
      ? { sy:b[0], sx:b[1], ey:a[0], ex:a[1] }
      : { sy:a[0], sx:a[1], ey:b[0], ex:b[1] };
  }
  function yankRange(sy, sx, ey, ex, linewise){
    if (linewise) return { type:'line', data: V.lines.slice(sy, ey + 1) };
    if (sy === ey) return { type:'char', data: [V.lines[sy].slice(sx, ex + 1)] };
    const out = [V.lines[sy].slice(sx)];
    for (let i = sy + 1; i < ey; i++) out.push(V.lines[i]);
    out.push(V.lines[ey].slice(0, ex + 1));
    return { type:'char', data: out };
  }
  function delRange(sy, sx, ey, ex, linewise){
    const y = yankRange(sy, sx, ey, ex, linewise);
    if (linewise){ V.lines.splice(sy, ey - sy + 1); if (!V.lines.length) V.lines = ['']; V.cy = Math.min(sy, V.lines.length - 1); V.cx = firstBlank(V.cy); }
    else if (sy === ey){ V.lines[sy] = V.lines[sy].slice(0, sx) + V.lines[sy].slice(ex + 1); V.cy = sy; V.cx = Math.min(sx, Math.max(0, V.lines[sy].length - 1)); }
    else {
      const tail = V.lines[ey].slice(ex + 1);
      V.lines[sy] = V.lines[sy].slice(0, sx) + tail;
      V.lines.splice(sy + 1, ey - sy);
      V.cy = sy; V.cx = sx;
    }
    clampCy(); clampCx();
    return y;
  }
  function paste(reg, after){
    const r = V.regs[reg]; if (!r) return;
    pushUndo();
    if (r.type === 'line'){
      const at = after ? V.cy + 1 : V.cy;
      V.lines.splice(at, 0, ...r.data);
      V.cy = after ? at : at; V.cx = firstBlank(V.cy);
    } else {
      const t = V.lines[V.cy] || '';
      const pos = after ? V.cx + 1 : V.cx;
      if (r.data.length === 1){ V.lines[V.cy] = t.slice(0, pos) + r.data[0] + t.slice(pos); V.cx = pos + r.data[0].length - 1; }
      else {
        const head = t.slice(0, pos), tail = t.slice(pos);
        const mid = r.data.slice();
        mid[0] = head + mid[0];
        mid[mid.length - 1] = mid[mid.length - 1] + tail;
        V.lines.splice(V.cy, 1, ...mid);
        V.cy = V.cy + mid.length - 1; V.cx = Math.max(0, mid[mid.length-1].length - tail.length - 1);
      }
    }
    V.dirty = true; clampCy(); clampCx();
  }

  /* ---------- 绘制 ---------- */
  function sliceCols(s, from, width){
    let out = '', w = 0;
    for (const ch of String(s)){
      const cw = dw(ch);
      if (w >= from && w + cw <= from + width) out += ch;
      w += cw;
      if (w > from + width) break;
    }
    return out;
  }
  function hitsIn(t){
    const r = []; if (!V.search) return r;
    let i = 0;
    while ((i = t.indexOf(V.search, i)) >= 0){ r.push([i, i + V.search.length]); i += Math.max(1, V.search.length); }
    return r;
  }
  function paint(ln, line){
    const sel = V.mode === 'v' ? normSel() : null;
    const hs = hitsIn(line);
    let out = '';
    for (let i = 0; i < line.length; i++){
      const inSel = sel && ((ln > sel.sy && ln < sel.ey) ||
                    (ln === sel.sy && ln === sel.ey && i >= sel.sx && i <= sel.ex) ||
                    (ln === sel.sy && ln < sel.ey && i >= sel.sx) ||
                    (ln > sel.sy && ln === sel.ey && i <= sel.ex));
      const inHit = hs.some(h => i >= h[0] && i < h[1]);
      const ch = line[i] === '\t' ? '    ' : line[i];
      if (inSel) out += c.sel + ch + R;
      else if (inHit) out += c.hit + ch + R;
      else out += ch;
    }
    return out;
  }
  function statusText(){
    const W = T.cols;
    const name = V.path || '[未命名]';
    const L = P(name, c.grn) + (V.dirty ? P(' [+]', c.sand) : '') + (V.readonly ? P(' [只读]', c.red) : '');
    const pct = V.lines.length <= 1 ? 100 : Math.round(V.cy / (V.lines.length - 1) * 100);
    const MN = { n:['NORMAL', c.grn], i:['INSERT', c.sand], v:['VISUAL', c.cyan] }[V.mode];
    const right = P(`${V.cy + 1},${V.cx + 1}`, c.fg) + '  ' + P(pct + '%', c.soft) + '  ' + P(MN[0], MN[1]) + ' ';
    const left = V.msg ? P(V.msg, c.sand) : L;
    const gap = Math.max(1, W - dw(left.replace(/\x1b\[[0-9;]*m/g,'')) - dw(right.replace(/\x1b\[[0-9;]*m/g,'')));
    return left + ' '.repeat(gap) + right;
  }

  function draw(){
    if (!V.on || !T) return;
    const rows = T.rows, cols = T.cols, textH = rows - 1;
    clampCy(); clampCx();
    V.top = Math.max(0, Math.min(V.top, Math.max(0, V.lines.length - 1)));
    if (V.cy < V.top) V.top = V.cy;
    if (V.cy > V.top + textH - 1) V.top = V.cy - textH + 1;

    const gw = V.num ? String(V.lines.length).length + 1 : 0;
    const bw = Math.max(4, cols - gw);

    // 水平滚动
    const cxw = dwSlice(V.lines[V.cy], 0, V.cx);
    if (cxw < V.left) V.left = cxw;
    if (cxw >= V.left + bw - 1) V.left = cxw - bw + 2;
    V.left = Math.max(0, V.left);

    let s = '\x1b[2J\x1b[H';
    for (let i = 0; i < textH; i++){
      const ln = V.top + i;
      if (ln >= V.lines.length){ s += P('~', c.soft) + '\r\n'; continue; }
      const pre = V.num ? P(String(ln + 1).padStart(gw - 1) + ' ', c.soft) : '';
      const body = sliceCols(V.lines[ln], V.left, bw);
      s += pre + paint(ln, body) + '\r\n';
    }
    if (V.cmode){
      const left = V.cmode + V.cmd;
      s += c.bar + left + ' '.repeat(Math.max(0, cols - dw(left) - 1)) + R;
      s += `\x1b[${rows};${dw(left) + 1}H`;
    } else {
      s += c.bar + statusText() + R;
      const crow = V.cy - V.top + 1;
      const ccol = gw + (cxw - V.left) + 1;
      s += `\x1b[${crow};${Math.max(1, Math.min(cols, ccol))}H`;
    }
    T.write(s);
  }

  /* ---------- 打开 / 退出 ---------- */
  function open(path){
    V.on = true; V.path = path || ''; V.dirty = false; V.readonly = false;
    V.cy = V.cx = V.top = V.left = 0; V.mode = 'n'; V.count = ''; V.countRaw = '';
    V.op = ''; V.opN = 0; V.cmd = ''; V.cmode = ''; V.pend = ''; V.msg = ''; V.search = '';
    V.undo = []; V.redo = [];
    const content = path ? H.read(path) : null;
    if (content === null || content === undefined){
      V.lines = [''];
      V.msg = `"${path}" [新文件]`;
    } else {
      V.lines = String(content).split('\n');
      V.msg = `"${path}" ${V.lines.length}L`;
    }
    draw();
  }
  function quit(force){
    if (V.dirty && !force && !V.readonly){ V.msg = 'E37: 已修改但未保存（用 :q! 强制退出 或 :wq 保存）'; draw(); return; }
    V.on = false;
    T.write('\x1b[2J\x1b[H');
    H.onExit(V.msg || '');
  }
  function save(asPath){
    if (V.readonly){ V.msg = 'E45: 只读缓冲区'; draw(); return; }
    const p = asPath || V.path;
    if (!p){ V.msg = 'E32: 没有文件名'; draw(); return; }
    H.write(p, text());
    V.path = p; V.dirty = false;
    V.msg = `"${p}" ${V.lines.length}L, ${text().length}B 已写入`;
    draw();
  }

  /* ---------- ex 命令 ---------- */
  function ex(cmd){
    const raw = cmd.trim();
    const m = raw.match(/^(\d+)(.*)$/);
    if (m && !m[2]) { V.cy = Math.min(V.lines.length - 1, parseInt(m[1]) - 1); V.cx = firstBlank(V.cy); return; }

    const setM = raw.match(/^set?\s+(no)?(nu|number|list|readonly|ro)$/);
    if (setM){
      const off = !!setM[1], k = setM[2];
      if (k === 'nu' || k === 'number') V.num = !off;
      if (k === 'readonly' || k === 'ro') V.readonly = !off;
      V.msg = ''; return;
    }

    const parts = raw.split(/\s+/); const verb = parts[0];
    switch (verb){
      case 'w': case 'write': save(parts[1]); return;
      case 'q': case 'quit': quit(false); return;
      case 'q!': case 'quit!': quit(true); return;
      case 'wq': case 'x': case 'ZZ': save(); if (!V.dirty) quit(true); return;
      case 'wqa': case 'wq!': save(); quit(true); return;
      case 'qa': case 'qall': quit(true); return;
      case 'e': case 'edit': {
        const p = parts[1]; if (!p){ V.msg = 'E471: 需要文件名'; return; }
        const ct = H.read(p);
        if (ct === null || ct === undefined){ V.lines = ['']; V.msg = `"${p}" [新文件]`; }
        else { V.lines = String(ct).split('\n'); V.msg = `"${p}" ${V.lines.length}L`; }
        V.path = p; V.dirty = false; V.cy = V.cx = V.top = 0; return;
      }
      case 'help': {
        V.lines = HELP.slice(); V.path = '[vim-help]'; V.readonly = true; V.dirty = false;
        V.cy = V.cx = V.top = 0; V.msg = '帮助 · :q 退出'; return;
      }
      case 'sort': pushUndo(); V.lines.sort(); V.dirty = true; V.msg = `已排序 ${V.lines.length} 行`; return;
      case 'nohl': case 'noh': V.search = ''; return;
      default: break;
    }

    // 替换 :[range]s/a/b/[g]
    const sub = raw.match(/^(?:%|(\d+)(?:,(\d+))?)?s\/(.+?)\/(.*?)\/(g?)$/) ||
                raw.match(/^(?:%|(\d+)(?:,(\d+))?)?s\/(.+?)\/(.*?)$/);
    if (sub){
      const all = raw.startsWith('%') || sub[1] !== undefined;
      const a = sub[3], b = sub[4] || '', g = sub[5] === 'g';
      let s0 = V.cy, s1 = V.cy;
      if (raw.startsWith('%')) { s0 = 0; s1 = V.lines.length - 1; }
      else if (sub[1]) { s0 = parseInt(sub[1]) - 1; s1 = sub[2] ? parseInt(sub[2]) - 1 : s0; }
      pushUndo();
      let cnt = 0;
      for (let i = s0; i <= s1 && i < V.lines.length; i++){
        const before = V.lines[i];
        V.lines[i] = g ? before.split(a).join(b) : before.replace(a, b);
        if (V.lines[i] !== before) cnt++;
      }
      V.dirty = true; V.msg = `替换 ${cnt} 处` + (all ? '' : ' （当前行，用 %s 全文件）');
      return;
    }
    V.msg = `E492: 不是编辑器命令: ${raw}`;
  }

  const HELP = [
    'vim 帮助 · :q 退出本页',
    '',
    '  模式',
    '    i I a A o O   进入插入模式（光标前/行首/光标后/行尾/下插行/上插行）',
    '    v            进入可视模式，移动选区后 d 删除 / y 复制',
    '    :            进入命令行    /  ?    向下 / 向上搜索',
    '    Esc  Ctrl-C  回到普通模式',
    '',
    '  移动',
    '    h j k l      左 下 上 右            w b e    下一词 / 上一词 / 词尾',
    '    0 ^ $        行首 / 首个非空 / 行尾  gg G     首行 / 末行',
    '    { }          上一段 / 下一段          Ngg NG   跳到第 N 行',
    '    Ctrl-D Ctrl-U 下翻半屏 / 上翻半屏',
    '',
    '  编辑',
    '    x            删字符        dd        删整行（可带计数：3dd）',
    '    dw d$ d0     按动作删除    cc cw     删除并进入插入',
    '    yy yw        复制          p P       粘贴到后 / 前',
    '    r<char>      替换单字符    J         合并下一行',
    '    u            撤销          Ctrl-R    重做',
    '',
    '  命令行',
    '    :w           保存（写回虚拟文件系统，退出后 cat 可见）',
    '    :w <文件>    另存为        :q :q! :wq :x',
    '    :e <文件>    打开另一个文件    :help  打开本页',
    '    :set nu      显示行号      :set nonu  隐藏行号',
    '    :%s/a/b/g    全文件替换    :s/a/b/    当前行替换',
    '    :sort        排序          :N         跳到第 N 行',
    '',
    '  提示：这是用 JavaScript 实现的模态编辑器，不是 wasm 版 vim，',
    '        但它有真正的模式、寄存器、undo 栈和 ex 命令。',
  ];

  /* ---------- 按键：普通模式 ---------- */
  function norKey(d){
    // 计数：操作符待定时也允许继续输入（d2w / 2dd / d0）
    if (/^[0-9]$/.test(d) && (V.count !== '' || d !== '0')){
      V.count += d; V.countRaw = V.count; draw(); return;
    }
    const n = V.count ? parseInt(V.count) : (V.op ? (V.opN || 1) : 1);
    V.countRaw = V.count ? V.count : '';   // 只有真正输入过数字才算计数
    V.count = '';

    // 等待替换字符
    if (V.pend === 'r'){
      V.pend = '';
      if (d.length === 1){ pushUndo(); const t = V.lines[V.cy]; V.lines[V.cy] = t.slice(0, V.cx) + d + t.slice(V.cx + 1); V.dirty = true; }
      draw(); return;
    }
    if (V.pend === 'g'){ V.pend = ''; if (d === 'g'){ move('gg', n); } draw(); return; }

    // 操作符 + motion
    if (V.op){
      const op = V.op; V.op = ''; V.opN = 0;
      if (d === op){                                  // dd / yy / cc
        if (op === 'y'){                              // yy 只复制，不删
          V.regs['"'] = { type:'line', data: V.lines.slice(V.cy, V.cy + n) };
          V.msg = `${n} 行已复制`;
        } else {
          pushUndo();
          V.regs['"'] = delRange(V.cy, 0, Math.min(V.lines.length - 1, V.cy + n - 1), 0, true);
          if (op === 'c'){ V.mode = 'i'; V.lines.splice(V.cy, 0, ''); }
          else V.cx = firstBlank(V.cy);
          V.dirty = true; clampCx();
        }
        draw(); return;
      }
      if (MOTIONS.includes(d) || d === 'g'){
        if (d === 'g'){ V.pend = 'gOp:' + op; draw(); return; }
        const sy = V.cy, sx = V.cx;
        move(d, n);
        const ey = V.cy, ex = V.cx;
        const linewise = (d === 'j' || d === 'k');
        pushUndo();
        const r = delRange(Math.min(sy,ey), linewise ? 0 : Math.min(sx,ex), Math.max(sy,ey), linewise ? 0 : Math.max(sx,ex), linewise);
        V.regs['"'] = r;
        if (op === 'c'){ V.mode = 'i'; }
        else V.cx = Math.min(sx, Math.max(0, ll(V.cy) - 1));
        V.dirty = true; clampCx(); draw(); return;
      }
      draw(); return;
    }
    if (V.pend.startsWith('gOp:')){
      const op = V.pend.slice(4); V.pend = ''; V.opN = 0;
      if (d === 'g'){
        const sy = V.cy, sx = V.cx; move('gg', n);
        pushUndo();
        const r = delRange(Math.min(sy,V.cy), 0, Math.max(sy,V.cy), 0, true);
        V.regs['"'] = r; if (op === 'c') V.mode = 'i';
        V.dirty = true; clampCx(); draw();
      }
      return;
    }

    switch (d){
      case 'i': V.mode = 'i'; break;
      case 'a': V.mode = 'i'; V.cx = Math.min(ll(V.cy), V.cx + 1); break;
      case 'I': V.mode = 'i'; V.cx = firstBlank(V.cy); break;
      case 'A': V.mode = 'i'; V.cx = ll(V.cy); break;
      case 'o': pushUndo(); V.lines.splice(V.cy + 1, 0, ''); V.cy++; V.cx = 0; V.mode = 'i'; V.dirty = true; break;
      case 'O': pushUndo(); V.lines.splice(V.cy, 0, ''); V.cx = 0; V.mode = 'i'; V.dirty = true; break;
      case 'v': V.mode = 'v'; V.sy = V.cy; V.sx = V.cx; break;
      case 'V': V.mode = 'v'; V.sy = V.cy; V.sx = 0; V.cx = Math.max(0, ll(V.cy) - 1); break;
      case 'x': { pushUndo(); const t = V.lines[V.cy]; if (t.length){ V.regs['"'] = {type:'char', data:[t.slice(V.cx, V.cx + n)]}; V.lines[V.cy] = t.slice(0, V.cx) + t.slice(V.cx + n); V.dirty = true; } clampCx(); break; }
      case 'd': case 'c': case 'y': V.op = d; V.opN = n; break;
      case 'Y': pushUndo(); V.regs['"'] = {type:'line', data: V.lines.slice(V.cy, V.cy + n)}; V.msg = `${n} 行已复制`; break;
      case 'p': paste('"', true); break;
      case 'P': paste('"', false); break;
      case 'u': {
        if (!V.undo.length){ V.msg = '没有可撤销的操作'; break; }
        V.redo.push(snapshot());
        const s = V.undo.pop(); V.lines = s.lines; V.cy = s.cy; V.cx = s.cx;
        V.msg = `撤销（剩 ${V.undo.length}）`; break;
      }
      case '\x12': {   // Ctrl-R
        if (!V.redo.length){ V.msg = '没有可重做的操作'; break; }
        V.undo.push(snapshot());
        const s = V.redo.pop(); V.lines = s.lines; V.cy = s.cy; V.cx = s.cx;
        V.msg = '重做'; break;
      }
      case 'r': V.pend = 'r'; break;
      case 'J': { pushUndo(); if (V.cy < V.lines.length - 1){ V.lines[V.cy] += ' ' + V.lines[V.cy + 1]; V.lines.splice(V.cy + 1, 1); V.dirty = true; } break; }
      case 'g': V.pend = 'g'; break;
      case ':': V.cmode = ':'; V.cmd = ''; break;
      case '/': V.cmode = '/'; V.cmd = ''; break;
      case '?': V.cmode = '?'; V.cmd = ''; break;
      case 'n': case 'N': doSearch(d === 'n' ? 1 : -1); break;
      case '\x04': V.cy = Math.min(V.lines.length - 1, V.cy + Math.floor(T.rows / 2)); clampCx(); break;  // Ctrl-D
      case '\x15': V.cy = Math.max(0, V.cy - Math.floor(T.rows / 2)); clampCx(); break;                    // Ctrl-U
      case '\x0c': break;                                                                                  // Ctrl-L
      case '\x03': V.msg = ''; break;
      case '\x1b': V.msg = ''; break;
      case 'ZZ': save(); quit(true); return;
      default:
        if (MOTIONS.includes(d) || d === 'G'){ move(d, n); }
        else if (d.startsWith('\x1b[')){ arrow(d); }
        else if (d === '\r'){ V.cy = Math.min(V.lines.length - 1, V.cy + 1); V.cx = firstBlank(V.cy); }
    }
    draw();
  }
  function arrow(d){
    const tail = d.slice(2);
    if (tail === 'A') V.cy = Math.max(0, V.cy - 1);
    else if (tail === 'B') V.cy = Math.min(V.lines.length - 1, V.cy + 1);
    else if (tail === 'C') V.cx = Math.min(Math.max(0, ll(V.cy) - 1), V.cx + 1);
    else if (tail === 'D') V.cx = Math.max(0, V.cx - 1);
    clampCx();
  }
  function doSearch(dir){
    if (!V.search){ V.msg = 'E35: 没有之前的搜索'; return; }
    const total = V.lines.length;
    for (let k = 1; k <= total; k++){
      const i = (V.cy + dir * k % total + total) % total;
      const line = V.lines[i] || '';
      const at = (dir > 0 ? (i === V.cy ? line.indexOf(V.search, V.cx + 1) : line.indexOf(V.search)) : line.lastIndexOf(V.search, i === V.cy ? V.cx - 1 : line.length));
      if (at >= 0){ V.cy = i; V.cx = at; return; }
    }
    V.msg = `E384: 找不到 "${V.search}"`;
  }

  /* ---------- 按键：插入模式 ---------- */
  function insKey(d){
    if (d === '\x1b' || d === '\x03'){ V.mode = 'n'; clampCx(); draw(); return; }
    if (d === '\r'){
      pushUndo();
      const t = V.lines[V.cy] || '';
      V.lines[V.cy] = t.slice(0, V.cx);
      V.lines.splice(V.cy + 1, 0, t.slice(V.cx));
      V.cy++; V.cx = 0; V.dirty = true; draw(); return;
    }
    if (d === '\x7f' || d === '\b'){
      pushUndo();
      const t = V.lines[V.cy] || '';
      if (V.cx > 0){ V.lines[V.cy] = t.slice(0, V.cx - 1) + t.slice(V.cx); V.cx--; V.dirty = true; }
      else if (V.cy > 0){ V.lines[V.cy - 1] += t; V.lines.splice(V.cy, 1); V.cy--; V.cx = ll(V.cy); V.dirty = true; }
      draw(); return;
    }
    if (d === '\t'){ insert('    '); return; }
    if (d.startsWith('\x1b[')){ arrow(d); draw(); return; }
    if (d >= ' ' || d === '\t'){ insert(d); return; }
    draw();
  }
  function insert(s){
    pushUndo();
    const t = V.lines[V.cy] || '';
    V.lines[V.cy] = t.slice(0, V.cx) + s + t.slice(V.cx);
    V.cx += s.length; V.dirty = true; draw();
  }

  /* ---------- 按键：可视模式 ---------- */
  function visKey(d){
    if (d === '\x1b' || d === '\x03'){ V.mode = 'n'; draw(); return; }
    if (d === 'd' || d === 'x'){
      const s = normSel(); pushUndo();
      const linewise = (V.sx === 0 && V.cx >= Math.max(0, ll(V.cy) - 1) && s.ey > s.sy);
      V.regs['"'] = delRange(s.sy, s.sx, s.ey, s.ex, false);
      V.mode = 'n'; V.dirty = true; clampCy(); clampCx(); draw(); return;
    }
    if (d === 'y'){
      const s = normSel();
      V.regs['"'] = yankRange(s.sy, s.sx, s.ey, s.ex, false);
      V.cy = s.sy; V.cx = s.sx; V.mode = 'n'; V.msg = '已复制选区'; clampCx(); draw(); return;
    }
    if (d === 'c'){
      const s = normSel(); pushUndo();
      V.regs['"'] = delRange(s.sy, s.sx, s.ey, s.ex, false);
      V.mode = 'i'; V.dirty = true; clampCy(); clampCx(); draw(); return;
    }
    if (d === ':'){ V.cmode = ':'; V.cmd = "'<,'>"; draw(); return; }
    if (MOTIONS.includes(d)){ move(d, V.count ? parseInt(V.count) : 1); V.count = ''; draw(); return; }
    if (/^[1-9]$/.test(d)){ V.count += d; draw(); return; }
    if (d.startsWith('\x1b[')){ arrow(d); draw(); return; }
    draw();
  }

  /* ---------- 按键：命令行 ---------- */
  function cmdKey(d){
    if (d === '\x1b'){ V.cmode = ''; V.cmd = ''; draw(); return; }
    if (d === '\r'){
      const cm = V.cmode, val = V.cmd; V.cmode = ''; V.cmd = '';
      if (cm === ':'){ ex(val); draw(); return; }
      V.search = val; V.sdir = cm === '/' ? 1 : -1;
      V.msg = ''; doSearch(V.sdir); draw(); return;
    }
    if (d === '\x7f' || d === '\b'){ V.cmd = V.cmd.slice(0, -1); draw(); return; }
    if (d === '\x15'){ V.cmd = ''; draw(); return; }
    if (d >= ' '){ V.cmd += d; draw(); return; }
    draw();
  }

  /* ---------- 对外 ---------- */
  return {
    get active(){ return V.on; },
    install(term, hooks){ T = term; H = hooks; },
    open(path){ open(path); },
    draw(){ draw(); },
    resize(){ if (V.on) draw(); },
    key(d){
      if (!V.on) return false;
      if (V.cmode) cmdKey(d);
      else if (V.mode === 'i') insKey(d);
      else if (V.mode === 'v') visKey(d);
      else norKey(d);
      return true;
    },
    state(){ return { path: V.path, lines: V.lines.length, mode: V.mode, dirty: V.dirty }; },
  };
})();
