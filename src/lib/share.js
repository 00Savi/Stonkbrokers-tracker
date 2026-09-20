/** Copy a watermarked chart PNG to the clipboard.
 *
 * The footer is only the site and a follow line so the image can be pasted
 * into X, Discord, Telegram, or anywhere else. No compose tab, no share sheet.
 */

export const SAVI_X_HANDLE = '@savicrypto';
export const SAVI_X = 'https://x.com/savicrypto';
export const TRACKER_SHARE_URL = 'https://savicrypto.xyz/';
export const LAUNCHER_REF = 'https://stonkbrokers.io/safe-launch?ref=SAVI';
const SITE_MARK = 'savicrypto.xyz';
const FOLLOW_MARK = `Follow ${SAVI_X_HANDLE}`;

function drawWatermarked(chartCanvas) {
  const srcW = chartCanvas.width;
  const srcH = chartCanvas.height;
  if (!srcW || !srcH) throw new Error('No chart to copy');

  const padX = 28;
  const foot = 52;
  const w = Math.max(1100, srcW);
  const scale = w / srcW;
  const h = srcH * scale;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h + foot;
  const ctx = out.getContext('2d');

  ctx.fillStyle = '#08090b';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(chartCanvas, 0, 0, w, h);

  ctx.fillStyle = '#0e1013';
  ctx.fillRect(0, h, out.width, foot);
  ctx.fillStyle = '#1e2228';
  ctx.fillRect(0, h, out.width, 1);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 18px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const mid = h + foot / 2;
  ctx.fillText(SITE_MARK, padX, mid);
  const followW = ctx.measureText(FOLLOW_MARK).width;
  ctx.fillText(FOLLOW_MARK, out.width - padX - followW, mid);
  return out;
}

function pngBlobFromCanvas(canvas) {
  const dataUrl = canvas.toDataURL('image/png');
  const comma = dataUrl.indexOf(',');
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

function downloadPng(blob, filename = 'savi-dashboard.png') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function writeClipboardPng(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    return true;
  } catch {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': Promise.resolve(blob) }),
      ]);
      return true;
    } catch {
      return false;
    }
  }
}

/** Copy the chart PNG. Returns true if the clipboard took it; otherwise the file is downloaded. */
export async function copyChart(root) {
  if (typeof window === 'undefined') return false;
  const chartCanvas = root?.querySelector?.('canvas');
  if (!chartCanvas) throw new Error('No chart to copy');
  const blob = pngBlobFromCanvas(drawWatermarked(chartCanvas));
  const copied = await writeClipboardPng(blob);
  if (!copied) downloadPng(blob);
  return copied;
}

const ADDR_RE = /0x[a-fA-F0-9]{6,}\.\.\.[a-fA-F0-9]{4}|0x[a-fA-F0-9]{40}/g;

function scrubAddresses(node) {
  if (!node) return;
  if (node.nodeType === 3) {
    node.textContent = node.textContent.replace(ADDR_RE, '').replace(/[ \t]{2,}/g, ' ');
    return;
  }
  if (node.nodeType !== 1) return;
  if (node.getAttribute?.('data-share-omit') != null) {
    node.remove();
    return;
  }
  [...node.childNodes].forEach(scrubAddresses);
}

const COLOR_PROPS = [
  'color',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'fill',
  'stroke',
];

function toRgb(color) {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return color;
  try {
    const ctx = toRgb.ctx || (toRgb.ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
    ctx.fillStyle = '#000000';
    ctx.fillStyle = color;
    return ctx.fillStyle || color;
  } catch {
    return '#e7e9ec';
  }
}

function flattenModernColors(root, view) {
  if (!root || root.nodeType !== 1) return;
  const cs = view.getComputedStyle(root);
  for (const prop of COLOR_PROPS) {
    const v = cs[prop];
    if (v && /oklch|oklab|lab\(|lch\(|color-mix/i.test(v)) {
      root.style[prop] = toRgb(v);
    }
  }
  if (cs.boxShadow && /oklch|oklab|lab\(|lch\(|color-mix/i.test(cs.boxShadow)) {
    root.style.boxShadow = 'none';
  }
  for (const child of root.children) flattenModernColors(child, view);
}

function isForeignImage(el) {
  if (el?.tagName !== 'IMG') return false;
  const src = el.currentSrc || el.src || '';
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return false;
  try {
    return new URL(src, window.location.href).origin !== window.location.origin;
  } catch {
    return true;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = '#0e1013';
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = '#1e2228';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawDonut(ctx, x, y, w, h, slices) {
  const total = slices.reduce((s, sl) => s + (Number(sl.value) || 0), 0);
  const cx = x + w * 0.38;
  const cy = y + h / 2 + 8;
  const r = Math.min(w, h) * 0.28;
  if (!(total > 0)) {
    ctx.fillStyle = '#575e67';
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No floor to split', cx, cy);
    ctx.textAlign = 'left';
    return;
  }
  let a = -Math.PI / 2;
  for (const sl of slices) {
    const sweep = ((Number(sl.value) || 0) / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a, a + sweep);
    ctx.closePath();
    ctx.fillStyle = sl.color || '#94a3b8';
    ctx.fill();
    a += sweep;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = '#0e1013';
  ctx.fill();

  let ly = y + 36;
  slices.forEach((sl) => {
    ctx.fillStyle = sl.color || '#94a3b8';
    ctx.fillRect(x + w * 0.68, ly, 10, 10);
    ctx.fillStyle = '#e7e9ec';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(sl.label || '', x + w * 0.68 + 16, ly - 2);
    ly += 22;
  });
}

function drawBars(ctx, x, y, w, h, bars) {
  const labels = bars?.labels || [];
  const values = (bars?.values || []).map((v) => Number(v) || 0);
  const colors = bars?.colors || [];
  const n = labels.length;
  if (!n) {
    ctx.fillStyle = '#575e67';
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('No series yet', x + 20, y + h / 2);
    return;
  }
  const max = Math.max(...values, 1);
  const left = x + 16;
  const right = x + w - 16;
  const top = y + 8;
  const bottom = y + h - 28;
  const inner = right - left;
  const gap = n > 8 ? 2 : 8;
  const bw = Math.max(3, (inner - gap * (n - 1)) / n);
  values.forEach((v, i) => {
    const bh = ((bottom - top) * v) / max;
    const bx = left + i * (bw + gap);
    ctx.fillStyle = colors[i] || '#f7931a';
    roundRect(ctx, bx, bottom - bh, bw, Math.max(2, bh), 3);
    ctx.fill();
  });
  ctx.fillStyle = '#8b929b';
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  const step = n > 8 ? Math.ceil(n / 6) : 1;
  labels.forEach((label, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    ctx.fillText(String(label), left + i * (bw + gap), bottom + 6);
  });
}

function drawThumb(ctx, img, x, y, size, mark = '') {
  ctx.save();
  roundRect(ctx, x, y, size, size, 10);
  ctx.clip();
  ctx.fillStyle = '#14171b';
  ctx.fillRect(x, y, size, size);
  if (img && img.width && img.height) {
    const scale = Math.max(size / img.width, size / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
  } else if (mark) {
    ctx.fillStyle = '#8b929b';
    ctx.font = `800 ${Math.round(size * 0.32)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(mark).slice(0, 2).toUpperCase(), x + size / 2, y + size / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }
  ctx.restore();
  ctx.strokeStyle = '#1e2228';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, size, size, 10);
  ctx.stroke();
}

function fitText(ctx, text, maxW) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return t ? `${t}…` : '';
}

function blitChart(ctx, canvas, x, y, w, h) {
  if (!canvas?.width || !canvas?.height) return false;
  ctx.drawImage(canvas, x, y, w, h);
  return true;
}

function ipfsCandidates(src) {
  const s = String(src || '');
  const cid = s.startsWith('ipfs://')
    ? s.replace(/^ipfs:\/\//, '').replace(/^ipfs\//, '')
    : s.match(/\/ipfs\/(.+)$/)?.[1];
  if (!cid) return [s];
  return [
    `https://dweb.link/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://cf-ipfs.com/ipfs/${cid}`,
  ];
}

function loadOneImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    const local = src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('/') || !/^https?:/i.test(src);
    if (!local) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadShareImage(src) {
  if (!src) return null;
  for (const candidate of ipfsCandidates(src)) {
    const img = await loadOneImage(candidate);
    if (img) return img;
  }
  return null;
}

function drawPortfolioCard({
  mode = 'forecast',
  floor = '—',
  cashLabel = 'Cash-flow',
  cash = '—',
  roi = '—',
  units = '—',
  basis = '',
  assets = [],
  pie = [],
  bars = null,
  pieCanvas = null,
  barCanvas = null,
} = {}) {
  const W = 1200;
  const header = 110;
  const tiles = 146;
  const chartH = 300;
  const cardH = 92;
  const shown = assets.slice(0, 12);
  const rows = Math.max(1, Math.ceil(shown.length / 2));
  const foot = 56;
  const pad = 36;
  const gap = 14;
  const H = header + tiles + chartH + 56 + rows * (cardH + gap) + 24 + foot;

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#08090b';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#e7e9ec';
  ctx.font = '700 34px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('Portfolio scan', pad, 28);
  ctx.fillStyle = '#8b929b';
  ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(mode === 'history' ? 'Earned history' : 'Annual forecast', pad, 70);

  const tilesData = [
    { label: 'Total floor', value: floor, color: '#e7e9ec' },
    ...(basis ? [{ label: 'Cost basis', value: basis, color: '#e7e9ec' }] : []),
    { label: cashLabel, value: cash, color: '#00a804' },
    { label: mode === 'history' ? 'Realized vs floor' : 'Portfolio ROI', value: roi, color: '#38bdf8' },
    { label: 'Active units', value: units, color: '#f7931a' },
  ];
  const tileW = (W - pad * 2 - gap * (tilesData.length - 1)) / tilesData.length;
  tilesData.forEach((t, i) => {
    const x = pad + i * (tileW + gap);
    const y = header;
    panel(ctx, x, y, tileW, 128);
    ctx.fillStyle = '#8b929b';
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(t.label.toUpperCase(), x + 16, y + 16);
    ctx.fillStyle = t.color;
    ctx.font = '800 26px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(t.value, x + 16, y + 54);
  });

  const chartY = header + tiles;
  const chartW = (W - pad * 2 - gap) / 2;
  panel(ctx, pad, chartY, chartW, chartH);
  ctx.fillStyle = '#e7e9ec';
  ctx.font = '700 16px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('Floor allocation', pad + 18, chartY + 16);
  if (!blitChart(ctx, pieCanvas, pad + 12, chartY + 40, chartW - 24, chartH - 52)) {
    drawDonut(ctx, pad, chartY + 28, chartW, chartH - 36, pie);
  }

  panel(ctx, pad + chartW + gap, chartY, chartW, chartH);
  ctx.fillStyle = '#e7e9ec';
  ctx.font = '700 16px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(bars?.title || (mode === 'history' ? 'Daily drops' : 'Forecasted cash-flow'), pad + chartW + gap + 18, chartY + 16);
  if (bars?.headline) {
    ctx.fillStyle = bars.headlineColor || '#00a804';
    ctx.font = '800 22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(bars.headline, pad + chartW + gap + 18, chartY + 40);
  }
  const barBoxY = chartY + (bars?.headline ? 72 : 44);
  const barBoxH = chartH - (bars?.headline ? 84 : 56);
  if (!blitChart(ctx, barCanvas, pad + chartW + gap + 12, barBoxY, chartW - 24, barBoxH)) {
    drawBars(ctx, pad + chartW + gap, barBoxY, chartW, barBoxH, bars);
  }

  const listY = chartY + chartH + 28;
  ctx.fillStyle = '#e7e9ec';
  ctx.font = '700 16px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('Owned assets', pad, listY);
  const cardW = (W - pad * 2 - gap) / 2;
  shown.forEach((a, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = pad + col * (cardW + gap);
    const y = listY + 26 + row * (cardH + gap);
    panel(ctx, x, y, cardW, cardH);
    drawThumb(ctx, a.img, x + 14, y + 18, 56, a.mark || a.name);
    ctx.fillStyle = '#00a804';
    ctx.font = '800 18px ui-sans-serif, system-ui, sans-serif';
    const value = a.value || '—';
    const valueW = ctx.measureText(value).width;
    ctx.textAlign = 'right';
    ctx.fillText(value, x + cardW - 16, y + 28);
    ctx.textAlign = 'left';
    const textW = cardW - 84 - valueW - 28;
    ctx.fillStyle = '#e7e9ec';
    ctx.font = '700 18px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(fitText(ctx, a.name || 'Project', textW), x + 84, y + 20);
    ctx.fillStyle = '#8b929b';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(fitText(ctx, a.detail || '', cardW - 100), x + 84, y + 48);
  });

  ctx.fillStyle = '#0e1013';
  ctx.fillRect(0, H - foot, W, foot);
  ctx.fillStyle = '#1e2228';
  ctx.fillRect(0, H - foot, W, 1);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 18px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const mid = H - foot / 2;
  ctx.fillText(SITE_MARK, pad, mid);
  const followW = ctx.measureText(FOLLOW_MARK).width;
  ctx.fillText(FOLLOW_MARK, W - pad - followW, mid);
  return out;
}

/** Portfolio PNG built on a canvas so Tailwind oklch cannot break the copy. */
export async function copyPortfolioSnapshot(payload) {
  if (typeof window === 'undefined') return false;
  const assets = await Promise.all((payload.assets || []).map(async (a) => ({
    ...a,
    img: await loadShareImage(a.thumb),
  })));
  let canvas = drawPortfolioCard({ ...payload, assets });
  try {
    const blob = pngBlobFromCanvas(canvas);
    const copied = await writeClipboardPng(blob);
    if (!copied) downloadPng(blob, 'savi-portfolio.png');
    return copied;
  } catch {
    canvas = drawPortfolioCard({ ...payload, assets: assets.map((a) => ({ ...a, img: null })) });
    const blob = pngBlobFromCanvas(canvas);
    const copied = await writeClipboardPng(blob);
    if (!copied) downloadPng(blob, 'savi-portfolio.png');
    return copied;
  }
}

function hexAlpha(hex, a) {
  const h = String(hex || '#00a804').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return `rgba(0,168,4,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function cardPanel(ctx, x, y, w, h) {
  ctx.fillStyle = '#0e1013';
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = '#252a32';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath();
  ctx.moveTo(x + 16, y + 1);
  ctx.lineTo(x + w - 16, y + 1);
  ctx.stroke();
}

function drawPill(ctx, x, y, text, { fill = 'rgba(0,168,4,0.12)', stroke = '#00a804', color = '#00a804', padX = 10 } = {}) {
  ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  const h = 24;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + h / 2 + 0.5);
  ctx.textBaseline = 'top';
  return w;
}

function drawSpark(ctx, x, y, w, h, chart) {
  const values = (chart?.values || []).map((v) => Number(v) || 0);
  const color = chart?.color || '#00a804';
  const left = x + 10;
  const right = x + w - 10;
  const top = y + 6;
  const bottom = y + h - 8;
  if (!values.length || values.every((v) => v === 0)) {
    ctx.fillStyle = '#575e67';
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('No series yet', left, (top + bottom) / 2 - 6);
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;
  const inner = Math.max(1, right - left);
  const at = (v, i) => ({
    px: left + (n === 1 ? inner / 2 : (i / (n - 1)) * inner),
    py: bottom - ((v - min) / span) * (bottom - top),
  });

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let g = 1; g <= 2; g++) {
    const gy = top + ((bottom - top) * g) / 3;
    ctx.beginPath();
    ctx.moveTo(left, gy);
    ctx.lineTo(right, gy);
    ctx.stroke();
  }

  if (chart?.kind === 'bar') {
    const gap = n > 40 ? 0.5 : n > 20 ? 1 : 2;
    const bw = Math.max(1.5, (inner - gap * (n - 1)) / n);
    values.forEach((v, i) => {
      const floor = Math.min(min, 0);
      const bh = ((bottom - top) * (v - floor)) / (max - floor || 1);
      const bx = left + i * (bw + gap);
      ctx.fillStyle = color;
      roundRect(ctx, bx, bottom - Math.max(2, bh), bw, Math.max(2, bh), Math.min(3, bw / 2));
      ctx.fill();
    });
    return;
  }

  const pts = values.map((v, i) => at(v, i));
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py)));
  ctx.lineTo(right, bottom);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, hexAlpha(color, 0.32));
  grad.addColorStop(1, hexAlpha(color, 0.02));
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = hexAlpha(color, 0.55);
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const lastPt = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(lastPt.px, lastPt.py, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lastPt.px, lastPt.py, 1.75, 0, Math.PI * 2);
  ctx.fillStyle = '#08090b';
  ctx.fill();
}

function drawTable(ctx, x, y, w, h, { columns = [], rows = [] } = {}) {
  cardPanel(ctx, x, y, w, h);
  const cols = columns.length ? columns : ['', '', '', ''];
  const colN = cols.length;
  const weights = colN === 4 ? [0.40, 0.18, 0.18, 0.24] : Array(colN).fill(1 / colN);
  const tablePad = 18;
  const innerW = w - tablePad * 2;
  const colX = [];
  let acc = 0;
  weights.forEach((wt) => {
    colX.push(acc);
    acc += innerW * wt;
  });
  const colWAt = (i) => innerW * weights[i];

  const headY = y + 16;
  ctx.fillStyle = '#6b7280';
  ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
  cols.forEach((c, i) => {
    const right = i === colN - 1;
    if (right) ctx.textAlign = 'right';
    const cx = right ? x + tablePad + colX[i] + colWAt(i) : x + tablePad + colX[i];
    ctx.fillText(String(c).toUpperCase(), cx, headY);
    ctx.textAlign = 'left';
  });

  const shownRows = rows.slice(0, 12);
  const bodyTop = y + 42;
  const bodyBot = y + h - 16;
  const bodyH = Math.max(28, bodyBot - bodyTop);
  const rowH = shownRows.length ? bodyH / shownRows.length : 36;
  shownRows.forEach((row, ri) => {
    const ry = bodyTop + ri * rowH;
    const mid = ry + rowH / 2 - 7;
    if (ri % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      roundRect(ctx, x + 10, ry + 4, w - 20, rowH - 8, 10);
      ctx.fill();
    }
    (row.cells || []).forEach((cell, ci) => {
      const right = ci === colN - 1;
      const cw = colWAt(ci) - 8;
      if (right) {
        ctx.font = '800 13px ui-sans-serif, system-ui, sans-serif';
        const label = String(cell);
        const tw = ctx.measureText(label).width;
        const pillW = tw + 16;
        const px = x + tablePad + colX[ci] + colWAt(ci) - pillW;
        roundRect(ctx, px, mid - 5, pillW, 22, 8);
        ctx.fillStyle = 'rgba(0,168,4,0.14)';
        ctx.fill();
        ctx.fillStyle = '#00a804';
        ctx.textAlign = 'right';
        ctx.fillText(fitText(ctx, label, cw), x + tablePad + colX[ci] + colWAt(ci) - 8, mid);
        ctx.textAlign = 'left';
        return;
      }
      ctx.fillStyle = ci === 0 ? '#f4f6f8' : '#c5c9ce';
      ctx.font = ci === 0
        ? '700 14px ui-sans-serif, system-ui, sans-serif'
        : '600 13px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(fitText(ctx, cell, cw), x + tablePad + colX[ci], mid);
    });
  });
}

function drawChartPanel(ctx, x, y, w, h, chart) {
  cardPanel(ctx, x, y, w, h);
  ctx.fillStyle = '#6b7280';
  ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(fitText(ctx, String(chart?.title || '').toUpperCase(), w - 28), x + 14, y + 12);
  const head = String(chart?.headline || '—');
  const down = head.startsWith('−') || head.startsWith('-');
  const up = head.startsWith('+');
  ctx.fillStyle = down ? '#f43f5e' : up ? (chart?.color || '#00a804') : (chart?.color || '#e7e9ec');
  ctx.font = '800 22px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(fitText(ctx, head, w - 28), x + 14, y + 30);
  drawSpark(ctx, x + 4, y + 58, w - 8, h - 66, chart);
}

/** 1200×675 X landscape card. Drawn on canvas so Tailwind oklch cannot break copy. */
function drawShareCard({
  title = '',
  kicker = SITE_MARK,
  tiles = [],
  columns = [],
  rows = [],
  charts = [],
  window: windowLabel = '',
} = {}) {
  const W = 1200;
  const H = 675;
  const S = 2;
  const pad = 24;
  const foot = 48;
  const gap = 12;

  const out = document.createElement('canvas');
  out.width = W * S;
  out.height = H * S;
  const ctx = out.getContext('2d');
  ctx.scale(S, S);
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#07080a';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.78, -20, 10, W * 0.78, 80, 380);
  glow.addColorStop(0, 'rgba(0,168,4,0.18)');
  glow.addColorStop(1, 'rgba(0,168,4,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 260);
  ctx.fillStyle = '#00a804';
  ctx.fillRect(0, 0, 4, H);

  ctx.fillStyle = '#8b929b';
  ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(kicker, pad, 18);

  const follow = FOLLOW_MARK;
  ctx.font = '700 13px ui-sans-serif, system-ui, sans-serif';
  const fw = ctx.measureText(follow).width + 28;
  roundRect(ctx, W - pad - fw, 16, fw, 28, 14);
  ctx.fillStyle = '#00a804';
  ctx.fill();
  ctx.fillStyle = '#041405';
  ctx.textBaseline = 'middle';
  ctx.fillText(follow, W - pad - fw + 14, 30);
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#f4f6f8';
  ctx.font = '800 30px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(fitText(ctx, title, 640), pad, 42);
  if (windowLabel) {
    const titleW = Math.min(ctx.measureText(title).width, 640);
    drawPill(ctx, pad + titleW + 12, 46, String(windowLabel).toUpperCase());
  }

  const hero = tiles.find((t) => t.hero) || tiles[0];
  const rest = tiles.filter((t) => t !== hero).slice(0, 3);
  const heroY = 84;
  const heroH = 96;
  cardPanel(ctx, pad, heroY, W - pad * 2, heroH);

  if (hero) {
    ctx.fillStyle = hero.color || '#00a804';
    ctx.font = '800 44px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(fitText(ctx, hero.value || '—', 280), pad + 22, heroY + 18);
    ctx.fillStyle = '#8b929b';
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(hero.label || '').toUpperCase(), pad + 22, heroY + 68);
  }

  const statX = pad + 320;
  const statW = (W - pad - 20 - statX) / Math.max(rest.length, 1);
  rest.forEach((t, i) => {
    const x = statX + i * statW;
    if (i > 0) {
      ctx.strokeStyle = '#1e2228';
      ctx.beginPath();
      ctx.moveTo(x, heroY + 18);
      ctx.lineTo(x, heroY + heroH - 18);
      ctx.stroke();
    }
    ctx.fillStyle = '#6b7280';
    ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(fitText(ctx, String(t.label || '').toUpperCase(), statW - 24), x + 18, heroY + 22);
    ctx.fillStyle = t.color || '#e7e9ec';
    ctx.font = '800 22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(fitText(ctx, t.value || '—', statW - 24), x + 18, heroY + 46);
  });

  const bodyY = heroY + heroH + 12;
  const bodyH = H - foot - bodyY - 8;
  const storyCharts = (charts || []).slice(0, 4);

  if (storyCharts.length) {
    const leftW = 448;
    const rightX = pad + leftW + gap;
    const rightW = W - pad - rightX;
    drawTable(ctx, pad, bodyY, leftW, bodyH, { columns, rows });
    const cw = (rightW - gap) / 2;
    const ch = (bodyH - gap) / 2;
    storyCharts.forEach((chart, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      drawChartPanel(ctx, rightX + col * (cw + gap), bodyY + row * (ch + gap), cw, ch, chart);
    });
  } else if (tiles.length || rows.length) {
    drawTable(ctx, pad, bodyY, W - pad * 2, bodyH, { columns, rows });
  }

  ctx.fillStyle = '#0a0c0e';
  ctx.fillRect(0, H - foot, W, foot);
  ctx.fillStyle = '#1e2228';
  ctx.fillRect(0, H - foot, W, 1);
  ctx.fillStyle = '#6b7280';
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const mid = H - foot / 2;
  ctx.fillText(`${SITE_MARK}  ·  Not financial advice`, pad, mid);
  ctx.fillStyle = '#00a804';
  ctx.font = '700 14px ui-sans-serif, system-ui, sans-serif';
  const followW = ctx.measureText(FOLLOW_MARK).width;
  ctx.fillText(FOLLOW_MARK, W - pad - followW, mid);
  return out;
}

/** Compact project / board PNG sized for an X post. */
export async function copyShareCard(payload) {
  if (typeof window === 'undefined') return false;
  if (!payload) throw new Error('Nothing to copy');
  const canvas = drawShareCard(payload);
  const blob = pngBlobFromCanvas(canvas);
  const copied = await writeClipboardPng(blob);
  if (!copied) downloadPng(blob, payload.filename || 'savi-card.png');
  return copied;
}

/** Full-page PNG of an element. Strips wallet addresses from the clone. */
export async function copyElement(root, { filename = 'savi-dashboard.png' } = {}) {
  if (typeof window === 'undefined' || !root) return false;
  const { default: html2canvas } = await import('html2canvas');
  const tall = Math.max(root.scrollHeight || 0, root.offsetHeight || 0);
  const wide = Math.max(root.scrollWidth || 0, root.clientWidth || 0, 960);
  const shot = await html2canvas(root, {
    backgroundColor: '#08090b',
    scale: tall > 2400 ? 1 : Math.min(2, window.devicePixelRatio || 1.5),
    width: wide,
    windowWidth: wide,
    useCORS: true,
    allowTaint: false,
    logging: false,
    foreignObjectRendering: false,
    ignoreElements: (el) => {
      if (el?.nodeType !== 1) return false;
      if (el.hasAttribute?.('data-share-omit') || el.closest?.('[data-share-omit]')) return true;
      return isForeignImage(el);
    },
    onclone: (clonedDoc, clonedEl) => {
      const target = clonedEl || clonedDoc.body;
      flattenModernColors(target, clonedDoc.defaultView || window);
      scrubAddresses(target);
    },
  });
  if (!shot?.width || !shot?.height) throw new Error('Empty snapshot');
  const blob = pngBlobFromCanvas(drawWatermarked(shot));
  const copied = await writeClipboardPng(blob);
  if (!copied) downloadPng(blob, filename);
  return copied;
}
