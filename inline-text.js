// Port of src/gui/tex_text.py: the small notation used by supplemental labels.
const commands = { alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', theta:'θ', lambda:'λ', mu:'μ', pi:'π', sigma:'σ', phi:'φ', omega:'ω', times:'×', pm:'±', degree:'°', le:'≤', ge:'≥', rightarrow:'→', leftarrow:'←', infty:'∞', cdot:'·' };
function group(text, start) {
  if (text[start] !== '{') return [text.slice(start, start + 1), Math.min(text.length, start + 1)];
  let depth = 1, value = '', i = start + 1;
  for (; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) { value += text.slice(i, i + 2); i++; continue; }
    if (text[i] === '{') depth++;
    if (text[i] === '}') { depth--; if (depth === 0) return [value, i + 1]; }
    value += text[i];
  }
  return [value, i];
}
function math(text) {
  const runs = []; let buffer = '', i = 0;
  const flush = () => { if (buffer) runs.push({ text: buffer, script: 0 }); buffer = ''; };
  while (i < text.length) {
    let char = text[i];
    if (char === '\\' && text[i + 1] === '_' && i + 2 < text.length) { i++; char = '_'; }
    if (char === '_' || char === '^') {
      const [value, end] = group(text, i + 1);
      if (!value) { buffer += char; i++; continue; }
      flush(); runs.push(...math(value).map(run => ({ text: run.text, script: char === '_' ? -1 : 1 }))); i = end; continue;
    }
    if (char === '\\') {
      const next = text[i + 1];
      if (!next) { buffer += '\\'; i++; continue; }
      if ('\\{}$%#&_^'.includes(next)) { buffer += next; i += 2; continue; }
      if (/\s/.test(next)) { buffer += ' '; i += 2; continue; }
      let end = i + 1; while (end < text.length && /[a-z]/i.test(text[end])) end++;
      const command = text.slice(i + 1, end);
      if (['mathrm','text','operatorname'].includes(command) && text[end] === '{') { const [value, after] = group(text, end); buffer += value; i = after; }
      else { buffer += commands[command] ?? (command || '\\'); i = end; }
      continue;
    }
    buffer += char; i++;
  }
  flush(); return runs;
}
export function inlineRuns(text) {
  const result = []; let buffer = '', inMath = false;
  const flush = () => { if (buffer) result.push(...(inMath ? math(buffer) : [{ text: buffer, script: 0 }])); buffer = ''; };
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === '$') { buffer += '$'; i++; }
    else if (text[i] === '$') { flush(); inMath = !inMath; }
    else buffer += text[i];
  }
  flush(); return result;
}
export function inlinePlain(text) {
  const base = '0123456789+-=()n', sub = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₙ', sup = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ';
  return inlineRuns(text).map(run => run.script ? [...run.text].map(c => base.includes(c) ? (run.script < 0 ? sub : sup)[base.indexOf(c)] : c).join('') : run.text).join('');
}
