import React, { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import NotificationTemplateList from './NotificationTemplateList';
import NotificationTemplateAdd from './NotificationTemplateAdd';
import NotificationTemplate from './NotificationTemplate';

function NotificationTemplates() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/notification_templates': t`Notification Templates`,
    '/notification_templates/add': t`Create New Notification Template`,
  });

  const updateBreadcrumbConfig = useCallback((notification) => {
    const { id } = notification;
    setBreadcrumbConfig({
      '/notification_templates': t`Notification Templates`,
      '/notification_templates/add': t`Create New Notification Template`,
      [`/notification_templates/${id}`]: notification.name,
      [`/notification_templates/${id}/edit`]: t`Edit Details`,
      [`/notification_templates/${id}/details`]: t`Details`,
    });
  }, [t]);

  return (
    <>
      <ScreenHeader
        streamType="notification_template"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route
          path="add"
          element={<NotificationTemplateAdd />}
        />
        {/* so the nested <NotificationTemplate> route tree can match the rest */}
        <Route
          path=":id/*"
          element={
            <NotificationTemplate setBreadcrumb={updateBreadcrumbConfig} />
          }
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="notificationTemplates">
              <NotificationTemplateList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export default NotificationTemplates;
