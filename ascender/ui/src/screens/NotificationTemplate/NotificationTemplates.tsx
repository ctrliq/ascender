import type { BreadcrumbResource } from 'types/api';
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
    '/notifications': t`Notifications`,
    '/notifications/add': t`Create New Notification Template`,
  });

  const updateBreadcrumbConfig = useCallback(
    (notification?: BreadcrumbResource) => {
      if (!notification) {
        return;
      }
      const { id } = notification;
      setBreadcrumbConfig({
        '/notifications': t`Notifications`,
        '/notifications/add': t`Create New Notification Template`,
        [`/notifications/${id}`]: notification.name,
        [`/notifications/${id}/edit`]: t`Edit ${notification.name}`,
        [`/notifications/${id}/details`]: notification.name,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader
        streamType="notification_template"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route path="add" element={<NotificationTemplateAdd />} />
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
