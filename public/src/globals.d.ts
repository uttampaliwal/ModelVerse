export {};

declare global {
  interface Window {
    MathJax?: {
      typesetPromise(elements?: Element[]): Promise<void>;
    };
  }

  // Provided by highlight.js (loaded via CDN script tag).
  // eslint-disable-next-line no-var
  var hljs: {
    highlightElement(element: Element): void;
  } | undefined;
}
