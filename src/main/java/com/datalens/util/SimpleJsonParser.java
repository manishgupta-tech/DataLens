package com.datalens.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Lightweight recursive descent JSON parser with zero dependencies.
 * Parses JSON objects into Map<String, Object> and JSON arrays into List<Object>.
 */
public class SimpleJsonParser {

    private final String src;
    private int pos = 0;

    public SimpleJsonParser(String src) {
        this.src = src != null ? src : "";
    }

    public static Object parse(String json) {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        return new SimpleJsonParser(json.trim()).parseValue();
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String json) {
        Object obj = parse(json);
        if (obj instanceof Map) {
            return (Map<String, Object>) obj;
        }
        return new LinkedHashMap<>();
    }

    @SuppressWarnings("unchecked")
    public static List<Object> parseArray(String json) {
        Object obj = parse(json);
        if (obj instanceof List) {
            return (List<Object>) obj;
        }
        return new ArrayList<>();
    }

    private Object parseValue() {
        skipWhitespace();
        if (pos >= src.length()) return null;

        char c = src.charAt(pos);
        if (c == '{') return parseObjectInternal();
        if (c == '[') return parseArrayInternal();
        if (c == '"' || c == '\'') return parseStringInternal();
        if (c == 't' || c == 'T' || c == 'f' || c == 'F') return parseBooleanInternal();
        if (c == 'n' || c == 'N') return parseNullInternal();
        if (c == '-' || Character.isDigit(c)) return parseNumberInternal();

        return null;
    }

    private Map<String, Object> parseObjectInternal() {
        Map<String, Object> map = new LinkedHashMap<>();
        pos++; // skip '{'
        skipWhitespace();

        if (pos < src.length() && src.charAt(pos) == '}') {
            pos++;
            return map;
        }

        while (pos < src.length()) {
            skipWhitespace();
            if (pos >= src.length()) break;
            if (src.charAt(pos) == '}') {
                pos++;
                break;
            }

            // Parse key
            String key;
            if (src.charAt(pos) == '"' || src.charAt(pos) == '\'') {
                key = parseStringInternal();
            } else {
                int start = pos;
                while (pos < src.length() && src.charAt(pos) != ':' && !Character.isWhitespace(src.charAt(pos))) {
                    pos++;
                }
                key = src.substring(start, pos);
            }

            skipWhitespace();
            if (pos < src.length() && src.charAt(pos) == ':') {
                pos++;
            }

            skipWhitespace();
            Object val = parseValue();
            map.put(key, val);

            skipWhitespace();
            if (pos < src.length() && src.charAt(pos) == ',') {
                pos++;
            } else if (pos < src.length() && src.charAt(pos) == '}') {
                pos++;
                break;
            }
        }
        return map;
    }

    private List<Object> parseArrayInternal() {
        List<Object> list = new ArrayList<>();
        pos++; // skip '['
        skipWhitespace();

        if (pos < src.length() && src.charAt(pos) == ']') {
            pos++;
            return list;
        }

        while (pos < src.length()) {
            skipWhitespace();
            if (pos >= src.length()) break;
            if (src.charAt(pos) == ']') {
                pos++;
                break;
            }

            Object val = parseValue();
            list.add(val);

            skipWhitespace();
            if (pos < src.length() && src.charAt(pos) == ',') {
                pos++;
            } else if (pos < src.length() && src.charAt(pos) == ']') {
                pos++;
                break;
            }
        }
        return list;
    }

    private String parseStringInternal() {
        char quote = src.charAt(pos);
        pos++; // skip quote
        StringBuilder sb = new StringBuilder();

        while (pos < src.length()) {
            char c = src.charAt(pos);
            if (c == '\\') {
                pos++;
                if (pos < src.length()) {
                    char escaped = src.charAt(pos);
                    if (escaped == '"') sb.append('"');
                    else if (escaped == '\'') sb.append('\'');
                    else if (escaped == '\\') sb.append('\\');
                    else if (escaped == '/') sb.append('/');
                    else if (escaped == 'b') sb.append('\b');
                    else if (escaped == 'f') sb.append('\f');
                    else if (escaped == 'n') sb.append('\n');
                    else if (escaped == 'r') sb.append('\r');
                    else if (escaped == 't') sb.append('\t');
                    else if (escaped == 'u' && pos + 4 < src.length()) {
                        String hex = src.substring(pos + 1, pos + 5);
                        try {
                            sb.append((char) Integer.parseInt(hex, 16));
                            pos += 4;
                        } catch (NumberFormatException e) {
                            sb.append("\\u").append(hex);
                        }
                    } else {
                        sb.append(escaped);
                    }
                }
            } else if (c == quote) {
                pos++;
                return sb.toString();
            } else {
                sb.append(c);
            }
            pos++;
        }
        return sb.toString();
    }

    private Object parseNumberInternal() {
        int start = pos;
        if (pos < src.length() && (src.charAt(pos) == '-' || src.charAt(pos) == '+')) {
            pos++;
        }
        boolean isFloat = false;
        while (pos < src.length()) {
            char c = src.charAt(pos);
            if (Character.isDigit(c)) {
                pos++;
            } else if (c == '.' || c == 'e' || c == 'E') {
                isFloat = true;
                pos++;
            } else {
                break;
            }
        }
        String numStr = src.substring(start, pos);
        try {
            if (isFloat) {
                return Double.parseDouble(numStr);
            } else {
                long l = Long.parseLong(numStr);
                if (l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) {
                    return (int) l;
                }
                return l;
            }
        } catch (Exception e) {
            return numStr;
        }
    }

    private Boolean parseBooleanInternal() {
        if (src.regionMatches(true, pos, "true", 0, 4)) {
            pos += 4;
            return Boolean.TRUE;
        }
        if (src.regionMatches(true, pos, "false", 0, 5)) {
            pos += 5;
            return Boolean.FALSE;
        }
        pos++;
        return Boolean.FALSE;
    }

    private Object parseNullInternal() {
        if (src.regionMatches(true, pos, "null", 0, 4)) {
            pos += 4;
        } else {
            pos++;
        }
        return null;
    }

    private void skipWhitespace() {
        while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) {
            pos++;
        }
    }
}
