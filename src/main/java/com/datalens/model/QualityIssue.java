package com.datalens.model;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * DataLens — QualityIssue Model
 * Represents a discrete, measurable data hygiene issue with severity and remediation guidance.
 */
public class QualityIssue implements Serializable {
    private static final long serialVersionUID = 1L;

    private String id;
    private String severity; // "Critical", "Warning", "Info"
    private String type;     // "MISSING_VALUES", "DUPLICATE_ROWS", "OUTLIER_DETECTED", "CONSTANT_COLUMN", "INCONSISTENT_CASING", etc.
    private String columnName;
    private int affectedRowsCount;
    private double affectedPercentage;
    private List<Integer> exampleRowNumbers; // 1-indexed row numbers
    private String explanation;
    private String recommendation;

    public QualityIssue() {
        this.exampleRowNumbers = new ArrayList<>();
    }

    public QualityIssue(String id, String severity, String type, String columnName,
                        int affectedRowsCount, double affectedPercentage,
                        List<Integer> exampleRowNumbers, String explanation, String recommendation) {
        this.id = id;
        this.severity = severity;
        this.type = type;
        this.columnName = columnName;
        this.affectedRowsCount = affectedRowsCount;
        this.affectedPercentage = affectedPercentage;
        this.exampleRowNumbers = exampleRowNumbers != null ? exampleRowNumbers : new ArrayList<>();
        this.explanation = explanation;
        this.recommendation = recommendation;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getColumnName() { return columnName; }
    public void setColumnName(String columnName) { this.columnName = columnName; }

    public int getAffectedRowsCount() { return affectedRowsCount; }
    public void setAffectedRowsCount(int affectedRowsCount) { this.affectedRowsCount = affectedRowsCount; }

    public double getAffectedPercentage() { return affectedPercentage; }
    public void setAffectedPercentage(double affectedPercentage) { this.affectedPercentage = affectedPercentage; }

    public List<Integer> getExampleRowNumbers() { return exampleRowNumbers; }
    public void setExampleRowNumbers(List<Integer> exampleRowNumbers) { this.exampleRowNumbers = exampleRowNumbers; }

    public String getExplanation() { return explanation; }
    public void setExplanation(String explanation) { this.explanation = explanation; }

    public String getRecommendation() { return recommendation; }
    public void setRecommendation(String recommendation) { this.recommendation = recommendation; }
}
