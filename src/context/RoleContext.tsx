/**
 * RoleContext - Client-side role state management
 *
 * SECURITY MODEL:
 * - Production: Role is resolved server-side via /api/auth/role endpoint
 *   using the verified Firebase ID token. The client NEVER determines
 *   or stores the role locally; it's fetched from the authoritative backend.
 * - Demo mode: Role is resolved from DemoContext (local synthetic data only).
 *   Demo role switching is CLIENT-SIDE ONLY and never affects production authorization.
 *
 * PRIVILEGE ESCALATION PREVENTION:
 * - Role is never written to localStorage (unlike demo workspace data)
 * - Role is never accepted from client-side input
 * - Role is always derived from backend response or demo context
 * - Missing role defaults to 'user' (fail-safe)
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useAuth } from "./AuthContext";
import { useDemo, useIsDemoSession } from "../demo";
import type { UserRole, RoleInfo } from "../types/rbac";
import { DEFAULT_USER_ROLE, getAccessScope } from "../types/rbac";

interface RoleContextType {
  /** Current resolved role */
  role: UserRole;

  /** Whether role has been resolved (prevents flash of wrong content) */
  roleResolved: boolean;

  /** Whether the current user is an admin */
  isAdmin: boolean;

  /** Full role info for display */
  roleInfo: RoleInfo;

  /** Whether role resolution is in progress */
  loading: boolean;

  /** Error from role resolution (production only) */
  error: string | null;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

/**
 * RoleProvider - Resolves and provides the current user's role
 *
 * In production: fetches role from backend via /api/auth/role
 * In demo mode: uses role from DemoContext
 */
export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, getIdToken } = useAuth();
  const { isDemoSession, demoRole } = useDemo();
  const [role, setRole] = useState<UserRole>(DEFAULT_USER_ROLE);
  const [roleResolved, setRoleResolved] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve role from backend in production
  const fetchRoleFromBackend = useCallback(async () => {
    if (!user || isDemoSession) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getIdToken(false);
      if (!token) {
        // No token available — fail to default user role
        console.warn(
          "[RoleContext] Unable to acquire ID token. Defaulting to user role.",
        );
        setRole(DEFAULT_USER_ROLE);
        setRoleResolved(true);
        setLoading(false);
        return;
      }

      const response = await fetch('/api/auth/role', {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Server-side rejection — fail to default user role (fail-safe)
        console.warn(
          `[RoleContext] Role resolution failed (HTTP ${response.status}). Defaulting to user role.`,
        );
        setRole(DEFAULT_USER_ROLE);
        setRoleResolved(true);
        setLoading(false);
        return;
      }

      const data = await response.json();

      // Validate the response shape (defense-in-depth)
      if (
        data &&
        typeof data.role === "string" &&
        (data.role === "user" || data.role === "admin")
      ) {
        setRole(data.role as UserRole);
      } else {
        // Invalid response shape — fail to default user role
        console.warn(
          "[RoleContext] Invalid role response shape. Defaulting to user role.",
        );
        setRole(DEFAULT_USER_ROLE);
      }

      setRoleResolved(true);
    } catch (err: any) {
      // Network or parsing error — fail to default user role (fail-safe)
      console.warn(
        "[RoleContext] Role resolution error. Defaulting to user role.",
        err,
      );
      setRole(DEFAULT_USER_ROLE);
      setRoleResolved(true);
      setError(err?.message || "Role resolution failed");
    } finally {
      setLoading(false);
    }
  }, [user, isDemoSession, getIdToken]);

  // Resolve role when auth state changes (production) or demo session changes
  useEffect(() => {
    // DEMO MODE OVERRIDE: When VITE_DEMO_MODE === 'true' and in an active demo
    // session, always resolve the client-side UI role to 'admin'.
    //
    // This is a CLIENT-SIDE PRESENTATION OVERRIDE ONLY so the Admin Console
    // renders directly for demonstrations. It NEVER affects backend authorization:
    // requireAdmin still resolves roles from ADMIN_EMAIL_ALLOWLIST server-side.
    if (isDemoSession) {
      setRole('admin');
      setRoleResolved(true);
      return;
    }

    if (user) {
      fetchRoleFromBackend();
    } else {
      // Not authenticated — default role
      setRole(DEFAULT_USER_ROLE);
      setRoleResolved(true);
    }
  }, [user, isDemoSession, demoRole, fetchRoleFromBackend]);

  const isAdmin = role === "admin";

  const roleInfo: RoleInfo = useMemo(
    () => ({
      role,
      isAdmin,
      authorizationVerified: roleResolved && !error,
      accessScope: getAccessScope(role),
    }),
    [role, isAdmin, roleResolved, error],
  );

  const value: RoleContextType = useMemo(
    () => ({
      role,
      roleResolved,
      isAdmin,
      roleInfo,
      loading,
      error,
    }),
    [role, roleResolved, isAdmin, roleInfo, loading, error],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};

/**
 * Hook to access role context
 */
export function useRole(): RoleContextType {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}
