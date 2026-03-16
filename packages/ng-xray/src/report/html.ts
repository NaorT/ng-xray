import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AnalyzerRunInfo, Diagnostic, ScanResult, SignalReadinessReport } from '../types.js';
import {
  RULE_MAX_DEDUCTIONS,
  SEVERITY_WEIGHTS,
  VERSION,
} from '../constants.js';
import { generateCursorPrompt, generateFixAllPrompt } from './cursor-prompts.js';
import { getTopHotspots } from './heatmap.js';
import { RULE_DOCS } from './rule-docs.js';
import type { HistoryData } from '../history.js';

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const scoreColor = (s: number) =>
  s >= 85 ? 'var(--accent)' : s >= 70 ? 'var(--amber)' : s >= 50 ? 'var(--amber)' : 'var(--red)';

const scoreColorRaw = (s: number) =>
  s >= 85 ? '#3B82F6' : s >= 70 ? '#E3A008' : s >= 50 ? '#E3A008' : '#F85149';

const priorityBadge = (p: string) =>
  p === 'high' ? 'badge-high' : p === 'medium' ? 'badge-med' : 'badge-low';

const effortBadge = (e: string) =>
  e === 'quick-fix' ? 'badge-qf' : e === 'moderate' ? 'badge-mod' : 'badge-ref';

const MAX_FILES_PER_GROUP = 5;

const CATEGORY_LABELS: Record<string, string> = {
  'best-practices': 'Best Practices',
  performance: 'Performance',
  architecture: 'Architecture',
  'dead-code': 'Dead Code',
  security: 'Security',
};

const CATEGORY_ICONS: Record<string, string> = {
  'best-practices': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  performance: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  architecture: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
  'dead-code': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  security: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>',
};

const LOGO_SVG = `<svg width="48" height="48" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes xr-spin{to{transform:rotate(360deg)}}
    @keyframes xr-spin-rev{to{transform:rotate(-360deg)}}
    @keyframes xr-pulse{0%,100%{opacity:1}50%{opacity:.3}}
  </style>
  <line x1="32" y1="4" x2="32" y2="14" stroke="var(--text-ghost)" stroke-width="1" stroke-linecap="round"/>
  <line x1="32" y1="50" x2="32" y2="60" stroke="var(--text-ghost)" stroke-width="1" stroke-linecap="round"/>
  <line x1="4" y1="32" x2="14" y2="32" stroke="var(--text-ghost)" stroke-width="1" stroke-linecap="round"/>
  <line x1="50" y1="32" x2="60" y2="32" stroke="var(--text-ghost)" stroke-width="1" stroke-linecap="round"/>
  <g style="transform-origin:32px 32px;animation:xr-spin 4s linear infinite">
    <circle cx="32" cy="32" r="20" fill="none" stroke="var(--border)" stroke-width="1.5"/>
    <path d="M32 12 A20 20 0 0 1 52 32" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M32 52 A20 20 0 0 1 12 32" fill="none" stroke="var(--accent)" stroke-width="1" stroke-linecap="round" opacity=".2"/>
    <line x1="52" y1="32" x2="47" y2="32" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
  </g>
  <g style="transform-origin:32px 32px;animation:xr-spin-rev 7s linear infinite">
    <circle cx="32" cy="32" r="13" fill="none" stroke="var(--border)" stroke-width="1"/>
    <line x1="32" y1="19" x2="32" y2="22" stroke="var(--text-ghost)" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="45" y1="32" x2="42" y2="32" stroke="var(--text-ghost)" stroke-width="1.5" stroke-linecap="round"/>
  </g>
  <circle cx="32" cy="32" r="2.5" fill="var(--accent)" style="animation:xr-pulse 2s ease-in-out infinite"/>
  <text x="32" y="37" fill="var(--text)" font-family="var(--mono)" font-size="14" font-weight="600" text-anchor="middle">X</text>
</svg>`;

const CURSOR_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"/></svg>`;

/* ── CSS ───────────────────────────────────────────────────── */

const STYLE = `
:root{
  color-scheme:dark;
  --bg-0:#0D1117;--bg-1:#161B22;--bg-2:#1C2128;--bg-3:#262C36;
  --border:#30363D;--border-mid:#484F58;
  --text:#E6EDF3;--text-2:#8B949E;--text-3:#6E7681;--text-ghost:#30363D;
  --accent:#3B82F6;--accent-soft:rgba(59,130,246,0.08);--accent-border:rgba(59,130,246,0.2);--accent-glow:rgba(59,130,246,0.12);
  --red:#F85149;--red-soft:rgba(248,81,73,0.1);--red-border:rgba(248,81,73,0.25);
  --amber:#E3A008;--amber-soft:rgba(227,160,8,0.1);--amber-border:rgba(227,160,8,0.25);
  --green:#3FB950;--green-soft:rgba(63,185,80,0.1);--green-border:rgba(63,185,80,0.25);
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  --mono:ui-monospace,'Cascadia Code','SF Mono','Fira Code',monospace;
  --radius:10px;
}
[data-theme="light"]{
  color-scheme:light;
  --bg-0:#FFFFFF;--bg-1:#F6F8FA;--bg-2:#F0F2F5;--bg-3:#E1E4E8;
  --border:#D0D7DE;--border-mid:#AFB8C1;
  --text:#1F2328;--text-2:#656D76;--text-3:#8C959F;--text-ghost:#D0D7DE;
  --accent:#2563EB;--accent-soft:rgba(37,99,235,0.06);--accent-border:rgba(37,99,235,0.15);--accent-glow:rgba(37,99,235,0.08);
  --red:#CF222E;--red-soft:rgba(207,34,46,0.06);--red-border:rgba(207,34,46,0.15);
  --amber:#BF8700;--amber-soft:rgba(191,135,0,0.06);--amber-border:rgba(191,135,0,0.15);
  --green:#1A7F37;--green-soft:rgba(26,127,55,0.06);--green-border:rgba(26,127,55,0.15);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:15px;-webkit-font-smoothing:antialiased;scroll-behavior:smooth}
body{font-family:var(--sans);font-weight:400;line-height:1.6;color:var(--text);background:var(--bg-0)}
body::before{content:'';position:fixed;inset:0;z-index:-1;
  background-image:radial-gradient(circle,var(--border) 1px,transparent 1px);
  background-size:24px 24px;opacity:.12;pointer-events:none}

/* ── Top bar ── */
.topbar{
  position:sticky;top:0;z-index:100;height:60px;
  display:flex;align-items:center;
  background:color-mix(in srgb, var(--bg-0) 85%, transparent);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid var(--border);
}
.topbar-inner{
  display:flex;align-items:center;gap:12px;
  max-width:960px;width:100%;margin:0 auto;padding:0 24px;
}
.topbar-brand{display:flex;align-items:center;gap:2px;flex-shrink:0}
.topbar-brand-name{font-family:var(--mono);font-weight:600;font-size:15px;letter-spacing:-.02em;color:var(--text)}
.topbar-brand-name b{color:var(--accent);font-weight:600}
.topbar-search{
  flex:1;height:32px;
  display:flex;align-items:center;gap:8px;padding:0 12px;
  background:var(--bg-2);border:1px solid var(--border);border-radius:8px;
  font-size:12px;color:var(--text-3);cursor:pointer;transition:border-color .15s;
}
.topbar-search:hover{border-color:var(--border-mid)}
.topbar-search kbd{font-family:var(--sans);font-size:10px;padding:2px 6px;border:1px solid var(--border-mid);border-radius:4px;color:var(--text-2);background:var(--bg-1);line-height:1.4;margin-left:auto}
.topbar-actions{display:flex;gap:6px;flex-shrink:0}
.topbar-btn{
  height:30px;width:30px;display:inline-flex;align-items:center;justify-content:center;
  color:var(--text-3);background:var(--bg-2);
  border:1px solid var(--border);border-radius:6px;cursor:pointer;transition:all .15s;
}
.topbar-btn:hover{color:var(--text);border-color:var(--border-mid)}

/* ── Container ── */
.container{max-width:960px;margin:0 auto;padding:0 24px 80px}

/* ── Hero ── */
.hero-card{
  margin-top:32px;padding:40px;border-radius:14px;
  background:var(--bg-1);border:1px solid var(--border);
}
.hero-inner{display:grid;grid-template-columns:220px 1fr;gap:48px;align-items:center}
.hero-arc{text-align:center;position:relative}
.hero-arc svg{width:200px;height:200px;transform:rotate(-90deg)}
.arc-track{fill:none;stroke:var(--bg-3);stroke-width:8}
.arc-fill{fill:none;stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset 1.4s cubic-bezier(.16,1,.3,1)}
.hero-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}
.hero-num{font-family:var(--mono);font-size:56px;font-weight:700;line-height:1;font-feature-settings:'tnum'}
.hero-label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-top:6px}
.hero-hint{font-size:10px;color:var(--text-3);margin-top:4px;letter-spacing:.02em}
.hero-right{display:flex;flex-direction:column;gap:16px}
.hero-bars{display:flex;flex-direction:column;gap:10px}
.hero-bar-row{display:flex;align-items:center;gap:10px}
.hero-bar-name{font-size:12px;color:var(--text-2);width:110px;flex-shrink:0;display:flex;align-items:center;gap:6px}
.hero-bar-name svg{color:var(--text-3);flex-shrink:0}
.hero-bar-track{flex:1;height:6px;background:var(--bg-3);border-radius:3px;overflow:hidden}
.hero-bar-fill{height:100%;border-radius:3px;transition:width 1s cubic-bezier(.16,1,.3,1)}
.hero-bar-val{font-family:var(--mono);font-size:11px;color:var(--text-3);width:40px;text-align:right;flex-shrink:0;font-feature-settings:'tnum'}
.hero-stats{display:flex;padding-top:14px;border-top:1px solid var(--border)}
.hero-stat{flex:1;display:flex;flex-direction:column;gap:2px;padding:0 20px;border-left:1px solid var(--border)}
.hero-stat:first-child{border-left:none;padding-left:0}
.hero-stat:last-child{padding-right:0}
.hero-stat-val{font-family:var(--mono);font-size:18px;font-weight:600;font-feature-settings:'tnum'}
.hero-stat-val-text{font-family:var(--sans);font-size:14px;font-weight:600}
.hero-stat-lbl{font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em}

/* ── Cards ── */
.card{background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.card-header{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.card-title{font-size:13px;font-weight:600;color:var(--text)}
.card-meta{font-size:11px;color:var(--text-3);font-family:var(--mono)}
.card-body{padding:18px}

/* ── Trend chart ── */
.trend-card{margin-top:32px}
.trend-deltas{display:flex;gap:10px;font-family:var(--mono);font-size:11px;font-weight:500}
.td-up{color:var(--green)}.td-dn{color:var(--red)}
.trend-svg{width:100%;display:block;margin-top:8px}
.t-grid{stroke:var(--border);stroke-width:1}
.t-lbl{fill:var(--text-3);font:400 10px/1 var(--mono)}
.t-line{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.t-area{opacity:.65}
.t-dot-g{cursor:pointer}
.t-dot{transition:r .15s}
.t-dot-g:hover .t-dot{r:5}

/* ── Bento (2-col) ── */
.bento{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:32px}

/* ── Signal readiness ── */
.sig-hero{display:flex;align-items:baseline;gap:6px;padding:18px 18px 0}
.sig-score{font-family:var(--mono);font-size:36px;font-weight:700;font-feature-settings:'tnum';line-height:1}
.sig-score-lbl{font-size:12px;color:var(--text-3)}
.sig-bar-main{margin:10px 18px 0;height:6px;background:var(--bg-3);border-radius:3px;overflow:hidden}
.sig-bar-main-fill{height:100%;border-radius:3px;transition:width .6s cubic-bezier(.16,1,.3,1)}
.sig-patterns{padding:14px 18px}
.sig-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)}
.sig-row:last-child{border-bottom:none}
.sig-row-name{font-size:12px;font-weight:500;width:90px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sig-row-bar{flex:1;height:4px;background:var(--bg-3);border-radius:2px;overflow:hidden}
.sig-row-fill{height:100%;border-radius:2px}
.sig-row-pct{font-family:var(--mono);font-size:11px;width:32px;text-align:right;flex-shrink:0}

/* ── Hotspot ── */
.hot-item{padding:8px 0;border-bottom:1px solid var(--border)}
.hot-item:last-child{border-bottom:none}
.hot-top{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.hot-name{flex:1;font-size:11px;font-family:var(--mono);color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.hot-counts{display:flex;gap:8px;font-family:var(--mono);font-size:10px;flex-shrink:0}
.hot-counts span{display:flex;align-items:center;gap:3px}
.hot-sev-dot{width:5px;height:5px;border-radius:50%;display:inline-block}
.hot-bar-track{height:4px;background:var(--bg-3);border-radius:2px;overflow:hidden;display:flex;gap:1px}
.hot-bar-err{height:100%;background:var(--red);border-radius:1px}
.hot-bar-warn{height:100%;background:var(--amber);border-radius:1px}

/* ── Sections ── */
.section{margin-top:48px}
.section-hdr{
  display:flex;align-items:center;gap:10px;margin-bottom:16px;cursor:pointer;
  padding:4px 0;user-select:none;
}
.section-hdr:hover .section-title{color:var(--accent)}
.section-title{font-size:15px;font-weight:600;color:var(--text);transition:color .15s}
.section-meta{margin-left:auto;font-size:11px;color:var(--text-3);font-family:var(--mono)}
.section-chev{width:14px;height:14px;color:var(--text-3);transition:transform .2s;flex-shrink:0}
.section.collapsed .section-body{display:none}
.section.collapsed .section-chev{transform:rotate(-90deg)}

/* ── Remediation ── */
.rem-filter-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.rem-tier{border-bottom:1px solid var(--border)}
.rem-tier:last-child{border-bottom:none}
.rem-tier-hdr{
  display:flex;align-items:center;gap:8px;padding:10px 16px;cursor:pointer;
  background:var(--bg-2);border-bottom:1px solid var(--border);user-select:none;transition:background .1s;
}
.rem-tier-hdr:hover{background:var(--bg-3)}
.rem-tier-label{font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em}
.rem-tier-count{font-family:var(--mono);font-size:10px;color:var(--text-2);background:var(--bg-3);padding:1px 6px;border-radius:8px}
.rem-tier-chev{width:10px;height:10px;color:var(--text-ghost);transition:transform .2s;margin-left:auto}
.rem-tier.collapsed .rem-tier-body{display:none}
.rem-tier.collapsed .rem-tier-chev{transform:rotate(-90deg)}
.rem-item{
  display:grid;grid-template-columns:24px 1fr auto;gap:10px;align-items:start;
  padding:12px 16px;border-bottom:1px solid var(--border);
}
.rem-tier .rem-item:last-child{border-bottom:none}
.rem-rank{font-family:var(--mono);font-size:11px;color:var(--text-ghost);padding-top:2px}
.rem-desc{font-size:13px;font-weight:500;color:var(--text)}
.rem-detail{font-size:12px;color:var(--text-3);margin-top:2px;line-height:1.5}
.rem-actions{display:flex;gap:6px;align-items:center;flex-shrink:0}
.rem-impact{
  display:inline-block;padding:0 5px;border-radius:3px;font-size:10px;font-weight:600;font-family:var(--mono);line-height:18px;white-space:nowrap;
  color:var(--accent);background:var(--accent-soft);
}
.btn-cursor{
  display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:5px 12px;border-radius:6px;
  font:500 11px/1 var(--sans);white-space:nowrap;cursor:pointer;transition:all .15s;
  background:var(--accent);color:#fff;border:1px solid var(--accent);
}
.btn-cursor-icon{padding:5px;border-radius:50%;line-height:0;}
.btn-cursor:hover{opacity:.9;box-shadow:0 0 12px var(--accent-glow)}
.btn-ghost{
  display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:6px;
  font:500 11px/1 var(--sans);white-space:nowrap;cursor:pointer;transition:all .15s;
  background:transparent;color:var(--text-3);border:1px solid var(--border);
}
.btn-ghost:hover{color:var(--text);border-color:var(--border-mid)}
.rem-mega{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 18px;background:var(--accent-soft);border-bottom:1px solid var(--accent-border);
}
.rem-mega-text{font-size:12px;color:var(--text-2)}
.rem-mega-text strong{color:var(--text);font-weight:600}

/* ── Findings ── */
.filter-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.filter-chip{
  display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
  border-radius:14px;font-size:12px;font-weight:500;cursor:pointer;
  border:1px solid var(--border);background:transparent;color:var(--text-3);transition:all .15s;
}
.filter-chip:hover{border-color:var(--border-mid);color:var(--text-2)}
.filter-chip.active{background:var(--accent-soft);border-color:var(--accent-border);color:var(--accent)}
.filter-chip .cnt{font-family:var(--mono);font-size:10px;opacity:.6}
.filter-search{
  flex:1;min-width:140px;height:28px;padding:0 10px;
  font:400 12px var(--sans);color:var(--text);
  background:var(--bg-2);border:1px solid var(--border);border-radius:6px;
  outline:none;transition:border-color .15s;
}
.filter-search::placeholder{color:var(--text-ghost)}
.filter-search:focus{border-color:var(--accent-border)}

.fgroup{border-bottom:1px solid var(--border)}
.fgroup:last-child{border-bottom:none}
.fgroup-trigger{
  display:flex;align-items:flex-start;gap:8px;padding:10px 16px;
  cursor:pointer;width:100%;background:none;border:none;
  font-family:var(--sans);text-align:left;color:var(--text);transition:background .1s;
}
.fgroup-trigger:hover{background:var(--bg-2)}
.chev{width:12px;height:12px;flex-shrink:0;color:var(--text-ghost);transition:transform .2s;margin-top:4px}
.fgroup.open .chev{transform:rotate(90deg)}
.sev-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:6px}
.sev-e{background:var(--red)}.sev-w{background:var(--amber)}
.fgroup-title{flex:1;font-size:13px;font-weight:500}
.fgroup-count{font-family:var(--mono);font-size:10px;color:var(--text-3);background:var(--bg-3);padding:1px 7px;border-radius:8px;margin-top:2px;flex-shrink:0}
.fgroup-body{display:none;padding:4px 16px 16px 36px}
.fgroup.open .fgroup-body{display:block}

.explain{background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;font-size:13px;line-height:1.6;color:var(--text-2)}
.codes{display:grid;grid-template-columns:1fr;gap:8px;margin:10px 0}
.code-block{border-radius:6px;padding:10px 12px;font-size:12px;line-height:1.5;font-family:var(--mono);overflow-x:auto;white-space:pre-wrap;word-break:break-word}
.code-bad{background:var(--red-soft);border:1px solid var(--red-border);color:color-mix(in srgb, var(--red) 70%, var(--text))}
.code-good{background:var(--green-soft);border:1px solid var(--green-border);color:color-mix(in srgb, var(--green) 70%, var(--text))}
.code-lbl{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.code-lbl-bad{color:var(--red)}.code-lbl-good{color:var(--green)}
.effort-row{display:flex;gap:8px;align-items:center;margin-top:6px}

.files{margin-top:8px}
.file{display:flex;align-items:center;gap:6px;padding:4px 0;font:300 12px/1.4 var(--mono);color:var(--text-3);position:relative}
.file:hover{color:var(--text)}
.fpath{cursor:pointer;transition:color .1s}
.fpath:hover{color:var(--accent)}
.factions{display:flex;gap:4px;opacity:0;transition:opacity .12s;margin-left:auto}
.file:hover .factions{opacity:1}
.files-more{
  font-size:12px;color:var(--accent);padding:4px 0;font-family:var(--mono);
  cursor:pointer;display:inline-flex;align-items:center;gap:4px;
  transition:color .15s;border:none;background:none;
}
.files-more:hover{color:var(--text);text-decoration:underline}
.files-hidden{display:none}
.files-hidden.show{display:block}
.fgroup-actions{display:flex;gap:6px;flex-shrink:0;margin-top:1px}

/* ── Badges ── */
.badge{display:inline-block;padding:0 5px;border-radius:3px;font-size:10px;font-weight:600;font-family:var(--mono);text-transform:lowercase;letter-spacing:.01em;line-height:18px;border:none;background:none}
.badge-high{color:var(--red);background:var(--red-soft)}
.badge-med{color:var(--amber);background:var(--amber-soft)}
.badge-low{color:var(--green);background:var(--green-soft)}
.badge-qf{color:var(--green);background:var(--green-soft)}
.badge-mod{color:var(--amber);background:var(--amber-soft)}
.badge-ref{color:var(--red);background:var(--red-soft)}

/* ── Command palette ── */
.cmd-overlay{display:none;position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);align-items:flex-start;justify-content:center;padding-top:min(18vh,140px)}
.cmd-overlay.open{display:flex}
.cmd-box{width:680px;max-height:500px;background:var(--bg-1);border:1px solid var(--border-mid);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.cmd-input{width:100%;height:48px;padding:0 18px;font:400 15px var(--sans);color:var(--text);background:transparent;border:none;border-bottom:1px solid var(--border);outline:none}
.cmd-input::placeholder{color:var(--text-ghost)}
.cmd-results{max-height:440px;overflow-y:auto;padding:8px}
.cmd-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;font-size:13px;color:var(--text-2);cursor:pointer;transition:background .1s}
.cmd-item:hover,.cmd-item.focused{background:var(--bg-2);color:var(--text)}
.cmd-item-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.cmd-item-cat{font-size:10px;color:var(--text-ghost);font-family:var(--mono);flex-shrink:0}
.cmd-item-sev{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.cmd-empty{padding:24px;text-align:center;font-size:12px;color:var(--text-3)}

/* ── Tooltip ── */
[data-tip]{position:relative}
[data-tip]:hover::after{
  content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);
  padding:5px 10px;border-radius:6px;font:400 11px/1.4 var(--sans);white-space:nowrap;
  background:var(--text);color:var(--bg-0);z-index:50;pointer-events:none;
  box-shadow:0 2px 8px rgba(0,0,0,.2);
}

/* ── Toast ── */
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg-0);font-size:12px;padding:8px 18px;border-radius:8px;z-index:300;opacity:0;transition:opacity .2s;pointer-events:none;font-family:var(--sans);font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.2)}
.toast.on{opacity:1}
.kbd-hint{position:fixed;bottom:16px;right:16px;font-size:10px;color:var(--text-3);display:flex;flex-direction:column;gap:4px;align-items:flex-end}
.kbd-hint-row{display:flex;align-items:center;gap:6px;cursor:pointer;padding:4px 8px;border-radius:6px;transition:color .15s;text-transform:uppercase;letter-spacing:.04em}
.kbd-hint-row:hover{color:var(--text-2)}
.kbd-hint-row span{font-size:10px;font-family:var(--sans);white-space:nowrap}
.kbd-hint kbd{font-family:var(--sans);font-size:10px;padding:2px 6px;border:1px solid var(--border-mid);border-radius:4px;color:var(--text-2);background:var(--bg-1);line-height:1.4}
.score-popup{display:none;position:fixed;bottom:50px;right:16px;width:480px;max-height:70vh;overflow-y:auto;background:var(--bg-1);border:1px solid var(--border-mid);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);z-index:200;padding:20px}
.score-popup.open{display:block}
.score-popup-title{font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between}
.score-popup-close{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:none;background:none;color:var(--text-3);cursor:pointer;border-radius:4px;font-size:16px;transition:color .1s}
.score-popup-close:hover{color:var(--text)}

/* ── Scan meta ── */
.scan-meta{margin-top:32px;background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.scan-meta-grid{display:grid;grid-template-columns:repeat(4,1fr)}
.scan-meta-item{display:flex;align-items:baseline;gap:6px;padding:10px 16px;border-bottom:1px solid var(--border);border-right:1px solid var(--border)}
.scan-meta-item:nth-child(4n){border-right:none}
.scan-meta-item:nth-last-child(-n+4){border-bottom:none}
.scan-meta-lbl{font-size:11px;color:var(--text-3);white-space:nowrap}
.scan-meta-val{font-size:12px;font-family:var(--mono);color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── Analyzer summary ── */
.az-row{display:grid;grid-template-columns:1fr 70px 56px 72px 100px;gap:8px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--border);font-size:12px}
.az-row:last-child{border-bottom:none}
.az-hdr{font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;background:var(--bg-2)}
.az-name{font-weight:500;color:var(--text);display:flex;align-items:center;gap:6px}
.az-status{display:inline-flex;align-items:center;gap:4px;font-family:var(--mono);font-size:11px;font-weight:500}
.az-ran{color:var(--green)}.az-failed{color:var(--red)}.az-skipped{color:var(--text-3)}
.az-count{font-family:var(--mono);font-size:11px;color:var(--text-2);text-align:right}
.az-dur{font-family:var(--mono);font-size:11px;color:var(--text-3);text-align:right}
.az-stab{text-align:right}
.az-wrap{border-bottom:1px solid var(--border)}
.az-wrap:last-child{border-bottom:none}
.az-wrap .az-row{border-bottom:none}
.az-wrap.has-err .az-row{cursor:pointer}
.az-wrap.has-err .az-row:hover{background:var(--bg-2)}
.az-err-body{display:none;padding:0 16px 10px 16px;font-size:11px;font-family:var(--mono);color:var(--text-3);line-height:1.5}
.az-wrap.open .az-err-body{display:block}
.az-err-toggle{width:10px;height:10px;color:var(--text-ghost);transition:transform .2s;flex-shrink:0}
.az-wrap.open .az-err-toggle{transform:rotate(90deg)}

/* ── Score methodology ── */
.meth-text{font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:14px}
.meth-table{width:100%;border-collapse:collapse;font-size:12px}
.meth-table th{text-align:left;font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;padding:6px 10px;border-bottom:1px solid var(--border)}
.meth-table td{padding:6px 10px;border-bottom:1px solid var(--border);color:var(--text-2)}
.meth-table td:first-child{font-weight:500;color:var(--text)}
.meth-table .mono{font-family:var(--mono);font-feature-settings:'tnum'}
.meth-note{margin-top:14px;font-size:12px;color:var(--text-3);line-height:1.5}
.meth-rule-caps{margin-top:12px;font-size:12px;color:var(--text-2);line-height:1.5}
.meth-rule-caps code{font-family:var(--mono);font-size:11px;background:var(--bg-2);padding:1px 5px;border-radius:3px}

/* ── Print ── */
@media print{
  body::before,.topbar,.cmd-overlay,.toast,.kbd-hint,.score-popup,.factions,.btn-cursor,.btn-ghost,.filter-search,.topbar-search,.rem-filter-bar,.section-chev{display:none!important}
  .card{break-inside:avoid}
  .fgroup-body,.rem-tier-body,.section-body{display:block!important}
  .section.collapsed .section-body{display:block!important}
  body,[data-theme]{--bg-0:#fff;--bg-1:#fafafa;--bg-2:#f4f4f5;--bg-3:#e4e4e7;--border:#e4e4e7;--text:#1f2328;--text-2:#656d76;--text-3:#8c959f;--text-ghost:#d0d7de;color-scheme:light}
  .hero-card{background:var(--bg-1)!important}
}

/* ── Responsive ── */
@media(max-width:768px){
  .hero-inner{grid-template-columns:1fr;text-align:center}
  .hero-bars{margin-top:16px}
  .hero-stats{flex-wrap:wrap;gap:12px 0}
  .hero-stat{flex:1 0 50%;border-left:none;padding:6px 0;border-top:1px solid var(--border)}
  .hero-stat:first-child,.hero-stat:nth-child(2){border-top:none}
  .bento{grid-template-columns:1fr}
  .codes{grid-template-columns:1fr}
  .container{padding:0 16px 48px}
  .topbar-search{display:none}
  .cmd-box{width:calc(100vw - 32px)}
  .score-popup{width:calc(100vw - 32px);right:16px;left:16px}
  .rem-item{grid-template-columns:20px 1fr;gap:8px}
  .rem-actions{grid-column:span 2;margin-top:6px}
  .scan-meta-grid{grid-template-columns:repeat(2,1fr)}
  .az-row{grid-template-columns:1fr 60px 48px 54px 70px;gap:4px;padding:8px 10px}
}
@media(max-width:480px){
  .filter-bar,.rem-filter-bar{flex-direction:column;align-items:stretch}
  .az-row{grid-template-columns:1fr auto;gap:4px}
  .az-hdr .az-dur,.az-hdr .az-stab,.az-dur,.az-stab{display:none}
}
`;

/* ── Section builders ──────────────────────────────────────── */

const CHEV_SVG = `<svg class="section-chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 4l4 4 4-4"/></svg>`;
const TIER_CHEV = `<svg class="rem-tier-chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 4l4 4 4-4"/></svg>`;

const buildTopBar = (_result: ScanResult): string => {
  return `<header class="topbar">
    <div class="topbar-inner">
      <div class="topbar-brand">${LOGO_SVG}<span class="topbar-brand-name">ng<b>-xray</b></span></div>
      <div class="topbar-search" onclick="openCmd()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        Search findings, files, rules…
        <kbd>⌘K</kbd>
      </div>
      <div class="topbar-actions">
        <button class="topbar-btn" onclick="toggleTheme()" data-tip="Toggle theme">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        </button>
        <button class="topbar-btn" onclick="window.print()" data-tip="Print report">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
        </button>
      </div>
    </div>
  </header>`;
};

const buildScoreHero = (result: ScanResult): string => {
  const { score } = result;
  const col = scoreColor(score.overall);
  const rawCol = scoreColorRaw(score.overall);
  const circ = 2 * Math.PI * 80;
  const offset = circ * (1 - score.overall / 100);

  const errs = result.diagnostics.filter(d => d.severity === 'error').length;
  const warns = result.diagnostics.filter(d => d.severity === 'warning').length;
  const affectedFiles = new Set(result.diagnostics.map(d => d.filePath)).size;
  const topFixes = result.remediation.length;

  const bars = score.categories.map(c => {
    const actual = c.maxDeduction - c.deduction;
    const pct = c.maxDeduction > 0 ? (actual / c.maxDeduction) * 100 : 0;
    const barCol = scoreColorRaw(pct);
    const icon = CATEGORY_ICONS[c.category] ?? '';
    return `<div class="hero-bar-row" data-tip="${escapeHtml(c.label)}: ${actual}/${c.maxDeduction} pts, ${c.issueCount} issues">
      <span class="hero-bar-name">${icon} ${escapeHtml(c.label)}</span>
      <div class="hero-bar-track"><div class="hero-bar-fill" style="width:${pct.toFixed(0)}%;background:${barCol}"></div></div>
      <span class="hero-bar-val">${actual}/${c.maxDeduction}</span>
    </div>`;
  }).join('');

  const errCol = errs > 0 ? 'color:var(--red)' : 'color:var(--text-3)';
  const warnCol = warns > 0 ? 'color:var(--amber)' : 'color:var(--text-3)';

  return `<div class="hero-card">
    <div class="hero-inner">
      <div class="hero-arc" data-tip="Overall health score out of 100">
        <svg viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="80" class="arc-track"/>
          <circle cx="90" cy="90" r="80" class="arc-fill" stroke="${rawCol}"
            stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
            data-target-offset="${offset}"/>
        </svg>
        <div class="hero-center">
          <div class="hero-num" style="color:${col}" data-hero-score="${score.overall}">0</div>
          <div class="hero-label" style="color:${col}">${escapeHtml(score.label)}</div>
        </div>
      </div>
      <div class="hero-right">
        <div class="hero-bars">${bars}</div>
        <div class="hero-stats">
          <div class="hero-stat"><span class="hero-stat-val" style="${errCol}">${errs}</span><span class="hero-stat-lbl">Errors</span></div>
          <div class="hero-stat"><span class="hero-stat-val" style="${warnCol}">${warns}</span><span class="hero-stat-lbl">Warnings</span></div>
          <div class="hero-stat"><span class="hero-stat-val">${affectedFiles}</span><span class="hero-stat-lbl">Affected Files</span></div>
          <div class="hero-stat"><span class="hero-stat-val">${topFixes}</span><span class="hero-stat-lbl">Top Fixes</span></div>
        </div>
      </div>
    </div>
  </div>`;
};

const buildTrendCard = (history: HistoryData | undefined): string => {
  if (!history || history.entries.length < 2) return '';
  const ent = history.entries.slice(-30);
  const n = ent.length;
  const W = 880, H = 156, pad = { t: 10, r: 12, b: 40, l: 32 };
  const pW = W - pad.l - pad.r, pH = H - pad.t - pad.b;
  const fmtDate = (ts: string) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const pts = ent.map((e, i) => ({ x: pad.l + (i / (n - 1)) * pW, y: pad.t + pH - (e.score / 100) * pH, s: e.score, d: fmtDate(e.timestamp), iss: e.totalIssues }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[n - 1].x.toFixed(1)} ${H - pad.b} L${pts[0].x.toFixed(1)} ${H - pad.b}Z`;
  const last = ent[n - 1], prev = ent[n - 2];
  const sd = last.score - prev.score, id = last.totalIssues - prev.totalIssues;
  const col = scoreColorRaw(last.score);
  const grid = [0, 50, 100].map(v => { const y = pad.t + pH - (v / 100) * pH; return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" class="t-grid"/><text x="${pad.l - 6}" y="${y + 3}" text-anchor="end" class="t-lbl">${v}</text>`; }).join('');
  const dots = pts.map(p => `<g class="t-dot-g"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="12" fill="transparent" class="t-dot-hit"><title>${p.d}: ${p.s}/100, ${p.iss} issues</title></circle><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${scoreColorRaw(p.s)}" class="t-dot" pointer-events="none"/></g>`).join('');
  const dateY = H - pad.b + 16;
  const dateLbls: string[] = [];
  dateLbls.push(`<text x="${pts[0].x.toFixed(1)}" y="${dateY}" text-anchor="start" class="t-lbl">${pts[0].d}</text>`);
  if (n >= 5) {
    const mi = Math.floor(n / 2);
    dateLbls.push(`<text x="${pts[mi].x.toFixed(1)}" y="${dateY}" text-anchor="middle" class="t-lbl">${pts[mi].d}</text>`);
  }
  dateLbls.push(`<text x="${pts[n - 1].x.toFixed(1)}" y="${dateY}" text-anchor="end" class="t-lbl">${pts[n - 1].d}</text>`);

  return `<div class="card trend-card">
    <div class="card-header"><span class="card-title">Score Trend</span><div class="trend-deltas"><span class="${sd >= 0 ? 'td-up' : 'td-dn'}">${sd >= 0 ? '+' : ''}${sd} pts</span><span class="${id <= 0 ? 'td-up' : 'td-dn'}">${id >= 0 ? '+' : ''}${id} issues</span></div></div>
    <div class="card-body" style="padding:12px 14px"><svg viewBox="0 0 ${W} ${H}" class="trend-svg">${grid}<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${col}" stop-opacity=".25"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#tg)" class="t-area"/><path d="${line}" stroke="${col}" class="t-line"/>${dots}${dateLbls.join('')}</svg></div>
  </div>`;
};

const pctColor = (pct: number): string =>
  pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';

const buildSignalCard = (sr: SignalReadinessReport | undefined): string => {
  if (!sr) return '';
  const col = pctColor(sr.score);

  if (sr.score === 0) {
    return `<div class="card">
      <div class="card-header"><span class="card-title">Signal Readiness</span></div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 18px;gap:6px;min-height:120px">
        <span style="font-family:var(--mono);font-size:36px;font-weight:700;color:${col};line-height:1">0%</span>
        <span style="font-size:12px;color:var(--text-3)">No Angular signals detected</span>
      </div>
    </div>`;
  }

  const rows = Object.entries(sr.counts)
    .filter(([, c]) => c.legacy + c.modern > 0)
    .map(([p, c]) => {
      const tot = c.legacy + c.modern;
      const pct = tot === 0 ? 0 : Math.round((c.modern / tot) * 100);
      const barCol = pctColor(pct);
      return `<div class="sig-row" data-tip="${c.modern} modern, ${c.legacy} legacy">
        <span class="sig-row-name" title="${escapeHtml(p)}">${escapeHtml(p)}</span>
        <div class="sig-row-bar"><div class="sig-row-fill" style="width:${pct}%;background:${barCol}"></div></div>
        <span class="sig-row-pct" style="color:${barCol}">${pct}%</span>
      </div>`;
    }).join('');

  return `<div class="card">
    <div class="card-header"><span class="card-title">Signal Readiness</span></div>
    <div class="sig-hero"><span class="sig-score" style="color:${col}">${sr.score}%</span><span class="sig-score-lbl">adopted</span></div>
    <div class="sig-bar-main"><div class="sig-bar-main-fill" style="width:${sr.score}%;background:${col}"></div></div>
    <div class="sig-patterns">${rows}</div>
  </div>`;
};

const buildHotspotCard = (diagnostics: Diagnostic[]): string => {
  const spots = getTopHotspots(diagnostics, 8);
  if (!spots.length) return '';
  const maxCount = Math.max(...spots.map(s => s.count));

  const items = spots.map(s => {
    const name = s.filePath.split('/').pop() ?? s.filePath;
    const errPct = maxCount > 0 ? (s.errors / maxCount) * 100 : 0;
    const warnPct = maxCount > 0 ? (s.warnings / maxCount) * 100 : 0;
    return `<div class="hot-item" title="${escapeHtml(s.filePath)}">
      <div class="hot-top">
        <span class="hot-name">${escapeHtml(name)}</span>
        <div class="hot-counts">
          ${s.errors > 0 ? `<span><span class="hot-sev-dot" style="background:var(--red)"></span>${s.errors}</span>` : ''}
          ${s.warnings > 0 ? `<span><span class="hot-sev-dot" style="background:var(--amber)"></span>${s.warnings}</span>` : ''}
        </div>
      </div>
      <div class="hot-bar-track">
        ${s.errors > 0 ? `<div class="hot-bar-err" style="width:${errPct.toFixed(1)}%"></div>` : ''}
        ${s.warnings > 0 ? `<div class="hot-bar-warn" style="width:${warnPct.toFixed(1)}%"></div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `<div class="card">
    <div class="card-header"><span class="card-title">File Hotspots</span><span class="card-meta">top ${spots.length}</span></div>
    <div class="card-body" style="padding:10px 18px">${items}</div>
  </div>`;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const buildScanMeta = (result: ScanResult): string => {
  const ts = new Date(result.timestamp);
  const dateStr = ts.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const configLabel = result.configPath ?? 'defaults';
  const statusLabel = result.scanStatus === 'complete'
    ? '<span style="color:var(--green)">complete</span>'
    : `<span style="color:var(--amber)">partial</span> — ${result.failedAnalyzers.length} failed`;

  const ran = result.analyzerRuns.filter(a => a.status === 'ran').length;
  const skipped = result.analyzerRuns.filter(a => a.status === 'skipped').length;
  const failed = result.analyzerRuns.filter(a => a.status === 'failed').length;

  return `<div class="scan-meta">
    <div class="scan-meta-grid">
      <div class="scan-meta-item"><span class="scan-meta-lbl">Project</span><span class="scan-meta-val" title="${escapeHtml(result.project.rootDirectory)}">${escapeHtml(result.project.projectName)}</span></div>
      <div class="scan-meta-item"><span class="scan-meta-lbl">Scanned</span><span class="scan-meta-val">${dateStr} ${timeStr}</span></div>
      <div class="scan-meta-item"><span class="scan-meta-lbl">ng-xray</span><span class="scan-meta-val">v${escapeHtml(VERSION)}</span></div>
      <div class="scan-meta-item"><span class="scan-meta-lbl">Angular</span><span class="scan-meta-val">${escapeHtml(result.project.angularVersion ?? 'unknown')}</span></div>
      <div class="scan-meta-item"><span class="scan-meta-lbl">Duration</span><span class="scan-meta-val">${formatDuration(result.elapsedMs)}</span></div>
      <div class="scan-meta-item"><span class="scan-meta-lbl">Config</span><span class="scan-meta-val" title="${escapeHtml(configLabel)}">${escapeHtml(configLabel)}</span></div>
      <div class="scan-meta-item"><span class="scan-meta-lbl">Analyzers</span><span class="scan-meta-val">${ran} ran${skipped > 0 ? `, ${skipped} skipped` : ''}${failed > 0 ? `, ${failed} failed` : ''}</span></div>
      <div class="scan-meta-item"><span class="scan-meta-lbl">Status</span><span class="scan-meta-val">${statusLabel}</span></div>
    </div>
  </div>`;
};

const buildAnalyzerSummary = (result: ScanResult): string => {
  if (!result.analyzerRuns.length) return '';

  const statusIcon = (s: string) => {
    if (s === 'ran') return '<span class="az-status az-ran">&#10003; ran</span>';
    if (s === 'failed') return '<span class="az-status az-failed">&#10007; failed</span>';
    return '<span class="az-status az-skipped">— skipped</span>';
  };

  const errChev = `<svg class="az-err-toggle" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 2l4 4-4 4"/></svg>`;

  const rows = result.analyzerRuns.map((a: AnalyzerRunInfo) => {
    const durStr = a.status === 'skipped' ? '—' : formatDuration(a.durationMs);
    const countStr = a.status === 'skipped' ? '—' : String(a.findingsCount);
    const stabBadge = a.experimental
      ? '<span class="badge" style="background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent-border);font-size:9px;padding:1px 5px">experimental</span>'
      : '<span style="font-size:11px;color:var(--text-3)">stable</span>';
    const hasErr = !!a.errorMessage;
    const wrapCls = `az-wrap${hasErr ? ' has-err' : ''}`;
    const toggle = hasErr ? ` onclick="this.classList.toggle('open')"` : '';
    const namePrefix = hasErr ? errChev : '';
    const errBody = hasErr
      ? `<div class="az-err-body">${escapeHtml(a.errorMessage!)}</div>`
      : '';
    return `<div class="${wrapCls}"${toggle}>
      <div class="az-row">
        <span class="az-name">${namePrefix}${escapeHtml(a.label)}</span>
        ${statusIcon(a.status)}
        <span class="az-count">${countStr}</span>
        <span class="az-dur">${durStr}</span>
        <span class="az-stab">${stabBadge}</span>
      </div>${errBody}
    </div>`;
  }).join('');

  const total = result.analyzerRuns.length;

  return `<div class="section" id="s-analyzers">
    <div class="section-hdr" onclick="this.parentElement.classList.toggle('collapsed')">
      <span class="section-title">Analyzer Summary</span>
      <span class="section-meta">${total} analyzers</span>
      ${CHEV_SVG}
    </div>
    <div class="section-body">
      <div class="card">
        <div class="az-row az-hdr">
          <span>Analyzer</span><span>Status</span><span class="az-count">Findings</span><span class="az-dur">Duration</span><span class="az-stab">Stability</span>
        </div>
        ${rows}
      </div>
    </div>
  </div>`;
};

const buildScoreMethodology = (result: ScanResult): string => {
  const catRows = result.score.categories.map(c => {
    const remaining = c.maxDeduction - c.deduction;
    const pct = c.maxDeduction > 0 ? Math.round((c.deduction / c.maxDeduction) * 100) : 0;
    return `<tr>
      <td>${escapeHtml(c.label)}</td>
      <td class="mono">${c.maxDeduction}</td>
      <td class="mono">${c.deduction}</td>
      <td class="mono">${remaining}</td>
      <td class="mono">${pct}%</td>
    </tr>`;
  }).join('');

  const ruleCaps = Object.entries(RULE_MAX_DEDUCTIONS);
  const ruleCapsHtml = ruleCaps.length > 0
    ? `<div class="meth-rule-caps"><strong>Per-rule caps:</strong> ${ruleCaps.map(([rule, cap]) => `<code>${escapeHtml(rule)}</code>&nbsp;≤&nbsp;${cap}`).join(', ')}</div>`
    : '';

  const partialNote = result.scanStatus === 'partial'
    ? `<div class="meth-note" style="color:var(--amber)">This scan was partial — ${result.failedAnalyzers.length} analyzer(s) failed (${result.failedAnalyzers.map(escapeHtml).join(', ')}). The score may not reflect full project health.</div>`
    : '';

  return `<div class="score-popup" id="score-popup">
    <div class="score-popup-title">Score Details <button class="score-popup-close" onclick="toggleScoreInfo()">&times;</button></div>
    <div class="meth-text">
      The score starts at 100. Each diagnostic deducts points based on severity:
      <strong>error&nbsp;=&nbsp;${SEVERITY_WEIGHTS.error}</strong>,
      <strong>warning&nbsp;=&nbsp;${SEVERITY_WEIGHTS.warning}</strong>.
      Deductions are capped per rule and per category so that a single issue type
      cannot dominate the score. When issue density is low relative to project size,
      deductions are scaled down.
    </div>
    <table class="meth-table">
      <thead><tr><th>Category</th><th>Max</th><th>Deducted</th><th>Remaining</th><th>Used</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>
    ${ruleCapsHtml}
    ${partialNote}
  </div>`;
};

const buildRemediation = (result: ScanResult): string => {
  if (!result.remediation.length) return '';

  const tiers = {
    'Quick Wins': result.remediation.filter(r => { const rd = RULE_DOCS[r.rule]; return rd?.effort === 'quick-fix'; }),
    'Moderate Effort': result.remediation.filter(r => { const rd = RULE_DOCS[r.rule]; return rd?.effort === 'moderate'; }),
    'Refactors': result.remediation.filter(r => { const rd = RULE_DOCS[r.rule]; return !rd || rd.effort === 'refactor'; }),
  };

  const totalImpact = result.remediation.reduce((s, r) => s + r.estimatedScoreImpact, 0);
  const allCritDiags = result.diagnostics.filter(d => d.severity === 'error');
  const fixAllPrompt = allCritDiags.length > 0 ? generateFixAllPrompt(allCritDiags) : '';
  const fixAllAttr = fixAllPrompt ? escapeHtml(JSON.stringify(fixAllPrompt)) : '';

  let rank = 0;
  const buildTier = (label: string, items: typeof result.remediation): string => {
    if (!items.length) return '';
    const effortKey = label === 'Quick Wins' ? 'quick-fix' : label === 'Moderate Effort' ? 'moderate' : 'refactor';
    const rows = items.map(r => {
      rank++;
      const diags = result.diagnostics.filter(d => d.rule === r.rule);
      const prompt = diags.length > 0 ? generateFixAllPrompt(diags) : '';
      const promptAttr = prompt ? escapeHtml(JSON.stringify(prompt)) : '';
      return `<div class="rem-item">
        <span class="rem-rank">${rank}</span>
        <div>
          <div class="rem-desc">${escapeHtml(r.description)}</div>
          <div class="rem-detail">${r.affectedFileCount} file${r.affectedFileCount === 1 ? '' : 's'} · <span class="badge ${priorityBadge(r.priority)}">${escapeHtml(r.priority)}</span> · <span class="rem-impact">+${r.estimatedScoreImpact}</span></div>
        </div>
        <div class="rem-actions">
          ${promptAttr ? `<button onclick='cursorFix(${promptAttr})' class="btn-cursor btn-cursor-icon" title="Fix in Cursor">${CURSOR_ICON}</button>` : ''}
        </div>
      </div>`;
    }).join('');

    return `<div class="rem-tier" data-effort="${effortKey}">
      <div class="rem-tier-hdr" onclick="this.parentElement.classList.toggle('collapsed')">
        <span class="rem-tier-label">${escapeHtml(label)}</span>
        <span class="rem-tier-count">${items.length}</span>
        ${TIER_CHEV}
      </div>
      <div class="rem-tier-body">${rows}</div>
    </div>`;
  };

  const tiersHtml = Object.entries(tiers).map(([k, v]) => buildTier(k, v)).join('');

  const effortChips = [
    { key: 'all', label: 'All', count: result.remediation.length },
    { key: 'quick-fix', label: 'Quick Wins', count: tiers['Quick Wins'].length },
    { key: 'moderate', label: 'Moderate', count: tiers['Moderate Effort'].length },
    { key: 'refactor', label: 'Refactors', count: tiers['Refactors'].length },
  ].filter(c => c.key === 'all' || c.count > 0)
    .map(c => `<button onclick="filterEffort('${c.key}')" data-effort="${c.key}" class="filter-chip${c.key === 'all' ? ' active' : ''}">${c.label} <span class="cnt">${c.count}</span></button>`)
    .join('');

  return `<div class="section" id="s-rem">
    <div class="section-hdr" onclick="this.parentElement.classList.toggle('collapsed')">
      <span class="section-title">Remediation Plan</span>
      <span class="section-meta">+${totalImpact} pts possible</span>
      ${CHEV_SVG}
    </div>
    <div class="section-body">
      <div class="card">
        ${fixAllAttr ? `<div class="rem-mega"><span class="rem-mega-text"><strong>${allCritDiags.length} critical</strong> issues can be batch-fixed</span><button onclick='cursorFix(${fixAllAttr})' class="btn-cursor">${CURSOR_ICON} Fix All</button></div>` : ''}
        <div class="rem-filter-bar">${effortChips}</div>
        <div id="rem-list">${tiersHtml}</div>
      </div>
    </div>
  </div>`;
};

const buildFindings = (result: ScanResult): string => {
  const cats = ['best-practices', 'performance', 'architecture', 'dead-code', 'security'] as const;
  const active = cats.filter(c => result.diagnostics.some(d => d.category === c));

  if (!active.length) {
    return `<div class="section" id="s-find">
      <div class="section-hdr" onclick="this.parentElement.classList.toggle('collapsed')"><span class="section-title">Findings</span><span class="section-meta">0 total</span>${CHEV_SVG}</div>
      <div class="section-body"><div class="card"><div class="card-body" style="text-align:center;color:var(--text-3);padding:32px">No issues found — your codebase is in great shape.</div></div></div>
    </div>`;
  }

  const totalIssues = result.diagnostics.length;
  const chips = active.map(c => {
    const n = result.diagnostics.filter(d => d.category === c).length;
    return `<button onclick="filterCat('${c}')" data-cat="${c}" class="filter-chip">${CATEGORY_LABELS[c] ?? c} <span class="cnt">${n}</span></button>`;
  }).join('');

  const allGroups: Array<{ sev: string; count: number; html: string }> = [];
  for (const cat of active) {
    const diags = result.diagnostics.filter(d => d.category === cat);
    if (!diags.length) continue;
    const groups = new Map<string, typeof diags>();
    for (const d of diags) { const l = groups.get(d.rule) ?? []; l.push(d); groups.set(d.rule, l); }

    for (const [rule, items] of groups) {
      const f = items[0];
      const sevC = f.severity === 'error' ? 'sev-e' : 'sev-w';
      const gid = `fg-${cat}-${rule.replace(/[^a-z0-9]/gi, '-')}`;
      const rd = RULE_DOCS[rule];

      const doc = rd ? `<div class="explain">
        ${escapeHtml(rd.whyItMatters)}
        <div class="codes">
          <div><div class="code-lbl code-lbl-bad">Before</div><div class="code-block code-bad">${escapeHtml(rd.beforeCode)}</div></div>
          <div><div class="code-lbl code-lbl-good">After</div><div class="code-block code-good">${escapeHtml(rd.afterCode)}</div></div>
        </div>
        <div class="effort-row"><span class="badge ${effortBadge(rd.effort)}">${rd.effort}</span></div>
      </div>` : '';

      const visibleFiles = items.slice(0, MAX_FILES_PER_GROUP);
      const hiddenFiles = items.slice(MAX_FILES_PER_GROUP);
      const hiddenId = `hidden-${gid}`;

      const renderFile = (d: Diagnostic) => {
        const pj = JSON.stringify(generateCursorPrompt(d));
        const escaped = escapeHtml(pj);
        return `<div class="file">
          <span class="fpath" onclick="cpPath('${escapeHtml(d.filePath)}:${d.line}')" title="Click to copy path">${escapeHtml(d.filePath)}:${d.line}</span>
          <div class="factions">
            <button onclick='cursorFix(${escaped})' class="btn-cursor btn-cursor-icon" title="Fix in Cursor" style="padding:3px;width:22px;height:22px">${CURSOR_ICON}</button>
            <button onclick='cpPrompt(${escaped})' class="btn-ghost" style="font-size:10px;padding:3px 8px">Copy</button>
          </div>
        </div>`;
      };
      const files = visibleFiles.map(renderFile).join('');
      let moreSection = '';
      if (hiddenFiles.length > 0) {
        moreSection = `<div class="files-hidden" id="${hiddenId}">${hiddenFiles.map(renderFile).join('')}</div><button class="files-more" onclick="toggleFiles('${hiddenId}', this)">Show ${hiddenFiles.length} more file${hiddenFiles.length === 1 ? '' : 's'} ▾</button>`;
      }

      const allPj = JSON.stringify(generateFixAllPrompt(items));
      const triggerActions = `<div class="fgroup-actions" onclick="event.stopPropagation()"><button onclick='cursorFix(${escapeHtml(allPj)})' class="btn-cursor" style="font-size:10px;padding:3px 10px">${CURSOR_ICON} Fix all</button></div>`;
      const helpText = f.help && !rd ? `<p style="color:var(--text-2);font-size:13px;margin-bottom:10px">${escapeHtml(f.help)}</p>` : '';

      allGroups.push({ sev: f.severity, count: items.length, html: `<div class="fgroup" data-cat="${cat}" data-rule="${escapeHtml(rule)}" data-sev="${f.severity}" id="${gid}">
        <div class="fgroup-trigger" onclick="toggleGroup('${gid}')">
          <svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 2l4 4-4 4"/></svg>
          <span class="sev-dot ${sevC}" data-tip="${f.severity === 'error' ? 'Error' : 'Warning'}"></span>
          <span class="fgroup-title">${escapeHtml(rd?.title ?? f.message)} <span class="badge" style="background:var(--bg-3);color:var(--text-3);font-size:9px;padding:1px 5px;vertical-align:middle">${escapeHtml(f.source)}</span>${f.stability === 'experimental' ? ' <span class="badge" style="background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent-border);font-size:9px;padding:1px 5px;vertical-align:middle">experimental</span>' : ''}</span>
          <span class="fgroup-count" data-tip="${items.length} affected file${items.length === 1 ? '' : 's'}">${items.length}</span>
          ${triggerActions}
        </div>
        <div class="fgroup-body">${doc}${helpText}<div class="files">${files}${moreSection}</div></div>
      </div>` });
    }
  }

  return `<div class="section" id="s-find">
    <div class="section-hdr" onclick="this.parentElement.classList.toggle('collapsed')">
      <span class="section-title">Findings</span>
      <span class="section-meta">${totalIssues} total</span>
      ${CHEV_SVG}
    </div>
    <div class="section-body">
      <div class="card">
        <div class="filter-bar">
          <button onclick="filterCat('all')" data-cat="all" class="filter-chip active">All <span class="cnt">${totalIssues}</span></button>
          ${chips}
          <input class="filter-search" type="text" placeholder="Search rules or files…" oninput="filterSearch(this.value)"/>
        </div>
        <div id="findings-list">${allGroups.sort((a, b) => {
          const sevOrder = (s: string) => s === 'error' ? 0 : 1;
          if (sevOrder(a.sev) !== sevOrder(b.sev)) return sevOrder(a.sev) - sevOrder(b.sev);
          return b.count - a.count;
        }).map(g => g.html).join('')}</div>
      </div>
    </div>
  </div>`;
};

/* ── JavaScript ────────────────────────────────────────────── */

const SCRIPT = `
(function(){
  var saved = localStorage.getItem('ng-xray-theme');
  if(saved) document.documentElement.setAttribute('data-theme', saved);

  var arc = document.querySelector('.arc-fill');
  if(arc){
    var target = +arc.getAttribute('data-target-offset');
    requestAnimationFrame(function(){ arc.style.strokeDashoffset = target; });
  }

  var hero = document.querySelector('[data-hero-score]');
  if(hero){
    var tgt = +hero.getAttribute('data-hero-score');
    var t0 = performance.now();
    (function tick(now){
      var p = Math.min((now - t0) / 1400, 1);
      var ease = 1 - Math.pow(1 - p, 3);
      hero.textContent = Math.round(ease * tgt);
      if(p < 1) requestAnimationFrame(tick);
    })(t0);
  }
})();

function toggleTheme(){
  var cur = document.documentElement.getAttribute('data-theme');
  var next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ng-xray-theme', next);
}

function toggleGroup(id){
  var el = document.getElementById(id);
  if(el) el.classList.toggle('open');
}

var activeCat = 'all';
function filterCat(cat){
  activeCat = cat;
  document.querySelectorAll('#s-find .filter-chip').forEach(function(c){ c.classList.toggle('active', c.getAttribute('data-cat') === cat); });
  applyFilters();
}

var searchQuery = '';
function filterSearch(q){ searchQuery = q.toLowerCase(); applyFilters(); }

function applyFilters(){
  document.querySelectorAll('.fgroup').forEach(function(g){
    var catMatch = activeCat === 'all' || g.getAttribute('data-cat') === activeCat;
    var rule = (g.getAttribute('data-rule') || '').toLowerCase();
    var title = (g.querySelector('.fgroup-title')?.textContent || '').toLowerCase();
    var searchMatch = !searchQuery || rule.indexOf(searchQuery) !== -1 || title.indexOf(searchQuery) !== -1;
    g.style.display = catMatch && searchMatch ? '' : 'none';
  });
}

var activeEffort = 'all';
function filterEffort(effort){
  activeEffort = effort;
  document.querySelectorAll('#s-rem .filter-chip').forEach(function(c){ c.classList.toggle('active', c.getAttribute('data-effort') === effort); });
  document.querySelectorAll('.rem-tier').forEach(function(t){ t.style.display = (effort === 'all' || t.getAttribute('data-effort') === effort) ? '' : 'none'; });
}

function toggleFiles(id, btn){
  var el = document.getElementById(id);
  if(!el) return;
  var showing = el.classList.contains('show');
  el.classList.toggle('show');
  btn.textContent = showing ? btn.textContent.replace('Hide', 'Show').replace('▴', '▾') : btn.textContent.replace('Show', 'Hide').replace('▾', '▴');
}

function cpPath(t){ navigator.clipboard.writeText(t).then(function(){ toast('Path copied'); }); }

function cursorFix(t){
  var u = 'cursor://anysphere.cursor-deeplink/prompt?text=' + encodeURIComponent(t);
  if(u.length > 8000){ navigator.clipboard.writeText(t).then(function(){ toast('Prompt too long — copied to clipboard'); }); return; }
  window.location.href = u;
}

function cpPrompt(t){ navigator.clipboard.writeText(t).then(function(){ toast('Prompt copied'); }); }

function toast(m){
  var t = document.getElementById('toast');
  if(!t) return;
  t.textContent = m; t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(function(){ t.classList.remove('on'); }, 2000);
}

function toggleScoreInfo(){
  var p = document.getElementById('score-popup');
  if(p) p.classList.toggle('open');
}
document.addEventListener('click', function(e){
  var p = document.getElementById('score-popup');
  if(!p||!p.classList.contains('open')) return;
  if(!p.contains(e.target)&&!e.target.closest('.kbd-hint-row')) p.classList.remove('open');
});

var cmdOpen = false;
function openCmd(){
  var o = document.getElementById('cmd-overlay'); if(!o) return;
  o.classList.add('open'); cmdOpen = true;
  var i = o.querySelector('.cmd-input'); if(i){i.value='';i.focus();}
  renderCmdResults('');
}
function closeCmd(){ var o = document.getElementById('cmd-overlay'); if(o) o.classList.remove('open'); cmdOpen = false; }

function renderCmdResults(q){
  var c = document.getElementById('cmd-results'); if(!c) return;
  var results = [];
  document.querySelectorAll('.fgroup').forEach(function(g){
    var rule = g.getAttribute('data-rule')||'', title = g.querySelector('.fgroup-title')?.textContent||'';
    var cat = g.getAttribute('data-cat')||'', sev = g.getAttribute('data-sev')||'', id = g.id;
    if(!q || rule.toLowerCase().indexOf(q)!==-1 || title.toLowerCase().indexOf(q)!==-1) results.push({title:title,cat:cat,sev:sev,id:id});
  });
  if(!results.length){ c.innerHTML='<div class="cmd-empty">No results found</div>'; return; }
  c.innerHTML = results.slice(0,15).map(function(r){
    return '<div class="cmd-item" onclick="jumpTo(\\''+r.id+'\\')"><span class="cmd-item-sev" style="background:var(--'+(r.sev==='error'?'red':'amber')+')"></span><span class="cmd-item-title">'+r.title+'</span><span class="cmd-item-cat">'+r.cat+'</span></div>';
  }).join('');
}

function jumpTo(id){ closeCmd(); var el=document.getElementById(id); if(el){el.classList.add('open');el.scrollIntoView({behavior:'smooth',block:'center'});} }

document.addEventListener('keydown', function(e){
  if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault(); if(cmdOpen) closeCmd(); else openCmd();}
  if((e.metaKey||e.ctrlKey)&&e.key==='d'){e.preventDefault(); toggleScoreInfo();}
  if(e.key==='Escape'&&cmdOpen) closeCmd();
  if(e.key==='Escape'){var sp=document.getElementById('score-popup');if(sp)sp.classList.remove('open');}
});
`;

/* ── Main ──────────────────────────────────────────────────── */

const buildHtml = (result: ScanResult, history?: HistoryData): string => {
  const hasTrend = !!(history && history.entries.length >= 2);
  const hasSig = !!result.signalReadiness;
  const hasDiags = result.diagnostics.length > 0;
  const hasRem = result.remediation.length > 0;
  const hasBento = hasSig || hasDiags;
  const hasAnalyzers = result.analyzerRuns.length > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ng-xray — ${escapeHtml(result.project.projectName)}</title>
<style>${STYLE}</style>
<script>(function(){var t=localStorage.getItem('ng-xray-theme');if(t)document.documentElement.setAttribute('data-theme',t);})()</script>
</head>
<body>

${buildTopBar(result)}

<div class="container">
  ${result.scanStatus === 'partial' ? `<div style="background:var(--amber-soft);border:1px solid var(--amber-border);border-radius:var(--radius);padding:12px 16px;margin-top:24px;margin-bottom:-8px;color:var(--amber);font-size:13px;display:flex;align-items:flex-start;gap:8px">
    <span style="font-size:16px;line-height:1">⚠</span>
    <div><strong>Partial scan</strong> — ${result.failedAnalyzers.length} analyzer(s) failed: ${result.failedAnalyzers.map(escapeHtml).join(', ')}. Score may not reflect full project health.</div>
  </div>` : ''}
  ${buildScoreHero(result)}
  ${buildScanMeta(result)}
  ${hasTrend ? buildTrendCard(history) : ''}

  ${hasBento ? `<div class="bento">
    ${hasSig ? buildSignalCard(result.signalReadiness) : ''}
    ${hasDiags ? buildHotspotCard(result.diagnostics) : ''}
  </div>` : ''}

  ${hasAnalyzers ? buildAnalyzerSummary(result) : ''}
  ${hasRem ? buildRemediation(result) : ''}
  ${buildFindings(result)}

</div>

<div class="cmd-overlay" id="cmd-overlay" onclick="if(event.target===this)closeCmd()">
  <div class="cmd-box">
    <input class="cmd-input" type="text" placeholder="Search findings, rules, files…" oninput="renderCmdResults(this.value.toLowerCase())"/>
    <div class="cmd-results" id="cmd-results"></div>
  </div>
</div>

<div class="toast" id="toast"></div>
${buildScoreMethodology(result)}
<div class="kbd-hint">
  <div class="kbd-hint-row" onclick="openCmd()"><span>Search</span><kbd>⌘K</kbd></div>
  <div class="kbd-hint-row" onclick="toggleScoreInfo()"><span>Score details</span><kbd>⌘D</kbd></div>
</div>

<script>${SCRIPT}</script>
</body>
</html>`;
};

export const generateHtmlReport = (result: ScanResult, history?: HistoryData): string => {
  const dir = path.join(tmpdir(), `ng-xray-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const html = buildHtml(result, history);
  const filePath = path.join(dir, 'report.html');
  writeFileSync(filePath, html, 'utf-8');
  return filePath;
};
