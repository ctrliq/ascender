import React from 'react';

import { useField } from 'formik';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import styled from 'styled-components';
import { Title } from '@patternfly/react-core';
import SelectableCard from 'components/SelectableCard';

const Grid = styled.div`
  display: grid;
  grid-auto-rows: 100px;
  grid-gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  margin: 20px 0px;
  width: 100%;
`;

function RunStep() {
  const { i18n } = useLingui();
  const [field, , helpers] = useField('linkType');
  return (
    <>
      <Title headingLevel="h1" size="xl">
        {i18n._(msg`Run`)}
      </Title>
      <p>
        {i18n._(
          msg`Specify the conditions under which this node should be executed`
        )}
      </p>
      <Grid>
        <SelectableCard
          id="link-type-success"
          isSelected={field.value === 'success'}
          label={i18n._(msg`On Success`)}
          description={i18n._(
            msg`Execute when the parent node results in a successful state.`
          )}
          onClick={() => helpers.setValue('success')}
        />
        <SelectableCard
          id="link-type-failure"
          isSelected={field.value === 'failure'}
          label={i18n._(msg`On Failure`)}
          description={i18n._(
            msg`Execute when the parent node results in a failure state.`
          )}
          onClick={() => helpers.setValue('failure')}
        />
        <SelectableCard
          id="link-type-always"
          isSelected={field.value === 'always'}
          label={i18n._(msg`Always`)}
          description={i18n._(
            msg`Execute regardless of the parent node's final state.`
          )}
          onClick={() => helpers.setValue('always')}
        />
      </Grid>
    </>
  );
}
export default RunStep;
