// diff-sprint: a fast drop-in replacement for makefun-diff 1.0.0.
//
// run(input) returns, for input { old, new }, exactly the patch string
// makefun-diff 1.0.0 returns, computed with a typed-array Myers search
// instead of the reference's path-object search. The edit-script rule is
// the reference's own: trim the common prefix of lines, then the common
// suffix of what is left; between them run Myers's greedy search, which
// on every diagonal keeps the path reaching furthest into the old text,
// prefers the deletion when a deletion and an insertion reach the same
// point, never steps past either text's end, and follows every run of
// equal lines (a snake) as far as it goes. The first path to reach both
// ends is the script.
//
// The patch format is the reference's: a header line
//   makefun-diff/1 old=N new=M hunks=H deleted=D inserted=I
// then per hunk a line "@ os ol ns nl" and one line per covered line,
// prefixed "=" (kept), "-" (deleted) or "+" (inserted). A change run
// lists its deletions before its insertions; a hunk shows up to 3 kept
// lines around its runs and merges runs at most 6 kept lines apart. A
// line that ends its text without a newline is written with one and
// followed by a line "%". Identical texts are the header alone.

const FORMAT = 'makefun-diff/1';
const CONTEXT = 3;

const KEEP = 0;
const DEL = 1;
const INS = 2;

/** A text's lines, each with its "\n"; the last line without, when the text does not end in one. */
function splitLines(text) {
  const lines = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf('\n', start);
    if (nl === -1) break;
    lines.push(text.slice(start, nl + 1));
    start = nl + 1;
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}

/**
 * The edit runs of aIds[0..n) into bIds[0..m) under the reference's rule,
 * as a list of [kind, count] with adjacent runs of a kind merged.
 * The search stores, for every depth d, the furthest old position each
 * diagonal reached (after its snake); -1 marks a diagonal no path of d
 * edits reaches within the texts. The script is then read back off those
 * rows from the far end, replaying the same choice the search made.
 */
function editRuns(a, n, b, m) {
  if (n === 0) return m === 0 ? [] : [[INS, m]];
  if (m === 0) return [[DEL, n]];

  const rows = [];
  let x = 0;
  while (x < n && x < m && a[x] === b[x]) x++;
  const first = new Int32Array(1);
  first[0] = x;
  rows.push(first);
  if (x >= n && x >= m) return x > 0 ? [[KEEP, x]] : [];

  const target = n - m;
  let depth = -1;
  for (let d = 1; depth < 0; d++) {
    const prev = rows[d - 1];
    const row = new Int32Array(2 * d + 1);
    // Row index i names diagonal k = i - d; only even i occur. The
    // deletion's path sits at prev[i - 2], the insertion's at prev[i].
    const w = 2 * d;
    for (let i = 0; i <= w; i += 2) {
      const k = i - d;
      const pvD = i >= 2 ? prev[i - 2] : -1;
      const pvI = i <= w - 2 ? prev[i] : -1;
      // Either step is a candidate only when its path exists and the
      // step stays inside its text.
      const delOK = pvD >= 0 && pvD < n;
      const insOK = pvI >= 0 && pvI - (k + 1) < m;
      if (!delOK && !insOK) {
        row[i] = -1;
        continue;
      }
      const delX = delOK ? pvD + 1 : -1;
      const insX = insOK ? pvI : -1;
      let xi = delX >= insX ? delX : insX;
      let y = xi - k;
      const xLim = Math.min(n, m + k);
      while (xi < xLim && a[xi] === b[y]) {
        xi++;
        y++;
      }
      row[i] = xi;
      if (k === target && xi >= n) depth = d;
    }
    rows.push(row);
  }

  // Read the script back: at depth d the path ends at (X, Y); the edit
  // that produced it is the one the search's own comparison picks from
  // row d - 1, the snake before it runs back to that edit's landing.
  const rev = [];
  const push = (kind, count) => {
    const last = rev[rev.length - 1];
    if (last !== undefined && last[0] === kind) last[1] += count;
    else rev.push([kind, count]);
  };
  let X = n;
  let Y = m;
  for (let d = depth; d >= 1; d--) {
    const prev = rows[d - 1];
    const k = X - Y;
    const delOK = k > -d && prev[k + d - 2] >= 0 && prev[k + d - 2] < n;
    const insOK = k < d && prev[k + d] >= 0 && prev[k + d] - (k + 1) < m;
    const delX = delOK ? prev[k + d - 2] + 1 : -1;
    const insX = insOK ? prev[k + d] : -1;
    if (delX >= insX) {
      const xp = prev[k + d - 2];
      const snake = X - (xp + 1);
      if (snake > 0) push(KEEP, snake);
      push(DEL, 1);
      X = xp;
      Y = xp - (k - 1);
    } else {
      const xp = prev[k + d];
      const snake = X - xp;
      if (snake > 0) push(KEEP, snake);
      push(INS, 1);
      X = xp;
      Y = xp - (k + 1);
    }
  }
  if (X > 0) push(KEEP, X);
  rev.reverse();
  return rev;
}

/** A line as the patch writes it: op, the line, and a "%" line when it had no newline. */
function written(op, line) {
  return line.endsWith('\n') ? op + line : op + line + '\n%\n';
}

/** makefun-diff 1.0.0's patch of input.old into input.new. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('diff-sprint: the input is { old, new }, two strings');
  }
  const aLines = splitLines(input.old);
  const bLines = splitLines(input.new);
  const n = aLines.length;
  const m = bLines.length;

  // One id per distinct line, shared by both texts, so the search
  // compares numbers instead of strings.
  const ids = new Map();
  const a = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const s = aLines[i];
    let id = ids.get(s);
    if (id === undefined) {
      id = ids.size;
      ids.set(s, id);
    }
    a[i] = id;
  }
  const b = new Int32Array(m);
  for (let i = 0; i < m; i++) {
    const s = bLines[i];
    let id = ids.get(s);
    if (id === undefined) {
      id = ids.size;
      ids.set(s, id);
    }
    b[i] = id;
  }

  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix++;

  const runs = [];
  if (prefix > 0) runs.push([KEEP, prefix]);
  const mid = editRuns(a.subarray(prefix, n - suffix), n - prefix - suffix, b.subarray(prefix, m - suffix), m - prefix - suffix);
  for (const r of mid) runs.push(r);
  if (suffix > 0) runs.push([KEEP, suffix]);

  // The change runs: each a stretch of deletions and insertions between
  // two kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r[0] === KEEP) {
      o += r[1];
      p += r[1];
      continue;
    }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r[0] === DEL) {
      c.dels += r[1];
      o += r[1];
      deleted += r[1];
    } else {
      c.ins += r[1];
      p += r[1];
      inserted += r[1];
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h === undefined ? undefined : h[h.length - 1];
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }

  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written('=', aLines[at]));
      for (let i = 0; i < c.dels; i++) out.push(written('-', aLines[c.o + i]));
      for (let i = 0; i < c.ins; i++) out.push(written('+', bLines[c.p + i]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written('=', aLines[at]));
  }
  return out.join('');
}
