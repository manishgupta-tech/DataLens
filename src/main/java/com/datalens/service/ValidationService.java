package com.datalens.service;

import com.datalens.model.ValidationRule;
import com.datalens.util.CSVParserUtil.CSVData;

import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;

/**
 * DataLens — ValidationService
 * Deterministic engine for evaluating user-defined data validation rules.
 */
public class ValidationService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[a-zA-Z0-9_+&*-]+(?:\\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,7}$");

    public void evaluateRule(ValidationRule rule, CSVData csvData) {
        if (rule == null || csvData == null) return;

        List<String> headers = csvData.getHeaders();
        List<List<String>> rows = csvData.getRows();
        int totalRows = rows.size();

        String colName = rule.getColumnName();
        int colIdx = -1;
        if (headers != null && colName != null) {
            colIdx = headers.indexOf(colName);
            if (colIdx < 0) {
                for (int i = 0; i < headers.size(); i++) {
                    if (headers.get(i).trim().equalsIgnoreCase(colName.trim())) {
                        colIdx = i;
                        break;
                    }
                }
            }
            if (colIdx < 0) {
                String norm = colName.toLowerCase().replaceAll("[\\s_-]", "");
                for (int i = 0; i < headers.size(); i++) {
                    if (headers.get(i).toLowerCase().replaceAll("[\\s_-]", "").equals(norm)) {
                        colIdx = i;
                        break;
                    }
                }
            }
        }

        if ("REQUIRED".equalsIgnoreCase(rule.getRuleType())) {
            if (colIdx >= 0) {
                rule.setStatus("PASSED");
                rule.setFailedCount(0);
                rule.setFailureRate(0.0);
            } else {
                rule.setStatus("FAIL");
                rule.setFailedCount(totalRows);
                rule.setFailureRate(100.0);
                rule.setExampleFailedRows(Collections.singletonList(1));
            }
            return;
        }

        if (colIdx < 0) {
            rule.setStatus("ERROR");
            rule.setTotalRows(totalRows);
            rule.setFailedCount(0);
            rule.setFailureRate(0.0);
            rule.setExampleFailedRows(Collections.emptyList());
            rule.setExampleViolations(Collections.singletonList("Column '" + colName + "' not found in active dataset"));
            return;
        }

        int failed = 0;
        List<Integer> failedRows = new ArrayList<>();
        Set<String> exampleViolationsSet = new LinkedHashSet<>();
        Map<String, Integer> firstSeenRowMap = new HashMap<>();

        for (int r = 0; r < totalRows; r++) {
            List<String> row = rows.get(r);
            String val = (colIdx < row.size()) ? row.get(colIdx) : "";
            String rawVal = val != null ? val.trim() : "";
            boolean isRowFailed = false;
            String violationValue = null;

            switch (rule.getRuleType().toUpperCase()) {
                case "NO_MISSING": {
                    if (rawVal.isEmpty() || isMissing(rawVal)) {
                        isRowFailed = true;
                        violationValue = "(missing)";
                    }
                    break;
                }

                case "POSITIVE_ONLY": {
                    if (!rawVal.isEmpty() && !isMissing(rawVal)) {
                        try {
                            double num = Double.parseDouble(rawVal.replace("$", "").replace("€", "").replace("£", "").replace(",", "").replace("%", "").trim());
                            if (num <= 0) {
                                isRowFailed = true;
                                violationValue = rawVal + " (<= 0)";
                            }
                        } catch (NumberFormatException e) {
                            isRowFailed = true;
                            violationValue = rawVal + " (non-numeric)";
                        }
                    } else {
                        isRowFailed = true;
                        violationValue = "(missing)";
                    }
                    break;
                }

                case "NUMERIC_RANGE": {
                    if (!rawVal.isEmpty() && !isMissing(rawVal)) {
                        try {
                            double num = Double.parseDouble(rawVal.replace("$", "").replace("€", "").replace("£", "").replace(",", "").replace("%", "").trim());
                            if (rule.getMinValue() != null && num < rule.getMinValue()) {
                                isRowFailed = true;
                                violationValue = rawVal + " (< " + rule.getMinValue() + ")";
                            }
                            if (rule.getMaxValue() != null && num > rule.getMaxValue()) {
                                isRowFailed = true;
                                violationValue = rawVal + " (> " + rule.getMaxValue() + ")";
                            }
                        } catch (NumberFormatException e) {
                            isRowFailed = true;
                            violationValue = rawVal + " (non-numeric)";
                        }
                    } else {
                        isRowFailed = true;
                        violationValue = "(missing)";
                    }
                    break;
                }

                case "UNIQUE": {
                    if (!rawVal.isEmpty() && !isMissing(rawVal)) {
                        String key = rawVal.toLowerCase();
                        if (firstSeenRowMap.containsKey(key)) {
                            isRowFailed = true;
                            int firstRow = firstSeenRowMap.get(key);
                            violationValue = rawVal + " (duplicate of row " + firstRow + ")";
                        } else {
                            firstSeenRowMap.put(key, r + 1);
                        }
                    } else {
                        if (firstSeenRowMap.containsKey("__missing__")) {
                            isRowFailed = true;
                            int firstRow = firstSeenRowMap.get("__missing__");
                            violationValue = "(duplicate empty, row " + firstRow + ")";
                        } else {
                            firstSeenRowMap.put("__missing__", r + 1);
                        }
                    }
                    break;
                }

                case "ALLOWED_VALUES":
                case "ALLOWED_CATEGORIES": {
                    if (!rawVal.isEmpty() && !isMissing(rawVal)) {
                        if (rule.getAllowedValues() != null && !rule.getAllowedValues().isEmpty()) {
                            boolean match = false;
                            for (String allowed : rule.getAllowedValues()) {
                                if (allowed.trim().equalsIgnoreCase(rawVal)) {
                                    match = true;
                                    break;
                                }
                            }
                            if (!match) {
                                isRowFailed = true;
                                violationValue = rawVal;
                            }
                        }
                    } else {
                        isRowFailed = true;
                        violationValue = rawVal.isEmpty() ? "(missing)" : rawVal;
                    }
                    break;
                }

                case "TEXT_LENGTH": {
                    if (!rawVal.isEmpty() && !isMissing(rawVal)) {
                        int len = rawVal.length();
                        if (rule.getMinLength() != null && len < rule.getMinLength()) {
                            isRowFailed = true;
                            violationValue = rawVal + " (len " + len + ")";
                        }
                        if (rule.getMaxLength() != null && len > rule.getMaxLength()) {
                            isRowFailed = true;
                            violationValue = rawVal + " (len " + len + ")";
                        }
                    }
                    break;
                }

                case "EMAIL_FORMAT": {
                    if (!rawVal.isEmpty() && !isMissing(rawVal)) {
                        if (!EMAIL_PATTERN.matcher(rawVal).matches()) {
                            isRowFailed = true;
                            violationValue = rawVal;
                        }
                    }
                    break;
                }

                case "DATE_RANGE": {
                    if (!rawVal.isEmpty() && !isMissing(rawVal)) {
                        try {
                            LocalDate d = LocalDate.parse(rawVal.split("[ T]")[0]);
                            if (rule.getStartDate() != null && !rule.getStartDate().isEmpty()) {
                                LocalDate start = LocalDate.parse(rule.getStartDate());
                                if (d.isBefore(start)) {
                                    isRowFailed = true;
                                    violationValue = rawVal;
                                }
                            }
                            if (rule.getEndDate() != null && !rule.getEndDate().isEmpty()) {
                                LocalDate end = LocalDate.parse(rule.getEndDate());
                                if (d.isAfter(end)) {
                                    isRowFailed = true;
                                    violationValue = rawVal;
                                }
                            }
                        } catch (Exception e) {
                            isRowFailed = true;
                            violationValue = rawVal;
                        }
                    }
                    break;
                }

                case "CROSS_COLUMN": {
                    int targetIdx = (rule.getTargetColumn() != null) ? headers.indexOf(rule.getTargetColumn()) : -1;
                    if (targetIdx >= 0) {
                        String targetVal = (targetIdx < row.size()) ? row.get(targetIdx) : "";
                        String tRaw = targetVal != null ? targetVal.trim() : "";
                        try {
                            double num1 = Double.parseDouble(rawVal.replace("$", "").replace(",", "").replace("%", ""));
                            double num2 = Double.parseDouble(tRaw.replace("$", "").replace(",", "").replace("%", ""));
                            String op = rule.getOperator() != null ? rule.getOperator().toLowerCase() : "gte";
                            switch (op) {
                                case "gt": if (!(num1 > num2)) isRowFailed = true; break;
                                case "gte": if (!(num1 >= num2)) isRowFailed = true; break;
                                case "lt": if (!(num1 < num2)) isRowFailed = true; break;
                                case "lte": if (!(num1 <= num2)) isRowFailed = true; break;
                                case "eq": if (!(num1 == num2)) isRowFailed = true; break;
                                case "neq": if (!(num1 != num2)) isRowFailed = true; break;
                            }
                            if (isRowFailed) violationValue = rawVal + " vs " + tRaw;
                        } catch (Exception e) {
                            isRowFailed = true;
                            violationValue = rawVal;
                        }
                    }
                    break;
                }
            }

            if (isRowFailed) {
                failed++;
                if (failedRows.size() < 10) {
                    failedRows.add(r + 1); // 1-indexed row number
                }
                if (violationValue != null && exampleViolationsSet.size() < 5) {
                    exampleViolationsSet.add(violationValue);
                }
            }
        }

        rule.setTotalRows(totalRows);
        rule.setFailedCount(failed);
        rule.setFailureRate(totalRows > 0 ? (Math.round((failed * 100.0 / totalRows) * 100.0) / 100.0) : 0.0);
        rule.setStatus(failed == 0 ? "PASSED" : "FAILED");
        rule.setExampleFailedRows(failedRows);
        rule.setExampleViolations(new ArrayList<>(exampleViolationsSet));
    }

    private boolean isMissing(String s) {
        String lower = s.toLowerCase();
        return lower.equals("na") || lower.equals("n/a") || lower.equals("null") ||
               lower.equals("nan") || lower.equals("none") || lower.equals("?");
    }
}
