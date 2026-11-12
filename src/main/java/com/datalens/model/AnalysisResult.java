package com.datalens.model;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * DataLens — AnalysisResult Model
 * Contains complete results of dataset profiling, quality scoring, correlation matrix,
 * discrete quality audit issues, and deterministic observations.
 */
public class AnalysisResult implements Serializable {
    private static final long serialVersionUID = 2L;

    private Dataset dataset;
    private List<ColumnMetadata> columns;
    private List<String> headers;
    private List<List<String>> previewRows;

    // Type distribution counts
    private int numericCount;
    private int categoricalCount;
    private int booleanCount;
    private int dateCount;
    private long estimatedMemoryBytes;
    private List<String> constantColumns;

    // Quality breakdown
    private double completenessScore;
    private double uniquenessScore;
    private double consistencyScore;
    private double validityScore;
    private double timelinessScore;
    private int overallQualityScore;
    private double missingDeduction;
    private double duplicateDeduction;
    private List<QualityIssue> issues;

    // Statistics and Correlations
    private Map<String, Map<String, Double>> correlationMatrix; // colA -> (colB -> pearson r)

    // Rule-based insights list
    private List<String> ruleInsights;

    public AnalysisResult() {
        this.columns = new ArrayList<>();
        this.headers = new ArrayList<>();
        this.previewRows = new ArrayList<>();
        this.issues = new ArrayList<>();
        this.constantColumns = new ArrayList<>();
        this.correlationMatrix = new HashMap<>();
        this.ruleInsights = new ArrayList<>();
    }

    public Dataset getDataset() { return dataset; }
    public void setDataset(Dataset dataset) { this.dataset = dataset; }

    public List<ColumnMetadata> getColumns() { return columns; }
    public void setColumns(List<ColumnMetadata> columns) { this.columns = columns; }

    public List<String> getHeaders() { return headers; }
    public void setHeaders(List<String> headers) { this.headers = headers; }

    public List<List<String>> getPreviewRows() { return previewRows; }
    public void setPreviewRows(List<List<String>> previewRows) { this.previewRows = previewRows; }

    public int getNumericCount() { return numericCount; }
    public void setNumericCount(int numericCount) { this.numericCount = numericCount; }

    public int getCategoricalCount() { return categoricalCount; }
    public void setCategoricalCount(int categoricalCount) { this.categoricalCount = categoricalCount; }

    public int getBooleanCount() { return booleanCount; }
    public void setBooleanCount(int booleanCount) { this.booleanCount = booleanCount; }

    public int getDateCount() { return dateCount; }
    public void setDateCount(int dateCount) { this.dateCount = dateCount; }

    public long getEstimatedMemoryBytes() { return estimatedMemoryBytes; }
    public void setEstimatedMemoryBytes(long estimatedMemoryBytes) { this.estimatedMemoryBytes = estimatedMemoryBytes; }

    public List<String> getConstantColumns() { return constantColumns; }
    public void setConstantColumns(List<String> constantColumns) { this.constantColumns = constantColumns; }

    public double getCompletenessScore() { return completenessScore; }
    public void setCompletenessScore(double completenessScore) { this.completenessScore = completenessScore; }

    public double getUniquenessScore() { return uniquenessScore; }
    public void setUniquenessScore(double uniquenessScore) { this.uniquenessScore = uniquenessScore; }

    public double getConsistencyScore() { return consistencyScore; }
    public void setConsistencyScore(double consistencyScore) { this.consistencyScore = consistencyScore; }

    public double getValidityScore() { return validityScore; }
    public void setValidityScore(double validityScore) { this.validityScore = validityScore; }

    public double getTimelinessScore() { return timelinessScore; }
    public void setTimelinessScore(double timelinessScore) { this.timelinessScore = timelinessScore; }

    public int getOverallQualityScore() { return overallQualityScore; }
    public void setOverallQualityScore(int overallQualityScore) { this.overallQualityScore = overallQualityScore; }

    public double getMissingDeduction() { return missingDeduction; }
    public void setMissingDeduction(double missingDeduction) { this.missingDeduction = missingDeduction; }

    public double getDuplicateDeduction() { return duplicateDeduction; }
    public void setDuplicateDeduction(double duplicateDeduction) { this.duplicateDeduction = duplicateDeduction; }

    public List<QualityIssue> getIssues() { return issues; }
    public void setIssues(List<QualityIssue> issues) { this.issues = issues; }

    public Map<String, Map<String, Double>> getCorrelationMatrix() { return correlationMatrix; }
    public void setCorrelationMatrix(Map<String, Map<String, Double>> correlationMatrix) { this.correlationMatrix = correlationMatrix; }

    public List<String> getRuleInsights() { return ruleInsights; }
    public void setRuleInsights(List<String> ruleInsights) { this.ruleInsights = ruleInsights; }
}
