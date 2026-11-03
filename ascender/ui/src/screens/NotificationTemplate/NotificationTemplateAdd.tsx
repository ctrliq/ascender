import type { DetailedError, SummaryFieldRef } from 'types/api';
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import { Card, PageSection } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import { NotificationTemplatesAPI } from 'api';
import useRequest from 'hooks/useRequest';
import ContentError from 'components/ContentError';
import NotificationTemplateForm from './shared/NotificationTemplateForm';
import type {
  DefaultMessages,
  NotificationTemplateFormValues,
} from './shared/NotificationTemplateForm';

function NotificationTemplateAdd() {
  const { t } = useLingui();
  const navigate = useNavigate();
  /*
   * An organization's Notifications tab sends its organization along, so the
   * template is made in it without the reader picking it again, and Cancel
   * goes back to that tab rather than to every template.
   */
  const { state } = useLocation() as {
    state?: { organization?: SummaryFieldRef } | null;
  };
  const organization = state?.organization ?? null;
  const [formError, setFormError] = useState<unknown>(null);
  const {
    result: defaultMessages,
    error,
    request: fetchDefaultMessages,
  } = useRequest(
    useCallback(async () => {
      const { data } = await NotificationTemplatesAPI.readOptions();
      return data.actions.POST?.messages as unknown as DefaultMessages;
    }, [])
  );

  useEffect(() => {
    fetchDefaultMessages();
  }, [fetchDefaultMessages]);

  const handleSubmit = async (values: NotificationTemplateFormValues) => {
    try {
      const { data } = await NotificationTemplatesAPI.create(values);
      navigate(`/notifications/${data.id}`);
    } catch (err) {
      setFormError(err);
    }
  };

  const handleCancel = () => {
    navigate(
      organization
        ? `/organizations/${organization.id}/notifications`
        : '/notifications'
    );
  };

  if (error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={error}>
            {(error as DetailedError).response?.status === 404 && (
              <span>
                {t`Notification Template not found.`}{' '}
                <Link to="/notifications">{t`View all Notifications.`}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          {defaultMessages && (
            <NotificationTemplateForm
              template={
                organization
                  ? {
                      name: '',
                      description: '',
                      summary_fields: { organization },
                    }
                  : undefined
              }
              defaultMessages={defaultMessages}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              submitError={formError}
            />
          )}
        </CardBody>
      </Card>
    </PageSection>
  );
}

export { NotificationTemplateAdd as _NotificationTemplateAdd };
export default NotificationTemplateAdd;
