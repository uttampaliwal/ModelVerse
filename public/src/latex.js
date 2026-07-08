export function renderMath(element) {
  if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
    MathJax.typesetPromise([element]).catch(() => {});
  }
}

export function highlightCodeBlocks() {
  if (typeof hljs !== 'undefined') {
    document.querySelectorAll('.message-content pre code').forEach(el => {
      try { hljs.highlightElement(el); } catch (e) {}
    });
  }
}
