package com.datalens.dao;

import com.datalens.model.Dataset;
import com.datalens.model.DatasetAnalysisRecord;
import com.datalens.util.DBUtil;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * DataLens — DatasetDAO
 * Data Access Object for persisting and querying dataset records and analysis in SQLite
 * with transactional safety, foreign keys, and in-memory synchronization.
 */
public class DatasetDAO {

    private static final List<Dataset> memoryStore = new CopyOnWriteArrayList<>();
    private static final AtomicInteger idSequence = new AtomicInteger(1);

    /**
     * Saves a dataset to SQLite (or in-memory registry if SQLite is unavailable).
     */
    public boolean saveDataset(Dataset dataset) {
        if (dataset == null) return false;

        // Assign memory ID if needed
        if (dataset.getId() <= 0) {
            dataset.setId(idSequence.getAndIncrement());
        }

        // Always update memory store
        memoryStore.removeIf(d -> (dataset.getStoredName() != null && dataset.getStoredName().equals(d.getStoredName())) || (dataset.getId() > 0 && d.getId() == dataset.getId()));
        memoryStore.add(0, dataset);

        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            return true;
        }

        String sql = "INSERT INTO datasets (user_id, original_name, stored_name, file_path, file_size, row_count, " +
                     "column_count, numeric_count, categorical_count, missing_count, duplicate_count, " +
                     "quality_score, upload_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        try {
            conn.setAutoCommit(false);
            try (PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                if (dataset.getUserId() != null && dataset.getUserId() > 0) {
                    ps.setInt(1, dataset.getUserId());
                } else {
                    ps.setNull(1, Types.INTEGER);
                }
                ps.setString(2, dataset.getOriginalName());
                ps.setString(3, dataset.getStoredName());
                ps.setString(4, dataset.getFilePath());
                ps.setLong(5, dataset.getFileSize());
                ps.setInt(6, dataset.getRowCount());
                ps.setInt(7, dataset.getColumnCount());
                ps.setInt(8, dataset.getNumericCount());
                ps.setInt(9, dataset.getCategoricalCount());
                ps.setInt(10, dataset.getMissingCount());
                ps.setInt(11, dataset.getDuplicateCount());
                ps.setInt(12, dataset.getQualityScore());
                ps.setLong(13, dataset.getUploadTime());
                ps.setString(14, dataset.getStatus() != null ? dataset.getStatus() : "ACTIVE");

                int affected = ps.executeUpdate();
                int generatedId = 0;
                if (affected > 0) {
                    try (ResultSet rs = ps.getGeneratedKeys()) {
                        if (rs != null && rs.next()) {
                            generatedId = rs.getInt(1);
                        }
                    } catch (Exception ignored) {}

                    if (generatedId <= 0) {
                        try (Statement stmt = conn.createStatement();
                             ResultSet idRs = stmt.executeQuery("SELECT last_insert_rowid()")) {
                            if (idRs.next()) {
                                generatedId = idRs.getInt(1);
                            }
                        } catch (Exception ignored) {}
                    }

                    if (generatedId > 0) {
                        dataset.setId(generatedId);
                    }

                    // Insert initial dataset_analysis record
                    try (PreparedStatement aps = conn.prepareStatement(
                        "INSERT INTO dataset_analysis (dataset_id, user_id, completeness_score, uniqueness_score, quality_score, analysis_json, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?)")) {
                        aps.setInt(1, dataset.getId());
                        if (dataset.getUserId() != null && dataset.getUserId() > 0) {
                            aps.setInt(2, dataset.getUserId());
                        } else {
                            aps.setNull(2, Types.INTEGER);
                        }
                        double completeness = (dataset.getRowCount() * dataset.getColumnCount() > 0)
                            ? 100.0 - ((double) dataset.getMissingCount() / (dataset.getRowCount() * dataset.getColumnCount()) * 100.0)
                            : 100.0;
                        double uniqueness = (dataset.getRowCount() > 0)
                            ? 100.0 - ((double) dataset.getDuplicateCount() / dataset.getRowCount() * 100.0)
                            : 100.0;
                        aps.setDouble(3, Math.max(0.0, completeness));
                        aps.setDouble(4, Math.max(0.0, uniqueness));
                        aps.setInt(5, dataset.getQualityScore());
                        aps.setString(6, null);
                        aps.setLong(7, dataset.getUploadTime());
                        aps.executeUpdate();
                    }
                }
                conn.commit();
                return true;
            } catch (SQLException e) {
                conn.rollback();
                return true; // Still preserved in memory
            } finally {
                conn.setAutoCommit(true);
            }
        } catch (SQLException e) {
            return true;
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }
    }

    /**
     * Saves or updates detailed dataset analysis results in dataset_analysis table.
     */
    public boolean saveAnalysis(int datasetId, Integer userId, double completeness, double uniqueness,
                                int qualityScore, String analysisJson) {
        Connection conn = DBUtil.getConnection();
        if (conn == null) return false;

        String checkSql = "SELECT id FROM dataset_analysis WHERE dataset_id = ? LIMIT 1";
        String updateSql = "UPDATE dataset_analysis SET completeness_score = ?, uniqueness_score = ?, quality_score = ?, analysis_json = ?, analyzed_at = ? WHERE dataset_id = ?";
        String insertSql = "INSERT INTO dataset_analysis (dataset_id, user_id, completeness_score, uniqueness_score, quality_score, analysis_json, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?)";

        long now = System.currentTimeMillis();
        try {
            boolean exists = false;
            try (PreparedStatement checkPs = conn.prepareStatement(checkSql)) {
                checkPs.setInt(1, datasetId);
                try (ResultSet rs = checkPs.executeQuery()) {
                    if (rs.next()) exists = true;
                }
            }

            if (exists) {
                try (PreparedStatement updatePs = conn.prepareStatement(updateSql)) {
                    updatePs.setDouble(1, completeness);
                    updatePs.setDouble(2, uniqueness);
                    updatePs.setInt(3, qualityScore);
                    updatePs.setString(4, analysisJson);
                    updatePs.setLong(5, now);
                    updatePs.setInt(6, datasetId);
                    updatePs.executeUpdate();
                }
            } else {
                try (PreparedStatement insertPs = conn.prepareStatement(insertSql)) {
                    insertPs.setInt(1, datasetId);
                    if (userId != null && userId > 0) {
                        insertPs.setInt(2, userId);
                    } else {
                        insertPs.setNull(2, Types.INTEGER);
                    }
                    insertPs.setDouble(3, completeness);
                    insertPs.setDouble(4, uniqueness);
                    insertPs.setInt(5, qualityScore);
                    insertPs.setString(6, analysisJson);
                    insertPs.setLong(7, now);
                    insertPs.executeUpdate();
                }
            }
            return true;
        } catch (SQLException e) {
            System.err.println("[DataLens DatasetDAO] Failed to save analysis in SQLite: " + e.getMessage());
            return false;
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }
    }

    /**
     * Retrieves the analysis record for a dataset.
     */
    public DatasetAnalysisRecord getAnalysisByDatasetId(int datasetId) {
        Connection conn = DBUtil.getConnection();
        if (conn == null) return null;

        String sql = "SELECT * FROM dataset_analysis WHERE dataset_id = ? ORDER BY analyzed_at DESC LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, datasetId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    DatasetAnalysisRecord rec = new DatasetAnalysisRecord();
                    rec.setId(rs.getInt("id"));
                    rec.setDatasetId(rs.getInt("dataset_id"));
                    int uId = rs.getInt("user_id");
                    if (!rs.wasNull()) rec.setUserId(uId);
                    rec.setCompletenessScore(rs.getDouble("completeness_score"));
                    rec.setUniquenessScore(rs.getDouble("uniqueness_score"));
                    rec.setQualityScore(rs.getInt("quality_score"));
                    rec.setAnalysisJson(rs.getString("analysis_json"));
                    rec.setAnalyzedAt(rs.getLong("analyzed_at"));
                    return rec;
                }
            }
        } catch (SQLException e) {
            System.err.println("[DataLens DatasetDAO] Failed to query analysis record: " + e.getMessage());
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }
        return null;
    }

    /**
     * Retrieves all datasets (ordered by upload time descending).
     */
    public List<Dataset> getAllDatasets() {
        return getDatasetsByUserId(null);
    }

    /**
     * Retrieves datasets for a specific user ID or all if null.
     */
    public List<Dataset> getAllDatasets(Integer userId) {
        return getDatasetsByUserId(userId);
    }

    /**
     * Retrieves datasets for a specific user ID.
     */
    public List<Dataset> getDatasetsByUserId(Integer userId) {
        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            if (userId == null) {
                return new ArrayList<>(memoryStore);
            }
            return memoryStore.stream()
                .filter(d -> d.getUserId() != null && d.getUserId().equals(userId))
                .collect(Collectors.toList());
        }

        List<Dataset> list = new ArrayList<>();
        String sql = (userId != null)
            ? "SELECT * FROM datasets WHERE user_id = ? ORDER BY upload_time DESC"
            : "SELECT * FROM datasets ORDER BY upload_time DESC";

        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            if (userId != null) {
                ps.setInt(1, userId);
            }
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Dataset d = mapResultSet(rs);
                    list.add(d);
                }
            }
            if (list.isEmpty()) {
                if (userId == null) return new ArrayList<>(memoryStore);
                return memoryStore.stream()
                    .filter(d -> d.getUserId() != null && d.getUserId().equals(userId))
                    .collect(Collectors.toList());
            }
            return list;
        } catch (SQLException e) {
            if (userId == null) return new ArrayList<>(memoryStore);
            return memoryStore.stream()
                .filter(d -> d.getUserId() != null && d.getUserId().equals(userId))
                .collect(Collectors.toList());
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }
    }

    /**
     * Finds a dataset by ID.
     */
    public Dataset getDatasetById(int id) {
        return getDatasetById(id, null);
    }

    /**
     * Finds a dataset by ID and optional userId.
     */
    public Dataset getDatasetById(int id, Integer userId) {
        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            return memoryStore.stream()
                .filter(d -> d.getId() == id && (userId == null || (d.getUserId() != null && d.getUserId().equals(userId))))
                .findFirst().orElse(null);
        }

        String sql = (userId != null)
            ? "SELECT * FROM datasets WHERE id = ? AND user_id = ?"
            : "SELECT * FROM datasets WHERE id = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, id);
            if (userId != null) {
                ps.setInt(2, userId);
            }
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return mapResultSet(rs);
                }
            }
        } catch (SQLException ignored) {
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }

        return memoryStore.stream()
            .filter(d -> d.getId() == id && (userId == null || (d.getUserId() != null && d.getUserId().equals(userId))))
            .findFirst().orElse(null);
    }

    /**
     * Finds a dataset by stored or original filename.
     */
    public Dataset getDatasetByName(String name) {
        return getDatasetByName(name, null);
    }

    /**
     * Finds a dataset by stored or original filename and optional userId.
     */
    public Dataset getDatasetByName(String name, Integer userId) {
        if (name == null || name.trim().isEmpty()) return null;
        String cleanName = name.trim();

        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            return memoryStore.stream()
                .filter(d -> (cleanName.equalsIgnoreCase(d.getStoredName()) || cleanName.equalsIgnoreCase(d.getOriginalName()))
                    && (userId == null || (d.getUserId() != null && d.getUserId().equals(userId))))
                .findFirst().orElse(null);
        }

        String sql = (userId != null)
            ? "SELECT * FROM datasets WHERE (stored_name = ? OR original_name = ?) AND user_id = ? ORDER BY id DESC LIMIT 1"
            : "SELECT * FROM datasets WHERE (stored_name = ? OR original_name = ?) ORDER BY id DESC LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, cleanName);
            ps.setString(2, cleanName);
            if (userId != null) {
                ps.setInt(3, userId);
            }
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return mapResultSet(rs);
                }
            }
        } catch (SQLException ignored) {
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }

        return memoryStore.stream()
            .filter(d -> (cleanName.equalsIgnoreCase(d.getStoredName()) || cleanName.equalsIgnoreCase(d.getOriginalName()))
                && (userId == null || (d.getUserId() != null && d.getUserId().equals(userId))))
            .findFirst().orElse(null);
    }

    /**
     * Atomically activates a dataset for a user, marking all others as STORED.
     */
    public boolean activateDataset(int datasetId, Integer userId) {
        if (userId == null) return false;

        synchronized (memoryStore) {
            for (Dataset d : memoryStore) {
                if (userId.equals(d.getUserId())) {
                    if (d.getId() == datasetId) {
                        d.setStatus("ACTIVE");
                    } else {
                        d.setStatus("STORED");
                    }
                }
            }
        }

        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            return true;
        }

        try {
            conn.setAutoCommit(false);
            try (PreparedStatement ps1 = conn.prepareStatement("UPDATE datasets SET status = 'STORED' WHERE user_id = ?");
                 PreparedStatement ps2 = conn.prepareStatement("UPDATE datasets SET status = 'ACTIVE' WHERE id = ? AND user_id = ?")) {
                ps1.setInt(1, userId);
                ps1.executeUpdate();

                ps2.setInt(1, datasetId);
                ps2.setInt(2, userId);
                int rows = ps2.executeUpdate();

                conn.commit();
                return rows > 0;
            } catch (SQLException e) {
                conn.rollback();
                return false;
            } finally {
                conn.setAutoCommit(true);
            }
        } catch (SQLException e) {
            return false;
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }
    }

    /**
     * Deletes a dataset by ID and optional userId (for ownership enforcement).
     */
    public boolean deleteDataset(int id, Integer userId) {
        memoryStore.removeIf(d -> d.getId() == id && (userId == null || (d.getUserId() != null && d.getUserId().equals(userId))));

        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            return true;
        }

        String sql = (userId != null)
            ? "DELETE FROM datasets WHERE id = ? AND user_id = ?"
            : "DELETE FROM datasets WHERE id = ?";

        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, id);
            if (userId != null) {
                ps.setInt(2, userId);
            }
            int rows = ps.executeUpdate();
            return rows > 0;
        } catch (SQLException e) {
            return true;
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }
    }

    /**
     * Deletes a dataset by ID without user filter.
     */
    public boolean deleteDataset(int id) {
        return deleteDataset(id, null);
    }

    private Dataset mapResultSet(ResultSet rs) throws SQLException {
        Dataset d = new Dataset();
        d.setId(rs.getInt("id"));
        int uId = rs.getInt("user_id");
        if (!rs.wasNull()) {
            d.setUserId(uId);
        }
        d.setOriginalName(rs.getString("original_name"));
        d.setStoredName(rs.getString("stored_name"));
        d.setFilePath(rs.getString("file_path"));
        d.setFileSize(rs.getLong("file_size"));
        d.setRowCount(rs.getInt("row_count"));
        d.setColumnCount(rs.getInt("column_count"));
        d.setNumericCount(rs.getInt("numeric_count"));
        d.setCategoricalCount(rs.getInt("categorical_count"));
        d.setMissingCount(rs.getInt("missing_count"));
        d.setDuplicateCount(rs.getInt("duplicate_count"));
        d.setQualityScore(rs.getInt("quality_score"));
        d.setUploadTime(rs.getLong("upload_time"));
        d.setStatus(rs.getString("status"));
        return d;
    }
}
