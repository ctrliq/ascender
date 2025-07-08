import React from 'react';
import { PageSection } from '@patternfly/react-core';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import LabelLists from 'components/LabelLists/LabelLists';

function Labels() {
  const { i18n } = useLingui();
  return (
    <>
      <ScreenHeader
        streamType="label"
        breadcrumbConfig={{ '/labels': i18n._(msg`Labels`) }}
      />
      <PageSection>
        <LabelLists />
      </PageSection>
    </>
  );
}

export default Labels;
