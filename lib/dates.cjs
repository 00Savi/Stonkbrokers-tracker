// UTC calendar helpers. Chart labels used to be `M/D` with local getMonth(),
// which collided across years and drifted a day on US machines vs the UTC
// buckets in cache/yield_days.json.

function utcParts(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function utcIso(input = new Date()) {
  const p = utcParts(input);
  return p ? `${p.y}-${pad2(p.m)}-${pad2(p.day)}` : "";
}

function utcIsoFromTs(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  const ms = n > 1e12 ? n : n * 1000;
  return utcIso(new Date(ms));
}

function utcMidnightSec(input = new Date()) {
  const p = utcParts(input);
  if (!p) return 0;
  return Date.UTC(p.y, p.m - 1, p.day) / 1000;
}

function parseDateLabel(label, now = new Date()) {
  const s = String(label || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };

  m = s.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return { y, m: Number(m[1]), d: Number(m[2]) };
  }

  m = s.match(/^(\d{1,2})\D+(\d{1,2})$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const nowM = now.getUTCMonth() + 1;
    let y = now.getUTCFullYear();
    if (nowM <= 2 && month >= 11) y -= 1;
    else if (nowM >= 11 && month <= 2) y += 1;
    return { y, m: month, d: day };
  }
  return null;
}

function dateKey(label, now) {
  const p = parseDateLabel(label, now);
  return p ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}` : String(label || "");
}

function chartLabel(label, withYear = false) {
  const p = parseDateLabel(label);
  if (!p) return String(label || "");
  return withYear ? `${p.m}/${p.d}/${String(p.y).slice(2)}` : `${p.m}/${p.d}`;
}

function labelsNeedYear(labels) {
  const years = new Set();
  for (const label of labels || []) {
    const p = parseDateLabel(label);
    if (p) years.add(p.y);
  }
  return years.size > 1;
}

function formatLabels(labels) {
  const withYear = labelsNeedYear(labels);
  return (labels || []).map((label) => chartLabel(label, withYear));
}

module.exports = {
  utcIso,
  utcIsoFromTs,
  utcMidnightSec,
  parseDateLabel,
  dateKey,
  chartLabel,
  labelsNeedYear,
  formatLabels,
};
