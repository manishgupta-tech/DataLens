package com.datalens.model;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * DataLens — ColumnMetadata Model
 * Comprehensive profiling metadata and rigorous statistical metrics for a single column.
 */
public class ColumnMetadata implements Serializable {
    private static final long serialVersionUID = 2L;

    private String name;
    private String type; // "NUMERIC", "CATEGORICAL", "BOOLEAN", "DATE"
    private int totalValues;
    private int missingCount;
    private double missingPercentage;
    private int uniqueCount;
    private double completenessPercentage;
    private double cardinalityPercentage;
    private boolean isConstant;
    private int emptyOrWhitespaceCount;
    private String healthStatus; // "Good", "Warning", "Critical"

    // Numeric statistics
    private Double min;
    private Double max;
    private Double mean;
    private Double median;
    private Double sampleVariance;
    private Double populationVariance;
    private Double sampleStdDev;
    private Double populationStdDev;
    private Double q25;
    private Double q75;
    private Double iqr;
    private Double range;
    private Double skewness;
    private int outlierCount;
    private List<Integer> outlierRowIndices;

    // Categorical statistics
    private String mostFrequentValue;
    private int mostFrequentCount;
    private List<Map<String, Object>> topValues;
    private int rareCategoriesCount;
    private List<String> rareCategories;
    private boolean inconsistentCasingDetected;
    private List<String> inconsistentCasingExamples;

    // Date statistics
    private String earliestDate;
    private String latestDate;
    private int invalidDateCount;
    private Long dateRangeDays;

    public ColumnMetadata() {
        this.topValues = new ArrayList<>();
        this.outlierRowIndices = new ArrayList<>();
        this.rareCategories = new ArrayList<>();
        this.inconsistentCasingExamples = new ArrayList<>();
    }

    public ColumnMetadata(String name, String type) {
        this.name = name;
        this.type = type;
        this.topValues = new ArrayList<>();
        this.outlierRowIndices = new ArrayList<>();
        this.rareCategories = new ArrayList<>();
        this.inconsistentCasingExamples = new ArrayList<>();
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public int getTotalValues() { return totalValues; }
    public void setTotalValues(int totalValues) { this.totalValues = totalValues; }

    public int getMissingCount() { return missingCount; }
    public void setMissingCount(int missingCount) { this.missingCount = missingCount; }

    public double getMissingPercentage() { return missingPercentage; }
    public void setMissingPercentage(double missingPercentage) { this.missingPercentage = missingPercentage; }

    public int getUniqueCount() { return uniqueCount; }
    public void setUniqueCount(int uniqueCount) { this.uniqueCount = uniqueCount; }

    public double getCompletenessPercentage() { return completenessPercentage; }
    public void setCompletenessPercentage(double completenessPercentage) { this.completenessPercentage = completenessPercentage; }

    public double getCardinalityPercentage() { return cardinalityPercentage; }
    public void setCardinalityPercentage(double cardinalityPercentage) { this.cardinalityPercentage = cardinalityPercentage; }

    public boolean isConstant() { return isConstant; }
    public void setConstant(boolean constant) { isConstant = constant; }

    public int getEmptyOrWhitespaceCount() { return emptyOrWhitespaceCount; }
    public void setEmptyOrWhitespaceCount(int emptyOrWhitespaceCount) { this.emptyOrWhitespaceCount = emptyOrWhitespaceCount; }

    public String getHealthStatus() { return healthStatus; }
    public void setHealthStatus(String healthStatus) { this.healthStatus = healthStatus; }

    // Numeric statistics
    public Double getMin() { return min; }
    public void setMin(Double min) { this.min = min; }

    public Double getMax() { return max; }
    public void setMax(Double max) { this.max = max; }

    public Double getMean() { return mean; }
    public void setMean(Double mean) { this.mean = mean; }

    public Double getMedian() { return median; }
    public void setMedian(Double median) { this.median = median; }

    public Double getVariance() { return sampleVariance != null ? sampleVariance : 0.0; }
    public void setVariance(Double variance) { this.sampleVariance = variance; }

    public Double getSampleVariance() { return sampleVariance; }
    public void setSampleVariance(Double sampleVariance) { this.sampleVariance = sampleVariance; }

    public Double getPopulationVariance() { return populationVariance; }
    public void setPopulationVariance(Double populationVariance) { this.populationVariance = populationVariance; }

    public Double getStdDev() { return sampleStdDev != null ? sampleStdDev : 0.0; }
    public void setStdDev(Double stdDev) { this.sampleStdDev = stdDev; }

    public Double getSampleStdDev() { return sampleStdDev; }
    public void setSampleStdDev(Double sampleStdDev) { this.sampleStdDev = sampleStdDev; }

    public Double getPopulationStdDev() { return populationStdDev; }
    public void setPopulationStdDev(Double populationStdDev) { this.populationStdDev = populationStdDev; }

    public Double getQ25() { return q25; }
    public void setQ25(Double q25) { this.q25 = q25; }

    public Double getQ75() { return q75; }
    public void setQ75(Double q75) { this.q75 = q75; }

    public Double getIqr() { return iqr; }
    public void setIqr(Double iqr) { this.iqr = iqr; }

    public Double getRange() { return range; }
    public void setRange(Double range) { this.range = range; }

    public Double getSkewness() { return skewness; }
    public void setSkewness(Double skewness) { this.skewness = skewness; }

    public int getOutlierCount() { return outlierCount; }
    public void setOutlierCount(int outlierCount) { this.outlierCount = outlierCount; }

    public List<Integer> getOutlierRowIndices() { return outlierRowIndices; }
    public void setOutlierRowIndices(List<Integer> outlierRowIndices) { this.outlierRowIndices = outlierRowIndices; }

    // Categorical statistics
    public String getMostFrequentValue() { return mostFrequentValue; }
    public void setMostFrequentValue(String mostFrequentValue) { this.mostFrequentValue = mostFrequentValue; }

    public int getMostFrequentCount() { return mostFrequentCount; }
    public void setMostFrequentCount(int mostFrequentCount) { this.mostFrequentCount = mostFrequentCount; }

    public List<Map<String, Object>> getTopValues() { return topValues; }
    public void setTopValues(List<Map<String, Object>> topValues) { this.topValues = topValues; }

    public int getRareCategoriesCount() { return rareCategoriesCount; }
    public void setRareCategoriesCount(int rareCategoriesCount) { this.rareCategoriesCount = rareCategoriesCount; }

    public List<String> getRareCategories() { return rareCategories; }
    public void setRareCategories(List<String> rareCategories) { this.rareCategories = rareCategories; }

    public boolean isInconsistentCasingDetected() { return inconsistentCasingDetected; }
    public void setInconsistentCasingDetected(boolean inconsistentCasingDetected) { this.inconsistentCasingDetected = inconsistentCasingDetected; }

    public List<String> getInconsistentCasingExamples() { return inconsistentCasingExamples; }
    public void setInconsistentCasingExamples(List<String> inconsistentCasingExamples) { this.inconsistentCasingExamples = inconsistentCasingExamples; }

    // Date statistics
    public String getEarliestDate() { return earliestDate; }
    public void setEarliestDate(String earliestDate) { this.earliestDate = earliestDate; }

    public String getLatestDate() { return latestDate; }
    public void setLatestDate(String latestDate) { this.latestDate = latestDate; }

    public int getInvalidDateCount() { return invalidDateCount; }
    public void setInvalidDateCount(int invalidDateCount) { this.invalidDateCount = invalidDateCount; }

    public Long getDateRangeDays() { return dateRangeDays; }
    public void setDateRangeDays(Long dateRangeDays) { this.dateRangeDays = dateRangeDays; }
}
