export function renderMath(element: Element): void {
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
    window.MathJax.typesetPromise([element]).catch(() => {});
  }
}

export function highlightCodeBlocks(): void {
  const hl = hljs;
  if (typeof hl !== 'undefined') {
    document.querySelectorAll('.message-content pre code').forEach((node) => {
      try {
        hl.highlightElement(node);
      } catch (e) {}
    });
  }
}
