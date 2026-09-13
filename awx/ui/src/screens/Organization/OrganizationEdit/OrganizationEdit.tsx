import type { Organization, SummaryFieldRef } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { CardBody } from 'components/Card';
import { OrganizationsAPI } from 'api';
import OrganizationForm from '../shared/OrganizationForm';
import type { OrganizationFormValues } from '../shared/OrganizationForm';

/** Whether both lists name the same rows, in the same order. */
const isEqual = (array1: SummaryFieldRef[], array2: SummaryFieldRef[]) =>
  array1.length === array2.length &&
  array1.every((element, index) => element.id === array2[index]?.id);

export interface OrganizationEditProps {
  organization: Organization;
}

function OrganizationEdit({ organization }: OrganizationEditProps) {
  const detailsUrl = `/organizations/${organization.id}/details`;
  const navigate = useNavigate();
  const [formError, setFormError] = useState<unknown>(null);

  const handleSubmit = async (
    values: OrganizationFormValues,
    groupsToAssociate: SummaryFieldRef[],
    groupsToDisassociate: SummaryFieldRef[]
  ) => {
    try {
      await OrganizationsAPI.update(organization.id, {
        ...values,
        default_environment: values.default_environment?.id || null,
      });
      await OrganizationsAPI.orderInstanceGroups(
        organization.id,
        groupsToAssociate,
        groupsToDisassociate
      );

      /* eslint-disable no-await-in-loop, no-restricted-syntax */
      // Resolve Promises sequentially to avoid race condition
      if (
        !isEqual(
          organization.galaxy_credentials ?? [],
          values.galaxy_credentials
        )
      ) {
        for (const credential of organization.galaxy_credentials ?? []) {
          await OrganizationsAPI.disassociateGalaxyCredential(
            organization.id,
            credential.id
          );
        }
        for (const credential of values.galaxy_credentials) {
          await OrganizationsAPI.associateGalaxyCredential(
            organization.id,
            credential.id
          );
        }
      }
      /* eslint-enable no-await-in-loop, no-restricted-syntax */
      navigate(detailsUrl);
    } catch (error) {
      setFormError(error);
    }
  };

  const handleCancel = () => {
    navigate(detailsUrl);
  };

  return (
    <CardBody>
      <OrganizationForm
        organization={organization}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        submitError={formError}
      />
    </CardBody>
  );
}

export { OrganizationEdit as _OrganizationEdit };
export default OrganizationEdit;
