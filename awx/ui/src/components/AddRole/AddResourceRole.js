import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useHistory } from 'react-router-dom';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { TeamsAPI, UsersAPI } from 'api';
import useSelected from 'hooks/useSelected';
import SelectableCard from '../SelectableCard';
import Wizard from '../Wizard';
import SelectResourceStep from './SelectResourceStep';
import SelectRoleStep from './SelectRoleStep';

const readUsers = async (queryParams) =>
  UsersAPI.read(Object.assign(queryParams, { is_superuser: false }));

const readUsersOptions = async () => UsersAPI.readOptions();

const readTeams = async (queryParams) => TeamsAPI.read(queryParams);

const readTeamsOptions = async () => TeamsAPI.readOptions();

const userSearchColumns = (i18n) => [
  {
    name: i18n._(t`Username`),
    key: 'username__icontains',
    isDefault: true,
  },
  {
    name: i18n._(t`First Name`),
    key: 'first_name__icontains',
  },
  {
    name: i18n._(t`Last Name`),
    key: 'last_name__icontains',
  },
];
const userSortColumns = (i18n) => [
  {
    name: i18n._(t`Username`),
    key: 'username',
  },
  {
    name: i18n._(t`First Name`),
    key: 'first_name',
  },
  {
    name: i18n._(t`Last Name`),
    key: 'last_name',
  },
];
const teamSearchColumns = (i18n) => [
  {
    name: i18n._(t`Name`),
    key: 'name__icontains',
    isDefault: true,
  },
  {
    name: i18n._(t`Created By (Username)`),
    key: 'created_by__username',
  },
  {
    name: i18n._(t`Modified By (Username)`),
    key: 'modified_by__username',
  },
];

const teamSortColumns = (i18n) => [
  {
    name: i18n._(t`Name`),
    key: 'name',
  },
];
function AddResourceRole({ onSave, onClose, roles, resource, onError }) {
  const { i18n } = useLingui();
  const history = useHistory();

  const {
    selected: resourcesSelected,
    handleSelect: handleResourceSelect,
    clearSelected: clearResources,
  } = useSelected([]);
  const {
    selected: rolesSelected,
    handleSelect: handleRoleSelect,
    clearSelected: clearRoles,
  } = useSelected([]);

  const [resourceType, setResourceType] = useState(null);
  const [currentStepId, setCurrentStepId] = useState(1);
  const [maxEnabledStep, setMaxEnabledStep] = useState(1);

  useEffect(() => {
    if (currentStepId === 1 && maxEnabledStep > 1) {
      history.push(history.location.pathname);
    }
  }, [currentStepId, history, maxEnabledStep]);

  const handleResourceTypeSelect = (type) => {
    setResourceType(type);
    clearResources();
    clearRoles();
  };

  const handleWizardNext = (step) => {
    setCurrentStepId(step.id);
    setMaxEnabledStep(step.id);
  };

  const handleWizardGoToStep = (step) => {
    setCurrentStepId(step.id);
  };

  const handleWizardSave = async () => {
    try {
      const roleRequests = [];

      for (let i = 0; i < resourcesSelected.length; i++) {
        for (let j = 0; j < rolesSelected.length; j++) {
          if (resourceType === 'users') {
            roleRequests.push(
              UsersAPI.associateRole(
                resourcesSelected[i].id,
                rolesSelected[j].id
              )
            );
          } else if (resourceType === 'teams') {
            roleRequests.push(
              TeamsAPI.associateRole(
                resourcesSelected[i].id,
                rolesSelected[j].id
              )
            );
          }
        }
      }

      await Promise.all(roleRequests);
      onSave();
    } catch (err) {
      onError(err);
      onClose();
    }
  };

  // Object roles can be user only, so we remove them when
  // showing role choices for team access
  const selectableRoles = { ...roles };
  if (resourceType === 'teams') {
    Object.keys(roles).forEach((key) => {
      if (selectableRoles[key].user_only) {
        delete selectableRoles[key];
      }
    });
  }

  let wizardTitle = '';

  switch (resourceType) {
    case 'users':
      wizardTitle = i18n._(t`Add User Roles`);
      break;
    case 'teams':
      wizardTitle = i18n._(t`Add Team Roles`);
      break;
    default:
      wizardTitle = i18n._(t`Add Roles`);
  }

  const steps = [
    {
      id: 1,
      name: i18n._(t`Select a Resource Type`),
      component: (
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <div style={{ width: '100%', marginBottom: '10px' }}>
            {i18n._(
              t`Choose the type of resource that will be receiving new roles.  For example, if you'd like to add new roles to a set of users please choose Users and click Next.  You'll be able to select the specific resources in the next step.`
            )}
          </div>
          <SelectableCard
            isSelected={resourceType === 'users'}
            label={i18n._(t`Users`)}
            ariaLabel={i18n._(t`Users`)}
            dataCy="add-role-users"
            onClick={() => handleResourceTypeSelect('users')}
          />
          {resource?.type === 'team' ||
          (resource?.type === 'credential' &&
            !resource?.organization) ? null : (
            <SelectableCard
              isSelected={resourceType === 'teams'}
              label={i18n._(t`Teams`)}
              ariaLabel={i18n._(t`Teams`)}
              dataCy="add-role-teams"
              onClick={() => handleResourceTypeSelect('teams')}
            />
          )}
        </div>
      ),
      nextButtonText: i18n._(t`Next`),
      enableNext: resourceType !== null,
    },
    {
      id: 2,
      name: i18n._(t`Select Items from List`),
      component: (
        <>
          {resourceType === 'users' && (
            <SelectResourceStep
              searchColumns={userSearchColumns(i18n)}
              sortColumns={userSortColumns(i18n)}
              displayKey="username"
              onRowClick={handleResourceSelect}
              fetchItems={readUsers}
              fetchOptions={readUsersOptions}
              selectedLabel={i18n._(t`Selected`)}
              selectedResourceRows={resourcesSelected}
              sortedColumnKey="username"
            />
          )}
          {resourceType === 'teams' && (
            <SelectResourceStep
              searchColumns={teamSearchColumns(i18n)}
              sortColumns={teamSortColumns(i18n)}
              onRowClick={handleResourceSelect}
              fetchItems={readTeams}
              fetchOptions={readTeamsOptions}
              selectedLabel={i18n._(t`Selected`)}
              selectedResourceRows={resourcesSelected}
            />
          )}
        </>
      ),
      enableNext: resourcesSelected.length > 0,
      nextButtonText: i18n._(t`Next`),
      canJumpTo: maxEnabledStep >= 2,
    },
    {
      id: 3,
      name: i18n._(t`Select Roles to Apply`),
      component: (
        <SelectRoleStep
          onRolesClick={handleRoleSelect}
          roles={selectableRoles}
          selectedListKey={resourceType === 'users' ? 'username' : 'name'}
          selectedListLabel={i18n._(t`Selected`)}
          selectedResourceRows={resourcesSelected}
          selectedRoleRows={rolesSelected}
        />
      ),
      nextButtonText: i18n._(t`Save`),
      enableNext: rolesSelected.length > 0,
      canJumpTo: maxEnabledStep >= 3,
    },
  ];

  const currentStep = steps.find((step) => step.id === currentStepId);

  return (
    <Wizard
      style={{ overflow: 'scroll' }}
      isOpen
      onNext={handleWizardNext}
      onBack={(step) => setCurrentStepId(step.id)}
      onClose={onClose}
      onSave={handleWizardSave}
      onGoToStep={(step) => handleWizardGoToStep(step)}
      steps={steps}
      title={wizardTitle}
      nextButtonText={currentStep.nextButtonText || undefined}
      backButtonText={i18n._(t`Back`)}
      cancelButtonText={i18n._(t`Cancel`)}
    />
  );
}

AddResourceRole.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  roles: PropTypes.shape(),
  resource: PropTypes.shape(),
};

AddResourceRole.defaultProps = {
  roles: {},
  resource: {},
};

export { AddResourceRole as _AddResourceRole };
export default AddResourceRole;
