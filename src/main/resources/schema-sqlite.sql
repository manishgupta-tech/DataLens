-- ====================================================================
-- DataLens — SQLite Database Schema
-- Database File: data/datalens.db
-- Compatible with SQLite 3.x and DB Browser for SQLite
-- ====================================================================

PRAGMA foreign_keys = ON;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- 2. Datasets Table
CREATE TABLE IF NOT EXISTS datasets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    row_count INTEGER DEFAULT 0,
    column_count INTEGER DEFAULT 0,
    numeric_count INTEGER DEFAULT 0,
    categorical_count INTEGER DEFAULT 0,
    missing_count INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    quality_score INTEGER DEFAULT 0,
    upload_time INTEGER NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 3. Dataset Analysis Table
CREATE TABLE IF NOT EXISTS dataset_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id INTEGER NOT NULL,
    user_id INTEGER,
    completeness_score REAL DEFAULT 0,
    uniqueness_score REAL DEFAULT 0,
    quality_score INTEGER DEFAULT 0,
    analysis_json TEXT,
    analyzed_at INTEGER NOT NULL,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. Indexes for Query Optimization
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_datasets_user_id ON datasets(user_id);
CREATE INDEX IF NOT EXISTS idx_datasets_status ON datasets(status);
CREATE INDEX IF NOT EXISTS idx_analysis_dataset_id ON dataset_analysis(dataset_id);
CREATE INDEX IF NOT EXISTS idx_analysis_user_id ON dataset_analysis(user_id);
