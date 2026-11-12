package com.datalens.util;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * DataLens — CSVParserUtil
 * Standard RFC-4180 compliant CSV parser for Java with support for quoted strings,
 * commas inside quotes, multi-line values, and UTF-8 encoding.
 */
public class CSVParserUtil {

    public static class CSVData {
        private final List<String> headers;
        private final List<List<String>> rows;

        public CSVData(List<String> headers, List<List<String>> rows) {
            this.headers = headers;
            this.rows = rows;
        }

        public List<String> getHeaders() {
            return headers;
        }

        public List<List<String>> getRows() {
            return rows;
        }

        public int getRowCount() {
            return rows.size();
        }

        public int getColumnCount() {
            return headers.size();
        }
    }

    /**
     * Parses a CSV file from disk into CSVData.
     */
    public static CSVData parseCSV(File file) throws IOException {
        List<String> headers = new ArrayList<>();
        List<List<String>> rows = new ArrayList<>();

        if (file == null || !file.exists() || file.length() == 0) {
            return new CSVData(headers, rows);
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            boolean isFirstRow = true;
            StringBuilder multiLineBuffer = new StringBuilder();
            boolean insideQuotes = false;

            while ((line = reader.readLine()) != null) {
                // Strip UTF-8 BOM if present on very first line
                if (isFirstRow && line.startsWith("\uFEFF")) {
                    line = line.substring(1);
                }

                if (insideQuotes) {
                    multiLineBuffer.append("\n").append(line);
                } else {
                    multiLineBuffer.setLength(0);
                    multiLineBuffer.append(line);
                }

                // Count quotes to check if this record spans multiple lines
                insideQuotes = isLineInsideQuotes(multiLineBuffer.toString());

                if (!insideQuotes) {
                    String fullRecord = multiLineBuffer.toString();
                    if (fullRecord.trim().isEmpty()) {
                        continue;
                    }

                    List<String> tokens = parseCSVLine(fullRecord);
                    if (isFirstRow) {
                        headers.addAll(tokens);
                        isFirstRow = false;
                    } else {
                        // Align row length to headers
                        while (tokens.size() < headers.size()) {
                            tokens.add("");
                        }
                        rows.add(tokens);
                    }
                }
            }
        }

        return new CSVData(headers, rows);
    }

    /**
     * Parses a single CSV record line into tokens.
     */
    public static List<String> parseCSVLine(String line) {
        List<String> result = new ArrayList<>();
        if (line == null) {
            return result;
        }

        StringBuilder curVal = new StringBuilder();
        boolean inQuotes = false;
        char[] chars = line.toCharArray();

        for (int i = 0; i < chars.length; i++) {
            char c = chars[i];

            if (c == '"') {
                if (inQuotes && i + 1 < chars.length && chars[i + 1] == '"') {
                    // Escaped quote
                    curVal.append('"');
                    i++; // skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c == ',' && !inQuotes) {
                result.add(curVal.toString().trim());
                curVal.setLength(0);
            } else {
                curVal.append(c);
            }
        }

        result.add(curVal.toString().trim());
        return result;
    }

    private static boolean isLineInsideQuotes(String s) {
        int quoteCount = 0;
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) == '"') {
                quoteCount++;
            }
        }
        return (quoteCount % 2) != 0;
    }
}
