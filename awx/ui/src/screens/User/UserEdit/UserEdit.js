import React, { useState } from 'react';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { UsersAPI } from 'api';
import { useConfig } from 'contexts/Config';
import { dynamicActivate, locales } from 'i18nLoader';
import UserForm from '../shared/UserForm';

function UserEdit({ user }) {
  const [formSubmitError, setFormSubmitError] = useState(null);
  const { me } = useConfig();
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    setFormSubmitError(null);
    try {
      delete values.organization;
      await UsersAPI.update(user.id, values);
      if (me?.id === user.id) {
        const lang = values.preferred_language;
        if (lang && Object.keys(locales).includes(lang)) {
          localStorage.setItem('preferred_language', lang);
          await dynamicActivate(lang);
        } else {
          localStorage.removeItem('preferred_language');
          const browserLang = (navigator.language || '').toLowerCase().split(/[_-]+/)[0];
          await dynamicActivate(Object.keys(locales).includes(browserLang) ? browserLang : 'en');
        }
      }
      navigate(`/users/${user.id}/details`);
    } catch (error) {
      setFormSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(`/users/${user.id}/details`);
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
