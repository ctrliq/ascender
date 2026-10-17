import type { Role } from 'types/api';

/**
 * Where the object a role is granted on lives.
 *
 * A role names its object by type and id, and the screens address their objects
 * by a path built from the same two: templates and inventories under their own
 * section, everything else at the plural of its type. Null where the role is on
 * nothing, which is what a system role is.
 */
export default function roleResourceUrl(role: Role): string | null {
  const { resource_id: resourceId, resource_type: resourceType } =
    role?.summary_fields || {};

  if (!resourceType || !resourceId) {
    return null;
  }

  if (resourceType.includes('template')) {
    return `/templates/${resourceType}/${resourceId}/details`;
  }
  if (resourceType.includes('inventory')) {
    return `/inventories/${resourceType}/${resourceId}/details`;
  }
  // A container group's role names it as an instance_group, with nothing to
  // tell the two apart, so it is sent to /instance_groups like the rest. The
  // instance group screen sends a container group on to its own address.
  return `/${resourceType}s/${resourceId}/details`;
}
