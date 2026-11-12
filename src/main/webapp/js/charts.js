/**
 * DataLens — Visualization & Chart Controller
 * Phase 4: Dynamic Chart.js visualizations connected to real CSV dataset aggregation endpoint (/api/visualization)
 */

(function () {
  'use strict';

  window.DataLensCharts = {
    chartInstance: null,
    columns: [],

    palette: [
      '#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
      '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
      '#3b82f6', '#e11d48', '#a855f7', '#eab308', '#22c55e'
    ],

    /**
     * Populate X-Axis and Y-Axis column dropdowns from active dataset columns
     * @param {Array<{name: string, dataType: string}>} columns
     */
    populateColumns(columns) {
      this.columns = columns || [];
      const xAxisSelect = document.getElementById('chart-x-axis');
      const yAxisSelect = document.getElementById('chart-y-axis');

      if (!xAxisSelect || !yAxisSelect) return;

      if (this.columns.length === 0) {
        xAxisSelect.innerHTML = '<option value="">Select Column</option>';
        xAxisSelect.disabled = true;
        yAxisSelect.innerHTML = '<option value="">(Count Records)</option>';
        yAxisSelect.disabled = true;
        return;
      }

      const prevX = xAxisSelect.value;
      const prevY = yAxisSelect.value;

      xAxisSelect.disabled = false;
      xAxisSelect.innerHTML = '<option value="">Select Column</option>' +
        this.columns.map(c => {
          const name = typeof c === 'string' ? c : (c.name || c.columnName || '');
          const type = typeof c === 'object' && (c.dataType || c.type) ? ` (${c.dataType || c.type})` : '';
          return `<option value="${window.DataLens.escapeHtml(name)}">${window.DataLens.escapeHtml(name)}${type}</option>`;
        }).join('');

      yAxisSelect.disabled = false;
      yAxisSelect.innerHTML = '<option value="">(Count Records)</option>' +
        this.columns.map(c => {
          const name = typeof c === 'string' ? c : (c.name || c.columnName || '');
          const type = typeof c === 'object' && (c.dataType || c.type) ? ` (${c.dataType || c.type})` : '';
          return `<option value="${window.DataLens.escapeHtml(name)}">${window.DataLens.escapeHtml(name)}${type}</option>`;
        }).join('');

      // Restore previously selected or select first column by default
      if (prevX && this.columns.some(c => (typeof c === 'string' ? c : c.name) === prevX)) {
        xAxisSelect.value = prevX;
      } else if (this.columns.length > 0) {
        const first = this.columns[0];
        xAxisSelect.value = typeof first === 'string' ? first : first.name;
      }

      if (prevY && this.columns.some(c => (typeof c === 'string' ? c : c.name) === prevY)) {
        yAxisSelect.value = prevY;
      }
    },

    /**
     * Generate visualization from backend aggregation API
     */
    async generateChart() {
      const chartTypeSelect = document.getElementById('chart-type-select');
      const xAxisSelect = document.getElementById('chart-x-axis');
      const yAxisSelect = document.getElementById('chart-y-axis');
      const aggSelect = document.getElementById('chart-aggregation');
      const binsSelect = document.getElementById('chart-bins');
      const placeholder = document.getElementById('chart-placeholder-container');
      const wrapper = document.getElementById('chart-canvas-wrapper');
      const heatmapWrapper = document.getElementById('chart-heatmap-wrapper');
      const canvas = document.getElementById('chart-canvas');
      const exportPngBtn = document.getElementById('btn-export-chart-png');

      const chartType = chartTypeSelect ? chartTypeSelect.value : 'bar';
      const xAxis = xAxisSelect ? xAxisSelect.value : '';
      const yAxis = yAxisSelect ? yAxisSelect.value : '';
      const aggregation = aggSelect ? aggSelect.value : 'count';
      const bins = binsSelect ? binsSelect.value : '8';

      if (chartType !== 'correlation_heatmap' && chartType !== 'boxplot' && !xAxis) {
        if (placeholder) {
          placeholder.style.display = 'flex';
          placeholder.innerHTML = '<div class="preview-empty-state"><div class="empty-title">Select an X-Axis Column</div><div class="empty-subtitle">Please select a column to group your dataset chart.</div></div>';
        }
        if (wrapper) wrapper.style.display = 'none';
        if (heatmapWrapper) heatmapWrapper.style.display = 'none';
        if (exportPngBtn) exportPngBtn.style.display = 'none';
        return;
      }

      const params = new URLSearchParams({
        chartType,
        xAxis,
        yAxis,
        aggregation,
        bins
      });

      const data = await window.DataLens.fetchJson(`/api/visualization?${params.toString()}`);
      if (!data) return;

      if (!data.hasDataset) {
        if (placeholder) {
          placeholder.style.display = 'flex';
          placeholder.innerHTML = '<div class="preview-empty-state"><div class="empty-title">No Dataset Loaded</div><div class="empty-subtitle">Please upload a CSV dataset to visualize.</div></div>';
        }
        if (wrapper) wrapper.style.display = 'none';
        if (heatmapWrapper) heatmapWrapper.style.display = 'none';
        if (exportPngBtn) exportPngBtn.style.display = 'none';
        return;
      }

      // Handle Correlation Heatmap Matrix
      if (chartType === 'correlation_heatmap') {
        if (wrapper) wrapper.style.display = 'none';
        if (placeholder) placeholder.style.display = 'none';
        if (exportPngBtn) exportPngBtn.style.display = 'none';
        if (heatmapWrapper) {
          heatmapWrapper.style.display = 'block';
          const matrix = data.correlationMatrix || {};
          const numCols = data.numericColumns || Object.keys(matrix);
          if (numCols.length === 0) {
            heatmapWrapper.innerHTML = '<div class="preview-empty-state"><div class="empty-title">No Numeric Attributes</div><div class="empty-subtitle">At least two numeric attributes are required to calculate Pearson correlation.</div></div>';
            return;
          }

          let html = '<table class="heatmap-table"><thead><tr><th>Attribute</th>' + numCols.map(c => `<th>${window.DataLens.escapeHtml(c)}</th>`).join('') + '</tr></thead><tbody>';
          numCols.forEach(rowCol => {
            html += `<tr><th><strong>${window.DataLens.escapeHtml(rowCol)}</strong></th>`;
            numCols.forEach(colCol => {
              const val = (matrix[rowCol] && matrix[rowCol][colCol] !== undefined) ? matrix[rowCol][colCol] : (rowCol === colCol ? 1.0 : 0.0);
              let colorClass = 'corr-low';
              if (val >= 0.7) colorClass = 'corr-high';
              else if (val >= 0.3) colorClass = 'corr-med';
              else if (val <= -0.7) colorClass = 'corr-neg-high';
              else if (val <= -0.3) colorClass = 'corr-neg-med';
              html += `<td class="${colorClass}">${val.toFixed(2)}</td>`;
            });
            html += '</tr>';
          });
          html += '</tbody></table>';
          heatmapWrapper.innerHTML = html;
        }
        return;
      }

      if (heatmapWrapper) heatmapWrapper.style.display = 'none';

      // Clean up previous Chart instance
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = null;
      }

      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      // Handle Box Plot 5-Number Summary
      if (chartType === 'boxplot') {
        const boxData = data.boxData || [];
        if (boxData.length === 0) {
          if (placeholder) {
            placeholder.style.display = 'flex';
            placeholder.innerHTML = '<div class="preview-empty-state"><div class="empty-title">No Numeric Columns</div><div class="empty-subtitle">No numeric attributes found for 5-number summary.</div></div>';
          }
          if (wrapper) wrapper.style.display = 'none';
          return;
        }

        if (placeholder) placeholder.style.display = 'none';
        if (wrapper) wrapper.style.display = 'block';
        if (exportPngBtn) exportPngBtn.style.display = 'inline-flex';

        this.chartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: boxData.map(b => b.name),
            datasets: [
              { label: 'Minimum (Q0)', data: boxData.map(b => b.min), backgroundColor: '#94a3b8' },
              { label: 'Q1 (25th Percentile)', data: boxData.map(b => b.q25), backgroundColor: '#60a5fa' },
              { label: 'Median (50th Percentile)', data: boxData.map(b => b.median), backgroundColor: '#2563eb' },
              { label: 'Q3 (75th Percentile)', data: boxData.map(b => b.q75), backgroundColor: '#1d4ed8' },
              { label: 'Maximum (Q4)', data: boxData.map(b => b.max), backgroundColor: '#1e3a8a' }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: 'Numeric Distribution 5-Number Summary (Tukey Quantiles)',
                font: { family: "'Plus Jakarta Sans', sans-serif", size: 14, weight: '700' },
                color: '#1e293b'
              },
              legend: { position: 'bottom', labels: { boxWidth: 12 } }
            },
            scales: {
              y: { beginAtZero: false, grid: { color: '#f1f5f9' } },
              x: { grid: { color: '#f1f5f9' } }
            }
          }
        });
        return;
      }

      // Handle Scatter Plot
      if (chartType === 'scatter') {
        const points = data.scatterPoints || data.data || [];
        if (points.length === 0) {
          if (placeholder) {
            placeholder.style.display = 'flex';
            placeholder.innerHTML = '<div class="preview-empty-state"><div class="empty-title">No Numeric Data</div><div class="empty-subtitle">Scatter plots require two numeric columns with valid pairs.</div></div>';
          }
          if (wrapper) wrapper.style.display = 'none';
          return;
        }

        if (placeholder) placeholder.style.display = 'none';
        if (wrapper) wrapper.style.display = 'block';
        if (exportPngBtn) exportPngBtn.style.display = 'inline-flex';

        this.chartInstance = new Chart(ctx, {
          type: 'scatter',
          data: {
            datasets: [{
              label: `${xAxis} vs ${yAxis}`,
              data: points,
              backgroundColor: '#2563eb',
              pointRadius: 4,
              pointHoverRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: `Scatter Plot: ${xAxis} vs ${yAxis}`,
                font: { family: "'Plus Jakarta Sans', sans-serif", size: 14, weight: '700' },
                color: '#1e293b'
              },
              tooltip: {
                callbacks: {
                  label: (context) => `(${context.parsed.x}, ${context.parsed.y})`
                }
              }
            },
            scales: {
              x: { title: { display: true, text: xAxis, font: { weight: '600' } }, grid: { color: '#f1f5f9' } },
              y: { title: { display: true, text: yAxis, font: { weight: '600' } }, grid: { color: '#f1f5f9' } }
            }
          }
        });
        return;
      }

      // Standard Bar, Line, Pie, Doughnut, Histogram
      const chartValues = data.values || data.data || [];
      if (!data.labels || data.labels.length === 0 || chartValues.length === 0) {
        if (placeholder) {
          placeholder.style.display = 'flex';
          placeholder.innerHTML = '<div class="preview-empty-state"><div class="empty-title">No Data Points Found</div><div class="empty-subtitle">No values could be aggregated for the selected column combination.</div></div>';
        }
        if (wrapper) wrapper.style.display = 'none';
        if (exportPngBtn) exportPngBtn.style.display = 'none';
        return;
      }

      // Hide placeholder and show canvas wrapper
      if (placeholder) placeholder.style.display = 'none';
      if (wrapper) wrapper.style.display = 'block';
      if (exportPngBtn) exportPngBtn.style.display = 'inline-flex';

      // Prepare colors
      const isMultiColor = chartType === 'pie' || chartType === 'doughnut';
      const bgColors = isMultiColor
        ? data.labels.map((_, i) => this.palette[i % this.palette.length])
        : this.palette[0];
      const borderColors = isMultiColor
        ? '#ffffff'
        : '#0369a1';

      const chartJsType = (chartType === 'doughnut') ? 'doughnut' : (chartType === 'pie' ? 'pie' : (chartType === 'line' ? 'line' : 'bar'));

      this.chartInstance = new Chart(ctx, {
        type: chartJsType,
        data: {
          labels: data.labels,
          datasets: [{
            label: data.title || data.datasetLabel || `${aggregation.toUpperCase()} of ${yAxis || xAxis}`,
            data: chartValues,
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: isMultiColor ? 2 : 1,
            fill: chartType === 'line' ? { target: 'origin', above: 'rgba(2, 132, 199, 0.08)' } : false,
            tension: 0.25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: data.title,
              font: {
                family: "'Plus Jakarta Sans', sans-serif",
                size: 14,
                weight: '700'
              },
              color: '#1e293b',
              padding: { top: 10, bottom: 20 }
            },
            legend: {
              display: isMultiColor,
              position: 'bottom',
              labels: {
                boxWidth: 12,
                font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
                color: '#475569'
              }
            },
            tooltip: {
              backgroundColor: '#0f172a',
              titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: '700' },
              bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
              padding: 10,
              cornerRadius: 6
            }
          },
          scales: isMultiColor ? {} : {
            x: {
              grid: { color: '#f1f5f9' },
              ticks: {
                font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
                color: '#64748b',
                maxRotation: 45
              }
            },
            y: {
              beginAtZero: true,
              grid: { color: '#f1f5f9' },
              ticks: {
                font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
                color: '#64748b'
              }
            }
          }
        }
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const btnGenerate = document.getElementById('btn-generate-chart');
    if (btnGenerate) {
      btnGenerate.addEventListener('click', (e) => {
        e.preventDefault();
        window.DataLensCharts.generateChart();
      });
    }

    const btnExportPng = document.getElementById('btn-export-chart-png');
    if (btnExportPng) {
      btnExportPng.addEventListener('click', () => {
        const canvas = document.getElementById('chart-canvas');
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = `datalens_chart_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      });
    }

    const chartTypeSelect = document.getElementById('chart-type-select');
    const aggSelect = document.getElementById('chart-aggregation');
    const yAxisSelect = document.getElementById('chart-y-axis');
    const xAxisWrap = document.getElementById('chart-x-axis-wrap');
    const yAxisWrap = document.getElementById('chart-y-axis-wrap');
    const aggWrap = document.getElementById('chart-agg-wrap');
    const binsWrap = document.getElementById('chart-bins-wrap');

    if (chartTypeSelect) {
      chartTypeSelect.addEventListener('change', () => {
        const type = chartTypeSelect.value;
        const isHist = type === 'histogram';
        const isScatter = type === 'scatter';
        const isBox = type === 'boxplot';
        const isHeatmap = type === 'correlation_heatmap';

        if (binsWrap) binsWrap.style.display = isHist ? 'block' : 'none';
        if (xAxisWrap) xAxisWrap.style.display = (isBox || isHeatmap) ? 'none' : 'block';
        if (yAxisWrap) yAxisWrap.style.display = (isHist || isBox || isHeatmap) ? 'none' : 'block';
        if (aggWrap) aggWrap.style.display = (isHist || isScatter || isBox || isHeatmap) ? 'none' : 'block';

        if (isHist) {
          if (aggSelect) aggSelect.value = 'count';
          if (yAxisSelect) yAxisSelect.value = '';
        }
      });
    }
  });
})();
