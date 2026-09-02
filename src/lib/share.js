/** Share-to-X for dashboard charts. X intent cannot attach files, so we
 *  compose a watermarked PNG, copy/download it, and open a prefilled tweet. */

export const SAVI_X_HANDLE = '@savicrypto';
export const SAVI_X = 'https://x.com/savicrypto';
export const TRACKER_SHARE_URL = 'https://00savi.github.io/Stonkbrokers-tracker/';
export const LAUNCHER_REF = 'https://stonkbrokers.io/safe-launch?ref=SAVI';

export function sharePageUrl() {
  if (typeof window === 'undefined') return TRACKER_SHARE_URL;
  const origin = window.location.origin;
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) return TRACKER_SHARE_URL;
  return `${origin}${window.location.pathname}`;
}

function tweetText(title) {
  const site = sharePageUrl();
  const headline = title ? `${title} — Savi's Dashboard` : "Savi's Dashboard";
  return `${headline}\n${site}\n${SAVI_X_HANDLE}`;
}

function drawWatermarked(chartCanvas, title) {
  const padX = 36;
  const titleH = 64;
  const foot = 80;
  const srcW = chartCanvas.width;
  const srcH = chartCanvas.height;
  if (!srcW || !srcH) throw new Error('No chart to share');
  const w = Math.max(1100, srcW);
  const scale = w / srcW;
  const h = srcH * scale;
  const out = document.createElement('canvas');
  out.width = w + padX * 2;
  out.height = titleH + h + foot;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#08090b';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 28px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(title || "Savi's Dashboard", padX, 42);
  ctx.drawImage(chartCanvas, padX, titleH, w, h);
  ctx.fillStyle = '#12151a';
  ctx.fillRect(0, titleH + h, out.width, foot);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px ui-monospace, ui-sans-serif, monospace';
  const site = sharePageUrl().replace(/\/$/, '');
  ctx.fillText(site, padX, titleH + h + 32);
  ctx.fillText(`${SAVI_X_HANDLE}   ·   ${SAVI_X}`, padX, titleH + h + 58);
  return out;
}

async function blobFromCanvas(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png');
  });
}

export async function shareChartToX(root, title) {
  const chartCanvas = root?.querySelector?.('canvas');
  if (!chartCanvas) throw new Error('No chart to share');
  const out = drawWatermarked(chartCanvas, title);
  const blob = await blobFromCanvas(out);
  const file = new File([blob], 'savi-dashboard.png', { type: 'image/png' });
  const text = tweetText(title);
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text, title: title || "Savi's Dashboard" });
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch {
    /* clipboard image not always allowed */
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `savi-dashboard.png`;
  a.click();
  URL.revokeObjectURL(a.href);
  window.open(intent, '_blank', 'noopener,noreferrer');
}
