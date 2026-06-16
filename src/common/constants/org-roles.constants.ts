export type OrgRole = 'member' | 'admin' | 'owner';

/** Roles allowed to manage other members' resources (e.g. edit/delete any comment). */
export const ORG_ADMIN_ROLES: readonly OrgRole[] = ['owner', 'admin'];

export function isOrgAdminRole(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && (ORG_ADMIN_ROLES as readonly string[]).includes(role);
}
