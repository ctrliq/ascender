import React from 'react';
import styled, { css } from 'styled-components';
import {
  Pagination as PFPagination,
  DropdownDirection,
} from '@patternfly/react-core';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

const AWXPagination = styled(PFPagination)`
  ${(props) =>
    props.perPageOptions &&
    !props.perPageOptions.length &&
    css`
      .pf-c-options-menu__toggle-button {
        display: none;
      }
    `}
`;

export default (props) => {
  const { i18n } = useLingui();
  return (
    <AWXPagination
      ouiaId="pagination"
      titles={{
        items: i18n._(msg`items`),
        page: i18n._(msg`page`),
        pages: i18n._(msg`pages`),
        itemsPerPage: i18n._(msg`Items per page`),
        perPageSuffix: i18n._(msg`per page`),
        toFirstPage: i18n._(msg`Go to first page`),
        toPreviousPage: i18n._(msg`Go to previous page`),
        toLastPage: i18n._(msg`Go to last page`),
        toNextPage: i18n._(msg`Go to next page`),
        optionsToggle: i18n._(msg`Select`),
        currPage: i18n._(msg`Current page`),
        paginationTitle: i18n._(msg`Pagination`),
        ofWord: i18n._(msg`of`),
      }}
      dropDirection={DropdownDirection.up}
      {...props}
    />
  );
};
