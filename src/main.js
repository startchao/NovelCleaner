import './style.css';

const state = {
  file: null,
  raw: '',
  clean: '',
  title: '',
  author: '',
  mode: 'tw',
  output: 'txt',
  paragraphMax: 220,
  stats: null,
  opts: {
    removeAds: true,
    removeSeparators: true,
    fixBrokenWords: true,
    convertTraditional: true,
    dedupeChapterTitles: true,
    removeFrontMatter: true,
    normalizeSpacing: true,
    repairBrokenLines: true,
    splitLongParagraphs: false,
    splitDialogueParagraphs: true,
  },
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const phraseMap = [
  ['里面','裡面'],['这里','這裡'],['这','這'],['个','個'],['为','為'],['与','與'],['后','後'],['说','說'],['时','時'],['会','會'],['来','來'],['对','對'],['过','過'],['没','沒'],['见','見'],['门','門'],['开','開'],['关','關'],['点','點'],['头','頭'],['发','發'],['长','長'],['万','萬'],['东','東'],['风','風'],['云','雲'],['国','國'],['体','體'],['语','語'],['书','書'],['号','號'],['杀','殺'],['稳','穩'],['卫','衛'],['护','護'],['镇','鎮'],['魔','魔'],['司','司'],['鲜','鮮'],['血','血'],['众','眾'],['气','氣'],['给','給'],['从','從'],['当','當'],['则','則'],['还','還'],['无','無'],['将','將'],['师','師'],['义','義'],['变','變'],['处','處'],['经','經'],['线','線'],['网','網'],['页','頁'],['章节','章節'],['标题','標題'],['台湾','台灣'],['香港','香港']
];
const hkMap = [['裡','裏'],['台','臺']];
let activeConverter = null;
let converterCache = null;

function render() {
  $('#app').innerHTML = `
  <main class="wrap">
    <section class="hero"><div class="logo">📚</div><div><h1>轉書坊</h1><p>TXT/MD 小說前處理 · 修章名 · 去廣告 · 轉繁體 · 匯出 TXT/EPUB</p></div></section>
    <section class="card"><div class="sec-title">01 上傳小說檔案</div>
      <div class="drop" id="drop"><div><div style="font-size:42px">📄</div><p class="hint">支援 TXT / MD · UTF‑8 / Big5 / GB18030 · 建議單檔 100MB 內</p><label class="filebtn">選擇檔案<input id="file" type="file" accept=".txt,.md,text/plain,text/markdown"></label><p id="fname" class="hint">${state.file ? esc(state.file.name) : '尚未選擇檔案'}</p></div></div>
    </section>
    <section class="card"><div class="sec-title">02 書籍資訊</div>
      <div class="grid two"><label>書名<input class="textin" id="title" value="${esc(state.title)}" placeholder="留空自動使用檔名 / 內文標題"></label><label>作者<input class="textin" id="author" value="${esc(state.author)}" placeholder="選填；可自動從 作者： 擷取"></label></div>
    </section>
    <section class="card"><div class="sec-title">03 處理選項</div><div class="opts">${optRows()}</div>
      <div class="grid two" style="margin-top:12px"><label>長段落檢查門檻<input class="textin" id="paragraphMax" type="number" min="120" max="800" step="20" value="${state.paragraphMax}"></label><p class="hint">預設不硬切句子，只標記過長段落；如果要自動切，才打開「長段落自動切分」。</p></div><div class="seg" style="margin-top:12px"><button data-mode="tw" class="${state.mode==='tw'?'on':''}">台灣用詞</button><button data-mode="hk" class="${state.mode==='hk'?'on':''}">香港用詞</button><button data-mode="std" class="${state.mode==='std'?'on':''}">標準繁體</button></div>
    </section>
    <section class="card"><div class="sec-title">04 輸出格式</div><div class="seg"><button data-output="txt" class="${state.output==='txt'?'on':''}">處理後 TXT</button><button data-output="epub" class="${state.output==='epub'?'on':''}">EPUB 檔案</button></div></section>
    <section class="card"><div class="actions"><button class="primary" id="run">⚡ 開始處理</button><button class="ghost" id="downloadTxt" ${state.clean?'':'disabled'}>下載 TXT</button><button class="ghost" id="downloadEpub" ${state.clean?'':'disabled'}>下載 EPUB</button></div>${statsHtml()}</section>
    <section class="card"><div class="sec-title">05 處理紀錄</div><div class="log" id="log">${state.stats ? esc(state.stats.log.join('\n')) : '尚未處理。'}</div></section>
    <section class="card"><div class="sec-title">06 預覽</div><textarea readonly>${esc(state.clean.slice(0, 12000))}</textarea><p class="hint">預覽最多顯示前 12,000 字；下載會輸出完整內容。</p></section>
  </main>`;
  bind();
}

function optRows() {
  const defs = [
    ['removeAds','廣告與網站名過濾','移除爬蟲網站插入的廣告、網址與閱讀提示'],
    ['removeSeparators','分隔線清除','移除 ===、---、~~~、＊ 等純符號行'],
    ['fixBrokenWords','修復拆字詞彙','修正「谷欠→欲、氵去→法、身寸→射」等常見避審拆字'],
    ['convertTraditional','簡體→繁體轉換','改用 OpenCC 轉換：台灣、香港、標準繁體三種模式'],
    ['dedupeChapterTitles','重複章節名稱清理','處理圖三到圖五那種同章名、日期、作者、空白頁重複問題'],
    ['removeFrontMatter','移除章節前雜訊','刪除章名後緊接的日期、作者、來源、空白 metadata 行'],
    ['normalizeSpacing','空白與段落整理','合併過多空行、整理全形空白與標點周圍空格'],
    ['repairBrokenLines','錯誤換行修復','把被硬切成多行的同一段文字合併，避免一句話被切碎'],
    ['splitLongParagraphs','長段落自動切分（預設關）','只在你明確打開時，才依標點把超長段落切開；平常只檢查不硬切'],
    ['splitDialogueParagraphs','對話段落整理','只針對引號對話與「某某說道」這類明顯邊界補分行，避免整頁黏成一段'],
  ];
  return defs.map(([k,t,d]) => `<div class="opt"><div><b>${t}</b><span>${d}</span></div><label class="sw"><input type="checkbox" data-opt="${k}" ${state.opts[k]?'checked':''}><span class="knob"></span></label></div>`).join('');
}

function statsHtml() {
  if (!state.stats) return '<p class="hint">會顯示刪除廣告、分隔線、重複章名、章節數與字數變化。</p>';
  const s = state.stats;
  return `<div class="stats"><div class="stat"><b>${s.chapters}</b><span>章節</span></div><div class="stat"><b>${s.removedAds}</b><span>廣告</span></div><div class="stat"><b>${s.removedDupes}</b><span>重複章名</span></div><div class="stat"><b>${s.splitParagraphs}</b><span>切段</span></div><div class="stat"><b>${s.mergedLines}</b><span>併行</span></div><div class="stat"><b>${s.suspiciousParagraphs}</b><span>待檢</span></div><div class="stat"><b>${s.outChars}</b><span>輸出字數</span></div></div>`;
}

function bind() {
  $('#file')?.addEventListener('change', e => loadFile(e.target.files[0]));
  const drop = $('#drop');
  drop?.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop?.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop?.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); loadFile(e.dataTransfer.files[0]); });
  $('#title')?.addEventListener('input', e => state.title = e.target.value);
  $('#author')?.addEventListener('input', e => state.author = e.target.value);
  $('#paragraphMax')?.addEventListener('input', e => state.paragraphMax = Number(e.target.value) || 220);
  $$('[data-opt]').forEach(i => i.addEventListener('change', e => state.opts[e.target.dataset.opt] = e.target.checked));
  $$('[data-mode]').forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; render(); }));
  $$('[data-output]').forEach(b => b.addEventListener('click', () => { state.output = b.dataset.output; render(); }));
  $('#run')?.addEventListener('click', processNovel);
  $('#downloadTxt')?.addEventListener('click', () => downloadText());
  $('#downloadEpub')?.addEventListener('click', () => downloadEpub());
}

async function loadFile(file) {
  if (!file) return;
  state.file = file;
  const buf = await file.arrayBuffer();
  state.raw = decodeBuffer(buf);
  if (!state.title) state.title = file.name.replace(/\.(txt|md)$/i, '');
  const author = state.raw.match(/作者[：: ]+([^\n\r]{1,30})/);
  if (author && !state.author) state.author = author[1].trim();
  state.clean = '';
  state.stats = null;
  render();
}

function decodeBuffer(buf) {
  const tryDecode = enc => { try { return new TextDecoder(enc, { fatal: false }).decode(buf); } catch { return ''; } };
  const utf8 = tryDecode('utf-8');
  const bad = (utf8.match(/�/g) || []).length;
  if (bad < 8) return utf8.replace(/^\uFEFF/, '');
  return (tryDecode('gb18030') || tryDecode('big5') || utf8).replace(/^\uFEFF/, '');
}

async function processNovel() {
  if (!state.raw) return alert('請先選擇 TXT / MD 檔案');
  const log = [];
  let lines = state.raw.replace(/\r\n?/g, '\n').split('\n');
  const before = lines.join('\n').length;
  const stats = { chapters: 0, removedAds: 0, removedSeparators: 0, removedDupes: 0, removedFront: 0, mergedLines: 0, splitParagraphs: 0, suspiciousParagraphs: 0, outChars: 0, log };
  log.push(`讀入：${state.file?.name || '文字'}，${before.toLocaleString()} 字`);

  lines = lines.map(l => l.replace(/\u00a0/g, ' ').replace(/[ \t]+$/g, ''));
  if (state.opts.removeAds) lines = removeAds(lines, stats);
  if (state.opts.removeSeparators) lines = removeSeparators(lines, stats);
  if (state.opts.fixBrokenWords) lines = lines.map(fixBrokenWords);
  if (state.opts.convertTraditional) {
    activeConverter = await getOpenCCConverter();
    lines = lines.map(toTraditional);
    log.push(`已使用 OpenCC 轉換為${state.mode === 'hk' ? '香港繁體' : state.mode === 'std' ? '標準繁體' : '台灣繁體'}`);
  }
  if (state.opts.normalizeSpacing) lines = normalizeSpacing(lines);
  if (state.opts.repairBrokenLines) lines = repairBrokenLines(lines, stats);
  if (state.opts.dedupeChapterTitles || state.opts.removeFrontMatter) lines = cleanChapters(lines, stats);
  if (state.opts.splitDialogueParagraphs || state.opts.splitLongParagraphs) lines = adjustParagraphs(lines, stats);
  if (state.opts.normalizeSpacing) lines = normalizeSpacing(lines);

  const txt = lines.join('\n').trim() + '\n';
  stats.chapters = lines.filter(isChapterTitle).length;
  stats.outChars = txt.length;
  stats.log.push(`輸出：${stats.outChars.toLocaleString()} 字，偵測 ${stats.chapters} 章`);
  if (stats.removedFront) stats.log.push(`已移除章節前 metadata / 空白頁：${stats.removedFront} 行`);
  if (stats.mergedLines) stats.log.push(`已合併疑似錯誤換行：${stats.mergedLines} 行`);
  if (stats.splitParagraphs) stats.log.push(`已切分過長／對話段落：${stats.splitParagraphs} 段`);
  if (stats.suspiciousParagraphs) stats.log.push(`仍有偏長段落需人工檢查：${stats.suspiciousParagraphs} 段`);
  state.clean = txt;
  state.stats = stats;
  render();
}

function removeAds(lines, stats) {
  const patterns = [
    /https?:\/\//i,/www\./i,/\.com|\.net|\.org|\.tw|\.cn/i,
    /請收藏|请收藏|收藏本站|加入書架|加入书架/i,
    /最新網址|最新网址|最新地址|最新域名|備用域名|备用域名|本站域名|首發域名|首发域名/i,
    /手機閱讀|手机阅读|無彈窗|无弹窗|免費閱讀|免费阅读|全文閱讀|全文阅读/i,
    /本章未完|點擊下一頁|点击下一页|下一章|上一章/i,
    /天才一秒記住|天才一秒钟记住|app下載|app下载|下載APP|下载APP/i,
    /筆趣閣|笔趣阁|起點中文|起点中文|番茄小說|番茄小说/i,
    /飄天|飘天|piaotian|ptwx|69書吧|69书吧|六九書吧|六九书吧|69shu|69shuba|69zw|69txt/i,
  ];
  return lines.filter(l => { const hit = patterns.some(p => p.test(l)); if (hit) stats.removedAds++; return !hit; });
}
function removeSeparators(lines, stats) {
  return lines.filter(l => { const t = l.trim(); const hit = /^[=\-—_~＊*·•。\s]{3,}$/.test(t); if (hit) stats.removedSeparators++; return !hit; });
}
function fixBrokenWords(s) {
  return s.replace(/谷\s*欠/g, '欲').replace(/氵\s*去/g, '法').replace(/身\s*寸/g, '射').replace(/口\s*交/g, '咬').replace(/忄\s*青/g, '情').replace(/亻\s*爾/g, '你').replace(/女\s*干/g, '奸');
}
async function getOpenCCConverter() {
  if (!converterCache) {
    const { Converter } = await import('opencc-js');
    converterCache = {
      tw: Converter({ from: 'cn', to: 'tw' }),
      hk: Converter({ from: 'cn', to: 'hk' }),
      std: Converter({ from: 'cn', to: 't' }),
    };
  }
  return converterCache[state.mode] || converterCache.tw;
}

function toTraditional(s) {
  let out = activeConverter ? activeConverter(s) : s;
  // Small post-fix fallback for crawler fragments or custom wording not covered by OpenCC.
  for (const [a,b] of phraseMap) out = out.replaceAll(a,b);
  if (state.mode === 'hk') for (const [a,b] of hkMap) out = out.replaceAll(a,b);
  return out;
}
function normalizeSpacing(lines) {
  const out = [];
  let blank = 0;
  for (let l of lines) {
    l = l.replace(/^[\s　]+|[\s　]+$/g, '').replace(/[　]{2,}/g, '　');
    if (!l) { blank++; if (blank <= 1) out.push(''); }
    else { blank = 0; out.push(l); }
  }
  return out;
}
function repairBrokenLines(lines, stats) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || isChapterTitle(line) || isMeta(line)) { out.push(line); continue; }
    while (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (!next || isChapterTitle(next) || isMeta(next)) break;
      const currentEnds = /[。！？!?」”』…]$/.test(line);
      const nextStartsNew = /^[「“『（(]|^(第[零〇一二兩三四五六七八九十百千萬\d]+[章回卷節集部篇])/.test(next);
      if (currentEnds || nextStartsNew) break;
      line += next;
      stats.mergedLines++;
      i++;
    }
    out.push(line);
  }
  return out;
}

function adjustParagraphs(lines, stats) {
  const max = Math.min(800, Math.max(120, Number(state.paragraphMax) || 220));
  const out = [];
  for (const original of lines) {
    const line = original.trim();
    if (!line || isChapterTitle(line) || isMeta(line)) { out.push(line); continue; }
    let parts = [line];
    if (state.opts.splitDialogueParagraphs) parts = splitDialogue(parts);
    if (state.opts.splitLongParagraphs) parts = parts.flatMap(p => splitLongParagraph(p, max));
    if (parts.length > 1) stats.splitParagraphs += parts.length - 1;
    for (const p of parts) {
      if (p.length > max) stats.suspiciousParagraphs++;
      out.push(p);
      out.push('');
    }
  }
  return out;
}

function splitDialogue(parts) {
  const out = [];
  for (const p of parts) {
    const text = p.replace(/」\s*(?=[「“『])/g, '」\n').replace(/([。！？!?」”』])\s*([安蕾雷他她我你][^，。！？!?「“『]{0,8}(?:說|说道|道|問|答|笑|頓了頓))/g, '$1\n$2');
    out.push(...text.split('\n').map(x => x.trim()).filter(Boolean));
  }
  return out;
}

function splitLongParagraph(text, max) {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^。！？!?；;…]+[。！？!?；;…」”』]*|.+$/g) || [text];
  const out = [];
  let buf = '';
  for (const s of sentences) {
    const next = buf + s;
    if (buf && next.length > max) { out.push(buf); buf = s; }
    else buf = next;
  }
  if (buf) out.push(buf);
  return out.flatMap(chunk => {
    if (chunk.length <= max * 1.8) return [chunk];
    const forced = [];
    for (let i = 0; i < chunk.length; i += max) forced.push(chunk.slice(i, i + max));
    return forced;
  });
}

function isChapterTitle(line) {
  const t = line.trim();
  return /^(第[零〇一二兩三四五六七八九十百千萬\d]+[章回卷節集部篇].{0,40}|Chapter\s*\d+.{0,40}|\d+[\.、]\s*.{1,40})$/i.test(t);
}
function isMeta(line) {
  const t = line.trim();
  return !t || /^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?$/.test(t) || /^作者[：: ]/.test(t) || /^書名[：: ]/.test(t) || /^來源[：: ]/.test(t) || /^更新[：: ]/.test(t) || /^字數[：: ]/.test(t);
}
function cleanChapters(lines, stats) {
  const out = [];
  let lastChapter = '';
  let afterChapter = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (isChapterTitle(line)) {
      const norm = line.replace(/\s+/g, '');
      if (state.opts.dedupeChapterTitles && norm === lastChapter) { stats.removedDupes++; afterChapter = 1; continue; }
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(line);
      lastChapter = norm;
      afterChapter = 1;
      continue;
    }
    if (state.opts.removeFrontMatter && afterChapter > 0 && afterChapter < 8 && isMeta(line)) { stats.removedFront++; afterChapter++; continue; }
    out.push(line);
    afterChapter = line ? 0 : afterChapter ? afterChapter + 1 : 0;
  }
  return out;
}
function safeName(ext) {
  return `${(state.title || 'novel').replace(/[\\/:*?"<>|]/g, '_')}.${ext}`;
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1200);
}
function downloadText() { if (!state.clean) return; downloadBlob(new Blob([state.clean], { type: 'text/plain;charset=utf-8' }), safeName('txt')); }
function downloadEpub() {
  if (!state.clean) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(state.title || 'Novel')}</title><style>body{font-family:serif;line-height:1.7}h1{page-break-before:always}p{text-indent:2em;margin:.8em 0}</style></head><body>${state.clean.split('\n').map(l => isChapterTitle(l) ? `<h1>${esc(l)}</h1>` : l ? `<p>${esc(l)}</p>` : '').join('\n')}</body></html>`;
  downloadBlob(new Blob([html], { type: 'application/xhtml+xml;charset=utf-8' }), safeName('html'));
  alert('MVP 先輸出可匯入多數閱讀器的 HTML；正式 EPUB zip 封裝下一版加入。');
}

render();
