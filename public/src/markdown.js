const LATEX_MATH_CMDS = new Set([
  'boxed','frac','dfrac','tfrac','sqrt','binom','overset','underset','substack','genfrac',
  'vec','bar','hat','tilde','dot','ddot','dddot','widetilde','widehat','overline','underline','overbrace','underbrace','overrightarrow','overleftarrow',
  'sum','prod','int','oint','iint','iiint','iiiint','lim','coprod','bigcup','bigcap','bigoplus','bigotimes','bigsqcup','bigvee','bigwedge',
  'leq','le','geq','ge','ne','neq','approx','approxeq','equiv','sim','simeq','cong','in','notin','subset','subseteq','supset','supseteq','subsetneq','supsetneq','mapsto','implies','impliedby','iff','forall','exists','nexists','pm','mp','times','div','cdot','ast','circ','star','oplus','otimes','langle','rangle','perp','parallel','propto','partial','nabla','infty','emptyset','setminus','cup','cap',
  'alpha','beta','gamma','delta','epsilon','varepsilon','zeta','eta','theta','vartheta','iota','kappa','lambda','mu','nu','xi','pi','varpi','rho','varrho','sigma','varsigma','tau','upsilon','phi','varphi','chi','psi','omega',
  'Gamma','Delta','Theta','Lambda','Xi','Pi','Sigma','Upsilon','Phi','Psi','Omega',
  'log','ln','sin','cos','tan','cot','sec','csc','arcsin','arccos','arctan','exp','det','gcd','min','max','sup','inf','deg','Pr','bmod','pmod','mod',
  'mathbb','mathbf','mathit','mathrm','mathcal','mathfrak','mathsf','mathtt','text','textbf','textit','textrm','operatorname','boldsymbol','bm',
  'left','right','big','Big','bigg','Bigg','quad','qquad','space',
  'begin','end','matrix','pmatrix','bmatrix','Bmatrix','vmatrix','Vmatrix','cases','array','aligned','gathered','split','eqnarray','smallmatrix'
]);

function readBrace(text, start) {
  let depth = 0;
  let i = start;
  let result = '';
  for (; i < text.length; i++) {
    const c = text[i];
    result += c;
    if (c === '\\') {
      i++;
      if (i < text.length) result += text[i];
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return [result, i];
}

function stashRawLatex(text, stash) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === '\\' && i + 1 < n && /[a-zA-Z]/.test(text[i + 1])) {
      let j = i + 1;
      while (j < n && /[a-zA-Z]/.test(text[j])) j++;
      const cmd = text.slice(i + 1, j);
      if (LATEX_MATH_CMDS.has(cmd)) {
        let k = j;
        let expr = text.slice(i, j);
        let advanced = true;
        while (k < n && advanced) {
          advanced = false;
          while (k < n && /\s/.test(text[k])) { expr += text[k]; k++; }
          if (text[k] === '{') {
            const [grp, nk] = readBrace(text, k);
            expr += grp; k = nk; advanced = true;
          } else if ('^_+-=/()[]'.includes(text[k])) {
            expr += text[k]; k++; advanced = true;
          } else if (text[k] === '\\' && k + 1 < n && /[a-zA-Z]/.test(text[k + 1])) {
            let m = k + 1;
            while (m < n && /[a-zA-Z]/.test(text[m])) m++;
            const sub = text.slice(k + 1, m);
            if (LATEX_MATH_CMDS.has(sub)) { expr += text.slice(k, m); k = m; advanced = true; }
          }
        }
        out += '$' + stash(expr) + '$';
        i = k;
        continue;
      }
      out += text.slice(i, j);
      i = j;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

export function formatMd(text) {
  if (!text) return '';

  const mathStore = [];
  const stash = (m) => {
    const escaped = m.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    mathStore.push(escaped);
    return `@@MJ${mathStore.length - 1}@@`;
  };

  let t = text
    .replace(/\$\$[\s\S]*?\$\$/g, stash)
    .replace(/\\\[[\s\S]*?\\\]/g, stash)
    .replace(/\\\([\s\S]*?\\\)/g, stash)
    .replace(/\$(?!\$)([^$\n]+?)\$(?!\$)/g, stash);

  t = stashRawLatex(t, stash);

  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  t = t.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');

  const lines = t.split('\n');
  let result = '';
  let inList = false;
  let listType = '';

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    const bulletMatch = line.match(/^\s*[\*\-]\s+(.*)/);
    const numMatch = line.match(/^\s*\d+\.\s+(.*)/);

    if (headingMatch) {
      if (inList) { result += `</${listType}>`; inList = false; }
      const level = headingMatch[1].length;
      result += `<h${level}>${headingMatch[2]}</h${level}>`;
    } else if (bulletMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) result += `</${listType}>`;
        result += '<ul>';
        inList = true;
        listType = 'ul';
      }
      result += `<li>${bulletMatch[1]}</li>`;
    } else if (numMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) result += `</${listType}>`;
        result += '<ol>';
        inList = true;
        listType = 'ol';
      }
      result += `<li>${numMatch[1]}</li>`;
    } else {
      if (inList) { result += `</${listType}>`; inList = false; }
      const trimmed = line.trim();
      if (trimmed === '') {
        result += '<br>';
      } else if (/^---+\s*$/.test(trimmed)) {
        result += '<hr>';
      } else if (trimmed.startsWith('<pre>') || trimmed.startsWith('<ul>') || trimmed.startsWith('<ol>')) {
        result += trimmed;
      } else {
        result += `<p>${trimmed}</p>`;
      }
    }
  }
  if (inList) result += `</${listType}>`;

  for (let i = 0; i < mathStore.length; i++) {
    result = result.split('@@MJ' + i + '@@').join(mathStore[i]);
  }
  return result;
}

export function extractThinking(text) {
  let thinking = '';
  let content = text;

  const completeRegex = /<think>[\s\S]*?<\/think>/gi;
  let match;
  while ((match = completeRegex.exec(content)) !== null) {
    const inner = match[0].replace(/^<think>/, '').replace(/<\/think>$/, '').trim();
    thinking += inner + '\n';
  }
  content = content.replace(completeRegex, '');

  const openIdx = content.lastIndexOf('<think>');
  if (openIdx !== -1) {
    const tail = content.slice(openIdx + '<think>'.length);
    thinking += tail.trim() + '\n';
    content = content.slice(0, openIdx);
  }
  return { thinking: thinking.trim(), content: content.trim() };
}

export function buildMessageHtml(thinking, answer, timestamp) {
  let html = '';
  if (thinking) {
    html += `<details class="thinking-block"><summary>Thinking...</summary><div class="thinking-content">${formatMd(thinking)}</div></details>`;
  }
  html += formatMd(answer || '');
  if (thinking && !answer) {
    html += `<div class="truncated-note">Response truncated — the model stopped before producing an answer. Expand "Thinking..." to view its reasoning.</div>`;
  }
  const ts = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  html += `<div class="message-time">${ts}</div>`;
  return html;
}
