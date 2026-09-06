

  /* ====== PDF 생성 (Step 14) — Claude Design 템플릿 기반 ====== */
  const PDF_CSS = `
    /* ── Font metric override — glyph 를 line-box 중앙으로 끌어올림 (전체 ~2pt 상향 효과) ── */
    @font-face {
      font-family: 'PretendardFit';
      font-weight: 100 900;
      font-style: normal;
      src: local('Pretendard Variable'), local('Pretendard'), url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2/PretendardVariable.woff2') format('woff2-variations');
      ascent-override: 86%;
      descent-override: 22%;
      line-gap-override: 0%;
    }
    @font-face {
      font-family: 'GeistFit';
      font-weight: 100 900;
      font-style: normal;
      src: local('Geist'), local('GeistVariable');
      ascent-override: 88%;
      descent-override: 22%;
      line-gap-override: 0%;
    }
    @font-face {
      font-family: 'GeistMonoFit';
      font-weight: 100 900;
      font-style: normal;
      src: local('Geist Mono'), local('GeistMono-Regular');
      ascent-override: 86%;
      descent-override: 22%;
      line-gap-override: 0%;
    }
    :root {
      --emerald-50:#ecfdf5; --emerald-100:#d1fae5; --emerald-500:#10b981; --emerald-600:#059669; --emerald-700:#047857;
      --blue-500:#0ea5e9; --blue-600:#0284c7; --blue-50:#f0f9ff;
      --amber-500:#eab308; --amber-600:#ca8a04; --amber-50:#fefce8;
      --zinc-50:#fafafa; --zinc-100:#f4f4f5; --zinc-200:#e4e4e7; --zinc-300:#d4d4d8;
      --zinc-400:#a1a1aa; --zinc-500:#71717a; --zinc-600:#52525b; --zinc-700:#3f3f46;
      --zinc-800:#27272a; --zinc-900:#18181b;
      --pdf-font-ko:'PretendardFit','Pretendard',-apple-system,sans-serif;
      --pdf-font-en:'GeistFit','Geist','Pretendard',sans-serif;
      --pdf-font-mono:'GeistMonoFit','Geist Mono',ui-monospace,monospace;
      --hairline:#e4e4e7;
    }
    .pdf-stage * { box-sizing:border-box; margin:0; padding:0; }
    .pdf-stage img { max-width:none; height:auto; }
    .pdf-stage { font-family:var(--pdf-font-ko); color:var(--zinc-900); font-feature-settings:"tnum" 1,"ss01" 1; letter-spacing:-0.01em; -webkit-font-smoothing:antialiased; line-height:1.4; }
    .pdf-stage .page { width:297mm; height:210mm; background:#fff; position:relative; overflow:hidden; padding:11mm 14mm 10mm; display:flex; flex-direction:column; }
    .pdf-stage .watermark-img { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:70%; max-width:200mm; aspect-ratio:3/1; opacity:0.06; pointer-events:none; user-select:none; z-index:100; object-fit:contain; }
    .pdf-stage .page:not(.cover-page) > *:not(.watermark-img) { position:relative; z-index:1; }

    /* ── 페이지 상단 헤더 ─────────────────── */
    .pdf-stage .page-header { display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; border-bottom:1px solid var(--hairline); margin-bottom:14px; flex:0 0 auto; }
    .pdf-stage .brand { display:flex; align-items:center; gap:12px; }
    .pdf-stage .logo-img { height:32px; width:auto; object-fit:contain; flex-shrink:0; display:block; }
    .pdf-stage .brand-text .title { font-size:13px; font-weight:600; color:var(--zinc-900); letter-spacing:-0.02em; line-height:1.3; }
    .pdf-stage .brand-text .subtitle { font-size:10.5px; color:var(--zinc-500); margin-top:3px; letter-spacing:-0.01em; line-height:1.3; }
    .pdf-stage .brand-text .subtitle .dot { display:inline-block; width:2px; height:2px; border-radius:50%; background:var(--zinc-300); vertical-align:middle; margin:0 6px 2px; }
    .pdf-stage .student { text-align:right; }
    .pdf-stage .student .name { font-size:20px; font-weight:700; color:var(--zinc-900); letter-spacing:-0.03em; line-height:1.15; }
    .pdf-stage .student .meta { font-size:10.5px; color:var(--zinc-500); margin-top:4px; letter-spacing:-0.01em; line-height:1.3; }
    .pdf-stage .student .meta .sep { display:inline-block; width:2px; height:2px; border-radius:50%; background:var(--zinc-300); vertical-align:middle; margin:0 6px 2px; }

    /* ── 수능 성적표 ─────────────────── */
    .pdf-stage .score-wrap { border:1px solid var(--hairline); border-radius:10px; overflow:hidden; margin-bottom:14px; background:#fff; flex:0 0 auto; }
    .pdf-stage .score-header { display:flex; align-items:center; justify-content:space-between; padding:0 14px; height:30px; border-bottom:1px solid var(--hairline); background:var(--zinc-50); }
    .pdf-stage .score-header .label { font-size:11px; color:var(--zinc-600); font-weight:600; letter-spacing:-0.01em; line-height:1; display:flex; align-items:center; gap:8px; }
    .pdf-stage .score-table { width:100%; border-collapse:collapse; table-layout:fixed; }
    .pdf-stage .score-table th, .pdf-stage .score-table td { padding:0 8px; text-align:center; vertical-align:middle; font-size:11px; border-bottom:1px solid var(--hairline); line-height:1.15; height:34px; }
    .pdf-stage .score-table tr:last-child td, .pdf-stage .score-table tr:last-child th { border-bottom:0; }
    .pdf-stage .score-table thead th { background:#fff; color:var(--zinc-900); font-weight:600; font-size:10.5px; height:40px; padding:6px 8px; line-height:1.2; vertical-align:middle; }
    .pdf-stage .score-table thead th .sub { display:block; font-size:9.5px; color:var(--zinc-400); font-weight:400; margin-top:3px; letter-spacing:0.01em; font-family:var(--pdf-font-mono); line-height:1; }
    .pdf-stage .score-table tbody th { background:var(--zinc-50); color:var(--zinc-500); font-size:10.5px; font-weight:500; text-align:center; padding:0 12px; width:90px; font-family:var(--pdf-font-ko); vertical-align:middle; line-height:1.15; height:34px; }
    .pdf-stage .score-table tbody td { font-family:var(--pdf-font-mono); font-size:13px; font-weight:500; color:var(--zinc-800); font-variant-numeric:tabular-nums; vertical-align:middle; line-height:1.15; height:34px; padding:0 8px; }
    .pdf-stage .score-table tbody td.empty { color:var(--zinc-300); }
    .pdf-stage .score-table tbody td.grade { font-weight:600; font-size:13px; vertical-align:middle; line-height:1; padding:0 8px; height:34px; }
    .pdf-stage .score-table tbody td.grade .pill { display:inline-flex; align-items:center; justify-content:center; min-width:34px; height:22px; padding:0 10px; border-radius:6px; background:var(--emerald-50); color:var(--emerald-700); font-family:var(--pdf-font-mono); font-weight:600; font-size:13px; line-height:1; letter-spacing:0; vertical-align:middle; }
    .pdf-stage .score-table tbody td.grade.empty .pill { background:var(--zinc-100); color:var(--zinc-400); font-weight:400; }

    /* ── 군 헤더 ─────────────────── */
    .pdf-stage .group-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; margin-top:2px; min-height:22px; flex:0 0 auto; }
    .pdf-stage .group-title { display:flex; align-items:center; gap:10px; }
    .pdf-stage .group-dot { flex:0 0 auto; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; position:relative; }
    .pdf-stage .group-dot::before { content:""; width:10px; height:10px; border-radius:50%; background:currentColor; display:block; }
    .pdf-stage .group-dot::after { content:""; position:absolute; top:50%; left:50%; width:18px; height:18px; margin-top:-9px; margin-left:-9px; border-radius:50%; border:1px solid currentColor; opacity:0.25; }
    .pdf-stage .group-name { font-size:15px; font-weight:700; color:var(--zinc-900); letter-spacing:-0.02em; line-height:1.15; display:inline-flex; align-items:center; }
    .pdf-stage .group-count { font-size:11px; color:var(--zinc-500); font-family:var(--pdf-font-mono); letter-spacing:-0.01em; line-height:1.15; display:inline-flex; align-items:center; }
    .pdf-stage .group-count::before { content:"·"; margin:0 6px; color:var(--zinc-300); font-family:var(--pdf-font-ko); line-height:1; font-size:14px; }
    .pdf-stage .gun-ga { --accent:var(--blue-600); --accent-bg:var(--blue-50); }
    .pdf-stage .gun-na { --accent:var(--emerald-600); --accent-bg:var(--emerald-50); }
    .pdf-stage .gun-da { --accent:var(--amber-600); --accent-bg:var(--amber-50); }
    .pdf-stage .gun-ga .group-dot { color:var(--blue-600); }
    .pdf-stage .gun-na .group-dot { color:var(--emerald-600); }
    .pdf-stage .gun-da .group-dot { color:var(--amber-600); }

    /* ── 학과 카드 ─────────────────── */
    .pdf-stage .cards { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; align-items:stretch; flex:1 1 auto; min-height:0; align-content:start; }
    .pdf-stage .card { border:1px solid var(--hairline); border-radius:10px; background:#fff; padding:12px 14px; display:flex; flex-direction:column; position:relative; max-height:100%; overflow:hidden; }
    .pdf-stage .card .slot-index { position:absolute; top:12px; right:14px; font-family:var(--pdf-font-mono); font-size:9px; color:var(--zinc-300); letter-spacing:0.04em; line-height:1; }
    .pdf-stage .card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; padding-bottom:10px; border-bottom:1px solid var(--hairline); margin-bottom:10px; }
    .pdf-stage .card-title { min-width:0; flex:1; }
    .pdf-stage .card-title .univ { font-size:13.5px; font-weight:700; color:var(--zinc-900); letter-spacing:-0.025em; line-height:1.35; word-break:keep-all; }
    .pdf-stage .card-title .dept { font-size:10.5px; color:var(--zinc-500); margin-top:3px; letter-spacing:-0.01em; line-height:1.4; word-break:keep-all; }

    .pdf-stage .metrics { display:grid; grid-template-columns:repeat(3,1fr); border:1px solid var(--hairline); border-radius:8px; overflow:hidden; margin-bottom:10px; background:var(--zinc-50); }
    .pdf-stage .metric { padding:8px 6px 9px; text-align:center; position:relative; background:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; }
    .pdf-stage .metric + .metric::before { content:""; position:absolute; left:0; top:10px; bottom:10px; width:1px; background:var(--hairline); }
    .pdf-stage .metric .k { font-family:var(--pdf-font-mono); font-size:8.5px; color:var(--zinc-400); letter-spacing:0.06em; text-transform:uppercase; line-height:1; }
    .pdf-stage .metric .v { font-family:var(--pdf-font-mono); font-size:14px; font-weight:600; color:var(--zinc-900); font-variant-numeric:tabular-nums; letter-spacing:-0.02em; line-height:1; }
    .pdf-stage .metric.highlight { background:var(--accent-bg); }
    .pdf-stage .metric.highlight .v { color:var(--accent); }
    .pdf-stage .metric.highlight .k { color:var(--accent); opacity:0.75; }

    .pdf-stage .reflect-row { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--hairline); }
    .pdf-stage .reflect-row:first-of-type { padding-top:2px; }
    .pdf-stage .reflect-label { font-family:var(--pdf-font-mono); font-size:8.5px; color:var(--zinc-400); letter-spacing:0.1em; text-transform:uppercase; min-width:28px; flex-shrink:0; line-height:1; }
    .pdf-stage .reflect-items { display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center; flex:1; min-width:0; }
    .pdf-stage .ratio-pill { display:inline-flex; align-items:center; gap:4px; padding:2px 7px; border-radius:4px; background:var(--emerald-50); color:var(--emerald-700); font-size:9.5px; letter-spacing:-0.01em; line-height:1.4; height:17px; }
    .pdf-stage .ratio-pill .rp-k { font-weight:500; }
    .pdf-stage .ratio-pill .rp-v { font-family:var(--pdf-font-mono); font-weight:600; font-variant-numeric:tabular-nums; display:inline-flex; align-items:baseline; }
    .pdf-stage .ratio-pill .rp-u { font-size:8px; font-weight:400; margin-left:1px; opacity:0.7; }
    .pdf-stage .subj-items { gap:3px 7px; font-size:9.5px; line-height:1.3; }
    .pdf-stage .subj-item { color:var(--zinc-700); letter-spacing:-0.01em; white-space:nowrap; display:inline-flex; align-items:center; }
    .pdf-stage .subj-item b { font-weight:700; color:var(--zinc-900); margin-right:2px; }
    .pdf-stage .subj-item.optional { color:var(--zinc-400); }
    .pdf-stage .subj-item.note { color:var(--zinc-500); font-size:9px; background:var(--zinc-100); padding:2px 6px; border-radius:3px; line-height:1.2; }

    .pdf-stage .breakdown { display:flex; flex-direction:column; margin-top:8px; margin-bottom:4px; }
    .pdf-stage .row { display:flex; align-items:center; justify-content:space-between; padding:5px 0; border-bottom:1px solid var(--hairline); min-height:22px; }
    .pdf-stage .row:last-child { border-bottom:0; }
    .pdf-stage .row .k { font-size:10.5px; color:var(--zinc-500); letter-spacing:-0.01em; line-height:1.2; }
    .pdf-stage .row .v { font-family:var(--pdf-font-mono); font-size:11.5px; color:var(--zinc-800); font-variant-numeric:tabular-nums; letter-spacing:-0.01em; line-height:1.2; }
    .pdf-stage .row.total { border-top:1px solid var(--zinc-300); border-bottom:0; margin-top:4px; padding-top:8px; padding-bottom:4px; }
    .pdf-stage .row.total .k { color:var(--zinc-900); font-weight:600; font-size:11.5px; }
    .pdf-stage .row.total .v { color:var(--emerald-600); font-weight:700; font-size:14.5px; line-height:1; }

    .pdf-stage .sub-block { margin-top:10px; padding-top:8px; border-top:1px solid var(--hairline); }
    .pdf-stage .sub-block .label { font-family:var(--pdf-font-ko); font-size:10px; color:var(--zinc-500); font-weight:600; margin-bottom:6px; line-height:1; }
    .pdf-stage .practical { display:flex; flex-direction:column; gap:2px; }
    .pdf-stage .practical .p-row { display:grid; grid-template-columns:1fr auto auto; gap:10px; align-items:center; font-size:10px; padding:3px 0; min-height:18px; }
    .pdf-stage .practical .p-row .p-name { color:var(--zinc-700); letter-spacing:-0.01em; line-height:1.2; }
    .pdf-stage .practical .p-row .p-rec { font-family:var(--pdf-font-mono); color:var(--zinc-500); font-size:10px; font-variant-numeric:tabular-nums; text-align:right; min-width:46px; line-height:1.2; }
    .pdf-stage .practical .p-row .p-pts { font-family:var(--pdf-font-mono); color:var(--zinc-900); font-weight:600; font-size:10.5px; font-variant-numeric:tabular-nums; text-align:right; min-width:42px; line-height:1.2; display:inline-flex; align-items:baseline; justify-content:flex-end; gap:4px; }
    .pdf-stage .practical .p-row .p-pts .p-deduct { font-family:var(--pdf-font-mono); color:#b91c1c; font-weight:500; font-size:9px; letter-spacing:-0.02em; }

    .pdf-stage .memo { margin-top:8px; padding:6px 9px 7px 10px; background:var(--amber-50); border-left:2px solid var(--amber-600); border-radius:0 6px 6px 0; font-size:9.5px; color:var(--zinc-700); line-height:1.5; letter-spacing:-0.01em; max-height:58px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; word-break:break-word; }
    .pdf-stage .memo::before { content:"상담 메모"; font-family:var(--pdf-font-ko); font-size:8.5px; letter-spacing:0.02em; color:var(--amber-600); display:block; margin-bottom:3px; font-weight:700; line-height:1; }

    /* ── 카드 콘텐츠 밀도 기반 자동 축소 (틀은 유지, 내용만 scale down) ── */
    .pdf-stage .card.dense { padding:10px 12px; }
    .pdf-stage .card.dense .metrics { margin-bottom:7px; }
    .pdf-stage .card.dense .metric { padding:6px 5px 7px; gap:3px; }
    .pdf-stage .card.dense .metric .v { font-size:13px; }
    .pdf-stage .card.dense .reflect-row { padding:4px 0; margin-bottom:4px; }
    .pdf-stage .card.dense .breakdown { margin-top:6px; }
    .pdf-stage .card.dense .row { padding:3px 0; min-height:18px; }
    .pdf-stage .card.dense .row .k { font-size:10px; }
    .pdf-stage .card.dense .row .v { font-size:11px; }
    .pdf-stage .card.dense .row.total { margin-top:2px; padding-top:5px; padding-bottom:2px; }
    .pdf-stage .card.dense .row.total .v { font-size:13.5px; }
    .pdf-stage .card.dense .sub-block { margin-top:7px; padding-top:5px; }
    .pdf-stage .card.dense .sub-block .label { font-size:9.5px; margin-bottom:4px; }
    .pdf-stage .card.dense .practical { gap:1px; }
    .pdf-stage .card.dense .practical .p-row { font-size:9.5px; padding:2px 0; min-height:15px; gap:8px; }
    .pdf-stage .card.dense .practical .p-row .p-rec { font-size:9.5px; }
    .pdf-stage .card.dense .practical .p-row .p-pts { font-size:10px; }
    .pdf-stage .card.dense .memo { margin-top:6px; padding:5px 8px 6px 9px; font-size:9px; line-height:1.45; max-height:46px; -webkit-line-clamp:2; }

    .pdf-stage .card.very-dense { padding:8px 10px; }
    .pdf-stage .card.very-dense .card-head { padding-bottom:6px; margin-bottom:6px; }
    .pdf-stage .card.very-dense .card-title .univ { font-size:12.5px; line-height:1.3; }
    .pdf-stage .card.very-dense .card-title .dept { font-size:9.5px; margin-top:2px; }
    .pdf-stage .card.very-dense .metrics { margin-bottom:5px; }
    .pdf-stage .card.very-dense .metric { padding:4px 4px 5px; gap:2px; }
    .pdf-stage .card.very-dense .metric .k { font-size:7.5px; }
    .pdf-stage .card.very-dense .metric .v { font-size:11.5px; }
    .pdf-stage .card.very-dense .reflect-row { padding:2px 0; margin-bottom:2px; }
    .pdf-stage .card.very-dense .reflect-label { font-size:7.5px; min-width:24px; }
    .pdf-stage .card.very-dense .ratio-pill { font-size:8.5px; height:14px; padding:0 5px; }
    .pdf-stage .card.very-dense .subj-items { font-size:8.5px; gap:2px 5px; }
    .pdf-stage .card.very-dense .subj-item.note { font-size:8px; padding:1px 4px; }
    .pdf-stage .card.very-dense .breakdown { margin-top:4px; margin-bottom:2px; }
    .pdf-stage .card.very-dense .row { padding:1px 0; min-height:13px; }
    .pdf-stage .card.very-dense .row .k { font-size:9px; }
    .pdf-stage .card.very-dense .row .v { font-size:10px; }
    .pdf-stage .card.very-dense .row.total { margin-top:2px; padding-top:4px; padding-bottom:1px; }
    .pdf-stage .card.very-dense .row.total .k { font-size:10px; }
    .pdf-stage .card.very-dense .row.total .v { font-size:12px; }
    .pdf-stage .card.very-dense .sub-block { margin-top:4px; padding-top:3px; }
    .pdf-stage .card.very-dense .sub-block .label { font-size:8.5px; margin-bottom:2px; }
    .pdf-stage .card.very-dense .practical { gap:0; }
    .pdf-stage .card.very-dense .practical .p-row { font-size:8.5px; padding:0; min-height:12px; gap:5px; }
    .pdf-stage .card.very-dense .practical .p-row .p-rec,
    .pdf-stage .card.very-dense .practical .p-row .p-pts { font-size:8.5px; }
    .pdf-stage .card.very-dense .practical .p-row .p-pts .p-deduct { font-size:7.5px; margin-left:2px; }
    .pdf-stage .card.very-dense .memo { margin-top:4px; padding:3px 6px 4px 7px; font-size:8px; line-height:1.35; max-height:30px; -webkit-line-clamp:2; }
    .pdf-stage .card.very-dense .memo::before { font-size:7.5px; margin-bottom:2px; }

    .pdf-stage .card.empty { background:repeating-linear-gradient(135deg,var(--zinc-50),var(--zinc-50) 8px,#fff 8px,#fff 16px); border:1px dashed var(--zinc-200); display:flex; align-items:center; justify-content:center; min-height:140px; }
    .pdf-stage .card.empty .empty-text { font-family:var(--pdf-font-mono); font-size:10px; color:var(--zinc-300); letter-spacing:0.08em; text-transform:uppercase; line-height:1; }

    .pdf-stage .page-footer { display:flex; justify-content:space-between; align-items:center; padding-top:10px; margin-top:auto; border-top:1px solid var(--hairline); font-size:9.5px; color:var(--zinc-400); letter-spacing:-0.005em; line-height:1.3; flex:0 0 auto; }
    .pdf-stage .page-footer .right { font-family:var(--pdf-font-mono); font-size:9px; letter-spacing:0.02em; }

    /* ── 표지 페이지 ─────────────────── */
    .pdf-stage .cover-page { width:297mm; height:210mm; background:#fcfcfb; padding:0; display:block; position:relative; overflow:hidden; }
    .pdf-stage .cover-page .cover-wm { position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:100; }
    .pdf-stage .cover-page .cover-wm-img { position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:720px; height:240px; opacity:0.06; object-fit:contain; }
    .pdf-stage .cover-page .cover-rule-top { position:absolute; left:56px; right:56px; top:56px; height:1px; background:var(--zinc-200); z-index:2; }
    .pdf-stage .cover-page .cover-rule-bot { position:absolute; left:56px; right:56px; bottom:56px; height:1px; background:var(--zinc-200); z-index:2; }
    .pdf-stage .cover-page .cover-header { position:absolute; top:32px; left:56px; right:56px; display:flex; align-items:center; justify-content:space-between; z-index:3; height:28px; }
    .pdf-stage .cover-page .cover-brand-lock { display:flex; align-items:center; gap:10px; }
    .pdf-stage .cover-page .cover-logo-img { height:24px; width:auto; object-fit:contain; }
    .pdf-stage .cover-page .cover-brand-wm { font-family:var(--pdf-font-en); font-weight:600; font-size:13px; letter-spacing:-0.01em; color:var(--zinc-900); }
    .pdf-stage .cover-page .cover-meta { font-family:var(--pdf-font-mono); font-size:10.5px; color:var(--zinc-500); letter-spacing:0.02em; display:flex; gap:12px; align-items:center; white-space:nowrap; }
    .pdf-stage .cover-page .cover-meta .sep { color:var(--zinc-300); }
    .pdf-stage .cover-page .cover-footer { position:absolute; bottom:32px; left:56px; right:56px; display:flex; align-items:center; justify-content:space-between; z-index:3; font-family:var(--pdf-font-mono); font-size:10.5px; color:var(--zinc-500); letter-spacing:0.02em; white-space:nowrap; }
    .pdf-stage .cover-page .cover-footer .page-num { color:var(--zinc-400); }
    .pdf-stage .cover-page .cover-grid { position:absolute; top:110px; bottom:110px; left:56px; right:56px; display:grid; grid-template-columns:1fr 1fr; gap:40px; z-index:2; }
    .pdf-stage .cover-page .cover-left { display:flex; flex-direction:column; justify-content:space-between; padding-right:12px; min-width:0; }
    .pdf-stage .cover-page .cover-eyebrow { font-family:var(--pdf-font-mono); font-size:10.5px; color:var(--emerald-600); letter-spacing:0.22em; text-transform:uppercase; font-weight:500; display:flex; align-items:center; gap:10px; }
    .pdf-stage .cover-page .cover-eyebrow::before { content:""; width:18px; height:1.5px; background:var(--emerald-600); display:inline-block; }
    .pdf-stage .cover-page .cover-title-block { margin-top:28px; }
    .pdf-stage .cover-page .cover-doc-title { font-family:var(--pdf-font-ko); font-size:60px; font-weight:700; line-height:1.08; letter-spacing:-0.035em; color:#0a0a0a; padding-top:0.06em; }
    .pdf-stage .cover-page .cover-doc-title .stroke { color:var(--emerald-600); font-weight:700; }
    .pdf-stage .cover-page .cover-doc-sub { margin-top:22px; font-family:var(--pdf-font-ko); font-size:14px; line-height:1.6; color:var(--zinc-700); letter-spacing:-0.015em; max-width:100%; font-weight:400; word-break:keep-all; }
    .pdf-stage .cover-page .cover-doc-sub .q { color:var(--emerald-700); font-weight:500; }
    .pdf-stage .cover-page .cover-slogan { margin-top:28px; padding-left:14px; border-left:2px solid var(--emerald-600); font-family:var(--pdf-font-ko); font-size:13px; color:var(--zinc-800); letter-spacing:-0.01em; line-height:1.5; word-break:keep-all; }
    .pdf-stage .cover-page .cover-left-bottom { display:grid; grid-template-columns:1fr 1fr; gap:28px; padding-top:20px; border-top:1px solid var(--zinc-200); }
    .pdf-stage .cover-page .cover-lb-item .label { font-family:var(--pdf-font-mono); font-size:9.5px; color:var(--zinc-500); letter-spacing:0.18em; text-transform:uppercase; margin-bottom:8px; }
    .pdf-stage .cover-page .cover-lb-item .value { font-family:var(--pdf-font-ko); font-size:15px; color:#0a0a0a; font-weight:600; letter-spacing:-0.01em; }
    .pdf-stage .cover-page .cover-lb-item .value .en { font-family:var(--pdf-font-en); font-weight:500; }
    .pdf-stage .cover-page .cover-lb-item .value .tag { display:inline-block; font-family:var(--pdf-font-mono); font-size:9.5px; color:var(--emerald-700); background:var(--emerald-50); padding:2px 6px; border-radius:3px; margin-left:6px; vertical-align:middle; font-weight:500; letter-spacing:0.04em; }
    .pdf-stage .cover-page .cover-right { display:flex; flex-direction:column; justify-content:center; padding-left:32px; border-left:1px solid var(--zinc-200); position:relative; min-width:0; }
    .pdf-stage .cover-page .cover-cert-eyebrow { font-family:var(--pdf-font-mono); font-size:10.5px; color:var(--zinc-500); letter-spacing:0.22em; text-transform:uppercase; font-weight:500; margin-bottom:18px; white-space:nowrap; }
    .pdf-stage .cover-page .cover-student-name-wrap { padding:2px 0 14px; }
    .pdf-stage .cover-page .cover-student-name { font-family:var(--pdf-font-ko); font-size:88px; font-weight:700; line-height:1.08; letter-spacing:-0.06em; color:#0a0a0a; padding-top:0.04em; padding-bottom:4px; }
    .pdf-stage .cover-page .cover-student-row { display:flex; gap:16px; margin-top:18px; padding-top:18px; border-top:1px solid var(--zinc-200); flex-wrap:wrap; }
    .pdf-stage .cover-page .cover-chip { font-family:var(--pdf-font-ko); font-size:13px; color:var(--zinc-800); letter-spacing:-0.005em; font-weight:500; }
    .pdf-stage .cover-page .cover-chip .lbl { display:block; font-family:var(--pdf-font-mono); font-size:9px; color:var(--zinc-500); letter-spacing:0.16em; text-transform:uppercase; margin-bottom:4px; font-weight:500; }
    .pdf-stage .cover-page .cover-divider-dot { width:3px; height:3px; border-radius:50%; background:var(--zinc-300); align-self:center; margin-top:14px; }
    .pdf-stage .cover-page .cover-exam { margin-top:22px; padding:14px 16px; background:var(--zinc-50); border:1px solid var(--zinc-200); border-radius:4px; display:flex; align-items:center; gap:16px; position:relative; }
    .pdf-stage .cover-page .cover-exam::before { content:""; position:absolute; left:0; top:10px; bottom:10px; width:2px; background:var(--emerald-600); border-radius:2px; }
    .pdf-stage .cover-page .cover-exam .exam-label { font-family:var(--pdf-font-mono); font-size:9.5px; color:var(--zinc-500); letter-spacing:0.18em; text-transform:uppercase; min-width:60px; font-weight:500; }
    .pdf-stage .cover-page .cover-exam .exam-value { display:flex; align-items:baseline; gap:8px; }
    .pdf-stage .cover-page .cover-exam .year { font-family:var(--pdf-font-en); font-size:20px; font-weight:600; color:#0a0a0a; letter-spacing:-0.02em; }
    .pdf-stage .cover-page .cover-exam .year-ko { font-family:var(--pdf-font-ko); font-size:13px; color:var(--zinc-700); font-weight:500; }
    .pdf-stage .cover-page .cover-exam .pipe { color:var(--zinc-300); }
    .pdf-stage .cover-page .cover-exam .mock { font-family:var(--pdf-font-ko); font-size:13px; color:var(--zinc-800); font-weight:500; }
    .pdf-stage .cover-page .cover-apps { margin-top:18px; display:grid; grid-template-columns:repeat(4,1fr); border:1px solid var(--zinc-200); border-radius:4px; overflow:hidden; }
    .pdf-stage .cover-page .cover-apps .col { padding:12px 8px; border-right:1px solid var(--zinc-200); text-align:center; background:#fff; }
    .pdf-stage .cover-page .cover-apps .col:last-child { border-right:none; background:var(--zinc-50); }
    .pdf-stage .cover-page .cover-apps .col.total { background:var(--zinc-900); }
    .pdf-stage .cover-page .cover-apps .col.total .n { color:#fff; }
    .pdf-stage .cover-page .cover-apps .col.total .k { color:var(--zinc-400); }
    .pdf-stage .cover-page .cover-apps .col .k { font-family:var(--pdf-font-mono); font-size:9px; color:var(--zinc-500); letter-spacing:0.14em; text-transform:uppercase; font-weight:500; margin-bottom:5px; }
    .pdf-stage .cover-page .cover-apps .col .n { font-family:var(--pdf-font-en); font-size:24px; font-weight:600; color:#0a0a0a; letter-spacing:-0.02em; line-height:1; }
    .pdf-stage .cover-page .cover-apps .col .n sub { font-family:var(--pdf-font-en); font-size:11px; color:var(--zinc-400); font-weight:400; letter-spacing:0; margin-left:1px; vertical-align:baseline; }
    .pdf-stage .cover-page .cover-apps .col .u { font-family:var(--pdf-font-ko); font-size:10px; color:var(--zinc-500); margin-top:4px; font-weight:500; }
  `;
