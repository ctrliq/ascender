import { useEffect } from 'react';
import { useConfig } from 'contexts/Config';
import useBrandName from './useBrandName';

export default function useTitle(title) {
  const { custom_title } = useConfig();
  const brandName = useBrandName();
  // custom_title is undefined until the Config context has finished loading.
  // Avoid a flash of the brandName by waiting until we know the final value.
  const configLoaded = custom_title !== undefined;
  const effectiveName = custom_title || brandName;

  useEffect(() => {
    if (!configLoaded) return;
    const prevTitle = document.title;
    if (title) {
      document.title = `${effectiveName} | ${title}`;
    } else {
      document.title = effectiveName;
    }

    return () => {
      document.title = prevTitle;
    };
  }, [title, effectiveName, configLoaded]);
}
