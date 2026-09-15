import React from 'react';
import { Pagination as PFPagination } from '@patternfly/react-core';
import type { PaginationProps } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import './Pagination.css';

/**
 * PatternFly's Pagination with the translated labels every list uses, and the
 * per page menu hidden when a list offers no sizes to choose from.
 */
export default function Pagination({
  perPageOptions,
  ...props
}: PaginationProps) {
  const { t } = useLingui();
  return (
    <PFPagination
      className={
        perPageOptions && !perPageOptions.length
          ? 'ascender-pagination--no-page-sizes'
          : undefined
      }
      perPageOptions={perPageOptions}
      ouiaId="pagination"
      titles={{
        items: t`items`,
        page: t`page`,
        pages: t`pages`,
        itemsPerPage: t`Items per page`,
        perPageSuffix: t`per page`,
        toFirstPageAriaLabel: t`Go to first page`,
        toPreviousPageAriaLabel: t`Go to previous page`,
        toLastPageAriaLabel: t`Go to last page`,
        toNextPageAriaLabel: t`Go to next page`,
        optionsToggleAriaLabel: t`Select`,
        currPageAriaLabel: t`Current page`,
        paginationAriaLabel: t`Pagination`,
        ofWord: t`of`,
      }}
      dropDirection="up"
      {...props}
    />
  );
}
