package com.datalens.model;

import java.io.Serializable;

/**
 * DataLens — DatasetAnalysisRecord Model
 * Represents persisted analysis metrics and JSON in dataset_analysis table.
 */
public class DatasetAnalysisRecord implements Serializable {
    private static final long serialVersionUID = 1L;

    private int id;
    private int datasetId;
    private Integer userId;
    private double completenessScore;
    private double uniquenessScore;
    private int qualityScore;
    private String analysisJson;
    private long analyzedAt;

    public DatasetAnalysisRecord() {}

    public DatasetAnalysisRecord(int datasetId, Integer userId, double completenessScore,
                                 double uniquenessScore, int qualityScore, String analysisJson, long analyzedAt) {
        this.datasetId = datasetId;
        this.userId = userId;
        this.completenessScore = completenessScore;
        this.uniquenessScore = uniquenessScore;
        this.qualityScore = qualityScore;
        this.analysisJson = analysisJson;
        this.analyzedAt = analyzedAt;
    }

    public int getId() { return id; }
    public void setId(int id) { this.id = id; }

    public int getDatasetId() { return datasetId; }
    public void setDatasetId(int datasetId) { this.datasetId = datasetId; }

    public Integer getUserId() { return userId; }
    public void setUserId(Integer userId) { this.userId = userId; }

    public double getCompletenessScore() { return completenessScore; }
    public void setCompletenessScore(double completenessScore) { this.completenessScore = completenessScore; }

    public double getUniquenessScore() { return uniquenessScore; }
    public void setUniquenessScore(double uniquenessScore) { this.uniquenessScore = uniquenessScore; }

    public int getQualityScore() { return qualityScore; }
    public void setQualityScore(int qualityScore) { this.qualityScore = qualityScore; }

    public String getAnalysisJson() { return analysisJson; }
    public void setAnalysisJson(String analysisJson) { this.analysisJson = analysisJson; }

    public long getAnalyzedAt() { return analyzedAt; }
    public void setAnalyzedAt(long analyzedAt) { this.analyzedAt = analyzedAt; }
}
