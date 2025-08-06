import React from 'react';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { Flex, FormGroup, TextArea } from '@patternfly/react-core';
import { useConfig } from 'contexts/Config';

function EulaStep() {
  const { i18n } = useLingui();
  const { eula } = useConfig();
  return (
    <Flex
      spaceItems={{ default: 'spaceItemsMd' }}
      direction={{ default: 'column' }}
    >
      <FormGroup fieldId="eula" label={i18n._(t`End User License Agreement`)}>
        <TextArea
          id="eula-container"
          style={{ minHeight: '200px' }}
          resizeOrientation="vertical"
          isReadOnly
        >
          {eula}
        </TextArea>
      </FormGroup>
    </Flex>
  );
}
export default EulaStep;
