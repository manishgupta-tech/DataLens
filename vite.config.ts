import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {defineConfig} from 'vite';

// ========================================================
// DataLens — Advanced Profiling, Quality & Analytics Engine
// Deterministic in-memory / disk engine for development preview
// matching Java Servlets (AnalysisService, CleaningService, ValidationService, DatasetManager)
// ========================================================

interface ColumnAnalysis {
  name: string;
  type: 'NUMERIC' | 'CATEGORICAL' | 'DATE' | 'BOOLEAN';
  totalValues: number;
  missingCount: number;
  missingPercentage: number;
  uniqueCount: number;
  completenessPercentage: number;
  cardinalityPercentage?: number;
  healthStatus: 'Good' | 'Warning' | 'Critical';
  isConstant: boolean;
  emptyOrWhitespaceCount: number;
  // Numeric metrics
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  variance?: number; // sample variance
  sampleVariance?: number;
  populationVariance?: number;
  stdDev?: number; // sample std dev
  sampleStdDev?: number;
  populationStdDev?: number;
  q25?: number;
  q75?: number;
  iqr?: number;
  range?: number;
  outlierCount?: number;
  outlierRowIndices?: number[];
  skewness?: number;
  kurtosis?: number;
  zeroCount?: number;
  negativeCount?: number;
  // Categorical metrics
  mostFrequentValue?: string;
  mostFrequentCount?: number;
  topValues?: Array<{value: string; count: number; percentage: number}>;
  rareCategoriesCount?: number;
  inconsistentCasingDetected?: boolean;
  // Date metrics
  earliestDate?: string;
  latestDate?: string;
  dateRangeDays?: number;
  invalidDateCount?: number;
}

interface QualityIssueItem {
  id: string;
  severity: 'Critical' | 'Warning' | 'Info';
  type: string;
  columnName: string;
  affectedRowsCount: number;
  affectedPercentage: number;
  exampleRowNumbers: number[];
  explanation: string;
  recommendation: string;
}

interface DatasetRecord {
  id: number;
  userId?: number;
  originalName: string;
  storedName: string;
  filePath: string;
  fileSize: number;
  rowCount: number;
  columnCount: number;
  numericCount: number;
  categoricalCount: number;
  missingCount: number;
  duplicateCount: number;
  qualityScore: number;
  uploadTime: number;
  status: string;
}

interface ValidationRuleItem {
  id: string;
  userId?: number;
  datasetId?: number | null;
  createdAt?: number;
  name: string;
  ruleType: string; // 'REQUIRED' | 'NO_MISSING' | 'POSITIVE_ONLY' | 'NUMERIC_RANGE' | 'ALLOWED_VALUES' | 'UNIQUE' | 'EMAIL_FORMAT'
  columnName: string;
  targetColumn?: string;
  operator?: string;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  allowedValues?: string[];
  status: 'PASS' | 'FAIL' | 'UNTESTED' | 'ERROR' | 'PASSED' | 'FAILED';
  failedCount: number;
  failureRate: number;
  totalRows?: number;
  totalEvaluatedRows?: number;
  exampleFailedRows: number[];
  exampleViolations: string[];
}

interface CleaningOperationItem {
  type?: string;
  operationType?: string;
  strategy?: string;
  column?: string;
  columnName?: string;
  caseType?: string;
  imputationStrategy?: string;
  customValue?: string;
  outlierMethod?: string;
  action?: string;
  newColumnName?: string;
  description?: string;
}

interface AuditLogEntryItem {
  id: string;
  userId?: number;
  action: string;
  datasetName: string;
  description: string;
  timestamp: number;
  formattedTime: string;
  details?: any;
}

function parseCSVString(content: string): { headers: string[]; rows: string[][] } {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let tokenStart = 0;
  let hasEscapedQuotes = false;

  // Clean UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    tokenStart = 1;
  }

  const len = content.length;
  for (let i = tokenStart; i < len; i++) {
    const c = content.charCodeAt(i);
    if (c === 34) { // '"'
      if (inQuotes && i + 1 < len && content.charCodeAt(i + 1) === 34) {
        hasEscapedQuotes = true;
        i++; // skip second quote in escaped pair
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === 44 && !inQuotes) { // ','
      let cell = content.slice(tokenStart, i).trim();
      if (cell.startsWith('"') && cell.endsWith('"') && cell.length >= 2) {
        cell = cell.slice(1, -1);
      }
      if (hasEscapedQuotes) {
        cell = cell.replace(/""/g, '"');
      }
      row.push(cell.trim());
      tokenStart = i + 1;
      hasEscapedQuotes = false;
    } else if ((c === 10 || c === 13) && !inQuotes) { // '\r' or '\n'
      let cell = content.slice(tokenStart, i).trim();
      if (cell.startsWith('"') && cell.endsWith('"') && cell.length >= 2) {
        cell = cell.slice(1, -1);
      }
      if (hasEscapedQuotes) {
        cell = cell.replace(/""/g, '"');
      }
      row.push(cell.trim());
      if (c === 13 && i + 1 < len && content.charCodeAt(i + 1) === 10) {
        i++;
      }
      tokenStart = i + 1;
      hasEscapedQuotes = false;
      if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
        result.push(row);
      }
      row = [];
    }
  }

  if (tokenStart < len || row.length > 0) {
    let cell = content.slice(tokenStart).trim();
    if (cell.startsWith('"') && cell.endsWith('"') && cell.length >= 2) {
      cell = cell.slice(1, -1);
    }
    if (hasEscapedQuotes) {
      cell = cell.replace(/""/g, '"');
    }
    row.push(cell.trim());
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
      result.push(row);
    }
  }

  if (result.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = result[0];
  const rows = result.slice(1);
  return { headers, rows };
}

function rowsToCSVString(headers: string[], rows: string[][]): string {
  const escapeCell = (val: string) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const headerLine = headers.map(escapeCell).join(',');
  const rowLines = rows.map(r => r.map(escapeCell).join(','));
  return [headerLine, ...rowLines].join('\n');
}

/**
 * Safely and strictly parses a raw string or value into a finite number.
 * Returns null if the value is null, undefined, empty, missing token ('null', 'na', etc.),
 * or contains invalid/trailing characters like "3500abc".
 * Strips standard currency symbols and comma thousands separators before validation.
 */
function parseStrictFiniteNumber(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const lower = s.toLowerCase();
  if (['null', 'na', 'n/a', 'none', 'nan', '?', '-'].includes(lower)) return null;

  // Strip currency prefixes ($ € £ ¥), percentage (%), and comma thousands separators
  const cleaned = s.replace(/^[$\u20AC\u00A3\u00A5]/, '').replace(/%$/, '').trim().replace(/,/g, '');
  if (cleaned === '' || cleaned === '+' || cleaned === '-') return null;

  // Strict regex: optional sign, digits, optional decimal with digits, optional scientific notation
  // Disallows trailing characters like "3500abc", multiple dots, spaces inside, etc.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(cleaned)) {
    return null;
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Compares two finite numbers for exact equality, accounting for IEEE 754 precision limits
 * without introducing loose tolerances that would match unrelated numbers.
 */
function areNumbersEqual(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= 1e-9;
}

// Deterministic Analysis Function
function analyzeDataset(headers: string[], rows: string[][]) {
  const rowCount = rows.length;
  const colCount = headers.length;
  const columns: ColumnAnalysis[] = [];
  const issues: QualityIssueItem[] = [];
  let totalMissing = 0;
  let numericCols = 0;
  let categoricalCols = 0;
  let booleanCols = 0;
  let dateCols = 0;

  const datePatternIso = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/;
  const datePatternSlash = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
  const datePatternDash = /^\d{1,2}-\d{1,2}-\d{4}$/;

  const numericColumnsArrays: Record<string, number[]> = {};

  for (let c = 0; c < colCount; c++) {
    const colName = headers[c];
    const values: string[] = [];
    let missingInCol = 0;
    let whitespaceOnlyInCol = 0;
    const uniqueSet = new Set<string>();
    const missingRowIndices: number[] = [];

    for (let r = 0; r < rowCount; r++) {
      const val = rows[r][c] !== undefined ? rows[r][c] : '';
      const trimmed = val ? val.trim() : '';
      const isMissing = !val || trimmed === '' || ['null', 'na', 'n/a', 'none', 'nan', '?'].includes(trimmed.toLowerCase());

      if (isMissing) {
        missingInCol++;
        if (missingRowIndices.length < 10) {
          missingRowIndices.push(r + 1); // 1-indexed
        }
        if (val && !trimmed) {
          whitespaceOnlyInCol++;
        }
      } else {
        uniqueSet.add(trimmed);
      }
      values.push(val);
    }

    totalMissing += missingInCol;
    const missingPct = rowCount > 0 ? (missingInCol * 100) / rowCount : 0;
    const completenessPct = 100 - missingPct;
    const cardinalityPct = rowCount > 0 ? (uniqueSet.size * 100) / rowCount : 0;
    const isConstant = (uniqueSet.size === 1 && missingInCol === 0);

    const nonMissing = values.filter(v => {
      const t = v ? v.trim() : '';
      return t !== '' && !['null', 'na', 'n/a', 'none', 'nan', '?'].includes(t.toLowerCase());
    });

    // 4-Type Detection
    let detectedType: 'NUMERIC' | 'CATEGORICAL' | 'DATE' | 'BOOLEAN' = 'CATEGORICAL';

    if (nonMissing.length > 0) {
      // Check Boolean
      const boolCount = nonMissing.filter(v => {
        const lower = v.trim().toLowerCase();
        return ['true', 'false', '0', '1', 'yes', 'no', 't', 'f'].includes(lower);
      }).length;

      // Check Date
      const dateCount = nonMissing.filter(v => {
        const t = v.trim();
        return datePatternIso.test(t) || datePatternSlash.test(t) || datePatternDash.test(t);
      }).length;

      // Check Numeric
      const numCount = nonMissing.filter(v => {
        const clean = v.replace(/[$,%]/g, '').trim();
        return !isNaN(Number(clean)) && clean !== '';
      }).length;

      if (boolCount / nonMissing.length >= 0.90 && uniqueSet.size <= 3) {
        detectedType = 'BOOLEAN';
        booleanCols++;
      } else if (dateCount / nonMissing.length >= 0.80) {
        detectedType = 'DATE';
        dateCols++;
      } else if (numCount / nonMissing.length >= 0.80) {
        detectedType = 'NUMERIC';
        numericCols++;
      } else {
        detectedType = 'CATEGORICAL';
        categoricalCols++;
      }
    } else {
      categoricalCols++;
    }

    let healthStatus: 'Good' | 'Warning' | 'Critical' = 'Good';
    if (missingPct > 15 || isConstant) healthStatus = 'Critical';
    else if (missingPct > 0) healthStatus = 'Warning';

    const colMeta: ColumnAnalysis = {
      name: colName,
      type: detectedType,
      totalValues: rowCount,
      missingCount: missingInCol,
      missingPercentage: Math.round(missingPct * 100) / 100,
      uniqueCount: uniqueSet.size,
      completenessPercentage: Math.round(completenessPct * 100) / 100,
      cardinalityPercentage: Math.round(cardinalityPct * 100) / 100,
      isConstant,
      emptyOrWhitespaceCount: whitespaceOnlyInCol,
      healthStatus
    };

    if (detectedType === 'NUMERIC') {
      const parsedDoubles: number[] = [];
      const rowNumbers: number[] = [];
      nonMissing.forEach((v, idx) => {
        const clean = v.replace(/[$,%]/g, '').trim();
        const n = Number(clean);
        if (!isNaN(n)) {
          parsedDoubles.push(n);
          rowNumbers.push(idx + 1);
        }
      });

      numericColumnsArrays[colName] = parsedDoubles;

      if (parsedDoubles.length > 0) {
        const sorted = [...parsedDoubles].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const sum = sorted.reduce((acc, x) => acc + x, 0);
        const mean = sum / sorted.length;

        // Median
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

        // Quartiles (Tukey/Percentile)
        const q25Index = Math.floor(sorted.length * 0.25);
        const q75Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
        const q25 = sorted[q25Index];
        const q75 = sorted[q75Index];
        const iqr = Math.max(0, q75 - q25);

        // Variance & StdDev
        const sumSq = sorted.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0);
        const sampleVariance = sorted.length > 1 ? sumSq / (sorted.length - 1) : 0;
        const populationVariance = sorted.length > 0 ? sumSq / sorted.length : 0;
        const sampleStdDev = Math.sqrt(sampleVariance);
        const populationStdDev = Math.sqrt(populationVariance);

        // Tukey Outlier detection: [q25 - 1.5 * iqr, q75 + 1.5 * iqr]
        const lowerFence = q25 - 1.5 * iqr;
        const upperFence = q75 + 1.5 * iqr;
        const outlierRowIndices: number[] = [];
        let outliers = 0;

        for (let r = 0; r < rowCount; r++) {
          const val = rows[r][c] !== undefined ? rows[r][c] : '';
          const clean = val.replace(/[$,%]/g, '').trim();
          const n = Number(clean);
          if (!isNaN(n) && (n < lowerFence || n > upperFence)) {
            outliers++;
            if (outlierRowIndices.length < 10) {
              outlierRowIndices.push(r + 1);
            }
          }
        }

        // Fisher-Pearson Skewness
        let skewness = 0;
        if (sorted.length >= 3 && sampleStdDev > 0) {
          const m3 = sorted.reduce((acc, x) => acc + Math.pow((x - mean) / sampleStdDev, 3), 0);
          skewness = (sorted.length / ((sorted.length - 1) * (sorted.length - 2))) * m3;
        }

        colMeta.min = Math.round(min * 100) / 100;
        colMeta.max = Math.round(max * 100) / 100;
        colMeta.mean = Math.round(mean * 100) / 100;
        colMeta.median = Math.round(median * 100) / 100;
        colMeta.q25 = Math.round(q25 * 100) / 100;
        colMeta.q75 = Math.round(q75 * 100) / 100;
        colMeta.iqr = Math.round(iqr * 100) / 100;
        colMeta.range = Math.round((max - min) * 100) / 100;
        colMeta.variance = Math.round(sampleVariance * 100) / 100;
        colMeta.sampleVariance = Math.round(sampleVariance * 100) / 100;
        colMeta.populationVariance = Math.round(populationVariance * 100) / 100;
        colMeta.stdDev = Math.round(sampleStdDev * 100) / 100;
        colMeta.sampleStdDev = Math.round(sampleStdDev * 100) / 100;
        colMeta.populationStdDev = Math.round(populationStdDev * 100) / 100;
        colMeta.outlierCount = outliers;
        colMeta.outlierRowIndices = outlierRowIndices;
        colMeta.skewness = Math.round(skewness * 100) / 100;
        colMeta.zeroCount = sorted.filter(n => n === 0).length;
        colMeta.negativeCount = sorted.filter(n => n < 0).length;

        // Register Outlier Quality Issue if any
        if (outliers > 0) {
          issues.push({
            id: `OUTLIER_${c}`,
            severity: outliers > rowCount * 0.05 ? 'Warning' : 'Info',
            type: 'OUTLIER_DETECTED',
            columnName: colName,
            affectedRowsCount: outliers,
            affectedPercentage: Math.round((outliers * 100 / Math.max(1, rowCount)) * 100) / 100,
            exampleRowNumbers: outlierRowIndices,
            explanation: `Column '${colName}' contains ${outliers} statistical outliers outside Tukey fences [${lowerFence.toFixed(2)}, ${upperFence.toFixed(2)}].`,
            recommendation: 'Inspect extreme values or use Cleaning Studio to cap/filter outliers.'
          });
        }
      }
    } else if (detectedType === 'DATE') {
      const parsedDates: number[] = [];
      let invalidDates = 0;
      nonMissing.forEach(v => {
        const t = v.trim();
        const d = new Date(t);
        if (!isNaN(d.getTime())) {
          parsedDates.push(d.getTime());
        } else {
          invalidDates++;
        }
      });

      if (parsedDates.length > 0) {
        parsedDates.sort((a, b) => a - b);
        const earliest = new Date(parsedDates[0]).toISOString().slice(0, 10);
        const latest = new Date(parsedDates[parsedDates.length - 1]).toISOString().slice(0, 10);
        const diffDays = Math.round((parsedDates[parsedDates.length - 1] - parsedDates[0]) / (1000 * 60 * 60 * 24));
        colMeta.earliestDate = earliest;
        colMeta.latestDate = latest;
        colMeta.dateRangeDays = diffDays;
        colMeta.invalidDateCount = invalidDates;
      }
    } else {
      // Categorical or Boolean
      const freq: Record<string, number> = {};
      const lowerCaseMap: Record<string, Set<string>> = {};

      for (const v of nonMissing) {
        const raw = v.trim();
        freq[raw] = (freq[raw] || 0) + 1;

        const lower = raw.toLowerCase();
        if (!lowerCaseMap[lower]) lowerCaseMap[lower] = new Set();
        lowerCaseMap[lower].add(raw);
      }

      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        colMeta.mostFrequentValue = sorted[0][0];
        colMeta.mostFrequentCount = sorted[0][1];
      }
      colMeta.topValues = sorted.slice(0, 5).map(([v, count]) => ({
        value: v,
        count,
        percentage: Math.round((count * 100 / Math.max(1, rowCount)) * 100) / 100
      }));

      // Rare categories (count <= 1 or < 2%)
      const rareCount = sorted.filter(([_, count]) => count <= 1 || (count / Math.max(1, rowCount)) < 0.02).length;
      colMeta.rareCategoriesCount = rareCount;

      // Inconsistent casing check
      let inconsistentCasing = false;
      const casingExamples: string[] = [];
      for (const [_, rawSet] of Object.entries(lowerCaseMap)) {
        if (rawSet.size > 1) {
          inconsistentCasing = true;
          casingExamples.push(Array.from(rawSet).join(' vs '));
        }
      }
      colMeta.inconsistentCasingDetected = inconsistentCasing;

      if (inconsistentCasing) {
        issues.push({
          id: `CASE_${c}`,
          severity: 'Warning',
          type: 'INCONSISTENT_CASING',
          columnName: colName,
          affectedRowsCount: casingExamples.length,
          affectedPercentage: Math.round((casingExamples.length * 100 / Math.max(1, rowCount)) * 100) / 100,
          exampleRowNumbers: [],
          explanation: `Potential casing discrepancies detected in '${colName}' (${casingExamples.slice(0, 2).join(', ')}).`,
          recommendation: 'Use Data Cleaning Studio to standardize text casing (lowercase / UPPERCASE / Title Case).'
        });
      }
    }

    // Missing value issue
    if (missingInCol > 0) {
      issues.push({
        id: `MISSING_${c}`,
        severity: missingPct > 20 ? 'Critical' : (missingPct > 5 ? 'Warning' : 'Info'),
        type: 'MISSING_VALUES',
        columnName: colName,
        affectedRowsCount: missingInCol,
        affectedPercentage: Math.round(missingPct * 100) / 100,
        exampleRowNumbers: missingRowIndices,
        explanation: `Column '${colName}' has ${missingInCol} missing or null values (${missingPct.toFixed(1)}% of total column).`,
        recommendation: 'Apply missing value imputation (Mean, Median, Mode) or drop rows in Data Cleaning Studio.'
      });
    }

    // Constant column issue
    if (isConstant) {
      issues.push({
        id: `CONST_${c}`,
        severity: 'Warning',
        type: 'CONSTANT_COLUMN',
        columnName: colName,
        affectedRowsCount: rowCount,
        affectedPercentage: 100,
        exampleRowNumbers: [1],
        explanation: `Column '${colName}' contains only a single constant value across all rows with zero variance.`,
        recommendation: 'Consider dropping constant columns as they provide no analytical variance.'
      });
    }

    columns.push(colMeta);
  }

  // Row duplicates
  const seenRows = new Set<string>();
  const duplicateRowIndices: number[] = [];
  let duplicateCount = 0;
  for (let r = 0; r < rows.length; r++) {
    const key = rows[r].join('||');
    if (seenRows.has(key)) {
      duplicateCount++;
      if (duplicateRowIndices.length < 10) duplicateRowIndices.push(r + 1);
    } else {
      seenRows.add(key);
    }
  }

  if (duplicateCount > 0) {
    issues.push({
      id: 'DUP_ROWS',
      severity: duplicateCount > rowCount * 0.1 ? 'Critical' : 'Warning',
      type: 'DUPLICATE_ROWS',
      columnName: 'All Columns',
      affectedRowsCount: duplicateCount,
      affectedPercentage: Math.round((duplicateCount * 100 / Math.max(1, rowCount)) * 100) / 100,
      exampleRowNumbers: duplicateRowIndices,
      explanation: `Dataset contains ${duplicateCount} exact duplicate records across all attributes.`,
      recommendation: 'Use Data Cleaning Studio to remove redundant duplicate records.'
    });
  }

  // Correlation Matrix (Pearson r for numeric column pairs)
  const numericNames = Object.keys(numericColumnsArrays);
  const correlationMatrix: Record<string, Record<string, number>> = {};

  for (let i = 0; i < numericNames.length; i++) {
    const nameA = numericNames[i];
    correlationMatrix[nameA] = {};
    for (let j = 0; j < numericNames.length; j++) {
      const nameB = numericNames[j];
      if (nameA === nameB) {
        correlationMatrix[nameA][nameB] = 1.0;
        continue;
      }
      const arrA = numericColumnsArrays[nameA];
      const arrB = numericColumnsArrays[nameB];
      const n = Math.min(arrA.length, arrB.length);
      if (n < 2) {
        correlationMatrix[nameA][nameB] = 0.0;
        continue;
      }
      const meanA = arrA.slice(0, n).reduce((a, b) => a + b, 0) / n;
      const meanB = arrB.slice(0, n).reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let denA = 0;
      let denB = 0;
      for (let k = 0; k < n; k++) {
        const da = arrA[k] - meanA;
        const db = arrB[k] - meanB;
        num += da * db;
        denA += da * da;
        denB += db * db;
      }
      const den = Math.sqrt(denA * denB);
      const r = den > 0 ? num / den : 0;
      correlationMatrix[nameA][nameB] = Math.round(r * 100) / 100;
    }
  }

  // Quality Dimensions & Formula Score
  const totalCells = rowCount * colCount;
  const completeness = totalCells > 0 ? ((totalCells - totalMissing) * 100) / totalCells : 0;
  const uniqueness = rowCount > 0 ? ((rowCount - duplicateCount) * 100) / rowCount : 0;

  const missingDeduction = (100 - completeness) * 0.6;
  const duplicateDeduction = (100 - uniqueness) * 0.4;
  const qualityScore = Math.max(0, Math.min(100, Math.round(100 - missingDeduction - duplicateDeduction)));

  const consistency = Math.max(70, Math.min(100, Math.round((100 - missingDeduction * 0.3) * 10) / 10));
  const validity = Math.max(60, Math.min(100, Math.round((100 - missingDeduction * 0.5) * 10) / 10));
  const timeliness = 100;

  // Rule-based deterministic insights
  const insights: string[] = [];
  insights.push(`Dataset profile: ${rowCount} total rows across ${colCount} columns (${numericCols} numeric, ${categoricalCols} categorical, ${dateCols} date, ${booleanCols} boolean).`);

  if (qualityScore >= 90) {
    insights.push(`High data health: Overall quality score is ${qualityScore}/100, suitable for reliable statistical modeling.`);
  } else if (qualityScore >= 70) {
    insights.push(`Moderate data health: Overall quality score is ${qualityScore}/100 with minor missing values or duplication.`);
  } else {
    insights.push(`Data cleaning advised: Quality score is ${qualityScore}/100. Address missing or inconsistent records.`);
  }

  if (totalMissing === 0) {
    insights.push('Completeness is optimal: 0 missing values detected across all columns (100% complete).');
  } else {
    insights.push(`Completeness rate is ${completeness.toFixed(2)}%: Found ${totalMissing} missing/blank cells.`);
  }

  if (duplicateCount === 0) {
    insights.push('Record uniqueness is 100%: No exact duplicate rows identified in the dataset.');
  } else {
    insights.push(`Duplicate records detected: ${duplicateCount} duplicate rows (${uniqueness.toFixed(2)}% uniqueness).`);
  }

  // Correlation insights
  for (let i = 0; i < numericNames.length; i++) {
    for (let j = i + 1; j < numericNames.length; j++) {
      const r = correlationMatrix[numericNames[i]][numericNames[j]];
      if (Math.abs(r) >= 0.75) {
        insights.push(`High correlation: '${numericNames[i]}' and '${numericNames[j]}' exhibit strong Pearson correlation (r = ${r.toFixed(2)}).`);
        break;
      }
    }
  }

  return {
    rowCount,
    colCount,
    numericCols,
    categoricalCols,
    booleanCols,
    dateCols,
    totalMissing,
    duplicateCount,
    completeness: Math.round(completeness * 100) / 100,
    uniqueness: Math.round(uniqueness * 100) / 100,
    consistency,
    validity,
    timeliness,
    missingDeduction: Math.round(missingDeduction * 100) / 100,
    duplicateDeduction: Math.round(duplicateDeduction * 100) / 100,
    qualityScore,
    columns,
    issues,
    correlationMatrix,
    insights,
    previewRows: rows.slice(0, 5)
  };
}

// Data Cleaning Engine Execution
function processCleaningOperations(headers: string[], rows: string[][], operations: CleaningOperationItem[]) {
  const origHeaders = [...headers];
  const origRows = rows.map(r => [...r]);

  let currentHeaders = [...headers];
  interface RowEntry {
    originalIndex: number;
    cells: string[];
  }
  let rowEntries: RowEntry[] = rows.map((r, i) => ({ originalIndex: i, cells: [...r] }));

  const appliedSummary: string[] = [];
  const affectedOriginalIndices = new Set<number>();
  let affectedCellsCount = 0;

  const isMissingVal = (s: any) => {
    if (s === null || s === undefined) return true;
    const str = String(s).trim().toLowerCase();
    return str === '' || ['null', 'na', 'n/a', 'none', 'nan', '?', '-'].includes(str);
  };

  const isIdColumn = (colName: string): boolean => {
    if (!colName) return false;
    const name = colName.trim().toLowerCase();
    if (name === 'id' || name.endsWith('_id') || name.startsWith('id_')) return true;
    if (name.endsWith('id') && (name.includes('order') || name.includes('user') || name.includes('cust') || name.includes('trans') || name.includes('prod') || name.length <= 4)) return true;
    return false;
  };

  const isNumericOrDate = (val: any): boolean => {
    if (val === null || val === undefined) return false;
    const s = String(val).trim();
    if (s === '' || isMissingVal(s)) return false;
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s) ||
        /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(s)) {
      return true;
    }
    const cleaned = s.replace(/^[$\u20AC\u00A3\u00A5]/, '').replace(/%$/, '').trim().replace(/,/g, '');
    if (cleaned !== '' && !isNaN(Number(cleaned))) {
      return true;
    }
    return false;
  };

  const isApplicableTextColumn = (colName: string, colIdx: number, rowsList: RowEntry[]): boolean => {
    if (isIdColumn(colName)) return false;
    let numericOrDate = 0;
    let nonMissing = 0;
    for (const re of rowsList) {
      if (colIdx < re.cells.length) {
        const val = re.cells[colIdx];
        if (val !== undefined && val !== null && String(val).trim() !== '' && !isMissingVal(val)) {
          nonMissing++;
          if (isNumericOrDate(val)) {
            numericOrDate++;
          }
        }
      }
    }
    if (nonMissing > 0 && (numericOrDate / nonMissing) >= 0.70) {
      return false;
    }
    return true;
  };

  const toTitleCaseStr = (text: string) => {
    return text.toLowerCase().replace(/(?:^|\s)\w/g, m => m.toUpperCase());
  };

  const round2 = (num: number) => Math.round(num * 100) / 100;

  for (const op of (operations || [])) {
    const rawType = (op.type || op.operationType || '').toUpperCase().trim();
    const strategy = (op.strategy || op.imputationStrategy || op.caseType || op.outlierMethod || '').toLowerCase().trim();
    const column = (op.column || op.columnName || '').trim();

    let normalizedType = rawType;
    if (rawType === 'MISSING' || rawType === 'MISSING_VALUES' || rawType === 'IMPUTE_MISSING' || rawType === 'DROP_MISSING') normalizedType = 'MISSING_VALUES';
    else if (rawType === 'DUPLICATES' || rawType === 'REMOVE_DUPLICATES') normalizedType = 'REMOVE_DUPLICATES';
    else if (rawType === 'OUTLIERS' || rawType === 'HANDLE_OUTLIERS') normalizedType = 'OUTLIERS';
    else if (rawType === 'TEXT' || rawType === 'TEXT_SANITIZE' || rawType === 'STANDARDIZE_CASE' || rawType === 'TRIM_WHITESPACE' || rawType === 'TEXT_CASE') normalizedType = 'TEXT_SANITIZE';
    else if (rawType === 'COLUMN' || rawType === 'COLUMN_MANAGEMENT' || rawType === 'DROP_COLUMN' || rawType === 'RENAME_COLUMN') normalizedType = 'COLUMN_MANAGEMENT';

    if (normalizedType === 'REMOVE_DUPLICATES') {
      const beforeCount = rowEntries.length;
      const seen = new Set<string>();
      const uniqueEntries: RowEntry[] = [];
      const colIdx = (column && column !== 'ALL') ? currentHeaders.indexOf(column) : -1;

      for (const re of rowEntries) {
        const key = (colIdx >= 0 && colIdx < re.cells.length) ? (re.cells[colIdx] || '').trim() : re.cells.join('||');
        if (!seen.has(key)) {
          seen.add(key);
          uniqueEntries.push(re);
        } else {
          affectedOriginalIndices.add(re.originalIndex);
        }
      }
      const dropped = beforeCount - uniqueEntries.length;
      rowEntries = uniqueEntries;
      affectedCellsCount += dropped * currentHeaders.length;
      if (colIdx >= 0) {
        appliedSummary.push(`Deduplicated by column '${column}' (removed ${dropped} duplicate rows).`);
      } else {
        appliedSummary.push(`Removed ${dropped} exact duplicate rows.`);
      }
    }

    else if (normalizedType === 'MISSING_VALUES') {
      if (strategy.includes('drop') || strategy === 'drop_rows' || rawType === 'DROP_MISSING') {
        const beforeCount = rowEntries.length;
        const kept: RowEntry[] = [];
        const colIdx = (column && column !== 'ALL') ? currentHeaders.indexOf(column) : -1;

        for (const re of rowEntries) {
          let hasMissing = false;
          if (colIdx >= 0) {
            if (isMissingVal(re.cells[colIdx])) hasMissing = true;
          } else {
            hasMissing = re.cells.some(c => isMissingVal(c));
          }
          if (hasMissing) {
            affectedOriginalIndices.add(re.originalIndex);
          } else {
            kept.push(re);
          }
        }
        const dropped = beforeCount - kept.length;
        rowEntries = kept;
        affectedCellsCount += dropped * currentHeaders.length;
        appliedSummary.push(`Dropped ${dropped} rows with missing values${colIdx >= 0 ? ` in '${column}'` : ''}.`);
      } else {
        // Imputation
        const targetCols = (column && column !== 'ALL') ? [currentHeaders.indexOf(column)].filter(i => i >= 0) : currentHeaders.map((_, i) => i);
        let imputed = 0;

        for (const colIdx of targetCols) {
          const colName = currentHeaders[colIdx];
          let fillVal = op.customValue || '0';

          const validVals = rowEntries
            .map(re => re.cells[colIdx] || '')
            .filter(v => !isMissingVal(v));

          if (strategy.includes('mean') || strategy.includes('median')) {
            const numVals = validVals.map(v => Number(v.replace(/[$,%]/g, '').trim())).filter(n => !isNaN(n)).sort((a, b) => a - b);
            if (numVals.length > 0) {
              if (strategy.includes('mean')) {
                const avg = numVals.reduce((a, b) => a + b, 0) / numVals.length;
                fillVal = round2(avg).toFixed(2);
              } else {
                const mid = Math.floor(numVals.length / 2);
                const med = numVals.length % 2 === 0 ? (numVals[mid - 1] + numVals[mid]) / 2 : numVals[mid];
                fillVal = round2(med).toFixed(2);
              }
            }
          } else if (strategy.includes('mode')) {
            const freq: Record<string, number> = {};
            validVals.forEach(v => { freq[v.trim()] = (freq[v.trim()] || 0) + 1; });
            const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) fillVal = sorted[0][0];
          }

          for (const re of rowEntries) {
            while (re.cells.length <= colIdx) re.cells.push('');
            if (isMissingVal(re.cells[colIdx])) {
              re.cells[colIdx] = fillVal;
              imputed++;
              affectedOriginalIndices.add(re.originalIndex);
            }
          }
          appliedSummary.push(`Imputed missing values in '${colName}' using ${strategy.toUpperCase()} ('${fillVal}').`);
        }
        affectedCellsCount += imputed;
      }
    }

    else if (normalizedType === 'OUTLIERS') {
      const colIdx = currentHeaders.indexOf(column);
      if (colIdx !== -1) {
        const numVals = rowEntries
          .map(re => Number((re.cells[colIdx] || '').replace(/[$,%]/g, '').trim()))
          .filter(n => !isNaN(n))
          .sort((a, b) => a - b);

        if (numVals.length >= 4) {
          const q25 = numVals[Math.floor(numVals.length * 0.25)];
          const q75 = numVals[Math.min(numVals.length - 1, Math.floor(numVals.length * 0.75))];
          const iqr = q75 - q25;
          const lower = round2(q25 - 1.5 * iqr);
          const upper = round2(q75 + 1.5 * iqr);

          if (strategy.includes('remove')) {
            const beforeCount = rowEntries.length;
            const kept: RowEntry[] = [];
            for (const re of rowEntries) {
              const val = Number((re.cells[colIdx] || '').replace(/[$,%]/g, '').trim());
              if (!isNaN(val) && (val < lower || val > upper)) {
                affectedOriginalIndices.add(re.originalIndex);
              } else {
                kept.push(re);
              }
            }
            const removed = beforeCount - kept.length;
            rowEntries = kept;
            affectedCellsCount += removed * currentHeaders.length;
            appliedSummary.push(`Removed ${removed} outlier rows from '${column}' outside [${lower}, ${upper}].`);
          } else {
            // Cap at bounds
            let capped = 0;
            for (const re of rowEntries) {
              const val = Number((re.cells[colIdx] || '').replace(/[$,%]/g, '').trim());
              if (!isNaN(val)) {
                if (val < lower) {
                  re.cells[colIdx] = String(lower);
                  capped++;
                  affectedOriginalIndices.add(re.originalIndex);
                } else if (val > upper) {
                  re.cells[colIdx] = String(upper);
                  capped++;
                  affectedOriginalIndices.add(re.originalIndex);
                }
              }
            }
            affectedCellsCount += capped;
            appliedSummary.push(`Capped ${capped} outlier cells in '${column}' to Tukey bounds [${lower}, ${upper}].`);
          }
        }
      }
    }

    else if (normalizedType === 'TEXT_SANITIZE') {
      let targetCols: number[] = [];
      if (column && column !== 'ALL') {
        const idx = currentHeaders.indexOf(column);
        if (idx >= 0) targetCols = [idx];
      } else {
        targetCols = currentHeaders.map((name, idx) => ({ name, idx }))
          .filter(({ name, idx }) => isApplicableTextColumn(name, idx, rowEntries))
          .map(({ idx }) => idx);
      }
      let altered = 0;

      for (const colIdx of targetCols) {
        const curColName = currentHeaders[colIdx];
        if (isIdColumn(curColName)) continue;

        for (const re of rowEntries) {
          if (colIdx < re.cells.length && re.cells[colIdx] !== undefined) {
            const orig = re.cells[colIdx];
            let cleaned = orig;

            if (strategy.includes('trim') || rawType === 'TRIM_WHITESPACE') {
              cleaned = orig.trim();
            } else if (strategy.includes('upper') || strategy.includes('lower') || strategy.includes('title')) {
              if (!isNumericOrDate(orig) && /[a-zA-Z]/.test(orig)) {
                if (strategy.includes('upper')) {
                  cleaned = orig.toUpperCase();
                } else if (strategy.includes('lower')) {
                  cleaned = orig.toLowerCase();
                } else if (strategy.includes('title')) {
                  cleaned = toTitleCaseStr(orig);
                }
              }
            } else if (strategy.includes('special')) {
              cleaned = orig.replace(/[^a-zA-Z0-9\s\-._]/g, '');
            }

            if (cleaned !== orig) {
              re.cells[colIdx] = cleaned;
              altered++;
              affectedOriginalIndices.add(re.originalIndex);
            }
          }
        }
      }
      affectedCellsCount += altered;
      appliedSummary.push(`Sanitized text (${strategy || 'standardize'}) across ${altered} cell(s)${column && column !== 'ALL' ? ` in '${column}'` : ''}.`);
    }

    else if (normalizedType === 'COLUMN_MANAGEMENT') {
      const action = (op.action || (rawType === 'DROP_COLUMN' ? 'drop' : (rawType === 'RENAME_COLUMN' ? 'rename' : ''))).toLowerCase();
      const colIdx = currentHeaders.indexOf(column);

      if (colIdx !== -1) {
        if (action === 'drop') {
          currentHeaders.splice(colIdx, 1);
          for (const re of rowEntries) {
            if (colIdx < re.cells.length) {
              re.cells.splice(colIdx, 1);
            }
          }
          affectedCellsCount += rowEntries.length;
          appliedSummary.push(`Dropped column '${column}'.`);
        } else if (action === 'rename') {
          const newName = (op.newColumnName || '').trim();
          if (newName) {
            currentHeaders[colIdx] = newName;
            appliedSummary.push(`Renamed column '${column}' to '${newName}'.`);
          }
        }
      }
    }
  }

  // Construct transformed rows & detect cell-level diffs
  const finalRows: string[][] = [];
  const changedCellCoordinates: string[] = [];
  const cellChanges: Record<string, { old: string; new: string; column: string }> = {};

  for (let r = 0; r < rowEntries.length; r++) {
    const re = rowEntries[r];
    finalRows.push(re.cells);

    const origRow = origRows[re.originalIndex];
    for (let c = 0; c < re.cells.length; c++) {
      const curHeader = currentHeaders[c];
      const origColIdx = origHeaders.indexOf(curHeader);
      const oldVal = (origColIdx >= 0 && origColIdx < origRow.length) ? origRow[origColIdx] : null;
      const newVal = re.cells[c];

      if (oldVal !== null && oldVal !== newVal) {
        const coord = `${r}:${c}`;
        changedCellCoordinates.push(coord);
        cellChanges[coord] = { old: oldVal, new: newVal, column: curHeader };
      }
    }
  }

  // Calculate comprehensive before-and-after impact metrics
  let missingValuesBefore = 0;
  for (const r of rows) {
    for (const c of r) {
      if (isMissingVal(c)) missingValuesBefore++;
    }
  }
  let missingValuesAfter = 0;
  for (const r of finalRows) {
    for (const c of r) {
      if (isMissingVal(c)) missingValuesAfter++;
    }
  }

  const origSeen = new Set<string>();
  let duplicateRowsBefore = 0;
  for (const r of rows) {
    const k = r.join('||');
    if (origSeen.has(k)) duplicateRowsBefore++;
    else origSeen.add(k);
  }
  const cleanSeen = new Set<string>();
  let duplicateRowsAfter = 0;
  for (const r of finalRows) {
    const k = r.join('||');
    if (cleanSeen.has(k)) duplicateRowsAfter++;
    else cleanSeen.add(k);
  }

  const totalOrigCells = rows.length * headers.length;
  const origComp = totalOrigCells > 0 ? ((totalOrigCells - missingValuesBefore) * 100) / totalOrigCells : 100;
  const origUniq = rows.length > 0 ? ((rows.length - duplicateRowsBefore) * 100) / rows.length : 100;
  const qualityScoreBefore = Math.max(0, Math.min(100, Math.round(100 - (100 - origComp) * 0.6 - (100 - origUniq) * 0.4)));

  const totalCleanCells = finalRows.length * currentHeaders.length;
  const cleanComp = totalCleanCells > 0 ? ((totalCleanCells - missingValuesAfter) * 100) / totalCleanCells : 100;
  const cleanUniq = finalRows.length > 0 ? ((finalRows.length - duplicateRowsAfter) * 100) / finalRows.length : 100;
  const qualityScoreAfter = Math.max(0, Math.min(100, Math.round(100 - (100 - cleanComp) * 0.6 - (100 - cleanUniq) * 0.4)));

  const rowsRemoved = rows.length - finalRows.length;
  const columnsRemoved = headers.length - currentHeaders.length;
  const noChanges = (rowsRemoved === 0 && columnsRemoved === 0 && affectedCellsCount === 0 && changedCellCoordinates.length === 0);
  const noChangesMessage = noChanges ? `No changes were required. All ${rows.length} rows were retained.` : '';

  return {
    originalRowCount: rows.length,
    cleanedRowCount: finalRows.length,
    originalColumnCount: headers.length,
    cleanedColumnCount: currentHeaders.length,
    originalRows: rows.length,
    remainingRows: finalRows.length,
    rowsRemoved,
    originalColumns: headers.length,
    remainingColumns: currentHeaders.length,
    columnsRemoved,
    cellsModified: affectedCellsCount,
    missingValuesBefore,
    missingValuesAfter,
    duplicateRowsBefore,
    duplicateRowsAfter,
    qualityScoreBefore,
    qualityScoreAfter,
    noChangesMessage,
    affectedRowsCount: affectedOriginalIndices.size,
    affectedCellsCount,
    headers: currentHeaders,
    rows: finalRows,
    previewRows: finalRows,
    originalHeaders: origHeaders,
    changedCells: changedCellCoordinates,
    cellChanges,
    transformedRows: finalRows,
    appliedOperationsSummary: appliedSummary
  };
}

// User state and storage
interface MockUser {
  id: number;
  fullName: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 65536;
  const hash = crypto.pbkdf2Sync(plainPassword, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex');
  return `PBKDF2:${iterations}:${salt}:${hash}`;
}

function verifyPassword(plainPassword: string, storedHash: string): boolean {
  if (!plainPassword || !storedHash) return false;
  const parts = storedHash.split(':');
  if (parts.length === 4 && parts[0] === 'PBKDF2') {
    try {
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const expectedHash = parts[3];
      const hash = crypto.pbkdf2Sync(plainPassword, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex');
      const hashBuf = Buffer.from(hash, 'hex');
      const expectedBuf = Buffer.from(expectedHash, 'hex');
      if (hashBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(hashBuf, expectedBuf);
    } catch {
      return false;
    }
  }
  return false;
}

const mockUsers: MockUser[] = [];
const activeSessions = new Map<string, MockUser>();

function getSessionUser(req: any, urlObj?: URL): MockUser | null {
  // 1. Check URL query parameters (?sid=... or ?token=... or ?session_id=...)
  if (urlObj) {
    const qToken = urlObj.searchParams.get('sid') || urlObj.searchParams.get('token') || urlObj.searchParams.get('session_id');
    if (qToken && activeSessions.has(qToken)) {
      return activeSessions.get(qToken) || null;
    }
  }

  // 2. Check Authorization header: Bearer <sessionId>
  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (activeSessions.has(token)) {
      return activeSessions.get(token) || null;
    }
  }

  // 3. Check X-Session-ID header
  const xSessionId = (req.headers?.['x-session-id'] || '').toString().trim();
  if (xSessionId && activeSessions.has(xSessionId)) {
    return activeSessions.get(xSessionId) || null;
  }

  // 4. Check Cookie header (JSESSIONID, JSESSIONID_FALLBACK, or datalens_session)
  const cookieHeader = req.headers?.cookie || '';
  const match = cookieHeader.match(/(?:JSESSIONID|JSESSIONID_FALLBACK|datalens_session)=([^;]+)/);
  if (match) {
    const sessionId = match[1].trim();
    return activeSessions.get(sessionId) || null;
  }
  return null;
}

const datasetHistory: DatasetRecord[] = [];
let datasetIdSeq = 1;

const userActiveDatasetMap = new Map<number, { record: DatasetRecord; parsed: { headers: string[]; rows: string[][] } }>();
const userValidationRulesMap = new Map<number, ValidationRuleItem[]>();
const userAuditTrailMap = new Map<number, AuditLogEntryItem[]>();

function getUserActiveDataset(userId?: number) {
  if (!userId) return null;
  const active = userActiveDatasetMap.get(userId) || null;
  if (active) {
    const exists = datasetHistory.some(d => d.id === active.record.id && d.userId === userId);
    if (!exists) {
      userActiveDatasetMap.delete(userId);
      return null;
    }
  }
  return active;
}

function setUserActiveDataset(userId: number, record: DatasetRecord, parsed: { headers: string[]; rows: string[][] }) {
  record.userId = userId;
  userActiveDatasetMap.set(userId, { record, parsed });
}

function logAuditAction(userId: number | undefined, action: string, datasetName: string, description: string, details?: any) {
  if (!userId) return;
  const list = userAuditTrailMap.get(userId) || [];
  const now = Date.now();
  const entry: AuditLogEntryItem = {
    id: `audit_${now}_${Math.floor(Math.random() * 1000)}`,
    userId,
    action,
    datasetName,
    description,
    timestamp: now,
    formattedTime: new Date(now).toISOString().replace('T', ' ').slice(0, 19),
    details
  };
  list.unshift(entry);
  userAuditTrailMap.set(userId, list);
}

function registerNewDataset(
  userId: number | undefined,
  filePath: string,
  originalName: string,
  storedName: string,
  forceActive?: boolean
): { record: DatasetRecord; analysis: any; parsed: { headers: string[]; rows: string[][] }; isNewActive: boolean } | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseCSVString(content);
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return null;
  }
  const analysis = analyzeDataset(parsed.headers, parsed.rows);
  const stat = fs.statSync(filePath);

  // Check if user already has an active dataset
  const currentActive = userId ? getUserActiveDataset(userId) : null;
  const shouldBeActive = forceActive !== undefined ? forceActive : (!currentActive || !currentActive.record);

  const newRecord: DatasetRecord = {
    id: datasetIdSeq++,
    userId,
    originalName,
    storedName,
    filePath,
    fileSize: stat.size,
    rowCount: analysis.rowCount,
    columnCount: analysis.colCount,
    numericCount: analysis.numericCols,
    categoricalCount: analysis.categoricalCols,
    missingCount: analysis.totalMissing,
    duplicateCount: analysis.duplicateCount,
    qualityScore: analysis.qualityScore,
    uploadTime: Date.now(),
    status: shouldBeActive ? 'ACTIVE' : 'STORED'
  };

  if (userId) {
    if (shouldBeActive) {
      // Mark all other datasets of this user as STORED
      for (const d of datasetHistory) {
        if (d.userId === userId) {
          d.status = 'STORED';
        }
      }
      setUserActiveDataset(userId, newRecord, parsed);
      logAuditAction(userId, 'DATASET_LOAD', originalName, `Uploaded and activated dataset '${originalName}' (${analysis.rowCount} rows, ${analysis.colCount} cols).`);
    } else {
      logAuditAction(userId, 'DATASET_STORED', originalName, `Uploaded dataset '${originalName}' (${analysis.rowCount} rows) and saved to storage. Current active dataset preserved.`);
    }
  }

  datasetHistory.unshift(newRecord);
  return { record: newRecord, analysis, parsed, isNewActive: shouldBeActive };
}

function activateUserDataset(
  userId: number,
  datasetId: number
): { record: DatasetRecord; analysis: any; parsed: { headers: string[]; rows: string[][] } } | null {
  const target = datasetHistory.find(d => d.id === datasetId && d.userId === userId);
  if (!target || !fs.existsSync(target.filePath)) return null;

  const content = fs.readFileSync(target.filePath, 'utf-8');
  const parsed = parseCSVString(content);
  const analysis = analyzeDataset(parsed.headers, parsed.rows);

  // Atomically update all datasets for this user: exactly one is ACTIVE
  for (const d of datasetHistory) {
    if (d.userId === userId) {
      if (d.id === target.id) {
        d.status = 'ACTIVE';
      } else {
        d.status = 'STORED';
      }
    }
  }

  setUserActiveDataset(userId, target, parsed);
  logAuditAction(userId, 'ACTIVATE_DATASET', target.originalName, `Activated dataset '${target.originalName}' (ID: ${target.id}). Marked previous active dataset as Stored.`);
  return { record: target, analysis, parsed };
}

function loadActiveDatasetFromFile(filePath: string, originalName: string, storedName: string, userId?: number) {
  return registerNewDataset(userId, filePath, originalName, storedName, true);
}

// Evaluate validation rules on dataset
function evaluateValidationRules(rules: ValidationRuleItem[], headers: string[], rows: string[][]): ValidationRuleItem[] {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isMissingValue = (s: string) => {
    if (!s) return true;
    const lower = s.toLowerCase();
    return ['null', 'na', 'n/a', 'none', 'nan', '?'].includes(lower);
  };

  return rules.map(rule => {
    const colName = rule.columnName || '';
    let colIdx = headers.indexOf(colName);
    if (colIdx === -1 && colName) {
      colIdx = headers.findIndex(h => h.trim().toLowerCase() === colName.trim().toLowerCase());
    }
    if (colIdx === -1 && colName) {
      const normCol = colName.toLowerCase().replace(/[\s_-]/g, '');
      colIdx = headers.findIndex(h => h.toLowerCase().replace(/[\s_-]/g, '') === normCol);
    }
    const totalRows = rows.length;

    if (rule.ruleType === 'REQUIRED') {
      const pass = colIdx !== -1;
      return {
        ...rule,
        status: pass ? 'PASS' : 'FAIL',
        failedCount: pass ? 0 : totalRows,
        failureRate: pass ? 0.0 : 100.0,
        exampleFailedRows: pass ? [] : [1],
        exampleViolations: pass ? [] : [`Column '${colName}' missing`]
      };
    }

    if (colIdx === -1 || totalRows === 0) {
      return {
        ...rule,
        status: colIdx === -1 ? 'ERROR' : 'UNTESTED',
        totalRows,
        totalEvaluatedRows: totalRows,
        failedCount: 0,
        failureRate: 0.0,
        exampleFailedRows: [],
        exampleViolations: colIdx === -1 ? [`Column '${colName}' not found in active dataset`] : []
      };
    }

    let failed = 0;
    const exampleFailed: number[] = [];
    const exampleViolationsSet = new Set<string>();
    const firstSeenRowMap = new Map<string, number>();

    for (let r = 0; r < totalRows; r++) {
      const val = rows[r][colIdx] !== undefined ? rows[r][colIdx] : '';
      const raw = val ? val.trim() : '';
      let isRowFailed = false;
      let violationVal: string | null = null;

      switch (rule.ruleType) {
        case 'NO_MISSING':
          if (isMissingValue(raw)) {
            isRowFailed = true;
            violationVal = '(missing)';
          }
          break;
        case 'POSITIVE_ONLY': {
          if (!isMissingValue(raw)) {
            const num = Number(raw.replace(/[$,€£%]/g, '').trim());
            if (isNaN(num)) {
              isRowFailed = true;
              violationVal = `${raw} (non-numeric)`;
            } else if (num <= 0) {
              isRowFailed = true;
              violationVal = `${raw} (<= 0)`;
            }
          } else {
            isRowFailed = true;
            violationVal = '(missing)';
          }
          break;
        }
        case 'NON_EMPTY':
          if (raw.length === 0) {
            isRowFailed = true;
            violationVal = '(empty)';
          }
          break;
        case 'UNIQUE': {
          const normKey = raw ? raw.toLowerCase() : '__datalens_empty__';
          if (firstSeenRowMap.has(normKey)) {
            isRowFailed = true;
            const firstRow = firstSeenRowMap.get(normKey);
            violationVal = raw ? `${raw} (duplicate of row ${firstRow})` : `(duplicate empty, row ${firstRow})`;
          } else {
            firstSeenRowMap.set(normKey, r + 1);
          }
          break;
        }
        case 'NUMERIC_RANGE': {
          if (!isMissingValue(raw)) {
            const num = Number(raw.replace(/[$,€£%]/g, '').trim());
            if (isNaN(num)) {
              isRowFailed = true;
              violationVal = `${raw} (non-numeric)`;
            } else {
              if (rule.minValue !== undefined && num < rule.minValue) {
                isRowFailed = true;
                violationVal = `${raw} (< ${rule.minValue})`;
              }
              if (rule.maxValue !== undefined && num > rule.maxValue) {
                isRowFailed = true;
                violationVal = `${raw} (> ${rule.maxValue})`;
              }
            }
          } else {
            isRowFailed = true;
            violationVal = '(missing)';
          }
          break;
        }
        case 'EMAIL_FORMAT':
          if (isMissingValue(raw) || !emailRegex.test(raw)) {
            isRowFailed = true;
            violationVal = raw || '(missing)';
          }
          break;
        case 'ALLOWED_VALUES':
        case 'ALLOWED_CATEGORIES':
          if (!isMissingValue(raw)) {
            if (rule.allowedValues && rule.allowedValues.length > 0) {
              const normAllowed = rule.allowedValues.map(v => v.trim().toLowerCase());
              if (!normAllowed.includes(raw.toLowerCase())) {
                isRowFailed = true;
                violationVal = `${raw} (not in [${rule.allowedValues.join(', ')}])`;
              }
            }
          } else {
            isRowFailed = true;
            violationVal = '(missing)';
          }
          break;
        default:
          break;
      }

      if (isRowFailed) {
        failed++;
        if (exampleFailed.length < 10) exampleFailed.push(r + 1);
        if (violationVal !== null && exampleViolationsSet.size < 5) {
          exampleViolationsSet.add(violationVal);
        }
      }
    }

    const rate = totalRows > 0 ? (failed * 100) / totalRows : 0;
    return {
      ...rule,
      totalRows,
      totalEvaluatedRows: totalRows,
      status: failed === 0 ? 'PASSED' : 'FAILED',
      failedCount: failed,
      failureRate: Math.round(rate * 100) / 100,
      exampleFailedRows: exampleFailed,
      exampleViolations: Array.from(exampleViolationsSet)
    };
  });
}

export default defineConfig(() => {
  return {
    plugins: [
      {
        name: 'datalens-servlet-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const rawUrl = req.url || '';
            const urlObj = new URL(rawUrl, 'http://localhost');
            let pathname = urlObj.pathname;

            // Support Tomcat /datalens context path seamlessly in Vite dev environment
            if (pathname === '/datalens' || pathname === '/datalens/') {
              pathname = '/';
            } else if (pathname.startsWith('/datalens/')) {
              req.url = req.url.replace(/^\/datalens\//, '/');
              pathname = pathname.substring('/datalens'.length);
              urlObj.pathname = pathname;
            }

            const currentSessionUser = getSessionUser(req, urlObj);

            // Root URL opens dashboard if authenticated, or landing.html if unauthenticated
            if (pathname === '/' || pathname === '') {
              if (currentSessionUser) {
                res.writeHead(302, {
                  'Location': '/index.html',
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
                });
              } else {
                res.writeHead(302, {
                  'Location': '/landing.html',
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
                });
              }
              res.end();
              return;
            }

            // Direct dashboard HTML access protection: redirect unauthenticated users to landing.html
            if (pathname === '/index.html') {
              if (!currentSessionUser) {
                res.writeHead(302, {
                  'Location': '/landing.html',
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
                });
                res.end();
                return;
              } else {
                // If authenticated and session ID passed in query param, persist cookies for subsequent requests
                const sidParam = urlObj.searchParams.get('sid') || urlObj.searchParams.get('token');
                if (sidParam) {
                  res.setHeader('Set-Cookie', [
                    `JSESSIONID=${sidParam}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`,
                    `JSESSIONID_FALLBACK=${sidParam}; Path=/; Secure; SameSite=None; Partitioned`,
                    `datalens_session=${sidParam}; Path=/; Secure; SameSite=None; Partitioned`
                  ]);
                }
              }
            }

            // Check if URL matches any DataLens API or Servlet endpoint
            const isApiOrServlet = pathname.startsWith('/api/') || pathname.includes('/api/') ||
              pathname === '/login' || pathname === '/register' || pathname === '/session' || pathname === '/logout' ||
              pathname === '/dashboard' || pathname === '/history' || pathname === '/preview' || pathname === '/quality' ||
              pathname === '/statistics' || pathname === '/clean' || pathname === '/filter' || pathname === '/validation' ||
              pathname === '/visualization' || pathname === '/insights' || pathname === '/comparison' || pathname === '/sample-data';

            if (!isApiOrServlet) {
              return next();
            }

            let cleanPath = pathname.replace(/^.*\/api\//, '/api/');
            if (!cleanPath.startsWith('/api/')) {
              cleanPath = '/api' + cleanPath;
            }

            const userActive = getUserActiveDataset(currentSessionUser?.id);
            let activeDatasetRecord = userActive?.record || null;
            let activeParsedData = userActive?.parsed || null;

            // 0a. Session API
            if (cleanPath === '/api/session') {
              res.writeHead(200, {
                'Content-Type': 'application/json;charset=UTF-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              });
              if (currentSessionUser) {
                res.end(JSON.stringify({
                  loggedIn: true,
                  user: {
                    id: currentSessionUser.id,
                    name: currentSessionUser.fullName,
                    email: currentSessionUser.email
                  }
                }));
              } else {
                res.end(JSON.stringify({
                  loggedIn: false,
                  user: null
                }));
              }
              return;
            }

            // 0b. Login API
            if ((cleanPath === '/api/login' || cleanPath === '/api/auth/login' || cleanPath === '/login') && req.method === 'POST') {
              const chunks: Buffer[] = [];
              req.on('data', c => chunks.push(c));
              await new Promise(r => req.on('end', r));
              const bodyStr = Buffer.concat(chunks).toString('utf-8');
              let email = '';
              let password = '';
              try {
                const json = JSON.parse(bodyStr);
                email = json.email || '';
                password = json.password || '';
              } catch (e) {
                const params = new URLSearchParams(bodyStr);
                email = params.get('email') || '';
                password = params.get('password') || '';
              }

              const hasEmail = Boolean(email && email.trim());
              const hasPassword = Boolean(password && password.length > 0);

              const sendJsonError = (msg: string) => {
                res.writeHead(200, {
                  'Content-Type': 'application/json;charset=UTF-8',
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
                });
                res.end(JSON.stringify({ success: false, message: msg }));
              };

              if (!hasEmail && !hasPassword) {
                sendJsonError('Please enter your email and password.');
                return;
              }
              if (!hasEmail) {
                sendJsonError('Please enter your email address.');
                return;
              }
              if (!hasPassword) {
                sendJsonError('Please enter your password.');
                return;
              }

              const cleanEmail = email.trim().toLowerCase();
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(cleanEmail)) {
                sendJsonError('Please enter a valid email address.');
                return;
              }

              const user = mockUsers.find(u => u.email.toLowerCase() === cleanEmail);

              if (!user || !verifyPassword(password, user.passwordHash)) {
                sendJsonError('Invalid email or password. Please try again.');
                return;
              }

              const newSessionId = 'SESSION_' + Date.now() + '_' + Math.random().toString(36).substring(2);
              activeSessions.set(newSessionId, user);
              res.writeHead(200, {
                'Content-Type': 'application/json;charset=UTF-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Set-Cookie': [
                  `JSESSIONID=${newSessionId}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`,
                  `JSESSIONID_FALLBACK=${newSessionId}; Path=/; Secure; SameSite=None; Partitioned`,
                  `datalens_session=${newSessionId}; Path=/; Secure; SameSite=None; Partitioned`
                ]
              });
              res.end(JSON.stringify({
                success: true,
                message: 'Login successful',
                sessionId: newSessionId,
                token: newSessionId,
                user: {
                  id: user.id,
                  name: user.fullName,
                  email: user.email
                }
              }));
              return;
            }

            // 0c. Register API
            if ((cleanPath === '/api/register' || cleanPath === '/api/auth/register' || cleanPath === '/register') && req.method === 'POST') {
              const chunks: Buffer[] = [];
              req.on('data', c => chunks.push(c));
              await new Promise(r => req.on('end', r));
              const bodyStr = Buffer.concat(chunks).toString('utf-8');
              let fullName = '';
              let email = '';
              let password = '';
              let confirmPassword = '';
              try {
                const json = JSON.parse(bodyStr);
                fullName = json.fullName || json.name || '';
                email = json.email || '';
                password = json.password || '';
                confirmPassword = json.confirmPassword || '';
              } catch (e) {
                const params = new URLSearchParams(bodyStr);
                fullName = params.get('fullName') || params.get('name') || '';
                email = params.get('email') || '';
                password = params.get('password') || '';
                confirmPassword = params.get('confirmPassword') || '';
              }

              fullName = fullName.trim();
              const cleanEmail = email.trim().toLowerCase();

              res.writeHead(200, {
                'Content-Type': 'application/json;charset=UTF-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              });

              if (!fullName) {
                res.end(JSON.stringify({ success: false, message: 'Please enter your full name.' }));
                return;
              }
              if (!email || !email.trim()) {
                res.end(JSON.stringify({ success: false, message: 'Please enter your email address.' }));
                return;
              }
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(cleanEmail)) {
                res.end(JSON.stringify({ success: false, message: 'Please enter a valid email address.' }));
                return;
              }
              if (!password) {
                res.end(JSON.stringify({ success: false, message: 'Please enter a password.' }));
                return;
              }
              if (password.length < 6) {
                res.end(JSON.stringify({ success: false, message: 'Password must be at least 6 characters long.' }));
                return;
              }
              if (!confirmPassword || password !== confirmPassword) {
                res.end(JSON.stringify({ success: false, message: 'Passwords do not match. Please re-enter.' }));
                return;
              }

              const existing = mockUsers.find(u => u.email.toLowerCase() === cleanEmail);
              if (existing) {
                res.end(JSON.stringify({
                  success: false,
                  message: 'An account with this email already exists. Please sign in or use another email.'
                }));
                return;
              }

              const newUser: MockUser = {
                id: mockUsers.length + 1,
                fullName,
                email: cleanEmail,
                passwordHash: hashPassword(password),
                createdAt: Date.now()
              };
              mockUsers.push(newUser);

              res.end(JSON.stringify({
                success: true,
                message: 'Account created successfully! Please sign in.'
              }));
              return;
            }

            // 0d. Logout API
            if ((cleanPath === '/api/logout' || cleanPath === '/logout')) {
              const sid = urlObj.searchParams.get('sid') || urlObj.searchParams.get('token');
              if (sid) activeSessions.delete(sid);
              const authHeader = req.headers?.authorization || '';
              if (authHeader.startsWith('Bearer ')) {
                activeSessions.delete(authHeader.substring(7).trim());
              }
              const xSid = (req.headers?.['x-session-id'] || '').toString().trim();
              if (xSid) activeSessions.delete(xSid);

              const cookieHeader = req.headers?.cookie || '';
              const match = cookieHeader.match(/(?:JSESSIONID|JSESSIONID_FALLBACK|datalens_session)=([^;]+)/);
              if (match) {
                activeSessions.delete(match[1].trim());
              }

              const clearCookies = [
                'JSESSIONID=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=None; Partitioned',
                'JSESSIONID_FALLBACK=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=None; Partitioned',
                'datalens_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=None; Partitioned'
              ];

              if (req.method === 'GET') {
                res.writeHead(302, {
                  'Location': '/landing.html',
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0',
                  'Set-Cookie': clearCookies
                });
                res.end();
                return;
              }
              res.writeHead(200, {
                'Content-Type': 'application/json;charset=UTF-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Set-Cookie': clearCookies
              });
              res.end(JSON.stringify({
                success: true,
                message: 'Logged out successfully'
              }));
              return;
            }

            // Enforce authentication on all protected APIs
            if (!currentSessionUser) {
              res.writeHead(401, {
                'Content-Type': 'application/json;charset=UTF-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              });
              res.end(JSON.stringify({
                success: false,
                loggedIn: false,
                message: 'Please login first'
              }));
              return;
            }

            // 0e. Quick Sample Dataset Loader API
            if (cleanPath === '/api/sample-data') {
              const sampleType = urlObj.searchParams.get('sample') || 'ecommerce';
              let sampleFile = path.resolve(process.cwd(), 'data', 'samples', 'ecommerce_orders_dataset.csv');
              let sampleName = 'Ecommerce_Orders_Dataset.csv';

              if (sampleType === 'customer') {
                sampleFile = path.resolve(process.cwd(), 'data', 'samples', 'customer_quality_audit.csv');
                sampleName = 'Customer_Quality_Audit.csv';
              } else if (sampleType === 'sales') {
                sampleFile = path.resolve(process.cwd(), 'data', 'samples', 'sample_sales.csv');
                sampleName = 'Sample_Sales.csv';
              } else if (sampleType === 'datapilot' || sampleType === 'demo_datapilot' || sampleType === 'demo') {
                sampleFile = path.resolve(process.cwd(), 'data', 'samples', 'DEMO_DATAPILOT.csv');
                sampleName = 'DEMO_DATAPILOT.csv';
              } else if (sampleType === 'validation' || sampleType === 'test_validation' || sampleType === 'datalens_validation' || sampleType === 'validation_test') {
                sampleFile = path.resolve(process.cwd(), 'data', 'samples', 'DataLens_Validation_Test_Dataset.csv');
                sampleName = 'DataLens_Validation_Test_Dataset.csv';
              }

              if (!fs.existsSync(sampleFile)) {
                res.writeHead(404, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, message: 'Sample dataset file not found.'}));
                return;
              }

              const storedName = `sample_${sampleType}_${Date.now()}.csv`;
              const loaded = loadActiveDatasetFromFile(sampleFile, sampleName, storedName, currentSessionUser.id);

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                message: `Sample dataset '${sampleName}' loaded successfully!`,
                datasetName: sampleName,
                id: loaded?.record.id,
                rowCount: loaded?.record.rowCount,
                columnCount: loaded?.record.columnCount,
                qualityScore: loaded?.record.qualityScore
              }));
              return;
            }

            // 1. Upload API
            if (cleanPath === '/api/upload' && req.method === 'POST') {
              const contentType = req.headers['content-type'] || '';
              if (!contentType.includes('multipart/form-data')) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, message: 'Invalid request: expected multipart/form-data'}));
                return;
              }

              const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
              if (!boundaryMatch) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, message: 'Missing boundary in multipart request'}));
                return;
              }

              const boundary = boundaryMatch[1] || boundaryMatch[2];
              const chunks: Buffer[] = [];
              let totalLength = 0;
              const MAX_UPLOAD_FILE_SIZE_MB = 100;
              const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024; // 100 MB (104,857,600 bytes)
              const MAX_UPLOAD_REQUEST_SIZE_BYTES = (MAX_UPLOAD_FILE_SIZE_MB + 10) * 1024 * 1024; // 110 MB

              req.on('data', (chunk: Buffer) => {
                totalLength += chunk.length;
                if (totalLength > MAX_UPLOAD_REQUEST_SIZE_BYTES) {
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: `CSV file exceeds the ${MAX_UPLOAD_FILE_SIZE_MB} MB size limit.`}));
                  req.destroy();
                  return;
                }
                chunks.push(chunk);
              });

              req.on('end', () => {
                if (res.writableEnded) return;
                const buffer = Buffer.concat(chunks);
                const boundaryBuf = Buffer.from('--' + boundary);

                const partStart = buffer.indexOf(boundaryBuf);
                if (partStart === -1) {
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: 'No file found in upload request.'}));
                  return;
                }

                const headerEndMarker = Buffer.from('\r\n\r\n');
                const headerStart = partStart + boundaryBuf.length + 2;
                const headerEnd = buffer.indexOf(headerEndMarker, headerStart);
                if (headerEnd === -1) {
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: 'Invalid multipart headers.'}));
                  return;
                }

                const headerStr = buffer.slice(headerStart, headerEnd).toString('utf-8');
                const filenameMatch = headerStr.match(/filename="([^"]+)"/i);
                if (!filenameMatch || !filenameMatch[1]) {
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: 'Please select a CSV file to upload.'}));
                  return;
                }

                const originalFileName = path.basename(filenameMatch[1]).trim();
                if (!originalFileName.toLowerCase().endsWith('.csv')) {
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: 'Invalid file type. Only .csv files are allowed.'}));
                  return;
                }

                const contentStart = headerEnd + 4;
                const nextBoundary = buffer.indexOf(boundaryBuf, contentStart);
                if (nextBoundary === -1) {
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: 'Truncated multipart payload.'}));
                  return;
                }

                let contentEnd = nextBoundary;
                if (buffer[contentEnd - 2] === 13 && buffer[contentEnd - 1] === 10) {
                  contentEnd -= 2;
                }

                const fileData = buffer.slice(contentStart, contentEnd);
                if (fileData.length === 0) {
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: 'The uploaded CSV file is empty. Please select a CSV containing data.'}));
                  return;
                }

                if (fileData.length > MAX_UPLOAD_FILE_SIZE_BYTES) {
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: `CSV file exceeds the ${MAX_UPLOAD_FILE_SIZE_MB} MB size limit.`}));
                  return;
                }

                if (fileData.includes(0)) {
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: 'Invalid CSV format: file contains binary content.'}));
                  return;
                }

                const textContent = fileData.toString('utf-8');
                const lines = textContent.split(/\r?\n/).filter(l => l.trim().length > 0);
                if (lines.length < 2) {
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: 'CSV file contains a header but has no data rows.'}));
                  return;
                }

                const ext = path.extname(originalFileName);
                const baseName = path.basename(originalFileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'dataset';
                const now = new Date();
                const pad = (n: number) => String(n).padStart(2, '0');
                const pad3 = (n: number) => String(n).padStart(3, '0');
                const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad3(now.getMilliseconds())}`;
                const storedFileName = `${baseName}_${timestamp}.csv`;

                const uploadDir = path.resolve(process.cwd(), 'data', 'uploads');
                if (!fs.existsSync(uploadDir)) {
                  fs.mkdirSync(uploadDir, {recursive: true});
                }

                const targetPath = path.join(uploadDir, storedFileName);
                fs.writeFileSync(targetPath, fileData);

                const isActivateRequested = urlObj.searchParams.get('activate') === 'true' ||
                                            req.headers['x-activate-dataset'] === 'true';
                const loaded = registerNewDataset(currentSessionUser?.id, targetPath, originalFileName, storedFileName, isActivateRequested ? true : undefined);
                if (!loaded) {
                  if (fs.existsSync(targetPath)) {
                    fs.unlinkSync(targetPath);
                  }
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: 'CSV file contains a header but has no data rows.'}));
                  return;
                }

                const currentActive = currentSessionUser ? getUserActiveDataset(currentSessionUser.id) : null;
                const activeId = currentActive?.record ? currentActive.record.id : loaded.record.id;
                const activeName = currentActive?.record ? currentActive.record.originalName : originalFileName;

                const message = loaded.isNewActive
                  ? `Dataset '${originalFileName}' uploaded and activated as your active dataset.`
                  : `Dataset '${originalFileName}' uploaded and saved to storage. Current active dataset '${activeName}' preserved.`;

                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({
                  success: true,
                  message,
                  fileName: originalFileName,
                  storedFileName,
                  fileSize: fileData.length,
                  rowCount: loaded.record.rowCount,
                  columnCount: loaded.record.columnCount,
                  qualityScore: loaded.record.qualityScore,
                  isActive: loaded.isNewActive,
                  activeDatasetId: activeId,
                  id: loaded.record.id
                }));
              });
              return;
            }

            // 1b. Sample Datasets Loader API (/api/sample-data, /sample-data)
            if (cleanPath === '/api/sample-data' || cleanPath === '/sample-data') {
              const sampleType = (urlObj.searchParams.get('sample') || urlObj.searchParams.get('type') || '').trim().toLowerCase();
              let fileName = '';
              let displayName = '';

              if (sampleType === 'ecommerce' || sampleType === 'ecommerce_orders') {
                fileName = 'ecommerce_orders_dataset.csv';
                displayName = 'E-Commerce Orders Dataset';
              } else if (sampleType === 'customer' || sampleType === 'customer_audit' || sampleType === 'customer_quality_audit') {
                fileName = 'customer_quality_audit.csv';
                displayName = 'Customer Quality Audit';
              } else if (sampleType === 'sales' || sampleType === 'sample_sales') {
                fileName = 'sample_sales.csv';
                displayName = 'Sales Transactions';
              } else if (sampleType === 'datapilot' || sampleType === 'demo_datapilot' || sampleType === 'demo') {
                fileName = 'DEMO_DATAPILOT.csv';
                displayName = 'DEMO_DATAPILOT.csv';
              } else {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({
                  success: false,
                  message: `Unknown sample dataset type: '${sampleType}'. Available: ecommerce, customer, sales, datapilot.`
                }));
                return;
              }

              let targetPath = path.resolve(process.cwd(), 'data', 'samples', fileName);
              if (!fs.existsSync(targetPath)) {
                targetPath = path.resolve(process.cwd(), 'src', 'main', 'webapp', 'data', 'samples', fileName);
              }

              if (!fs.existsSync(targetPath)) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({
                  success: false,
                  message: `Sample dataset file '${fileName}' was not found on the server.`
                }));
                return;
              }

              const loaded = registerNewDataset(currentSessionUser?.id, targetPath, displayName, fileName, true);
              if (!loaded) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({
                  success: false,
                  message: `Failed to parse sample dataset '${fileName}'.`
                }));
                return;
              }

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                message: `Loaded sample dataset '${displayName}' successfully.`,
                datasetName: displayName,
                fileName,
                rowCount: loaded.record.rowCount,
                columnCount: loaded.record.columnCount,
                qualityScore: loaded.record.qualityScore,
                id: loaded.record.id,
                activeDatasetId: loaded.record.id
              }));
              return;
            }

            // 2. Dashboard API
            if (cleanPath === '/api/dashboard') {
              const userDatasets = datasetHistory.filter(d => d.userId === currentSessionUser?.id);
              const totalDatasetsCount = userDatasets.length;
              const totalAnalyzedRowsAcrossAll = userDatasets.reduce((sum, d) => sum + (d.rowCount || 0), 0);
              const latestDataset = userDatasets.length > 0 ? userDatasets[0] : null;
              const userAudit = userAuditTrailMap.get(currentSessionUser?.id || 0) || [];

              const accountSummary = {
                totalDatasets: totalDatasetsCount,
                totalAnalyzedRows: totalAnalyzedRowsAcrossAll,
                latestDatasetName: latestDataset ? latestDataset.originalName : '',
                latestQualityScore: latestDataset ? latestDataset.qualityScore : 0
              };

              if (!activeDatasetRecord || !activeParsedData) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({
                  success: true,
                  hasDataset: false,
                  message: 'No active dataset loaded.',
                  accountSummary,
                  recentActivity: userAudit.slice(0, 5)
                }));
                return;
              }
              const analysis = analyzeDataset(activeParsedData.headers, activeParsedData.rows);
              const previewObjRows = activeParsedData.rows.slice(0, 5).map(r => {
                const obj: Record<string, string> = {};
                activeParsedData!.headers.forEach((h, i) => { obj[h] = r[i] || ''; });
                return obj;
              });

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                hasDataset: true,
                accountSummary,
                recentActivity: userAudit.slice(0, 5),
                dataset: {
                  id: activeDatasetRecord.id,
                  fileName: activeDatasetRecord.originalName,
                  originalName: activeDatasetRecord.originalName,
                  storedFileName: activeDatasetRecord.storedName,
                  fileSize: activeDatasetRecord.fileSize,
                  fileSizeBytes: activeDatasetRecord.fileSize,
                  filePath: activeDatasetRecord.filePath,
                  uploadedAt: new Date(activeDatasetRecord.uploadTime).toISOString().replace('T', ' ').slice(0, 19),
                  uploadTime: activeDatasetRecord.uploadTime,
                  delimiter: ',',
                  encoding: 'UTF-8'
                },
                datasetInfo: {
                  id: activeDatasetRecord.id,
                  fileName: activeDatasetRecord.originalName,
                  originalName: activeDatasetRecord.originalName,
                  storedFileName: activeDatasetRecord.storedName,
                  fileSize: activeDatasetRecord.fileSize,
                  fileSizeBytes: activeDatasetRecord.fileSize,
                  fileSizeFormatted: `${(activeDatasetRecord.fileSize / 1024).toFixed(1)} KB`,
                  uploadTime: activeDatasetRecord.uploadTime,
                  uploadedAt: new Date(activeDatasetRecord.uploadTime).toISOString().replace('T', ' ').slice(0, 19),
                  uploadDateFormatted: new Date(activeDatasetRecord.uploadTime).toISOString().replace('T', ' ').slice(0, 19),
                  filePath: activeDatasetRecord.filePath,
                  delimiter: ',',
                  encoding: 'UTF-8'
                },
                metrics: {
                  totalRows: activeDatasetRecord.rowCount,
                  rowCount: activeDatasetRecord.rowCount,
                  totalColumns: activeDatasetRecord.columnCount,
                  columnCount: activeDatasetRecord.columnCount,
                  numericColumns: activeDatasetRecord.numericCount,
                  categoricalColumns: activeDatasetRecord.categoricalCount,
                  booleanColumns: analysis.booleanCols,
                  dateColumns: analysis.dateCols,
                  missingValues: activeDatasetRecord.missingCount,
                  missingCount: activeDatasetRecord.missingCount,
                  duplicateRows: activeDatasetRecord.duplicateCount,
                  duplicateCount: activeDatasetRecord.duplicateCount,
                  qualityScore: activeDatasetRecord.qualityScore,
                  qualityOverview: {
                    completeness: analysis.completeness,
                    uniqueness: analysis.uniqueness,
                    consistency: analysis.consistency,
                    validity: analysis.validity,
                    timeliness: analysis.timeliness,
                    overallScore: analysis.qualityScore
                  }
                },
                qualityOverview: {
                  completeness: analysis.completeness,
                  uniqueness: analysis.uniqueness,
                  consistency: analysis.consistency,
                  validity: analysis.validity,
                  timeliness: analysis.timeliness,
                  overallScore: analysis.qualityScore,
                  missingDeduction: analysis.missingDeduction,
                  duplicateDeduction: analysis.duplicateDeduction
                },
                headers: activeParsedData.headers,
                first5Rows: previewObjRows,
                previewRows: previewObjRows,
                columns: analysis.columns.map(c => ({
                  name: c.name,
                  columnName: c.name,
                  dataType: c.type,
                  type: c.type,
                  totalValues: c.totalValues,
                  missingCount: c.missingCount,
                  missingPercentage: c.missingPercentage,
                  uniqueCount: c.uniqueCount,
                  completenessPercentage: c.completenessPercentage,
                  healthStatus: c.healthStatus
                })),
                insights: analysis.insights.slice(0, 4)
              }));
              return;
            }

            // 3. Preview API
            if (cleanPath === '/api/preview') {
              if (!activeDatasetRecord || !activeParsedData) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, hasDataset: false, message: 'No active dataset loaded.'}));
                return;
              }

              const analysis = analyzeDataset(activeParsedData.headers, activeParsedData.rows);
              const page = Math.max(1, parseInt(urlObj.searchParams.get('page') || '1'));
              const size = Math.max(1, parseInt(urlObj.searchParams.get('size') || '100'));
              const search = (urlObj.searchParams.get('search') || '').trim().toLowerCase();

              let filtered = activeParsedData.rows;
              if (search) {
                filtered = filtered.filter(row => row.some(cell => cell.toLowerCase().includes(search)));
              }

              const totalRows = filtered.length;
              const totalPages = Math.max(1, Math.ceil(totalRows / size));
              const curPage = Math.min(page, totalPages);
              const start = (curPage - 1) * size;
              const pageRows = filtered.slice(start, start + size);
              const pageRowsObj = pageRows.map(r => {
                const obj: Record<string, string> = {};
                activeParsedData!.headers.forEach((h, i) => { obj[h] = r[i] || ''; });
                return obj;
              });

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                hasDataset: true,
                datasetName: activeDatasetRecord.originalName,
                datasetTotalRows: activeParsedData.rows.length,
                totalRows,
                totalFilteredRows: totalRows,
                totalPages,
                page: curPage,
                pageSize: size,
                size,
                search,
                columns: analysis.columns.map(c => ({
                  name: c.name,
                  columnName: c.name,
                  dataType: c.type,
                  type: c.type
                })),
                headers: activeParsedData.headers,
                rows: pageRowsObj
              }));
              return;
            }

            // 4. Quality API
            if (cleanPath === '/api/quality') {
              if (!activeDatasetRecord || !activeParsedData) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, hasDataset: false, message: 'No active dataset loaded.'}));
                return;
              }
              const analysis = analyzeDataset(activeParsedData.headers, activeParsedData.rows);
              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                hasDataset: true,
                datasetName: activeDatasetRecord.originalName,
                summary: {
                  completeness: analysis.completeness,
                  uniqueness: analysis.uniqueness,
                  missingValues: activeDatasetRecord.missingCount,
                  duplicateRows: activeDatasetRecord.duplicateCount,
                  qualityScore: activeDatasetRecord.qualityScore,
                  formulaDeduction: {
                    missingDeduction: analysis.missingDeduction,
                    missingRate: Math.round((100 - analysis.completeness) * 100) / 100,
                    duplicateDeduction: analysis.duplicateDeduction,
                    duplicateRate: Math.round((100 - analysis.uniqueness) * 100) / 100,
                    finalScore: analysis.qualityScore
                  }
                },
                metrics: {
                  totalRows: activeDatasetRecord.rowCount,
                  totalColumns: activeDatasetRecord.columnCount,
                  totalCells: activeDatasetRecord.rowCount * activeDatasetRecord.columnCount,
                  missingValues: activeDatasetRecord.missingCount,
                  missingPercentage: Math.round(((activeDatasetRecord.missingCount / Math.max(1, activeDatasetRecord.rowCount * activeDatasetRecord.columnCount)) * 100) * 100) / 100,
                  duplicateRows: activeDatasetRecord.duplicateCount,
                  duplicatePercentage: Math.round(((activeDatasetRecord.duplicateCount / Math.max(1, activeDatasetRecord.rowCount)) * 100) * 100) / 100,
                  qualityScore: activeDatasetRecord.qualityScore
                },
                dimensions: {
                  completeness: analysis.completeness,
                  uniqueness: analysis.uniqueness,
                  consistency: analysis.consistency,
                  validity: analysis.validity,
                  timeliness: analysis.timeliness,
                  overallScore: analysis.qualityScore
                },
                deductions: {
                  missingDeduction: analysis.missingDeduction,
                  duplicateDeduction: analysis.duplicateDeduction,
                  finalScore: analysis.qualityScore
                },
                columns: analysis.columns.map(c => ({
                  name: c.name,
                  columnName: c.name,
                  dataType: c.type,
                  type: c.type,
                  totalCount: c.totalValues,
                  totalValues: c.totalValues,
                  missingCount: c.missingCount,
                  missingPercentage: c.missingPercentage,
                  uniqueCount: c.uniqueCount,
                  completenessPercentage: c.completenessPercentage,
                  cardinalityPercentage: c.cardinalityPercentage,
                  isConstant: c.isConstant,
                  healthStatus: c.healthStatus
                })),
                issues: analysis.issues
              }));
              return;
            }

            // 5. Statistics API
            if (cleanPath === '/api/statistics') {
              if (!activeDatasetRecord || !activeParsedData) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, hasDataset: false, message: 'No active dataset loaded.'}));
                return;
              }
              const analysis = analyzeDataset(activeParsedData.headers, activeParsedData.rows);
              const numericSummary = analysis.columns
                .filter(c => c.type === 'NUMERIC')
                .map(c => ({
                  columnName: c.name,
                  name: c.name,
                  count: c.totalValues - c.missingCount,
                  totalCount: c.totalValues,
                  mean: c.mean ?? 0,
                  median: c.median ?? 0,
                  min: c.min ?? 0,
                  max: c.max ?? 0,
                  q25: c.q25 ?? 0,
                  q75: c.q75 ?? 0,
                  iqr: c.iqr ?? 0,
                  range: c.range ?? 0,
                  variance: c.sampleVariance ?? 0,
                  sampleVariance: c.sampleVariance ?? 0,
                  populationVariance: c.populationVariance ?? 0,
                  stdDev: c.sampleStdDev ?? 0,
                  sampleStdDev: c.sampleStdDev ?? 0,
                  populationStdDev: c.populationStdDev ?? 0,
                  outlierCount: c.outlierCount ?? 0,
                  skewness: c.skewness ?? 0,
                  zeroCount: c.zeroCount ?? 0,
                  negativeCount: c.negativeCount ?? 0
                }));

              const categoricalSummary = analysis.columns
                .filter(c => c.type === 'CATEGORICAL' || c.type === 'BOOLEAN')
                .map(c => ({
                  columnName: c.name,
                  name: c.name,
                  type: c.type,
                  totalCount: c.totalValues,
                  uniqueCount: c.uniqueCount,
                  mostFrequentValue: c.mostFrequentValue || 'N/A',
                  topFrequency: c.mostFrequentCount ?? 0,
                  mostFrequentCount: c.mostFrequentCount ?? 0,
                  rareCategoriesCount: c.rareCategoriesCount ?? 0,
                  inconsistentCasing: c.inconsistentCasingDetected ?? false,
                  topValues: c.topValues || []
                }));

              const dateSummary = analysis.columns
                .filter(c => c.type === 'DATE')
                .map(c => ({
                  name: c.name,
                  columnName: c.name,
                  earliestDate: c.earliestDate || '-',
                  latestDate: c.latestDate || '-',
                  dateRangeDays: c.dateRangeDays ?? 0,
                  invalidDateCount: c.invalidDateCount ?? 0
                }));

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                hasDataset: true,
                datasetName: activeDatasetRecord.originalName,
                numericSummary,
                numericColumns: numericSummary,
                categoricalSummary,
                categoricalColumns: categoricalSummary,
                dateSummary,
                dateColumns: dateSummary,
                correlationMatrix: analysis.correlationMatrix
              }));
              return;
            }

            // 6. Filter API & Filter Export
            if (cleanPath === '/api/filter') {
              if (!activeDatasetRecord || !activeParsedData) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, hasDataset: false, message: 'No active dataset loaded.'}));
                return;
              }

              const analysis = analyzeDataset(activeParsedData.headers, activeParsedData.rows);
              let col = urlObj.searchParams.get('column') || '';
              let op = urlObj.searchParams.get('operator') || 'equals';
              let val = urlObj.searchParams.get('value') || '';
              const search = (urlObj.searchParams.get('search') || '').trim().toLowerCase();
              const sortColumn = urlObj.searchParams.get('sortColumn') || '';
              const sortOrder = (urlObj.searchParams.get('sortOrder') || 'asc').toLowerCase();
              const page = Math.max(1, parseInt(urlObj.searchParams.get('page') || '1'));
              const pageSize = Math.max(1, parseInt(urlObj.searchParams.get('pageSize') || '25'));
              const isExport = urlObj.searchParams.get('export') === 'true';

              if (req.method === 'POST') {
                const chunks: Buffer[] = [];
                req.on('data', c => chunks.push(c));
                await new Promise(r => req.on('end', r));
                const bodyStr = Buffer.concat(chunks).toString('utf-8');
                try {
                  const json = JSON.parse(bodyStr);
                  if (json.column) col = json.column;
                  if (json.operator) op = json.operator;
                  if (json.value !== undefined) val = String(json.value);
                } catch (e) {
                  // fallback query params
                }
              }

              const headers = activeParsedData.headers;
              const allRows = activeParsedData.rows;
              const colIdx = headers.indexOf(col);

              let matchedRows = allRows;
              let validationError: string | null = null;
              let isNumericColumn = false;

              // Apply specific column operator filter
              if (colIdx !== -1) {
                const colMeta = analysis.columns[colIdx];
                isNumericColumn = colMeta?.type === 'NUMERIC';

                if (!isNumericColumn) {
                  let numCells = 0;
                  let nonEmptyCells = 0;
                  for (let r = 0; r < allRows.length; r++) {
                    const c = allRows[r][colIdx];
                    if (c !== undefined && c !== null && c.trim() !== '') {
                      nonEmptyCells++;
                      if (parseStrictFiniteNumber(c) !== null) numCells++;
                    }
                  }
                  if (nonEmptyCells > 0 && (numCells / nonEmptyCells) >= 0.7) {
                    isNumericColumn = true;
                  }
                }

                if (isNumericColumn) {
                  if (op === 'is_empty') {
                    matchedRows = matchedRows.filter(row => {
                      const cell = (row[colIdx] || '').trim();
                      return !cell || ['null', 'na', 'n/a', 'none', 'nan', '?'].includes(cell.toLowerCase()) || parseStrictFiniteNumber(cell) === null;
                    });
                  } else if (op === 'is_not_empty') {
                    matchedRows = matchedRows.filter(row => {
                      const cell = (row[colIdx] || '').trim();
                      return cell !== '' && !['null', 'na', 'n/a', 'none', 'nan', '?'].includes(cell.toLowerCase()) && parseStrictFiniteNumber(cell) !== null;
                    });
                  } else {
                    const tNum = parseStrictFiniteNumber(val);
                    if (tNum === null) {
                      // Filter input is not a valid number (e.g. "3500abc")
                      validationError = `Invalid numeric filter input "${val}" for numeric column "${col}". Please enter a valid finite number.`;
                      matchedRows = []; // No false match
                    } else {
                      matchedRows = matchedRows.filter(row => {
                        const cell = row[colIdx];
                        const cNum = parseStrictFiniteNumber(cell);
                        if (cNum === null) {
                          return false; // Null or non-numeric cells don't match numeric criteria
                        }
                        if (op === 'equals' || op === 'eq') return areNumbersEqual(cNum, tNum);
                        if (op === 'not_equals' || op === 'neq') return !areNumbersEqual(cNum, tNum);
                        if (op === 'gt' || op === 'greater_than') return cNum > tNum && !areNumbersEqual(cNum, tNum);
                        if (op === 'gte' || op === 'greater_than_or_equal') return cNum > tNum || areNumbersEqual(cNum, tNum);
                        if (op === 'lt' || op === 'less_than') return cNum < tNum && !areNumbersEqual(cNum, tNum);
                        if (op === 'lte' || op === 'less_than_or_equal') return cNum < tNum || areNumbersEqual(cNum, tNum);
                        if (op === 'contains') return String(cell).toLowerCase().includes(val.trim().toLowerCase());
                        if (op === 'starts_with') return String(cell).toLowerCase().startsWith(val.trim().toLowerCase());
                        return false;
                      });
                    }
                  }
                } else {
                  // Non-numeric column (Text, Categorical, Date, Boolean)
                  const target = val.trim();
                  const targetLower = target.toLowerCase();
                  matchedRows = matchedRows.filter(row => {
                    const cell = (row[colIdx] || '').trim();
                    const cellLower = cell.toLowerCase();

                    if (op === 'is_empty') return !cell || ['null', 'na', 'n/a', 'none', 'nan', '?'].includes(cellLower);
                    if (op === 'is_not_empty') return cell && !['null', 'na', 'n/a', 'none', 'nan', '?'].includes(cellLower);
                    if (op === 'equals' || op === 'eq') return cellLower === targetLower;
                    if (op === 'not_equals' || op === 'neq') return cellLower !== targetLower;
                    if (op === 'contains') return cellLower.includes(targetLower);
                    if (op === 'starts_with') return cellLower.startsWith(targetLower);
                    if (op === 'gt' || op === 'greater_than') return cell.localeCompare(target) > 0;
                    if (op === 'gte' || op === 'greater_than_or_equal') return cell.localeCompare(target) >= 0;
                    if (op === 'lt' || op === 'less_than') return cell.localeCompare(target) < 0;
                    if (op === 'lte' || op === 'less_than_or_equal') return cell.localeCompare(target) <= 0;
                    return false;
                  });
                }
              }

              // Apply global search across all columns
              if (search) {
                matchedRows = matchedRows.filter(row => row.some(cell => cell.toLowerCase().includes(search)));
              }

              // Apply sorting
              if (sortColumn) {
                const sortIdx = headers.indexOf(sortColumn);
                if (sortIdx !== -1) {
                  const sortColMeta = analysis.columns[sortIdx];
                  const sortIsNumeric = sortColMeta?.type === 'NUMERIC';
                  matchedRows = [...matchedRows].sort((a, b) => {
                    const valA = (a[sortIdx] || '').trim();
                    const valB = (b[sortIdx] || '').trim();
                    if (sortIsNumeric) {
                      const numA = parseStrictFiniteNumber(valA);
                      const numB = parseStrictFiniteNumber(valB);
                      if (numA !== null && numB !== null) {
                        return sortOrder === 'desc' ? numB - numA : numA - numB;
                      }
                      if (numA !== null) return -1;
                      if (numB !== null) return 1;
                    }
                    return sortOrder === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
                  });
                }
              }

              // Export as CSV
              if (isExport) {
                const csvOutput = rowsToCSVString(headers, matchedRows);
                res.writeHead(200, {
                  'Content-Type': 'text/csv;charset=UTF-8',
                  'Content-Disposition': `attachment; filename="filtered_${activeDatasetRecord.originalName}"`
                });
                res.end(csvOutput);
                logAuditAction(currentSessionUser.id, 'EXPORT_FILTERED', activeDatasetRecord.originalName, `Exported ${matchedRows.length} filtered records as CSV.`);
                return;
              }

              const matchPct = allRows.length > 0 ? (matchedRows.length * 100) / allRows.length : 0;
              const totalFilteredRows = matchedRows.length;
              const totalPages = Math.max(1, Math.ceil(totalFilteredRows / pageSize));
              const curPage = Math.min(page, totalPages);
              const startIdx = (curPage - 1) * pageSize;
              const pagedRows = matchedRows.slice(startIdx, startIdx + pageSize);

              const pagedRowsObj = pagedRows.map(r => {
                const obj: Record<string, string> = {};
                headers.forEach((h, i) => { obj[h] = r[i] || ''; });
                return obj;
              });

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                hasDataset: true,
                datasetName: activeDatasetRecord.originalName,
                totalRows: allRows.length,
                matchedRows: totalFilteredRows,
                totalFilteredRows,
                page: curPage,
                pageSize,
                totalPages,
                matchPercentage: Math.round(matchPct * 100) / 100,
                validationError: validationError || null,
                isNumericColumn,
                columns: analysis.columns.map(c => ({ name: c.name, dataType: c.type })),
                headers,
                rows: pagedRowsObj
              }));
              return;
            }

            // 7. Visualization API
            if (cleanPath === '/api/visualization') {
              if (!activeDatasetRecord || !activeParsedData) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, hasDataset: false, message: 'No active dataset loaded.'}));
                return;
              }

              const chartType = (urlObj.searchParams.get('chartType') || 'bar').toLowerCase();
              let xAxis = urlObj.searchParams.get('xAxis') || '';
              let yAxis = urlObj.searchParams.get('yAxis') || '';
              const aggregation = (urlObj.searchParams.get('aggregation') || 'count').toLowerCase();
              const numBins = Math.max(3, Math.min(20, parseInt(urlObj.searchParams.get('bins') || '8')));

              const headers = activeParsedData.headers;
              const rows = activeParsedData.rows;
              const analysis = analyzeDataset(headers, rows);

              if (!xAxis && headers.length > 0) {
                const cat = analysis.columns.find(c => c.type === 'CATEGORICAL' || c.type === 'BOOLEAN');
                xAxis = cat ? cat.name : headers[0];
              }
              if (!yAxis && headers.length > 1) {
                const num = analysis.columns.find(c => c.type === 'NUMERIC' && c.name !== xAxis);
                if (num) yAxis = num.name;
              }

              const xColIdx = headers.indexOf(xAxis);
              const yColIdx = yAxis ? headers.indexOf(yAxis) : -1;

              const labels: string[] = [];
              const dataPoints: any[] = [];
              let datasetLabel = yAxis ? `${aggregation.toUpperCase()} of ${yAxis}` : `Count by ${xAxis}`;

              if (chartType === 'histogram' && xColIdx !== -1) {
                const nums = rows
                  .map(r => Number((r[xColIdx] || '').replace(/[$,%]/g, '').trim()))
                  .filter(n => !isNaN(n))
                  .sort((a, b) => a - b);

                if (nums.length > 0) {
                  const min = nums[0];
                  const max = nums[nums.length - 1];
                  const binSize = (max - min) / numBins || 1;
                  const bins = new Array(numBins).fill(0);

                  for (const n of nums) {
                    let b = Math.floor((n - min) / binSize);
                    if (b >= numBins) b = numBins - 1;
                    bins[b]++;
                  }

                  for (let i = 0; i < numBins; i++) {
                    const bStart = min + i * binSize;
                    const bEnd = bStart + binSize;
                    labels.push(`${bStart.toFixed(1)} - ${bEnd.toFixed(1)}`);
                    dataPoints.push(bins[i]);
                  }
                  datasetLabel = `Frequency Distribution of ${xAxis}`;
                }
              } else if (chartType === 'scatter' && xColIdx !== -1 && yColIdx !== -1) {
                // Scatter plot with 2 numeric variables
                datasetLabel = `${xAxis} vs ${yAxis}`;
                const scatterPoints: Array<{ x: number; y: number }> = [];
                for (const r of rows) {
                  const xVal = Number((r[xColIdx] || '').replace(/[$,%]/g, '').trim());
                  const yVal = Number((r[yColIdx] || '').replace(/[$,%]/g, '').trim());
                  if (!isNaN(xVal) && !isNaN(yVal)) {
                    scatterPoints.push({ x: xVal, y: yVal });
                  }
                }
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({
                  success: true,
                  hasDataset: true,
                  chartType,
                  xAxis,
                  yAxis,
                  title: datasetLabel,
                  datasetLabel,
                  scatterPoints: scatterPoints.slice(0, 500),
                  data: scatterPoints.slice(0, 500),
                  availableColumns: analysis.columns.map(c => ({ name: c.name, dataType: c.type, type: c.type }))
                }));
                return;
              } else if (chartType === 'boxplot') {
                // Boxplot: 5-number summary across numeric columns
                const boxColumns = analysis.columns.filter(c => c.type === 'NUMERIC').slice(0, 6);
                const boxData = boxColumns.map(c => ({
                  name: c.name,
                  min: c.min ?? 0,
                  q25: c.q25 ?? 0,
                  median: c.median ?? 0,
                  q75: c.q75 ?? 0,
                  max: c.max ?? 0,
                  outliers: c.outlierCount ?? 0
                }));
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({
                  success: true,
                  hasDataset: true,
                  chartType,
                  title: 'Numeric Distribution Box Plots',
                  boxData,
                  labels: boxData.map(b => b.name),
                  availableColumns: analysis.columns.map(c => ({ name: c.name, dataType: c.type, type: c.type }))
                }));
                return;
              } else if (chartType === 'correlation_heatmap') {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({
                  success: true,
                  hasDataset: true,
                  chartType,
                  title: 'Pearson Correlation Matrix Heatmap',
                  correlationMatrix: analysis.correlationMatrix,
                  numericColumns: Object.keys(analysis.correlationMatrix),
                  availableColumns: analysis.columns.map(c => ({ name: c.name, dataType: c.type, type: c.type }))
                }));
                return;
              } else {
                const groups: Record<string, number[]> = {};
                for (const r of rows) {
                  const xVal = (xColIdx >= 0 && r[xColIdx] ? r[xColIdx].trim() : 'Unknown') || '(Empty)';
                  if (!groups[xVal]) groups[xVal] = [];

                  if (yColIdx >= 0 && r[yColIdx]) {
                    const n = Number(r[yColIdx].replace(/[$,%]/g, '').trim());
                    groups[xVal].push(isNaN(n) ? 0 : n);
                  } else {
                    groups[xVal].push(1);
                  }
                }

                const entries = Object.entries(groups).slice(0, 15);
                for (const [key, vals] of entries) {
                  labels.push(key);
                  if (aggregation === 'sum') {
                    const sum = vals.reduce((a, b) => a + b, 0);
                    dataPoints.push(Math.round(sum * 100) / 100);
                  } else if (aggregation === 'avg' || aggregation === 'average') {
                    const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
                    dataPoints.push(Math.round(avg * 100) / 100);
                  } else if (aggregation === 'min') {
                    dataPoints.push(Math.min(...vals));
                  } else if (aggregation === 'max') {
                    dataPoints.push(Math.max(...vals));
                  } else {
                    dataPoints.push(vals.length);
                  }
                }
              }

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                hasDataset: true,
                chartType,
                xAxis,
                yAxis,
                aggregation,
                title: datasetLabel,
                datasetLabel,
                labels,
                data: dataPoints,
                values: dataPoints,
                availableColumns: analysis.columns.map(c => ({ name: c.name, dataType: c.type, type: c.type }))
              }));
              return;
            }

            // 8. Insights API
            if (cleanPath === '/api/insights') {
              if (!activeDatasetRecord || !activeParsedData) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, hasDataset: false, message: 'No active dataset loaded.'}));
                return;
              }
              const analysis = analyzeDataset(activeParsedData.headers, activeParsedData.rows);
              const score = activeDatasetRecord.qualityScore;
              let healthRating = 'Excellent';
              if (score < 60) healthRating = 'Needs Attention';
              else if (score < 75) healthRating = 'Fair';
              else if (score < 90) healthRating = 'Good';

              const structuredInsights = [
                {
                  title: 'Dataset Profile',
                  category: 'Dataset Health',
                  type: 'good',
                  description: `Dataset contains ${analysis.rowCount} total records across ${analysis.colCount} attributes (${analysis.numericCols} numeric, ${analysis.categoricalCols} categorical, ${analysis.dateCols} date).`
                },
                {
                  title: 'Data Health Rating',
                  category: 'Quality Score',
                  type: score >= 85 ? 'good' : (score >= 65 ? 'warning' : 'danger'),
                  description: `Overall quality score is ${score}/100. ${score >= 85 ? 'High integrity for analytical queries.' : 'Data cleaning recommended to resolve hygiene issues.'}`
                },
                {
                  title: 'Completeness Profile',
                  category: 'Missing Values',
                  type: analysis.totalMissing === 0 ? 'good' : (analysis.completeness > 90 ? 'warning' : 'danger'),
                  description: analysis.totalMissing === 0 
                    ? '100% complete: No missing data detected in any column.' 
                    : `${analysis.totalMissing} empty fields detected (${analysis.completeness}% completeness).`
                },
                {
                  title: 'Record Uniqueness',
                  category: 'Duplicate Detection',
                  type: analysis.duplicateCount === 0 ? 'good' : 'warning',
                  description: analysis.duplicateCount === 0
                    ? 'No duplicate rows found. Every record is unique.'
                    : `${analysis.duplicateCount} duplicate records identified (${analysis.uniqueness}% uniqueness).`
                }
              ];

              // Add distribution/outlier insights
              analysis.columns.filter(c => c.type === 'NUMERIC' && (c.outlierCount || 0) > 0).forEach(c => {
                structuredInsights.push({
                  title: `Outlier Concentration: ${c.name}`,
                  category: 'Statistical Outliers',
                  type: (c.outlierCount || 0) > analysis.rowCount * 0.05 ? 'warning' : 'info',
                  description: `Detected ${c.outlierCount} outliers outside Tukey IQR fences in '${c.name}' (Min: ${c.min}, Max: ${c.max}, Mean: ${c.mean}).`
                });
              });

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                hasDataset: true,
                datasetName: activeDatasetRecord.originalName,
                qualityScore: score,
                healthRating,
                insights: structuredInsights,
                rawInsights: analysis.insights
              }));
              return;
            }

            // 9. Data Cleaning Studio API (/api/cleaning/preview, /api/cleaning/apply, /api/cleaning/restore)
            if (cleanPath.startsWith('/api/cleaning')) {
              if (!activeDatasetRecord || !activeParsedData) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, message: 'No active dataset loaded for cleaning.'}));
                return;
              }

              if (cleanPath === '/api/cleaning/restore' && req.method === 'POST') {
                const chunks: Buffer[] = [];
                req.on('data', c => chunks.push(c));
                await new Promise(r => req.on('end', r));
                const bodyStr = Buffer.concat(chunks).toString('utf-8');
                let targetId: number | null = null;
                try {
                  const json = JSON.parse(bodyStr);
                  targetId = json.datasetId || json.id;
                } catch {
                  const params = new URLSearchParams(bodyStr);
                  targetId = parseInt(params.get('datasetId') || params.get('id') || '0');
                }

                const target = datasetHistory.find(d => d.id === targetId && d.userId === currentSessionUser?.id);
                if (target && fs.existsSync(target.filePath) && currentSessionUser) {
                  activateUserDataset(currentSessionUser.id, target.id);
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: true, message: `Restored dataset '${target.originalName}' successfully!`, activeDatasetId: target.id}));
                  return;
                }
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, message: 'Failed to find or restore target version.'}));
                return;
              }

              // Read operations
              let operations: CleaningOperationItem[] = [];
              let customVersionName = '';
              if (req.method === 'POST') {
                const chunks: Buffer[] = [];
                req.on('data', c => chunks.push(c));
                await new Promise(r => req.on('end', r));
                const bodyStr = Buffer.concat(chunks).toString('utf-8');
                try {
                  const json = JSON.parse(bodyStr);
                  operations = json.operations || [];
                  customVersionName = json.versionName || '';
                } catch {
                  // fallback empty
                }
              }

              const cleanResult = processCleaningOperations(activeParsedData.headers, activeParsedData.rows, operations);

              if (cleanPath === '/api/cleaning/apply') {
                const now = new Date();
                const pad = (n: number) => String(n).padStart(2, '0');
                const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
                const newName = customVersionName || `Cleaned_${activeDatasetRecord.originalName}`;
                const storedFileName = `cleaned_${timestamp}_${activeDatasetRecord.storedName}`;

                const uploadDir = path.resolve(process.cwd(), 'data', 'uploads');
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, {recursive: true});

                const newFilePath = path.join(uploadDir, storedFileName);
                const csvContent = rowsToCSVString(cleanResult.headers, cleanResult.transformedRows);
                fs.writeFileSync(newFilePath, csvContent, 'utf-8');

                const newAnalysis = analyzeDataset(cleanResult.headers, cleanResult.transformedRows);
                const newRecord: DatasetRecord = {
                  id: datasetIdSeq++,
                  userId: currentSessionUser?.id,
                  originalName: newName,
                  storedName: storedFileName,
                  filePath: newFilePath,
                  fileSize: Buffer.byteLength(csvContent),
                  rowCount: cleanResult.cleanedRowCount,
                  columnCount: cleanResult.cleanedColumnCount,
                  numericCount: newAnalysis.numericCols,
                  categoricalCount: newAnalysis.categoricalCols,
                  missingCount: newAnalysis.totalMissing,
                  duplicateCount: newAnalysis.duplicateCount,
                  qualityScore: newAnalysis.qualityScore,
                  uploadTime: Date.now(),
                  status: 'ACTIVE'
                };
                if (currentSessionUser) {
                  for (const d of datasetHistory) {
                    if (d.userId === currentSessionUser.id) {
                      d.status = 'STORED';
                    }
                  }
                  setUserActiveDataset(currentSessionUser.id, newRecord, { headers: cleanResult.headers, rows: cleanResult.transformedRows });
                }
                datasetHistory.unshift(newRecord);

                logAuditAction(currentSessionUser?.id, 'CLEAN_VERSION_SAVED', newName, `Applied ${operations.length} cleaning operations and saved new version ID ${newRecord.id}.`, {
                  operations: cleanResult.appliedOperationsSummary,
                  originalRows: cleanResult.originalRowCount,
                  cleanedRows: cleanResult.cleanedRowCount
                });

                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({
                  success: true,
                  message: 'Cleaned dataset saved as new version!',
                  newDatasetId: newRecord.id,
                  newVersionName: newName,
                  affectedRows: cleanResult.affectedRowsCount,
                  affectedCells: cleanResult.affectedCellsCount,
                  appliedOperations: cleanResult.appliedOperationsSummary,
                  summary: cleanResult.appliedOperationsSummary,
                  newRowCount: cleanResult.cleanedRowCount,
                  newColumnCount: cleanResult.cleanedColumnCount,
                  newQualityScore: newAnalysis.qualityScore,
                  headers: cleanResult.headers,
                  rows: cleanResult.rows,
                  previewRows: cleanResult.previewRows,
                  originalHeaders: cleanResult.originalHeaders,
                  originalRows: cleanResult.originalRows,
                  changedCells: cleanResult.changedCells,
                  cellChanges: cleanResult.cellChanges
                }));
                return;
              }

              if (cleanPath === '/api/cleaning/download') {
                const csvStr = rowsToCSVString(cleanResult.headers, cleanResult.transformedRows);
                const safeName = (activeDatasetRecord.originalName || 'dataset').replace(/\.csv$/i, '') + '_cleaned.csv';
                res.writeHead(200, {
                  'Content-Type': 'text/csv;charset=UTF-8',
                  'Content-Disposition': `attachment; filename="${safeName}"`
                });
                res.end(csvStr);
                return;
              }

              // Default: /api/cleaning/preview or /api/cleaning
              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                originalRowCount: cleanResult.originalRowCount,
                cleanedRowCount: cleanResult.cleanedRowCount,
                originalColumnCount: cleanResult.originalColumnCount,
                cleanedColumnCount: cleanResult.cleanedColumnCount,
                originalRows: cleanResult.originalRows,
                remainingRows: cleanResult.remainingRows,
                rowsRemoved: cleanResult.rowsRemoved,
                originalColumns: cleanResult.originalColumns,
                remainingColumns: cleanResult.remainingColumns,
                columnsRemoved: cleanResult.columnsRemoved,
                cellsModified: cleanResult.cellsModified,
                missingValuesBefore: cleanResult.missingValuesBefore,
                missingValuesAfter: cleanResult.missingValuesAfter,
                duplicateRowsBefore: cleanResult.duplicateRowsBefore,
                duplicateRowsAfter: cleanResult.duplicateRowsAfter,
                qualityScoreBefore: cleanResult.qualityScoreBefore,
                qualityScoreAfter: cleanResult.qualityScoreAfter,
                noChangesMessage: cleanResult.noChangesMessage,
                affectedRowsCount: cleanResult.affectedRowsCount,
                affectedCellsCount: cleanResult.affectedCellsCount,
                headers: cleanResult.headers,
                rows: cleanResult.rows,
                previewRows: cleanResult.previewRows,
                originalHeaders: cleanResult.originalHeaders,
                changedCells: cleanResult.changedCells,
                cellChanges: cleanResult.cellChanges,
                summary: cleanResult.appliedOperationsSummary,
                appliedOperationsSummary: cleanResult.appliedOperationsSummary
              }));
              return;
            }

            // 10. Custom Validation Rules API (/api/validation, /api/validation/add, /api/validation/delete, /api/validation/export)
            if (cleanPath.startsWith('/api/validation')) {
              if (!currentSessionUser) {
                res.writeHead(401, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, message: 'Please login first'}));
                return;
              }

              const userId = currentSessionUser.id;
              let userRules = userValidationRulesMap.get(userId) || [];

              if ((cleanPath === '/api/validation/add' || cleanPath === '/api/validation') && req.method === 'POST') {
                const chunks: Buffer[] = [];
                req.on('data', c => chunks.push(c));
                await new Promise(r => req.on('end', r));
                const bodyStr = Buffer.concat(chunks).toString('utf-8');
                try {
                  let json: any = {};
                  try {
                    json = JSON.parse(bodyStr);
                  } catch {
                    const params = new URLSearchParams(bodyStr);
                    json = {
                      name: params.get('name') || params.get('ruleName') || '',
                      columnName: params.get('columnName') || params.get('targetColumn') || '',
                      ruleType: params.get('ruleType') || 'NO_MISSING',
                      minValue: params.get('minValue') || params.get('minVal') || undefined,
                      maxValue: params.get('maxValue') || params.get('maxVal') || undefined,
                      allowedValues: params.get('allowedValues') ? params.get('allowedValues')!.split(',') : []
                    };
                  }
                  const ruleName = (json.name || json.ruleName || '').trim();
                  if (!ruleName) {
                    res.writeHead(400, {'Content-Type': 'application/json;charset=UTF-8'});
                    res.end(JSON.stringify({success: false, message: 'Rule Name is required.'}));
                    return;
                  }

                  const colName = (json.columnName || json.targetColumn || '').trim();
                  if (!colName) {
                    res.writeHead(400, {'Content-Type': 'application/json;charset=UTF-8'});
                    res.end(JSON.stringify({success: false, message: 'Target Column is required.'}));
                    return;
                  }

                  const ruleType = json.ruleType || 'NO_MISSING';
                  const minVal = (json.minValue !== undefined && json.minValue !== null && json.minValue !== '') ? Number(json.minValue) : undefined;
                  const maxVal = (json.maxValue !== undefined && json.maxValue !== null && json.maxValue !== '') ? Number(json.maxValue) : undefined;

                  if (ruleType === 'NUMERIC_RANGE') {
                    if (minVal === undefined && maxVal === undefined) {
                      res.writeHead(400, {'Content-Type': 'application/json;charset=UTF-8'});
                      res.end(JSON.stringify({success: false, message: 'Please enter at least one boundary (Min or Max) for Numeric Range.'}));
                      return;
                    }
                    if (minVal !== undefined && maxVal !== undefined && minVal > maxVal) {
                      res.writeHead(400, {'Content-Type': 'application/json;charset=UTF-8'});
                      res.end(JSON.stringify({success: false, message: 'Minimum value cannot be greater than Maximum value.'}));
                      return;
                    }
                  }

                  let allowedList: string[] = [];
                  if (Array.isArray(json.allowedValues)) {
                    allowedList = json.allowedValues.map((s: string) => String(s).trim()).filter(Boolean);
                  } else if (json.allowedValues) {
                    allowedList = String(json.allowedValues).split(',').map((s: string) => s.trim()).filter(Boolean);
                  }

                  if (ruleType === 'ALLOWED_VALUES' && allowedList.length === 0) {
                    res.writeHead(400, {'Content-Type': 'application/json;charset=UTF-8'});
                    res.end(JSON.stringify({success: false, message: 'Please provide one or more comma-separated allowed values.'}));
                    return;
                  }

                  const newRule: ValidationRuleItem = {
                    id: `rule_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    userId,
                    datasetId: activeDatasetRecord ? activeDatasetRecord.id : (json.datasetId || null),
                    createdAt: Date.now(),
                    name: ruleName,
                    ruleType,
                    columnName: colName,
                    minValue: minVal,
                    maxValue: maxVal,
                    allowedValues: allowedList,
                    status: 'UNTESTED',
                    failedCount: 0,
                    failureRate: 0.0,
                    exampleFailedRows: [],
                    exampleViolations: []
                  };

                  userRules.push(newRule);
                  userValidationRulesMap.set(userId, userRules);
                  logAuditAction(userId, 'VALIDATION_RULE_ADDED', activeDatasetRecord?.originalName || 'Global', `Added validation rule '${newRule.name}' (${newRule.ruleType}) on '${newRule.columnName}'.`);

                  let evaluated = userRules;
                  if (activeParsedData) {
                    evaluated = evaluateValidationRules(userRules, activeParsedData.headers, activeParsedData.rows);
                  }
                  const addedEvaluated = evaluated.find(r => r.id === newRule.id) || newRule;

                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({
                    success: true,
                    message: 'Validation rule added successfully.',
                    rule: addedEvaluated,
                    rules: evaluated
                  }));
                  return;
                } catch {
                  res.writeHead(400, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({success: false, message: 'Invalid JSON payload.'}));
                  return;
                }
              }

              if (cleanPath === '/api/validation/delete' || (cleanPath === '/api/validation' && req.method === 'DELETE')) {
                let ruleId = urlObj.searchParams.get('id') || urlObj.searchParams.get('ruleId');
                if (!ruleId && req.method === 'POST') {
                  const chunks: Buffer[] = [];
                  req.on('data', c => chunks.push(c));
                  await new Promise(r => req.on('end', r));
                  try {
                    const bJson = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
                    ruleId = bJson.ruleId || bJson.id;
                  } catch {}
                }

                let deleted = false;
                if (ruleId) {
                  const initialLen = userRules.length;
                  userRules = userRules.filter(r => r.id !== ruleId);
                  deleted = userRules.length < initialLen;
                  userValidationRulesMap.set(userId, userRules);
                  if (deleted) {
                    logAuditAction(userId, 'VALIDATION_RULE_DELETED', activeDatasetRecord?.originalName || 'Global', `Deleted validation rule ID '${ruleId}'.`);
                  }
                }
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: deleted, message: deleted ? 'Validation rule deleted.' : 'Rule not found.'}));
                return;
              }

              // Evaluate rules on active dataset if available
              let evaluated = userRules;
              if (activeParsedData) {
                evaluated = evaluateValidationRules(userRules, activeParsedData.headers, activeParsedData.rows);
              }

              if (cleanPath === '/api/validation/export') {
                const csvHeader = 'Rule Name,Column,Rule Type,Status,Total Evaluated Rows,Violations Count,Failure Rate (%),Example Violations';
                const csvRows = evaluated.map(r => {
                  const ex = r.exampleViolations && r.exampleViolations.length > 0
                    ? r.exampleViolations.join('; ')
                    : (r.exampleFailedRows && r.exampleFailedRows.length > 0 ? `Rows: ${r.exampleFailedRows.join(', ')}` : 'None');
                  return `"${(r.name || '').replace(/"/g, '""')}","${(r.columnName || '').replace(/"/g, '""')}","${r.ruleType}","${r.status}",${r.totalRows || (activeParsedData ? activeParsedData.rows.length : 0)},${r.failedCount},${r.failureRate}%,"${ex.replace(/"/g, '""')}"`;
                });
                const fullCsv = [csvHeader, ...csvRows].join('\n');
                res.writeHead(200, {
                  'Content-Type': 'text/csv;charset=UTF-8',
                  'Content-Disposition': 'attachment; filename="validation_results.csv"'
                });
                res.end(fullCsv);
                logAuditAction(userId, 'EXPORT_VALIDATION_RESULTS', activeDatasetRecord?.originalName || 'Global', 'Exported validation results report CSV.');
                return;
              }

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                hasDataset: Boolean(activeDatasetRecord),
                rules: evaluated
              }));
              return;
            }

            // 11. Version Comparison API (/api/comparison, /api/comparison/versions)
            if (cleanPath.startsWith('/api/comparison')) {
              if (cleanPath === '/api/comparison/versions') {
                const userHistory = datasetHistory.filter(d => d.userId === currentSessionUser?.id);
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({
                  success: true,
                  versions: userHistory.map(d => {
                    const name = d.originalName || '';
                    const family = name.replace(/^(v\d+_|cleaned_)/, '').trim() || 'Unknown';
                    const isCleaned = name.startsWith('cleaned_') || /^v\d+_/.test(name);
                    return {
                      id: d.id,
                      name: d.originalName,
                      datasetFamily: family,
                      isCleanedVersion: isCleaned,
                      rowCount: d.rowCount,
                      columnCount: d.columnCount,
                      qualityScore: d.qualityScore,
                      uploadTime: d.uploadTime,
                      uploadedAt: new Date(d.uploadTime).toISOString().slice(0, 19).replace('T', ' ')
                    };
                  })
                }));
                return;
              }

              const baseIdStr = urlObj.searchParams.get('baseId');
              const targetIdStr = urlObj.searchParams.get('targetId');

              if (!baseIdStr || !targetIdStr) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, message: 'Please specify baseId and targetId parameters.'}));
                return;
              }

              const baseId = parseInt(baseIdStr);
              const targetId = parseInt(targetIdStr);

              const baseRecord = datasetHistory.find(d => d.id === baseId && d.userId === currentSessionUser?.id);
              const targetRecord = datasetHistory.find(d => d.id === targetId && d.userId === currentSessionUser?.id);

              if (!baseRecord || !targetRecord || !fs.existsSync(baseRecord.filePath) || !fs.existsSync(targetRecord.filePath)) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, message: 'One or both version records could not be found.'}));
                return;
              }

              const baseContent = fs.readFileSync(baseRecord.filePath, 'utf-8');
              const targetContent = fs.readFileSync(targetRecord.filePath, 'utf-8');
              const baseParsed = parseCSVString(baseContent);
              const targetParsed = parseCSVString(targetContent);
              const baseAnalysis = analyzeDataset(baseParsed.headers, baseParsed.rows);
              const targetAnalysis = analyzeDataset(targetParsed.headers, targetParsed.rows);

              const addedCols = targetParsed.headers.filter(h => !baseParsed.headers.includes(h));
              const removedCols = baseParsed.headers.filter(h => !targetParsed.headers.includes(h));
              const commonCols = baseParsed.headers.filter(h => targetParsed.headers.includes(h));

              // Lineage classification
              const normBase = (baseRecord.originalName || '').replace(/^(v\d+_|cleaned_)/, '').toLowerCase();
              const normTarget = (targetRecord.originalName || '').replace(/^(v\d+_|cleaned_)/, '').toLowerCase();
              const maxHeaders = Math.max(baseParsed.headers.length, targetParsed.headers.length);
              const overlapRatio = maxHeaders > 0 ? (commonCols.length / maxHeaders) : 0;
              const isLineage = normBase === normTarget || overlapRatio >= 0.5 || baseId === targetId;

              const comparisonType = isLineage ? 'LINEAGE' : 'CROSS_DATASET';
              const comparisonTypeLabel = isLineage ? 'Dataset Lineage Comparison' : 'Cross-Dataset Comparative Analysis';
              const comparisonBannerMessage = isLineage
                ? `Comparing versions within the same dataset lineage (${baseRecord.originalName} → ${targetRecord.originalName}). Schema changes and metric shifts reflect progressive cleaning or transformation steps.`
                : `Notice: These two datasets originate from different domains with distinct schemas (${baseRecord.originalName} vs ${targetRecord.originalName}). Observed differences reflect cross-dataset divergences rather than version progression.`;

              // Record turnover
              let rowsRetained = 0;
              let rowsRemoved = 0;
              let rowsAdded = 0;
              let recordLevelExplanation = '';

              if (commonCols.length > 0) {
                const baseFreq = new Map<string, number>();
                for (const row of baseParsed.rows) {
                  const key = commonCols.map(col => {
                    const idx = baseParsed.headers.indexOf(col);
                    return idx >= 0 && idx < row.length ? row[idx] : '';
                  }).join('§');
                  baseFreq.set(key, (baseFreq.get(key) || 0) + 1);
                }

                for (const row of targetParsed.rows) {
                  const key = commonCols.map(col => {
                    const idx = targetParsed.headers.indexOf(col);
                    return idx >= 0 && idx < row.length ? row[idx] : '';
                  }).join('§');
                  const count = baseFreq.get(key) || 0;
                  if (count > 0) {
                    rowsRetained++;
                    baseFreq.set(key, count - 1);
                  }
                }

                rowsRemoved = Math.max(0, baseRecord.rowCount - rowsRetained);
                rowsAdded = Math.max(0, targetRecord.rowCount - rowsRetained);

                if (isLineage) {
                  if (rowsRemoved > 0 && rowsAdded === 0) {
                    recordLevelExplanation = `Retained ${rowsRetained} of ${baseRecord.rowCount} base records; removed ${rowsRemoved} records (such as duplicate rows or unrecoverable entries).`;
                  } else if (rowsAdded > 0 && rowsRemoved === 0) {
                    recordLevelExplanation = `Retained all ${rowsRetained} base records; ingested or appended ${rowsAdded} new records.`;
                  } else if (rowsRemoved === 0 && rowsAdded === 0) {
                    recordLevelExplanation = `All ${rowsRetained} base records were preserved with 100% record-level retention.`;
                  } else {
                    recordLevelExplanation = `Retained ${rowsRetained} base records, removed ${rowsRemoved} records, and added ${rowsAdded} new records.`;
                  }
                } else {
                  recordLevelExplanation = `Cross-dataset comparison: ${rowsRetained} matching records found across shared columns; ${rowsRemoved} unique to Base, ${rowsAdded} unique to Target.`;
                }
              } else {
                rowsRetained = 0;
                rowsRemoved = baseRecord.rowCount;
                rowsAdded = targetRecord.rowCount;
                recordLevelExplanation = 'No shared columns exist between these two datasets. Record turnover cannot be traced at the row level.';
              }

              // Schema Evolution Table
              const schemaTable: Array<{ columnName: string; baseType: string; targetType: string; status: string }> = [];
              const typeChanges: Record<string, string> = {};

              baseParsed.headers.forEach(col => {
                const bCol = baseAnalysis.columns.find(c => c.name === col);
                const bType = bCol ? bCol.type : 'UNKNOWN';
                if (targetParsed.headers.includes(col)) {
                  const tCol = targetAnalysis.columns.find(c => c.name === col);
                  const tType = tCol ? tCol.type : 'UNKNOWN';
                  const status = bType === tType ? 'RETAINED' : 'TYPE_CHANGED';
                  if (bType !== tType) {
                    typeChanges[col] = `${bType} -> ${tType}`;
                  }
                  schemaTable.push({ columnName: col, baseType: bType, targetType: tType, status });
                } else {
                  schemaTable.push({ columnName: col, baseType: bType, targetType: 'NONE', status: 'REMOVED' });
                }
              });

              targetParsed.headers.forEach(col => {
                if (!baseParsed.headers.includes(col)) {
                  const tCol = targetAnalysis.columns.find(c => c.name === col);
                  schemaTable.push({ columnName: col, baseType: 'NONE', targetType: tCol ? tCol.type : 'UNKNOWN', status: 'ADDED' });
                }
              });

              // Outlier counts
              let baseOutliers = 0;
              baseAnalysis.columns.forEach(c => { baseOutliers += (c.outlierCount || 0); });
              let targetOutliers = 0;
              targetAnalysis.columns.forEach(c => { targetOutliers += (c.outlierCount || 0); });

              // Numeric shifts & drift
              const meanShifts: Record<string, number> = {};
              const medianShifts: Record<string, number> = {};
              const numericComparisons: Array<any> = [];

              commonCols.forEach(col => {
                const bCol = baseAnalysis.columns.find(c => c.name === col);
                const tCol = targetAnalysis.columns.find(c => c.name === col);
                if (bCol && tCol) {
                  const bNum = bCol.type === 'NUMERIC';
                  const tNum = tCol.type === 'NUMERIC';
                  if (bNum && tNum) {
                    const bMean = bCol.mean !== undefined ? Math.round(bCol.mean * 100) / 100 : null;
                    const tMean = tCol.mean !== undefined ? Math.round(tCol.mean * 100) / 100 : null;
                    let absShift: number | null = null;
                    let pctChange: number | null = null;
                    let explanation = '';

                    if (bMean !== null && tMean !== null) {
                      absShift = Math.round((tMean - bMean) * 100) / 100;
                      meanShifts[col] = absShift;
                      if (Math.abs(bMean) > 0.0001) {
                        pctChange = Math.round(((tMean - bMean) / Math.abs(bMean) * 100) * 10) / 10;
                        explanation = `Mean shifted by ${absShift >= 0 ? '+' : ''}${absShift} (${pctChange >= 0 ? '+' : ''}${pctChange}%).`;
                      } else {
                        pctChange = 0;
                        explanation = `Mean shifted by ${absShift >= 0 ? '+' : ''}${absShift}.`;
                      }
                    }

                    const bMed = bCol.median !== undefined ? Math.round(bCol.median * 100) / 100 : null;
                    const tMed = tCol.median !== undefined ? Math.round(tCol.median * 100) / 100 : null;
                    let medShift: number | null = null;
                    if (bMed !== null && tMed !== null) {
                      medShift = Math.round((tMed - bMed) * 100) / 100;
                      medianShifts[col] = medShift;
                    }

                    numericComparisons.push({
                      columnName: col,
                      baseMean: bMean,
                      targetMean: tMean,
                      absoluteShift: absShift,
                      percentageChange: pctChange,
                      baseMedian: bMed,
                      targetMedian: tMed,
                      medianShift: medShift,
                      status: 'COMPARABLE',
                      explanation
                    });
                  } else if (bNum || tNum) {
                    numericComparisons.push({
                      columnName: col,
                      baseMean: null,
                      targetMean: null,
                      absoluteShift: null,
                      percentageChange: null,
                      baseMedian: null,
                      targetMedian: null,
                      medianShift: null,
                      status: 'TYPE_MISMATCH',
                      explanation: `Column type shifted between versions (${bCol.type} vs ${tCol.type}). Numerical drift cannot be calculated.`
                    });
                  }
                }
              });

              // Add removed numeric cols
              removedCols.forEach(col => {
                const bCol = baseAnalysis.columns.find(c => c.name === col);
                if (bCol && bCol.type === 'NUMERIC') {
                  numericComparisons.push({
                    columnName: col,
                    baseMean: bCol.mean !== undefined ? Math.round(bCol.mean * 100) / 100 : null,
                    targetMean: null,
                    absoluteShift: null,
                    percentageChange: null,
                    baseMedian: null,
                    targetMedian: null,
                    medianShift: null,
                    status: 'ABSENT_IN_TARGET',
                    explanation: 'Column dropped or removed in target version.'
                  });
                }
              });

              // Add added numeric cols
              addedCols.forEach(col => {
                const tCol = targetAnalysis.columns.find(c => c.name === col);
                if (tCol && tCol.type === 'NUMERIC') {
                  numericComparisons.push({
                    columnName: col,
                    baseMean: null,
                    targetMean: tCol.mean !== undefined ? Math.round(tCol.mean * 100) / 100 : null,
                    absoluteShift: null,
                    percentageChange: null,
                    baseMedian: null,
                    targetMedian: null,
                    medianShift: null,
                    status: 'ABSENT_IN_BASE',
                    explanation: 'New numeric column introduced in target version.'
                  });
                }
              });

              let numericComparisonMessage = '';
              if (numericComparisons.length === 0 || !numericComparisons.some(i => i.status === 'COMPARABLE')) {
                if (!isLineage) {
                  numericComparisonMessage = `No shared numeric columns exist between these two distinct datasets. Columns in ${baseRecord.originalName} (${baseParsed.headers.join(', ')}) vs ${targetRecord.originalName} (${targetParsed.headers.join(', ')}).`;
                } else {
                  numericComparisonMessage = 'No numeric columns with continuous distributions were detected in these dataset versions.';
                }
              }

              // Executive Summary & Overall Verdict Generation
              const improvements: string[] = [];
              const deteriorations: string[] = [];
              const neutralObservations: string[] = [];

              const dupDelta = targetRecord.duplicateCount - baseRecord.duplicateCount;
              if (dupDelta < 0) {
                improvements.push(`Duplicate rows reduced by ${Math.abs(dupDelta)} (from ${baseRecord.duplicateCount} to ${targetRecord.duplicateCount}).`);
              } else if (dupDelta > 0) {
                deteriorations.push(`Duplicate rows increased by ${dupDelta} (from ${baseRecord.duplicateCount} to ${targetRecord.duplicateCount}).`);
              }

              const missDelta = targetRecord.missingCount - baseRecord.missingCount;
              if (missDelta < 0) {
                improvements.push(`Missing values decreased by ${Math.abs(missDelta)} (from ${baseRecord.missingCount} to ${targetRecord.missingCount}).`);
              } else if (missDelta > 0) {
                deteriorations.push(`Missing values increased by ${missDelta} (from ${baseRecord.missingCount} to ${targetRecord.missingCount}).`);
              }

              const outlDelta = targetOutliers - baseOutliers;
              if (outlDelta < 0) {
                improvements.push(`Outlier anomalies reduced by ${Math.abs(outlDelta)} across numeric columns.`);
              } else if (outlDelta > 0) {
                deteriorations.push(`Outlier anomalies increased by ${outlDelta}.`);
              }

              const qualDelta = targetRecord.qualityScore - baseRecord.qualityScore;
              if (qualDelta > 0) {
                improvements.push(`Overall Data Health Score improved by +${qualDelta} points (${baseRecord.qualityScore} -> ${targetRecord.qualityScore}).`);
              } else if (qualDelta < 0) {
                deteriorations.push(`Overall Data Health Score declined by ${qualDelta} points (${baseRecord.qualityScore} -> ${targetRecord.qualityScore}).`);
              }

              const compDelta = Math.round((targetAnalysis.completeness - baseAnalysis.completeness) * 10) / 10;
              if (compDelta > 0) {
                improvements.push(`Completeness improved by +${compDelta}% (${baseAnalysis.completeness.toFixed(1)}% -> ${targetAnalysis.completeness.toFixed(1)}%).`);
              } else if (compDelta < 0) {
                deteriorations.push(`Completeness dropped by ${compDelta}%.`);
              }

              if (addedCols.length > 0) {
                neutralObservations.push(`Added ${addedCols.length} new column(s): ${addedCols.join(', ')}.`);
              }
              if (removedCols.length > 0) {
                neutralObservations.push(`Removed ${removedCols.length} column(s): ${removedCols.join(', ')}.`);
              }
              const rowDelta = targetRecord.rowCount - baseRecord.rowCount;
              if (rowDelta !== 0) {
                neutralObservations.push(`Row volume shifted from ${baseRecord.rowCount} to ${targetRecord.rowCount} (Net change: ${rowDelta >= 0 ? '+' : ''}${rowDelta} rows).`);
              }

              let overallVerdict = 'UNCHANGED';
              let summaryText = '';
              if (!isLineage) {
                overallVerdict = 'CROSS_DATASET';
                summaryText = `Cross-dataset comparative analysis between ${baseRecord.originalName} and ${targetRecord.originalName}. Discrepancies represent distinct dataset structures rather than a progression.`;
              } else if (qualDelta > 0 || (improvements.length > 0 && deteriorations.length === 0)) {
                overallVerdict = 'IMPROVED';
                summaryText = `Target version shows verified quality improvements with ${improvements.length > 0 ? improvements[0] : 'higher health index'}.`;
              } else if (qualDelta < 0 || (deteriorations.length > 0 && improvements.length === 0)) {
                overallVerdict = 'DEGRADED';
                summaryText = 'Target version exhibits lower data hygiene metrics than the base version.';
              } else {
                overallVerdict = 'UNCHANGED';
                summaryText = 'Dataset versions maintain equivalent overall health scores.';
              }

              const isIdentical = (baseId === targetId) || (
                baseRecord.rowCount === targetRecord.rowCount &&
                baseRecord.columnCount === targetRecord.columnCount &&
                baseRecord.missingCount === targetRecord.missingCount &&
                baseRecord.qualityScore === targetRecord.qualityScore &&
                addedCols.length === 0 &&
                removedCols.length === 0 &&
                Object.keys(typeChanges).length === 0
              );

              logAuditAction(currentSessionUser?.id, 'COMPARE_VERSIONS', baseRecord.originalName, `Compared version '${baseRecord.originalName}' (ID: ${baseId}) vs '${targetRecord.originalName}' (ID: ${targetId}).`);

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                comparisonType,
                comparisonTypeLabel,
                comparisonBannerMessage,
                baseDatasetId: baseRecord.id,
                targetDatasetId: targetRecord.id,
                baseVersionName: baseRecord.originalName,
                targetVersionName: targetRecord.originalName,
                baseUploadTime: baseRecord.uploadTime,
                targetUploadTime: targetRecord.uploadTime,

                // 1. Volume & Turnover
                baseRowCount: baseRecord.rowCount,
                targetRowCount: targetRecord.rowCount,
                rowCountDelta: rowDelta,
                baseColumnCount: baseRecord.columnCount,
                targetColumnCount: targetRecord.columnCount,
                columnCountDelta: targetRecord.columnCount - baseRecord.columnCount,
                rowsAdded,
                rowsRemoved,
                rowsRetained,
                recordLevelExplanation,

                // 2. Data Quality Dimensions
                baseQualityScore: baseRecord.qualityScore,
                targetQualityScore: targetRecord.qualityScore,
                qualityScoreDelta: qualDelta,
                baseCompletenessScore: Math.round(baseAnalysis.completeness * 10) / 10,
                targetCompletenessScore: Math.round(targetAnalysis.completeness * 10) / 10,
                completenessScoreDelta: compDelta,
                baseUniquenessScore: Math.round(baseAnalysis.uniqueness * 10) / 10,
                targetUniquenessScore: Math.round(targetAnalysis.uniqueness * 10) / 10,
                uniquenessScoreDelta: Math.round((targetAnalysis.uniqueness - baseAnalysis.uniqueness) * 10) / 10,
                baseMissingCount: baseRecord.missingCount,
                targetMissingCount: targetRecord.missingCount,
                missingCountDelta: missDelta,
                baseDuplicateCount: baseRecord.duplicateCount,
                targetDuplicateCount: targetRecord.duplicateCount,
                duplicatesDelta: dupDelta,
                baseOutlierCount: baseOutliers,
                targetOutlierCount: targetOutliers,
                outlierCountDelta: outlDelta,
                isIdentical,

                // 3. Columns & Schema
                addedColumns: addedCols,
                removedColumns: removedCols,
                commonColumns: commonCols,
                typeChanges,
                schemaTable,

                // 4. Numeric shifts
                numericComparisons,
                meanShifts,
                medianShifts,
                numericComparisonMessage,

                // 5. Summary & Verdict
                overallVerdict,
                summaryText,
                improvements,
                deteriorations,
                neutralObservations
              }));
              return;
            }

function escapePdfText(s: string): string {
  if (!s) return '';
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function generateViteExecutivePdf(record: DatasetRecord, analysis: any): Buffer {
  const width = 612;
  const height = 792;
  const pages: { commands: string[] }[] = [];
  let currentPage: { commands: string[] } = { commands: [] };
  pages.push(currentPage);
  let cursorY = 740;

  function newPage() {
    currentPage = { commands: [] };
    pages.push(currentPage);
    cursorY = 740;
  }

  function ensureSpace(needed: number) {
    if (cursorY - needed < 50) newPage();
  }

  function drawRect(x: number, y: number, w: number, h: number, fill?: [number, number, number], stroke?: [number, number, number], lineWidth = 1) {
    let cmd = 'q\n';
    if (fill) cmd += `${fill[0].toFixed(3)} ${fill[1].toFixed(3)} ${fill[2].toFixed(3)} rg\n`;
    if (stroke) cmd += `${stroke[0].toFixed(3)} ${stroke[1].toFixed(3)} ${stroke[2].toFixed(3)} RG\n${lineWidth} w\n`;
    cmd += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re\n`;
    if (fill && stroke) cmd += 'B\n';
    else if (fill) cmd += 'f\n';
    else if (stroke) cmd += 'S\n';
    cmd += 'Q\n';
    currentPage.commands.push(cmd);
  }

  function drawLine(x1: number, y1: number, x2: number, y2: number, stroke: [number, number, number] = [0.8, 0.85, 0.9], lineWidth = 1) {
    currentPage.commands.push(`q\n${stroke[0].toFixed(3)} ${stroke[1].toFixed(3)} ${stroke[2].toFixed(3)} RG\n${lineWidth} w\n${x1.toFixed(2)} ${y1.toFixed(2)} m\n${x2.toFixed(2)} ${y2.toFixed(2)} l\nS\nQ\n`);
  }

  function drawText(txt: string, x: number, y: number, fontSize = 9, bold = false, color: [number, number, number] = [0.1, 0.1, 0.1]) {
    const safe = escapePdfText(txt);
    const font = bold ? 'F2' : 'F1';
    currentPage.commands.push(`q\n${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg\nBT\n/${font} ${fontSize} Tf\n${x.toFixed(2)} ${y.toFixed(2)} Td\n(${safe}) Tj\nET\nQ\n`);
  }

  // 1. Header Banner
  drawRect(36, cursorY - 55, 540, 65, [0.059, 0.090, 0.165]);
  drawText('DATALENS - EXECUTIVE DATASET PROFILING REPORT', 48, cursorY - 18, 14, true, [1, 1, 1]);
  drawText(`Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC  |  Platform: DataLens Intelligence`, 48, cursorY - 34, 8.5, false, [0.85, 0.9, 0.95]);
  drawText(`Dataset: ${record.originalName}  |  Rows: ${analysis.rowCount.toLocaleString()}  |  Columns: ${analysis.colCount}`, 48, cursorY - 48, 8.5, false, [0.7, 0.85, 1]);
  cursorY -= 75;

  // 2. KPI Cards (5 cards)
  ensureSpace(70);
  const cardWidth = 100;
  const cardGap = 10;
  const startX = 36;
  const kpis = [
    { title: 'Quality Score', val: `${analysis.qualityScore}/100`, tag: analysis.qualityScore >= 80 ? 'EXCELLENT' : (analysis.qualityScore >= 60 ? 'MODERATE' : 'CRITICAL'), col: [0.15, 0.39, 0.92] as [number, number, number] },
    { title: 'Completeness', val: `${analysis.completeness.toFixed(1)}%`, tag: analysis.completeness >= 95 ? 'HEALTHY' : 'MISSING', col: [0.06, 0.73, 0.51] as [number, number, number] },
    { title: 'Uniqueness', val: `${analysis.uniqueness.toFixed(1)}%`, tag: analysis.uniqueness >= 95 ? 'NO DUPS' : 'DUPLICATES', col: [0.55, 0.36, 0.96] as [number, number, number] },
    { title: 'Validity', val: `${analysis.validity.toFixed(1)}%`, tag: analysis.validity >= 90 ? 'CONFORMANT' : 'ANOMALIES', col: [0.96, 0.62, 0.04] as [number, number, number] },
    { title: 'Consistency', val: `${analysis.consistency.toFixed(1)}%`, tag: analysis.consistency >= 90 ? 'STABLE' : 'VARIANCE', col: [0.05, 0.65, 0.91] as [number, number, number] }
  ];

  kpis.forEach((kpi, idx) => {
    const x = startX + idx * (cardWidth + cardGap);
    drawRect(x, cursorY - 50, cardWidth, 50, [0.985, 0.99, 1], [0.85, 0.88, 0.92]);
    drawRect(x, cursorY - 3, cardWidth, 3, kpi.col);
    drawText(kpi.title, x + 6, cursorY - 14, 7.5, false, [0.45, 0.5, 0.58]);
    drawText(kpi.val, x + 6, cursorY - 28, 12, true, [0.09, 0.15, 0.25]);
    drawText(kpi.tag, x + 6, cursorY - 42, 7, true, kpi.col);
  });
  cursorY -= 65;

  // 3. Quality Dimensions
  ensureSpace(40);
  drawText('1. QUALITY DIMENSIONS & BENCHMARK AUDIT', 36, cursorY, 11, true, [0.09, 0.15, 0.28]);
  drawLine(36, cursorY - 4, 576, cursorY - 4);
  cursorY -= 18;

  const dims = [
    { name: 'Completeness', score: analysis.completeness, desc: 'Evaluates absent cells and missing record percentages across attributes.' },
    { name: 'Uniqueness', score: analysis.uniqueness, desc: 'Measures redundancy, duplicate tuples, and distinct key cardinality.' },
    { name: 'Validity', score: analysis.validity, desc: 'Checks schema adherence, standard data types, and syntax rules.' },
    { name: 'Consistency', score: analysis.consistency, desc: 'Audits cross-column coherence, variance stability, and value distributions.' }
  ];

  dims.forEach((d, i) => {
    ensureSpace(20);
    drawRect(36, cursorY - 14, 540, 16, i % 2 === 0 ? [0.97, 0.98, 0.99] : [1, 1, 1], [0.9, 0.92, 0.95], 0.5);
    drawText(d.name, 42, cursorY - 10, 8.5, true, [0.12, 0.18, 0.25]);
    drawText(`Score: ${d.score.toFixed(1)}%`, 130, cursorY - 10, 8.5, true, d.score >= 90 ? [0.06, 0.6, 0.35] : [0.85, 0.4, 0.1]);
    drawText(d.desc, 215, cursorY - 10, 8, false, [0.4, 0.45, 0.52]);
    cursorY -= 17;
  });
  cursorY -= 10;

  // 4. Attribute Catalog Table
  ensureSpace(40);
  drawText('2. ATTRIBUTE CATALOG & PROFILING SUMMARY', 36, cursorY, 11, true, [0.09, 0.15, 0.28]);
  drawLine(36, cursorY - 4, 576, cursorY - 4);
  cursorY -= 18;

  drawRect(36, cursorY - 14, 540, 16, [0.92, 0.94, 0.97], [0.8, 0.84, 0.9], 0.5);
  drawText('Column Name', 42, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  drawText('Type', 185, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  drawText('Missing', 265, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  drawText('Missing %', 330, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  drawText('Unique', 400, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  drawText('Completeness', 465, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  drawText('Health', 535, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  cursorY -= 16;

  (analysis.columns || []).forEach((col: any, rowIdx: number) => {
    ensureSpace(16);
    const alt = rowIdx % 2 === 1;
    drawRect(36, cursorY - 13, 540, 15, alt ? [0.98, 0.985, 0.99] : [1, 1, 1], [0.92, 0.94, 0.96], 0.5);
    const name = col.name.length > 22 ? col.name.slice(0, 20) + '..' : col.name;
    drawText(name, 42, cursorY - 9, 7.5, true, [0.1, 0.15, 0.25]);
    drawText(col.type || 'STRING', 185, cursorY - 9, 7.5, false, [0.3, 0.35, 0.45]);
    drawText(col.missingCount.toLocaleString(), 265, cursorY - 9, 7.5, false, [0.25, 0.3, 0.4]);
    drawText(`${col.missingPercentage.toFixed(1)}%`, 330, cursorY - 9, 7.5, false, col.missingPercentage > 10 ? [0.85, 0.25, 0.25] : [0.25, 0.3, 0.25]);
    drawText(col.uniqueCount.toLocaleString(), 400, cursorY - 9, 7.5, false, [0.25, 0.3, 0.4]);
    drawText(`${col.completenessPercentage.toFixed(1)}%`, 465, cursorY - 9, 7.5, false, [0.05, 0.55, 0.3]);
    const health = col.healthStatus || 'Good';
    drawText(health, 535, cursorY - 9, 7.5, true, health === 'Good' ? [0.06, 0.6, 0.35] : [0.85, 0.4, 0.25]);
    cursorY -= 15;
  });
  cursorY -= 12;

  // 5. Quality Issues Table
  ensureSpace(40);
  drawText('3. DETECTED QUALITY ISSUES & REMEDIATION INVENTORY', 36, cursorY, 11, true, [0.09, 0.15, 0.28]);
  drawLine(36, cursorY - 4, 576, cursorY - 4);
  cursorY -= 18;

  drawRect(36, cursorY - 14, 540, 16, [0.92, 0.94, 0.97], [0.8, 0.84, 0.9], 0.5);
  drawText('Severity', 42, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  drawText('Issue Type', 95, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  drawText('Attribute / Scope', 195, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  drawText('Affected Rows', 290, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  drawText('Diagnostic & Recommended Remediation', 370, cursorY - 10, 8, true, [0.15, 0.2, 0.3]);
  cursorY -= 16;

  if (analysis.issues && analysis.issues.length > 0) {
    analysis.issues.forEach((qi: any, qIdx: number) => {
      ensureSpace(22);
      const alt = qIdx % 2 === 1;
      drawRect(36, cursorY - 19, 540, 21, alt ? [0.985, 0.985, 0.99] : [1, 1, 1], [0.92, 0.94, 0.96], 0.5);
      const sev = qi.severity || 'INFO';
      const sColor: [number, number, number] = sev === 'Critical' ? [0.85, 0.2, 0.2] : (sev === 'Warning' ? [0.85, 0.55, 0.05] : [0.2, 0.5, 0.9]);
      drawText(sev, 42, cursorY - 13, 7.5, true, sColor);
      drawText(qi.type || 'AUDIT', 95, cursorY - 13, 7.5, false, [0.25, 0.3, 0.4]);
      const colName = (qi.columnName || '(Dataset-level)').slice(0, 16);
      drawText(colName, 195, cursorY - 13, 7.5, true, [0.15, 0.2, 0.3]);
      drawText(`${qi.affectedRowsCount.toLocaleString()} (${qi.affectedPercentage.toFixed(1)}%)`, 290, cursorY - 13, 7.5, false, [0.3, 0.35, 0.45]);
      const rec = (qi.recommendation || qi.explanation || 'Review attribute values.').slice(0, 46);
      drawText(rec, 370, cursorY - 13, 7.5, false, [0.2, 0.25, 0.35]);
      cursorY -= 21;
    });
  } else {
    ensureSpace(20);
    drawRect(36, cursorY - 16, 540, 18, [0.98, 1, 0.98], [0.85, 0.92, 0.85], 0.5);
    drawText('No critical quality defects detected. Dataset satisfies integrity baseline.', 50, cursorY - 12, 8, false, [0.05, 0.55, 0.2]);
    cursorY -= 20;
  }
  cursorY -= 12;

  // 6. Observations
  ensureSpace(70);
  drawText('4. EXECUTIVE OBSERVATIONS & ACTIONABLE RECOMMENDATIONS', 36, cursorY, 11, true, [0.09, 0.15, 0.28]);
  drawLine(36, cursorY - 4, 576, cursorY - 4);
  cursorY -= 18;

  const obs = [
    `Overall Data Health Score is ${analysis.qualityScore}/100. ${analysis.qualityScore >= 80 ? 'Dataset is in healthy condition.' : 'Remediation is recommended before production use.'}`,
    analysis.completeness < 100 ? `Completeness is ${analysis.completeness.toFixed(1)}%. Apply imputation (Mean/Median/Mode) to resolve nulls.` : 'All attributes are 100% complete.',
    analysis.uniqueness < 100 ? `Uniqueness is ${analysis.uniqueness.toFixed(1)}%. Duplicate records detected. Use Remove Duplicate Rows to deduplicate.` : 'No duplicate records detected.',
    'Export this report alongside the Data Dictionary and Quality Audit JSON for documentation.'
  ];

  obs.forEach(o => {
    ensureSpace(16);
    drawText('\u2022', 42, cursorY - 8, 9, true, [0.15, 0.39, 0.92]);
    drawText(o, 56, cursorY - 8, 8, false, [0.2, 0.25, 0.32]);
    cursorY -= 15;
  });

  // Build PDF Objects
  const totalPages = pages.length;
  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];
  let currentObjId = 5;
  for (let i = 0; i < totalPages; i++) {
    pageObjIds.push(currentObjId++);
    contentObjIds.push(currentObjId++);
  }

  const objects: string[] = [];
  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${totalPages} >>\nendobj\n`;
  objects[3] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n';
  objects[4] = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n';

  for (let i = 0; i < totalPages; i++) {
    const pId = pageObjIds[i];
    const cId = contentObjIds[i];
    const page = pages[i];
    const footerTxt = escapePdfText(`DataLens Executive Profiling Report  \u2022  Page ${i + 1} of ${totalPages}  \u2022  Confidential & Proprietary`);
    page.commands.push(`q\n0.450 0.450 0.500 rg\nBT\n/F1 8 Tf\n180.00 25.00 Td\n(${footerTxt}) Tj\nET\nQ\n`);

    const stream = page.commands.join('');
    const sLen = Buffer.byteLength(stream, 'latin1');
    objects[pId] = `${pId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`;
    objects[cId] = `${cId} 0 obj\n<< /Length ${sLen} >>\nstream\n${stream}endstream\nendobj\n`;
  }

  const totalObjs = currentObjId - 1;
  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const xrefOffsets: number[] = [0];
  for (let i = 1; i <= totalObjs; i++) {
    xrefOffsets[i] = Buffer.byteLength(body, 'latin1');
    body += objects[i];
  }
  const startXref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjs; i++) {
    body += `${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

            // 12. Reporting & Exports API (/api/report/dictionary, /api/report/quality-json, /api/report/audit-trail, /api/report/dataset, /api/report/executive)
            if (cleanPath.startsWith('/api/report')) {
              if (!activeDatasetRecord || !activeParsedData) {
                res.writeHead(400, {'Content-Type': 'application/json;charset=UTF-8'});
                res.end(JSON.stringify({success: false, message: 'No active dataset loaded.'}));
                return;
              }

              const analysis = analyzeDataset(activeParsedData.headers, activeParsedData.rows);

              if (cleanPath === '/api/report/dictionary') {
                const csvHeader = 'Column Name,Data Type,Total Values,Missing Count,Missing %,Unique Values,Completeness %,Health Status,Min,Max,Mean,Median,Sample Std Dev,Sample Variance,IQR,Outliers Count,Mode,Skewness';
                const csvLines = analysis.columns.map(c => `"${c.name}","${c.type}",${c.totalValues},${c.missingCount},${c.missingPercentage}%,${c.uniqueCount},${c.completenessPercentage}%,"${c.healthStatus}",${c.min ?? '-'},${c.max ?? '-'},${c.mean ?? '-'},${c.median ?? '-'},${c.sampleStdDev ?? '-'},${c.sampleVariance ?? '-'},${c.iqr ?? '-'},${c.outlierCount ?? 0},"${c.mostFrequentValue ?? '-'}",${c.skewness ?? '-'}`);
                const fullCsv = [csvHeader, ...csvLines].join('\n');
                res.writeHead(200, {
                  'Content-Type': 'text/csv;charset=UTF-8',
                  'Content-Disposition': `attachment; filename="data_dictionary_${activeDatasetRecord.originalName}.csv"`
                });
                res.end(fullCsv);
                logAuditAction(currentSessionUser?.id, 'EXPORT_DATA_DICTIONARY', activeDatasetRecord.originalName, 'Exported Data Dictionary CSV.');
                return;
              }

              if (cleanPath === '/api/report/quality-json') {
                const reportJson = {
                  reportType: 'DataLens Quality Audit',
                  generatedAt: new Date().toISOString(),
                  dataset: {
                    id: activeDatasetRecord.id,
                    name: activeDatasetRecord.originalName,
                    rows: activeDatasetRecord.rowCount,
                    columns: activeDatasetRecord.columnCount,
                    qualityScore: activeDatasetRecord.qualityScore
                  },
                  dimensions: {
                    completeness: analysis.completeness,
                    uniqueness: analysis.uniqueness,
                    consistency: analysis.consistency,
                    validity: analysis.validity,
                    timeliness: analysis.timeliness
                  },
                  deductions: {
                    missingDeduction: analysis.missingDeduction,
                    duplicateDeduction: analysis.duplicateDeduction,
                    formula: 'Quality Score = 100 - (Missing% * 0.60) - (Duplicate% * 0.40)'
                  },
                  issues: analysis.issues,
                  columns: analysis.columns
                };
                res.writeHead(200, {
                  'Content-Type': 'application/json;charset=UTF-8',
                  'Content-Disposition': `attachment; filename="quality_audit_${activeDatasetRecord.originalName}.json"`
                });
                res.end(JSON.stringify(reportJson, null, 2));
                logAuditAction(currentSessionUser?.id, 'EXPORT_QUALITY_JSON', activeDatasetRecord.originalName, 'Exported Quality Audit JSON.');
                return;
              }

              if (cleanPath === '/api/report/audit-trail') {
                const userAudit = userAuditTrailMap.get(currentSessionUser?.id || 0) || [];
                const csvHeader = 'Timestamp,Action,Dataset,Description,User ID';
                const csvLines = userAudit.map(a => `"${a.formattedTime}","${a.action}","${a.datasetName}","${a.description.replace(/"/g, '""')}",${a.userId}`);
                const fullCsv = [csvHeader, ...csvLines].join('\n');
                res.writeHead(200, {
                  'Content-Type': 'text/csv;charset=UTF-8',
                  'Content-Disposition': `attachment; filename="audit_trail_${activeDatasetRecord.originalName}.csv"`
                });
                res.end(fullCsv);
                return;
              }

              if (cleanPath === '/api/report/dataset') {
                const fullCsv = rowsToCSVString(activeParsedData.headers, activeParsedData.rows);
                res.writeHead(200, {
                  'Content-Type': 'text/csv;charset=UTF-8',
                  'Content-Disposition': `attachment; filename="dataset_${activeDatasetRecord.originalName}"`
                });
                res.end(fullCsv);
                logAuditAction(currentSessionUser?.id, 'DOWNLOAD_DATASET', activeDatasetRecord.originalName, 'Downloaded active dataset CSV.');
                return;
              }

              if (cleanPath === '/api/report/executive' || cleanPath === '/api/report/executive-pdf') {
                const format = urlObj.searchParams.get('format');
                const isPdf = format === 'pdf' ||
                              cleanPath === '/api/report/executive-pdf' ||
                              (req.headers['accept'] && req.headers['accept'].includes('application/pdf'));

                if (isPdf) {
                  const pdfBuf = generateViteExecutivePdf(activeDatasetRecord, analysis);
                  const cleanName = activeDatasetRecord.originalName.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/\.csv$/i, '');
                  res.writeHead(200, {
                    'Content-Type': 'application/pdf',
                    'Content-Length': pdfBuf.length,
                    'Content-Disposition': `attachment; filename="DataLens_Executive_Report_${cleanName}.pdf"`,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                  });
                  res.end(pdfBuf);
                  logAuditAction(currentSessionUser?.id, 'GENERATE_EXECUTIVE_REPORT', activeDatasetRecord.originalName, 'Exported Executive Profiling PDF Report.');
                  return;
                }

                // Printable HTML Executive Summary Report
                const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DataLens Executive Profiling Report — ${activeDatasetRecord.originalName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; background: #fff; margin: 0; padding: 40px; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    h1 { font-size: 24px; margin: 0 0 6px 0; color: #0f172a; }
    .meta { font-size: 13px; color: #64748b; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
    .kpi-val { font-size: 28px; font-weight: 700; color: #2563eb; }
    .kpi-lbl { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 12px; }
    th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; font-weight: 600; }
    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
    .badge-good { color: #15803d; font-weight: 600; }
    .badge-warn { color: #b45309; font-weight: 600; }
    .badge-crit { color: #b91c1c; font-weight: 600; }
    .obs-list { padding-left: 20px; font-size: 13px; line-height: 1.6; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Print / Save as PDF</button>
  </div>
  <div class="header">
    <div>
      <h1>DataLens Executive Data Profiling Report</h1>
      <div class="meta">Dataset: <strong>${activeDatasetRecord.originalName}</strong> | Generated: ${new Date().toLocaleString()}</div>
    </div>
    <div style="text-align: right;">
      <span style="font-size: 32px; font-weight: 800; color: ${analysis.qualityScore >= 80 ? '#16a34a' : (analysis.qualityScore >= 60 ? '#d97706' : '#dc2626')}">${analysis.qualityScore}/100</span>
      <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Overall Data Health</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-val">${analysis.rowCount}</div><div class="kpi-lbl">Total Records</div></div>
    <div class="kpi"><div class="kpi-val">${analysis.colCount}</div><div class="kpi-lbl">Attributes</div></div>
    <div class="kpi"><div class="kpi-val">${analysis.completeness.toFixed(1)}%</div><div class="kpi-lbl">Completeness</div></div>
    <div class="kpi"><div class="kpi-val">${analysis.uniqueness.toFixed(1)}%</div><div class="kpi-lbl">Uniqueness</div></div>
  </div>

  <h3 style="margin-bottom: 10px;">Deterministic Observations</h3>
  <ul class="obs-list">
    ${analysis.insights.map(i => `<li>${i}</li>`).join('')}
  </ul>

  <h3 style="margin-top: 24px; margin-bottom: 10px;">Attribute Summary & Health Assessment</h3>
  <table>
    <thead>
      <tr>
        <th>Attribute</th><th>Type</th><th>Values</th><th>Missing %</th><th>Unique</th><th>Mean</th><th>Median</th><th>Outliers</th><th>Health</th>
      </tr>
    </thead>
    <tbody>
      ${analysis.columns.map(c => `<tr>
        <td><strong>${c.name}</strong></td>
        <td>${c.type}</td>
        <td>${c.totalValues}</td>
        <td>${c.missingPercentage}%</td>
        <td>${c.uniqueCount}</td>
        <td>${c.mean ?? '-'}</td>
        <td>${c.median ?? '-'}</td>
        <td>${c.outlierCount ?? 0}</td>
        <td><span class="${c.healthStatus === 'Good' ? 'badge-good' : (c.healthStatus === 'Warning' ? 'badge-warn' : 'badge-crit')}">${c.healthStatus}</span></td>
      </tr>`).join('')}
    </tbody>
  </table>

  <h3 style="margin-top: 24px; margin-bottom: 10px;">Discrete Quality Issues Inventory (${analysis.issues.length})</h3>
  <table>
    <thead>
      <tr>
        <th>Severity</th><th>Type</th><th>Column</th><th>Affected Rows</th><th>Impact %</th><th>Remediation Advice</th>
      </tr>
    </thead>
    <tbody>
      ${analysis.issues.length === 0 ? '<tr><td colspan="6" style="text-align:center;">No quality issues detected.</td></tr>' : analysis.issues.map(iss => `<tr>
        <td><span class="${iss.severity === 'Critical' ? 'badge-crit' : (iss.severity === 'Warning' ? 'badge-warn' : 'badge-good')}">${iss.severity}</span></td>
        <td>${iss.type}</td>
        <td>${iss.columnName}</td>
        <td>${iss.affectedRowsCount}</td>
        <td>${iss.affectedPercentage}%</td>
        <td>${iss.recommendation}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;
                res.writeHead(200, {'Content-Type': 'text/html;charset=UTF-8'});
                res.end(html);
                logAuditAction(currentSessionUser?.id, 'GENERATE_EXECUTIVE_REPORT', activeDatasetRecord.originalName, 'Generated Printable Executive Summary Report.');
                return;
              }
            }

            // 13. History API
            if (cleanPath === '/api/history' || cleanPath === '/api/history/load' || cleanPath === '/api/history/delete') {
              const loadId = urlObj.searchParams.get('id') || urlObj.searchParams.get('loadId');
              const loadName = urlObj.searchParams.get('name');

              if (req.method === 'POST' || req.method === 'DELETE') {
                const chunks: Buffer[] = [];
                req.on('data', c => chunks.push(c));
                await new Promise(r => req.on('end', r));
                const bodyStr = Buffer.concat(chunks).toString('utf-8');
                const params = new URLSearchParams(bodyStr);
                const action = params.get('action') || (cleanPath === '/api/history/delete' ? 'delete' : '');
                const postLoadId = params.get('id') || urlObj.searchParams.get('id');

                if (action === 'delete' && postLoadId && currentSessionUser) {
                  const targetId = parseInt(postLoadId);
                  const targetIndex = datasetHistory.findIndex(d => d.id === targetId && d.userId === currentSessionUser.id);
                  if (targetIndex !== -1) {
                    const existingActive = userActiveDatasetMap.get(currentSessionUser.id);
                    const wasActive = existingActive ? (existingActive.record.id === targetId) : false;

                    const target = datasetHistory.splice(targetIndex, 1)[0];
                    if (target && target.filePath && fs.existsSync(target.filePath)) {
                      try {
                        fs.unlinkSync(target.filePath);
                      } catch (err) {
                        console.error('Failed to unlink deleted dataset file:', err);
                      }
                    }
                    let newActiveId: number | null = null;
                    const remaining = datasetHistory.filter(d => d.userId === currentSessionUser.id);

                    if (remaining.length === 0) {
                      userActiveDatasetMap.delete(currentSessionUser.id);
                      logAuditAction(currentSessionUser.id, 'DELETE_DATASET', target.originalName, `Deleted dataset '${target.originalName}'. User now has no remaining datasets.`);
                    } else if (wasActive) {
                      // Deleted the active dataset!
                      const next = remaining[0];
                      activateUserDataset(currentSessionUser.id, next.id);
                      newActiveId = next.id;
                      logAuditAction(currentSessionUser.id, 'DELETE_DATASET', target.originalName, `Deleted active dataset '${target.originalName}'. Automatically activated remaining dataset '${next.originalName}' (ID: ${next.id}).`);
                    } else {
                      logAuditAction(currentSessionUser.id, 'DELETE_DATASET', target.originalName, `Deleted stored dataset '${target.originalName}' (ID: ${target.id}).`);
                      const curr = getUserActiveDataset(currentSessionUser.id);
                      if (curr?.record) {
                        newActiveId = curr.record.id;
                      }
                    }

                    res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                    res.end(JSON.stringify({
                      success: true,
                      message: `Dataset '${target.originalName}' deleted successfully.`,
                      deletedId: target.id,
                      activeDatasetId: newActiveId ?? -1
                    }));
                    return;
                  }
                  res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                  res.end(JSON.stringify({ success: false, message: 'Dataset not found or unauthorized.' }));
                  return;
                }

                if (action === 'activate' && postLoadId && currentSessionUser) {
                  const targetId = parseInt(postLoadId);
                  const activated = activateUserDataset(currentSessionUser.id, targetId);
                  if (activated) {
                    res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                    res.end(JSON.stringify({
                      success: true,
                      message: `Activated dataset '${activated.record.originalName}'.`,
                      datasetName: activated.record.originalName,
                      activeDatasetId: activated.record.id,
                      id: activated.record.id
                    }));
                    return;
                  } else {
                    res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                    res.end(JSON.stringify({ success: false, message: 'Dataset not found or unauthorized.' }));
                    return;
                  }
                }
              }

              if (loadId || loadName) {
                const target = datasetHistory.find(d => (String(d.id) === loadId || d.originalName === loadName || d.storedName === loadName) && d.userId === currentSessionUser?.id);
                if (target && fs.existsSync(target.filePath) && currentSessionUser) {
                  const activated = activateUserDataset(currentSessionUser.id, target.id);
                  if (activated) {
                    res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                    res.end(JSON.stringify({
                      success: true,
                      message: `Loaded dataset '${target.originalName}' as active dataset.`,
                      datasetName: target.originalName,
                      id: target.id,
                      activeDatasetId: target.id,
                      rowCount: target.rowCount,
                      columnCount: target.columnCount,
                      qualityScore: target.qualityScore
                    }));
                    return;
                  }
                }
              }

              const userHistory = datasetHistory.filter(d => d.userId === currentSessionUser?.id);
              const userActive = currentSessionUser ? getUserActiveDataset(currentSessionUser.id) : null;
              const activeId = userActive?.record ? userActive.record.id : -1;
              const userAudit = userAuditTrailMap.get(currentSessionUser?.id || 0) || [];

              res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
              res.end(JSON.stringify({
                success: true,
                activeDatasetId: activeId,
                hasActiveDataset: activeId !== -1,
                activeDatasetName: userActive?.record ? userActive.record.originalName : null,
                history: userHistory.map(d => {
                  const isCurrentActive = (activeId !== -1 && d.id === activeId);
                  return {
                    id: d.id,
                    fileName: d.originalName,
                    originalName: d.originalName,
                    storedName: d.storedName,
                    rowCount: d.rowCount,
                    columnCount: d.columnCount,
                    numericCount: d.numericCount,
                    categoricalCount: d.categoricalCount,
                    missingCount: d.missingCount,
                    duplicateCount: d.duplicateCount,
                    qualityScore: d.qualityScore,
                    uploadTime: d.uploadTime,
                    uploadedAt: new Date(d.uploadTime).toISOString().replace('T', ' ').slice(0, 19),
                    uploadDateFormatted: new Date(d.uploadTime).toISOString().replace('T', ' ').slice(0, 19),
                    fileSize: d.fileSize,
                    fileSizeBytes: d.fileSize,
                    fileSizeFormatted: `${(d.fileSize / 1024).toFixed(1)} KB`,
                    active: isCurrentActive,
                    isActive: isCurrentActive,
                    status: isCurrentActive ? 'ACTIVE' : 'STORED'
                  };
                }),
                auditTrail: userAudit
              }));
              return;
            }

            next();
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
