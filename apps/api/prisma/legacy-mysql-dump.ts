/** Extrae el texto interno de cada tupla en un bloque INSERT … VALUES (…), (…); */

export function extractInsertTupleInners(sql: string, table: string): string[] {
  const marker = `INSERT INTO \`${table}\``;
  const idx = sql.indexOf(marker);
  if (idx === -1) return [];
  const tail = sql.slice(idx);
  const valuesIdx = tail.search(/\bVALUES\b/i);
  if (valuesIdx === -1) return [];
  let pos = valuesIdx + tail.slice(valuesIdx).match(/\bVALUES\b/i)![0].length;
  while (pos < tail.length && /\s/.test(tail[pos])) pos++;
  return scanTupleInners(tail, pos);
}

function scanTupleInners(chunk: string, start: number): string[] {
  const out: string[] = [];
  let i = start;
  while (i < chunk.length) {
    while (i < chunk.length && chunk[i] !== '(') {
      if (chunk[i] === ';') return out;
      i++;
    }
    if (i >= chunk.length) break;
    const innerEnd = findMatchingCloseParen(chunk, i);
    if (innerEnd === -1) break;
    out.push(chunk.slice(i + 1, innerEnd));
    i = innerEnd + 1;
    while (i < chunk.length && /\s/.test(chunk[i])) i++;
    if (chunk[i] === ',') {
      i++;
      continue;
    }
    if (chunk[i] === ';') break;
    break;
  }
  return out;
}

function findMatchingCloseParen(s: string, openIdx: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\' && i + 1 < s.length) {
        i++;
        continue;
      }
      if (c === "'") {
        if (i + 1 < s.length && s[i + 1] === "'") {
          i++;
          continue;
        }
        inStr = false;
      }
      continue;
    }
    if (c === "'") {
      inStr = true;
      continue;
    }
    if (c === '(') {
      depth++;
      continue;
    }
    if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Convierte una fila SQL MySQL en valores (strings sin comillas, o null). */
export function parseMysqlRowValues(inner: string): (string | null)[] {
  const out: (string | null)[] = [];
  let i = 0;
  const len = inner.length;
  while (i < len) {
    while (i < len && /\s/.test(inner[i])) i++;
    if (i >= len) break;
    if (inner.slice(i, i + 4) === 'NULL') {
      const next = inner[i + 4];
      if (next == null || !/[A-Za-z0-9_]/.test(next)) {
        out.push(null);
        i += 4;
        while (i < len && /\s/.test(inner[i])) i++;
        if (inner[i] === ',') {
          i++;
          continue;
        }
        break;
      }
    }
    if (inner[i] === "'") {
      i++;
      let buf = '';
      while (i < len) {
        const c = inner[i];
        if (c === '\\' && i + 1 < len) {
          buf += inner[i + 1];
          i += 2;
          continue;
        }
        if (c === "'") {
          if (i + 1 < len && inner[i + 1] === "'") {
            buf += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        buf += c;
        i++;
      }
      out.push(buf);
      while (i < len && /\s/.test(inner[i])) i++;
      if (inner[i] === ',') {
        i++;
        continue;
      }
      break;
    }
    let j = i;
    while (j < len && inner[j] !== ',' && !/\s/.test(inner[j])) j++;
    const token = inner.slice(i, j).trim();
    if (token.length === 0) break;
    out.push(token);
    i = j;
    while (i < len && /\s/.test(inner[i])) i++;
    if (inner[i] === ',') {
      i++;
      continue;
    }
    break;
  }
  return out;
}
