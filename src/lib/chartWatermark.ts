export function removeChartWatermark(container: HTMLElement): () => void {
  const WATERMARK_KEYWORDS = [
    "watermark",
    "logo",
    "brand",
    "tradingview",
    "trading-view",
    "tv-logo",
    "tv-watermark",
    "trading_view",
  ];

  const isWatermarkByClass = (el: Element): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    const className = (el.className || "").toString().toLowerCase();
    if (!className) return false;
    return WATERMARK_KEYWORDS.some((kw) => className.includes(kw));
  };

  const hideElement = (el: HTMLElement) => {
    if (el.style.display === "none") return;
    el.style.display = "none";
    el.style.opacity = "0";
    el.style.visibility = "hidden";
  };

  const scanAndRemove = (root: Element) => {
    if (!root || !(root instanceof Element)) return;

    const allElements = root.querySelectorAll("*");
    allElements.forEach((el) => {
      if (isWatermarkByClass(el)) {
        hideElement(el as HTMLElement);
      }
    });

    const imgs = root.querySelectorAll("img");
    imgs.forEach((img) => {
      const src = (img.src || "").toLowerCase();
      const alt = (img.alt || "").toLowerCase();
      if (
        src.includes("tradingview") ||
        src.includes("watermark") ||
        src.includes("logo") ||
        alt.includes("tradingview") ||
        alt.includes("watermark") ||
        alt.includes("logo")
      ) {
        hideElement(img);
        if (img.parentElement) {
          const parent = img.parentElement;
          const siblings = parent.children;
          if (siblings.length <= 2) {
            hideElement(parent);
          }
        }
      }
    });
  };

  scanAndRemove(container);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanAndRemove(node as Element);
        }
      });
    });
  });

  observer.observe(container, {
    childList: true,
    subtree: true,
  });

  const intervals: number[] = [];
  [100, 300, 500, 1000, 2000].forEach((delay) => {
    intervals.push(window.setTimeout(() => scanAndRemove(container), delay));
  });

  return () => {
    observer.disconnect();
    intervals.forEach((id) => clearTimeout(id));
  };
}
