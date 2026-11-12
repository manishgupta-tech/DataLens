package com.datalens.service;

import com.datalens.model.AnalysisResult;
import com.datalens.model.CleaningOperation;
import com.datalens.util.CSVParserUtil.CSVData;

import java.io.Serializable;
import java.util.*;

/**
 * DataLens — CleaningService
 * Implements deterministic data cleaning transformations:
 * - Duplicate removal (exact duplicate rows or deduplication by unique key column)
 * - Whitespace trimming
 * - Text sanitization (lowercase, UPPERCASE, Title Case, remove special characters)
 * - Missing value imputation (Mean, Median, Mode, Custom Constant, Row Dropping)
 * - Outlier handling (Tukey IQR Capping or Row Removal)
 * - Column Management (Dropping & Renaming)
 * - Full Before vs After diff tracking and changed-cell highlighting
 */
public class CleaningService {

    public static class CleaningResult implements Serializable {
        private static final long serialVersionUID = 1L;

        private int originalRowCount;
        private int cleanedRowCount;
        private int originalColumnCount;
        private int cleanedColumnCount;
        private int affectedRowsCount;
        private int affectedCellsCount;
        private List<String> headers;
        private List<List<String>> rows;
        private List<List<String>> previewRows; // complete rows
        private List<String> originalHeaders;
        private List<List<String>> originalRows;
        private List<String> appliedOperationsSummary;
        private List<String> changedCellCoordinates; // "r:c"
        private Map<String, Map<String, String>> cellChanges; // "r:c" -> { "old": ..., "new": ... }
        private int rowsRemoved;
        private int columnsRemoved;
        private int missingValuesBefore;
        private int missingValuesAfter;
        private int duplicateRowsBefore;
        private int duplicateRowsAfter;
        private int qualityScoreBefore;
        private int qualityScoreAfter;
        private String noChangesMessage;
        private CSVData transformedCSVData;

        public CleaningResult() {
            this.headers = new ArrayList<>();
            this.rows = new ArrayList<>();
            this.previewRows = new ArrayList<>();
            this.originalHeaders = new ArrayList<>();
            this.originalRows = new ArrayList<>();
            this.appliedOperationsSummary = new ArrayList<>();
            this.changedCellCoordinates = new ArrayList<>();
            this.cellChanges = new LinkedHashMap<>();
            this.noChangesMessage = "";
        }

        public int getRowsRemoved() { return rowsRemoved; }
        public void setRowsRemoved(int count) { this.rowsRemoved = count; }

        public int getColumnsRemoved() { return columnsRemoved; }
        public void setColumnsRemoved(int count) { this.columnsRemoved = count; }

        public int getMissingValuesBefore() { return missingValuesBefore; }
        public void setMissingValuesBefore(int count) { this.missingValuesBefore = count; }

        public int getMissingValuesAfter() { return missingValuesAfter; }
        public void setMissingValuesAfter(int count) { this.missingValuesAfter = count; }

        public int getDuplicateRowsBefore() { return duplicateRowsBefore; }
        public void setDuplicateRowsBefore(int count) { this.duplicateRowsBefore = count; }

        public int getDuplicateRowsAfter() { return duplicateRowsAfter; }
        public void setDuplicateRowsAfter(int count) { this.duplicateRowsAfter = count; }

        public int getQualityScoreBefore() { return qualityScoreBefore; }
        public void setQualityScoreBefore(int score) { this.qualityScoreBefore = score; }

        public int getQualityScoreAfter() { return qualityScoreAfter; }
        public void setQualityScoreAfter(int score) { this.qualityScoreAfter = score; }

        public String getNoChangesMessage() { return noChangesMessage; }
        public void setNoChangesMessage(String msg) { this.noChangesMessage = msg; }

        public int getOriginalRowCount() { return originalRowCount; }
        public void setOriginalRowCount(int count) { this.originalRowCount = count; }

        public int getCleanedRowCount() { return cleanedRowCount; }
        public void setCleanedRowCount(int count) { this.cleanedRowCount = count; }

        public int getOriginalColumnCount() { return originalColumnCount; }
        public void setOriginalColumnCount(int count) { this.originalColumnCount = count; }

        public int getCleanedColumnCount() { return cleanedColumnCount; }
        public void setCleanedColumnCount(int count) { this.cleanedColumnCount = count; }

        public int getAffectedRowsCount() { return affectedRowsCount; }
        public void setAffectedRowsCount(int count) { this.affectedRowsCount = count; }

        public int getAffectedCellsCount() { return affectedCellsCount; }
        public void setAffectedCellsCount(int count) { this.affectedCellsCount = count; }

        public List<String> getHeaders() { return headers; }
        public void setHeaders(List<String> headers) { this.headers = headers; }

        public List<List<String>> getRows() { return rows; }
        public void setRows(List<List<String>> rows) { this.rows = rows; }

        public List<List<String>> getPreviewRows() { return previewRows; }
        public void setPreviewRows(List<List<String>> previewRows) { this.previewRows = previewRows; }

        public List<String> getOriginalHeaders() { return originalHeaders; }
        public void setOriginalHeaders(List<String> originalHeaders) { this.originalHeaders = originalHeaders; }

        public List<List<String>> getOriginalRows() { return originalRows; }
        public void setOriginalRows(List<List<String>> originalRows) { this.originalRows = originalRows; }

        public List<String> getAppliedOperationsSummary() { return appliedOperationsSummary; }
        public void setAppliedOperationsSummary(List<String> list) { this.appliedOperationsSummary = list; }

        public List<String> getChangedCellCoordinates() { return changedCellCoordinates; }
        public void setChangedCellCoordinates(List<String> changedCellCoordinates) { this.changedCellCoordinates = changedCellCoordinates; }

        public Map<String, Map<String, String>> getCellChanges() { return cellChanges; }
        public void setCellChanges(Map<String, Map<String, String>> cellChanges) { this.cellChanges = cellChanges; }

        public CSVData getTransformedCSVData() { return transformedCSVData; }
        public void setTransformedCSVData(CSVData transformedCSVData) { this.transformedCSVData = transformedCSVData; }
    }

    private static class RowEntry {
        int originalIndex;
        List<String> cells;
        Map<Integer, String> originalCellValues = new HashMap<>();

        RowEntry(int originalIndex, List<String> cells) {
            this.originalIndex = originalIndex;
            this.cells = new ArrayList<>(cells);
            for (int i = 0; i < cells.size(); i++) {
                originalCellValues.put(i, cells.get(i));
            }
        }
    }

    /**
     * Executes staged cleaning operations in sequential order.
     */
    public CleaningResult processCleaning(CSVData originalData, AnalysisResult originalAnalysis, List<CleaningOperation> operations) {
        CleaningResult result = new CleaningResult();
        if (originalData == null || originalData.getHeaders() == null) {
            return result;
        }

        List<String> origHeaders = new ArrayList<>(originalData.getHeaders());
        List<List<String>> origRows = new ArrayList<>();
        for (List<String> r : originalData.getRows()) {
            origRows.add(new ArrayList<>(r));
        }

        result.setOriginalRowCount(origRows.size());
        result.setOriginalColumnCount(origHeaders.size());
        result.setOriginalHeaders(origHeaders);
        result.setOriginalRows(origRows);

        List<String> headers = new ArrayList<>(origHeaders);
        List<RowEntry> rowEntries = new ArrayList<>();
        for (int i = 0; i < origRows.size(); i++) {
            rowEntries.add(new RowEntry(i, origRows.get(i)));
        }

        Set<Integer> affectedOriginalRowIndices = new HashSet<>();
        int totalAffectedCells = 0;

        if (operations != null) {
            for (CleaningOperation op : operations) {
                String opType = normalizeOpType(op);
                String strategy = op.getStrategy() != null ? op.getStrategy().trim().toLowerCase() : "";
                String column = op.getColumnName() != null ? op.getColumnName().trim() : "";

                switch (opType) {
                    case "REMOVE_DUPLICATES": {
                        int beforeCount = rowEntries.size();
                        Set<String> seenKeys = new HashSet<>();
                        List<RowEntry> uniqueEntries = new ArrayList<>();

                        int colIdx = (!column.isEmpty() && !column.equalsIgnoreCase("ALL")) ? headers.indexOf(column) : -1;

                        for (RowEntry re : rowEntries) {
                            String key;
                            if (colIdx >= 0 && colIdx < re.cells.size()) {
                                key = re.cells.get(colIdx) != null ? re.cells.get(colIdx).trim() : "";
                            } else {
                                key = String.join("||", re.cells);
                            }

                            if (seenKeys.add(key)) {
                                uniqueEntries.add(re);
                            } else {
                                affectedOriginalRowIndices.add(re.originalIndex);
                            }
                        }

                        int removed = beforeCount - uniqueEntries.size();
                        rowEntries = uniqueEntries;
                        totalAffectedCells += (removed * headers.size());

                        if (colIdx >= 0) {
                            result.getAppliedOperationsSummary().add(String.format("Deduplicated by column '%s' (removed %d duplicate row(s)).", column, removed));
                        } else {
                            result.getAppliedOperationsSummary().add(String.format("Removed %d exact duplicate row(s).", removed));
                        }
                        break;
                    }

                    case "MISSING_VALUES":
                    case "IMPUTE_MISSING":
                    case "DROP_MISSING": {
                        if (strategy.contains("drop") || "drop_rows".equals(strategy) || "DROP_MISSING".equals(opType)) {
                            // Drop rows with missing values
                            int beforeCount = rowEntries.size();
                            List<RowEntry> keptEntries = new ArrayList<>();
                            int colIdx = (!column.isEmpty() && !column.equalsIgnoreCase("ALL")) ? headers.indexOf(column) : -1;

                            for (RowEntry re : rowEntries) {
                                boolean hasMissing = false;
                                if (colIdx >= 0) {
                                    String val = colIdx < re.cells.size() ? re.cells.get(colIdx) : "";
                                    if (isMissing(val)) hasMissing = true;
                                } else {
                                    for (String cVal : re.cells) {
                                        if (isMissing(cVal)) {
                                            hasMissing = true;
                                            break;
                                        }
                                    }
                                }

                                if (hasMissing) {
                                    affectedOriginalRowIndices.add(re.originalIndex);
                                } else {
                                    keptEntries.add(re);
                                }
                            }

                            int dropped = beforeCount - keptEntries.size();
                            rowEntries = keptEntries;
                            totalAffectedCells += (dropped * headers.size());
                            result.getAppliedOperationsSummary().add(String.format("Dropped %d row(s) containing missing values%s.",
                                dropped, colIdx >= 0 ? (" in '" + column + "'") : ""));
                        } else {
                            // Imputation (mean, median, mode, constant)
                            List<Integer> targetColIndices = resolveTargetColumns(headers, column);
                            int imputedCells = 0;

                            for (int colIdx : targetColIndices) {
                                String colName = headers.get(colIdx);
                                String fillVal = "";

                                if (strategy.contains("mean") || strategy.contains("median")) {
                                    boolean useMedian = strategy.contains("median");
                                    double num = computeMeanOrMedian(rowEntries, colIdx, useMedian);
                                    fillVal = String.valueOf(round2(num));
                                } else if (strategy.contains("mode")) {
                                    fillVal = computeMode(rowEntries, colIdx);
                                } else {
                                    // Custom constant
                                    fillVal = op.getCustomValue() != null && !op.getCustomValue().isEmpty() ? op.getCustomValue() : "0";
                                }

                                for (RowEntry re : rowEntries) {
                                    while (re.cells.size() <= colIdx) re.cells.add("");
                                    String cur = re.cells.get(colIdx);
                                    if (isMissing(cur)) {
                                        re.cells.set(colIdx, fillVal);
                                        imputedCells++;
                                        affectedOriginalRowIndices.add(re.originalIndex);
                                    }
                                }
                                result.getAppliedOperationsSummary().add(String.format("Imputed missing values in '%s' using %s ('%s').",
                                    colName, strategy.toUpperCase(), fillVal));
                            }
                            totalAffectedCells += imputedCells;
                        }
                        break;
                    }

                    case "OUTLIERS":
                    case "HANDLE_OUTLIERS": {
                        int colIdx = headers.indexOf(column);
                        if (colIdx >= 0) {
                            List<Double> nums = new ArrayList<>();
                            for (RowEntry re : rowEntries) {
                                if (colIdx < re.cells.size()) {
                                    Double d = parseDoubleSafe(re.cells.get(colIdx));
                                    if (d != null) nums.add(d);
                                }
                            }

                            if (nums.size() >= 4) {
                                Collections.sort(nums);
                                double q25 = nums.get((int) Math.floor(nums.size() * 0.25));
                                double q75 = nums.get((int) Math.min(nums.size() - 1, Math.floor(nums.size() * 0.75)));
                                double iqr = Math.max(0.0, q75 - q25);
                                double lower = round2(q25 - 1.5 * iqr);
                                double upper = round2(q75 + 1.5 * iqr);

                                if (strategy.contains("remove")) {
                                    int beforeCount = rowEntries.size();
                                    List<RowEntry> kept = new ArrayList<>();
                                    for (RowEntry re : rowEntries) {
                                        boolean isOutlier = false;
                                        if (colIdx < re.cells.size()) {
                                            Double d = parseDoubleSafe(re.cells.get(colIdx));
                                            if (d != null && (d < lower || d > upper)) {
                                                isOutlier = true;
                                            }
                                        }
                                        if (isOutlier) {
                                            affectedOriginalRowIndices.add(re.originalIndex);
                                        } else {
                                            kept.add(re);
                                        }
                                    }
                                    int removed = beforeCount - kept.size();
                                    rowEntries = kept;
                                    totalAffectedCells += (removed * headers.size());
                                    result.getAppliedOperationsSummary().add(String.format("Removed %d outlier row(s) in '%s' outside [%.2f, %.2f].",
                                        removed, column, lower, upper));
                                } else {
                                    // Cap at bounds
                                    int capped = 0;
                                    for (RowEntry re : rowEntries) {
                                        if (colIdx < re.cells.size()) {
                                            Double d = parseDoubleSafe(re.cells.get(colIdx));
                                            if (d != null) {
                                                if (d < lower) {
                                                    re.cells.set(colIdx, String.valueOf(lower));
                                                    capped++;
                                                    affectedOriginalRowIndices.add(re.originalIndex);
                                                } else if (d > upper) {
                                                    re.cells.set(colIdx, String.valueOf(upper));
                                                    capped++;
                                                    affectedOriginalRowIndices.add(re.originalIndex);
                                                }
                                            }
                                        }
                                    }
                                    totalAffectedCells += capped;
                                    result.getAppliedOperationsSummary().add(String.format("Capped %d outlier(s) in '%s' to bounds [%.2f, %.2f].",
                                        capped, column, lower, upper));
                                }
                            }
                        }
                        break;
                    }

                    case "TEXT_SANITIZE":
                    case "STANDARDIZE_CASE":
                    case "TRIM_WHITESPACE": {
                        List<Integer> targetColIndices = resolveTextTargetColumns(headers, column, rowEntries, originalAnalysis);
                        int alteredCells = 0;

                        for (int colIdx : targetColIndices) {
                            String colName = headers.get(colIdx);
                            int colAltered = 0;

                            for (RowEntry re : rowEntries) {
                                if (colIdx < re.cells.size() && re.cells.get(colIdx) != null) {
                                    String orig = re.cells.get(colIdx);
                                    String cleaned = transformText(orig, strategy, colName);
                                    if (!orig.equals(cleaned)) {
                                        re.cells.set(colIdx, cleaned);
                                        colAltered++;
                                        affectedOriginalRowIndices.add(re.originalIndex);
                                    }
                                }
                            }
                            alteredCells += colAltered;
                        }

                        totalAffectedCells += alteredCells;
                        result.getAppliedOperationsSummary().add(String.format("Sanitized text (%s) across %d cell(s)%s.",
                            strategy, alteredCells, (!column.isEmpty() && !column.equalsIgnoreCase("ALL")) ? (" in '" + column + "'") : ""));
                        break;
                    }

                    case "COLUMN_MANAGEMENT":
                    case "DROP_COLUMN":
                    case "RENAME_COLUMN": {
                        String action = op.getAction() != null ? op.getAction().trim().toLowerCase() : "";
                        if (action.isEmpty()) {
                            if ("DROP_COLUMN".equals(opType)) action = "drop";
                            else if ("RENAME_COLUMN".equals(opType)) action = "rename";
                        }

                        int colIdx = headers.indexOf(column);
                        if (colIdx >= 0) {
                            if ("drop".equals(action)) {
                                headers.remove(colIdx);
                                for (RowEntry re : rowEntries) {
                                    if (colIdx < re.cells.size()) {
                                        re.cells.remove(colIdx);
                                    }
                                }
                                totalAffectedCells += rowEntries.size();
                                result.getAppliedOperationsSummary().add(String.format("Dropped column '%s'.", column));
                            } else if ("rename".equals(action)) {
                                String newName = op.getNewColumnName() != null ? op.getNewColumnName().trim() : "";
                                if (!newName.isEmpty()) {
                                    headers.set(colIdx, newName);
                                    result.getAppliedOperationsSummary().add(String.format("Renamed column '%s' to '%s'.", column, newName));
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }

        // Build final transformed rows
        List<List<String>> finalRows = new ArrayList<>();
        List<String> changedCellCoords = new ArrayList<>();
        Map<String, Map<String, String>> cellChangesMap = new LinkedHashMap<>();

        for (int r = 0; r < rowEntries.size(); r++) {
            RowEntry re = rowEntries.get(r);
            finalRows.add(re.cells);

            // Compare each cell in final row with the cell in original row
            List<String> origRow = origRows.get(re.originalIndex);
            for (int c = 0; c < re.cells.size(); c++) {
                String newVal = re.cells.get(c);
                // Look up matching column name in original headers
                String curHeader = (c < headers.size()) ? headers.get(c) : "";
                int origColIdx = origHeaders.indexOf(curHeader);
                String oldVal = (origColIdx >= 0 && origColIdx < origRow.size()) ? origRow.get(origColIdx) : null;

                if (oldVal != null && !oldVal.equals(newVal)) {
                    String coord = r + ":" + c;
                    changedCellCoords.add(coord);
                    Map<String, String> change = new LinkedHashMap<>();
                    change.put("old", oldVal);
                    change.put("new", newVal);
                    change.put("column", curHeader);
                    cellChangesMap.put(coord, change);
                }
            }
        }

        // Calculate comprehensive before-and-after impact metrics
        int missingBefore = 0;
        for (List<String> r : origRows) {
            for (String c : r) {
                if (isMissing(c)) missingBefore++;
            }
        }
        int missingAfter = 0;
        for (List<String> r : finalRows) {
            for (String c : r) {
                if (isMissing(c)) missingAfter++;
            }
        }

        Set<String> origSeen = new HashSet<>();
        int dupBefore = 0;
        for (List<String> r : origRows) {
            if (!origSeen.add(String.join("||", r))) dupBefore++;
        }
        Set<String> cleanSeen = new HashSet<>();
        int dupAfter = 0;
        for (List<String> r : finalRows) {
            if (!cleanSeen.add(String.join("||", r))) dupAfter++;
        }

        int totalOrigCells = origRows.size() * origHeaders.size();
        double origComp = totalOrigCells > 0 ? ((totalOrigCells - missingBefore) * 100.0) / totalOrigCells : 100.0;
        double origUniq = origRows.size() > 0 ? ((origRows.size() - dupBefore) * 100.0) / origRows.size() : 100.0;
        int qualityBefore = (int) Math.max(0, Math.min(100, Math.round(100.0 - (100.0 - origComp) * 0.6 - (100.0 - origUniq) * 0.4)));

        int totalCleanCells = finalRows.size() * headers.size();
        double cleanComp = totalCleanCells > 0 ? ((totalCleanCells - missingAfter) * 100.0) / totalCleanCells : 100.0;
        double cleanUniq = finalRows.size() > 0 ? ((finalRows.size() - dupAfter) * 100.0) / finalRows.size() : 100.0;
        int qualityAfter = (int) Math.max(0, Math.min(100, Math.round(100.0 - (100.0 - cleanComp) * 0.6 - (100.0 - cleanUniq) * 0.4)));

        int rowsRemoved = origRows.size() - finalRows.size();
        int columnsRemoved = origHeaders.size() - headers.size();

        boolean noChanges = (rowsRemoved == 0 && columnsRemoved == 0 && totalAffectedCells == 0 && changedCellCoords.isEmpty());
        String noChangesMsg = noChanges ? ("No changes were required. All " + origRows.size() + " rows were retained.") : "";

        result.setCleanedRowCount(finalRows.size());
        result.setCleanedColumnCount(headers.size());
        result.setRowsRemoved(rowsRemoved);
        result.setColumnsRemoved(columnsRemoved);
        result.setMissingValuesBefore(missingBefore);
        result.setMissingValuesAfter(missingAfter);
        result.setDuplicateRowsBefore(dupBefore);
        result.setDuplicateRowsAfter(dupAfter);
        result.setQualityScoreBefore(qualityBefore);
        result.setQualityScoreAfter(qualityAfter);
        result.setNoChangesMessage(noChangesMsg);

        result.setAffectedRowsCount(affectedOriginalRowIndices.size());
        result.setAffectedCellsCount(totalAffectedCells);
        result.setHeaders(headers);
        result.setRows(finalRows);
        result.setPreviewRows(finalRows); // Return ALL transformed rows
        result.setChangedCellCoordinates(changedCellCoords);
        result.setCellChanges(cellChangesMap);

        CSVData transformedCSV = new CSVData(headers, finalRows);
        result.setTransformedCSVData(transformedCSV);

        return result;
    }

    private String normalizeOpType(CleaningOperation op) {
        String type = op.getOperationType();
        if (type == null || type.isEmpty()) type = op.getType();
        if (type == null) return "";
        type = type.toUpperCase().trim();

        if (type.equals("MISSING") || type.equals("MISSING_VALUES")) return "MISSING_VALUES";
        if (type.equals("DUPLICATES") || type.equals("REMOVE_DUPLICATES")) return "REMOVE_DUPLICATES";
        if (type.equals("OUTLIERS") || type.equals("HANDLE_OUTLIERS")) return "OUTLIERS";
        if (type.equals("TEXT") || type.equals("TEXT_SANITIZE") || type.equals("STANDARDIZE_CASE") || type.equals("TRIM_WHITESPACE")) return "TEXT_SANITIZE";
        if (type.equals("COLUMN") || type.equals("COLUMN_MANAGEMENT") || type.equals("DROP_COLUMN") || type.equals("RENAME_COLUMN")) return "COLUMN_MANAGEMENT";

        return type;
    }

    private boolean isIdColumn(String colName) {
        if (colName == null) return false;
        String name = colName.trim().toLowerCase();
        if (name.equals("id") || name.endsWith("_id") || name.startsWith("id_")) return true;
        if (name.endsWith("id") && (name.contains("order") || name.contains("user") || name.contains("cust") || name.contains("trans") || name.contains("prod") || name.length() <= 4)) return true;
        return false;
    }

    private boolean isNumericOrDate(String val) {
        if (val == null) return false;
        String s = val.trim();
        if (s.isEmpty() || isMissing(s)) return false;
        // Check date formats: YYYY-MM-DD or MM/DD/YYYY or DD-MM-YYYY, optional time
        if (s.matches("^\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}(?:[ T]\\d{1,2}:\\d{2}(?::\\d{2})?)?$") ||
            s.matches("^\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}$")) {
            return true;
        }
        // Check numeric (including standard negative, decimals, currency prefixes, percent)
        String cleaned = s.replace("$", "").replace("€", "").replace("£", "").replace(",", "").replace("%", "").trim();
        if (!cleaned.isEmpty()) {
            try {
                Double.parseDouble(cleaned);
                return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    private boolean isApplicableTextColumn(String colName, int colIdx, List<RowEntry> rows, AnalysisResult analysis) {
        if (isIdColumn(colName)) {
            return false;
        }
        if (analysis != null && analysis.getColumns() != null) {
            for (com.datalens.model.ColumnMetadata cm : analysis.getColumns()) {
                if (cm.getName() != null && cm.getName().equalsIgnoreCase(colName)) {
                    String type = cm.getType() != null ? cm.getType().toUpperCase() : "";
                    if ("NUMERIC".equals(type) || "DATE".equals(type)) {
                        return false;
                    }
                    if ("CATEGORICAL".equals(type) || "STRING".equals(type) || "TEXT".equals(type) || "BOOLEAN".equals(type)) {
                        return true;
                    }
                }
            }
        }
        // Fallback: check values in rows
        int numericOrDate = 0;
        int nonMissing = 0;
        for (RowEntry re : rows) {
            if (colIdx < re.cells.size()) {
                String val = re.cells.get(colIdx);
                if (val != null && !val.trim().isEmpty() && !isMissing(val)) {
                    nonMissing++;
                    if (isNumericOrDate(val)) {
                        numericOrDate++;
                    }
                }
            }
        }
        if (nonMissing > 0 && ((double) numericOrDate / nonMissing) >= 0.70) {
            return false;
        }
        return true;
    }

    private List<Integer> resolveTextTargetColumns(List<String> headers, String column, List<RowEntry> rows, AnalysisResult analysis) {
        List<Integer> list = new ArrayList<>();
        if (column == null || column.isEmpty() || column.equalsIgnoreCase("ALL")) {
            for (int i = 0; i < headers.size(); i++) {
                String colName = headers.get(i);
                if (isApplicableTextColumn(colName, i, rows, analysis)) {
                    list.add(i);
                }
            }
        } else {
            int idx = headers.indexOf(column);
            if (idx >= 0) {
                list.add(idx);
            }
        }
        return list;
    }

    private List<Integer> resolveTargetColumns(List<String> headers, String column) {
        List<Integer> list = new ArrayList<>();
        if (column == null || column.isEmpty() || column.equalsIgnoreCase("ALL")) {
            for (int i = 0; i < headers.size(); i++) list.add(i);
        } else {
            int idx = headers.indexOf(column);
            if (idx >= 0) list.add(idx);
        }
        return list;
    }

    private boolean isMissing(String s) {
        if (s == null) return true;
        String t = s.trim().toLowerCase();
        return t.isEmpty() || t.equals("na") || t.equals("n/a") ||
               t.equals("null") || t.equals("nan") || t.equals("none") ||
               t.equals("?") || t.equals("-");
    }

    private String transformText(String s, String strategy, String colName) {
        if (s == null) return "";
        if (strategy == null || strategy.isEmpty()) return s;

        // If ID column, do not modify
        if (isIdColumn(colName)) {
            return s;
        }

        // For casing operations: never modify numbers or dates
        if (strategy.contains("lower") || strategy.contains("upper") || strategy.contains("title")) {
            if (isNumericOrDate(s)) {
                return s;
            }
            // Ensure there are actual letters
            boolean hasLetter = false;
            for (int i = 0; i < s.length(); i++) {
                if (Character.isLetter(s.charAt(i))) {
                    hasLetter = true;
                    break;
                }
            }
            if (!hasLetter) {
                return s;
            }
        }

        if (strategy.contains("trim")) {
            return s.trim();
        } else if (strategy.contains("upper")) {
            return s.toUpperCase();
        } else if (strategy.contains("lower")) {
            return s.toLowerCase();
        } else if (strategy.contains("title")) {
            return toTitleCase(s);
        } else if (strategy.contains("special")) {
            // Keep alphanumeric, whitespace, hyphen, period, underscore
            return s.replaceAll("[^a-zA-Z0-9\\s\\-._]", "");
        }
        return s;
    }

    private Double parseDoubleSafe(String s) {
        if (s == null || isMissing(s)) return null;
        try {
            return Double.parseDouble(s.trim().replace("$", "").replace(",", "").replace("%", ""));
        } catch (Exception e) {
            return null;
        }
    }

    private double computeMeanOrMedian(List<RowEntry> rows, int colIdx, boolean useMedian) {
        List<Double> nums = new ArrayList<>();
        for (RowEntry re : rows) {
            if (colIdx < re.cells.size()) {
                Double d = parseDoubleSafe(re.cells.get(colIdx));
                if (d != null) nums.add(d);
            }
        }
        if (nums.isEmpty()) return 0.0;
        if (useMedian) {
            Collections.sort(nums);
            int n = nums.size();
            return (n % 2 == 0) ? (nums.get(n / 2 - 1) + nums.get(n / 2)) / 2.0 : nums.get(n / 2);
        } else {
            double sum = 0.0;
            for (double d : nums) sum += d;
            return sum / nums.size();
        }
    }

    private String computeMode(List<RowEntry> rows, int colIdx) {
        Map<String, Integer> counts = new HashMap<>();
        for (RowEntry re : rows) {
            if (colIdx < re.cells.size()) {
                String val = re.cells.get(colIdx);
                if (val != null && !isMissing(val)) {
                    String clean = val.trim();
                    counts.put(clean, counts.getOrDefault(clean, 0) + 1);
                }
            }
        }
        String mode = "";
        int max = 0;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > max) {
                max = e.getValue();
                mode = e.getKey();
            }
        }
        return mode;
    }

    private String toTitleCase(String text) {
        if (text == null || text.isEmpty()) return text;
        StringBuilder sb = new StringBuilder();
        boolean nextTitle = true;
        for (char c : text.toCharArray()) {
            if (Character.isWhitespace(c)) {
                nextTitle = true;
                sb.append(c);
            } else if (nextTitle) {
                sb.append(Character.toTitleCase(c));
                nextTitle = false;
            } else {
                sb.append(Character.toLowerCase(c));
            }
        }
        return sb.toString();
    }

    private double round2(double val) {
        return Math.round(val * 100.0) / 100.0;
    }
}
