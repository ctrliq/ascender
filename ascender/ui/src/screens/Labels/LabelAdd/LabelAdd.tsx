import React, { useState } from 'react';
import { Card, PageSection } from '@patternfly/react-core';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { LabelsAPI } from 'api';
import LabelForm from '../shared/LabelForm';
import type { LabelFormValues } from '../shared/LabelForm';

function LabelAdd() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<unknown>(null);

  const handleSubmit = async (values: LabelFormValues) => {
    try {
      // The lookup holds the whole organization; the api wants its id.
      await LabelsAPI.create({
        name: values.name,
        organization: values.organization?.id,
      });
      navigate('/labels');
    } catch (error) {
      setSubmitError(error);
    }
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <LabelForm
            onSubmit={handleSubmit}
            submitError={submitError}
            onCancel={() => navigate('/labels')}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default LabelAdd;
