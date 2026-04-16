(() => {
  const app = globalThis.__CSP__;

  const COMPLEXITY_TAG_WEIGHTS = Object.freeze({
    PRE: 32,
    TABLE: 34,
    CODE: 6,
    UL: 10,
    OL: 10,
    BLOCKQUOTE: 12,
    IMG: 18,
    SVG: 18,
    CANVAS: 24,
    VIDEO: 24,
    AUDIO: 16,
    DETAILS: 12,
    KBD: 4,
  });

  const COMPLEXITY_RICH_TAGS = new Set([
    "PRE",
    "TABLE",
    "CODE",
    "IMG",
    "SVG",
    "CANVAS",
    "VIDEO",
    "AUDIO",
    "BLOCKQUOTE",
    "UL",
    "OL",
    "DETAILS",
  ]);

  const COMPLEXITY_LIGHT_BLOCK_TAGS = new Set([
    "P",
    "LI",
    "TR",
    "TD",
    "TH",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
  ]);

  const COMPLEXITY_LIMITS = Object.freeze({
    elementWalk: 220,
    textNodeSample: 96,
    textCharSample: 8192,
  });

  function createEmptyContentProfileCache() {
    return {
      signature: "",
      profiledAt: 0,
      nodeCountEstimate: null,
      structureScoreEstimate: null,
      richContentCountEstimate: null,
      textLengthEstimate: null,
      plainTextDominant: null,
    };
  }

  function hashTagName(tagName) {
    let hash = 17;

    for (let index = 0; index < tagName.length; index += 1) {
      hash = ((hash * 33) ^ tagName.charCodeAt(index)) >>> 0;
    }

    return hash >>> 0;
  }

  function applyContentProfileCache(record, profile, profiledAt) {
    record.contentProfileCache = {
      signature: profile.contentSignature || "",
      profiledAt,
      nodeCountEstimate: profile.nodeCountEstimate,
      structureScoreEstimate: profile.structureScoreEstimate,
      richContentCountEstimate: profile.richContentCountEstimate,
      textLengthEstimate: profile.textLengthEstimate,
      plainTextDominant: profile.plainTextDominant,
    };
    record.nodeCountEstimate = profile.nodeCountEstimate;
    record.structureScoreEstimate = profile.structureScoreEstimate;
    record.richContentCountEstimate = profile.richContentCountEstimate;
    record.textLengthEstimate = profile.textLengthEstimate;
    record.plainTextDominant = profile.plainTextDominant;
    record.needsContentProfile = false;
  }

  function clearContentProfileCache(record) {
    record.contentProfileCache = createEmptyContentProfileCache();
    record.nodeCountEstimate = null;
    record.structureScoreEstimate = null;
    record.richContentCountEstimate = null;
    record.textLengthEstimate = null;
    record.plainTextDominant = null;
    record.needsContentProfile = true;
  }

  function estimateContentProfile(element) {
    let nodeCountEstimate = 1;
    let richContentCountEstimate = 0;
    let structureScoreEstimate = 0;
    let textLengthEstimate = 0;
    let lineBreakCount = 0;
    let structureHash = 17;
    const elementWalker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT
    );
    let currentNode = elementWalker.nextNode();

    while (currentNode && nodeCountEstimate < COMPLEXITY_LIMITS.elementWalk) {
      const tagName = currentNode.tagName || "";

      nodeCountEstimate += 1;
      structureScoreEstimate += COMPLEXITY_TAG_WEIGHTS[tagName] || 0;
      structureHash =
        ((structureHash * 33) ^ hashTagName(tagName) ^ nodeCountEstimate) >>> 0;

      if (COMPLEXITY_RICH_TAGS.has(tagName)) {
        richContentCountEstimate += 1;
      } else if (COMPLEXITY_LIGHT_BLOCK_TAGS.has(tagName)) {
        structureScoreEstimate += 1;
      }

      currentNode = elementWalker.nextNode();
    }

    const textWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return String(node.nodeValue || "").trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
    let sampledTextNodes = 0;
    let textNode = textWalker.nextNode();

    while (
      textNode &&
      sampledTextNodes < COMPLEXITY_LIMITS.textNodeSample &&
      textLengthEstimate < COMPLEXITY_LIMITS.textCharSample
    ) {
      const textValue = String(textNode.nodeValue || "");
      const remainingChars =
        COMPLEXITY_LIMITS.textCharSample - textLengthEstimate;
      const sample =
        textValue.length > remainingChars
          ? textValue.slice(0, remainingChars)
          : textValue;

      textLengthEstimate += sample.length;
      lineBreakCount += (sample.match(/\n/g) || []).length;
      sampledTextNodes += 1;

      if (sample.length >= remainingChars) {
        break;
      }

      textNode = textWalker.nextNode();
    }

    const textDensity = textLengthEstimate / Math.max(nodeCountEstimate, 1);

    structureScoreEstimate += Math.min(nodeCountEstimate, 40);
    structureScoreEstimate += Math.min(Math.floor(lineBreakCount / 6), 18);

    const plainTextDominant =
      richContentCountEstimate === 0 &&
      textLengthEstimate >= 900 &&
      textDensity >= 40 &&
      structureScoreEstimate <= 70;

    return {
      nodeCountEstimate,
      richContentCountEstimate,
      structureScoreEstimate,
      textLengthEstimate,
      plainTextDominant,
      contentSignature: `${nodeCountEstimate}:${richContentCountEstimate}:${structureHash.toString(
        36
      )}`,
    };
  }

  function estimateNodeCount(element) {
    return estimateContentProfile(element).nodeCountEstimate;
  }

  function getTextSignature(element) {
    const text = String(element.textContent || "").trim();
    return `${text.length}:${text.slice(-96)}`;
  }

  function hasStreamingSignal(messageElement, contentElement) {
    const roots = [];

    if (contentElement instanceof HTMLElement) {
      roots.push(contentElement);
    }

    if (
      messageElement instanceof HTMLElement &&
      messageElement !== contentElement
    ) {
      roots.push(messageElement);
    }

    for (let index = 0; index < roots.length; index += 1) {
      const root = roots[index];

      if (root.matches("[aria-busy='true']")) {
        return true;
      }

      if (
        root.querySelector(
          "[aria-busy='true'], [data-is-streaming='true'], [data-state='streaming'], [data-status='streaming']"
        )
      ) {
        return true;
      }
    }

    return false;
  }

  app.dom.contentProfile = Object.freeze({
    createEmptyContentProfileCache,
    applyContentProfileCache,
    clearContentProfileCache,
    estimateContentProfile,
    estimateNodeCount,
    getTextSignature,
    hasStreamingSignal,
  });

  Object.assign(app.dom, {
    estimateContentProfile,
    estimateNodeCount,
    createEmptyContentProfileCache,
    getTextSignature,
    hasStreamingSignal,
  });
})();
