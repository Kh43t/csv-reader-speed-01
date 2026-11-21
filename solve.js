// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Clean-room reimplementation of the documented reading policy: read the
// text once, left to right, commas and double quotes; U+FEFF at the very
// start dropped; a record ends at LF or CRLF; a line left with no characters
// is no record; outside quotes a CR not followed by LF is dropped
// (stray_cr); a field opening with a quote runs to the next non-doubled
// quote, "" inside is one quote, each CRLF or lone CR inside quotes read as
// LF; what follows the closing quote up to the next comma or line break is
// appended as-is (quote_junk, when the field ends); a quote that never
// closes is a literal character and the text after it is read again as
// unquoted (unterminated_quote); a quote inside an unquoted field is
// literal; fields stay strings, never trimmed or converted; columns is the
// first record when header is true, else null; rows are the records after
// it, each padded with "" (short_row) or cut (long_row) to the first
// record's width; each error is {code, line, row} in the order met.
//
// Speed comes from bulk scans instead of per-character string building:
// most records hold no quote and no stray CR, so a whole record is taken
// with one indexOf for its line break, one slice and one split(',').
// Records that do hold a quote or a stray CR take a careful path that
// still scans in bulk: unquoted fields are taken up to the next comma or
// line break with indexOf, quoted fields up to the next quote.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on, and its index in rows
  // (null for the header). Errors read these while a record is parsed.
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters onto `value` up to the next comma or line
  // break. A CR not followed by LF is dropped (stray_cr). Returns the field
  // and how it ended; `added` counts the characters kept, which is what
  // decides quote_junk for text after a closing quote.
  function readUnquoted(value) {
    let added = 0;
    while (pos < n) {
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      let m, kind;
      if (ci === -1 && ni === -1) { m = n; kind = END; }
      else if (ni === -1 || (ci !== -1 && ci < ni)) { m = ci; kind = COMMA; }
      else { m = ni; kind = LINE_BREAK; }
      let chunk = m > pos ? text.slice(pos, m) : '';
      if (chunk.indexOf('\r') !== -1) {
        // A CR at the end of a chunk that ends at LF is the CRLF line
        // break itself; every other CR here is stray (a CR followed by LF
        // anywhere else would have made that LF the nearer line break).
        if (kind === LINE_BREAK && chunk.charCodeAt(chunk.length - 1) === 13) {
          chunk = chunk.slice(0, -1);
        }
        let r;
        while ((r = chunk.indexOf('\r')) !== -1) {
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          chunk = chunk.slice(0, r) + chunk.slice(r + 1);
        }
      }
      if (chunk) { value += chunk; added += chunk.length; }
      if (kind === COMMA) { pos = m + 1; return { value, ended: COMMA, added }; }
      if (kind === LINE_BREAK) { pos = m + 1; line += 1; return { value, ended: LINE_BREAK, added }; }
      pos = n;
      return { value, ended: END, added };
    }
    return { value, ended: END, added };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    const parts = [];
    pos += 1;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      let seg = q > pos ? text.slice(pos, q) : '';
      if (seg.indexOf('\r') !== -1) {
        // CRLF and a lone CR inside quotes are each one LF.
        let breaks = 0;
        seg = seg.replace(/\r\n?|\n/g, () => { breaks += 1; return '\n'; });
        line += breaks;
      } else if (seg.indexOf('\n') !== -1) {
        let c = 0, i = -1;
        while ((i = seg.indexOf('\n', i + 1)) !== -1) c += 1;
        line += c;
      }
      if (seg) parts.push(seg);
      if (text.charCodeAt(q + 1) === 34) {
        parts.push('"');
        pos = q + 2;
        continue;
      }
      pos = q + 1;
      const value = parts.join('');
      if (pos >= n) return { value, ended: END, added: 0 };
      const c = text.charCodeAt(pos);
      if (c === 44) { pos += 1; return { value, ended: COMMA, added: 0 }; }
      if (c === 10) { pos += 1; line += 1; return { value, ended: LINE_BREAK, added: 0 }; }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2; line += 1; return { value, ended: LINE_BREAK, added: 0 };
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      const junk = readUnquoted(value);
      if (junk.added > 0) {
        errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      }
      return junk;
    }
  }

  // Parses one record whose fields hold a quote or a stray CR, field by
  // field. Returns the fields and whether the last field opened with a
  // quote (a lone empty unquoted field is no record).
  function parseSlowRecord() {
    const fields = [];
    let quoted = false;
    let ended;
    do {
      quoted = text.charCodeAt(pos) === 34;
      const field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
      ended = field.ended;
    } while (ended === COMMA);
    return { fields, quoted };
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record's line holds no quote and no stray CR, so it
    // is plain fields split on commas. The line break is found with one
    // indexOf; a trailing CR before it is the CRLF break.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? n : nl;
    let contentEnd = lineEnd;
    if (nl !== -1 && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13) {
      contentEnd = lineEnd - 1;
    }
    let fields;
    let quoted = false;
    if (contentEnd === pos) {
      // An empty line (only reachable past the skip above in theory).
      pos = nl === -1 ? n : nl + 1;
      line += 1;
      continue;
    }
    const seg = text.slice(pos, contentEnd);
    if (seg.indexOf('"') === -1 && seg.indexOf('\r') === -1) {
      fields = seg.split(',');
      pos = nl === -1 ? n : nl + 1;
      line += 1;
    } else {
      const slow = parseSlowRecord();
      fields = slow.fields;
      quoted = slow.quoted;
    }

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
