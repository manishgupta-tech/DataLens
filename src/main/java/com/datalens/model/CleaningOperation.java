package com.datalens.model;

import java.io.Serializable;

/**
 * DataLens — CleaningOperation Model
 * Encapsulates data cleaning transformation parameters, staged pipeline configuration, and audit outcomes.
 */
public class CleaningOperation implements Serializable {
    private static final long serialVersionUID = 1L;

    private String operationType;
    private String strategy;
    private String columnName;
    private String caseType;            // "lowercase", "UPPERCASE", "Title Case", "remove_special"
    private String imputationStrategy;   // "mean", "median", "mode", "constant", "drop_rows"
    private String customValue;
    private String outlierMethod;       // "cap_iqr", "remove_rows"
    private String action;              // "drop", "rename"
    private String newColumnName;
    private String targetType;
    private String description;

    public CleaningOperation() {}

    public String getOperationType() {
        return operationType != null ? operationType : "";
    }

    public void setOperationType(String operationType) {
        this.operationType = operationType;
    }

    public String getType() {
        return getOperationType();
    }

    public void setType(String type) {
        this.operationType = type;
    }

    public String getStrategy() {
        if (strategy != null && !strategy.isEmpty()) return strategy;
        if (imputationStrategy != null) return imputationStrategy;
        if (outlierMethod != null) return outlierMethod;
        if (caseType != null) return caseType;
        return "";
    }

    public void setStrategy(String strategy) {
        this.strategy = strategy;
    }

    public String getColumnName() {
        return columnName != null ? columnName : "";
    }

    public void setColumnName(String columnName) {
        this.columnName = columnName;
    }

    public String getColumn() {
        return getColumnName();
    }

    public void setColumn(String column) {
        this.columnName = column;
    }

    public String getCaseType() {
        return caseType;
    }

    public void setCaseType(String caseType) {
        this.caseType = caseType;
    }

    public String getImputationStrategy() {
        return imputationStrategy;
    }

    public void setImputationStrategy(String imputationStrategy) {
        this.imputationStrategy = imputationStrategy;
    }

    public String getCustomValue() {
        return customValue != null ? customValue : "";
    }

    public void setCustomValue(String customValue) {
        this.customValue = customValue;
    }

    public String getOutlierMethod() {
        return outlierMethod;
    }

    public void setOutlierMethod(String outlierMethod) {
        this.outlierMethod = outlierMethod;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getNewColumnName() {
        return newColumnName;
    }

    public void setNewColumnName(String newColumnName) {
        this.newColumnName = newColumnName;
    }

    public String getTargetType() {
        return targetType;
    }

    public void setTargetType(String targetType) {
        this.targetType = targetType;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
