/**
 * DataLens — Data Explorer Controller
 * Phase 4: Real-time dynamic CSV filtering, multi-condition query engine, numeric type-aware matching & record viewer
 */

(function () {
  'use strict';

  window.DataLensExplorer = {
    columns: [],
    state: {
      page: 1,
      pageSize: 25,
      search: '',
      sortColumn: '',
      sortOrder: 'asc',
      column: '',
      operator: 'equals',
      value: ''
    },

    /**
     * Populate column selector and sort column dropdowns with active dataset columns
     * @param {Array<{name: string, dataType: string}>} columns
     */
    populateColumns(columns) {
      this.columns = columns || [];
      const colSelect = document.getElementById('filter-column');
      const sortSelect = document.getElementById('explorer-sort-column');

      if (colSelect) {
        const currentVal = colSelect.value;
        colSelect.innerHTML = '<option value="">Select Column</option>' +
          this.columns.map(c => {
            const name = typeof c === 'string' ? c : (c.name || c.columnName || '');
            const type = typeof c === 'object' && (c.dataType || c.type) ? ` (${c.dataType || c.type})` : '';
            return `<option value="${window.DataLens.escapeHtml(name)}">${window.DataLens.escapeHtml(name)}${type}</option>`;
          }).join('');

        if (this.columns.some(c => (typeof c === 'string' ? c : c.name) === currentVal)) {
          colSelect.value = currentVal;
        }
      }

      if (sortSelect) {
        const currentSort = sortSelect.value;
        sortSelect.innerHTML = '<option value="">Default Order</option>' +
          this.columns.map(c => {
            const name = typeof c === 'string' ? c : (c.name || c.columnName || '');
            return `<option value="${window.DataLens.escapeHtml(name)}">${window.DataLens.escapeHtml(name)}</option>`;
          }).join('');

        if (this.columns.some(c => (typeof c === 'string' ? c : c.name) === currentSort)) {
          sortSelect.value = currentSort;
        }
      }
    },

    /**
     * Helper to determine if a selected column name is numeric
     * @param {string} colName 
     * @returns {boolean}
     */
    isColumnNumeric(colName) {
      if (!colName) return false;
      const found = this.columns.find(c => {
        const n = typeof c === 'string' ? c : (c.name || c.columnName || '');
        return n.toLowerCase() === colName.toLowerCase();
      });
      if (found && typeof found === 'object') {
        const t = (found.dataType || found.type || '').toUpperCase();
        return t === 'NUMERIC' || t === 'NUMBER' || t === 'DOUBLE' || t === 'INTEGER';
      }
      return false;
    },

    /**
     * Builds URLSearchParams for current filter query
     * @param {number} [pageOverride]
     * @returns {URLSearchParams}
     */
    buildQueryParams(pageOverride) {
      const colSelect = document.getElementById('filter-column');
      const opSelect = document.getElementById('filter-operator');
      const valInput = document.getElementById('filter-value');
      const searchInput = document.getElementById('explorer-search-input');
      const sortColSelect = document.getElementById('explorer-sort-column');
      const sortOrderSelect = document.getElementById('explorer-sort-order');
      const pageSizeSelect = document.getElementById('explorer-page-size');

      const column = colSelect ? colSelect.value.trim() : '';
      const operator = opSelect ? opSelect.value : 'equals';
      const value = valInput ? valInput.value.trim() : '';
      const search = searchInput ? searchInput.value.trim() : '';
      const sortColumn = sortColSelect ? sortColSelect.value.trim() : '';
      const sortOrder = sortOrderSelect ? sortOrderSelect.value : 'asc';
      const pageSize = pageSizeSelect ? parseInt(pageSizeSelect.value) || 25 : 25;
      const page = pageOverride !== undefined ? pageOverride : (this.state.page || 1);

      this.state = {
        page,
        pageSize,
        search,
        sortColumn,
        sortOrder,
        column,
        operator,
        value
      };

      const q = new URLSearchParams();
      if (column) q.append('column', column);
      if (operator) q.append('operator', operator);
      if (value !== '') q.append('value', value);
      if (search) q.append('search', search);
      if (sortColumn) q.append('sortColumn', sortColumn);
      if (sortOrder) q.append('sortOrder', sortOrder);
      q.append('page', String(page));
      q.append('pageSize', String(pageSize));

      return q;
    },

    /**
     * Executes filter query on the backend API (/api/filter)
     * @param {number} [pageOverride]
     */
    async applyFilter(pageOverride) {
      const thead = document.getElementById('explorer-thead');
      const tbody = document.getElementById('explorer-tbody');
      const statusBadge = document.getElementById('filter-status-badge');
      const paginationBar = document.getElementById('explorer-pagination-bar');
      const pageInfo = document.getElementById('explorer-page-info');
      const btnPrev = document.getElementById('btn-explorer-prev');
      const btnNext = document.getElementById('btn-explorer-next');

      const queryParams = this.buildQueryParams(pageOverride);
      const data = await window.DataLens.fetchJson(`/api/filter?${queryParams.toString()}`);
      if (!data) return;

      if (!data.hasDataset || !data.columns || data.columns.length === 0) {
        if (thead) thead.innerHTML = '<tr><th>Filtered Records</th></tr>';
        if (tbody) tbody.innerHTML = '<tr><td class="table-empty-row">Upload a CSV to explore your data</td></tr>';
        if (statusBadge) statusBadge.style.display = 'none';
        if (paginationBar) paginationBar.style.display = 'none';
        return;
      }

      // Populate column options if empty
      if (this.columns.length === 0 && data.columns) {
        this.populateColumns(data.columns);
      }

      // 1. Render Table Headers
      if (thead) {
        const headerCells = data.columns.map(col => {
          const colName = typeof col === 'string' ? col : (col.name || col.columnName || '');
          const colType = typeof col === 'object' && (col.dataType || col.type) ? ` <span style="font-weight:400; font-size:0.75rem; color:#64748b;">(${col.dataType || col.type})</span>` : '';
          return `<th>${window.DataLens.escapeHtml(colName)}${colType}</th>`;
        }).join('');
        thead.innerHTML = `<tr><th style="width:40px; text-align:center;">#</th>${headerCells}</tr>`;
      }

      // 2. Render Table Rows
      if (tbody) {
        if (!data.rows || data.rows.length === 0) {
          const reason = data.validationError
            ? data.validationError
            : `No rows matched filter criteria: "${this.state.column || 'All Columns'}" ${this.state.operator} "${this.state.value}".`;
          tbody.innerHTML = `<tr><td colspan="${data.columns.length + 1}" class="table-empty-row" style="padding: 32px 16px; text-align: center; color: #64748b;">${window.DataLens.escapeHtml(reason)}</td></tr>`;
        } else {
          const curPage = parseInt(data.page, 10) || parseInt(this.state.page, 10) || 1;
          const pSize = parseInt(data.pageSize, 10) || parseInt(this.state.pageSize, 10) || 25;
          const startNum = ((curPage - 1) * pSize) + 1;
          tbody.innerHTML = data.rows.map((row, idx) => {
            const cells = data.columns.map((col, colIdx) => {
              const colName = typeof col === 'string' ? col : (col.name || col.columnName || '');
              let cellVal = '';
              if (Array.isArray(row)) {
                cellVal = row[colIdx] !== undefined ? row[colIdx] : '';
              } else if (row && typeof row === 'object') {
                cellVal = row[colName] !== undefined ? row[colName] : (row[colIdx] !== undefined ? row[colIdx] : '');
              }
              return `<td>${window.DataLens.escapeHtml(cellVal)}</td>`;
            }).join('');
            const rowNumber = isNaN(startNum + idx) ? (idx + 1) : (startNum + idx);
            return `<tr><td style="text-align:center; font-weight:600; color:#94a3b8; font-size:0.75rem;">${rowNumber}</td>${cells}</tr>`;
          }).join('');
        }
      }

      // 3. Render Status Badge
      if (statusBadge) {
        if (data.validationError) {
          statusBadge.style.display = 'flex';
          statusBadge.style.background = '#fef2f2';
          statusBadge.style.borderColor = '#fca5a5';
          statusBadge.style.color = '#991b1b';
          statusBadge.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px; height:16px; margin-right:8px; flex-shrink:0;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span><strong>Validation Error:</strong> ${window.DataLens.escapeHtml(data.validationError)}</span>
          `;
        } else if (this.state.column || this.state.value || this.state.search) {
          statusBadge.style.display = 'flex';
          statusBadge.style.background = '#f0fdf4';
          statusBadge.style.borderColor = '#bbf7d0';
          statusBadge.style.color = '#166534';
          const pct = data.totalRows > 0 ? ((data.matchedRows / data.totalRows) * 100).toFixed(1) : 0;
          const dispCount = data.rows ? data.rows.length : 0;
          const curP = parseInt(data.page, 10) || parseInt(this.state.page, 10) || 1;
          const totP = parseInt(data.totalPages, 10) || 1;
          statusBadge.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px; height:16px; margin-right:8px; flex-shrink:0;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Filter Active: Matched <strong>${data.matchedRows}</strong> of <strong>${data.totalRows}</strong> rows (${pct}%). Displaying page <strong>${curP}</strong> of <strong>${totP}</strong> (${dispCount} records).</span>
          `;
        } else {
          statusBadge.style.display = 'none';
        }
      }

      // 4. Render Pagination Bar
      if (paginationBar && pageInfo && btnPrev && btnNext) {
        if (data.matchedRows > 0) {
          paginationBar.style.display = 'flex';
          const curPage = parseInt(data.page, 10) || parseInt(this.state.page, 10) || 1;
          const pSize = parseInt(data.pageSize, 10) || parseInt(this.state.pageSize, 10) || 25;
          const totPages = parseInt(data.totalPages, 10) || Math.max(1, Math.ceil(data.matchedRows / pSize));
          const start = ((curPage - 1) * pSize) + 1;
          const end = Math.min(start + (data.rows ? data.rows.length : 0) - 1, data.matchedRows);
          pageInfo.textContent = `Showing rows ${start}-${end} of ${data.matchedRows} (Page ${curPage} of ${totPages})`;
          btnPrev.disabled = (curPage <= 1);
          btnNext.disabled = (curPage >= totPages);
        } else {
          paginationBar.style.display = 'none';
        }
      }
    },

    /**
     * Clears all filter inputs, search, sort, and reloads full dataset from page 1
     */
    async clearFilter() {
      const colSelect = document.getElementById('filter-column');
      const opSelect = document.getElementById('filter-operator');
      const valInput = document.getElementById('filter-value');
      const searchInput = document.getElementById('explorer-search-input');
      const sortColSelect = document.getElementById('explorer-sort-column');
      const sortOrderSelect = document.getElementById('explorer-sort-order');
      const statusBadge = document.getElementById('filter-status-badge');

      if (colSelect) colSelect.value = '';
      if (opSelect) opSelect.value = 'equals';
      if (valInput) {
        valInput.value = '';
        valInput.disabled = false;
        valInput.placeholder = 'Enter filter value...';
      }
      if (searchInput) searchInput.value = '';
      if (sortColSelect) sortColSelect.value = '';
      if (sortOrderSelect) sortOrderSelect.value = 'asc';
      if (statusBadge) statusBadge.style.display = 'none';

      this.state.page = 1;
      await this.applyFilter(1);
    },

    /**
     * Exports the current filtered records as a CSV download
     */
    exportFilteredCSV() {
      const queryParams = this.buildQueryParams(1);
      queryParams.append('export', 'true');
      const exportUrl = window.DataLens.getApiUrl(`/api/filter?${queryParams.toString()}`);
      window.location.href = exportUrl;
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const applyFilterBtn = document.getElementById('btn-apply-filter');
    const clearFilterBtn = document.getElementById('btn-clear-filter');
    const exportCsvBtn = document.getElementById('btn-export-filtered-csv');
    const filterColSelect = document.getElementById('filter-column');
    const filterOpSelect = document.getElementById('filter-operator');
    const filterValInput = document.getElementById('filter-value');
    const searchInput = document.getElementById('explorer-search-input');
    const sortColSelect = document.getElementById('explorer-sort-column');
    const sortOrderSelect = document.getElementById('explorer-sort-order');
    const pageSizeSelect = document.getElementById('explorer-page-size');
    const btnPrev = document.getElementById('btn-explorer-prev');
    const btnNext = document.getElementById('btn-explorer-next');

    if (applyFilterBtn) {
      applyFilterBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.DataLensExplorer.applyFilter(1);
      });
    }

    if (clearFilterBtn) {
      clearFilterBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.DataLensExplorer.clearFilter();
      });
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.DataLensExplorer.exportFilteredCSV();
      });
    }

    if (filterValInput) {
      filterValInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.DataLensExplorer.applyFilter(1);
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.DataLensExplorer.applyFilter(1);
        }
      });
      // Also apply search on input change with subtle debounce
      let searchTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          window.DataLensExplorer.applyFilter(1);
        }, 350);
      });
    }

    if (filterColSelect) {
      filterColSelect.addEventListener('change', () => {
        const colName = filterColSelect.value.trim();
        const isNum = window.DataLensExplorer.isColumnNumeric(colName);
        if (filterValInput) {
          filterValInput.placeholder = isNum ? 'Enter number (e.g. 3500)...' : 'Enter filter value...';
        }
        // Auto-update filter when column is changed if a value is present
        if (filterValInput && filterValInput.value.trim()) {
          window.DataLensExplorer.applyFilter(1);
        }
      });
    }

    if (filterOpSelect) {
      filterOpSelect.addEventListener('change', () => {
        const isNullCheck = filterOpSelect.value === 'is_empty' || filterOpSelect.value === 'is_not_empty';
        if (filterValInput) {
          filterValInput.disabled = isNullCheck;
          if (isNullCheck) {
            filterValInput.placeholder = '(No value needed)';
          } else {
            const colName = filterColSelect ? filterColSelect.value.trim() : '';
            const isNum = window.DataLensExplorer.isColumnNumeric(colName);
            filterValInput.placeholder = isNum ? 'Enter number (e.g. 3500)...' : 'Enter filter value...';
          }
        }
        // If null check selected, auto-trigger filter
        if (isNullCheck && filterColSelect && filterColSelect.value.trim()) {
          window.DataLensExplorer.applyFilter(1);
        }
      });
    }

    if (sortColSelect) {
      sortColSelect.addEventListener('change', () => {
        window.DataLensExplorer.applyFilter(1);
      });
    }

    if (sortOrderSelect) {
      sortOrderSelect.addEventListener('change', () => {
        window.DataLensExplorer.applyFilter(1);
      });
    }

    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', () => {
        window.DataLensExplorer.applyFilter(1);
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener('click', (e) => {
        e.preventDefault();
        const curPage = window.DataLensExplorer.state.page || 1;
        if (curPage > 1) {
          window.DataLensExplorer.applyFilter(curPage - 1);
        }
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', (e) => {
        e.preventDefault();
        const curPage = window.DataLensExplorer.state.page || 1;
        window.DataLensExplorer.applyFilter(curPage + 1);
      });
    }
  });
})();
