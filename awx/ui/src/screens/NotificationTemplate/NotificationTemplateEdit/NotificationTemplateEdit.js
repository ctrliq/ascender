import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'routerCompat';
import { CardBody } from 'components/Card';
import { NotificationTemplatesAPI } from 'api';
import NotificationTemplateForm from '../shared/NotificationTemplateForm';

function NotificationTemplateEdit({ template, defaultMessages }) {
  const detailsUrl = `/notification_templates/${template.id}/details`;
  const navigate = useNavigate();
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (values) => {
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

NotificationTemplateEdit.propTypes = {
  template: PropTypes.shape().isRequired,
};

export { NotificationTemplateEdit as _NotificationTemplateEdit };
export default NotificationTemplateEdit;
