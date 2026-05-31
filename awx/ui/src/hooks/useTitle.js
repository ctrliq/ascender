import { useEffect } from 'react';
import { useConfig } from 'contexts/Config';
import useBrandName from './useBrandName';

const TITLE_CACHE_KEY = 'awx_custom_title';

export default function useTitle(title) {
  const { custom_title } = useConfig();
  const brandName = useBrandName();

  // Once config has loaded, persist the resolved custom_title to localStorage so
  // that subsequent page loads can use it immediately — before the config API
  // call completes — avoiding a flash of the previous tab title.
  useEffect(() => {
    if (custom_title !== undefined) {
      if (custom_title) {
        localStorage.setItem(TITLE_CACHE_KEY, custom_title);
      } else {
        localStorage.removeItem(TITLE_CACHE_KEY);
      }
    }
  }, [custom_title]);

  const configLoaded = custom_title !== undefined;
  const cachedTitle = localStorage.getItem(TITLE_CACHE_KEY);
  // Allow the title to be set immediately when a cached value from a previous
  // load is available, even while the current config fetch is in-flight.
  const canSetTitle = configLoaded || cachedTitle !== null;
  const effectiveName = configLoaded
    ? custom_title || brandName
    : cachedTitle || brandName;

  useEffect(() => {
    if (!canSetTitle || !effectiveName) return;
    document.title = title ? `${effectiveName} | ${title}` : effectiveName;
  }, [title, effectiveName, canSetTitle]);
}
