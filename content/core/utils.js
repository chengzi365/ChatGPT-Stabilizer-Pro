(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;

  function getFormattingLocale() {
    return i18n && i18n.getFormattingLocale
      ? i18n.getFormattingLocale()
      : "en-US";
  }

  function formatNumericValue(value) {
    return new Intl.NumberFormat(getFormattingLocale()).format(value);
  }

  const coreUtils = {
    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },

    average(values) {
      if (!values.length) {
        return 0;
      }

      return values.reduce((sum, value) => sum + value, 0) / values.length;
    },

    formatDuration(ms) {
      const value = formatNumericValue(Math.round(ms));

      if (i18n && i18n.t) {
        return i18n.t("units.durationMs", { value }, "{value} ms");
      }

      return `${value} ms`;
    },

    formatNumber(value) {
      return formatNumericValue(value);
    },

    formatPercent(value) {
      return `${(value * 100).toFixed(1)}%`;
    },

    formatPixels(value) {
      const formatted = formatNumericValue(Math.round(value));

      if (i18n && i18n.t) {
        return i18n.t("units.pixels", { value: formatted }, "{value} px");
      }

      return `${formatted} px`;
    },

    nowLabel() {
      return new Date().toLocaleTimeString(getFormattingLocale(), {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    },

    escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (character) => {
        switch (character) {
          case "&":
            return "&amp;";
          case "<":
            return "&lt;";
          case ">":
            return "&gt;";
          case '"':
            return "&quot;";
          case "'":
            return "&#39;";
          default:
            return character;
        }
      });
    },

    async copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (error) {
        // Fall through to the textarea fallback.
      }

      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
        return true;
      } catch (error) {
        return false;
      }
    },

    downloadText(filename, text, mimeType = "text/plain;charset=utf-8") {
      try {
        const blob = new Blob([text], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        globalThis.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 0);
        return true;
      } catch (error) {
        return false;
      }
    },
  };

  app.core.utils = coreUtils;
})();
