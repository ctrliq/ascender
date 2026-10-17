import React from 'react';
import { Navigate, useSearchParams } from 'react-router';
import type { SettingGroup } from './settingGroups';

interface GroupRedirectProps {
  /** The screen's address, which each group's address sits under. */
  baseURL: string;
  /** The screen's groups, in tab order. */
  groups: SettingGroup[];
}

/**
 * Where the screen's own address lands: on a tab.
 *
 * Appearance and Logging once kept the open tab in a ?tab= query rather than
 * in the path, and links and bookmarks to those addresses are still about, so
 * a query naming one of the screen's groups lands on that group's address. Any
 * other lands on the first tab.
 */
function GroupRedirect({ baseURL, groups }: GroupRedirectProps) {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const group = groups.find(({ id }) => id === tab) ?? groups[0];
  return <Navigate to={`${baseURL}/${group?.id ?? ''}`} replace />;
}

export default GroupRedirect;
