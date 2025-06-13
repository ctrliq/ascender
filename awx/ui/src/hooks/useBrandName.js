import { useEffect, useState } from 'react';
import { RootAPI } from 'api';

export default function useBrandName() {
  const [brandName, setBrandName] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function fetchBrandName() {
      const {
        data: { BRAND_NAME },
      } = await RootAPI.readAssetVariables();
      if (isMounted) {
        setBrandName(BRAND_NAME);
      }
    }
    fetchBrandName();
    return () => {
      isMounted = false;
    };
  }, []);

  return brandName;
}
