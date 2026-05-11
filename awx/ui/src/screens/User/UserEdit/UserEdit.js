import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';

import { CardBody } from 'components/Card';
import { UsersAPI } from 'api';
import { useConfig } from 'contexts/Config';
import { dynamicActivate, locales } from 'i18nLoader';
import UserForm from '../shared/UserForm';

function UserEdit({ user }) {
  const [formSubmitError, setFormSubmitError] = useState(null);
  const { me } = useConfig();
  const history = useHistory();

  const handleSubmit = async (values) => {
    setFormSubmitError(null);
    try {
      delete values.organization;
      await UsersAPI.update(user.id, values);
      if (me?.id === user.id) {
        const lang = values.preferred_language || 'en';
        const resolvedLang = Object.keys(locales).includes(lang) ? lang : 'en';
        localStorage.setItem('preferred_language', resolvedLang);
        await dynamicActivate(resolvedLang);
      }
      history.push(`/users/${user.id}/details`);
    } catch (error) {
      setFormSubmitError(error);
    }
  };

  const handleCancel = () => {
    history.push(`/users/${user.id}/details`);
  };

  return (
    <CardBody>
      <UserForm
        user={user}
        handleCancel={handleCancel}
        handleSubmit={handleSubmit}
        submitError={formSubmitError}
      />
    </CardBody>
  );
}

export default UserEdit;
