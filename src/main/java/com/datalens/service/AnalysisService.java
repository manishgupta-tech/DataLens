package com.datalens.service;

import com.datalens.model.AnalysisResult;
import com.datalens.model.ColumnMetadata;
import com.datalens.model.Dataset;
import com.datalens.model.QualityIssue;
import com.datalens.util.CSVParserUtil;
import com.datalens.util.CSVParserUtil.CSVData;

import java.io.File;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Pattern;

/**
 * DataLens — Advanced AnalysisService
 * Rigorous deterministic profiling engine:
 * - Robust 4-type detection (NUMERIC, DATE, BOOLEAN, CATEGORICAL)
 * - Complete numeric statistics (sample & population variance, sample & population std dev, Q1, Q3, IQR, Tukey outliers, Fisher-Pearson skewness)
 * - Deep categorical statistics (mode, rare categories, casing anomalies, frequencies)
 * - Date span analysis
 * - Pearson correlation matrix
 * - Discrete QualityIssue generation with row indices & remediation advice
 */
public class AnalysisService {

    private static final Pattern DATE_PATTERN_ISO = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}(?:[ T]\\d{2}:\\d{2}:\\d{2})?$");
    private static final Pattern DATE_PATTERN_SLASH = Pattern.compile("^\\d{1,2}/\\d{1,2}/\\d{4}$");
    private static final Pattern DATE_PATTERN_DASH = Pattern.compile("^\\d{1,2}-\\d{1,2}-\\d{4}$");

    /**
     * Performs a full profiling analysis of a dataset from its CSV file.
     */
    public AnalysisResult analyzeDataset(Dataset dataset) throws IOException {
        if (dataset == null || dataset.getFilePath() == null) {
            throw new IllegalArgumentException("Dataset or file path cannot be null.");
        }

        File csvFile = new File(dataset.getFilePath());
        if (!csvFile.exists()) {
            throw new IOException("CSV file not found at: " + dataset.getFilePath());
        }

        CSVData csvData = CSVParserUtil.parseCSV(csvFile);
        return analyzeCSVData(dataset, csvData);
    }

    /**
     * Analyzes already parsed CSVData.
     */
    public AnalysisResult analyzeCSVData(Dataset dataset, CSVData csvData) {
        AnalysisResult result = new AnalysisResult();
        result.setDataset(dataset);

        List<String> headers = csvData.getHeaders();
        List<List<String>> rows = csvData.getRows();

        result.setHeaders(headers);
        int rowCount = rows.size();
        int colCount = headers.size();

        // Preview rows (first 100 rows or all)
        List<List<String>> previewRows = new ArrayList<>();
        int previewLimit = Math.min(100, rowCount);
        for (int i = 0; i < previewLimit; i++) {
            previewRows.add(rows.get(i));
        }
        result.setPreviewRows(previewRows);

        if (rowCount == 0 || colCount == 0) {
            dataset.setRowCount(0);
            dataset.setColumnCount(colCount);
            dataset.setQualityScore(0);
            return result;
        }

        // Memory estimate (approximate in-memory footprint in bytes)
        long estimatedBytes = 0;
        for (String h : headers) estimatedBytes += h.length() * 2L + 16;
        for (List<String> r : rows) {
            for (String cell : r) {
                if (cell != null) estimatedBytes += cell.length() * 2L + 16;
            }
        }
        result.setEstimatedMemoryBytes(estimatedBytes);

        // 1. Column analysis and Type Detection
        List<ColumnMetadata> colMetaList = new ArrayList<>();
        List<QualityIssue> issues = new ArrayList<>();
        List<String> constantCols = new ArrayList<>();

        int totalMissingCells = 0;
        int numericCount = 0;
        int categoricalCount = 0;
        int booleanCount = 0;
        int dateCount = 0;
        int totalOutliers = 0;

        // Store extracted numeric arrays for Pearson correlation computation
        Map<String, List<Double>> numericColumnsData = new LinkedHashMap<>();

        for (int colIdx = 0; colIdx < colCount; colIdx++) {
            String colName = headers.get(colIdx);
            List<String> colValues = new ArrayList<>(rowCount);
            int missingInCol = 0;
            int whitespaceOnlyInCol = 0;
            Set<String> uniqueVals = new HashSet<>();
            List<Integer> missingRowIndices = new ArrayList<>();

            for (int r = 0; r < rowCount; r++) {
                List<String> row = rows.get(r);
                String val = (colIdx < row.size()) ? row.get(colIdx) : "";
                if (val == null || val.trim().isEmpty() || isSentinelMissing(val.trim())) {
                    missingInCol++;
                    if (missingRowIndices.size() < 10) {
                        missingRowIndices.add(r + 1); // 1-indexed row number
                    }
                    if (val != null && !val.isEmpty() && val.trim().isEmpty()) {
                        whitespaceOnlyInCol++;
                    }
                } else {
                    val = val.trim();
                    uniqueVals.add(val);
                }
                colValues.add(val != null ? val : "");
            }

            totalMissingCells += missingInCol;
            double missingPct = (rowCount > 0) ? (missingInCol * 100.0 / rowCount) : 0.0;
            double completenessPct = 100.0 - missingPct;
            double cardinalityPct = (rowCount > 0) ? (uniqueVals.size() * 100.0 / rowCount) : 0.0;
            boolean isConstant = (uniqueVals.size() == 1 && missingInCol == 0);

            if (isConstant) {
                constantCols.add(colName);
            }

            // Detect type: BOOLEAN, DATE, NUMERIC, or CATEGORICAL
            String type = detectType(colValues, missingInCol);
            if ("NUMERIC".equals(type)) numericCount++;
            else if ("DATE".equals(type)) dateCount++;
            else if ("BOOLEAN".equals(type)) booleanCount++;
            else categoricalCount++;

            ColumnMetadata meta = new ColumnMetadata(colName, type);
            meta.setTotalValues(rowCount);
            meta.setMissingCount(missingInCol);
            meta.setMissingPercentage(round2(missingPct));
            meta.setCompletenessPercentage(round2(completenessPct));
            meta.setCardinalityPercentage(round2(cardinalityPct));
            meta.setConstant(isConstant);
            meta.setEmptyOrWhitespaceCount(whitespaceOnlyInCol);
            meta.setUniqueCount(uniqueVals.size());

            // Health Status
            if (missingPct == 0.0 && !isConstant) {
                meta.setHealthStatus("Good");
            } else if (missingPct <= 15.0) {
                meta.setHealthStatus("Warning");
            } else {
                meta.setHealthStatus("Critical");
            }

            // Column statistics based on detected type
            if ("NUMERIC".equals(type)) {
                List<Double> parsedDoubles = computeNumericStats(meta, colValues);
                numericColumnsData.put(colName, parsedDoubles);
                totalOutliers += meta.getOutlierCount();

                // Check for Outlier Quality Issue
                if (meta.getOutlierCount() > 0) {
                    issues.add(new QualityIssue(
                        "OUTLIER_" + colIdx,
                        meta.getOutlierCount() > (rowCount * 0.05) ? "Warning" : "Info",
                        "OUTLIER_DETECTED",
                        colName,
                        meta.getOutlierCount(),
                        round2(meta.getOutlierCount() * 100.0 / rowCount),
                        meta.getOutlierRowIndices(),
                        String.format("Column '%s' contains %d statistical outliers outside the Tukey IQR boundaries [%.2f, %.2f].",
                            colName, meta.getOutlierCount(), (meta.getQ25() - 1.5 * meta.getIqr()), (meta.getQ75() + 1.5 * meta.getIqr())),
                        "Inspect extreme values or use Cleaning Studio to cap/filter outliers."
                    ));
                }
            } else if ("DATE".equals(type)) {
                computeDateStats(meta, colValues);
            } else {
                computeCategoricalStats(meta, colValues);
            }

            // Quality Issue: Missing values
            if (missingInCol > 0) {
                String severity = missingPct > 20.0 ? "Critical" : (missingPct > 5.0 ? "Warning" : "Info");
                issues.add(new QualityIssue(
                    "MISSING_" + colIdx,
                    severity,
                    "MISSING_VALUES",
                    colName,
                    missingInCol,
                    round2(missingPct),
                    missingRowIndices,
                    String.format("Column '%s' has %d missing or null cells (%.1f%% of total column).", colName, missingInCol, missingPct),
                    "Apply missing value replacement (Mean/Median/Mode) or drop rows in Data Cleaning Studio."
                ));
            }

            // Quality Issue: Constant column
            if (isConstant) {
                issues.add(new QualityIssue(
                    "CONST_" + colIdx,
                    "Warning",
                    "CONSTANT_COLUMN",
                    colName,
                    rowCount,
                    100.0,
                    Collections.singletonList(1),
                    String.format("Column '%s' contains only a single constant value '%s' across all rows with zero variance.", colName, uniqueVals.iterator().next()),
                    "Consider dropping constant columns as they provide no variance or analytical value."
                ));
            }

            // Quality Issue: Inconsistent casing
            if (meta.isInconsistentCasingDetected()) {
                issues.add(new QualityIssue(
                    "CASE_" + colIdx,
                    "Warning",
                    "INCONSISTENT_CASING",
                    colName,
                    meta.getInconsistentCasingExamples().size(),
                    round2(meta.getInconsistentCasingExamples().size() * 100.0 / Math.max(1, rowCount)),
                    Collections.emptyList(),
                    String.format("Potential casing discrepancies in '%s' (e.g. %s).", colName, String.join(", ", meta.getInconsistentCasingExamples())),
                    "Use Cleaning Studio to standardize text case across categorical records."
                ));
            }

            colMetaList.add(meta);
        }

        result.setColumns(colMetaList);
        result.setNumericCount(numericCount);
        result.setCategoricalCount(categoricalCount);
        result.setBooleanCount(booleanCount);
        result.setDateCount(dateCount);
        result.setConstantColumns(constantCols);

        // 2. Duplicate rows detection
        int duplicateRowsCount = 0;
        List<Integer> duplicateRowIndices = new ArrayList<>();
        Set<String> seenRowHashes = new HashSet<>();
        for (int r = 0; r < rowCount; r++) {
            List<String> row = rows.get(r);
            String rowKey = String.join("||", row);
            if (!seenRowHashes.add(rowKey)) {
                duplicateRowsCount++;
                if (duplicateRowIndices.size() < 10) {
                    duplicateRowIndices.add(r + 1);
                }
            }
        }

        if (duplicateRowsCount > 0) {
            issues.add(0, new QualityIssue(
                "DUPLICATES_ROW",
                duplicateRowsCount > (rowCount * 0.05) ? "Critical" : "Warning",
                "DUPLICATE_ROWS",
                "(All Columns)",
                duplicateRowsCount,
                round2(duplicateRowsCount * 100.0 / rowCount),
                duplicateRowIndices,
                String.format("Dataset has %d exact duplicate row records.", duplicateRowsCount),
                "Remove redundant duplicate records using Data Cleaning Studio to prevent skewed metrics."
            ));
        }

        result.setIssues(issues);

        // 3. Pearson Correlation Matrix computation
        Map<String, Map<String, Double>> corrMatrix = computeCorrelationMatrix(numericColumnsData);
        result.setCorrelationMatrix(corrMatrix);

        // 4. Quality scoring & Dimensions
        long totalCells = (long) rowCount * colCount;
        double completeness = totalCells > 0 ? ((totalCells - totalMissingCells) * 100.0 / totalCells) : 0;
        double uniqueness = rowCount > 0 ? ((rowCount - duplicateRowsCount) * 100.0 / rowCount) : 0;

        double missingDeduction = (100.0 - completeness) * 0.50;
        double duplicateDeduction = (100.0 - uniqueness) * 0.35;
        double outlierDeduction = Math.min(10.0, (totalOutliers * 100.0 / Math.max(1, totalCells)) * 0.15);
        double constantColDeduction = constantCols.size() * 2.0;

        int overallScore = (int) Math.max(0, Math.min(100, Math.round(100.0 - missingDeduction - duplicateDeduction - outlierDeduction - constantColDeduction)));

        double validity = Math.max(0.0, Math.min(100.0, 100.0 - (outlierDeduction * 3.0)));
        double consistency = Math.max(0.0, Math.min(100.0, 100.0 - (constantColDeduction * 2.0)));
        double timeliness = 100.0;

        result.setCompletenessScore(round2(completeness));
        result.setUniquenessScore(round2(uniqueness));
        result.setConsistencyScore(round2(consistency));
        result.setValidityScore(round2(validity));
        result.setTimelinessScore(round2(timeliness));
        result.setOverallQualityScore(overallScore);
        result.setMissingDeduction(round2(missingDeduction));
        result.setDuplicateDeduction(round2(duplicateDeduction));

        // Update dataset entity
        dataset.setRowCount(rowCount);
        dataset.setColumnCount(colCount);
        dataset.setNumericCount(numericCount);
        dataset.setCategoricalCount(categoricalCount);
        dataset.setMissingCount(totalMissingCells);
        dataset.setDuplicateCount(duplicateRowsCount);
        dataset.setQualityScore(overallScore);

        // 5. Rule-based Observations Generation
        List<String> insights = generateDeterministicInsights(dataset, colMetaList, corrMatrix, completeness, uniqueness, overallScore, issues);
        result.setRuleInsights(insights);

        return result;
    }

    private boolean isSentinelMissing(String s) {
        if (s == null) return true;
        String lower = s.toLowerCase();
        return lower.equals("na") || lower.equals("n/a") || lower.equals("null") ||
               lower.equals("nan") || lower.equals("none") || lower.equals("nil") ||
               lower.equals("?");
    }

    private String detectType(List<String> values, int missingCount) {
        int nonMissingCount = values.size() - missingCount;
        if (nonMissingCount <= 0) return "CATEGORICAL";

        int boolCount = 0;
        int dateCount = 0;
        int numCount = 0;

        for (String v : values) {
            if (v == null || v.trim().isEmpty() || isSentinelMissing(v.trim())) continue;
            String trimmed = v.trim();

            // Boolean check
            if (trimmed.equalsIgnoreCase("true") || trimmed.equalsIgnoreCase("false") ||
                trimmed.equalsIgnoreCase("yes") || trimmed.equalsIgnoreCase("no")) {
                boolCount++;
            }

            // Numeric check
            try {
                String cleanNum = trimmed.replace("$", "").replace("%", "").replace(",", "");
                Double.parseDouble(cleanNum);
                numCount++;
            } catch (NumberFormatException ignored) {}

            // Date check
            if (DATE_PATTERN_ISO.matcher(trimmed).matches() ||
                DATE_PATTERN_SLASH.matcher(trimmed).matches() ||
                DATE_PATTERN_DASH.matcher(trimmed).matches()) {
                dateCount++;
            }
        }

        double threshold = 0.80;
        if ((boolCount * 1.0 / nonMissingCount) >= threshold) return "BOOLEAN";
        if ((numCount * 1.0 / nonMissingCount) >= threshold) return "NUMERIC";
        if ((dateCount * 1.0 / nonMissingCount) >= threshold) return "DATE";

        return "CATEGORICAL";
    }

    private List<Double> computeNumericStats(ColumnMetadata meta, List<String> values) {
        List<Double> numbers = new ArrayList<>();
        List<Integer> rowIndices = new ArrayList<>();

        for (int i = 0; i < values.size(); i++) {
            String v = values.get(i);
            if (v == null || v.trim().isEmpty() || isSentinelMissing(v.trim())) continue;
            try {
                String clean = v.trim().replace("$", "").replace("%", "").replace(",", "");
                numbers.add(Double.parseDouble(clean));
                rowIndices.add(i + 1);
            } catch (NumberFormatException ignored) {}
        }

        if (numbers.isEmpty()) {
            meta.setMin(0.0);
            meta.setMax(0.0);
            meta.setMean(0.0);
            meta.setMedian(0.0);
            meta.setSampleVariance(0.0);
            meta.setPopulationVariance(0.0);
            meta.setSampleStdDev(0.0);
            meta.setPopulationStdDev(0.0);
            meta.setQ25(0.0);
            meta.setQ75(0.0);
            meta.setIqr(0.0);
            meta.setRange(0.0);
            meta.setSkewness(0.0);
            meta.setOutlierCount(0);
            return numbers;
        }

        // Sort copy for percentiles and median
        List<Double> sorted = new ArrayList<>(numbers);
        Collections.sort(sorted);
        int n = sorted.size();

        double min = sorted.get(0);
        double max = sorted.get(n - 1);
        double sum = 0.0;
        for (double d : numbers) sum += d;
        double mean = sum / n;

        // Exact Median
        double median;
        if (n % 2 == 0) {
            median = (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2.0;
        } else {
            median = sorted.get(n / 2);
        }

        // Quartiles (Interpolated / Nearest-rank)
        double q25 = sorted.get((int) Math.floor(n * 0.25));
        double q75 = sorted.get((int) Math.min(n - 1, Math.floor(n * 0.75)));
        double iqr = Math.max(0.0, q75 - q25);

        // Variance (Sample s^2 and Population sigma^2)
        double sumSqDiff = 0.0;
        for (double d : numbers) {
            sumSqDiff += Math.pow(d - mean, 2);
        }
        double sampleVariance = (n > 1) ? (sumSqDiff / (n - 1)) : 0.0;
        double popVariance = (n > 0) ? (sumSqDiff / n) : 0.0;
        double sampleStdDev = Math.sqrt(sampleVariance);
        double popStdDev = Math.sqrt(popVariance);

        // Outliers detection via Tukey IQR method: < Q1 - 1.5*IQR or > Q3 + 1.5*IQR
        double lowerBound = q25 - 1.5 * iqr;
        double upperBound = q75 + 1.5 * iqr;
        int outlierCount = 0;
        List<Integer> outlierRows = new ArrayList<>();

        for (int k = 0; k < numbers.size(); k++) {
            double val = numbers.get(k);
            if (val < lowerBound || val > upperBound) {
                outlierCount++;
                if (outlierRows.size() < 10) {
                    outlierRows.add(rowIndices.get(k));
                }
            }
        }

        // Fisher-Pearson Skewness coefficient
        double skewness = 0.0;
        if (n >= 3 && sampleStdDev > 0.0) {
            double sumCubed = 0.0;
            for (double d : numbers) {
                sumCubed += Math.pow((d - mean) / sampleStdDev, 3);
            }
            skewness = (n * 1.0 / ((n - 1) * (n - 2))) * sumCubed;
        }

        meta.setMin(round2(min));
        meta.setMax(round2(max));
        meta.setMean(round2(mean));
        meta.setMedian(round2(median));
        meta.setSampleVariance(round4(sampleVariance));
        meta.setPopulationVariance(round4(popVariance));
        meta.setSampleStdDev(round2(sampleStdDev));
        meta.setPopulationStdDev(round2(popStdDev));
        meta.setQ25(round2(q25));
        meta.setQ75(round2(q75));
        meta.setIqr(round2(iqr));
        meta.setRange(round2(max - min));
        meta.setSkewness(round2(skewness));
        meta.setOutlierCount(outlierCount);
        meta.setOutlierRowIndices(outlierRows);

        return numbers;
    }

    private void computeCategoricalStats(ColumnMetadata meta, List<String> values) {
        Map<String, Integer> freqMap = new LinkedHashMap<>();
        Map<String, String> lowerToOriginal = new HashMap<>();
        List<String> casingAnomalies = new ArrayList<>();

        for (String v : values) {
            if (v == null || v.trim().isEmpty() || isSentinelMissing(v.trim())) continue;
            String clean = v.trim();
            freqMap.put(clean, freqMap.getOrDefault(clean, 0) + 1);

            String lower = clean.toLowerCase();
            if (lowerToOriginal.containsKey(lower)) {
                String existing = lowerToOriginal.get(lower);
                if (!existing.equals(clean) && !casingAnomalies.contains("'" + existing + "' vs '" + clean + "'")) {
                    if (casingAnomalies.size() < 3) {
                        casingAnomalies.add("'" + existing + "' vs '" + clean + "'");
                    }
                }
            } else {
                lowerToOriginal.put(lower, clean);
            }
        }

        List<Map.Entry<String, Integer>> sorted = new ArrayList<>(freqMap.entrySet());
        sorted.sort((a, b) -> b.getValue().compareTo(a.getValue()));

        if (!sorted.isEmpty()) {
            meta.setMostFrequentValue(sorted.get(0).getKey());
            meta.setMostFrequentCount(sorted.get(0).getValue());
        }

        List<Map<String, Object>> topValues = new ArrayList<>();
        List<String> rareList = new ArrayList<>();
        int rareCount = 0;

        for (int i = 0; i < sorted.size(); i++) {
            Map.Entry<String, Integer> entry = sorted.get(i);
            int count = entry.getValue();
            double pct = round2(count * 100.0 / Math.max(1, meta.getTotalValues()));

            if (i < 10) {
                Map<String, Object> item = new HashMap<>();
                item.put("value", entry.getKey());
                item.put("count", count);
                item.put("percentage", pct);
                topValues.add(item);
            }

            if (count <= 2 || pct < 1.0) {
                rareCount++;
                if (rareList.size() < 5) {
                    rareList.add(entry.getKey() + " (" + count + ")");
                }
            }
        }

        meta.setTopValues(topValues);
        meta.setRareCategoriesCount(rareCount);
        meta.setRareCategories(rareList);
        meta.setInconsistentCasingDetected(!casingAnomalies.isEmpty());
        meta.setInconsistentCasingExamples(casingAnomalies);
    }

    private void computeDateStats(ColumnMetadata meta, List<String> values) {
        LocalDate earliest = null;
        LocalDate latest = null;
        int invalidDates = 0;

        DateTimeFormatter[] formatters = new DateTimeFormatter[]{
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("M/d/yyyy"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy"),
            DateTimeFormatter.ofPattern("d/M/yyyy"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd")
        };

        for (String v : values) {
            if (v == null || v.trim().isEmpty() || isSentinelMissing(v.trim())) continue;
            String clean = v.trim().split("[ T]")[0];
            LocalDate parsed = null;
            for (DateTimeFormatter fmt : formatters) {
                try {
                    parsed = LocalDate.parse(clean, fmt);
                    break;
                } catch (Exception ignored) {}
            }

            if (parsed != null) {
                if (earliest == null || parsed.isBefore(earliest)) earliest = parsed;
                if (latest == null || parsed.isAfter(latest)) latest = parsed;
            } else {
                invalidDates++;
            }
        }

        if (earliest != null && latest != null) {
            meta.setEarliestDate(earliest.toString());
            meta.setLatestDate(latest.toString());
            meta.setDateRangeDays(ChronoUnit.DAYS.between(earliest, latest));
        }
        meta.setInvalidDateCount(invalidDates);
    }

    private Map<String, Map<String, Double>> computeCorrelationMatrix(Map<String, List<Double>> numericCols) {
        Map<String, Map<String, Double>> matrix = new LinkedHashMap<>();
        List<String> colNames = new ArrayList<>(numericCols.keySet());

        for (String col1 : colNames) {
            matrix.put(col1, new LinkedHashMap<>());
            List<Double> list1 = numericCols.get(col1);

            for (String col2 : colNames) {
                if (col1.equals(col2)) {
                    matrix.get(col1).put(col2, 1.0);
                    continue;
                }
                List<Double> list2 = numericCols.get(col2);
                int len = Math.min(list1.size(), list2.size());
                if (len < 2) {
                    matrix.get(col1).put(col2, 0.0);
                    continue;
                }

                // Compute means
                double sum1 = 0, sum2 = 0;
                for (int i = 0; i < len; i++) {
                    sum1 += list1.get(i);
                    sum2 += list2.get(i);
                }
                double m1 = sum1 / len;
                double m2 = sum2 / len;

                // Pearson correlation r
                double num = 0, den1 = 0, den2 = 0;
                for (int i = 0; i < len; i++) {
                    double d1 = list1.get(i) - m1;
                    double d2 = list2.get(i) - m2;
                    num += d1 * d2;
                    den1 += d1 * d1;
                    den2 += d2 * d2;
                }

                double denom = Math.sqrt(den1 * den2);
                double r = (denom > 0) ? (num / denom) : 0.0;
                matrix.get(col1).put(col2, round2(r));
            }
        }
        return matrix;
    }

    private List<String> generateDeterministicInsights(Dataset dataset, List<ColumnMetadata> columns,
                                                       Map<String, Map<String, Double>> corrMatrix,
                                                       double completeness, double uniqueness, int overallScore,
                                                       List<QualityIssue> issues) {
        List<String> list = new ArrayList<>();

        // 1. Structure Insight
        list.add(String.format("Dataset '%s' contains %d total rows across %d columns (%d numeric, %d categorical).",
            dataset.getOriginalName() != null ? dataset.getOriginalName() : "active_dataset.csv",
            dataset.getRowCount(), dataset.getColumnCount(), dataset.getNumericCount(), dataset.getCategoricalCount()));

        // 2. Quality Score & Hygiene
        list.add(String.format("Health Rating: Overall Quality Score is %d/100 (Completeness: %.2f%%, Uniqueness: %.2f%%).",
            overallScore, completeness, uniqueness));

        // 3. Outlier Observation
        int totalOutliers = 0;
        String worstOutlierCol = null;
        int maxOutliers = 0;
        for (ColumnMetadata col : columns) {
            if ("NUMERIC".equals(col.getType()) && col.getOutlierCount() > 0) {
                totalOutliers += col.getOutlierCount();
                if (col.getOutlierCount() > maxOutliers) {
                    maxOutliers = col.getOutlierCount();
                    worstOutlierCol = col.getName();
                }
            }
        }
        if (totalOutliers > 0) {
            list.add(String.format("Outlier Distribution: %d statistical outliers identified via Tukey IQR method (highest in '%s' with %d outliers).",
                totalOutliers, worstOutlierCol, maxOutliers));
        } else {
            list.add("Outlier Hygiene: No statistical anomalies or extreme Tukey IQR outliers detected.");
        }

        // 4. Correlation Observation
        String strongCorrNote = null;
        for (Map.Entry<String, Map<String, Double>> e1 : corrMatrix.entrySet()) {
            for (Map.Entry<String, Double> e2 : e1.getValue().entrySet()) {
                if (!e1.getKey().equals(e2.getKey()) && Math.abs(e2.getValue()) >= 0.70) {
                    strongCorrNote = String.format("Strong Linear Correlation: '%s' and '%s' exhibit an r-coefficient of %.2f (%s correlation).",
                        e1.getKey(), e2.getKey(), e2.getValue(), e2.getValue() > 0 ? "positive" : "negative");
                    break;
                }
            }
            if (strongCorrNote != null) break;
        }
        if (strongCorrNote != null) {
            list.add(strongCorrNote);
        }

        // 5. Categorical Dominance / Cardinality
        for (ColumnMetadata col : columns) {
            if ("CATEGORICAL".equals(col.getType()) && col.getMostFrequentValue() != null) {
                double pct = (col.getMostFrequentCount() * 100.0) / Math.max(1, dataset.getRowCount());
                if (pct >= 50.0 && dataset.getRowCount() > 3) {
                    list.add(String.format("Category Dominance: In '%s', '%s' dominates with %.1f%% of all observations (%d rows).",
                        col.getName(), col.getMostFrequentValue(), pct, col.getMostFrequentCount()));
                    break;
                }
            }
        }

        // 6. Skewness Observation
        for (ColumnMetadata col : columns) {
            if ("NUMERIC".equals(col.getType()) && col.getSkewness() != null) {
                if (Math.abs(col.getSkewness()) >= 1.0) {
                    list.add(String.format("Distribution Asymmetry: '%s' is heavily %s-skewed (Fisher-Pearson coefficient: %.2f).",
                        col.getName(), col.getSkewness() > 0 ? "right" : "left", col.getSkewness()));
                    break;
                }
            }
        }

        return list;
    }

    private double round2(double val) {
        if (Double.isNaN(val) || Double.isInfinite(val)) return 0.0;
        return Math.round(val * 100.0) / 100.0;
    }

    private double round4(double val) {
        if (Double.isNaN(val) || Double.isInfinite(val)) return 0.0;
        return Math.round(val * 10000.0) / 10000.0;
    }
}
