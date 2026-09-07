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

function downloadPng(blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'savi-dashboard.png';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function writeClipboardPng(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': Promise.resolve(blob) }),
    ]);
    return true;
  } catch {
    return false;
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
