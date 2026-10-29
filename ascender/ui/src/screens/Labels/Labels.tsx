import type { Label } from 'types/api';
import React, { useCallback, useState } from 'react';
import { PageSection } from '@patternfly/react-core';
import { Route, Routes } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import LabelLists from 'components/LabelLists/LabelLists';
import LabelAdd from './LabelAdd';
import LabelEdit from './LabelEdit';

function Labels() {
  const { t } = useLingui();
  // The edited label's name, so the crumb reads as the label rather than its id.
  const [breadcrumbConfig, setBreadcrumbConfig] = useState<
    Record<string, string>
  >({});

  const buildBreadcrumbConfig = useCallback(
    (label: Label) => {
      if (!label) {
        return;
      }
      setBreadcrumbConfig({
        [`/labels/${label.id}/edit`]: t`Edit ${label.name}`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader
        streamType="label"
        breadcrumbConfig={{
          '/labels': t`Labels`,
          '/labels/add': t`Create New Label`,
          ...breadcrumbConfig,
        }}
      />
      <Routes>
        <Route path="add" element={<LabelAdd />} />
        <Route
          path=":id/edit"
          element={<LabelEdit setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          path="*"
          element={
            <PageSection hasBodyWrapper={false}>
              <LabelLists />
            </PageSection>
          }
        />
      </Routes>
    </>
  );
}

export default Labels;
