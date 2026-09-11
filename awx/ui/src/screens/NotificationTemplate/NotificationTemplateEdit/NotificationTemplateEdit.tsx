import type { Untyped } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { CardBody } from 'components/Card';
import { NotificationTemplatesAPI } from 'api';
import NotificationTemplateForm from '../shared/NotificationTemplateForm';

export interface NotificationTemplateEditProps {
  template: Untyped;
  defaultMessages: Untyped;
  [key: string]: unknown;
}

function NotificationTemplateEdit({
  template,
  defaultMessages,
}: NotificationTemplateEditProps) {
  const detailsUrl = `/notification_templates/${template.id}/details`;
  const navigate = useNavigate();
  const [formError, setFormError] = useState<unknown>(null);

  const handleSubmit = async (values: Untyped) => {
    try {
      await NotificationTemplatesAPI.update(template.id, values);
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
      <NotificationTemplateForm
        template={template}
        defaultMessages={defaultMessages}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        submitError={formError}
      />
    </CardBody>
  );
}

export { NotificationTemplateEdit as _NotificationTemplateEdit };
export default NotificationTemplateEdit;
