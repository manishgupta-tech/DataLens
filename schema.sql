-- DataLens MySQL 8.x Database Schema
-- Provides relational storage for Users, Datasets, and Analysis Profiling Metrics

CREATE DATABASE IF NOT EXISTS datalens_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE datalens_db;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX idx_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Datasets Table
CREATE TABLE IF NOT EXISTS datasets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    row_count INT DEFAULT 0,
    column_count INT DEFAULT 0,
    numeric_count INT DEFAULT 0,
    categorical_count INT DEFAULT 0,
    missing_count INT DEFAULT 0,
    duplicate_count INT DEFAULT 0,
    quality_score INT DEFAULT 0,
    upload_time BIGINT NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_dataset_user (user_id),
    INDEX idx_dataset_upload_time (upload_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Dataset Analysis Profiling Table
CREATE TABLE IF NOT EXISTS dataset_analysis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dataset_id INT NOT NULL,
    user_id INT DEFAULT NULL,
    completeness_score DOUBLE DEFAULT 0,
    uniqueness_score DOUBLE DEFAULT 0,
    quality_score INT DEFAULT 0,
    analysis_json LONGTEXT,
    analyzed_at BIGINT NOT NULL,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_analysis_dataset (dataset_id),
    INDEX idx_analysis_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
