import type { User } from 'types/api';
import React from 'react';
import UserOrganizationList from './UserOrganizationList';

export interface UserOrganizationsProps {
  /** The user whose organizations these are, as the user's page read it. */
  user?: User;
}

function UserOrganizations({ user }: UserOrganizationsProps) {
  return <UserOrganizationList user={user} />;
}
export default UserOrganizations;
