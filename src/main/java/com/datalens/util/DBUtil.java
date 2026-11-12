package com.datalens.util;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * DataLens — DBUtil
 * Manages JDBC connections to SQLite 3 with automatic schema bootstrapping,
 * foreign key enforcement, WAL mode for concurrency, and resilient file resolution.
 */
public class DBUtil {

    private static boolean driverLoaded = false;
    private static volatile boolean schemaInitialized = false;
    private static final Object lock = new Object();

    static {
        try {
            Class.forName("org.sqlite.JDBC");
            driverLoaded = true;
        } catch (ClassNotFoundException e) {
            // Driver not in classpath
            driverLoaded = false;
            System.err.println("[DataLens DBUtil] org.sqlite.JDBC driver not found on classpath: " + e.getMessage());
        }
    }

    private static String getConfig(String key, String defaultVal) {
        String prop = System.getProperty(key);
        if (prop != null && !prop.trim().isEmpty()) {
            return prop.trim();
        }
        String env = System.getenv(key);
        if (env != null && !env.trim().isEmpty()) {
            return env.trim();
        }
        return defaultVal;
    }

    /**
     * Determines the physical SQLite database file location.
     * Defaults to "data/datalens.db". If running under Tomcat, resolves outside
     * the exploded WAR directory (e.g. in catalina.base/data/datalens.db) to ensure
     * data survives WAR redeployments and Tomcat restarts.
     */
    public static File getDatabaseFile() {
        String customPath = getConfig("DATALENS_DB_PATH", null);
        if (customPath == null) {
            customPath = System.getProperty("datalens.db.path");
        }
        if (customPath != null && !customPath.trim().isEmpty()) {
            File custom = new File(customPath.trim());
            ensureParentDir(custom);
            return custom.getAbsoluteFile();
        }

        String catalinaBase = System.getProperty("catalina.base");
        File localDefault = new File("data/datalens.db");

        if (catalinaBase != null && !catalinaBase.trim().isEmpty()) {
            File tomcatData = new File(catalinaBase, "data/datalens.db");
            if (localDefault.exists() && !tomcatData.exists()) {
                ensureParentDir(localDefault);
                return localDefault.getAbsoluteFile();
            }
            ensureParentDir(tomcatData);
            return tomcatData.getAbsoluteFile();
        }

        ensureParentDir(localDefault);
        return localDefault.getAbsoluteFile();
    }

    /**
     * Resolves the server-side uploads storage directory.
     * Defaults to "uploads/" outside exploded WAR in Tomcat.
     */
    public static File getUploadsDirectory() {
        String custom = getConfig("DATALENS_UPLOADS_DIR", null);
        if (custom == null) {
            custom = System.getProperty("datalens.uploads.dir");
        }
        if (custom != null && !custom.trim().isEmpty()) {
            File dir = new File(custom.trim()).getAbsoluteFile();
            dir.mkdirs();
            return dir;
        }

        String catalinaBase = System.getProperty("catalina.base");
        File localUploads = new File("uploads").getAbsoluteFile();
        File localDataUploads = new File("data/uploads").getAbsoluteFile();

        if (catalinaBase != null && !catalinaBase.trim().isEmpty()) {
            File tomcatUploads = new File(catalinaBase, "uploads").getAbsoluteFile();
            if (localUploads.exists()) {
                return localUploads;
            }
            if (localDataUploads.exists()) {
                return localDataUploads;
            }
            tomcatUploads.mkdirs();
            return tomcatUploads;
        }

        if (localDataUploads.exists()) {
            return localDataUploads;
        }
        localUploads.mkdirs();
        return localUploads;
    }

    private static void ensureParentDir(File file) {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
    }

    public static boolean isDriverAvailable() {
        return driverLoaded;
    }

    /**
     * Gets a connection to the SQLite database with WAL mode and foreign keys enabled.
     * Returns null if database is inaccessible.
     */
    public static Connection getConnection() {
        if (!driverLoaded) {
            try {
                Class.forName("org.sqlite.JDBC");
                driverLoaded = true;
            } catch (ClassNotFoundException e) {
                return null;
            }
        }

        try {
            File dbFile = getDatabaseFile();
            ensureParentDir(dbFile);

            String jdbcUrl = "jdbc:sqlite:" + dbFile.getAbsolutePath();
            Connection conn = DriverManager.getConnection(jdbcUrl);

            // Configure SQLite PRAGMA statements for high performance & integrity
            try (Statement pragmaStmt = conn.createStatement()) {
                pragmaStmt.execute("PRAGMA foreign_keys = ON;");
                pragmaStmt.execute("PRAGMA journal_mode = WAL;");
                pragmaStmt.execute("PRAGMA busy_timeout = 5000;");
                pragmaStmt.execute("PRAGMA synchronous = NORMAL;");
            } catch (SQLException ignored) {}

            if (!schemaInitialized) {
                synchronized (lock) {
                    if (!schemaInitialized) {
                        initSchema(conn);
                        schemaInitialized = true;
                    }
                }
            }
            return conn;
        } catch (SQLException e) {
            System.err.println("[DataLens DBUtil] Failed to obtain SQLite connection: " + e.getMessage());
            return null;
        }
    }

    /**
     * Initializes the SQLite schema: users, datasets, dataset_analysis tables and indexes.
     */
    private static void initSchema(Connection conn) {
        String createUsersTableSQL =
            "CREATE TABLE IF NOT EXISTS users (" +
            "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
            "  full_name TEXT NOT NULL," +
            "  email TEXT NOT NULL UNIQUE," +
            "  password_hash TEXT NOT NULL," +
            "  created_at INTEGER NOT NULL" +
            ");";

        String createDatasetsTableSQL =
            "CREATE TABLE IF NOT EXISTS datasets (" +
            "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
            "  user_id INTEGER," +
            "  original_name TEXT NOT NULL," +
            "  stored_name TEXT NOT NULL," +
            "  file_path TEXT NOT NULL," +
            "  file_size INTEGER NOT NULL," +
            "  row_count INTEGER DEFAULT 0," +
            "  column_count INTEGER DEFAULT 0," +
            "  numeric_count INTEGER DEFAULT 0," +
            "  categorical_count INTEGER DEFAULT 0," +
            "  missing_count INTEGER DEFAULT 0," +
            "  duplicate_count INTEGER DEFAULT 0," +
            "  quality_score INTEGER DEFAULT 0," +
            "  upload_time INTEGER NOT NULL," +
            "  status TEXT DEFAULT 'ACTIVE'," +
            "  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL" +
            ");";

        String createAnalysisTableSQL =
            "CREATE TABLE IF NOT EXISTS dataset_analysis (" +
            "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
            "  dataset_id INTEGER NOT NULL," +
            "  user_id INTEGER," +
            "  completeness_score REAL DEFAULT 0," +
            "  uniqueness_score REAL DEFAULT 0," +
            "  quality_score INTEGER DEFAULT 0," +
            "  analysis_json TEXT," +
            "  analyzed_at INTEGER NOT NULL," +
            "  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE," +
            "  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL" +
            ");";

        String createIdxUsersEmail = "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);";
        String createIdxDatasetsUserId = "CREATE INDEX IF NOT EXISTS idx_datasets_user_id ON datasets(user_id);";
        String createIdxDatasetsStatus = "CREATE INDEX IF NOT EXISTS idx_datasets_status ON datasets(status);";
        String createIdxAnalysisDatasetId = "CREATE INDEX IF NOT EXISTS idx_analysis_dataset_id ON dataset_analysis(dataset_id);";
        String createIdxAnalysisUserId = "CREATE INDEX IF NOT EXISTS idx_analysis_user_id ON dataset_analysis(user_id);";

        try (Statement stmt = conn.createStatement()) {
            stmt.executeUpdate(createUsersTableSQL);
            stmt.executeUpdate(createDatasetsTableSQL);
            stmt.executeUpdate(createAnalysisTableSQL);
            stmt.executeUpdate(createIdxUsersEmail);
            stmt.executeUpdate(createIdxDatasetsUserId);
            stmt.executeUpdate(createIdxDatasetsStatus);
            stmt.executeUpdate(createIdxAnalysisDatasetId);
            stmt.executeUpdate(createIdxAnalysisUserId);
        } catch (SQLException e) {
            System.err.println("[DataLens DBUtil] Schema initialization warning: " + e.getMessage());
        }
    }
}
