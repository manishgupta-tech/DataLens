package com.datalens.util;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.KeySpec;

/**
 * DataLens — PasswordUtil
 * Standard cryptographically secure password hashing and verification using
 * PBKDF2WithHmacSHA256 with unique 16-byte random salt, 65,536 iterations,
 * and constant-time byte comparison.
 */
public class PasswordUtil {

    private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final int ITERATIONS = 65536;
    private static final int KEY_LENGTH = 256; // bits
    private static final int SALT_BYTES = 16;
    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * Hashes a plain password using PBKDF2WithHmacSHA256 with a unique random salt.
     * @param plainPassword The plain text password (exact, untrimmed)
     * @return Formatted hash string: PBKDF2:iterations:saltHex:hashHex
     */
    public static String hashPassword(String plainPassword) {
        if (plainPassword == null || plainPassword.isEmpty()) {
            throw new IllegalArgumentException("Password cannot be null or empty");
        }
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);

        byte[] hash = pbkdf2(plainPassword.toCharArray(), salt, ITERATIONS, KEY_LENGTH);
        return "PBKDF2:" + ITERATIONS + ":" + toHex(salt) + ":" + toHex(hash);
    }

    /**
     * Verifies a plain password against a stored secure password hash.
     * Uses constant-time byte comparison to eliminate timing attacks.
     * Never performs partial matching or substring matching.
     * @param plainPassword The entered password (exact, untrimmed)
     * @param storedHash The hash from database
     * @return true if exact match, false otherwise
     */
    public static boolean verifyPassword(String plainPassword, String storedHash) {
        if (plainPassword == null || storedHash == null || storedHash.trim().isEmpty()) {
            return false;
        }

        String[] parts = storedHash.split(":");
        if (parts.length == 4 && "PBKDF2".equals(parts[0])) {
            try {
                int iterations = Integer.parseInt(parts[1]);
                byte[] salt = fromHex(parts[2]);
                byte[] expectedHash = fromHex(parts[3]);

                byte[] computedHash = pbkdf2(plainPassword.toCharArray(), salt, iterations, expectedHash.length * 8);
                return MessageDigest.isEqual(computedHash, expectedHash);
            } catch (Exception e) {
                return false;
            }
        }

        // Backward compatibility for legacy SHA-256 hashes if any existed
        if (storedHash.length() == 64 && !storedHash.contains(":")) {
            try {
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                String legacySalted = "datalens_secure_salt_v1:" + plainPassword;
                byte[] digest = md.digest(legacySalted.getBytes(StandardCharsets.UTF_8));
                byte[] expected = fromHex(storedHash);
                return MessageDigest.isEqual(digest, expected);
            } catch (Exception e) {
                return false;
            }
        }

        return false;
    }

    private static byte[] pbkdf2(char[] password, byte[] salt, int iterations, int keyLength) {
        try {
            KeySpec spec = new PBEKeySpec(password, salt, iterations, keyLength);
            SecretKeyFactory skf = SecretKeyFactory.getInstance(ALGORITHM);
            return skf.generateSecret(spec).getEncoded();
        } catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
            throw new RuntimeException("Error computing password hash", e);
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }

    private static byte[] fromHex(String hex) {
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                                 + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }
}
