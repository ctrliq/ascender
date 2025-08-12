import React from 'react';
import { PageSection } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import LabelLists from 'components/LabelLists/LabelLists';

function Labels() {
  const { t } = useLingui();
  return (
    <>
      <ScreenHeader
        streamType="label"
        breadcrumbConfig={{ '/labels': t`Labels` }}
      />
      <PageSection>
        <LabelLists />
      </PageSection>
    </>
  );
}

export default Labels;
