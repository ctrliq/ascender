import type { RolesApiModel, SummaryFieldRef, Untyped } from 'types/api';
import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useMatch } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import {
  JobTemplatesAPI,
  WorkflowJobTemplatesAPI,
  CredentialsAPI,
  InventoriesAPI,
  ProjectsAPI,
  OrganizationsAPI,
  InstanceGroupsAPI,
} from 'api';
import useRequest from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import type { QSParams } from 'util/qs';
import SelectableCard from '../SelectableCard';
import Wizard from '../Wizard/Wizard';
import SelectResourceStep from '../AddRole/SelectResourceStep';
import SelectRoleStep from '../AddRole/SelectRoleStep';

const Grid = styled.div`
  display: grid;
  grid-gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
`;

export interface UserAndTeamAccessAddProps {
  title: Untyped;
  onFetchData: (...args: Untyped[]) => void;
  apiModel: RolesApiModel;
  onClose: (...args: Untyped[]) => void;
  onError: (...args: Untyped[]) => void;
  resourceId: number | string;
  [key: string]: unknown;
}

function UserAndTeamAccessAdd({
  title,
  onFetchData,
  apiModel,
  onClose,
  onError,
  resourceId,
}: UserAndTeamAccessAddProps) {
  const { t } = useLingui();
  const [selectedResourceType, setSelectedResourceType] =
    useState<Untyped>(null);
  const [stepIdReached, setStepIdReached] = useState(1);
  const { id: routeId } = useParams() as { id: string };
  // The caller passes the resource id explicitly (works whether the parent
  // screen uses react-router v5 or v6); fall back to the v5 route param.
  const associationId = resourceId ?? routeId;
  const teamsRouteMatch = useMatch('/teams/:id/roles');

  const {
    selected: resourcesSelected,
    handleSelect: handleResourceSelect,
    clearSelected: clearResourcesSelected,
  } = useSelected<Untyped>([]);

  const {
    selected: rolesSelected,
    handleSelect: handleRoleSelect,
    clearSelected: clearRolesSelected,
  } = useSelected<Untyped>([]);

  const resourceAccessConfig = useMemo(
    () => [
      {
        selectedResource: 'jobTemplate',
        label: t`Job templates`,
        searchColumns: [
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Playbook name`,
            key: 'playbook__icontains',
          },
          {
            name: t`Created By (Username)`,
            key: 'created_by__username__icontains',
          },
          {
            name: t`Modified By (Username)`,
            key: 'modified_by__username__icontains',
          },
        ],
        sortColumns: [
          {
            name: t`Name`,
            key: 'name',
          },
        ],
        fetchItems: (queryParams: QSParams) =>
          JobTemplatesAPI.read(queryParams),
        fetchOptions: () => JobTemplatesAPI.readOptions(),
      },
      {
        selectedResource: 'workflowJobTemplate',
        label: t`Workflow job templates`,
        searchColumns: [
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Playbook name`,
            key: 'playbook__icontains',
          },
          {
            name: t`Created By (Username)`,
            key: 'created_by__username__icontains',
          },
          {
            name: t`Modified By (Username)`,
            key: 'modified_by__username__icontains',
          },
        ],
        sortColumns: [
          {
            name: t`Name`,
            key: 'name',
          },
        ],
        fetchItems: (queryParams: QSParams) =>
          WorkflowJobTemplatesAPI.read(queryParams),
        fetchOptions: () => WorkflowJobTemplatesAPI.readOptions(),
      },
      {
        selectedResource: 'credential',
        label: t`Credentials`,
        searchColumns: [
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Type`,
            key: 'or__scm_type',
            options: [
              [``, t`Manual`],
              [`git`, t`Git`],
              [`svn`, t`Subversion`],
              [`archive`, t`Remote Archive`],
              [`insights`, t`Red Hat Insights`],
            ],
          },
          {
            name: t`Source Control URL`,
            key: 'scm_url__icontains',
          },
          {
            name: t`Modified By (Username)`,
            key: 'modified_by__username__icontains',
          },
          {
            name: t`Created By (Username)`,
            key: 'created_by__username__icontains',
          },
        ],
        sortColumns: [
          {
            name: t`Name`,
            key: 'name',
          },
        ],
        fetchItems: (queryParams: QSParams) => CredentialsAPI.read(queryParams),
        fetchOptions: () => CredentialsAPI.readOptions(),
      },
      {
        selectedResource: 'inventory',
        label: t`Inventories`,
        searchColumns: [
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Created By (Username)`,
            key: 'created_by__username__icontains',
          },
          {
            name: t`Modified By (Username)`,
            key: 'modified_by__username__icontains',
          },
        ],
        sortColumns: [
          {
            name: t`Name`,
            key: 'name',
          },
        ],
        fetchItems: (queryParams: QSParams) => InventoriesAPI.read(queryParams),
        fetchOptions: () => InventoriesAPI.readOptions(),
      },
      {
        selectedResource: 'project',
        label: t`Projects`,
        searchColumns: [
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Type`,
            key: 'or__scm_type',
            options: [
              [``, t`Manual`],
              [`git`, t`Git`],
              [`svn`, t`Subversion`],
              [`archive`, t`Remote Archive`],
              [`insights`, t`Red Hat Insights`],
            ],
          },
          {
            name: t`Source Control URL`,
            key: 'scm_url__icontains',
          },
          {
            name: t`Modified By (Username)`,
            key: 'modified_by__username__icontains',
          },
          {
            name: t`Created By (Username)`,
            key: 'created_by__username__icontains',
          },
        ],
        sortColumns: [
          {
            name: t`Name`,
            key: 'name',
          },
        ],
        fetchItems: (queryParams: QSParams) => ProjectsAPI.read(queryParams),
        fetchOptions: () => ProjectsAPI.readOptions(),
      },
      {
        selectedResource: 'organization',
        label: t`Organizations`,
        searchColumns: [
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Created By (Username)`,
            key: 'created_by__username__icontains',
          },
          {
            name: t`Modified By (Username)`,
            key: 'modified_by__username__icontains',
          },
        ],
        sortColumns: [
          {
            name: t`Name`,
            key: 'name',
          },
        ],
        fetchItems: (queryParams: QSParams) =>
          OrganizationsAPI.read(queryParams),
        fetchOptions: () => OrganizationsAPI.readOptions(),
      },
      {
        selectedResource: 'instanceGroup',
        label: t`Instance Groups`,
        searchColumns: [
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Created By (Username)`,
            key: 'created_by__username__icontains',
          },
          {
            name: t`Modified By (Username)`,
            key: 'modified_by__username__icontains',
          },
        ],
        sortColumns: [
          {
            name: t`Name`,
            key: 'name',
          },
        ],
        fetchItems: (queryParams: QSParams) =>
          InstanceGroupsAPI.read(queryParams),
        fetchOptions: () => InstanceGroupsAPI.readOptions(),
      },
    ],
    [t]
  );

  const { request: handleWizardSave, error: saveError } = useRequest(
    useCallback(async () => {
      const roleRequests: Promise<unknown>[] = [];
      const resourceRolesTypes = resourcesSelected.flatMap(
        (resource: Untyped) =>
          Object.values(
            resource.summary_fields.object_roles as Record<
              string,
              SummaryFieldRef
            >
          )
      );

      rolesSelected.map((role: Untyped) =>
        resourceRolesTypes.forEach((rolename) => {
          if (rolename.name === role.name) {
            roleRequests.push(
              apiModel.associateRole(associationId, rolename.id)
            );
          }
        })
      );

      await Promise.all(roleRequests);
      onFetchData();
    }, [onFetchData, rolesSelected, apiModel, associationId, resourcesSelected])
  );

  // Object roles can be user only, so we remove them when
  // showing role choices for team access
  const selectableRoles = {
    ...resourcesSelected[0]?.summary_fields?.object_roles,
  };
  if (teamsRouteMatch && resourcesSelected[0]?.type === 'organization') {
    Object.keys(selectableRoles).forEach((key) => {
      if (selectableRoles[key].user_only) {
        delete selectableRoles[key];
      }
    });
  }

  const steps = [
    {
      id: 1,
      name: t`Add resource type`,
      component: (
        <Grid>
          {resourceAccessConfig.map((resource) => (
            <SelectableCard
              key={resource.selectedResource}
              isSelected={
                resource.selectedResource ===
                selectedResourceType?.selectedResource
              }
              label={resource.label}
              dataCy={`add-role-${resource.selectedResource}`}
              onClick={() => {
                setSelectedResourceType(resource);
                clearResourcesSelected();
                clearRolesSelected();
              }}
            />
          ))}
        </Grid>
      ),
      enableNext: selectedResourceType !== null,
    },
    {
      id: 2,
      name: t`Select items from list`,
      component: selectedResourceType && (
        <SelectResourceStep
          searchColumns={selectedResourceType.searchColumns}
          sortColumns={selectedResourceType.sortColumns}
          displayKey="name"
          onRowClick={handleResourceSelect}
          fetchItems={selectedResourceType.fetchItems}
          fetchOptions={selectedResourceType.fetchOptions}
          selectedLabel={t`Selected`}
          selectedResourceRows={resourcesSelected}
          sortedColumnKey="username"
        />
      ),
      enableNext: resourcesSelected.length > 0,
      canJumpTo: stepIdReached >= 2,
    },
    {
      id: 3,
      name: t`Select roles to apply`,
      component: resourcesSelected?.length > 0 && (
        <SelectRoleStep
          onRolesClick={handleRoleSelect}
          roles={selectableRoles}
          selectedListKey={
            selectedResourceType === 'users' ? 'username' : 'name'
          }
          selectedListLabel={t`Selected`}
          selectedResourceRows={resourcesSelected}
          selectedRoleRows={rolesSelected}
        />
      ),
      nextButtonText: t`Save`,
      canJumpTo: stepIdReached >= 3,
    },
  ];

  if (saveError) {
    onError(saveError);
    onClose();
  }

  return (
    <Wizard
      isOpen
      title={title}
      steps={steps}
      onClose={onClose}
      onNext={({ id }) =>
        setStepIdReached(stepIdReached < id ? id : stepIdReached)
      }
      onSave={handleWizardSave}
    />
  );
}

export default UserAndTeamAccessAdd;
