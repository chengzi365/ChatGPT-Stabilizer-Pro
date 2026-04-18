(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;
  const { escapeHtml } = app.core.utils;

  const PANEL_STYLE = `
<style>
  :host{all:initial}
  .csp-shell{display:grid;gap:10px;justify-items:end;width:max-content;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;color:#111827}
  button{font:inherit;cursor:pointer}
  svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .launcher,.badge{border:1px solid rgba(15,23,42,.12);background:rgba(255,255,255,.96);box-shadow:0 12px 32px rgba(15,23,42,.16);backdrop-filter:blur(14px)}
  .launcher{position:relative;display:none;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;color:#0f766e;cursor:grab}
  .badge{display:flex;align-items:center;gap:8px;min-width:196px;padding:10px 12px;border-radius:14px;color:#0f172a;cursor:grab}
  .badge:active,.launcher:active,.panel-header:active{cursor:grabbing}
  .dot{width:10px;height:10px;border-radius:999px;background:#94a3b8;flex:none}
  .dot[data-status="active"]{background:#0f766e}
  .dot[data-status="fallback"]{background:#d97706}
  .dot[data-status="degraded"]{background:#b91c1c}
  .dot[data-status="error"]{background:#7f1d1d}
  .badge-text{display:grid;gap:2px;min-width:0}
  .badge-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
  .badge-summary{font-size:12px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .panel{position:relative;display:none;gap:8px;width:392px;height:520px;padding:16px 16px 8px;border:1px solid rgba(15,23,42,.12);border-radius:18px;background:rgba(255,255,255,.98);box-shadow:0 20px 44px rgba(15,23,42,.18);backdrop-filter:blur(16px);overflow:hidden;grid-template-rows:auto auto auto auto minmax(0,1fr) auto;grid-template-areas:"header" "summary" "stats" "tabs" "content" "footer"}
  .panel-header{grid-area:header;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;cursor:grab;user-select:none}
  .title-wrap{display:grid;gap:3px;min-width:0;flex:1 1 auto}
  .title{font-size:16px;font-weight:800}
  .subtitle{font-size:12px;color:#475569;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .debug-banner{grid-area:debug;display:none;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:start;padding:11px 13px;border-radius:14px;border:1px solid rgba(220,38,38,.3);background:linear-gradient(180deg,rgba(254,242,242,.98) 0%,rgba(254,226,226,.82) 100%);pointer-events:none}
  .debug-banner[data-active="true"]{display:grid}
  .debug-banner-dot{width:12px;height:12px;margin-top:3px;border-radius:999px;background:linear-gradient(180deg,#dc2626 0%,#ef4444 100%);box-shadow:0 0 0 0 rgba(220,38,38,.28);animation:debugPulse 1.8s ease-out infinite}
  .debug-banner-copy{display:grid;gap:4px;min-width:0}
  .debug-banner-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#0f172a}
  .debug-banner-body{font-size:12px;line-height:1.55;color:#7f1d1d}
  .summary{grid-area:summary;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 16px;border-radius:16px;background:linear-gradient(180deg,#f8fafc 0%,#eef6f5 100%);border:1px solid rgba(15,23,42,.08)}
  .summary-indicator{display:grid;gap:8px;min-width:0}
  .summary-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
  .summary-level-row{display:flex;align-items:center;gap:10px;min-width:0}
  .summary-level-dot{width:12px;height:12px;border-radius:999px;background:#94a3b8;flex:none;box-shadow:0 0 0 4px rgba(148,163,184,.12)}
  .summary-level-dot[data-status="active"]{background:#0f766e;box-shadow:0 0 0 4px rgba(15,118,110,.14)}
  .summary-level-dot[data-status="fallback"]{background:#d97706;box-shadow:0 0 0 4px rgba(217,119,6,.14)}
  .summary-level-dot[data-status="degraded"]{background:#b91c1c;box-shadow:0 0 0 4px rgba(185,28,28,.14)}
  .summary-level-dot[data-status="error"]{background:#7f1d1d;box-shadow:0 0 0 4px rgba(127,29,29,.14)}
  .summary-level-text{font-size:20px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .summary-level-text-wrap{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
  .summary-chip{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;background:#fff;border:1px solid rgba(15,23,42,.08);font-size:11px;font-weight:700;color:#334155}
  .summary-rate{display:grid;gap:4px;justify-items:end;text-align:right}
  .summary-rate-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
  .summary-rate-value{font-size:28px;font-weight:900;line-height:1;color:#0f766e}
  .summary[data-status="fallback"] .summary-rate-value{color:#d97706}
  .summary[data-status="degraded"] .summary-rate-value,
  .summary[data-status="error"] .summary-rate-value{color:#b91c1c}
  .summary[data-status="disabled"] .summary-rate-value{color:#64748b}
  .actions{display:flex;gap:6px;flex:none}
  .icon-btn,.mode-btn,.tab-btn,.trace-btn{border:1px solid rgba(15,23,42,.12);background:#fff;color:#0f172a;transition:transform .12s ease,background .12s ease,border-color .12s ease}
  .icon-btn:hover,.mode-btn:hover,.tab-btn:hover,.trace-btn:hover{transform:translateY(-1px);border-color:rgba(15,23,42,.24);background:#f8fafc}
  .icon-btn:disabled,.mode-btn:disabled,.tab-btn:disabled,.trace-btn:disabled{cursor:not-allowed;opacity:.55;transform:none}
  .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;padding:0}
  .stats-grid{grid-area:stats;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .stat-card{display:grid;gap:4px;padding:10px 12px;border-radius:14px;background:linear-gradient(180deg,#fff 0%,#f8fafc 100%);border:1px solid rgba(15,23,42,.08)}
  .stat-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
  .stat-value{font-size:18px;font-weight:800;color:#0f172a}
  .tab-strip{grid-area:tabs;display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:8px}
  .tab-btn{border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700;line-height:1.25;min-height:40px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tab-btn[data-active="true"]{border-color:#0f766e;background:rgba(15,118,110,.08);color:#0f766e}
  .tab-panels{grid-area:content;display:grid;min-height:0;height:100%;align-self:stretch;overflow:hidden}
  .tab-panel{display:none;min-height:0;height:100%;max-height:100%;overflow:auto;overscroll-behavior:contain;padding-right:2px}
  .tab-panel{scrollbar-width:thin;scrollbar-color:rgba(100,116,139,.72) transparent}
  .tab-panel::-webkit-scrollbar{width:10px;height:10px}
  .tab-panel::-webkit-scrollbar-track{background:transparent;border-radius:999px}
  .tab-panel::-webkit-scrollbar-thumb{border:2px solid transparent;border-radius:999px;background:rgba(100,116,139,.58);background-clip:padding-box}
  .tab-panel::-webkit-scrollbar-thumb:hover{background:rgba(71,85,105,.72);background-clip:padding-box}
  .tab-panel::-webkit-scrollbar-corner{background:transparent}
  .tab-panel[data-active="true"]{display:grid;gap:10px;align-content:start}
  .section{display:grid;gap:8px;padding:12px 14px;border-radius:14px;background:#fff;border:1px solid rgba(15,23,42,.08)}
  .section-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#0f172a}
  .trace-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .trace-btn{border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700;line-height:1.25;min-height:40px}
  .trace-btn[data-recording="true"]{border-color:#dc2626;background:rgba(220,38,38,.1);color:#991b1b}
  .mode-grid{display:grid;gap:8px}
  .mode-btn{display:grid;gap:4px;width:100%;border-radius:12px;padding:10px 12px;text-align:left}
  .mode-btn[data-active="true"]{border-color:#0f766e;background:rgba(15,118,110,.06)}
  .mode-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700;font-size:12px}
  .risk-tag{font-size:11px;color:#7c2d12;background:#fff7ed;padding:2px 6px;border-radius:999px}
  .risk-tag[data-risk="none"]{color:#166534;background:#f0fdf4}
  .risk-tag[data-risk="very-low"]{color:#065f46;background:#ecfdf5}
  .risk-tag[data-risk="low"]{color:#0f766e;background:#f0fdfa}
  .risk-tag[data-risk="medium"]{color:#9a3412;background:#fff7ed}
  .risk-tag[data-risk="high"]{color:#991b1b;background:#fef2f2}
  .mode-desc{font-size:12px;color:#475569;line-height:1.45}
  .mode-risk{font-size:11px;color:#7c2d12;line-height:1.4}
  .kv{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;font-size:12px}
  .kv div:nth-child(odd){color:#475569}
  .kv div:nth-child(even){font-weight:700;color:#0f172a;text-align:right}
  .events{display:grid;gap:8px;font-size:12px}
  .event{display:grid;gap:2px;padding:8px 10px;border-radius:10px;background:#f8fafc}
  .event-time{color:#64748b;font-size:11px}
  .event-detail{color:#0f172a;line-height:1.45}
  .panel-overlay{position:absolute;inset:0;display:grid;place-items:center;padding:20px;border-radius:inherit;background:linear-gradient(180deg,rgba(246,250,252,.62) 0%,rgba(238,247,246,.76) 100%);backdrop-filter:blur(18px) saturate(135%);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease,visibility .18s ease;z-index:5;overflow:hidden}
  .panel-overlay[data-active="true"]{opacity:1;visibility:visible;pointer-events:auto}
  .panel-overlay::before,.panel-overlay::after{content:"";position:absolute;border-radius:999px;filter:blur(6px);opacity:.55;animation:overlayFloat 5.8s ease-in-out infinite}
  .panel-overlay::before{width:176px;height:176px;top:-42px;right:-28px;background:radial-gradient(circle at 30% 30%,rgba(15,118,110,.22),rgba(15,118,110,0) 72%)}
  .panel-overlay::after{width:150px;height:150px;bottom:-34px;left:-22px;background:radial-gradient(circle at 65% 35%,rgba(14,165,233,.18),rgba(14,165,233,0) 74%);animation-delay:-2.1s}
  .panel-overlay-card{position:relative;display:grid;justify-items:center;gap:12px;width:min(100%,248px);padding:18px 18px 16px;border:1px solid rgba(255,255,255,.55);border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.58) 0%,rgba(255,255,255,.34) 100%);box-shadow:0 18px 38px rgba(15,23,42,.12),inset 0 1px 0 rgba(255,255,255,.62)}
  .panel-overlay-loader{position:relative;display:grid;place-items:center;width:74px;height:74px}
  .panel-overlay-loader::before,.panel-overlay-loader::after{content:"";position:absolute;border-radius:999px}
  .panel-overlay-loader::before{inset:7px;border:1px solid rgba(15,118,110,.18);background:radial-gradient(circle at 35% 35%,rgba(255,255,255,.92),rgba(255,255,255,.28) 72%)}
  .panel-overlay-loader::after{inset:0;border:1px solid rgba(15,23,42,.08);background:conic-gradient(from 180deg,rgba(15,118,110,.05),rgba(15,118,110,.42),rgba(14,165,233,.14),rgba(15,118,110,.05));mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 0);animation:overlaySpin 1.15s linear infinite}
  .panel-overlay-core{position:relative;width:26px;height:26px;border-radius:999px;background:radial-gradient(circle at 32% 32%,#ffffff 0%,#d7f6f1 36%,#0f766e 100%);box-shadow:0 0 0 7px rgba(15,118,110,.08),0 8px 18px rgba(15,118,110,.18);animation:overlayPulse 1.7s ease-in-out infinite}
  .panel-overlay-dots{display:flex;align-items:center;gap:6px}
  .panel-overlay-dots span{width:7px;height:7px;border-radius:999px;background:linear-gradient(180deg,#0f766e,#14b8a6);opacity:.28;animation:overlayDots 1.15s ease-in-out infinite}
  .panel-overlay-dots span:nth-child(2){animation-delay:.15s}
  .panel-overlay-dots span:nth-child(3){animation-delay:.3s}
  .panel-overlay-title{font-size:15px;font-weight:800;color:#0f172a;text-align:center;letter-spacing:.01em}
  .panel-overlay-body{font-size:12px;line-height:1.6;color:#475569;text-align:center}
  .panel-overlay-progress{display:grid;gap:6px;justify-items:center;width:min(100%,186px)}
  .panel-overlay-progress-track{position:relative;width:100%;height:9px;border-radius:999px;background:rgba(226,232,240,.88);box-shadow:inset 0 1px 2px rgba(15,23,42,.08);overflow:hidden}
  .panel-overlay-progress-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#0f766e 0%,#14b8a6 58%,#7dd3fc 100%);box-shadow:0 4px 14px rgba(20,184,166,.28);transition:width .22s ease}
  .panel-overlay-progress-value{font-size:12px;font-weight:800;letter-spacing:.02em;color:#0f172a}
  .panel-overlay-meta{min-height:18px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#0f766e;text-align:center}
  .panel-resize-handle{position:absolute;right:10px;bottom:10px;width:18px;height:18px;border-radius:8px;display:grid;place-items:center;background:linear-gradient(180deg,rgba(255,255,255,.96) 0%,rgba(241,245,249,.92) 100%);border:1px solid rgba(15,23,42,.08);box-shadow:0 6px 16px rgba(15,23,42,.08);cursor:nwse-resize;touch-action:none;user-select:none;z-index:6}
  .panel-resize-handle::before{content:"";width:10px;height:10px;background:
    linear-gradient(135deg,transparent 0 42%,rgba(15,23,42,.34) 42% 52%,transparent 52% 100%),
    linear-gradient(135deg,transparent 0 64%,rgba(15,23,42,.22) 64% 74%,transparent 74% 100%);
    opacity:.92}
  .panel-footer{grid-area:footer;box-sizing:border-box;display:flex;align-items:center;justify-content:center;justify-self:stretch;gap:6px;min-height:24px;margin:0 -16px;padding:0 48px;font-size:11px;line-height:1.4;color:#64748b;white-space:nowrap;overflow:visible;z-index:4}
  .theme-toggle{display:inline-flex;align-items:center;justify-content:center;min-width:58px;height:22px;padding:0 8px;border:1px solid rgba(15,23,42,.12);border-radius:8px;background:#fff;color:#0f766e;font-size:11px;font-weight:800;line-height:1;cursor:pointer}
  .theme-toggle:hover{background:#f8fafc;border-color:rgba(15,23,42,.24)}
  .csp-shell[data-trace-recording="true"] .badge{border-color:rgba(220,38,38,.34);background:linear-gradient(180deg,rgba(254,242,242,.98) 0%,rgba(254,226,226,.96) 100%);box-shadow:0 14px 32px rgba(220,38,38,.18)}
  .csp-shell[data-trace-recording="true"] .badge-summary{color:#7f1d1d;font-weight:700}
  .csp-shell[data-trace-recording="true"] .badge .dot{background:linear-gradient(180deg,#dc2626 0%,#ef4444 100%);box-shadow:0 0 0 0 rgba(220,38,38,.28);animation:debugPulse 1.8s ease-out infinite}
  .csp-shell[data-trace-recording="true"] .panel{grid-template-rows:auto auto auto auto auto minmax(0,1fr) auto;grid-template-areas:"header" "debug" "summary" "stats" "tabs" "content" "footer";border-color:rgba(220,38,38,.28);box-shadow:0 20px 44px rgba(15,23,42,.18),0 0 0 1px rgba(220,38,38,.1),0 0 0 10px rgba(248,113,113,.06)}
  .csp-shell[data-trace-recording="true"] .launcher{border-color:rgba(220,38,38,.32);color:#dc2626;box-shadow:0 14px 32px rgba(220,38,38,.18)}
  .csp-shell[data-trace-recording="true"] .launcher::after{content:"";position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:999px;background:linear-gradient(180deg,#dc2626 0%,#f87171 100%);box-shadow:0 0 0 0 rgba(220,38,38,.28);animation:debugPulse 1.8s ease-out infinite}
  .csp-shell[data-theme="dark"]{color:#f3f4f6}
  .csp-shell[data-theme="dark"] .launcher,
  .csp-shell[data-theme="dark"] .badge{border-color:rgba(229,231,235,.14);background:rgba(24,26,27,.96);box-shadow:0 12px 32px rgba(0,0,0,.34)}
  .csp-shell[data-theme="dark"] .launcher{color:#5eead4}
  .csp-shell[data-theme="dark"] .badge{color:#f3f4f6}
  .csp-shell[data-theme="dark"] .badge-summary,
  .csp-shell[data-theme="dark"] .subtitle,
  .csp-shell[data-theme="dark"] .debug-banner-body,
  .csp-shell[data-theme="dark"] .summary-label,
  .csp-shell[data-theme="dark"] .summary-rate-label,
  .csp-shell[data-theme="dark"] .stat-label,
  .csp-shell[data-theme="dark"] .kv div:nth-child(odd),
  .csp-shell[data-theme="dark"] .event-time,
  .csp-shell[data-theme="dark"] .mode-desc,
  .csp-shell[data-theme="dark"] .panel-overlay-body,
  .csp-shell[data-theme="dark"] .panel-footer{color:#a8b0b8}
  .csp-shell[data-theme="dark"] .panel{border-color:rgba(229,231,235,.12);background:rgba(18,19,20,.98);box-shadow:0 20px 44px rgba(0,0,0,.42)}
  .csp-shell[data-theme="dark"] .debug-banner{border-color:rgba(248,113,113,.28);background:linear-gradient(180deg,rgba(127,29,29,.78) 0%,rgba(69,10,10,.86) 100%)}
  .csp-shell[data-theme="dark"] .summary{border-color:rgba(229,231,235,.1);background:linear-gradient(180deg,#202324 0%,#181a1b 100%)}
  .csp-shell[data-theme="dark"] .debug-banner-title{color:#fee2e2}
  .csp-shell[data-theme="dark"] .debug-banner-body{color:#fecaca}
  .csp-shell[data-theme="dark"] .summary-level-text,
  .csp-shell[data-theme="dark"] .stat-value,
  .csp-shell[data-theme="dark"] .section-title,
  .csp-shell[data-theme="dark"] .kv div:nth-child(even),
  .csp-shell[data-theme="dark"] .event-detail,
  .csp-shell[data-theme="dark"] .panel-overlay-title,
  .csp-shell[data-theme="dark"] .panel-overlay-progress-value{color:#f8fafc}
  .csp-shell[data-theme="dark"] .summary-chip,
  .csp-shell[data-theme="dark"] .stat-card,
  .csp-shell[data-theme="dark"] .section,
  .csp-shell[data-theme="dark"] .event{border-color:rgba(229,231,235,.1);background:#202324;color:#f3f4f6}
  .csp-shell[data-theme="dark"] .tab-panel{scrollbar-color:rgba(156,163,175,.72) #181a1b}
  .csp-shell[data-theme="dark"] .tab-panel::-webkit-scrollbar-track{background:#181a1b}
  .csp-shell[data-theme="dark"] .tab-panel::-webkit-scrollbar-thumb{border-color:#181a1b;background:rgba(156,163,175,.58);background-clip:padding-box}
  .csp-shell[data-theme="dark"] .tab-panel::-webkit-scrollbar-thumb:hover{background:rgba(209,213,219,.72);background-clip:padding-box}
  .csp-shell[data-theme="dark"] .tab-panel::-webkit-scrollbar-corner{background:#181a1b}
  .csp-shell[data-theme="dark"] .icon-btn,
  .csp-shell[data-theme="dark"] .mode-btn,
  .csp-shell[data-theme="dark"] .tab-btn,
  .csp-shell[data-theme="dark"] .trace-btn,
  .csp-shell[data-theme="dark"] .theme-toggle{border-color:rgba(229,231,235,.12);background:#202324;color:#f3f4f6}
  .csp-shell[data-theme="dark"] .icon-btn:hover,
  .csp-shell[data-theme="dark"] .mode-btn:hover,
  .csp-shell[data-theme="dark"] .tab-btn:hover,
  .csp-shell[data-theme="dark"] .trace-btn:hover,
  .csp-shell[data-theme="dark"] .theme-toggle:hover{border-color:rgba(94,234,212,.34);background:#2b2f31}
  .csp-shell[data-theme="dark"] .tab-btn[data-active="true"],
  .csp-shell[data-theme="dark"] .mode-btn[data-active="true"]{border-color:#0f766e;background:rgba(15,118,110,.14);color:#99f6e4}
  .csp-shell[data-theme="dark"] .trace-btn[data-recording="true"]{border-color:#f87171;background:rgba(248,113,113,.14);color:#fecaca}
  .csp-shell[data-theme="dark"][data-trace-recording="true"] .badge{border-color:rgba(248,113,113,.3);background:linear-gradient(180deg,rgba(127,29,29,.88) 0%,rgba(17,24,39,.94) 100%);box-shadow:0 14px 32px rgba(0,0,0,.34),0 0 0 1px rgba(248,113,113,.1)}
  .csp-shell[data-theme="dark"][data-trace-recording="true"] .badge-summary{color:#fecaca}
  .csp-shell[data-theme="dark"][data-trace-recording="true"] .badge .dot,
  .csp-shell[data-theme="dark"][data-trace-recording="true"] .debug-banner-dot,
  .csp-shell[data-theme="dark"][data-trace-recording="true"] .launcher::after{background:linear-gradient(180deg,#f87171 0%,#ef4444 100%);box-shadow:0 0 0 0 rgba(248,113,113,.24)}
  .csp-shell[data-theme="dark"][data-trace-recording="true"] .panel{border-color:rgba(248,113,113,.24);box-shadow:0 20px 44px rgba(0,0,0,.42),0 0 0 1px rgba(248,113,113,.1),0 0 0 10px rgba(248,113,113,.05)}
  .csp-shell[data-theme="dark"][data-trace-recording="true"] .launcher{border-color:rgba(248,113,113,.26);color:#fca5a5;box-shadow:0 14px 32px rgba(0,0,0,.34),0 0 0 1px rgba(248,113,113,.1)}
  .csp-shell[data-theme="dark"] .summary-rate-value,
  .csp-shell[data-theme="dark"] .panel-overlay-meta{color:#5eead4}
  .csp-shell[data-theme="dark"] .mode-risk{color:#fbbf24}
  .csp-shell[data-theme="dark"] .risk-tag{color:#fdba74;background:rgba(251,146,60,.13)}
  .csp-shell[data-theme="dark"] .risk-tag[data-risk="none"],
  .csp-shell[data-theme="dark"] .risk-tag[data-risk="very-low"]{color:#86efac;background:rgba(34,197,94,.13)}
  .csp-shell[data-theme="dark"] .risk-tag[data-risk="low"]{color:#5eead4;background:rgba(20,184,166,.13)}
  .csp-shell[data-theme="dark"] .risk-tag[data-risk="high"]{color:#fca5a5;background:rgba(239,68,68,.14)}
  .csp-shell[data-theme="dark"] .panel-overlay{background:linear-gradient(180deg,rgba(24,26,27,.68) 0%,rgba(18,19,20,.84) 100%)}
  .csp-shell[data-theme="dark"] .panel-overlay-card{border-color:rgba(229,231,235,.13);background:linear-gradient(180deg,rgba(32,35,36,.74) 0%,rgba(24,26,27,.58) 100%);box-shadow:0 18px 38px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.08)}
  .csp-shell[data-theme="dark"] .panel-overlay-loader::before{border-color:rgba(94,234,212,.2);background:radial-gradient(circle at 35% 35%,rgba(255,255,255,.18),rgba(255,255,255,.04) 72%)}
  .csp-shell[data-theme="dark"] .panel-overlay-progress-track{background:rgba(75,85,99,.72)}
  .csp-shell[data-theme="dark"] .panel-resize-handle{border-color:rgba(229,231,235,.12);background:linear-gradient(180deg,rgba(43,47,49,.96) 0%,rgba(32,35,36,.92) 100%);box-shadow:0 6px 16px rgba(0,0,0,.24)}
  .csp-shell[data-theme="dark"] .panel-resize-handle::before{background:
    linear-gradient(135deg,transparent 0 42%,rgba(229,231,235,.48) 42% 52%,transparent 52% 100%),
    linear-gradient(135deg,transparent 0 64%,rgba(229,231,235,.32) 64% 74%,transparent 74% 100%)}
  @keyframes overlaySpin{to{transform:rotate(360deg)}}
  @keyframes overlayPulse{0%,100%{transform:scale(.94)}50%{transform:scale(1.04)}}
  @keyframes overlayDots{0%,100%{transform:translateY(0);opacity:.24}50%{transform:translateY(-4px);opacity:1}}
  @keyframes overlayFloat{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,8px,0)}}
  @keyframes debugPulse{0%{transform:scale(.96);box-shadow:0 0 0 0 rgba(220,38,38,.26)}70%{transform:scale(1);box-shadow:0 0 0 8px rgba(220,38,38,0)}100%{transform:scale(.96);box-shadow:0 0 0 0 rgba(220,38,38,0)}}
  @media (max-width:640px){.panel-header{flex-direction:column;align-items:stretch}.actions{justify-content:flex-end}.summary{grid-template-columns:1fr}.summary-rate{justify-items:start;text-align:left}.tab-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>`;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  app.ui.buildPanelTemplate = function buildPanelTemplate() {
    return `${PANEL_STYLE}
<div class="csp-shell">
  <button class="launcher" type="button" data-drag-handle="launcher"></button>
  <button class="badge" type="button" data-drag-handle="badge">
    <span class="dot" data-status="disabled"></span>
    <span class="badge-text">
      <span class="badge-title">${escapeHtml(t("panel.badgeTitle"))}</span>
      <span class="badge-summary">${escapeHtml(t("panel.badgeWaiting"))}</span>
    </span>
  </button>
  <div class="panel">
    <div class="panel-overlay" data-active="false">
      <div class="panel-overlay-card">
        <div class="panel-overlay-loader" aria-hidden="true">
          <div class="panel-overlay-core"></div>
        </div>
        <div class="panel-overlay-dots" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="panel-overlay-title"></div>
        <div class="panel-overlay-body"></div>
        <div class="panel-overlay-progress">
          <div class="panel-overlay-progress-track">
            <div class="panel-overlay-progress-fill"></div>
          </div>
          <div class="panel-overlay-progress-value"></div>
        </div>
        <div class="panel-overlay-meta"></div>
      </div>
    </div>
    <div class="panel-header" data-drag-handle="header">
      <div class="title-wrap">
        <div class="title">${escapeHtml(t("panel.title"))}</div>
        <div class="subtitle">${escapeHtml(t("panel.subtitle"))}</div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-action="copy" data-no-drag="true" type="button"></button>
        <button class="icon-btn" data-action="resync" data-no-drag="true" type="button"></button>
        <button class="icon-btn" data-action="restore" data-no-drag="true" type="button"></button>
        <button class="icon-btn" data-action="collapse" data-no-drag="true" type="button"></button>
        <button class="icon-btn" data-action="hide" data-no-drag="true" type="button"></button>
      </div>
    </div>
    <div class="debug-banner" data-active="false"></div>
    <div class="summary"></div>
    <div class="stats-grid"></div>
    <div class="tab-strip"></div>
    <div class="tab-panels">
      <div class="tab-panel" data-tab-panel="overview">
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.runtime"))}</div>
          <div class="kv" data-section="runtime"></div>
        </div>
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.impact"))}</div>
          <div class="kv" data-section="impact"></div>
        </div>
      </div>
      <div class="tab-panel" data-tab-panel="mode">
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.mode"))}</div>
          <div class="mode-grid"></div>
        </div>
      </div>
      <div class="tab-panel" data-tab-panel="messages">
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.messages"))}</div>
          <div class="kv" data-section="message-summary"></div>
        </div>
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.units", {}, "Content Blocks"))}</div>
          <div class="kv" data-section="messages"></div>
        </div>
      </div>
      <div class="tab-panel" data-tab-panel="performance">
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.performance"))}</div>
          <div class="kv" data-section="performance"></div>
        </div>
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.fallback"))}</div>
          <div class="kv" data-section="fallback"></div>
        </div>
      </div>
      <div class="tab-panel" data-tab-panel="events">
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.trace", {}, "Debug Log"))}</div>
          <div class="kv" data-section="trace-summary"></div>
          <div class="trace-actions">
            <button class="trace-btn" data-trace-action="toggle" type="button"></button>
            <button class="trace-btn" data-trace-action="export" type="button"></button>
            <button class="trace-btn" data-trace-action="copy" type="button"></button>
            <button class="trace-btn" data-trace-action="clear" type="button"></button>
          </div>
        </div>
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.events"))}</div>
          <div class="events"></div>
        </div>
      </div>
    </div>
    <div class="panel-footer">
      <button class="theme-toggle" data-theme-toggle type="button"></button>
      <span>·</span>
      <span>v${escapeHtml(app.version)}</span>
      <span>·</span>
      <span>GPL-3.0</span>
    </div>
    <div class="panel-resize-handle"></div>
  </div>
</div>`;
  };
})();
