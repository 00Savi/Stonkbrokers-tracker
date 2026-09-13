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
    { label: cashLabel, value: cash, color: '#00a804' },
    { label: mode === 'history' ? 'Realized vs floor' : 'Portfolio ROI', value: roi, color: '#38bdf8' },
    { label: 'Active units', value: units, color: '#f7931a' },
  ];
  const tileW = (W - pad * 2 - gap * 3) / 4;
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

/** Full-page PNG of an element. Strips wallet addresses from the clone. */
export async function copyElement(root) {
  if (typeof window === 'undefined' || !root) return false;
  const { default: html2canvas } = await import('html2canvas');
  const shot = await html2canvas(root, {
    backgroundColor: '#08090b',
    scale: Math.min(2, window.devicePixelRatio || 1.5),
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
  if (!copied) downloadPng(blob, 'savi-portfolio.png');
  return copied;
}
