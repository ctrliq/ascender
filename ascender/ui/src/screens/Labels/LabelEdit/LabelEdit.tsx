import type { DetailedError, Label } from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, PageSection } from '@patternfly/react-core';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import { CardBody } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import useRequest from 'hooks/useRequest';
import { LabelsAPI } from 'api';
import { useConfig } from 'contexts/Config';
import {
  canChangeLabel,
  readAdministeredOrganizationIds,
} from 'components/LabelLists/labelAccess';
import LabelForm from '../shared/LabelForm';
import type { LabelFormValues } from '../shared/LabelForm';

export interface LabelEditProps {
  /** Lets the screen name the crumb once the label is known. */
  setBreadcrumb?: (label: Label) => void;
}

function LabelEdit({ setBreadcrumb }: LabelEditProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { id } = useParams();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const { me } = useConfig();
  const meId = me?.id;
  const isSuperuser = Boolean(me?.is_superuser);

  /*
   * Whether the form may be offered is read with the label, since the api
   * decides it by the label's organization: a superuser may change any label,
   * anyone else only one whose organization they administer.
   */
  const {
    result: { label, canEdit },
    error: contentError,
    isLoading,
    request: fetchLabel,
  } = useRequest(
    useCallback(async () => {
      const [{ data }, adminOrgIds] = await Promise.all([
        LabelsAPI.readDetail(Number(id)),
        readAdministeredOrganizationIds({
          id: meId,
          is_superuser: isSuperuser,
        }),
      ]);
      return {
        label: data as Label,
        canEdit: canChangeLabel(
          { is_superuser: isSuperuser },
          adminOrgIds,
          data as Label
        ),
      };
    }, [id, meId, isSuperuser]),
    { label: null as Label | null, canEdit: false }
  );

  useEffect(() => {
    fetchLabel();
  }, [fetchLabel]);

  useEffect(() => {
    if (label && setBreadcrumb) {
      setBreadcrumb(label);
    }
  }, [label, setBreadcrumb]);

  const handleSubmit = async (values: LabelFormValues) => {
    try {
      await LabelsAPI.update(Number(id), {
        name: values.name,
        organization: values.organization?.id,
      });
      navigate('/labels');
    } catch (error) {
      setSubmitError(error);
    }
  };

  /*
   * One loading animation, in the place the content will be. Drawn inside the
   * card it made the page arrive in pieces: an empty card first, an animation
   * inside it, then the form. Asked with the label rather than on its own, so a
   * later read does not throw away a page already drawn. The first render,
   * before the read has even begun, counts as loading too: there is neither
   * a label nor an error yet, and drawing the card then was the empty flash.
   */
  if (!label && (isLoading || !contentError)) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  /*
   * Someone reaching this address who may not change the label goes back to
   * the list, the way a template's edit page sends them to its details: the
   * form would only have ended in 403. Labels have no details page of their
   * own, so the list is where they are shown.
   */
  if (label && !contentError && !canEdit) {
    return <Navigate to="/labels" replace />;
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          {Boolean(contentError) && (
            <ContentError error={contentError}>
              {(contentError as DetailedError).response?.status === 404 && (
                <span>
                  {t`Label not found.`}{' '}
                  <Link to="/labels">{t`View all Labels.`}</Link>
                </span>
              )}
            </ContentError>
          )}
          {!contentError && label && (
            <LabelForm
              label={label}
              onSubmit={handleSubmit}
              submitError={submitError}
              onCancel={() => navigate('/labels')}
            />
          )}
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default LabelEdit;
