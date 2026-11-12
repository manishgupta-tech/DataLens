package com.datalens.model;

import java.io.Serializable;

/**
 * DataLens — AuditLogEntry Model
 * Records immutable operations performed on datasets for reproducibility and accountability.
 */
public class AuditLogEntry implements Serializable {
    private static final long serialVersionUID = 1L;

    private String id;
    private long timestamp;
    private String action; // "UPLOAD", "CLEAN", "NEW_VERSION", "RESTORE", "VALIDATE", "EXPORT_REPORT"
    private String datasetName;
    private String details;
    private String userEmail;

    public AuditLogEntry() {}

    public AuditLogEntry(String id, long timestamp, String action, String datasetName, String details, String userEmail) {
        this.id = id;
        this.timestamp = timestamp;
        this.action = action;
        this.datasetName = datasetName;
        this.details = details;
        this.userEmail = userEmail;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getDatasetName() { return datasetName; }
    public void setDatasetName(String datasetName) { this.datasetName = datasetName; }

    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }

    public String getUserEmail() { return userEmail; }
    public void setUserEmail(String userEmail) { this.userEmail = userEmail; }
}
