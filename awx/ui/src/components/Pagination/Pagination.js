import React from 'react';
import styled, { css } from 'styled-components';
import {
	Pagination as PFPagination
} from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

const AWXPagination = styled(PFPagination)`
  ${(props) =>
    props.perPageOptions &&
    !props.perPageOptions.length &&
    css`
      .pf-v6-c-menu-toggle {
        display: none;
      }
    `}
`;

export default (props) => {
  const { t } = useLingui();
  return (
    <AWXPagination
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
};
