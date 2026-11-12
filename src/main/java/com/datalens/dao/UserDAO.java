package com.datalens.dao;

import com.datalens.model.User;
import com.datalens.util.DBUtil;
import com.datalens.util.PasswordUtil;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * DataLens — UserDAO
 * Data Access Object for persisting and querying User accounts in SQLite with
 * PreparedStatement queries, UNIQUE email enforcement, and in-memory synchronization.
 */
public class UserDAO {

    private static final ConcurrentHashMap<String, User> memoryEmailMap = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<Integer, User> memoryIdMap = new ConcurrentHashMap<>();
    private static final AtomicInteger idSequence = new AtomicInteger(1);

    /**
     * Checks if a user already exists with the given email address (case-insensitive).
     */
    public boolean emailExists(String email) {
        if (email == null || email.trim().isEmpty()) {
            return false;
        }
        String cleanEmail = email.trim().toLowerCase();

        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            return memoryEmailMap.containsKey(cleanEmail);
        }

        String sql = "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, cleanEmail);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return true;
                }
            }
        } catch (SQLException e) {
            return memoryEmailMap.containsKey(cleanEmail);
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }

        return memoryEmailMap.containsKey(cleanEmail);
    }

    /**
     * Registers a new user into SQLite (and synchronized in-memory registry).
     * Enforces unique email constraint; returns false if duplicate or insert fails.
     */
    public boolean registerUser(User user) {
        if (user == null || user.getEmail() == null || user.getPasswordHash() == null) {
            return false;
        }

        String cleanEmail = user.getEmail().trim().toLowerCase();
        user.setEmail(cleanEmail);
        if (user.getFullName() != null) {
            user.setFullName(user.getFullName().trim());
        }

        // Check if email already exists before inserting
        if (emailExists(cleanEmail)) {
            return false;
        }

        if (user.getId() <= 0) {
            user.setId(idSequence.getAndIncrement());
        }
        if (user.getCreatedAt() <= 0) {
            user.setCreatedAt(System.currentTimeMillis());
        }

        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            // Store in memory registry when SQLite is offline
            memoryEmailMap.put(cleanEmail, user);
            memoryIdMap.put(user.getId(), user);
            return true;
        }

        String sql = "INSERT INTO users (full_name, email, password_hash, created_at) VALUES (?, ?, ?, ?)";
        try (PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, user.getFullName());
            ps.setString(2, cleanEmail);
            ps.setString(3, user.getPasswordHash());
            ps.setLong(4, user.getCreatedAt());

            int affected = ps.executeUpdate();
            if (affected > 0) {
                int generatedId = 0;
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
                    user.setId(generatedId);
                }

                memoryEmailMap.put(cleanEmail, user);
                memoryIdMap.put(user.getId(), user);
                return true;
            }
            return false;
        } catch (SQLException e) {
            // Handles SQLite UNIQUE constraint violation safely
            return false;
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }
    }

    /**
     * Finds a user by email (case-insensitive).
     */
    public User findByEmail(String email) {
        if (email == null || email.trim().isEmpty()) {
            return null;
        }
        String cleanEmail = email.trim().toLowerCase();

        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            return memoryEmailMap.get(cleanEmail);
        }

        String sql = "SELECT id, full_name, email, password_hash, created_at FROM users WHERE LOWER(email) = ? LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, cleanEmail);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    User user = new User();
                    user.setId(rs.getInt("id"));
                    user.setFullName(rs.getString("full_name"));
                    user.setEmail(rs.getString("email"));
                    user.setPasswordHash(rs.getString("password_hash"));
                    user.setCreatedAt(rs.getLong("created_at"));

                    // Sync to memory
                    memoryEmailMap.put(cleanEmail, user);
                    memoryIdMap.put(user.getId(), user);
                    return user;
                }
            }
        } catch (SQLException e) {
            return memoryEmailMap.get(cleanEmail);
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }

        return memoryEmailMap.get(cleanEmail);
    }

    /**
     * Finds a user by ID.
     */
    public User findById(int id) {
        if (id <= 0) return null;

        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            return memoryIdMap.get(id);
        }

        String sql = "SELECT id, full_name, email, password_hash, created_at FROM users WHERE id = ? LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    User user = new User();
                    user.setId(rs.getInt("id"));
                    user.setFullName(rs.getString("full_name"));
                    user.setEmail(rs.getString("email"));
                    user.setPasswordHash(rs.getString("password_hash"));
                    user.setCreatedAt(rs.getLong("created_at"));

                    memoryEmailMap.put(user.getEmail().toLowerCase(), user);
                    memoryIdMap.put(user.getId(), user);
                    return user;
                }
            }
        } catch (SQLException e) {
            return memoryIdMap.get(id);
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }

        return memoryIdMap.get(id);
    }

    /**
     * Returns all registered users from SQLite.
     */
    public List<User> getAllUsers() {
        Connection conn = DBUtil.getConnection();
        if (conn == null) {
            return new ArrayList<>(memoryIdMap.values());
        }

        List<User> list = new ArrayList<>();
        String sql = "SELECT id, full_name, email, password_hash, created_at FROM users ORDER BY id ASC";
        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                User user = new User();
                user.setId(rs.getInt("id"));
                user.setFullName(rs.getString("full_name"));
                user.setEmail(rs.getString("email"));
                user.setPasswordHash(rs.getString("password_hash"));
                user.setCreatedAt(rs.getLong("created_at"));
                list.add(user);
            }
            return list;
        } catch (SQLException e) {
            return new ArrayList<>(memoryIdMap.values());
        } finally {
            try {
                conn.close();
            } catch (SQLException ignored) {}
        }
    }

    /**
     * Authenticates a user by email and exact plain-text password.
     * Never performs partial matching, substring, startsWith, or fallback.
     * Returns the User object if authenticated, or null if invalid.
     */
    public User authenticate(String email, String plainPassword) {
        if (email == null || plainPassword == null || plainPassword.isEmpty()) {
            return null;
        }

        User user = findByEmail(email);
        if (user == null) {
            return null;
        }

        if (PasswordUtil.verifyPassword(plainPassword, user.getPasswordHash())) {
            return user;
        }

        return null;
    }
}
