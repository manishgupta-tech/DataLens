package com.datalens.model;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * DataLens — VersionComparisonResult Model
 * Holds rigorous comparative deltas, schema evolution, numeric shifts,
 * record-level turnover, and quality health trajectories between two dataset versions.
 */
public class VersionComparisonResult implements Serializable {
    private static final long serialVersionUID = 2L;

    // Comparison classification
    private String comparisonType; // "LINEAGE" (same dataset versions) or "CROSS_DATASET" (unrelated datasets)
    private String comparisonTypeLabel;
    private String comparisonBannerMessage;

    // Dataset identification
    private int baseDatasetId;
    private int targetDatasetId;
    private String baseVersionName;
    private String targetVersionName;
    private long baseUploadTime;
    private long targetUploadTime;

    // 1. Volume & Record-Level Comparison
    private int baseRowCount;
    private int targetRowCount;
    private int rowCountDelta;
    private int baseColumnCount;
    private int targetColumnCount;
    private int columnCountDelta;

    private int rowsAdded;
    private int rowsRemoved;
    private int rowsRetained;
    private String recordLevelExplanation;

    // 2. Data Quality Dimensions
    private int baseQualityScore;
    private int targetQualityScore;
    private int qualityScoreDelta;

    private double baseCompletenessScore;
    private double targetCompletenessScore;
    private double completenessScoreDelta;

    private double baseUniquenessScore;
    private double targetUniquenessScore;
    private double uniquenessScoreDelta;

    private int baseMissingCount;
    private int targetMissingCount;
    private int missingCountDelta;

    private int baseDuplicateCount;
    private int targetDuplicateCount;
    private int duplicatesDelta;

    private int baseOutlierCount;
    private int targetOutlierCount;
    private int outlierCountDelta;

    // 3. Schema Evolution
    private List<String> addedColumns;
    private List<String> removedColumns;
    private List<String> commonColumns;
    private Map<String, String> typeChanges; // col -> "CATEGORICAL -> NUMERIC"
    private List<SchemaEvolutionItem> schemaTable;

    // 4. Numeric Mean Shifts
    private List<NumericShiftItem> numericComparisons;
    private Map<String, Double> meanShifts;   // backward compatibility: col -> (targetMean - baseMean)
    private Map<String, Double> medianShifts; // backward compatibility: col -> (targetMedian - baseMedian)
    private String numericComparisonMessage;

    // 5. Summary & Verdict
    private String summaryText;
    private List<String> improvements;
    private List<String> deteriorations;
    private List<String> neutralObservations;
    private String overallVerdict; // "IMPROVED", "DEGRADED", "UNCHANGED", "CROSS_DATASET"

    private boolean isIdentical;

    public VersionComparisonResult() {
        this.addedColumns = new ArrayList<>();
        this.removedColumns = new ArrayList<>();
        this.commonColumns = new ArrayList<>();
        this.typeChanges = new HashMap<>();
        this.schemaTable = new ArrayList<>();
        this.numericComparisons = new ArrayList<>();
        this.meanShifts = new HashMap<>();
        this.medianShifts = new HashMap<>();
        this.improvements = new ArrayList<>();
        this.deteriorations = new ArrayList<>();
        this.neutralObservations = new ArrayList<>();
        this.comparisonType = "LINEAGE";
        this.comparisonTypeLabel = "Dataset Lineage Comparison";
    }

    // Static inner classes for structured items
    public static class NumericShiftItem implements Serializable {
        private static final long serialVersionUID = 1L;
        private String columnName;
        private Double baseMean;
        private Double targetMean;
        private Double absoluteShift;
        private Double percentageChange;
        private Double baseMedian;
        private Double targetMedian;
        private Double medianShift;
        private String status; // "COMPARABLE", "ABSENT_IN_BASE", "ABSENT_IN_TARGET", "TYPE_MISMATCH"
        private String explanation;

        public NumericShiftItem() {}

        public String getColumnName() { return columnName; }
        public void setColumnName(String columnName) { this.columnName = columnName; }

        public Double getBaseMean() { return baseMean; }
        public void setBaseMean(Double baseMean) { this.baseMean = baseMean; }

        public Double getTargetMean() { return targetMean; }
        public void setTargetMean(Double targetMean) { this.targetMean = targetMean; }

        public Double getAbsoluteShift() { return absoluteShift; }
        public void setAbsoluteShift(Double absoluteShift) { this.absoluteShift = absoluteShift; }

        public Double getPercentageChange() { return percentageChange; }
        public void setPercentageChange(Double percentageChange) { this.percentageChange = percentageChange; }

        public Double getBaseMedian() { return baseMedian; }
        public void setBaseMedian(Double baseMedian) { this.baseMedian = baseMedian; }

        public Double getTargetMedian() { return targetMedian; }
        public void setTargetMedian(Double targetMedian) { this.targetMedian = targetMedian; }

        public Double getMedianShift() { return medianShift; }
        public void setMedianShift(Double medianShift) { this.medianShift = medianShift; }

        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }

        public String getExplanation() { return explanation; }
        public void setExplanation(String explanation) { this.explanation = explanation; }
    }

    public static class SchemaEvolutionItem implements Serializable {
        private static final long serialVersionUID = 1L;
        private String columnName;
        private String baseType;
        private String targetType;
        private String status; // "RETAINED", "ADDED", "REMOVED", "TYPE_CHANGED"

        public SchemaEvolutionItem() {}

        public SchemaEvolutionItem(String columnName, String baseType, String targetType, String status) {
            this.columnName = columnName;
            this.baseType = baseType;
            this.targetType = targetType;
            this.status = status;
        }

        public String getColumnName() { return columnName; }
        public void setColumnName(String columnName) { this.columnName = columnName; }

        public String getBaseType() { return baseType; }
        public void setBaseType(String baseType) { this.baseType = baseType; }

        public String getTargetType() { return targetType; }
        public void setTargetType(String targetType) { this.targetType = targetType; }

        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
    }

    // Getters and Setters
    public String getComparisonType() { return comparisonType; }
    public void setComparisonType(String comparisonType) { this.comparisonType = comparisonType; }

    public String getComparisonTypeLabel() { return comparisonTypeLabel; }
    public void setComparisonTypeLabel(String comparisonTypeLabel) { this.comparisonTypeLabel = comparisonTypeLabel; }

    public String getComparisonBannerMessage() { return comparisonBannerMessage; }
    public void setComparisonBannerMessage(String comparisonBannerMessage) { this.comparisonBannerMessage = comparisonBannerMessage; }

    public int getBaseDatasetId() { return baseDatasetId; }
    public void setBaseDatasetId(int baseDatasetId) { this.baseDatasetId = baseDatasetId; }

    public int getTargetDatasetId() { return targetDatasetId; }
    public void setTargetDatasetId(int targetDatasetId) { this.targetDatasetId = targetDatasetId; }

    public String getBaseVersionName() { return baseVersionName; }
    public void setBaseVersionName(String baseVersionName) { this.baseVersionName = baseVersionName; }

    public String getTargetVersionName() { return targetVersionName; }
    public void setTargetVersionName(String targetVersionName) { this.targetVersionName = targetVersionName; }

    public long getBaseUploadTime() { return baseUploadTime; }
    public void setBaseUploadTime(long baseUploadTime) { this.baseUploadTime = baseUploadTime; }

    public long getTargetUploadTime() { return targetUploadTime; }
    public void setTargetUploadTime(long targetUploadTime) { this.targetUploadTime = targetUploadTime; }

    public int getBaseRowCount() { return baseRowCount; }
    public void setBaseRowCount(int baseRowCount) { this.baseRowCount = baseRowCount; }

    public int getTargetRowCount() { return targetRowCount; }
    public void setTargetRowCount(int targetRowCount) { this.targetRowCount = targetRowCount; }

    public int getRowCountDelta() { return rowCountDelta; }
    public void setRowCountDelta(int rowCountDelta) { this.rowCountDelta = rowCountDelta; }

    public int getBaseColumnCount() { return baseColumnCount; }
    public void setBaseColumnCount(int baseColumnCount) { this.baseColumnCount = baseColumnCount; }

    public int getTargetColumnCount() { return targetColumnCount; }
    public void setTargetColumnCount(int targetColumnCount) { this.targetColumnCount = targetColumnCount; }

    public int getColumnCountDelta() { return columnCountDelta; }
    public void setColumnCountDelta(int columnCountDelta) { this.columnCountDelta = columnCountDelta; }

    public int getRowsAdded() { return rowsAdded; }
    public void setRowsAdded(int rowsAdded) { this.rowsAdded = rowsAdded; }

    public int getRowsRemoved() { return rowsRemoved; }
    public void setRowsRemoved(int rowsRemoved) { this.rowsRemoved = rowsRemoved; }

    public int getRowsRetained() { return rowsRetained; }
    public void setRowsRetained(int rowsRetained) { this.rowsRetained = rowsRetained; }

    public String getRecordLevelExplanation() { return recordLevelExplanation; }
    public void setRecordLevelExplanation(String recordLevelExplanation) { this.recordLevelExplanation = recordLevelExplanation; }

    public int getBaseQualityScore() { return baseQualityScore; }
    public void setBaseQualityScore(int baseQualityScore) { this.baseQualityScore = baseQualityScore; }

    public int getTargetQualityScore() { return targetQualityScore; }
    public void setTargetQualityScore(int targetQualityScore) { this.targetQualityScore = targetQualityScore; }

    public int getQualityScoreDelta() { return qualityScoreDelta; }
    public void setQualityScoreDelta(int qualityScoreDelta) { this.qualityScoreDelta = qualityScoreDelta; }

    public double getBaseCompletenessScore() { return baseCompletenessScore; }
    public void setBaseCompletenessScore(double baseCompletenessScore) { this.baseCompletenessScore = baseCompletenessScore; }

    public double getTargetCompletenessScore() { return targetCompletenessScore; }
    public void setTargetCompletenessScore(double targetCompletenessScore) { this.targetCompletenessScore = targetCompletenessScore; }

    public double getCompletenessScoreDelta() { return completenessScoreDelta; }
    public void setCompletenessScoreDelta(double completenessScoreDelta) { this.completenessScoreDelta = completenessScoreDelta; }

    public double getBaseUniquenessScore() { return baseUniquenessScore; }
    public void setBaseUniquenessScore(double baseUniquenessScore) { this.baseUniquenessScore = baseUniquenessScore; }

    public double getTargetUniquenessScore() { return targetUniquenessScore; }
    public void setTargetUniquenessScore(double targetUniquenessScore) { this.targetUniquenessScore = targetUniquenessScore; }

    public double getUniquenessScoreDelta() { return uniquenessScoreDelta; }
    public void setUniquenessScoreDelta(double uniquenessScoreDelta) { this.uniquenessScoreDelta = uniquenessScoreDelta; }

    public int getBaseMissingCount() { return baseMissingCount; }
    public void setBaseMissingCount(int baseMissingCount) { this.baseMissingCount = baseMissingCount; }

    public int getTargetMissingCount() { return targetMissingCount; }
    public void setTargetMissingCount(int targetMissingCount) { this.targetMissingCount = targetMissingCount; }

    public int getMissingCountDelta() { return missingCountDelta; }
    public void setMissingCountDelta(int missingCountDelta) { this.missingCountDelta = missingCountDelta; }

    public int getBaseDuplicateCount() { return baseDuplicateCount; }
    public void setBaseDuplicateCount(int baseDuplicateCount) { this.baseDuplicateCount = baseDuplicateCount; }

    public int getTargetDuplicateCount() { return targetDuplicateCount; }
    public void setTargetDuplicateCount(int targetDuplicateCount) { this.targetDuplicateCount = targetDuplicateCount; }

    public int getDuplicatesDelta() { return duplicatesDelta; }
    public void setDuplicatesDelta(int duplicatesDelta) { this.duplicatesDelta = duplicatesDelta; }

    public int getBaseOutlierCount() { return baseOutlierCount; }
    public void setBaseOutlierCount(int baseOutlierCount) { this.baseOutlierCount = baseOutlierCount; }

    public int getTargetOutlierCount() { return targetOutlierCount; }
    public void setTargetOutlierCount(int targetOutlierCount) { this.targetOutlierCount = targetOutlierCount; }

    public int getOutlierCountDelta() { return outlierCountDelta; }
    public void setOutlierCountDelta(int outlierCountDelta) { this.outlierCountDelta = outlierCountDelta; }

    public List<String> getAddedColumns() { return addedColumns; }
    public void setAddedColumns(List<String> addedColumns) { this.addedColumns = addedColumns; }

    public List<String> getRemovedColumns() { return removedColumns; }
    public void setRemovedColumns(List<String> removedColumns) { this.removedColumns = removedColumns; }

    public List<String> getCommonColumns() { return commonColumns; }
    public void setCommonColumns(List<String> commonColumns) { this.commonColumns = commonColumns; }

    public Map<String, String> getTypeChanges() { return typeChanges; }
    public void setTypeChanges(Map<String, String> typeChanges) { this.typeChanges = typeChanges; }

    public List<SchemaEvolutionItem> getSchemaTable() { return schemaTable; }
    public void setSchemaTable(List<SchemaEvolutionItem> schemaTable) { this.schemaTable = schemaTable; }

    public List<NumericShiftItem> getNumericComparisons() { return numericComparisons; }
    public void setNumericComparisons(List<NumericShiftItem> numericComparisons) { this.numericComparisons = numericComparisons; }

    public Map<String, Double> getMeanShifts() { return meanShifts; }
    public void setMeanShifts(Map<String, Double> meanShifts) { this.meanShifts = meanShifts; }

    public Map<String, Double> getMedianShifts() { return medianShifts; }
    public void setMedianShifts(Map<String, Double> medianShifts) { this.medianShifts = medianShifts; }

    public String getNumericComparisonMessage() { return numericComparisonMessage; }
    public void setNumericComparisonMessage(String numericComparisonMessage) { this.numericComparisonMessage = numericComparisonMessage; }

    public String getSummaryText() { return summaryText; }
    public void setSummaryText(String summaryText) { this.summaryText = summaryText; }

    public List<String> getImprovements() { return improvements; }
    public void setImprovements(List<String> improvements) { this.improvements = improvements; }

    public List<String> getDeteriorations() { return deteriorations; }
    public void setDeteriorations(List<String> deteriorations) { this.deteriorations = deteriorations; }

    public List<String> getNeutralObservations() { return neutralObservations; }
    public void setNeutralObservations(List<String> neutralObservations) { this.neutralObservations = neutralObservations; }

    public String getOverallVerdict() { return overallVerdict; }
    public void setOverallVerdict(String overallVerdict) { this.overallVerdict = overallVerdict; }

    public boolean isIdentical() { return isIdentical; }
    public void setIdentical(boolean identical) { isIdentical = identical; }
}
