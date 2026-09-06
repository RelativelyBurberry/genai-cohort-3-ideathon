/**
 * RBAC Types - Minimal Role-Based Access Control for Reflectra Demo
 * 
 * SECURITY: These types define the authorization boundary.
 * Role assignment MUST be server-authoritative (custom claims or backend metadata).
 * Client-side role values are NEVER trusted for authorization decisions.
 */

export type UserRole = 'user' | 'admin';

export interface RoleInfo {
  role: UserRole;
  isAdmin: boolean;
  authorizationVerified: boolean;
  accessScope: 'personal' | 'administrative';
}

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
}

/**
 * Determines access scope from role
 */
export function getAccessScope(role: UserRole): 'personal' | 'administrative' {
  return role === 'admin' ? 'administrative' : 'personal';
}

/**
 * Checks if a role has admin privileges
 */
export function isAdminRole(role: UserRole): boolean {
  return role === 'admin';
}

/**
 * Default role for authenticated users (fail-safe: never admin)
 */
export const DEFAULT_USER_ROLE: UserRole = 'user';

/**
 * Role display labels for UI
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'USER',
  admin: 'ADMIN',
};

/**
 * Access scope display labels for UI
 */
export const ACCESS_SCOPE_LABELS: Record<'personal' | 'administrative', string> = {
  personal: 'Personal reflections only',
  administrative: 'Administrative demo controls',
};