package com.datalens.service;

import com.datalens.dao.DatasetDAO;
import com.datalens.model.*;
import com.datalens.util.CSVParserUtil;
import com.datalens.util.CSVParserUtil.CSVData;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * DataLens — DatasetManager
 * Central repository for:
 * - Active dataset state and profiling cache
 * - Dataset version tracking and restoration
 * - Version-to-version comparisons
 * - Custom validation rules execution
 * - Comprehensive Audit Trail
 */
public class DatasetManager {

    private static final DatasetManager instance = new DatasetManager();

    private final DatasetDAO datasetDAO;
    private final AnalysisService analysisService;
    private final ValidationService validationService;
    private final CleaningService cleaningService;

    // Per-user active state
    private final ConcurrentHashMap<Integer, Dataset> userActiveDatasetMap = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, CSVData> userActiveCSVMap = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, AnalysisResult> userActiveAnalysisMap = new ConcurrentHashMap<>();

    // Per-user versions list
    private final ConcurrentHashMap<Integer, List<Dataset>> userDatasetVersionsMap = new ConcurrentHashMap<>();

    // Per-user validation rules
    private final ConcurrentHashMap<Integer, List<ValidationRule>> userValidationRulesMap = new ConcurrentHashMap<>();

    // Per-user audit trail
    private final ConcurrentHashMap<Integer, List<AuditLogEntry>> userAuditTrailMap = new ConcurrentHashMap<>();
    private final List<AuditLogEntry> globalAuditTrail = new CopyOnWriteArrayList<>();

    private final AtomicInteger idGen = new AtomicInteger(100);

    // Global fallback for unauthenticated session / single-user preview
    private Dataset activeDataset = null;
    private CSVData activeCSVData = null;
    private AnalysisResult activeAnalysisResult = null;

    private DatasetManager() {
        this.datasetDAO = new DatasetDAO();
        this.analysisService = new AnalysisService();
        this.validationService = new ValidationService();
        this.cleaningService = new CleaningService();
    }

    public static DatasetManager getInstance() {
        return instance;
    }

    public synchronized Dataset registerAndSetDataset(String originalName, String storedName, String filePath, long fileSize) {
        return registerDataset(null, originalName, storedName, filePath, fileSize, false);
    }

    public synchronized Dataset registerAndSetDataset(Integer userId, String originalName, String storedName, String filePath, long fileSize) {
        return registerDataset(userId, originalName, storedName, filePath, fileSize, false);
    }

    public synchronized Dataset registerDataset(Integer userId, String originalName, String storedName, String filePath, long fileSize, boolean forceActive) {
        Dataset dataset = new Dataset(originalName, storedName, filePath, fileSize);
        dataset.setUserId(userId);
        try {
            File file = new File(filePath);
            if (file.exists()) {
                CSVData csvData = CSVParserUtil.parseCSV(file);
                AnalysisResult result = analysisService.analyzeCSVData(dataset, csvData);

                boolean hasActive = (userId != null && userActiveDatasetMap.containsKey(userId) && userActiveDatasetMap.get(userId) != null);
                boolean shouldBeActive = forceActive || !hasActive;

                dataset.setStatus(shouldBeActive ? "ACTIVE" : "STORED");

                if (shouldBeActive) {
                    this.activeDataset = dataset;
                    this.activeCSVData = csvData;
                    this.activeAnalysisResult = result;

                    if (userId != null && userId > 0) {
                        userActiveDatasetMap.put(userId, dataset);
                        userActiveCSVMap.put(userId, csvData);
                        userActiveAnalysisMap.put(userId, result);
                    }
                    logAction(userId, "UPLOAD", originalName, String.format("Uploaded and activated %s (%d rows, %d columns)", originalName, dataset.getRowCount(), dataset.getColumnCount()), null);
                } else {
                    logAction(userId, "UPLOAD_STORED", originalName, String.format("Uploaded %s (%d rows, %d columns) and saved to storage. Active dataset preserved.", originalName, dataset.getRowCount(), dataset.getColumnCount()), null);
                }

                if (userId != null && userId > 0) {
                    userDatasetVersionsMap.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(0, dataset);
                }

                datasetDAO.saveDataset(dataset);
                try {
                    String analysisJson = buildAnalysisJson(result);
                    datasetDAO.saveAnalysis(dataset.getId(), userId, result.getCompletenessScore(), result.getUniquenessScore(), result.getOverallQualityScore(), analysisJson);
                } catch (Exception ignored) {}

                if (shouldBeActive && userId != null && userId > 0) {
                    datasetDAO.activateDataset(dataset.getId(), userId);
                }

                return dataset;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return dataset;
    }

    public synchronized boolean setActiveDataset(Integer userId, Dataset dataset) {
        if (dataset == null) return false;
        try {
            File file = new File(dataset.getFilePath());
            if (file.exists()) {
                CSVData csvData = CSVParserUtil.parseCSV(file);
                AnalysisResult result = analysisService.analyzeCSVData(dataset, csvData);
                this.activeDataset = dataset;
                this.activeCSVData = csvData;
                this.activeAnalysisResult = result;

                if (userId != null && userId > 0) {
                    userActiveDatasetMap.put(userId, dataset);
                    userActiveCSVMap.put(userId, csvData);
                    userActiveAnalysisMap.put(userId, result);
                }
                return true;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return false;
    }

    /**
     * Atomically activates a dataset for a user by dataset ID.
     */
    public synchronized boolean activateDataset(Integer userId, int datasetId) {
        Dataset dataset = datasetDAO.getDatasetById(datasetId, userId);
        if (dataset != null) {
            boolean ok = setActiveDataset(userId, dataset);
            if (ok) {
                datasetDAO.activateDataset(datasetId, userId);
                evaluateAllRules(userId);
                logAction(userId, "ACTIVATE", dataset.getOriginalName(), "Activated stored dataset " + dataset.getOriginalName(), null);
                return true;
            }
        }
        return false;
    }

    /**
     * Clears the active dataset state for a user.
     */
    public synchronized void clearActiveDataset(Integer userId) {
        if (userId != null) {
            userActiveDatasetMap.remove(userId);
            userActiveCSVMap.remove(userId);
            userActiveAnalysisMap.remove(userId);
        }
        this.activeDataset = null;
        this.activeCSVData = null;
        this.activeAnalysisResult = null;
    }

    /**
     * Switches the active dataset for a user by dataset ID.
     */
    public synchronized boolean switchDatasetById(Integer userId, int datasetId) {
        return activateDataset(userId, datasetId);
    }

    /**
     * Saves a cleaned transformation as a NEW dataset version without overwriting the original.
     */
    public synchronized Dataset saveCleanedVersion(Integer userId, Dataset baseDataset, CSVData transformedData,
                                                    String versionName, List<String> appliedOperationsSummary) throws IOException {
        if (baseDataset == null || transformedData == null) {
            throw new IllegalArgumentException("Base dataset and transformed data cannot be null.");
        }

        String safeBaseName = baseDataset.getOriginalName().replace(".csv", "");
        String newOriginalName = (versionName != null && !versionName.trim().isEmpty())
            ? (versionName.endsWith(".csv") ? versionName.trim() : versionName.trim() + ".csv")
            : safeBaseName + "_v" + (getVersionCount(userId, baseDataset) + 1) + "_cleaned.csv";

        String newStoredName = "cleaned_" + System.currentTimeMillis() + "_" + newOriginalName.replaceAll("[^a-zA-Z0-9._-]", "_");

        // Write to uploads storage directory
        File storageDir = new File(baseDataset.getFilePath()).getParentFile();
        if (storageDir == null || !storageDir.exists()) {
            storageDir = com.datalens.util.DBUtil.getUploadsDirectory();
        }
        File newFile = new File(storageDir, newStoredName);

        try (FileWriter fw = new FileWriter(newFile)) {
            // Write headers
            List<String> headers = transformedData.getHeaders();
            for (int i = 0; i < headers.size(); i++) {
                if (i > 0) fw.write(",");
                fw.write(escapeCsv(headers.get(i)));
            }
            fw.write("\n");

            // Write rows
            for (List<String> row : transformedData.getRows()) {
                for (int i = 0; i < row.size(); i++) {
                    if (i > 0) fw.write(",");
                    fw.write(escapeCsv(row.get(i)));
                }
                fw.write("\n");
            }
        }

        Dataset newVersion = registerDataset(userId, newOriginalName, newStoredName, newFile.getAbsolutePath(), newFile.length(), true);

        String opSummary = String.join("; ", appliedOperationsSummary);
        logAction(userId, "NEW_VERSION", newOriginalName, "Saved as new cleaned dataset version. Transformations: " + opSummary, null);

        return newVersion;
    }

    private int getVersionCount(Integer userId, Dataset base) {
        List<Dataset> list = getDatasetVersions(userId);
        return list != null ? list.size() : 1;
    }

    public synchronized List<Dataset> getDatasetVersions(Integer userId) {
        if (userId != null && userDatasetVersionsMap.containsKey(userId)) {
            return userDatasetVersionsMap.get(userId);
        }
        return datasetDAO.getAllDatasets(userId);
    }

    /**
     * Compares two dataset versions with exact metrics deltas, lineage classification,
     * record-level turnover, schema evolution, numeric shifts, and an executive verdict.
     */
    public synchronized VersionComparisonResult compareVersions(Integer userId, int baseId, int targetId) {
        Dataset base = datasetDAO.getDatasetById(baseId, userId);
        Dataset target = datasetDAO.getDatasetById(targetId, userId);

        VersionComparisonResult comp = new VersionComparisonResult();
        if (base == null || target == null) {
            return comp;
        }

        comp.setBaseDatasetId(base.getId());
        comp.setTargetDatasetId(target.getId());
        comp.setBaseVersionName(base.getOriginalName());
        comp.setTargetVersionName(target.getOriginalName());
        comp.setBaseUploadTime(base.getUploadTime());
        comp.setTargetUploadTime(target.getUploadTime());

        comp.setBaseRowCount(base.getRowCount());
        comp.setTargetRowCount(target.getRowCount());
        comp.setRowCountDelta(target.getRowCount() - base.getRowCount());

        comp.setBaseColumnCount(base.getColumnCount());
        comp.setTargetColumnCount(target.getColumnCount());
        comp.setColumnCountDelta(target.getColumnCount() - base.getColumnCount());

        comp.setBaseMissingCount(base.getMissingCount());
        comp.setTargetMissingCount(target.getMissingCount());
        comp.setMissingCountDelta(target.getMissingCount() - base.getMissingCount());

        comp.setBaseDuplicateCount(base.getDuplicateCount());
        comp.setTargetDuplicateCount(target.getDuplicateCount());
        comp.setDuplicatesDelta(target.getDuplicateCount() - base.getDuplicateCount());

        comp.setBaseQualityScore(base.getQualityScore());
        comp.setTargetQualityScore(target.getQualityScore());
        comp.setQualityScoreDelta(target.getQualityScore() - base.getQualityScore());

        try {
            CSVData baseData = CSVParserUtil.parseCSV(new File(base.getFilePath()));
            CSVData targetData = CSVParserUtil.parseCSV(new File(target.getFilePath()));
            AnalysisResult baseAnal = analysisService.analyzeCSVData(base, baseData);
            AnalysisResult targetAnal = analysisService.analyzeCSVData(target, targetData);

            comp.setBaseCompletenessScore(Math.round(baseAnal.getCompletenessScore() * 10.0) / 10.0);
            comp.setTargetCompletenessScore(Math.round(targetAnal.getCompletenessScore() * 10.0) / 10.0);
            comp.setCompletenessScoreDelta(Math.round((targetAnal.getCompletenessScore() - baseAnal.getCompletenessScore()) * 10.0) / 10.0);

            comp.setBaseUniquenessScore(Math.round(baseAnal.getUniquenessScore() * 10.0) / 10.0);
            comp.setTargetUniquenessScore(Math.round(targetAnal.getUniquenessScore() * 10.0) / 10.0);
            comp.setUniquenessScoreDelta(Math.round((targetAnal.getUniquenessScore() - baseAnal.getUniquenessScore()) * 10.0) / 10.0);

            // Compute outlier totals across numeric columns
            int baseOutliers = 0;
            if (baseAnal.getColumns() != null) {
                for (ColumnMetadata cm : baseAnal.getColumns()) {
                    baseOutliers += cm.getOutlierCount();
                }
            }
            int targetOutliers = 0;
            if (targetAnal.getColumns() != null) {
                for (ColumnMetadata cm : targetAnal.getColumns()) {
                    targetOutliers += cm.getOutlierCount();
                }
            }
            comp.setBaseOutlierCount(baseOutliers);
            comp.setTargetOutlierCount(targetOutliers);
            comp.setOutlierCountDelta(targetOutliers - baseOutliers);

            List<String> baseHeaders = baseData.getHeaders();
            List<String> targetHeaders = targetData.getHeaders();

            List<String> added = new ArrayList<>();
            List<String> removed = new ArrayList<>();
            List<String> common = new ArrayList<>();

            for (String h : targetHeaders) {
                if (!baseHeaders.contains(h)) added.add(h);
                else common.add(h);
            }
            for (String h : baseHeaders) {
                if (!targetHeaders.contains(h)) removed.add(h);
            }

            comp.setAddedColumns(added);
            comp.setRemovedColumns(removed);
            comp.setCommonColumns(common);

            // Lineage classification: Check column overlap ratio & normalized base names
            String normBase = base.getOriginalName().replaceAll("^(v\\d+_|cleaned_)", "").toLowerCase();
            String normTarget = target.getOriginalName().replaceAll("^(v\\d+_|cleaned_)", "").toLowerCase();
            double maxHeaders = Math.max(baseHeaders.size(), targetHeaders.size());
            double overlapRatio = maxHeaders > 0 ? ((double) common.size() / maxHeaders) : 0.0;
            boolean isLineage = normBase.equals(normTarget) || overlapRatio >= 0.5 || baseId == targetId;

            if (isLineage) {
                comp.setComparisonType("LINEAGE");
                comp.setComparisonTypeLabel("Dataset Lineage Comparison");
                comp.setComparisonBannerMessage("Comparing versions within the same dataset lineage (" + base.getOriginalName() + " → " + target.getOriginalName() + "). Schema changes and metric shifts reflect progressive cleaning or transformation steps.");
            } else {
                comp.setComparisonType("CROSS_DATASET");
                comp.setComparisonTypeLabel("Cross-Dataset Comparative Analysis");
                comp.setComparisonBannerMessage("Notice: These two datasets originate from different domains with distinct schemas (" + base.getOriginalName() + " vs " + target.getOriginalName() + "). Observed differences reflect cross-dataset divergences rather than version progression.");
            }

            // Record-level turnover analysis using common column row hashes
            if (!common.isEmpty()) {
                Map<String, Integer> baseFrequencies = new HashMap<>();
                for (List<String> row : baseData.getRows()) {
                    StringBuilder sb = new StringBuilder();
                    for (String col : common) {
                        int idx = baseHeaders.indexOf(col);
                        sb.append(idx >= 0 && idx < row.size() ? row.get(idx) : "").append("§");
                    }
                    String key = sb.toString();
                    baseFrequencies.put(key, baseFrequencies.getOrDefault(key, 0) + 1);
                }

                int retained = 0;
                for (List<String> row : targetData.getRows()) {
                    StringBuilder sb = new StringBuilder();
                    for (String col : common) {
                        int idx = targetHeaders.indexOf(col);
                        sb.append(idx >= 0 && idx < row.size() ? row.get(idx) : "").append("§");
                    }
                    String key = sb.toString();
                    Integer count = baseFrequencies.get(key);
                    if (count != null && count > 0) {
                        retained++;
                        baseFrequencies.put(key, count - 1);
                    }
                }

                comp.setRowsRetained(retained);
                comp.setRowsRemoved(Math.max(0, base.getRowCount() - retained));
                comp.setRowsAdded(Math.max(0, target.getRowCount() - retained));

                if (isLineage) {
                    if (comp.getRowsRemoved() > 0 && comp.getRowsAdded() == 0) {
                        comp.setRecordLevelExplanation("Retained " + retained + " of " + base.getRowCount() + " base records; removed " + comp.getRowsRemoved() + " records (such as duplicate rows or unrecoverable entries).");
                    } else if (comp.getRowsAdded() > 0 && comp.getRowsRemoved() == 0) {
                        comp.setRecordLevelExplanation("Retained all " + retained + " base records; ingested or appended " + comp.getRowsAdded() + " new records.");
                    } else if (comp.getRowsRemoved() == 0 && comp.getRowsAdded() == 0) {
                        comp.setRecordLevelExplanation("All " + retained + " base records were preserved with 100% record-level retention.");
                    } else {
                        comp.setRecordLevelExplanation("Retained " + retained + " base records, removed " + comp.getRowsRemoved() + " records, and added " + comp.getRowsAdded() + " new records.");
                    }
                } else {
                    comp.setRecordLevelExplanation("Cross-dataset comparison: " + retained + " matching records found across shared columns; " + comp.getRowsRemoved() + " unique to Base, " + comp.getRowsAdded() + " unique to Target.");
                }
            } else {
                comp.setRowsRetained(0);
                comp.setRowsRemoved(base.getRowCount());
                comp.setRowsAdded(target.getRowCount());
                comp.setRecordLevelExplanation("No shared columns exist between these two datasets. Record turnover cannot be traced at the row level.");
            }

            // Schema evolution mapping
            Map<String, ColumnMetadata> baseMap = new HashMap<>();
            for (ColumnMetadata cm : baseAnal.getColumns()) baseMap.put(cm.getName(), cm);
            Map<String, ColumnMetadata> targetMap = new HashMap<>();
            for (ColumnMetadata cm : targetAnal.getColumns()) targetMap.put(cm.getName(), cm);

            List<VersionComparisonResult.SchemaEvolutionItem> schemaItems = new ArrayList<>();
            // Retained and Type Changed
            for (String col : baseHeaders) {
                if (targetHeaders.contains(col)) {
                    ColumnMetadata bc = baseMap.get(col);
                    ColumnMetadata tc = targetMap.get(col);
                    String bType = bc != null ? bc.getType() : "UNKNOWN";
                    String tType = tc != null ? tc.getType() : "UNKNOWN";
                    String status = bType.equals(tType) ? "RETAINED" : "TYPE_CHANGED";
                    if (!bType.equals(tType)) {
                        comp.getTypeChanges().put(col, bType + " -> " + tType);
                    }
                    schemaItems.add(new VersionComparisonResult.SchemaEvolutionItem(col, bType, tType, status));
                } else {
                    ColumnMetadata bc = baseMap.get(col);
                    schemaItems.add(new VersionComparisonResult.SchemaEvolutionItem(col, bc != null ? bc.getType() : "UNKNOWN", "NONE", "REMOVED"));
                }
            }
            // Added
            for (String col : targetHeaders) {
                if (!baseHeaders.contains(col)) {
                    ColumnMetadata tc = targetMap.get(col);
                    schemaItems.add(new VersionComparisonResult.SchemaEvolutionItem(col, "NONE", tc != null ? tc.getType() : "UNKNOWN", "ADDED"));
                }
            }
            comp.setSchemaTable(schemaItems);

            // Numeric Mean Shifts & Detailed Drift
            List<VersionComparisonResult.NumericShiftItem> numItems = new ArrayList<>();
            for (String col : common) {
                ColumnMetadata bc = baseMap.get(col);
                ColumnMetadata tc = targetMap.get(col);
                if (bc != null && tc != null) {
                    boolean bNum = "NUMERIC".equals(bc.getType());
                    boolean tNum = "NUMERIC".equals(tc.getType());
                    if (bNum && tNum) {
                        VersionComparisonResult.NumericShiftItem item = new VersionComparisonResult.NumericShiftItem();
                        item.setColumnName(col);
                        item.setStatus("COMPARABLE");

                        Double bMean = bc.getMean();
                        Double tMean = tc.getMean();
                        item.setBaseMean(bMean != null ? Math.round(bMean * 100.0) / 100.0 : null);
                        item.setTargetMean(tMean != null ? Math.round(tMean * 100.0) / 100.0 : null);

                        if (bMean != null && tMean != null) {
                            double shift = Math.round((tMean - bMean) * 100.0) / 100.0;
                            item.setAbsoluteShift(shift);
                            comp.getMeanShifts().put(col, shift);

                            if (Math.abs(bMean) > 0.0001) {
                                double pct = Math.round(((tMean - bMean) / Math.abs(bMean) * 100.0) * 10.0) / 10.0;
                                item.setPercentageChange(pct);
                                item.setExplanation("Mean shifted by " + (shift >= 0 ? "+" : "") + shift + " (" + (pct >= 0 ? "+" : "") + pct + "%).");
                            } else {
                                item.setPercentageChange(0.0);
                                item.setExplanation("Mean shifted by " + (shift >= 0 ? "+" : "") + shift + ".");
                            }
                        }

                        Double bMed = bc.getMedian();
                        Double tMed = tc.getMedian();
                        item.setBaseMedian(bMed != null ? Math.round(bMed * 100.0) / 100.0 : null);
                        item.setTargetMedian(tMed != null ? Math.round(tMed * 100.0) / 100.0 : null);
                        if (bMed != null && tMed != null) {
                            double medShift = Math.round((tMed - bMed) * 100.0) / 100.0;
                            item.setMedianShift(medShift);
                            comp.getMedianShifts().put(col, medShift);
                        }

                        numItems.add(item);
                    } else if (bNum || tNum) {
                        VersionComparisonResult.NumericShiftItem item = new VersionComparisonResult.NumericShiftItem();
                        item.setColumnName(col);
                        item.setStatus("TYPE_MISMATCH");
                        item.setExplanation("Column type shifted between versions (" + bc.getType() + " vs " + tc.getType() + "). Numerical drift cannot be calculated.");
                        numItems.add(item);
                    }
                }
            }

            // Columns numeric in base but removed in target
            for (String col : removed) {
                ColumnMetadata bc = baseMap.get(col);
                if (bc != null && "NUMERIC".equals(bc.getType())) {
                    VersionComparisonResult.NumericShiftItem item = new VersionComparisonResult.NumericShiftItem();
                    item.setColumnName(col);
                    item.setBaseMean(bc.getMean() != null ? Math.round(bc.getMean() * 100.0) / 100.0 : null);
                    item.setStatus("ABSENT_IN_TARGET");
                    item.setExplanation("Column dropped or removed in target version.");
                    numItems.add(item);
                }
            }

            // Columns numeric in target but added
            for (String col : added) {
                ColumnMetadata tc = targetMap.get(col);
                if (tc != null && "NUMERIC".equals(tc.getType())) {
                    VersionComparisonResult.NumericShiftItem item = new VersionComparisonResult.NumericShiftItem();
                    item.setColumnName(col);
                    item.setTargetMean(tc.getMean() != null ? Math.round(tc.getMean() * 100.0) / 100.0 : null);
                    item.setStatus("ABSENT_IN_BASE");
                    item.setExplanation("New numeric column introduced in target version.");
                    numItems.add(item);
                }
            }

            comp.setNumericComparisons(numItems);
            if (numItems.isEmpty() || numItems.stream().noneMatch(i -> "COMPARABLE".equals(i.getStatus()))) {
                if (!isLineage) {
                    comp.setNumericComparisonMessage("No shared numeric columns exist between these two distinct datasets. Columns in " + base.getOriginalName() + " (" + String.join(", ", baseHeaders) + ") vs " + target.getOriginalName() + " (" + String.join(", ", targetHeaders) + ").");
                } else {
                    comp.setNumericComparisonMessage("No numeric columns with continuous distributions were detected in these dataset versions.");
                }
            }

            // Executive Summary & Overall Verdict Generation
            List<String> imps = new ArrayList<>();
            List<String> dets = new ArrayList<>();
            List<String> obs = new ArrayList<>();

            if (comp.getDuplicatesDelta() < 0) {
                imps.add("Duplicate rows reduced by " + Math.abs(comp.getDuplicatesDelta()) + " (from " + base.getDuplicateCount() + " to " + target.getDuplicateCount() + ").");
            } else if (comp.getDuplicatesDelta() > 0) {
                dets.add("Duplicate rows increased by " + comp.getDuplicatesDelta() + " (from " + base.getDuplicateCount() + " to " + target.getDuplicateCount() + ").");
            }

            if (comp.getMissingCountDelta() < 0) {
                imps.add("Missing values decreased by " + Math.abs(comp.getMissingCountDelta()) + " (from " + base.getMissingCount() + " to " + target.getMissingCount() + ").");
            } else if (comp.getMissingCountDelta() > 0) {
                dets.add("Missing values increased by " + comp.getMissingCountDelta() + " (from " + base.getMissingCount() + " to " + target.getMissingCount() + ").");
            }

            if (comp.getOutlierCountDelta() < 0) {
                imps.add("Outlier anomalies reduced by " + Math.abs(comp.getOutlierCountDelta()) + " across numeric columns.");
            } else if (comp.getOutlierCountDelta() > 0) {
                dets.add("Outlier anomalies increased by " + comp.getOutlierCountDelta() + ".");
            }

            if (comp.getQualityScoreDelta() > 0) {
                imps.add("Overall Data Health Score improved by +" + comp.getQualityScoreDelta() + " points (" + base.getQualityScore() + " -> " + target.getQualityScore() + ").");
            } else if (comp.getQualityScoreDelta() < 0) {
                dets.add("Overall Data Health Score declined by " + comp.getQualityScoreDelta() + " points (" + base.getQualityScore() + " -> " + target.getQualityScore() + ").");
            }

            if (comp.getCompletenessScoreDelta() > 0) {
                imps.add("Completeness improved by +" + comp.getCompletenessScoreDelta() + "% (" + comp.getBaseCompletenessScore() + "% -> " + comp.getTargetCompletenessScore() + "%).");
            } else if (comp.getCompletenessScoreDelta() < 0) {
                dets.add("Completeness dropped by " + comp.getCompletenessScoreDelta() + "%.");
            }

            if (!added.isEmpty()) {
                obs.add("Added " + added.size() + " new column(s): " + String.join(", ", added) + ".");
            }
            if (!removed.isEmpty()) {
                obs.add("Removed " + removed.size() + " column(s): " + String.join(", ", removed) + ".");
            }
            if (comp.getRowCountDelta() != 0) {
                obs.add("Row volume shifted from " + base.getRowCount() + " to " + target.getRowCount() + " (Net change: " + (comp.getRowCountDelta() >= 0 ? "+" : "") + comp.getRowCountDelta() + " rows).");
            }

            comp.setImprovements(imps);
            comp.setDeteriorations(dets);
            comp.setNeutralObservations(obs);

            // Set overall verdict
            if (!isLineage) {
                comp.setOverallVerdict("CROSS_DATASET");
                comp.setSummaryText("Cross-dataset comparative analysis between " + base.getOriginalName() + " and " + target.getOriginalName() + ". Discrepancies represent distinct dataset structures rather than a progression.");
            } else if (comp.getQualityScoreDelta() > 0 || (!imps.isEmpty() && dets.isEmpty())) {
                comp.setOverallVerdict("IMPROVED");
                comp.setSummaryText("Target version shows verified quality improvements with " + (imps.size() > 0 ? imps.get(0) : "higher health index") + ".");
            } else if (comp.getQualityScoreDelta() < 0 || (!dets.isEmpty() && imps.isEmpty())) {
                comp.setOverallVerdict("DEGRADED");
                comp.setSummaryText("Target version exhibits lower data hygiene metrics than the base version.");
            } else {
                comp.setOverallVerdict("UNCHANGED");
                comp.setSummaryText("Dataset versions maintain equivalent overall health scores.");
            }

            boolean identical = (baseId == targetId) ||
                (comp.getRowCountDelta() == 0 && comp.getColumnCountDelta() == 0 &&
                 comp.getMissingCountDelta() == 0 && comp.getDuplicatesDelta() == 0 &&
                 added.isEmpty() && removed.isEmpty() && comp.getTypeChanges().isEmpty());
            comp.setIdentical(identical);

        } catch (Exception e) {
            e.printStackTrace();
        }

        logAction(userId, "COMPARE", base.getOriginalName() + " vs " + target.getOriginalName(), "Evaluated version comparison differences", null);
        return comp;
    }

    /**
     * Custom Validation Rules management per user
     */
    public synchronized List<ValidationRule> getValidationRules(Integer userId) {
        int key = userId != null ? userId : 0;
        return userValidationRulesMap.computeIfAbsent(key, k -> new CopyOnWriteArrayList<>());
    }

    public synchronized ValidationRule addValidationRule(Integer userId, ValidationRule rule) {
        if (rule == null) return null;
        if (rule.getId() == null || rule.getId().isEmpty()) {
            rule.setId("rule_" + idGen.incrementAndGet());
        }
        int key = userId != null ? userId : 0;
        List<ValidationRule> list = userValidationRulesMap.computeIfAbsent(key, k -> new CopyOnWriteArrayList<>());
        list.add(rule);

        // Immediately evaluate if dataset is active
        CSVData csv = getActiveCSVData(userId);
        if (csv != null) {
            validationService.evaluateRule(rule, csv);
        }

        logAction(userId, "VALIDATE", rule.getName(), "Created custom validation rule: " + rule.getRuleType() + " on " + rule.getColumnName(), null);
        return rule;
    }

    public synchronized boolean deleteValidationRule(Integer userId, String ruleId) {
        int key = userId != null ? userId : 0;
        List<ValidationRule> list = userValidationRulesMap.get(key);
        if (list != null) {
            return list.removeIf(r -> r.getId().equals(ruleId));
        }
        return false;
    }

    public synchronized List<ValidationRule> evaluateAllRules(Integer userId) {
        List<ValidationRule> rules = getValidationRules(userId);
        CSVData csv = getActiveCSVData(userId);
        for (ValidationRule rule : rules) {
            if (csv != null) {
                validationService.evaluateRule(rule, csv);
            } else {
                rule.setStatus("UNTESTED");
                rule.setFailedCount(0);
                rule.setFailureRate(0.0);
                rule.setExampleFailedRows(new ArrayList<>());
                rule.setExampleViolations(new ArrayList<>());
            }
        }
        return rules;
    }

    /**
     * Audit Trail logging
     */
    public synchronized void logAction(Integer userId, String action, String datasetName, String details, String userEmail) {
        AuditLogEntry entry = new AuditLogEntry(
            "log_" + idGen.incrementAndGet(),
            System.currentTimeMillis(),
            action,
            datasetName != null ? datasetName : "N/A",
            details,
            userEmail != null ? userEmail : "User"
        );
        int key = userId != null ? userId : 0;
        userAuditTrailMap.computeIfAbsent(key, k -> new CopyOnWriteArrayList<>()).add(0, entry);
        globalAuditTrail.add(0, entry);
    }

    public synchronized List<AuditLogEntry> getAuditTrail(Integer userId) {
        int key = userId != null ? userId : 0;
        List<AuditLogEntry> list = userAuditTrailMap.get(key);
        if (list != null && !list.isEmpty()) {
            return list;
        }
        return globalAuditTrail;
    }

    public synchronized Dataset getActiveDataset(Integer userId) {
        if (userId != null && userId > 0 && userActiveDatasetMap.containsKey(userId)) {
            return userActiveDatasetMap.get(userId);
        }
        return activeDataset;
    }

    public synchronized CSVData getActiveCSVData(Integer userId) {
        if (userId != null && userId > 0 && userActiveCSVMap.containsKey(userId)) {
            return userActiveCSVMap.get(userId);
        }
        return activeCSVData;
    }

    public synchronized AnalysisResult getActiveAnalysisResult(Integer userId) {
        if (userId != null && userId > 0 && userActiveAnalysisMap.containsKey(userId)) {
            return userActiveAnalysisMap.get(userId);
        }
        return activeAnalysisResult;
    }

    public DatasetDAO getDatasetDAO() { return datasetDAO; }
    public AnalysisService getAnalysisService() { return analysisService; }
    public CleaningService getCleaningService() { return cleaningService; }
    public ValidationService getValidationService() { return validationService; }

    private String buildAnalysisJson(AnalysisResult result) {
        if (result == null) return "{}";
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"completeness\":").append(result.getCompletenessScore()).append(",");
        sb.append("\"uniqueness\":").append(result.getUniquenessScore()).append(",");
        sb.append("\"consistency\":").append(result.getConsistencyScore()).append(",");
        sb.append("\"validity\":").append(result.getValidityScore()).append(",");
        sb.append("\"overallQuality\":").append(result.getOverallQualityScore()).append(",");
        sb.append("\"numericCount\":").append(result.getNumericCount()).append(",");
        sb.append("\"categoricalCount\":").append(result.getCategoricalCount()).append(",");
        sb.append("\"booleanCount\":").append(result.getBooleanCount()).append(",");
        sb.append("\"dateCount\":").append(result.getDateCount()).append(",");
        sb.append("\"totalIssues\":").append(result.getIssues() != null ? result.getIssues().size() : 0);
        sb.append("}");
        return sb.toString();
    }

    private String escapeCsv(String val) {
        if (val == null) return "";
        if (val.contains(",") || val.contains("\"") || val.contains("\n") || val.contains("\r")) {
            return "\"" + val.replace("\"", "\"\"") + "\"";
        }
        return val;
    }
}
