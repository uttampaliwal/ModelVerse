export {};

declare global {
  interface Window {
    MathJax?: {
      typesetPromise(elements?: Element[]): Promise<void>;
    };
  }

  // Provided by highlight.js (loaded via CDN script tag).

  var hljs:
    | {
        highlightElement(element: Element): void;
      }
    | undefined;
}
