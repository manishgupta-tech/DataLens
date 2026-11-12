package com.datalens.util;

import jakarta.servlet.http.HttpSession;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * DataLens — SessionRegistry
 * Thread-safe registry mapping session tokens, sessionId, and user contexts.
 * Guarantees cross-origin, iframe, and window.open navigation requests can
 * reliably resolve authenticated user state even if third-party cookies are partitioned.
 */
public class SessionRegistry {

    public static class SessionData {
        public final int userId;
        public final String userName;
        public final String userEmail;
        public final long loginTime;
        public HttpSession httpSession;

        public SessionData(int userId, String userName, String userEmail, HttpSession httpSession) {
            this.userId = userId;
            this.userName = userName;
            this.userEmail = userEmail;
            this.loginTime = System.currentTimeMillis();
            this.httpSession = httpSession;
        }
    }

    private static final Map<String, SessionData> activeSessions = new ConcurrentHashMap<>();

    public static void registerSession(String sessionIdOrToken, int userId, String userName, String userEmail, HttpSession session) {
        if (sessionIdOrToken != null && !sessionIdOrToken.trim().isEmpty()) {
            activeSessions.put(sessionIdOrToken.trim(), new SessionData(userId, userName, userEmail, session));
        }
    }

    public static SessionData getSessionData(String sessionIdOrToken) {
        if (sessionIdOrToken == null || sessionIdOrToken.trim().isEmpty()) return null;
        return activeSessions.get(sessionIdOrToken.trim());
    }

    public static void removeSession(String sessionIdOrToken) {
        if (sessionIdOrToken != null) {
            activeSessions.remove(sessionIdOrToken.trim());
        }
    }

    public static void clear() {
        activeSessions.clear();
    }
}
