/**
 * DataLens — Main Application Logic (Vanilla JS ES6+)
 * Phase 4: Full Real Data Analysis, Dynamic Navigation & Tab Integration
 */

(function () {
  'use strict';

  // Global namespace for DataLens application state and API helpers
  window.DataLens = {
    activeDataset: null,
    activeColumns: [],
    currentUser: null,
    previewState: {
      page: 1,
      size: 100,
      search: ''
    },
    stagedCleaningOps: [],
    validationRules: [],

    /**
     * Checks if current user is logged in, and populates user info in header/sidebar.
     * If not logged in, redirects to landing.html.
     */
    async checkAuth() {
      try {
        const token = sessionStorage.getItem('datalens_session_id') || localStorage.getItem('datalens_session_id');
        const headers = token ? { 'Authorization': 'Bearer ' + token, 'X-Session-ID': token } : {};
        const url = this.getApiUrl('/api/session');
        const res = await fetch(url, { headers, credentials: 'include' })
          .catch(() => fetch(this.getApiUrl('/session'), { headers, credentials: 'include' }));
        
        if (!res || !res.ok) {
          sessionStorage.removeItem('datalens_session_id');
          localStorage.removeItem('datalens_session_id');
          window.location.href = 'landing.html';
          return false;
        }

        const data = await res.json();
        if (!data || !data.loggedIn) {
          sessionStorage.removeItem('datalens_session_id');
          localStorage.removeItem('datalens_session_id');
          window.location.href = 'landing.html';
          return false;
        }

        this.currentUser = data.user;
        this.renderUserInfo(data.user);
        return true;
      } catch (err) {
        sessionStorage.removeItem('datalens_session_id');
        localStorage.removeItem('datalens_session_id');
        window.location.href = 'landing.html';
        return false;
      }
    },

    /**
     * Renders logged-in user profile details in header and sidebar
     * @param {{id: number, name: string, email: string}} user 
     */
    renderUserInfo(user) {
      if (!user) return;
      const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();
      const name = user.name || user.email || 'User';
      const email = user.email || '';

      const headerName = document.getElementById('header-user-name');
      if (headerName) headerName.textContent = `Welcome, ${name}`;

      const headerEmail = document.getElementById('header-user-email');
      if (headerEmail) headerEmail.textContent = email;

      const headerAvatar = document.getElementById('header-user-avatar');
      if (headerAvatar) headerAvatar.textContent = initial;

      const sidebarName = document.getElementById('sidebar-user-name');
      if (sidebarName) sidebarName.textContent = name;

      const sidebarEmail = document.getElementById('sidebar-user-email');
      if (sidebarEmail) sidebarEmail.textContent = email;

      const sidebarAvatar = document.getElementById('sidebar-user-avatar');
      if (sidebarAvatar) sidebarAvatar.textContent = initial;
    },

    /**
     * Logs out the user and redirects to landing.html
     */
    async handleLogout() {
      try {
        const token = sessionStorage.getItem('datalens_session_id') || localStorage.getItem('datalens_session_id');
        const headers = token ? { 'Authorization': 'Bearer ' + token, 'X-Session-ID': token } : {};
        await fetch(this.getApiUrl('/api/logout'), { method: 'POST', headers, credentials: 'include' })
          .catch(() => fetch(this.getApiUrl('/logout'), { method: 'POST', headers, credentials: 'include' }));
      } catch (err) {
        // Ignore network errors on logout
      }
      sessionStorage.removeItem('datalens_session_id');
      localStorage.removeItem('datalens_session_id');
      sessionStorage.removeItem('datalens_user');
      localStorage.removeItem('datalens_user');
      window.location.href = 'landing.html';
    },

    /**
     * Resolves API endpoint URL dynamically respecting Tomcat servlet context path (e.g., /datalens/api/...)
     * @param {string} endpoint
     * @returns {string}
     */
    getApiUrl(endpoint) {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
      const path = window.location.pathname || '';
      const segments = path.split('/').filter(Boolean);
      if (segments.length > 0 && segments[0] !== 'api' && !segments[0].includes('.')) {
        return '/' + segments[0] + cleanEndpoint;
      }
      return cleanEndpoint;
    },

    /**
     * Safe fetch helper that validates JSON content-type and handles errors
     * @param {string} endpoint
     * @param {RequestInit} [options]
     * @returns {Promise<any>}
     */
    async fetchJson(endpoint, options = {}) {
      const url = this.getApiUrl(endpoint);
      try {
        const token = sessionStorage.getItem('datalens_session_id') || localStorage.getItem('datalens_session_id');
        const defaultHeaders = token ? { 'Authorization': 'Bearer ' + token, 'X-Session-ID': token } : {};
        const fetchOptions = Object.assign({ credentials: 'include' }, options);
        fetchOptions.headers = Object.assign(defaultHeaders, options.headers || {});
        const response = await fetch(url, fetchOptions);

        if (response.status === 401) {
          sessionStorage.removeItem('datalens_session_id');
          localStorage.removeItem('datalens_session_id');
          window.location.href = 'login.html?sessionExpired=true';
          return null;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          console.warn(`Endpoint ${endpoint} did not return JSON:`, contentType);
          return null;
        }
        return await response.json();
      } catch (err) {
        console.error(`Fetch error for ${endpoint}:`, err);
        return null;
      }
    },

    /**
     * Escape HTML strings to prevent XSS in table cells
     * @param {any} val
     * @returns {string}
     */
    escapeHtml(val) {
      if (val === null || val === undefined) return '';
      return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    /**
     * Helper to format numbers with commas and optional decimals
     * @param {number} num
     * @param {number} [decimals=2]
     * @returns {string}
     */
    formatNum(num, decimals = 2) {
      if (num === null || num === undefined || isNaN(num)) return '-';
      return Number(num).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals
      });
    },

    /**
     * Helper to format file sizes
     * @param {number} bytes
     * @returns {string}
     */
    formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Refreshes all tabs when a new dataset is uploaded or activated
     */
    async refreshAll() {
      await this.loadOverview();
      await this.loadPreview(1);
      await this.loadQuality();
      await this.loadStatistics();
      this.populateCleaningSelectors();
      await this.loadCleaningStudio();
      if (window.DataLensExplorer && typeof window.DataLensExplorer.populateColumns === 'function') {
        window.DataLensExplorer.populateColumns(this.activeColumns);
        window.DataLensExplorer.applyFilter();
      }
      if (window.DataLensCharts && typeof window.DataLensCharts.populateColumns === 'function') {
        window.DataLensCharts.populateColumns(this.activeColumns);
      }
      await this.loadValidationRules();
      await this.loadComparison();
      await this.loadInsights();
      await this.loadReports();
      await this.loadHistory();
    },

    /**
     * Refreshes specific section data when navigated to
     * @param {string} sectionId
     */
    async refreshSection(sectionId) {
      switch (sectionId) {
        case 'overview':
          await this.loadOverview();
          break;
        case 'preview':
          await this.loadPreview(this.previewState.page);
          break;
        case 'quality':
          await this.loadQuality();
          break;
        case 'statistics':
          await this.loadStatistics();
          break;
        case 'cleaning':
          this.populateCleaningSelectors();
          await this.loadCleaningStudio();
          break;
        case 'explorer':
          if (window.DataLensExplorer && typeof window.DataLensExplorer.populateColumns === 'function') {
            window.DataLensExplorer.populateColumns(this.activeColumns);
          }
          break;
        case 'visualization':
          if (window.DataLensCharts && typeof window.DataLensCharts.populateColumns === 'function') {
            window.DataLensCharts.populateColumns(this.activeColumns);
          }
          break;
        case 'validation':
          this.populateCleaningSelectors();
          await this.loadValidationRules();
          break;
        case 'comparison':
          await this.loadComparison();
          break;
        case 'insights':
          await this.loadInsights();
          break;
        case 'reports':
          await this.loadReports();
          break;
        case 'history':
          await this.loadHistory();
          break;
      }
    },

    /**
     * SECTION 1: OVERVIEW
     */
    async loadOverview() {
      const data = await this.fetchJson('/api/dashboard');
      if (!data) return;

      const headerDatasetName = document.getElementById('header-dataset-name');
      const rowsVal = document.getElementById('metric-rows-val');
      const colsVal = document.getElementById('metric-cols-val');
      const numVal = document.getElementById('metric-num-val');
      const catVal = document.getElementById('metric-cat-val');
      const missingVal = document.getElementById('metric-missing-val');
      const dupsVal = document.getElementById('metric-dups-val');
      const scoreVal = document.getElementById('metric-score-val');

      if (!data.hasDataset) {
        if (headerDatasetName) headerDatasetName.textContent = 'No dataset uploaded';
        if (rowsVal) rowsVal.textContent = '0';
        if (colsVal) colsVal.textContent = '0';
        if (numVal) numVal.textContent = '0';
        if (catVal) catVal.textContent = '0';
        if (missingVal) missingVal.textContent = '0';
        if (dupsVal) dupsVal.textContent = '0';
        if (scoreVal) scoreVal.textContent = '-';
        this.renderOverviewEmpty();
        return;
      }

      this.activeDataset = data.dataset || data.datasetInfo || {};
      this.activeColumns = data.columns || [];

      // Update header & metrics
      const datasetName = this.activeDataset.fileName || this.activeDataset.originalName || data.fileName || data.datasetName || 'Active Dataset';
      if (headerDatasetName) headerDatasetName.textContent = datasetName;
      if (rowsVal) rowsVal.textContent = this.formatNum(data.metrics?.totalRows ?? data.totalRows, 0);
      if (colsVal) colsVal.textContent = this.formatNum(data.metrics?.totalColumns ?? data.totalColumns, 0);
      if (numVal) numVal.textContent = this.formatNum(data.metrics?.numericColumns ?? data.numericColumns, 0);
      if (catVal) catVal.textContent = this.formatNum(data.metrics?.categoricalColumns ?? data.categoricalColumns, 0);
      if (missingVal) missingVal.textContent = this.formatNum(data.metrics?.missingValues ?? data.missingValues, 0);
      if (dupsVal) dupsVal.textContent = this.formatNum(data.metrics?.duplicateRows ?? data.duplicateRows, 0);
      if (scoreVal) scoreVal.textContent = this.formatNum(data.metrics?.qualityScore ?? data.qualityScore, 1);

      // Render Donut Chart Widget
      const numCols = data.metrics?.numericColumns ?? 0;
      const catCols = data.metrics?.categoricalColumns ?? 0;
      this.renderOverviewDonut(numCols, catCols);

      // Render First 5 Rows Preview
      this.renderOverviewPreview(data.first5Rows || data.previewRows, data.columns);

      // Render Quality Overview list
      this.renderOverviewQuality(data.metrics?.qualityOverview || data.qualityOverview, data.metrics?.qualityScore ?? data.qualityScore);

      // Render Dataset Information
      this.renderOverviewDatasetInfo(this.activeDataset, data.metrics || {});

      // Render Recent Activity / Insights Preview
      this.renderOverviewActivity(this.activeDataset, data.metrics || {});
    },

    renderOverviewEmpty() {
      const previewWrap = document.getElementById('overview-preview-wrap');
      if (previewWrap) {
        previewWrap.innerHTML = `
          <div class="preview-empty-state">
            <div class="empty-icon-circle">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="18" height="18" x="3" y="3" rx="2"/>
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
              </svg>
            </div>
            <div class="empty-title">No dataset uploaded</div>
            <div class="empty-subtitle">Upload a CSV to get started</div>
          </div>`;
      }
      const datasetInfo = document.getElementById('overview-dataset-info');
      if (datasetInfo) datasetInfo.innerHTML = '<p class="info-table-empty">No dataset uploaded</p>';
      const recentAct = document.getElementById('overview-recent-activity');
      if (recentAct) recentAct.innerHTML = '<p class="info-table-empty">No recent activity</p>';
    },

    renderOverviewDonut(numeric, categorical) {
      const total = (numeric || 0) + (categorical || 0);
      const numLegend = document.getElementById('overview-num-legend-text');
      const catLegend = document.getElementById('overview-cat-legend-text');
      if (numLegend) numLegend.textContent = `Numeric (${numeric || 0})`;
      if (catLegend) catLegend.textContent = `Categorical (${categorical || 0})`;

      const svg = document.getElementById('overview-donut-svg');
      if (!svg) return;

      if (total === 0) {
        svg.innerHTML = `<circle cx="50" cy="50" r="38" fill="transparent" stroke="#e2e8f0" stroke-width="16" />`;
        return;
      }

      // Circumference = 2 * PI * 38 ≈ 238.76
      const circ = 2 * Math.PI * 38;
      const numPct = (numeric || 0) / total;
      const numDash = numPct * circ;
      const catDash = circ - numDash;

      svg.innerHTML = `
        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#0ea5e9" stroke-width="16" 
          stroke-dasharray="${numDash} ${circ}" stroke-dashoffset="0" transform="rotate(-90 50 50)" />
        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f59e0b" stroke-width="16" 
          stroke-dasharray="${catDash} ${circ}" stroke-dashoffset="-${numDash}" transform="rotate(-90 50 50)" />
        <text x="50" y="47" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b">${total}</text>
        <text x="50" y="59" text-anchor="middle" font-size="7" font-weight="600" fill="#64748b">COLUMNS</text>
      `;
    },

    renderOverviewPreview(rows, columns) {
      const wrap = document.getElementById('overview-preview-wrap');
      if (!wrap) return;

      if (!rows || rows.length === 0 || !columns || columns.length === 0) {
        this.renderOverviewEmpty();
        return;
      }

      const colHeaders = columns.slice(0, 6).map(c => `<th>${this.escapeHtml(typeof c === 'string' ? c : (c.name || c.columnName || ''))}</th>`).join('');
      const bodyRows = rows.map(r => {
        const cells = columns.slice(0, 6).map((c, colIdx) => {
          const colName = typeof c === 'string' ? c : (c.name || c.columnName || '');
          const val = Array.isArray(r) ? r[colIdx] : (r[colName] !== undefined ? r[colName] : '');
          return `<td>${this.escapeHtml(val)}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      wrap.innerHTML = `
        <div class="table-container" style="max-height: 220px;">
          <table class="data-table">
            <thead><tr>${colHeaders}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      `;
    },

    renderOverviewQuality(quality, overallScore) {
      if (!quality) return;
      const comp = document.getElementById('overview-completeness-val');
      const cons = document.getElementById('overview-consistency-val');
      const val = document.getElementById('overview-validity-val');
      const uniq = document.getElementById('overview-uniqueness-val');
      const time = document.getElementById('overview-timeliness-val');
      const scoreCircle = document.getElementById('overview-score-circle');

      if (comp) comp.textContent = this.formatNum(quality.completeness, 1) + '%';
      if (cons) cons.textContent = this.formatNum(quality.consistency, 1) + '%';
      if (val) val.textContent = this.formatNum(quality.validity, 1) + '%';
      if (uniq) uniq.textContent = this.formatNum(quality.uniqueness, 1) + '%';
      if (time) time.textContent = this.formatNum(quality.timeliness, 1) + '%';

      if (scoreCircle) {
        const sc = overallScore || 0;
        scoreCircle.textContent = Math.round(sc);
        if (sc >= 85) {
          scoreCircle.style.borderColor = '#16a34a';
          scoreCircle.style.color = '#16a34a';
          scoreCircle.style.backgroundColor = '#f0fdf4';
        } else if (sc >= 65) {
          scoreCircle.style.borderColor = '#d97706';
          scoreCircle.style.color = '#d97706';
          scoreCircle.style.backgroundColor = '#fffbeb';
        } else {
          scoreCircle.style.borderColor = '#dc2626';
          scoreCircle.style.color = '#dc2626';
          scoreCircle.style.backgroundColor = '#fef2f2';
        }
      }
    },

    renderOverviewDatasetInfo(dataset, metrics) {
      const container = document.getElementById('overview-dataset-info');
      if (!container) return;

      const d = dataset || {};
      const m = metrics || {};
      const fileName = d.fileName || d.originalName || 'dataset.csv';
      const fileSize = d.fileSizeBytes || d.fileSize || 0;
      const totalCells = (m.totalRows && m.totalColumns) ? (m.totalRows * m.totalColumns) : 0;
      const filePath = d.filePath || 'data/uploads/';
      const uploadTime = d.uploadedAt || d.uploadDateFormatted || 'Just now';

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.82rem;">
          <div style="display:flex; justify-content:space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
            <span style="color:var(--text-muted);">File Name:</span>
            <span style="font-weight:600; color:var(--text-main);">${this.escapeHtml(fileName)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
            <span style="color:var(--text-muted);">File Size:</span>
            <span style="font-weight:600; color:var(--text-main);">${this.formatBytes(fileSize)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
            <span style="color:var(--text-muted);">Total Cells:</span>
            <span style="font-weight:600; color:var(--text-main);">${this.formatNum(totalCells, 0)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
            <span style="color:var(--text-muted);">Storage Path:</span>
            <span style="font-weight:500; font-size:0.75rem; color:#475569;">${this.escapeHtml(filePath)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-muted);">Upload Timestamp:</span>
            <span style="font-weight:500; color:var(--text-main);">${this.escapeHtml(uploadTime)}</span>
          </div>
        </div>
      `;
    },

    renderOverviewActivity(dataset, metrics) {
      const container = document.getElementById('overview-recent-activity');
      if (!container) return;

      const m = metrics || {};
      const qualityScore = m.qualityScore ?? 0;
      const healthClass = qualityScore >= 80 ? 'badge-health-good' : (qualityScore >= 60 ? 'badge-health-warning' : 'badge-health-danger');
      const healthLabel = qualityScore >= 80 ? 'Optimal Quality' : (qualityScore >= 60 ? 'Moderate Quality' : 'Needs Cleansing');

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.82rem;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 600; color: var(--text-main);">Current Profile Status:</span>
            <span class="${healthClass}">${healthLabel} (${this.formatNum(qualityScore, 1)}%)</span>
          </div>
          <div style="padding: 10px; background: #f8fafc; border-radius: 6px; border-left: 3px solid var(--color-primary); color: #334155; line-height: 1.4;">
            Analyzed <strong>${this.formatNum(m.totalRows || 0, 0)}</strong> records across <strong>${m.totalColumns || 0}</strong> columns. 
            Identified <strong>${m.numericColumns || 0}</strong> numeric variables and <strong>${m.categoricalColumns || 0}</strong> categorical dimensions with 
            <strong>${m.missingValues || 0}</strong> missing fields.
          </div>
        </div>
      `;
    },

    /**
     * SECTION 2: DATA PREVIEW
     */
    async loadPreview(page = 1) {
      const sizeSelect = document.getElementById('preview-page-size');
      const searchInput = document.getElementById('preview-search-input');
      const size = sizeSelect ? parseInt(sizeSelect.value, 10) || 100 : 100;
      const search = searchInput ? searchInput.value.trim() : '';

      this.previewState.page = page;
      this.previewState.size = size;
      this.previewState.search = search;

      const query = new URLSearchParams({
        page: page.toString(),
        size: size.toString(),
        search: search
      });

      const data = await this.fetchJson(`/api/preview?${query.toString()}`);
      if (!data) return;

      const thead = document.getElementById('preview-thead');
      const tbody = document.getElementById('preview-tbody');
      const paginationBar = document.getElementById('preview-pagination-bar');
      const pageInfo = document.getElementById('preview-page-info');
      const pageNum = document.getElementById('preview-page-num');
      const btnPrev = document.getElementById('preview-btn-prev');
      const btnNext = document.getElementById('preview-btn-next');

      if (!data.hasDataset || !data.columns || data.columns.length === 0) {
        if (thead) thead.innerHTML = '<tr><th>Records</th></tr>';
        if (tbody) tbody.innerHTML = '<tr><td class="table-empty-row">No dataset available</td></tr>';
        if (paginationBar) paginationBar.style.display = 'none';
        return;
      }

      // Render headers
      if (thead) {
        const headerCells = data.columns.map(col => {
          const colName = typeof col === 'string' ? col : (col.name || col.columnName || '');
          const colType = typeof col === 'object' && (col.dataType || col.type) ? (col.dataType || col.type) : '';
          return `
            <th>
              <div style="display:flex; flex-direction:column; gap:2px;">
                <span>${this.escapeHtml(colName)}</span>
                ${colType ? `<span style="font-size:0.7rem; font-weight:normal; text-transform:uppercase; color:#64748b;">${this.escapeHtml(colType)}</span>` : ''}
              </div>
            </th>
          `;
        }).join('');
        thead.innerHTML = `<tr><th style="width:40px; text-align:center;">#</th>${headerCells}</tr>`;
      }

      // Render rows
      if (tbody) {
        if (!data.rows || data.rows.length === 0) {
          tbody.innerHTML = `<tr><td colspan="${data.columns.length + 1}" class="table-empty-row">No rows matched your search query.</td></tr>`;
        } else {
          const pSize = data.pageSize || data.size || size;
          const startIndex = (data.page - 1) * pSize;
          tbody.innerHTML = data.rows.map((row, rIdx) => {
            const cells = data.columns.map((col, colIdx) => {
              const colName = typeof col === 'string' ? col : (col.name || col.columnName || '');
              let val = '';
              if (Array.isArray(row)) {
                val = row[colIdx] !== undefined ? row[colIdx] : '';
              } else if (row && typeof row === 'object') {
                val = row[colName] !== undefined ? row[colName] : (row[colIdx] !== undefined ? row[colIdx] : '');
              }
              return `<td>${this.escapeHtml(val)}</td>`;
            }).join('');
            return `<tr><td style="text-align:center; font-weight:600; color:#94a3b8; font-size:0.75rem;">${startIndex + rIdx + 1}</td>${cells}</tr>`;
          }).join('');
        }
      }

      // Update pagination bar
      if (paginationBar) {
        paginationBar.style.display = 'flex';
        const pSize = data.pageSize || data.size || size;
        const totalRows = data.totalFilteredRows !== undefined ? data.totalFilteredRows : (data.totalRows || 0);
        const startRow = totalRows > 0 ? (data.page - 1) * pSize + 1 : 0;
        const endRow = Math.min(data.page * pSize, totalRows);
        if (pageInfo) pageInfo.textContent = `Showing ${startRow}–${endRow} of ${totalRows} rows`;
        if (pageNum) pageNum.textContent = `Page ${data.page} of ${data.totalPages || 1}`;

        if (btnPrev) {
          btnPrev.disabled = data.page <= 1;
        }
        if (btnNext) {
          btnNext.disabled = data.page >= data.totalPages;
        }
      }
    },

    /**
     * SECTION 3: DATA QUALITY
     */
    async loadQuality() {
      const data = await this.fetchJson('/api/quality');
      if (!data) return;

      const compVal = document.getElementById('quality-metric-completeness');
      const uniqVal = document.getElementById('quality-metric-uniqueness');
      const missVal = document.getElementById('quality-metric-missing');
      const dupsVal = document.getElementById('quality-metric-dups');
      const scoreVal = document.getElementById('quality-metric-score');
      const tbody = document.getElementById('quality-tbody');
      const formulaCard = document.getElementById('quality-formula-card');
      const deductionDiv = document.getElementById('quality-deduction-breakdown');

      if (!data.hasDataset) {
        if (compVal) compVal.textContent = '--';
        if (uniqVal) uniqVal.textContent = '--';
        if (missVal) missVal.textContent = '0';
        if (dupsVal) dupsVal.textContent = '0';
        if (scoreVal) scoreVal.textContent = '--';
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="table-empty-row">No dataset available</td></tr>';
        if (formulaCard) formulaCard.style.display = 'none';
        return;
      }

      const summary = data.summary || data.metrics || {};
      const completeness = summary.completeness ?? data.dimensions?.completeness ?? 100;
      const uniqueness = summary.uniqueness ?? data.dimensions?.uniqueness ?? 100;
      const missingValues = summary.missingValues ?? data.metrics?.missingValues ?? 0;
      const duplicateRows = summary.duplicateRows ?? data.metrics?.duplicateRows ?? 0;
      const qualityScore = summary.qualityScore ?? data.metrics?.qualityScore ?? 100;

      if (compVal) compVal.textContent = this.formatNum(completeness, 1) + '%';
      if (uniqVal) uniqVal.textContent = this.formatNum(uniqueness, 1) + '%';
      if (missVal) missVal.textContent = this.formatNum(missingValues, 0);
      if (dupsVal) dupsVal.textContent = this.formatNum(duplicateRows, 0);
      if (scoreVal) scoreVal.textContent = this.formatNum(qualityScore, 1);

      // Render columns quality table
      if (tbody && data.columns) {
        tbody.innerHTML = data.columns.map(col => {
          const colName = col.columnName || col.name || '';
          const colType = col.dataType || col.type || 'TEXT';
          const totalVal = col.totalCount ?? col.totalValues ?? 0;
          const missVal = col.missingCount ?? 0;
          const missPct = col.missingPercentage ?? 0;
          const uniqueVal = col.uniqueCount ?? 0;
          const completenessPct = col.completenessPercentage ? Number(col.completenessPercentage).toFixed(1) : (100 - missPct).toFixed(1);

          let badgeClass = 'badge-health-good';
          let healthText = 'Good';
          if (missPct > 20) {
            badgeClass = 'badge-health-danger';
            healthText = 'Needs Cleansing';
          } else if (missPct > 5) {
            badgeClass = 'badge-health-warning';
            healthText = 'Moderate';
          }

          return `
            <tr>
              <td style="font-weight:600; color:var(--text-main);">${this.escapeHtml(colName)}</td>
              <td><span style="font-size:0.75rem; text-transform:uppercase; font-weight:600; color:#475569;">${this.escapeHtml(colType)}</span></td>
              <td>${this.formatNum(totalVal, 0)}</td>
              <td>${this.formatNum(missVal, 0)}</td>
              <td>${this.formatNum(missPct, 1)}%</td>
              <td>${this.formatNum(uniqueVal, 0)}</td>
              <td><strong>${completenessPct}%</strong></td>
              <td><span class="${badgeClass}">${healthText}</span></td>
            </tr>
          `;
        }).join('');
      }

      // Show formula deduction breakdown
      const formulaData = summary.formulaDeduction || data.deductions;
      if (formulaCard && deductionDiv && formulaData) {
        formulaCard.style.display = 'block';
        const missDed = formulaData.missingDeduction ?? 0;
        const dupDed = formulaData.duplicateDeduction ?? 0;
        const missRate = formulaData.missingRate ?? (100 - completeness);
        const dupRate = formulaData.duplicateRate ?? (100 - uniqueness);

        deductionDiv.innerHTML = `
          Missing values penalty: <strong>-${this.formatNum(missDed, 2)} pts</strong> (${this.formatNum(missRate, 1)}% &times; 0.60) &bull; 
          Duplicate rows penalty: <strong>-${this.formatNum(dupDed, 2)} pts</strong> (${this.formatNum(dupRate, 1)}% &times; 0.40) &bull; 
          Calculated Overall Score: <strong style="color:var(--color-primary); font-size:0.9rem;">${this.formatNum(qualityScore, 1)} / 100</strong>
        `;
      }
    },

    /**
     * SECTION 4: STATISTICS
     */
    async loadStatistics() {
      const data = await this.fetchJson('/api/statistics');
      if (!data) return;

      const numTbody = document.getElementById('stats-numeric-tbody');
      const catTbody = document.getElementById('stats-categorical-tbody');

      if (!data.hasDataset) {
        if (numTbody) numTbody.innerHTML = '<tr><td colspan="11" class="table-empty-row">No dataset available</td></tr>';
        if (catTbody) catTbody.innerHTML = '<tr><td colspan="6" class="table-empty-row">No dataset available</td></tr>';
        return;
      }

      const numericSummary = data.numericSummary || data.numericColumns || [];
      const categoricalSummary = data.categoricalSummary || data.categoricalColumns || [];

      // Numeric Statistics Table
      if (numTbody) {
        if (numericSummary.length === 0) {
          numTbody.innerHTML = '<tr><td colspan="11" class="table-empty-row">No numeric columns present in this dataset.</td></tr>';
        } else {
          numTbody.innerHTML = numericSummary.map(stat => `
            <tr>
              <td style="font-weight:600; color:var(--text-main);">${this.escapeHtml(stat.columnName || stat.name || '')}</td>
              <td>${this.formatNum(stat.count ?? stat.totalCount ?? 0, 0)}</td>
              <td><strong>${this.formatNum(stat.mean ?? 0, 2)}</strong></td>
              <td>${this.formatNum(stat.stdDev ?? 0, 2)}</td>
              <td>${this.formatNum(stat.min ?? 0, 2)}</td>
              <td>${this.formatNum(stat.q25 ?? 0, 2)}</td>
              <td><strong>${this.formatNum(stat.median ?? 0, 2)}</strong></td>
              <td>${this.formatNum(stat.q75 ?? 0, 2)}</td>
              <td>${this.formatNum(stat.max ?? 0, 2)}</td>
              <td>${this.formatNum(stat.variance ?? 0, 2)}</td>
              <td>${this.formatNum(stat.range ?? 0, 2)}</td>
            </tr>
          `).join('');
        }
      }

      // Categorical Statistics Table
      if (catTbody) {
        if (categoricalSummary.length === 0) {
          catTbody.innerHTML = '<tr><td colspan="6" class="table-empty-row">No categorical columns present in this dataset.</td></tr>';
        } else {
          catTbody.innerHTML = categoricalSummary.map(cat => {
            const topValuesHtml = (cat.topValues || []).map(tv => `
              <span style="display:inline-block; margin:2px; padding:2px 6px; background:#f1f5f9; border-radius:4px; font-size:0.75rem;">
                ${this.escapeHtml(tv.value)}: <strong>${tv.count}</strong>
              </span>
            `).join('');

            return `
              <tr>
                <td style="font-weight:600; color:var(--text-main);">${this.escapeHtml(cat.columnName || cat.name || '')}</td>
                <td>${this.formatNum(cat.totalCount ?? 0, 0)}</td>
                <td>${this.formatNum(cat.uniqueCount ?? 0, 0)}</td>
                <td><strong>${this.escapeHtml(cat.mostFrequentValue || 'N/A')}</strong></td>
                <td>${this.formatNum(cat.topFrequency ?? 0, 0)}</td>
                <td>${topValuesHtml || '-'}</td>
              </tr>
            `;
          }).join('');
        }
      }
    },

    /**
     * SECTION 7: INSIGHTS
     */
    async loadInsights() {
      const data = await this.fetchJson('/api/insights');
      if (!data) return;

      const container = document.getElementById('insights-list-container');
      const healthRating = document.getElementById('insights-health-rating');
      const copyBtn = document.getElementById('btn-copy-insights');

      if (!container) return;

      if (!data.hasDataset || !data.insights || data.insights.length === 0) {
        container.innerHTML = `
          <div class="preview-empty-state" style="min-height: 260px;">
            <div class="empty-icon-circle">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                <path d="M9 18h6"/>
                <path d="M10 22h4"/>
              </svg>
            </div>
            <div class="empty-title">No dataset available</div>
            <div class="empty-subtitle">Statistical insights and distribution patterns will be generated once a dataset is loaded.</div>
          </div>`;
        if (healthRating) healthRating.style.display = 'none';
        if (copyBtn) copyBtn.style.display = 'none';
        return;
      }

      if (healthRating) {
        healthRating.style.display = 'inline-block';
        healthRating.textContent = `Overall Quality: ${this.formatNum(data.qualityScore ?? 100, 1)}%`;
      }
      if (copyBtn) {
        copyBtn.style.display = 'inline-block';
      }

      container.innerHTML = data.insights.map(item => {
        if (typeof item === 'string') {
          return `
            <div class="insight-card-item" style="border-left-color: #0ea5e9;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span class="insight-title">Insight</span>
                <span class="badge-health-good">Summary</span>
              </div>
              <p class="insight-description">${this.escapeHtml(item)}</p>
            </div>
          `;
        }

        let badgeClass = 'badge-health-good';
        let borderColor = '#0ea5e9';
        if (item.category === 'Missing Values' || item.category === 'Duplicate Records') {
          badgeClass = item.type === 'warning' ? 'badge-health-warning' : (item.type === 'danger' ? 'badge-health-danger' : 'badge-health-good');
          borderColor = item.type === 'warning' ? '#f59e0b' : (item.type === 'danger' ? '#ef4444' : '#10b981');
        } else if (item.category === 'Quality Summary') {
          borderColor = item.type === 'danger' ? '#ef4444' : (item.type === 'warning' ? '#f59e0b' : '#10b981');
        }

        return `
          <div class="insight-card-item" style="border-left-color: ${borderColor};">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span class="insight-title">${this.escapeHtml(item.title || 'Insight')}</span>
              <span class="${badgeClass}">${this.escapeHtml(item.category || 'Quality')}</span>
            </div>
            <p class="insight-description">${this.escapeHtml(item.description || item.text || '')}</p>
          </div>
        `;
      }).join('');
    },

    /**
     * SECTION 8: HISTORY
     */
    async loadHistory() {
      const data = await this.fetchJson('/api/history');
      if (!data) return;

      const tbody = document.getElementById('history-tbody');
      const histTotalCount = document.getElementById('hist-total-count');
      const histActiveName = document.getElementById('hist-active-name');
      const histAvgScore = document.getElementById('hist-avg-score');
      const histTotalRows = document.getElementById('hist-total-rows');

      if (!data.history || data.history.length === 0) {
        if (histTotalCount) histTotalCount.textContent = '0';
        if (histActiveName) histActiveName.textContent = 'No dataset active';
        if (histAvgScore) histAvgScore.textContent = '0%';
        if (histTotalRows) histTotalRows.textContent = '0';
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="8" class="table-empty-row" style="padding: 36px 16px; text-align: center;"><div class="empty-icon-circle" style="margin: 0 auto 12px auto;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div style="font-weight:700; color:#334155; margin-bottom:4px; font-size:0.95rem;">No datasets stored yet</div><div style="font-size:0.82rem; color:#64748b; margin-bottom:14px;">Upload a CSV dataset up to 100 MB to begin data profiling and analysis.</div><button type="button" class="btn-primary" onclick="document.querySelector(\'[data-section=overview]\')?.click(); document.getElementById(\'csv-file-input\')?.scrollIntoView({behavior:\'smooth\'});">Upload CSV Dataset</button></td></tr>';
        }
        return;
      }

      this.historyCache = data.history;
      this.historyActiveDatasetId = (data.activeDatasetId !== undefined && data.activeDatasetId !== -1)
        ? data.activeDatasetId
        : (this.activeDataset ? this.activeDataset.id : null);

      // Compute KPI summaries
      const totalDatasets = data.history.length;
      let totalRowsSum = 0;
      let scoreSum = 0;
      let activeDatasetName = 'None';

      data.history.forEach(item => {
        totalRowsSum += (item.rowCount || 0);
        scoreSum += (item.qualityScore || 0);
        const isCurrentActive = this.historyActiveDatasetId !== null 
          ? (item.id === this.historyActiveDatasetId) 
          : (item.isActive === true || item.active === true);
        if (isCurrentActive) {
          activeDatasetName = item.fileName || item.originalName || `Dataset #${item.id}`;
        }
      });

      if (histTotalCount) histTotalCount.textContent = this.formatNum(totalDatasets, 0);
      if (histActiveName) histActiveName.textContent = activeDatasetName;
      if (histAvgScore) histAvgScore.textContent = `${this.formatNum(scoreSum / totalDatasets, 1)}%`;
      if (histTotalRows) histTotalRows.textContent = this.formatNum(totalRowsSum, 0);

      this.renderHistoryTable(data.history);
    },

    renderHistoryTable(items) {
      const tbody = document.getElementById('history-tbody');
      if (!tbody) return;

      if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty-row" style="padding:28px 16px; text-align:center; color:#64748b;">No matching datasets found for your search query.</td></tr>';
        return;
      }

      const activeId = this.historyActiveDatasetId;

      tbody.innerHTML = items.map(item => {
        const isActive = activeId !== null ? (item.id === activeId) : (item.isActive === true || item.active === true);
        const scoreVal = Number(item.qualityScore || 0);
        const scoreBadge = scoreVal >= 80 ? 'badge-health-good' : (scoreVal >= 60 ? 'badge-health-warning' : 'badge-health-danger');
        const fileName = item.fileName || item.originalName || 'dataset.csv';
        const uploadTime = item.uploadedAt || item.uploadDateFormatted || 'Recently';
        const fileSize = item.fileSizeBytes || item.fileSize || 0;

        return `
          <tr>
            <td>
              <div class="dataset-name-cell">
                <span class="dataset-file-name" title="${this.escapeHtml(fileName)}">${this.escapeHtml(fileName)}</span>
                <span class="dataset-id-label">ID #${item.id}</span>
              </div>
            </td>
            <td>
              <span style="color:#475569; font-variant-numeric:tabular-nums;">${this.escapeHtml(uploadTime)}</span>
            </td>
            <td style="text-align:right;">
              <span style="font-variant-numeric:tabular-nums; font-weight:500;">${this.formatBytes(fileSize)}</span>
            </td>
            <td style="text-align:right;">
              <span style="font-variant-numeric:tabular-nums; font-weight:600; color:var(--text-main);">${this.formatNum(item.rowCount, 0)}</span>
            </td>
            <td style="text-align:right;">
              <span style="font-variant-numeric:tabular-nums; color:#475569;">${this.formatNum(item.columnCount, 0)}</span>
            </td>
            <td style="text-align:center;">
              <span class="${scoreBadge}">${this.formatNum(scoreVal, 1)}%</span>
            </td>
            <td style="text-align:center;">
              ${isActive 
                ? '<span class="badge-active-dataset"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Active</span>' 
                : '<span class="badge-stored-dataset">Stored</span>'
              }
            </td>
            <td style="text-align:center;">
              ${isActive 
                ? '<span class="status-in-use">&check; Current</span>' 
                : `<button type="button" class="btn-activate-dataset" onclick="window.DataLens.activateDataset(${item.id})">Activate</button>`
              }
            </td>
          </tr>
        `;
      }).join('');
    },

    /**
     * Activates a historical dataset by ID
     * @param {number} datasetId
     */
    async activateDataset(datasetId) {
      const res = await this.fetchJson('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=activate&id=${datasetId}`
      });

      if (res && res.success) {
        if (res.datasetName) {
          const headerDatasetName = document.getElementById('header-dataset-name');
          if (headerDatasetName) headerDatasetName.textContent = res.datasetName;
        }
        await this.refreshAll();
      } else {
        alert(res ? res.message : 'Failed to activate dataset.');
      }
    },

    /**
     * SECTION: SAMPLE DATASETS LOADER
     */
    async loadSampleDataset(sampleType) {
      const statusEl = document.getElementById('sample-load-status');
      if (statusEl) statusEl.textContent = 'Loading sample dataset...';
      const res = await this.fetchJson(`/api/sample-data?sample=${encodeURIComponent(sampleType)}`);
      if (res && res.success) {
        if (statusEl) {
          statusEl.textContent = `Loaded ${res.datasetName} (${res.rowCount} rows)!`;
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
        }
        await this.refreshAll();
      } else {
        if (statusEl) statusEl.textContent = res ? res.message : 'Failed to load sample dataset.';
      }
    },

    /**
     * SECTION: CLEANING STUDIO
     */
    populateCleaningSelectors() {
      const cols = this.activeColumns || [];
      const colSelects = document.querySelectorAll('.clean-column-select');
      colSelects.forEach(sel => {
        const prevVal = sel.value;
        let defaultOpt = '<option value="">Select Column</option>';
        if (sel.id === 'clean-text-column') {
          defaultOpt = '<option value="ALL">All Text Columns</option>';
        } else if (sel.id === 'clean-missing-column') {
          defaultOpt = '<option value="ALL">All Columns (Any Missing)</option>';
        } else if (sel.id === 'clean-dup-column') {
          defaultOpt = '<option value="ALL">All Columns (Exact Duplicate Rows)</option>';
        }
        let opts = defaultOpt;
        opts += cols.map(c => {
          const name = typeof c === 'string' ? c : (c.name || c.columnName || '');
          const type = typeof c === 'object' && (c.dataType || c.type) ? ` (${c.dataType || c.type})` : '';
          return `<option value="${this.escapeHtml(name)}">${this.escapeHtml(name)}${type}</option>`;
        }).join('');
        sel.innerHTML = opts;
        if (prevVal) {
          sel.value = prevVal;
        }
      });

      const numSelects = document.querySelectorAll('.clean-numeric-select');
      const numCols = cols.filter(c => (typeof c === 'object' && (c.dataType === 'NUMERIC' || c.type === 'NUMERIC')));
      numSelects.forEach(sel => {
        let opts = '<option value="">Select Numeric Column</option>';
        opts += (numCols.length > 0 ? numCols : cols).map(c => {
          const name = typeof c === 'string' ? c : (c.name || c.columnName || '');
          return `<option value="${this.escapeHtml(name)}">${this.escapeHtml(name)}</option>`;
        }).join('');
        sel.innerHTML = opts;
      });
    },

    async loadCleaningStudio() {
      const nameEl = document.getElementById('cleaning-dataset-name');
      const statsEl = document.getElementById('cleaning-dataset-stats');
      if (nameEl) {
        nameEl.textContent = this.activeDataset ? (this.activeDataset.name || this.activeDataset.originalName || 'Active Dataset') : 'No active dataset';
      }
      if (statsEl) {
        statsEl.textContent = this.activeDataset ? `${this.activeDataset.rowCount || 0} rows | ${this.activeDataset.columnCount || 0} cols | Score: ${this.activeDataset.qualityScore || 0}%` : '-';
      }
      this.populateCleaningSelectors();
      this.renderPipelineList();
    },

    stageCleaningOp(type) {
      let op = null;
      if (type === 'missing') {
        const strat = document.getElementById('clean-missing-strategy')?.value || 'drop_rows';
        const col = document.getElementById('clean-missing-column')?.value || 'ALL';
        const customVal = document.getElementById('clean-missing-custom-val')?.value || '';
        let label = 'Missing Values: ';
        if (strat === 'drop_rows') label += `Drop rows with missing values (${col === 'ALL' ? 'Any Column' : col})`;
        else if (strat === 'impute_mean') label += `Impute numeric mean for ${col}`;
        else if (strat === 'impute_median') label += `Impute numeric median for ${col}`;
        else if (strat === 'impute_mode') label += `Impute mode for ${col}`;
        else if (strat === 'impute_constant') label += `Fill missing with "${customVal || '0'}" in ${col}`;
        op = { type: 'MISSING_VALUES', strategy: strat, column: col, customValue: customVal, description: label };
      } else if (type === 'duplicates') {
        const strat = document.getElementById('clean-dup-strategy')?.value || 'remove_exact';
        const col = document.getElementById('clean-dup-column')?.value || 'ALL';
        let label = strat === 'remove_exact' ? 'Duplicates: Remove exact duplicate rows across all columns' : `Duplicates: Deduplicate by key column "${col}"`;
        op = { type: 'REMOVE_DUPLICATES', strategy: strat, column: col, description: label };
      } else if (type === 'outliers') {
        const strat = document.getElementById('clean-outlier-strategy')?.value || 'cap_iqr';
        const col = document.getElementById('clean-outlier-column')?.value || '';
        if (!col) { alert('Please select a numeric column for outlier remediation.'); return; }
        let label = strat === 'cap_iqr' ? `Outliers: Cap to Tukey 1.5x IQR fences in "${col}"` : `Outliers: Remove rows with outliers in "${col}"`;
        op = { type: 'OUTLIERS', strategy: strat, column: col, description: label };
      } else if (type === 'text') {
        const strat = document.getElementById('clean-text-strategy')?.value || 'trim';
        const col = document.getElementById('clean-text-column')?.value || 'ALL';
        let label = `Text: Apply ${strat} to ${col === 'ALL' ? 'all text columns' : col}`;
        op = { type: 'TEXT_SANITIZE', strategy: strat, column: col, description: label };
      } else if (type === 'column') {
        const action = document.getElementById('clean-col-action')?.value || 'drop';
        const targetCol = document.getElementById('clean-col-target')?.value || '';
        const newName = document.getElementById('clean-new-col-name')?.value || '';
        if (!targetCol) { alert('Please select a target column.'); return; }
        if (action === 'rename' && !newName) { alert('Please enter a new column name.'); return; }
        let label = action === 'drop' ? `Column: Drop column "${targetCol}"` : `Column: Rename "${targetCol}" to "${newName}"`;
        op = { type: 'COLUMN_MANAGEMENT', action, column: targetCol, newColumnName: newName, description: label };
      }

      if (op) {
        this.stagedCleaningOps.push(op);
        this.renderPipelineList();
        this.previewCleaning();
      }
    },

    renderPipelineList() {
      const container = document.getElementById('pipeline-list-container');
      const countEl = document.getElementById('staged-count');
      if (countEl) countEl.textContent = this.stagedCleaningOps.length;
      if (!container) return;

      if (this.stagedCleaningOps.length === 0) {
        container.innerHTML = '<div style="font-size:0.82rem; color:#94a3b8; padding:12px; text-align:center; background:#f8fafc; border-radius:6px; border:1px dashed #cbd5e1;">No transformations staged yet. Select operations above and click "+ Stage Operation".</div>';
        return;
      }

      container.innerHTML = this.stagedCleaningOps.map((op, idx) => `
        <div class="pipeline-item">
          <div class="pipeline-item-desc">
            <span style="font-weight:700; color:var(--color-primary); margin-right:8px;">Step ${idx + 1}:</span>
            ${this.escapeHtml(op.description || op.type)}
          </div>
          <button type="button" class="pipeline-item-remove" onclick="window.DataLens.removeStagedOp(${idx})">&times; Remove</button>
        </div>
      `).join('');
    },

    async removeStagedOp(index) {
      this.stagedCleaningOps.splice(index, 1);
      this.renderPipelineList();
      if (this.stagedCleaningOps.length > 0) {
        await this.previewCleaning();
      } else {
        await this.restoreOriginalCleaningPreview();
      }
    },

    async clearPipeline() {
      this.stagedCleaningOps = [];
      this.renderPipelineList();
      const feedbackBar = document.getElementById('cleaning-feedback-bar');
      if (feedbackBar) feedbackBar.style.display = 'none';
      await this.restoreOriginalCleaningPreview();
    },

    updateCleaningKpis(res, isRestored = false) {
      const origRows = res.originalRows !== undefined ? res.originalRows : (res.originalRowCount || 0);
      const remRows = res.remainingRows !== undefined ? res.remainingRows : (res.cleanedRowCount || 0);
      const rowsRem = res.rowsRemoved !== undefined ? res.rowsRemoved : Math.max(0, origRows - remRows);

      const origCols = res.originalColumns !== undefined ? res.originalColumns : (res.originalColumnCount || 0);
      const remCols = res.remainingColumns !== undefined ? res.remainingColumns : (res.cleanedColumnCount || 0);
      const colsRem = res.columnsRemoved !== undefined ? res.columnsRemoved : Math.max(0, origCols - remCols);

      const cellsMod = res.cellsModified !== undefined ? res.cellsModified : (res.affectedCellsCount || 0);

      const missBefore = res.missingValuesBefore !== undefined ? res.missingValuesBefore : (this.activeDataset?.missingCount || 0);
      const missAfter = res.missingValuesAfter !== undefined ? res.missingValuesAfter : (isRestored ? missBefore : 0);

      const dupsBefore = res.duplicateRowsBefore !== undefined ? res.duplicateRowsBefore : (this.activeDataset?.duplicateCount || 0);
      const dupsAfter = res.duplicateRowsAfter !== undefined ? res.duplicateRowsAfter : (isRestored ? dupsBefore : 0);

      const scoreBefore = res.qualityScoreBefore !== undefined ? Number(res.qualityScoreBefore) : Number(this.activeDataset?.qualityScore || 0);
      const scoreAfter = res.qualityScoreAfter !== undefined ? Number(res.qualityScoreAfter) : (isRestored ? scoreBefore : Number(res.qualityScore || res.newQualityScore || scoreBefore));

      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setTxt('kpi-orig-rows', origRows);
      setTxt('kpi-remaining-rows', remRows);
      setTxt('kpi-rows-removed', rowsRem);
      setTxt('kpi-orig-cols', origCols);
      setTxt('kpi-remaining-cols', remCols);
      setTxt('kpi-cols-removed', colsRem);
      setTxt('kpi-cells-modified', cellsMod);
      setTxt('kpi-missing-before', missBefore);
      setTxt('kpi-missing-after', missAfter);
      setTxt('kpi-dups-before', dupsBefore);
      setTxt('kpi-dups-after', dupsAfter);

      const scoreChangeEl = document.getElementById('kpi-score-change');
      if (scoreChangeEl) {
        scoreChangeEl.innerHTML = `${scoreBefore.toFixed(1)}% &rarr; ${scoreAfter.toFixed(1)}%`;
      }

      // Zero affected cells / No-changes alert banner
      const banner = document.getElementById('cleaning-no-changes-banner');
      if (banner) {
        if (!isRestored && (res.noChangesMessage || (rowsRem === 0 && colsRem === 0 && cellsMod === 0 && this.stagedCleaningOps.length > 0))) {
          banner.style.display = 'block';
          banner.textContent = res.noChangesMessage || `No changes were required. All ${remRows} rows were retained.`;
        } else {
          banner.style.display = 'none';
        }
      }

      // Breakdown per operation
      const breakdown = document.getElementById('cleaning-ops-breakdown');
      if (breakdown) {
        if (!isRestored && res.summary && res.summary.length > 0) {
          breakdown.style.display = 'block';
          breakdown.innerHTML = '<strong>Transformation Breakdown:</strong><ul style="margin:6px 0 0 16px; padding:0;">' +
            res.summary.map(s => `<li>${this.escapeHtml(s)}</li>`).join('') + '</ul>';
        } else {
          breakdown.style.display = 'none';
        }
      }
    },

    async restoreOriginalCleaningPreview() {
      const res = await this.fetchJson('/api/cleaning/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: [] })
      });

      if (!res || !res.success) {
        const previewCard = document.getElementById('cleaning-preview-card');
        if (previewCard) previewCard.style.display = 'none';
        return;
      }

      const previewCard = document.getElementById('cleaning-preview-card');
      if (previewCard) previewCard.style.display = 'block';

      this.currentCleaningPreview = res;
      this.updateCleaningKpis(res, true);
      this.cleaningPage = 1;
      this.renderCleaningPreviewTable('after');
    },

    async previewCleaning() {
      if (this.stagedCleaningOps.length === 0) {
        await this.restoreOriginalCleaningPreview();
        return;
      }

      const res = await this.fetchJson('/api/cleaning/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: this.stagedCleaningOps })
      });

      if (!res || !res.success) {
        alert(res ? res.message : 'Failed to preview cleaning impact.');
        return;
      }

      const previewCard = document.getElementById('cleaning-preview-card');
      if (previewCard) previewCard.style.display = 'block';

      this.currentCleaningPreview = res;
      this.updateCleaningKpis(res, false);
      this.cleaningPage = 1;
      this.renderCleaningPreviewTable('after');
    },

    renderCleaningPreviewTable(mode = 'after') {
      this.cleaningViewMode = mode;
      const res = this.currentCleaningPreview;
      if (!res) return;

      // Update button classes
      ['after', 'before', 'diff'].forEach(m => {
        const btn = document.getElementById(`btn-view-${m}`);
        if (btn) {
          if (m === mode) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });

      const viewLabel = document.getElementById('cleaning-current-view-label');
      if (viewLabel) {
        if (mode === 'after') viewLabel.textContent = `Viewing: Transformed Output (${res.cleanedRowCount || 0} rows)`;
        else if (mode === 'before') viewLabel.textContent = `Viewing: Original Input (${res.originalRowCount || 0} rows)`;
        else if (mode === 'diff') viewLabel.textContent = `Viewing: Changes / Modified Rows Only (${res.affectedRowsCount || 0} rows affected)`;
      }

      const thead = document.getElementById('cleaning-preview-thead');
      const tbody = document.getElementById('cleaning-preview-tbody');

      const headers = (mode === 'before') ? (res.originalHeaders || res.headers || []) : (res.headers || res.originalHeaders || []);
      const allRows = (mode === 'before') ? (res.originalRows || res.origRows || []) : (res.rows || res.previewRows || res.transformedRows || []);
      const changedSet = new Set(res.changedCells || []);
      const cellChanges = res.cellChanges || {};

      if (thead) {
        thead.innerHTML = '<tr><th style="width:48px; text-align:center; position:sticky; top:0; z-index:5; background:#f8fafc;">#</th>' +
          headers.map(h => `<th style="position:sticky; top:0; z-index:5; background:#f8fafc;">${this.escapeHtml(h)}</th>`).join('') + '</tr>';
      }

      if (!tbody) return;

      const getVal = (row, h, cIdx) => {
        if (row === null || row === undefined) return '';
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          if (Array.isArray(row.cells)) row = row.cells;
          else if (Array.isArray(row.values)) row = row.values;
          else if (Array.isArray(row.data)) row = row.data;
          else if (Array.isArray(row.row)) row = row.row;
        }
        if (Array.isArray(row)) {
          const v = row[cIdx];
          if (v === null || v === undefined) return '';
          if (typeof v === 'object' && v !== null) {
            return v.value !== undefined ? String(v.value) : (v.text !== undefined ? String(v.text) : JSON.stringify(v));
          }
          return String(v);
        }
        if (typeof row === 'object') {
          if (row[h] !== undefined && row[h] !== null) return String(row[h]);
          if (row[cIdx] !== undefined && row[cIdx] !== null) return String(row[cIdx]);
          if (row[String(cIdx)] !== undefined && row[String(cIdx)] !== null) return String(row[String(cIdx)]);
          const hNorm = String(h).trim().toLowerCase();
          for (const k of Object.keys(row)) {
            if (k.trim().toLowerCase() === hNorm) {
              const v = row[k];
              return v !== null && v !== undefined ? String(v) : '';
            }
          }
        }
        return '';
      };

      // Determine rows for current mode
      let targetRows = allRows;
      let targetRowIndices = [];

      if (mode === 'diff') {
        const diffRows = [];
        const diffIndices = [];
        for (let rIdx = 0; rIdx < allRows.length; rIdx++) {
          let rowHasChange = false;
          for (let cIdx = 0; cIdx < headers.length; cIdx++) {
            if (changedSet.has(`${rIdx}:${cIdx}`)) {
              rowHasChange = true;
              break;
            }
          }
          if (rowHasChange) {
            diffRows.push(allRows[rIdx]);
            diffIndices.push(rIdx);
          }
        }
        targetRows = diffRows;
        targetRowIndices = diffIndices;
      } else {
        targetRowIndices = targetRows.map((_, i) => i);
      }

      // Pagination calculation
      this.cleaningPage = this.cleaningPage || 1;
      const sizeSelect = document.getElementById('cleaning-page-size');
      const sizeVal = sizeSelect ? sizeSelect.value : '10';
      const pageSize = (sizeVal === 'all') ? (targetRows.length || 1) : (parseInt(sizeVal, 10) || 10);
      const totalPages = Math.max(1, Math.ceil(targetRows.length / pageSize));
      if (this.cleaningPage > totalPages) this.cleaningPage = totalPages;
      if (this.cleaningPage < 1) this.cleaningPage = 1;

      const pageInfo = document.getElementById('cleaning-page-info');
      if (pageInfo) {
        const start = targetRows.length === 0 ? 0 : (this.cleaningPage - 1) * pageSize + 1;
        const end = Math.min(this.cleaningPage * pageSize, targetRows.length);
        pageInfo.textContent = `Showing ${start}–${end} of ${targetRows.length} rows (${headers.length} cols)`;
      }

      const pageNum = document.getElementById('cleaning-page-num');
      if (pageNum) {
        pageNum.textContent = `Page ${this.cleaningPage} of ${totalPages}`;
      }

      const prevBtn = document.getElementById('cleaning-btn-prev');
      const nextBtn = document.getElementById('cleaning-btn-next');
      if (prevBtn) prevBtn.disabled = (this.cleaningPage <= 1);
      if (nextBtn) nextBtn.disabled = (this.cleaningPage >= totalPages);

      if (!targetRows || targetRows.length === 0) {
        const msg = (mode === 'diff') ?
          'No modified cells in current dataset (e.g. only dropped rows or unchanged values).' :
          'No data records to display.';
        tbody.innerHTML = `<tr><td colspan="${headers.length + 1}" style="text-align:center; padding:20px; color:#94a3b8; font-weight:600;">${msg}</td></tr>`;
        return;
      }

      const startIdx = (this.cleaningPage - 1) * pageSize;
      const pagedRows = targetRows.slice(startIdx, startIdx + pageSize);
      const pagedOrigIndices = targetRowIndices.slice(startIdx, startIdx + pageSize);

      if (mode === 'diff') {
        let diffHtml = '';
        for (let i = 0; i < pagedRows.length; i++) {
          const row = pagedRows[i];
          const origRIdx = pagedOrigIndices[i];
          const cells = headers.map((h, cIdx) => {
            const key = `${origRIdx}:${cIdx}`;
            const isChanged = changedSet.has(key);
            const cellVal = getVal(row, h, cIdx);
            if (isChanged && cellChanges[key]) {
              const oldVal = cellChanges[key].old !== undefined && cellChanges[key].old !== null && cellChanges[key].old !== '' ? cellChanges[key].old : '(empty)';
              const newVal = cellChanges[key].new !== undefined && cellChanges[key].new !== null && cellChanges[key].new !== '' ? cellChanges[key].new : '(empty)';
              return `<td class="cell-changed" title="Original: ${this.escapeHtml(oldVal)}">
                <span class="cell-diff-del">${this.escapeHtml(oldVal)}</span>
                <span class="cell-diff-ins">${this.escapeHtml(newVal)}</span>
              </td>`;
            }
            const displayVal = cellVal === '' ? '<span style="color:#94a3b8; font-style:italic;">(null)</span>' : this.escapeHtml(cellVal);
            return `<td>${displayVal}</td>`;
          }).join('');

          diffHtml += `<tr><td style="text-align:center; font-weight:600; color:#94a3b8; font-size:0.75rem;">${origRIdx + 1}</td>${cells}</tr>`;
        }
        tbody.innerHTML = diffHtml;
        return;
      }

      // Standard 'after' or 'before' view
      tbody.innerHTML = pagedRows.map((row, i) => {
        const origRIdx = pagedOrigIndices[i];
        const cells = headers.map((h, cIdx) => {
          const key = `${origRIdx}:${cIdx}`;
          const isChanged = (mode === 'after') && changedSet.has(key);
          const cellVal = getVal(row, h, cIdx);
          let titleAttr = '';
          let cls = '';
          if (isChanged) {
            cls = 'class="cell-changed"';
            if (cellChanges[key]) {
              titleAttr = `title="Original value was: '${this.escapeHtml(cellChanges[key].old || '')}'"`;
            }
          }
          const displayVal = cellVal === '' ? '<span style="color:#94a3b8; font-style:italic;">(null)</span>' : this.escapeHtml(cellVal);
          return `<td ${cls} ${titleAttr}>${displayVal}</td>`;
        }).join('');

        return `<tr><td style="text-align:center; font-weight:600; color:#94a3b8; font-size:0.75rem;">${origRIdx + 1}</td>${cells}</tr>`;
      }).join('');
    },

    downloadCleanedCsv() {
      const res = this.currentCleaningPreview;
      if (!res || !res.headers || (!res.rows && !res.previewRows)) {
        alert('No previewed or cleaned dataset available. Please preview your transformations first.');
        return;
      }

      const headers = res.headers || [];
      const rows = res.rows || res.previewRows || [];

      const escapeCsvCell = (str) => {
        if (str === null || str === undefined) return '';
        const s = String(str);
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      const csvLines = [];
      csvLines.push(headers.map(escapeCsvCell).join(','));
      for (const row of rows) {
        let rCells = row;
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          if (Array.isArray(row.cells)) rCells = row.cells;
          else if (Array.isArray(row.values)) rCells = row.values;
          else if (Array.isArray(row.data)) rCells = row.data;
          else if (Array.isArray(row.row)) rCells = row.row;
        }
        const line = headers.map((h, cIdx) => {
          let val = '';
          if (Array.isArray(rCells)) {
            val = rCells[cIdx] !== undefined && rCells[cIdx] !== null ? rCells[cIdx] : '';
          } else if (typeof rCells === 'object') {
            if (rCells[h] !== undefined && rCells[h] !== null) val = rCells[h];
            else if (rCells[cIdx] !== undefined && rCells[cIdx] !== null) val = rCells[cIdx];
            else if (rCells[String(cIdx)] !== undefined && rCells[String(cIdx)] !== null) val = rCells[String(cIdx)];
            else {
              const hNorm = String(h).trim().toLowerCase();
              for (const k of Object.keys(rCells)) {
                if (k.trim().toLowerCase() === hNorm) {
                  val = rCells[k] !== null && rCells[k] !== undefined ? rCells[k] : '';
                  break;
                }
              }
            }
          }
          if (typeof val === 'object' && val !== null) {
            val = val.value !== undefined ? val.value : (val.text !== undefined ? val.text : JSON.stringify(val));
          }
          return escapeCsvCell(val);
        }).join(',');
        csvLines.push(line);
      }

      const csvContent = '\uFEFF' + csvLines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const baseName = (this.activeDataset && (this.activeDataset.name || this.activeDataset.originalName)) ?
        (this.activeDataset.name || this.activeDataset.originalName).replace(/\.csv$/i, '') : 'dataset';
      a.href = url;
      a.download = `${baseName}_cleaned.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    async applyCleaning() {
      if (this.stagedCleaningOps.length === 0) {
        alert('Please stage at least one operation to apply.');
        return;
      }

      const nameInput = document.getElementById('clean-version-name-input');
      const customVersionName = nameInput ? nameInput.value.trim() : '';

      const applyBtns = document.querySelectorAll('#btn-apply-pipeline');
      applyBtns.forEach(btn => {
        btn.disabled = true;
        btn.dataset.origText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.6s linear infinite; vertical-align:-2px; margin-right:6px;"></span>Applying...';
      });

      try {
        const res = await this.fetchJson('/api/cleaning/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operations: this.stagedCleaningOps, versionName: customVersionName })
        });

        if (!res || !res.success) {
          alert(res ? res.message : 'Failed to apply cleaning operations.');
          return;
        }

        const score = (res.newQualityScore !== undefined && res.newQualityScore !== null) ?
          Number(res.newQualityScore).toFixed(1) :
          (res.qualityScore !== undefined ? Number(res.qualityScore).toFixed(1) : '100.0');

        const feedbackBar = document.getElementById('cleaning-feedback-bar');
        if (feedbackBar) {
          feedbackBar.style.display = 'block';
          feedbackBar.style.background = '#dcfce7';
          feedbackBar.style.color = '#15803d';
          feedbackBar.style.border = '1px solid #86efac';
          feedbackBar.innerHTML = `&check; Cleaned dataset saved as <strong>${this.escapeHtml(res.newVersionName)}</strong> (${res.newRowCount || res.affectedRows} rows, ${res.newColumnCount || ''} cols, Quality Score: ${score}%)!`;
        }

        const previewCard = document.getElementById('cleaning-preview-card');
        if (previewCard) previewCard.style.display = 'block';

        this.currentCleaningPreview = res;
        this.updateCleaningKpis(res, false);
        this.cleaningPage = 1;
        this.renderCleaningPreviewTable('after');

        if (nameInput) nameInput.value = '';
        this.stagedCleaningOps = [];
        this.renderPipelineList();
        await this.refreshAll();
      } catch (err) {
        console.error('Error applying cleaning operations:', err);
        alert('An unexpected error occurred while applying transformations.');
      } finally {
        applyBtns.forEach(btn => {
          btn.disabled = false;
          btn.innerHTML = btn.dataset.origText || 'Apply &amp; Save Version';
        });
      }
    },

    /**
     * SECTION: VALIDATION RULES
     */
    async loadValidationRules() {
      const res = await this.fetchJson('/api/validation');
      if (!res) return;
      this.validationRules = res.rules || [];
      const tbody = document.getElementById('validation-rules-tbody');
      if (!tbody) return;

      if (this.validationRules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="table-empty-row">No validation rules created yet. Add a rule above to audit your dataset.</td></tr>';
        return;
      }

      tbody.innerHTML = this.validationRules.map(r => {
        const statusUpper = (r.status || '').toUpperCase();
        const isPassed = statusUpper === 'PASS' || statusUpper === 'PASSED';
        const isUntested = statusUpper === 'UNTESTED' || statusUpper === 'NOT_APPLICABLE' || !statusUpper;
        const isError = statusUpper === 'ERROR';

        let badgeClass = 'badge-health-danger';
        let badgeText = `&cross; Failed (${r.failedCount !== undefined ? r.failedCount : 0})`;
        if (isPassed) {
          badgeClass = 'badge-health-good';
          badgeText = '&check; Passed';
        } else if (isUntested) {
          badgeClass = 'badge-health-warning';
          badgeText = 'Untested';
        } else if (isError) {
          badgeClass = 'badge-health-warning';
          badgeText = 'Error';
        }

        // Format rule type friendly label
        let typeLabel = r.ruleType;
        if (r.ruleType === 'NO_MISSING') typeLabel = 'Disallow Missing';
        else if (r.ruleType === 'POSITIVE_ONLY') typeLabel = 'Positive Only (> 0)';
        else if (r.ruleType === 'NUMERIC_RANGE') {
          const parts = [];
          if (r.minValue !== undefined && r.minValue !== null) parts.push(`≥ ${r.minValue}`);
          if (r.maxValue !== undefined && r.maxValue !== null) parts.push(`≤ ${r.maxValue}`);
          typeLabel = parts.length > 0 ? `Range (${parts.join(', ')})` : 'Numeric Range';
        } else if (r.ruleType === 'ALLOWED_VALUES') {
          typeLabel = 'Allowed Values';
        } else if (r.ruleType === 'UNIQUE') {
          typeLabel = 'Unique (No Duplicates)';
        }

        // Real example violating values
        let exampleText = 'None';
        if (r.exampleViolations && r.exampleViolations.length > 0) {
          exampleText = r.exampleViolations.map(v => {
            const str = String(v);
            return str === '' ? '(empty)' : (str.length > 40 ? str.substring(0, 37) + '...' : str);
          }).join(', ');
        } else if (r.exampleFailedRows && r.exampleFailedRows.length > 0) {
          exampleText = 'Rows: ' + r.exampleFailedRows.slice(0, 4).join(', ');
        }

        const totalRows = r.totalRows || r.totalEvaluatedRows || (this.activeDataset ? this.activeDataset.rowCount : 0);
        const failCount = r.failedCount !== undefined ? r.failedCount : 0;
        const failRate = r.failureRate !== undefined ? Number(r.failureRate) : 0;

        return `
          <tr>
            <td style="font-weight:600; color:var(--text-main);">${this.escapeHtml(r.name)}</td>
            <td><strong style="color:#0284c7;">${this.escapeHtml(r.columnName)}</strong></td>
            <td><span style="font-size:0.75rem; color:#475569; background:#f1f5f9; padding:3px 8px; border-radius:4px; font-weight:500;">${this.escapeHtml(typeLabel)}</span></td>
            <td><span class="${badgeClass}" style="padding:4px 8px; font-size:0.75rem; font-weight:700;">${badgeText}</span></td>
            <td style="font-weight:600; text-align:center;">${totalRows}</td>
            <td style="font-weight:600; text-align:center; color:${failCount > 0 ? '#ef4444' : '#15803d'};">${failCount}</td>
            <td style="text-align:center; font-weight:600; color:${failRate > 0 ? '#ef4444' : '#15803d'};">${failRate.toFixed(1)}%</td>
            <td style="font-size:0.78rem; color:#475569; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${this.escapeHtml(exampleText)}">${this.escapeHtml(exampleText)}</td>
            <td style="text-align:center;">
              <button type="button" class="btn-outline btn-sm-action" onclick="window.DataLens.deleteValidationRule('${r.id}')" style="color:#ef4444; border-color:#fca5a5; padding:3px 10px; font-size:0.75rem;">Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    },

    async addValidationRule() {
      const addBtn = document.getElementById('btn-add-rule');
      const nameInput = document.getElementById('rule-name-input');
      const colSelect = document.getElementById('rule-column-select');
      const typeSelect = document.getElementById('rule-type-select');
      const minInput = document.getElementById('rule-min-val');
      const maxInput = document.getElementById('rule-max-val');
      const allowedInput = document.getElementById('rule-allowed-val');

      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) {
        alert('Please enter a descriptive Rule Name.');
        if (nameInput) nameInput.focus();
        return;
      }

      const columnName = colSelect ? colSelect.value.trim() : '';
      if (!columnName) {
        alert('Please select a target column for the validation rule.');
        if (colSelect) colSelect.focus();
        return;
      }

      const ruleType = typeSelect ? typeSelect.value : 'NO_MISSING';
      let minValue = undefined;
      let maxValue = undefined;
      let allowedValues = [];

      if (ruleType === 'NUMERIC_RANGE') {
        const minStr = minInput ? minInput.value.trim() : '';
        const maxStr = maxInput ? maxInput.value.trim() : '';
        if (!minStr && !maxStr) {
          alert('Please enter at least one boundary (Min or Max) for Numeric Range.');
          if (minInput) minInput.focus();
          return;
        }
        if (minStr !== '') {
          minValue = Number(minStr);
          if (isNaN(minValue)) {
            alert('Minimum value must be a valid number.');
            if (minInput) minInput.focus();
            return;
          }
        }
        if (maxStr !== '') {
          maxValue = Number(maxStr);
          if (isNaN(maxValue)) {
            alert('Maximum value must be a valid number.');
            if (maxInput) maxInput.focus();
            return;
          }
        }
        if (minValue !== undefined && maxValue !== undefined && minValue > maxValue) {
          alert('Minimum value cannot be greater than Maximum value.');
          if (minInput) minInput.focus();
          return;
        }
      } else if (ruleType === 'ALLOWED_VALUES') {
        const allowedStr = allowedInput ? allowedInput.value.trim() : '';
        if (!allowedStr) {
          alert('Please provide one or more comma-separated allowed values (e.g. Pending, Completed, Shipped).');
          if (allowedInput) allowedInput.focus();
          return;
        }
        allowedValues = allowedStr.split(',').map(s => s.trim()).filter(Boolean);
        if (allowedValues.length === 0) {
          alert('Please provide at least one valid allowed value.');
          if (allowedInput) allowedInput.focus();
          return;
        }
      }

      // Prevent duplicate submissions
      if (addBtn) {
        addBtn.disabled = true;
        addBtn.dataset.origText = addBtn.innerHTML;
        addBtn.innerHTML = '<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.6s linear infinite; vertical-align:-2px; margin-right:6px;"></span>Adding Rule...';
      }

      try {
        const payload = {
          name,
          columnName,
          ruleType,
          minValue,
          maxValue,
          allowedValues,
          datasetId: this.activeDataset ? this.activeDataset.id : null,
          createdAt: Date.now()
        };

        const res = await this.fetchJson('/api/validation/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res || !res.success) {
          alert(res && res.message ? res.message : 'Failed to create validation rule. Please try again.');
          return;
        }

        // Reset form inputs on success
        if (nameInput) nameInput.value = '';
        if (colSelect) colSelect.value = '';
        if (minInput) minInput.value = '';
        if (maxInput) maxInput.value = '';
        if (allowedInput) allowedInput.value = '';
        if (typeSelect) {
          typeSelect.value = 'NO_MISSING';
          const rangeWrap = document.getElementById('rule-range-wrap');
          const allowedWrap = document.getElementById('rule-allowed-wrap');
          if (rangeWrap) rangeWrap.style.display = 'none';
          if (allowedWrap) allowedWrap.style.display = 'none';
        }

        await this.loadValidationRules();
      } catch (err) {
        console.error('Error adding validation rule:', err);
        alert('An unexpected error occurred while adding the validation rule.');
      } finally {
        if (addBtn) {
          addBtn.disabled = false;
          addBtn.innerHTML = addBtn.dataset.origText || '+ Add Validation Rule';
        }
      }
    },

    async deleteValidationRule(ruleId) {
      if (!ruleId) return;
      if (!confirm('Are you sure you want to delete this validation rule?')) {
        return;
      }
      try {
        const res = await this.fetchJson(`/api/validation/delete?id=${encodeURIComponent(ruleId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruleId })
        });
        if (res && res.success === false) {
          alert(res.message || 'Failed to delete rule.');
        }
      } catch (e) {
        console.error('Delete error:', e);
      }
      await this.loadValidationRules();
    },

    /**
     * SECTION: VERSION COMPARISON
     */
    async loadComparison() {
      const res = await this.fetchJson('/api/comparison/versions');
      if (!res || !res.versions) return;
      const baseSel = document.getElementById('compare-base-select');
      const targetSel = document.getElementById('compare-target-select');
      const badge = document.getElementById('cmp-lineage-badge');
      if (!baseSel || !targetSel) return;

      this.comparisonVersionsList = res.versions;

      // Group versions by datasetFamily
      const familyMap = new Map();
      res.versions.forEach(v => {
        const fam = v.datasetFamily || 'Other Datasets';
        if (!familyMap.has(fam)) familyMap.set(fam, []);
        familyMap.get(fam).push(v);
      });

      let html = '<option value="">Select Version</option>';
      for (const [fam, list] of familyMap.entries()) {
        const groupLabel = list.length > 1 ? `Lineage: ${fam}` : fam;
        html += `<optgroup label="${this.escapeHtml(groupLabel)}">`;
        list.forEach(v => {
          const typeTag = v.isCleanedVersion ? 'Cleaned' : 'Original';
          html += `<option value="${v.id}" data-family="${this.escapeHtml(v.datasetFamily || '')}" data-cleaned="${v.isCleanedVersion ? '1' : '0'}">${this.escapeHtml(v.name)} [${typeTag}] (${v.rowCount} rows, ${v.qualityScore}%)</option>`;
        });
        html += `</optgroup>`;
      }

      baseSel.innerHTML = html;
      targetSel.innerHTML = html;

      // Smart default pairing: try to find an original and cleaned version within the same family
      let defaultBaseId = null;
      let defaultTargetId = null;

      for (const [fam, list] of familyMap.entries()) {
        if (list.length >= 2) {
          const orig = list.find(v => !v.isCleanedVersion) || list[list.length - 1];
          const cleaned = list.find(v => v.isCleanedVersion) || list[0];
          if (orig && cleaned && orig.id !== cleaned.id) {
            defaultBaseId = orig.id;
            defaultTargetId = cleaned.id;
            break;
          }
        }
      }

      if (!defaultBaseId && res.versions.length >= 2) {
        defaultBaseId = res.versions[1].id;
        defaultTargetId = res.versions[0].id;
      }

      if (defaultBaseId) baseSel.value = defaultBaseId;
      if (defaultTargetId) targetSel.value = defaultTargetId;

      const updateBadge = () => {
        if (!badge) return;
        const bOpt = baseSel.selectedOptions[0];
        const tOpt = targetSel.selectedOptions[0];
        if (!bOpt || !tOpt || !bOpt.value || !tOpt.value) {
          badge.style.display = 'none';
          return;
        }
        badge.style.display = 'inline-block';
        const bFam = bOpt.getAttribute('data-family');
        const tFam = tOpt.getAttribute('data-family');
        const isSameFamily = bFam && tFam && bFam.toLowerCase() === tFam.toLowerCase();
        if (isSameFamily || bOpt.value === tOpt.value) {
          badge.textContent = 'Lineage Version (Same Dataset)';
          badge.style.background = '#dbeafe';
          badge.style.color = '#1e40af';
          badge.style.border = '1px solid #93c5fd';
        } else {
          badge.textContent = 'Cross-Dataset Comparison';
          badge.style.background = '#fef3c7';
          badge.style.color = '#92400e';
          badge.style.border = '1px solid #fde68a';
        }
      };

      baseSel.onchange = updateBadge;
      targetSel.onchange = updateBadge;
      updateBadge();
    },

    async runComparison() {
      const baseId = document.getElementById('compare-base-select')?.value;
      const targetId = document.getElementById('compare-target-select')?.value;
      const btn = document.getElementById('btn-run-comparison');
      if (!baseId || !targetId) {
        alert('Please select both a base version and a target version to compare.');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.6s linear infinite; vertical-align:-2px; margin-right:6px;"></span>Comparing...';
      }

      try {
        const res = await this.fetchJson(`/api/comparison?baseId=${baseId}&targetId=${targetId}`);
        if (!res || !res.success) {
          alert(res ? res.message : 'Failed to compare dataset versions.');
          return;
        }

        const resultsWrap = document.getElementById('comparison-results-wrap');
        const emptyState = document.getElementById('comparison-empty-state');
        if (resultsWrap) resultsWrap.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';

        // 1. Comparison Nature Banner
        const banner = document.getElementById('cmp-nature-banner');
        if (banner) {
          banner.style.display = 'block';
          if (res.comparisonType === 'LINEAGE') {
            banner.style.background = '#eff6ff';
            banner.style.border = '1px solid #bfdbfe';
            banner.style.color = '#1e40af';
            banner.innerHTML = `<strong>Dataset Lineage Match:</strong> ${this.escapeHtml(res.comparisonBannerMessage || 'Comparing versions within the same dataset lineage.')}`;
          } else {
            banner.style.background = '#fffbeb';
            banner.style.border = '1px solid #fef3c7';
            banner.style.color = '#92400e';
            banner.innerHTML = `<strong>Cross-Dataset Comparison:</strong> ${this.escapeHtml(res.comparisonBannerMessage || 'These two datasets originate from different domains.')}`;
          }
        }

        // 2. Executive Summary & Overall Verdict Card
        const verdictBadge = document.getElementById('cmp-overall-verdict-badge');
        const summaryTextEl = document.getElementById('cmp-summary-text');
        const pairBadge = document.getElementById('cmp-pair-badge');

        if (verdictBadge) {
          const v = res.overallVerdict || 'UNCHANGED';
          if (v === 'IMPROVED') {
            verdictBadge.textContent = 'QUALITY IMPROVED';
            verdictBadge.style.background = '#dcfce7';
            verdictBadge.style.color = '#15803d';
          } else if (v === 'DEGRADED') {
            verdictBadge.textContent = 'QUALITY DEGRADED';
            verdictBadge.style.background = '#fee2e2';
            verdictBadge.style.color = '#b91c1c';
          } else if (v === 'CROSS_DATASET') {
            verdictBadge.textContent = 'CROSS-DATASET';
            verdictBadge.style.background = '#fef3c7';
            verdictBadge.style.color = '#92400e';
          } else {
            verdictBadge.textContent = 'UNCHANGED HEALTH';
            verdictBadge.style.background = '#f1f5f9';
            verdictBadge.style.color = '#475569';
          }
        }

        if (summaryTextEl) summaryTextEl.textContent = res.summaryText || '';
        if (pairBadge) pairBadge.textContent = `${res.baseVersionName} → ${res.targetVersionName}`;

        const impsBox = document.getElementById('cmp-improvements-box');
        const impsList = document.getElementById('cmp-improvements-list');
        if (impsBox && impsList) {
          if (res.improvements && res.improvements.length > 0) {
            impsBox.style.display = 'block';
            impsList.innerHTML = res.improvements.map(msg => `<li>${this.escapeHtml(msg)}</li>`).join('');
          } else {
            impsBox.style.display = 'none';
          }
        }

        const detsBox = document.getElementById('cmp-deteriorations-box');
        const detsList = document.getElementById('cmp-deteriorations-list');
        if (detsBox && detsList) {
          if (res.deteriorations && res.deteriorations.length > 0) {
            detsBox.style.display = 'block';
            detsList.innerHTML = res.deteriorations.map(msg => `<li>${this.escapeHtml(msg)}</li>`).join('');
          } else {
            detsBox.style.display = 'none';
          }
        }

        const obsBox = document.getElementById('cmp-observations-box');
        const obsList = document.getElementById('cmp-observations-list');
        if (obsBox && obsList) {
          if (res.neutralObservations && res.neutralObservations.length > 0) {
            obsBox.style.display = 'block';
            obsList.innerHTML = res.neutralObservations.map(msg => `<li>${this.escapeHtml(msg)}</li>`).join('');
          } else {
            obsBox.style.display = 'none';
          }
        }

        // 3. 7-Metric Quality & Volume Comparison Matrix Table
        const metricsTbody = document.getElementById('cmp-metrics-tbody');
        if (metricsTbody) {
          const rows = [
            {
              dim: 'Row Count Volume',
              base: res.baseRowCount,
              target: res.targetRowCount,
              delta: `${res.rowCountDelta >= 0 ? '+' : ''}${res.rowCountDelta}`,
              badgeClass: 'badge-neutral',
              badgeText: `${res.rowCountDelta >= 0 ? '+' : ''}${res.rowCountDelta} rows`
            },
            {
              dim: 'Column Count (Schema)',
              base: res.baseColumnCount,
              target: res.targetColumnCount,
              delta: `${res.columnCountDelta >= 0 ? '+' : ''}${res.columnCountDelta}`,
              badgeClass: 'badge-neutral',
              badgeText: `${res.columnCountDelta >= 0 ? '+' : ''}${res.columnCountDelta} cols`
            },
            {
              dim: 'Missing / Null Values',
              base: res.baseMissingCount !== undefined ? res.baseMissingCount : '0',
              target: res.targetMissingCount !== undefined ? res.targetMissingCount : '0',
              delta: `${res.missingCountDelta >= 0 ? '+' : ''}${res.missingCountDelta || 0}`,
              badgeClass: res.missingCountDelta < 0 ? 'badge-good' : (res.missingCountDelta > 0 ? 'badge-critical' : 'badge-neutral'),
              badgeText: res.missingCountDelta < 0 ? `Improved (${res.missingCountDelta})` : (res.missingCountDelta > 0 ? `Regressed (+${res.missingCountDelta})` : 'No Change')
            },
            {
              dim: 'Duplicate Rows',
              base: res.baseDuplicateCount !== undefined ? res.baseDuplicateCount : '0',
              target: res.targetDuplicateCount !== undefined ? res.targetDuplicateCount : '0',
              delta: `${res.duplicatesDelta >= 0 ? '+' : ''}${res.duplicatesDelta || 0}`,
              badgeClass: res.duplicatesDelta < 0 ? 'badge-good' : (res.duplicatesDelta > 0 ? 'badge-critical' : 'badge-neutral'),
              badgeText: res.duplicatesDelta < 0 ? `Eliminated (${res.duplicatesDelta})` : (res.duplicatesDelta > 0 ? `Added (+${res.duplicatesDelta})` : 'Zero Duplicates')
            },
            {
              dim: 'Outlier Anomalies (Numeric)',
              base: res.baseOutlierCount !== undefined ? res.baseOutlierCount : '0',
              target: res.targetOutlierCount !== undefined ? res.targetOutlierCount : '0',
              delta: `${res.outlierCountDelta >= 0 ? '+' : ''}${res.outlierCountDelta || 0}`,
              badgeClass: (res.outlierCountDelta || 0) < 0 ? 'badge-good' : ((res.outlierCountDelta || 0) > 0 ? 'badge-critical' : 'badge-neutral'),
              badgeText: (res.outlierCountDelta || 0) < 0 ? `Reduced (${res.outlierCountDelta})` : ((res.outlierCountDelta || 0) > 0 ? `Increased (+${res.outlierCountDelta})` : 'No Shift')
            },
            {
              dim: 'Data Completeness Rate',
              base: `${res.baseCompletenessScore !== undefined ? res.baseCompletenessScore : 100}%`,
              target: `${res.targetCompletenessScore !== undefined ? res.targetCompletenessScore : 100}%`,
              delta: `${res.completenessScoreDelta >= 0 ? '+' : ''}${res.completenessScoreDelta || 0}%`,
              badgeClass: (res.completenessScoreDelta || 0) > 0 ? 'badge-good' : ((res.completenessScoreDelta || 0) < 0 ? 'badge-critical' : 'badge-neutral'),
              badgeText: (res.completenessScoreDelta || 0) > 0 ? `+${res.completenessScoreDelta}% Complete` : ((res.completenessScoreDelta || 0) < 0 ? `${res.completenessScoreDelta}% Drop` : '100% Retained')
            },
            {
              dim: 'Overall Quality Health Score',
              base: `${res.baseQualityScore}/100`,
              target: `${res.targetQualityScore}/100`,
              delta: `${res.qualityScoreDelta >= 0 ? '+' : ''}${res.qualityScoreDelta} pts`,
              badgeClass: res.qualityScoreDelta > 0 ? 'badge-good' : (res.qualityScoreDelta < 0 ? 'badge-critical' : 'badge-neutral'),
              badgeText: res.qualityScoreDelta > 0 ? `+${res.qualityScoreDelta} pts Boost` : (res.qualityScoreDelta < 0 ? `${res.qualityScoreDelta} pts Drop` : 'Equal Score')
            }
          ];

          metricsTbody.innerHTML = rows.map(r => `
            <tr>
              <td><strong>${r.dim}</strong></td>
              <td style="text-align:right; font-weight:600; color:#475569;">${r.base}</td>
              <td style="text-align:right; font-weight:700; color:var(--text-main);">${r.target}</td>
              <td style="text-align:right; font-weight:700; font-family:monospace;">${r.delta}</td>
              <td style="text-align:center;"><span class="badge ${r.badgeClass}">${r.badgeText}</span></td>
            </tr>
          `).join('');
        }

        // 4. Record-Level Turnover Analysis
        const turnoverText = document.getElementById('cmp-turnover-narrative');
        const kpiNetDelta = document.getElementById('cmp-kpi-net-delta');
        const kpiRetained = document.getElementById('cmp-kpi-retained');
        const kpiRemoved = document.getElementById('cmp-kpi-removed');
        const kpiAdded = document.getElementById('cmp-kpi-added');

        if (turnoverText) turnoverText.textContent = res.recordLevelExplanation || 'Record turnover traced via multi-attribute row hashing.';
        if (kpiNetDelta) {
          kpiNetDelta.textContent = `${res.rowCountDelta >= 0 ? '+' : ''}${res.rowCountDelta}`;
          kpiNetDelta.style.color = res.rowCountDelta < 0 ? '#b91c1c' : (res.rowCountDelta > 0 ? '#15803d' : '#475569');
        }
        if (kpiRetained) kpiRetained.textContent = res.rowsRetained !== undefined ? res.rowsRetained : res.targetRowCount;
        if (kpiRemoved) kpiRemoved.textContent = res.rowsRemoved !== undefined ? res.rowsRemoved : 0;
        if (kpiAdded) kpiAdded.textContent = res.rowsAdded !== undefined ? res.rowsAdded : 0;

        // 5. Visual Comparison Charts (Chart.js)
        this.renderComparisonCharts(res);

        // 6. Numeric Mean Shifts & Statistical Drift Table
        const shiftsMsg = document.getElementById('cmp-shifts-message');
        const shiftsTbody = document.getElementById('cmp-shifts-tbody');

        if (shiftsMsg) {
          if (res.numericComparisonMessage) {
            shiftsMsg.style.display = 'block';
            shiftsMsg.innerHTML = `<strong>Note:</strong> ${this.escapeHtml(res.numericComparisonMessage)}`;
          } else {
            shiftsMsg.style.display = 'none';
          }
        }

        if (shiftsTbody) {
          const list = res.numericComparisons || [];
          if (list.length === 0) {
            shiftsTbody.innerHTML = `<tr><td colspan="8" class="table-empty-row">${this.escapeHtml(res.numericComparisonMessage || 'No numeric column mean shifts detected.')}</td></tr>`;
          } else {
            shiftsTbody.innerHTML = list.map(item => {
              const bMean = item.baseMean !== null && item.baseMean !== undefined ? item.baseMean : '—';
              const tMean = item.targetMean !== null && item.targetMean !== undefined ? item.targetMean : '—';
              const shift = item.absoluteShift !== null && item.absoluteShift !== undefined ? `${item.absoluteShift >= 0 ? '+' : ''}${item.absoluteShift}` : '—';
              const pct = item.percentageChange !== null && item.percentageChange !== undefined ? `${item.percentageChange >= 0 ? '+' : ''}${item.percentageChange}%` : '—';
              const bMed = item.baseMedian !== null && item.baseMedian !== undefined ? item.baseMedian : '—';
              const tMed = item.targetMedian !== null && item.targetMedian !== undefined ? item.targetMedian : '—';

              let statusBadge = '';
              if (item.status === 'COMPARABLE') {
                statusBadge = `<span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:600; font-size:0.75rem;">COMPARABLE</span>`;
              } else if (item.status === 'TYPE_MISMATCH') {
                statusBadge = `<span style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:4px; font-weight:600; font-size:0.75rem;">TYPE MISMATCH</span>`;
              } else if (item.status === 'ABSENT_IN_TARGET') {
                statusBadge = `<span style="background:#fee2e2; color:#b91c1c; padding:2px 8px; border-radius:4px; font-weight:600; font-size:0.75rem;">DROPPED</span>`;
              } else if (item.status === 'ABSENT_IN_BASE') {
                statusBadge = `<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:4px; font-weight:600; font-size:0.75rem;">ADDED</span>`;
              }

              return `
                <tr>
                  <td><strong>${this.escapeHtml(item.columnName)}</strong></td>
                  <td style="text-align:right; font-family:monospace;">${bMean}</td>
                  <td style="text-align:right; font-family:monospace; font-weight:700;">${tMean}</td>
                  <td style="text-align:right; font-family:monospace; font-weight:600; color:${(item.absoluteShift || 0) > 0 ? '#16a34a' : ((item.absoluteShift || 0) < 0 ? '#dc2626' : '#64748b')}">${shift}</td>
                  <td style="text-align:right; font-family:monospace; font-weight:600;">${pct}</td>
                  <td style="text-align:right; font-family:monospace; color:#64748b;">${bMed}</td>
                  <td style="text-align:right; font-family:monospace; color:#64748b;">${tMed}</td>
                  <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                      ${statusBadge}
                      <span style="font-size:0.78rem; color:#475569;">${this.escapeHtml(item.explanation || '')}</span>
                    </div>
                  </td>
                </tr>
              `;
            }).join('');
          }
        }

        // 7. Schema Evolution Table
        const retainedCnt = document.getElementById('cmp-schema-retained-count');
        const addedCnt = document.getElementById('cmp-schema-added-count');
        const removedCnt = document.getElementById('cmp-schema-removed-count');
        const schemaTbody = document.getElementById('cmp-schema-tbody');

        const schemaList = res.schemaTable || [];
        const nRetained = schemaList.filter(s => s.status === 'RETAINED' || s.status === 'TYPE_CHANGED').length;
        const nAdded = schemaList.filter(s => s.status === 'ADDED').length;
        const nRemoved = schemaList.filter(s => s.status === 'REMOVED').length;

        if (retainedCnt) retainedCnt.textContent = `${nRetained} Retained`;
        if (addedCnt) addedCnt.textContent = `${nAdded} Added`;
        if (removedCnt) removedCnt.textContent = `${nRemoved} Removed`;

        if (schemaTbody) {
          if (schemaList.length === 0) {
            schemaTbody.innerHTML = '<tr><td colspan="4" class="table-empty-row">No schema columns recorded.</td></tr>';
          } else {
            schemaTbody.innerHTML = schemaList.map(item => {
              let badgeHtml = '';
              if (item.status === 'RETAINED') {
                badgeHtml = '<span style="background:#f1f5f9; color:#475569; padding:3px 10px; border-radius:4px; font-weight:600; font-size:0.75rem;">RETAINED</span>';
              } else if (item.status === 'ADDED') {
                badgeHtml = '<span style="background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:4px; font-weight:600; font-size:0.75rem;">+ ADDED</span>';
              } else if (item.status === 'REMOVED') {
                badgeHtml = '<span style="background:#fee2e2; color:#b91c1c; padding:3px 10px; border-radius:4px; font-weight:600; font-size:0.75rem;">- REMOVED</span>';
              } else if (item.status === 'TYPE_CHANGED') {
                badgeHtml = '<span style="background:#fef3c7; color:#b45309; padding:3px 10px; border-radius:4px; font-weight:600; font-size:0.75rem;">TYPE CHANGED</span>';
              }
              return `
                <tr>
                  <td><strong>${this.escapeHtml(item.columnName)}</strong></td>
                  <td><span style="font-size:0.78rem; font-family:monospace; color:#64748b;">${this.escapeHtml(item.baseType)}</span></td>
                  <td><span style="font-size:0.78rem; font-family:monospace; color:var(--text-main); font-weight:600;">${this.escapeHtml(item.targetType)}</span></td>
                  <td style="text-align:center;">${badgeHtml}</td>
                </tr>
              `;
            }).join('');
          }
        }

      } catch (err) {
        console.error('Comparison error:', err);
        alert('An unexpected error occurred while executing the comparison.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Compare Versions';
        }
      }
    },

    renderComparisonCharts(res) {
      if (typeof Chart === 'undefined') return;

      // 1. Quality Dimensions Bar Chart
      const qCanvas = document.getElementById('cmp-quality-chart');
      if (qCanvas) {
        if (window.cmpQualityChartInstance) {
          window.cmpQualityChartInstance.destroy();
        }
        const ctx = qCanvas.getContext('2d');
        window.cmpQualityChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['Quality Score', 'Completeness (%)', 'Uniqueness (%)'],
            datasets: [
              {
                label: `Base: ${res.baseVersionName}`,
                data: [res.baseQualityScore, res.baseCompletenessScore, res.baseUniquenessScore],
                backgroundColor: 'rgba(148, 163, 184, 0.75)',
                borderColor: '#64748b',
                borderWidth: 1.5,
                borderRadius: 4
              },
              {
                label: `Target: ${res.targetVersionName}`,
                data: [res.targetQualityScore, res.targetCompletenessScore, res.targetUniquenessScore],
                backgroundColor: 'rgba(2, 132, 199, 0.85)',
                borderColor: '#0284c7',
                borderWidth: 1.5,
                borderRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                ticks: { stepSize: 20 }
              }
            },
            plugins: {
              legend: {
                position: 'top',
                labels: { boxWidth: 12, font: { size: 11 } }
              }
            }
          }
        });
      }

      // 2. Numeric Column Mean Shifts Grouped Bar Chart
      const shiftsCanvas = document.getElementById('cmp-shifts-chart');
      const shiftsWrap = document.getElementById('cmp-shifts-chart-wrap');
      const shiftsFallback = document.getElementById('cmp-shifts-chart-fallback');

      if (window.cmpShiftsChartInstance) {
        window.cmpShiftsChartInstance.destroy();
        window.cmpShiftsChartInstance = null;
      }

      const comparableItems = (res.numericComparisons || []).filter(i => i.status === 'COMPARABLE' && i.baseMean !== null && i.targetMean !== null);

      if (comparableItems.length > 0 && shiftsCanvas) {
        if (shiftsWrap) shiftsWrap.style.display = 'block';
        if (shiftsFallback) shiftsFallback.style.display = 'none';

        const ctx = shiftsCanvas.getContext('2d');
        window.cmpShiftsChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: comparableItems.map(i => i.columnName),
            datasets: [
              {
                label: `Base Mean`,
                data: comparableItems.map(i => i.baseMean),
                backgroundColor: 'rgba(148, 163, 184, 0.75)',
                borderColor: '#64748b',
                borderWidth: 1.5,
                borderRadius: 4
              },
              {
                label: `Target Mean`,
                data: comparableItems.map(i => i.targetMean),
                backgroundColor: 'rgba(16, 185, 129, 0.85)',
                borderColor: '#10b981',
                borderWidth: 1.5,
                borderRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: false
              }
            },
            plugins: {
              legend: {
                position: 'top',
                labels: { boxWidth: 12, font: { size: 11 } }
              }
            }
          }
        });
      } else {
        if (shiftsWrap) shiftsWrap.style.display = 'none';
        if (shiftsFallback) {
          shiftsFallback.style.display = 'flex';
          shiftsFallback.textContent = res.comparisonType === 'CROSS_DATASET'
            ? 'No shared numeric columns exist between these distinct datasets to render mean shifts.'
            : 'No continuous numeric attributes found in these dataset versions.';
        }
      }
    },

    /**
     * SECTION: REPORTS & EXPORTS
     */
    async loadReports() {
      const nameEl = document.getElementById('reports-dataset-name');
      if (nameEl) {
        nameEl.textContent = this.activeDataset ? (this.activeDataset.name || this.activeDataset.originalName || 'Active Dataset') : 'No active dataset';
      }
    },

    /**
     * Downloads an export report as a Blob via authenticated fetch
     * @param {string} endpointUrl 
     * @param {string} defaultFilename 
     */
    async downloadFile(endpointUrl, defaultFilename) {
      try {
        const token = sessionStorage.getItem('datalens_session_id') || localStorage.getItem('datalens_session_id');
        const headers = token ? { 'Authorization': 'Bearer ' + token, 'X-Session-ID': token } : {};
        let finalUrl = this.getApiUrl(endpointUrl);
        if (token) {
          finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token) + '&sid=' + encodeURIComponent(token);
        }

        const res = await fetch(finalUrl, { headers, credentials: 'include' });
        if (!res.ok) {
          let errText = 'Failed to generate report.';
          try {
            const errJson = await res.json();
            if (errJson && errJson.message) errText = errJson.message;
          } catch (e) {
            errText = `HTTP Error ${res.status}: ${res.statusText}`;
          }
          alert(errText);
          return;
        }

        const blob = await res.blob();
        let filename = defaultFilename;
        const disposition = res.headers.get('content-disposition');
        if (disposition && disposition.includes('filename=')) {
          const match = disposition.match(/filename="?([^";]+)"?/);
          if (match && match[1]) filename = match[1].trim();
        }

        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
      } catch (err) {
        alert('Download error: ' + (err.message || 'Unable to connect to server.'));
      }
    }
  };

  // DOMContentLoaded: attach navigation and controls
  document.addEventListener('DOMContentLoaded', () => {
    // Extract session token from URL if passed from login redirect
    const urlParams = new URLSearchParams(window.location.search);
    const sidParam = urlParams.get('sid') || urlParams.get('token') || urlParams.get('session_id');
    if (sidParam) {
      sessionStorage.setItem('datalens_session_id', sidParam);
      localStorage.setItem('datalens_session_id', sidParam);
      // Clean address bar so token does not remain in URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const navButtons = document.querySelectorAll('.nav-item');
    const pageSections = document.querySelectorAll('.page-section');
    const pageTitleElement = document.getElementById('page-title');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const sidebar = document.getElementById('sidebar');

    const pageTitles = {
      overview: 'Overview',
      preview: 'Data Preview',
      quality: 'Data Quality',
      statistics: 'Statistics',
      explorer: 'Data Explorer',
      cleaning: 'Data Cleaning Studio',
      visualization: 'Visualization',
      validation: 'Validation Rules Studio',
      comparison: 'Version Comparison Studio',
      insights: 'Insights',
      reports: 'Executive Reports & Exports',
      history: 'History'
    };

    function navigateTo(sectionId) {
      if (!sectionId) return;

      navButtons.forEach(btn => {
        if (btn.dataset.section === sectionId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      pageSections.forEach(section => {
        if (section.id === `section-${sectionId}`) {
          section.classList.add('active');
        } else {
          section.classList.remove('active');
        }
      });

      if (pageTitleElement && pageTitles[sectionId]) {
        pageTitleElement.textContent = pageTitles[sectionId];
      }

      if (window.innerWidth <= 1024 && sidebar) {
        sidebar.classList.remove('mobile-open');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) backdrop.classList.remove('active');
      }

      window.DataLens.refreshSection(sectionId);
    }

    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const section = btn.dataset.section;
        if (section) {
          navigateTo(section);
        }
      });
    });

    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    function closeSidebarDrawer() {
      if (sidebar) sidebar.classList.remove('mobile-open');
      if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    }

    function openSidebarDrawer() {
      if (sidebar) sidebar.classList.add('mobile-open');
      if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
    }

    if (menuToggleBtn && sidebar) {
      menuToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (sidebar.classList.contains('mobile-open')) {
          closeSidebarDrawer();
        } else {
          openSidebarDrawer();
        }
      });

      if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => {
          closeSidebarDrawer();
        });
      }

      document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024 && sidebar.classList.contains('mobile-open')) {
          if (!sidebar.contains(e.target) && !menuToggleBtn.contains(e.target)) {
            closeSidebarDrawer();
          }
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
          closeSidebarDrawer();
        }
      });
    }

    // SECTION 12 History search filter and refresh bindings
    const histSearchInput = document.getElementById('history-search-input');
    if (histSearchInput) {
      histSearchInput.addEventListener('input', (e) => {
        const query = (e.target.value || '').trim().toLowerCase();
        if (!window.DataLens.historyCache) return;
        if (!query) {
          window.DataLens.renderHistoryTable(window.DataLens.historyCache);
        } else {
          const filtered = window.DataLens.historyCache.filter(item => {
            const name = (item.fileName || item.originalName || '').toLowerCase();
            const idStr = String(item.id);
            return name.includes(query) || idStr.includes(query);
          });
          window.DataLens.renderHistoryTable(filtered);
        }
      });
    }

    const btnRefreshHistoryTop = document.getElementById('btn-refresh-history-top');
    if (btnRefreshHistoryTop) {
      btnRefreshHistoryTop.addEventListener('click', () => {
        window.DataLens.loadHistory();
      });
    }

    // SECTION 2 Preview pagination & search events
    const previewSize = document.getElementById('preview-page-size');
    if (previewSize) {
      previewSize.addEventListener('change', () => {
        window.DataLens.loadPreview(1);
      });
    }

    const previewSearchBtn = document.getElementById('preview-search-btn');
    const previewSearchInput = document.getElementById('preview-search-input');
    const previewSearchReset = document.getElementById('preview-search-reset');

    if (previewSearchBtn) {
      previewSearchBtn.addEventListener('click', () => {
        window.DataLens.loadPreview(1);
      });
    }

    if (previewSearchInput) {
      previewSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.DataLens.loadPreview(1);
        }
      });
    }

    if (previewSearchReset) {
      previewSearchReset.addEventListener('click', () => {
        if (previewSearchInput) previewSearchInput.value = '';
        window.DataLens.loadPreview(1);
      });
    }

    const prevBtn = document.getElementById('preview-btn-prev');
    const nextBtn = document.getElementById('preview-btn-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (window.DataLens.previewState.page > 1) {
          window.DataLens.loadPreview(window.DataLens.previewState.page - 1);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        window.DataLens.loadPreview(window.DataLens.previewState.page + 1);
      });
    }

    // Quick Load Sample Datasets buttons
    document.querySelectorAll('.sample-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sample = btn.dataset.sample;
        if (sample) window.DataLens.loadSampleDataset(sample);
      });
    });

    // Cleaning Studio event bindings
    document.getElementById('btn-stage-missing')?.addEventListener('click', () => window.DataLens.stageCleaningOp('missing'));
    document.getElementById('btn-stage-duplicates')?.addEventListener('click', () => window.DataLens.stageCleaningOp('duplicates'));
    document.getElementById('btn-stage-outliers')?.addEventListener('click', () => window.DataLens.stageCleaningOp('outliers'));
    document.getElementById('btn-stage-text')?.addEventListener('click', () => window.DataLens.stageCleaningOp('text'));
    document.getElementById('btn-stage-column')?.addEventListener('click', () => window.DataLens.stageCleaningOp('column'));
    document.getElementById('btn-clear-pipeline')?.addEventListener('click', () => window.DataLens.clearPipeline());
    document.getElementById('btn-preview-pipeline')?.addEventListener('click', () => window.DataLens.previewCleaning());
    document.querySelectorAll('#btn-apply-pipeline').forEach(b => b.addEventListener('click', () => window.DataLens.applyCleaning()));
    document.getElementById('btn-view-after')?.addEventListener('click', () => { window.DataLens.cleaningPage = 1; window.DataLens.renderCleaningPreviewTable('after'); });
    document.getElementById('btn-view-before')?.addEventListener('click', () => { window.DataLens.cleaningPage = 1; window.DataLens.renderCleaningPreviewTable('before'); });
    document.getElementById('btn-view-diff')?.addEventListener('click', () => { window.DataLens.cleaningPage = 1; window.DataLens.renderCleaningPreviewTable('diff'); });
    document.getElementById('btn-download-cleaned-csv')?.addEventListener('click', () => window.DataLens.downloadCleanedCsv());
    document.getElementById('cleaning-page-size')?.addEventListener('change', () => {
      window.DataLens.cleaningPage = 1;
      window.DataLens.renderCleaningPreviewTable(window.DataLens.cleaningViewMode || 'after');
    });
    document.getElementById('cleaning-btn-prev')?.addEventListener('click', () => {
      if ((window.DataLens.cleaningPage || 1) > 1) {
        window.DataLens.cleaningPage--;
        window.DataLens.renderCleaningPreviewTable(window.DataLens.cleaningViewMode || 'after');
      }
    });
    document.getElementById('cleaning-btn-next')?.addEventListener('click', () => {
      window.DataLens.cleaningPage = (window.DataLens.cleaningPage || 1) + 1;
      window.DataLens.renderCleaningPreviewTable(window.DataLens.cleaningViewMode || 'after');
    });

    // Cleaning option toggle handlers
    document.getElementById('clean-missing-strategy')?.addEventListener('change', (e) => {
      const customWrap = document.getElementById('clean-missing-custom-wrap');
      if (customWrap) customWrap.style.display = (e.target.value === 'impute_constant') ? 'block' : 'none';
    });

    document.getElementById('clean-col-action')?.addEventListener('change', (e) => {
      const renameWrap = document.getElementById('clean-rename-wrap');
      if (renameWrap) renameWrap.style.display = (e.target.value === 'rename') ? 'block' : 'none';
    });

    // Validation Rules event bindings
    document.getElementById('btn-add-rule')?.addEventListener('click', () => window.DataLens.addValidationRule());
    document.getElementById('btn-export-validation-csv')?.addEventListener('click', () => {
      window.DataLens.downloadFile('/api/validation/export', 'validation_results.csv');
    });

    document.getElementById('rule-type-select')?.addEventListener('change', (e) => {
      const type = e.target.value;
      const rangeWrap = document.getElementById('rule-range-wrap');
      const allowedWrap = document.getElementById('rule-allowed-wrap');
      if (rangeWrap) rangeWrap.style.display = (type === 'NUMERIC_RANGE') ? 'block' : 'none';
      if (allowedWrap) allowedWrap.style.display = (type === 'ALLOWED_VALUES') ? 'block' : 'none';
    });

    // Comparison Studio event bindings
    document.getElementById('btn-run-comparison')?.addEventListener('click', () => window.DataLens.runComparison());

    // Reports Studio event bindings
    document.getElementById('btn-export-executive-pdf')?.addEventListener('click', () => {
      if (!window.DataLens.activeDataset) {
        alert('No active dataset loaded. Please upload or activate a dataset first.');
        return;
      }
      const rawName = window.DataLens.activeDataset.name || window.DataLens.activeDataset.originalName || 'dataset';
      const cleanName = rawName.replace(/\.csv$/i, '');
      window.DataLens.downloadFile('/api/report/executive?format=pdf', `DataLens_Executive_Report_${cleanName}.pdf`);
    });

    document.getElementById('btn-export-executive')?.addEventListener('click', () => {
      if (!window.DataLens.activeDataset) {
        alert('No active dataset loaded. Please upload or activate a dataset first.');
        return;
      }
      const token = sessionStorage.getItem('datalens_session_id') || localStorage.getItem('datalens_session_id');
      let url = window.DataLens.getApiUrl('/api/report/executive?format=html');
      if (token) {
        url += '&token=' + encodeURIComponent(token) + '&sid=' + encodeURIComponent(token);
      }
      window.open(url, '_blank');
    });

    document.getElementById('btn-export-dictionary')?.addEventListener('click', () => {
      if (!window.DataLens.activeDataset) {
        alert('No active dataset loaded. Please upload or activate a dataset first.');
        return;
      }
      const rawName = window.DataLens.activeDataset.name || window.DataLens.activeDataset.originalName || 'dataset.csv';
      window.DataLens.downloadFile('/api/report/dictionary', `data_dictionary_${rawName}`);
    });

    document.getElementById('btn-export-quality-json')?.addEventListener('click', () => {
      if (!window.DataLens.activeDataset) {
        alert('No active dataset loaded. Please upload or activate a dataset first.');
        return;
      }
      const rawName = (window.DataLens.activeDataset.name || window.DataLens.activeDataset.originalName || 'dataset').replace(/\.csv$/i, '');
      window.DataLens.downloadFile('/api/report/quality-json', `quality_audit_${rawName}.json`);
    });

    document.getElementById('btn-export-dataset-csv')?.addEventListener('click', () => {
      if (!window.DataLens.activeDataset) {
        alert('No active dataset loaded. Please upload or activate a dataset first.');
        return;
      }
      const rawName = window.DataLens.activeDataset.name || window.DataLens.activeDataset.originalName || 'dataset.csv';
      window.DataLens.downloadFile('/api/report/dataset', `dataset_${rawName}`);
    });

    document.getElementById('btn-export-audit-csv')?.addEventListener('click', () => {
      window.DataLens.downloadFile('/api/report/audit-trail', 'audit_trail_log.csv');
    });

    // SECTION 7 Copy observations button
    const copyInsightsBtn = document.getElementById('btn-copy-insights');
    const copyFeedbackMsg = document.getElementById('copy-feedback-msg');
    if (copyInsightsBtn) {
      copyInsightsBtn.addEventListener('click', () => {
        const listEl = document.getElementById('insights-list-container');
        if (!listEl) return;
        const text = listEl.innerText || '';
        navigator.clipboard.writeText(text).then(() => {
          if (copyFeedbackMsg) {
            copyFeedbackMsg.style.display = 'inline';
            setTimeout(() => {
              copyFeedbackMsg.style.display = 'none';
            }, 2500);
          }
        });
      });
    }

    // Logout button bindings
    const btnHeaderLogout = document.getElementById('btn-header-logout');
    if (btnHeaderLogout) {
      btnHeaderLogout.addEventListener('click', () => {
        window.DataLens.handleLogout();
      });
    }

    const btnSidebarLogout = document.getElementById('sidebar-logout-btn');
    if (btnSidebarLogout) {
      btnSidebarLogout.addEventListener('click', () => {
        window.DataLens.handleLogout();
      });
    }

    // Check authentication first. If authenticated, load overview data.
    window.DataLens.checkAuth().then((isAuth) => {
      if (isAuth) {
        window.DataLens.loadOverview();
      }
    });
  });
})();
