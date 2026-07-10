export {};

declare global {
  interface HljsApi {
    highlight(code: string, options: { language: string }): { value: string };
    getLanguage(lang: string): unknown;
    highlightElement(element: Element): void;
  }

  interface Window {
    MathJax?: {
      typesetPromise?(elements?: Element[]): Promise<void>;
      loader?: { paths?: Record<string, string> };
      tex?: {
        inlineMath?: string[][];
        displayMath?: string[][];
      };
      options?: { skipHtmlTags?: string[] };
    };
    hljs?: HljsApi;
  }
}
