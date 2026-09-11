import type { Untyped } from 'types/api';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { PERSISTENT_FILTER_KEY } from '../../constants';

export interface PersistentFiltersProps {
  pageKey: Untyped;
  children: React.ReactNode;
  [key: string]: unknown;
}

export default function PersistentFilters({
  pageKey,
  children,
}: PersistentFiltersProps) {
  const location = useLocation();

  useEffect(() => {
    const filter = {
      pageKey,
      qs: location.search,
    };
    sessionStorage.setItem(PERSISTENT_FILTER_KEY, JSON.stringify(filter));
  }, [location.search, pageKey]);

  return children;
}

export function getPersistentFilters(key: string) {
  const filterString = sessionStorage.getItem(PERSISTENT_FILTER_KEY);
  const filter = filterString ? JSON.parse(filterString) : { qs: '' };

  if (filter.pageKey === key) {
    return filter.qs;
  }
  return '';
}
