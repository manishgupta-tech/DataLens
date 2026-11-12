package com.datalens.model;

import java.io.Serializable;

/**
 * DataLens — Dataset Model
 * Represents metadata of an uploaded or active CSV dataset.
 */
public class Dataset implements Serializable {
    private static final long serialVersionUID = 1L;

    private int id;
    private Integer userId;
    private String originalName;
    private String storedName;
    private String filePath;
    private long fileSize;
    private int rowCount;
    private int columnCount;
    private int numericCount;
    private int categoricalCount;
    private int missingCount;
    private int duplicateCount;
    private int qualityScore;
    private long uploadTime;
    private String status;

    public Dataset() {
        this.status = "ACTIVE";
    }

    public Dataset(String originalName, String storedName, String filePath, long fileSize) {
        this.originalName = originalName;
        this.storedName = storedName;
        this.filePath = filePath;
        this.fileSize = fileSize;
        this.uploadTime = System.currentTimeMillis();
        this.status = "ACTIVE";
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public Integer getUserId() {
        return userId;
    }

    public void setUserId(Integer userId) {
        this.userId = userId;
    }

    public String getOriginalName() {
        return originalName;
    }

    public void setOriginalName(String originalName) {
        this.originalName = originalName;
    }

    public String getStoredName() {
        return storedName;
    }

    public void setStoredName(String storedName) {
        this.storedName = storedName;
    }

    public String getFilePath() {
        return filePath;
    }

    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }

    public long getFileSize() {
        return fileSize;
    }

    public void setFileSize(long fileSize) {
        this.fileSize = fileSize;
    }

    public int getRowCount() {
        return rowCount;
    }

    public void setRowCount(int rowCount) {
        this.rowCount = rowCount;
    }

    public int getColumnCount() {
        return columnCount;
    }

    public void setColumnCount(int columnCount) {
        this.columnCount = columnCount;
    }

    public int getNumericCount() {
        return numericCount;
    }

    public void setNumericCount(int numericCount) {
        this.numericCount = numericCount;
    }

    public int getCategoricalCount() {
        return categoricalCount;
    }

    public void setCategoricalCount(int categoricalCount) {
        this.categoricalCount = categoricalCount;
    }

    public int getMissingCount() {
        return missingCount;
    }

    public void setMissingCount(int missingCount) {
        this.missingCount = missingCount;
    }

    public int getDuplicateCount() {
        return duplicateCount;
    }

    public void setDuplicateCount(int duplicateCount) {
        this.duplicateCount = duplicateCount;
    }

    public int getQualityScore() {
        return qualityScore;
    }

    public void setQualityScore(int qualityScore) {
        this.qualityScore = qualityScore;
    }

    public long getUploadTime() {
        return uploadTime;
    }

    public void setUploadTime(long uploadTime) {
        this.uploadTime = uploadTime;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
