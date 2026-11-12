package com.datalens.model;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * DataLens — ValidationRule Model
 * User-defined data validation rule definition and execution result.
 */
public class ValidationRule implements Serializable {
    private static final long serialVersionUID = 1L;

    private String id;
    private Integer datasetId;
    private long createdAt;
    private String name;
    private String ruleType; // "NO_MISSING", "POSITIVE_ONLY", "NUMERIC_RANGE", "ALLOWED_VALUES", "UNIQUE", etc.
    private String columnName;
    private String targetColumn; // for CROSS_COLUMN
    private String operator;     // "gt", "gte", "lt", "lte", "eq", "neq"
    private Double minValue;
    private Double maxValue;
    private Integer minLength;
    private Integer maxLength;
    private List<String> allowedValues;
    private String startDate;
    private String endDate;

    // Execution results
    private String status; // "PASSED", "FAILED", "UNTESTED", "ERROR"
    private int totalRows;
    private int failedCount;
    private double failureRate;
    private List<Integer> exampleFailedRows; // 1-indexed
    private List<String> exampleViolations;  // Real representative violating values

    public ValidationRule() {
        this.allowedValues = new ArrayList<>();
        this.exampleFailedRows = new ArrayList<>();
        this.exampleViolations = new ArrayList<>();
        this.status = "UNTESTED";
        this.createdAt = System.currentTimeMillis();
    }

    public ValidationRule(String id, String name, String ruleType, String columnName) {
        this.id = id;
        this.name = name;
        this.ruleType = ruleType;
        this.columnName = columnName;
        this.allowedValues = new ArrayList<>();
        this.exampleFailedRows = new ArrayList<>();
        this.exampleViolations = new ArrayList<>();
        this.status = "UNTESTED";
        this.createdAt = System.currentTimeMillis();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public Integer getDatasetId() { return datasetId; }
    public void setDatasetId(Integer datasetId) { this.datasetId = datasetId; }

    public long getCreatedAt() { return createdAt; }
    public void setCreatedAt(long createdAt) { this.createdAt = createdAt; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getRuleType() { return ruleType; }
    public void setRuleType(String ruleType) { this.ruleType = ruleType; }

    public String getColumnName() { return columnName; }
    public void setColumnName(String columnName) { this.columnName = columnName; }

    public String getTargetColumn() { return targetColumn; }
    public void setTargetColumn(String targetColumn) { this.targetColumn = targetColumn; }

    public String getOperator() { return operator; }
    public void setOperator(String operator) { this.operator = operator; }

    public Double getMinValue() { return minValue; }
    public void setMinValue(Double minValue) { this.minValue = minValue; }

    public Double getMaxValue() { return maxValue; }
    public void setMaxValue(Double maxValue) { this.maxValue = maxValue; }

    public Integer getMinLength() { return minLength; }
    public void setMinLength(Integer minLength) { this.minLength = minLength; }

    public Integer getMaxLength() { return maxLength; }
    public void setMaxLength(Integer maxLength) { this.maxLength = maxLength; }

    public List<String> getAllowedValues() { return allowedValues; }
    public void setAllowedValues(List<String> allowedValues) { this.allowedValues = allowedValues; }

    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }

    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getTotalRows() { return totalRows; }
    public void setTotalRows(int totalRows) { this.totalRows = totalRows; }

    public int getFailedCount() { return failedCount; }
    public void setFailedCount(int failedCount) { this.failedCount = failedCount; }

    public double getFailureRate() { return failureRate; }
    public void setFailureRate(double failureRate) { this.failureRate = failureRate; }

    public List<Integer> getExampleFailedRows() { return exampleFailedRows; }
    public void setExampleFailedRows(List<Integer> exampleFailedRows) { this.exampleFailedRows = exampleFailedRows; }

    public List<String> getExampleViolations() { return exampleViolations; }
    public void setExampleViolations(List<String> exampleViolations) { this.exampleViolations = exampleViolations; }
}
