const LATEX_MATH_CMDS = new Set([
  'boxed','frac','dfrac','tfrac','sqrt','binom','overset','underset','substack','genfrac',
  'vec','bar','hat','tilde','dot','ddot','dddot','widetilde','widehat','overline','underline','overbrace','underbrace','overrightarrow','overleftarrow',
  'sum','prod','int','oint','iint','iiint','iiiint','lim','coprod','bigcup','bigcap','bigoplus','bigotimes','bigsqcup','bigvee','bigwedge',
  'leq','le','ge','geq','ne','neq','approx','approxeq','equiv','sim','simeq','cong','in','notin','subset','subseteq','supset','supseteq','subsetneq','supsetneq','mapsto','implies','impliedby','iff','forall','exists','nexists','pm','mp','times','div','cdot','ast','circ','star','oplus','otimes','langle','rangle','perp','parallel','propto','partial','nabla','infty','emptyset','setminus','cup','cap',
  'alpha','beta','gamma','delta','epsilon','varepsilon','zeta','eta','theta','vartheta','iota','kappa','lambda','mu','nu','xi','pi','varpi','rho','varrho','sigma','varsigma','tau','upsilon','phi','varphi','chi','psi','omega',
  'Gamma','Delta','Theta','Lambda','Xi','Pi','Sigma','Upsilon','Phi','Psi','Omega',
  'log','ln','sin','cos','tan','cot','sec','csc','arcsin','arccos','arctan','exp','det','gcd','min','max','sup','inf','deg','Pr','bmod','pmod','mod',
  'mathbb','mathbf','mathit','mathrm','mathcal','mathfrak','mathsf','mathtt','text','textbf','textit','textrm','operatorname','boldsymbol','bm',
  'left','right','big','Big','bigg','Bigg','quad','qquad','space',
  'begin','end','matrix','pmatrix','bmatrix','Bmatrix','vmatrix','Vmatrix','cases','array','aligned','gathered','split','eqnarray','smallmatrix'
]);

const LANG_ICONS: Record<string, string> = {
  javascript: 'js', typescript: 'ts', python: 'py', rust: 'rs',
  html: 'html', css: 'css', json: 'json', yaml: 'yml',
  bash: 'sh', shell: 'sh', sh: 'sh', zsh: 'sh',
  cpp: 'c++', c: 'c', csharp: 'cs', java: 'java',
  go: 'go', ruby: 'rb', php: 'php', swift: 'swift',
  kotlin: 'kt', scala: 'scala', r: 'r', lua: 'lua',
  sql: 'sql', xml: 'xml', markdown: 'md', dockerfile: 'docker',
  makefile: 'make', cmake: 'cmake', vim: 'vim',
  plaintext: 'txt', text: 'txt', txt: 'txt',
};

const LANG_COLORS: Record<string, string> = {
  javascript: '#f7df1e', typescript: '#3178c6', python: '#3776ab',
  rust: '#dea584', html: '#e34f26', css: '#1572b6', json: '#292929',
  bash: '#4eaa25', shell: '#4eaa25', sh: '#4eaa25',
  cpp: '#00599c', c: '#555555', java: '#ed8b00', go: '#00add8',
  ruby: '#cc342d', php: '#777bb4', swift: '#f05138', kotlin: '#7f52ff',
  r: '#276dc3', sql: '#e38c00', markdown: '#083fa1',
  dockerfile: '#2496ed', makefile: '#427819',
};

function getLangIcon(lang: string): string {
  const key = lang.toLowerCase();
  return LANG_ICONS[key] || lang.substring(0, 3);
}

function getLangColor(lang: string): string {
  const key = lang.toLowerCase();
  return LANG_COLORS[key] || '#6b7280';
}

function readBrace(text: string, start: number): [string, number] {
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
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return [result, i];
}

function stashRawLatex(text: string, stash: (m: string) => string): string {
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
          while (k < n && /\s/.test(text[k])) {
            expr += text[k];
            k++;
          }
          if (text[k] === '{') {
            const [grp, nk] = readBrace(text, k);
            expr += grp;
            k = nk;
            advanced = true;
          } else if ('^_+-=/()[]'.includes(text[k])) {
            expr += text[k];
            k++;
            advanced = true;
          } else if (text[k] === '\\' && k + 1 < n && /[a-zA-Z]/.test(text[k + 1])) {
            let m = k + 1;
            while (m < n && /[a-zA-Z]/.test(text[m])) m++;
            const sub = text.slice(k + 1, m);
            if (LATEX_MATH_CMDS.has(sub)) {
              expr += text.slice(k, m);
              k = m;
              advanced = true;
            }
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

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type HighlightFn = (code: string, lang: string) => string;

/** Highlights code using the page-loaded highlight.js (main thread). */
const mainThreadHighlight: HighlightFn = (code, lang) => {
  const hl = typeof window !== 'undefined' ? (window as unknown as { hljs?: any }).hljs : undefined;
  if (hl && typeof hl.highlight === 'function') {
    try {
      const language = hl.getLanguage && hl.getLanguage(lang) ? lang : 'plaintext';
      return hl.highlight(code, { language }).value;
    } catch {
      return escapeHtml(code);
    }
  }
  return escapeHtml(code);
};

// Callout types with icons and colors
const CALLOUT_TYPES: Record<string, { icon: string; color: string }> = {
  note: { icon: 'ℹ️', color: '#3b82f6' },
  tip: { icon: '💡', color: '#10b981' },
  info: { icon: 'ℹ️', color: '#3b82f6' },
  warning: { icon: '⚠️', color: '#f59e0b' },
  danger: { icon: '🚨', color: '#ef4444' },
  important: { icon: '❗', color: '#8b5cf6' },
  success: { icon: '✅', color: '#22c55e' },
  question: { icon: '❓', color: '#06b6d4' },
  bug: { icon: '🐛', color: '#ef4444' },
  example: { icon: '📝', color: '#6366f1' },
  quote: { icon: '💬', color: '#6b7280' },
};

export function formatMd(text: string, highlight: HighlightFn = mainThreadHighlight): string {
  if (!text) return '';

  const mathStore: string[] = [];
  const stash = (m: string): string => {
    const escaped = escapeHtml(m);
    mathStore.push(escaped);
    return `@@MJ${mathStore.length - 1}@@`;
  };

  let t = text
    .replace(/\$\$[\s\S]*?\$\$/g, stash)
    .replace(/\\\[[\s\S]*?\\\]/g, stash)
    .replace(/\\\([\s\S]*?\\\)/g, stash)
    .replace(/\$(?!\$)([^$\n]+?)\$(?!\$)/g, stash);

  t = stashRawLatex(t, stash);

  // Extract fenced code blocks before escaping so the highlighter sees raw code.
  const codeStore: { lang: string; code: string }[] = [];
  t = t.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeStore.push({ lang: lang || 'plaintext', code: code.replace(/\n$/, '') });
    return `@@CODE${codeStore.length - 1}@@`;
  });

  // Extract tables before escaping
  const tableStore: string[] = [];
  t = t.replace(/(?:^|\n)((?:\|.+\|\n)+)/g, (match, tableBlock: string) => {
    const rows = tableBlock.trim().split('\n');
    if (rows.length < 2) return match;

    // Check if second row is separator
    const isSeparator = /^\|[\s\-:|]+\|$/.test(rows[1].trim());
    if (!isSeparator) return match;

    const headerRow = rows[0].trim();
    const dataRows = rows.slice(2);

    const parseCells = (row: string): string[] =>
      row.split('|').slice(1, -1).map((c) => c.trim());

    const headers = parseCells(headerRow);
    const tableHtml = [
      '<div class="md-table-wrap"><table class="md-table">',
      '<thead><tr>',
      ...headers.map((h) => `<th>${h}</th>`),
      '</tr></thead>',
      '<tbody>',
      ...dataRows.map((row) => {
        const cells = parseCells(row.trim());
        return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
      }),
      '</tbody></table></div>',
    ].join('');

    tableStore.push(tableHtml);
    return `\n@@TABLE${tableStore.length - 1}@@\n`;
  });

  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Task lists
  t = t.replace(/^[\s]*[-*]\s+\[x\]\s+(.+)$/gm, '<li class="task-item done"><input type="checkbox" checked disabled><span>$1</span></li>');
  t = t.replace(/^[\s]*[-*]\s+\[\s?\]\s+(.+)$/gm, '<li class="task-item"><input type="checkbox" disabled><span>$1</span></li>');

  // Callout boxes
  t = t.replace(/^>\s*\[!(note|tip|info|warning|danger|important|success|question|bug|example|quote)\]\s*\n((?:>\s?.*\n?)*)/gm, (_, type: string, content: string) => {
    const inner = content.split('\n').map((l: string) => l.replace(/^>\s?/, '')).join('\n').trim();
    return `@@CALLOUT${type}@@${inner}@@ENDCALLOUT@@`;
  });

  // Spoilers
  t = t.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

  // Footnotes
  const footnotes: { id: string; content: string }[] = [];
  t = t.replace(/\[\^(\w+)\]:\s*(.+)/g, (_, id: string, content: string) => {
    footnotes.push({ id, content: content.trim() });
    return `@@FN${footnotes.length - 1}@@`;
  });
  t = t.replace(/\[\^(\w+)\]/g, '<sup class="footnote-ref"><a href="#fn-$1" id="fnref-$1">[$1]</a></sup>');

  const lines = t.split('\n');
  let result = '';
  let inList = false;
  let listType = '';

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    const bulletMatch = line.match(/^\s*[\*\-]\s+(.*)/);
    const numMatch = line.match(/^\s*\d+\.\s+(.*)/);

    // Check for task items
    const taskMatch = line.match(/^<li class="task-item/);

    if (headingMatch) {
      if (inList) {
        result += `</${listType}>`;
        inList = false;
      }
      const level = headingMatch[1].length;
      result += `<h${level}>${headingMatch[2]}</h${level}>`;
    } else if (taskMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) result += `</${listType}>`;
        result += '<ul class="task-list">';
        inList = true;
        listType = 'ul';
      }
      result += line;
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
      if (inList) {
        result += `</${listType}>`;
        inList = false;
      }
      const trimmed = line.trim();
      if (trimmed === '') {
        result += '<br>';
      } else if (/^---+\s*$/.test(trimmed)) {
        result += '<hr>';
      } else if (
        trimmed.startsWith('<pre>') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<li') ||
        /^@@CODE\d+@@$/.test(trimmed) ||
        /^@@TABLE\d+@@$/.test(trimmed) ||
        /^@@CALLOUT/.test(trimmed) ||
        /^@@ENDCALLOUT@@$/.test(trimmed) ||
        /^@@FN\d+@@$/.test(trimmed)
      ) {
        result += trimmed;
      } else {
        result += `<p>${trimmed}</p>`;
      }
    }
  }
  if (inList) result += `</${listType}>`;

  // Replace code blocks
  for (let i = 0; i < codeStore.length; i++) {
    const { lang, code } = codeStore[i];
    const inner = highlight(code, lang);
    const langLabel = lang === 'plaintext' ? 'Code' : lang;
    const escapedCode = escapeHtml(code);
    const langIcon = getLangIcon(lang);
    const langColor = getLangColor(lang);
    const lineCount = code.split('\n').length;
    const runLanguages = ['python', 'javascript', 'typescript', 'bash', 'sh', 'shell', 'js', 'ts', 'py'];
    const canRun = runLanguages.includes(lang.toLowerCase());

    // Generate line numbers
    const lineNumbers = Array.from({ length: lineCount }, (_, i) =>
      `<span class="line-number">${i + 1}</span>`
    ).join('');

    // Check if it's a mermaid block
    if (lang === 'mermaid') {
      result = result.split('@@CODE' + i + '@@').join(`
<div class="mermaid-block">
  <div class="code-block-header">
    <span class="code-block-lang"><span class="lang-icon" style="--lang-color: ${langColor}">${langIcon}</span>Mermaid</span>
    <div class="code-block-actions">
      <button class="code-block-btn code-block-copy" title="Copy code" aria-label="Copy code">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
      </button>
    </div>
  </div>
  <div class="mermaid-content" data-mermaid="${escapeHtml(code)}"></div>
  <textarea class="code-block-raw" style="display:none">${escapedCode}</textarea>
</div>`);
    } else {
      result = result.split('@@CODE' + i + '@@').join(`
<div class="code-block" data-lang="${lang}">
  <div class="code-block-header">
    <span class="code-block-lang"><span class="lang-icon" style="--lang-color: ${langColor}">${langIcon}</span>${langLabel}</span>
    <div class="code-block-actions">
      <button class="code-block-btn code-block-copy" title="Copy code" aria-label="Copy code">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
      </button>
      <button class="code-block-btn code-block-download" title="Download file" aria-label="Download code as file">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>Download</span>
      </button>
      ${canRun ? `<button class="code-block-btn code-block-run" title="Run code" aria-label="Run code" data-lang="${lang}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>Run</span>
      </button>` : ''}
      <button class="code-block-btn code-block-collapse" title="Collapse code" aria-label="Collapse code block">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        <span>Collapse</span>
      </button>
    </div>
  </div>
  <div class="code-block-body">
    <div class="code-line-numbers" aria-hidden="true">${lineNumbers}</div>
    <pre class="code-block-pre"><code class="lang-${lang}">${inner}</code></pre>
  </div>
  <textarea class="code-block-raw" style="display:none">${escapedCode}</textarea>
</div>`);
    }
  }

  // Replace tables
  for (let i = 0; i < tableStore.length; i++) {
    result = result.split('@@TABLE' + i + '@@').join(tableStore[i]);
  }

  // Replace callouts
  result = result.replace(/@@CALLOUT(\w+)@@([\s\S]*?)@@ENDCALLOUT@@/g, (_, type: string, content: string) => {
    const c = CALLOUT_TYPES[type.toLowerCase()] || CALLOUT_TYPES.note;
    return `<div class="callout callout-${type.toLowerCase()}" style="--callout-color: ${c.color}">
      <div class="callout-header">
        <span class="callout-icon">${c.icon}</span>
        <span class="callout-type">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
      </div>
      <div class="callout-content">${content.trim()}</div>
    </div>`;
  });

  // Replace footnotes
  if (footnotes.length > 0) {
    result += '<div class="footnotes"><hr><ol class="footnotes-list">';
    footnotes.forEach((fn) => {
      result += `<li id="fn-${fn.id}">${fn.content} <a href="#fnref-${fn.id}" class="footnote-backref">↩</a></li>`;
    });
    result += '</ol></div>';
  }

  for (let i = 0; i < mathStore.length; i++) {
    result = result.split('@@MJ' + i + '@@').join(mathStore[i]);
  }
  return result;
}

export function extractThinking(text: string): { thinking: string; content: string } {
  let thinking = '';
  let content = text;

  const completeRegex = /<think>[\s\S]*?<\/think>/gi;
  let match: RegExpExecArray | null;
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

export function buildMessageHtml(
  thinking: string,
  answer: string,
  timestamp?: number | string,
  highlight?: HighlightFn,
  thinkingDuration?: number,
): string {
  let html = '';
  if (thinking) {
    const durationText = thinkingDuration != null ? ` (${formatDuration(thinkingDuration)})` : '';
    const tokenCount = thinking.split(/\s+/).length;
    const escapedThinking = escapeHtml(thinking);
    html += `<details class="thinking-block"><summary class="thinking-summary"><span class="thinking-icon">🧠</span><span class="thinking-label">Reasoning${durationText}</span><span class="thinking-meta">${tokenCount} tokens</span></summary><div class="thinking-content"><pre class="thinking-pre">${escapedThinking}</pre></div></details>`;
  }
  html += formatMd(answer || '', highlight);
  if (thinking && !answer) {
    html += `<div class="truncated-note">Response truncated — the model stopped before producing an answer. Expand "Reasoning" to view its reasoning.</div>`;
  }
  const ts = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  html += `<div class="message-time">${ts}</div>`;
  return html;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs} second${secs === 1 ? '' : 's'}`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}
