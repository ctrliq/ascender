import type { QSConfig, QSParams } from 'util/qs';
import { getQSConfig } from 'util/qs';

/**
 * Query string configuration for the Jobs list.  Kept in one place so the list,
 * the stack name links and the stack cancel request all agree on the namespace,
 * defaults and sortable fields.
 */
export function getJobListQSConfig(defaultParams?: QSParams): QSConfig {
  return getQSConfig(
    'job',
    {
      page: 1,
      page_size: 20,
      order_by: '-finished',
      not__launch_type: 'sync',
      ...defaultParams,
    },
    ['id', 'page', 'page_size'],
    ['created', 'modified', 'finished']
  );
}

export default getJobListQSConfig;
