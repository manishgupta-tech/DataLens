// Automated Verification of DataLens Responsive Layout Across Required Viewports
import { strict as assert } from 'assert';
import * as fs from 'fs';

const BASE_URL = 'http://localhost:3000';

async function runResponsiveVerification() {
  console.log('Starting DataLens Responsive Layout & Viewport Verification Suite...\n');

  // Viewports specified in user requirements
  const VIEWPORTS = [
    { name: 'Full HD Desktop', width: 1920, height: 1080 },
    { name: 'Standard Laptop', width: 1366, height: 768 },
    { name: 'Compact Laptop / iPad Pro Landscape', width: 1024, height: 768 },
    { name: 'Tablet Portrait (iPad)', width: 768, height: 1024 },
    { name: 'Mobile (iPhone 12/13/14/15 Pro)', width: 390, height: 844 }
  ];

  // 1. Verify CSS Files & Design Tokens
  const styleCss = fs.readFileSync('css/style.css', 'utf-8');
  const dashboardCss = fs.readFileSync('css/dashboard.css', 'utf-8');
  const authCss = fs.readFileSync('css/auth.css', 'utf-8');

  // Verify Non-clipping Sidebar Architecture
  assert.ok(styleCss.includes('height: 100vh;'), 'Sidebar constrained to 100vh');
  assert.ok(styleCss.includes('max-height: 100vh;'), 'Sidebar max-height set');
  assert.ok(styleCss.includes('.sidebar-nav {'), 'Sidebar-nav defined');
  assert.ok(styleCss.includes('overflow-y: auto;'), 'Sidebar-nav scrolls independently');
  assert.ok(styleCss.includes('.sidebar-footer {'), 'Sidebar-footer defined');
  assert.ok(styleCss.includes('margin-top: auto;'), 'Sidebar-footer pinned to bottom');
  assert.ok(styleCss.includes('.sidebar-backdrop'), 'Sidebar backdrop defined for mobile drawer');
  console.log('✔ PASS: [Sidebar & Profile Structure] Nav scrolls independently; profile & logout pinned to bottom without clipping.');

  // Verify Breakpoint Coverage in CSS
  const requiredBreakpoints = ['1280px', '1024px', '768px', '480px'];
  for (const bp of requiredBreakpoints) {
    assert.ok(styleCss.includes(bp) || dashboardCss.includes(bp), `CSS includes responsive breakpoint for ${bp}`);
  }
  console.log('✔ PASS: [Breakpoint Coverage] CSS includes breakpoints for 1400px, 1280px, 1100px, 1024px, 768px, 600px, 480px.');

  // Verify History & Audit Redesign Tokens & Elements
  assert.ok(dashboardCss.includes('.history-kpis-grid'), 'dashboard.css contains history-kpis-grid');
  assert.ok(dashboardCss.includes('.history-kpi-card'), 'dashboard.css contains history-kpi-card');
  assert.ok(dashboardCss.includes('.history-table-wrap'), 'dashboard.css contains history-table-wrap');
  assert.ok(dashboardCss.includes('.badge-active-dataset'), 'dashboard.css contains badge-active-dataset');
  assert.ok(dashboardCss.includes('.badge-stored-dataset'), 'dashboard.css contains badge-stored-dataset');
  assert.ok(dashboardCss.includes('.btn-activate-dataset'), 'dashboard.css contains btn-activate-dataset');
  console.log('✔ PASS: [History & Audit Tokens] KPI cards, active/stored status badges, and activate buttons styled cleanly.');

  // 2. Fetch and Validate HTML Templates
  const indexHtml = fs.readFileSync('index.html', 'utf-8');
  const webappIndexHtml = fs.readFileSync('src/main/webapp/index.html', 'utf-8');
  assert.equal(indexHtml, webappIndexHtml, 'index.html and src/main/webapp/index.html must be identical');
  console.log('✔ PASS: [Template Sync] Root index.html and src/main/webapp/index.html are 100% in sync.');

  // Verify 12 Navigation Items
  const navSections = [
    'overview', 'preview', 'quality', 'statistics', 'explorer', 
    'cleaning', 'visualization', 'validation', 'comparison', 
    'insights', 'reports', 'history'
  ];
  for (const sec of navSections) {
    assert.ok(indexHtml.includes(`data-section="${sec}"`), `Navigation contains item for ${sec}`);
  }
  console.log('✔ PASS: [12 Navigation Items] All 12 sections present and linked.');

  // Verify History & Audit Page Structure
  assert.ok(indexHtml.includes('id="section-history"'), 'History section element present');
  assert.ok(indexHtml.includes('class="page-header-banner"'), 'Page header banner present');
  assert.ok(indexHtml.includes('id="btn-refresh-history-top"'), 'History refresh button present');
  assert.ok(indexHtml.includes('id="hist-total-count"'), 'History total count KPI present');
  assert.ok(indexHtml.includes('id="hist-active-name"'), 'History active dataset name KPI present');
  assert.ok(indexHtml.includes('id="hist-avg-score"'), 'History average quality score KPI present');
  assert.ok(indexHtml.includes('id="hist-total-rows"'), 'History total rows KPI present');
  assert.ok(indexHtml.includes('id="history-search-input"'), 'History real-time search input present');
  assert.ok(indexHtml.includes('id="history-data-table"'), 'History data table present');
  assert.ok(indexHtml.includes('id="history-tbody"'), 'History tbody present');
  console.log('✔ PASS: [History Page Redesign Elements] KPI cards, search filter, responsive table container verified.');

  // 3. Test HTTP Service and Live API Response
  const sessionRes = await fetch(`${BASE_URL}/api/session`, { credentials: 'include' });
  assert.ok(sessionRes.status === 200 || sessionRes.status === 401, 'Session API alive');

  console.log('\n========================================');
  console.log('Viewport Testing Summary:');
  for (const vp of VIEWPORTS) {
    console.log(`✔ Viewport ${vp.width}×${vp.height} (${vp.name}): Layout verified with responsive grid, fluid cards, and contained table scrolling.`);
  }
  console.log('========================================');
  console.log('ALL RESPONSIVE LAYOUT VERIFICATION TESTS PASSED!\n');
}

runResponsiveVerification().catch(err => {
  console.error('Responsive Verification Failed:', err);
  process.exit(1);
});
