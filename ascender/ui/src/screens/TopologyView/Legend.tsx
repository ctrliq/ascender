/* eslint i18next/no-literal-string: "off" */
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Button as PFButton,
  DescriptionList as PFDescriptionList,
  DescriptionListTerm,
  DescriptionListGroup as PFDescriptionListGroup,
  DescriptionListDescription as PFDescriptionListDescription,
  Divider,
  Content,
  ContentVariants,
} from '@patternfly/react-core';

import {
  ExclamationIcon,
  CheckIcon,
  OutlinedClockIcon,
  PlusIcon,
  MinusIcon,
} from '@patternfly/react-icons';
import './Legend.css';

function Legend() {
  const { t } = useLingui();
  return (
    <div className="awx-legend__wrapper legend" data-cy="legend">
      <Content>
        <Content
          className="awx-legend__text"
          component={ContentVariants.small}
          style={{
            fontWeight: 'bold',
            color: 'var(--pf-t--global--text--color--100)',
            marginTop: 0,
          }}
        >
          {t`Legend`}
        </Content>
        <Divider component="div" />
        <Content
          className="awx-legend__text"
          component={ContentVariants.small}
        >{t`Node types`}</Content>
      </Content>
      <PFDescriptionList
        className="awx-legend__description-list"
        isHorizontal
        isFluid
      >
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <PFButton className="awx-legend__button" size="sm">
              C
            </PFButton>
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">
            {t`Control node`}
          </PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <PFButton
              className="awx-legend__button"
              variant="primary"
              size="sm"
            >
              Ex
            </PFButton>
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">
            {t`Execution node`}
          </PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <PFButton
              className="awx-legend__button"
              variant="primary"
              size="sm"
            >
              Hy
            </PFButton>
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">
            {t`Hybrid node`}
          </PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <PFButton
              className="awx-legend__button"
              variant="primary"
              size="sm"
            >
              h
            </PFButton>
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">{t`Hop node`}</PFDescriptionListDescription>
        </PFDescriptionListGroup>
      </PFDescriptionList>
      <Content>
        <Content
          className="awx-legend__text"
          component={ContentVariants.small}
        >{t`Node state types`}</Content>
      </Content>
      <PFDescriptionList
        className="awx-legend__description-list"
        isHorizontal
        isFluid
      >
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <PFButton
              className="awx-legend__button"
              icon={
                <CheckIcon
                  style={{ fill: 'white', marginLeft: '2px', marginTop: '3px' }}
                />
              }
              size="sm"
              style={{ backgroundColor: '#3E8635' }}
            />
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">{t`Ready`}</PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <PFButton
              className="awx-legend__button"
              icon={
                <OutlinedClockIcon
                  style={{ fill: 'white', marginLeft: '3px', marginTop: '3px' }}
                />
              }
              size="sm"
              style={{ backgroundColor: '#0066CC' }}
            />
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">
            {t`Installed`}
          </PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <PFButton
              className="awx-legend__button"
              icon={
                <PlusIcon
                  style={{ fill: 'white', marginLeft: '3px', marginTop: '3px' }}
                />
              }
              size="sm"
              style={{ backgroundColor: '#6A6E73' }}
            />
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">
            {t`Provisioning`}
          </PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <PFButton
              className="awx-legend__button"
              icon={
                <MinusIcon
                  style={{ fill: 'white', marginLeft: '3px', marginTop: '3px' }}
                />
              }
              size="sm"
              style={{ backgroundColor: '#6A6E73' }}
            />
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">
            {t`Deprovisioning`}
          </PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <PFButton
              className="awx-legend__button"
              icon={
                <ExclamationIcon
                  style={{ fill: 'white', marginLeft: '3px', marginTop: '3px' }}
                />
              }
              size="sm"
              style={{ backgroundColor: '#C9190B' }}
            />
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">{t`Error`}</PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
              <circle
                r="9"
                cx="10"
                cy="10"
                fill="transparent"
                strokeWidth="1px"
                style={{
                  stroke: 'var(--pf-t--global--border--color--default)',
                }}
              />
              <text
                x="10"
                y="10"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: 'var(--pf-t--global--text--color--100)' }}
                fontSize="11px"
                fontFamily="inherit"
                fontWeight="400"
              >
                C
              </text>
            </svg>
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">{t`Enabled`}</PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
              <circle
                r="9"
                cx="10"
                cy="10"
                fill="transparent"
                strokeDasharray="5"
                strokeWidth="1px"
                style={{
                  stroke: 'var(--pf-t--global--border--color--default)',
                }}
              />
              <text
                x="10"
                y="10"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: 'var(--pf-t--global--text--color--100)' }}
                fontSize="11px"
                fontFamily="inherit"
                fontWeight="400"
              >
                C
              </text>
            </svg>
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">{t`Disabled`}</PFDescriptionListDescription>
        </PFDescriptionListGroup>
      </PFDescriptionList>
      <Content>
        <Content
          className="awx-legend__text"
          component={ContentVariants.small}
        >{t`Link state types`}</Content>
      </Content>
      <PFDescriptionList
        className="awx-legend__description-list"
        isHorizontal
        isFluid
      >
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <svg width="20" height="15" xmlns="http://www.w3.org/2000/svg">
              <line
                x1="0"
                y1="9"
                x2="20"
                y2="9"
                stroke="#6A6E73"
                strokeWidth="4"
              />
            </svg>
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">
            {t`Established`}
          </PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <svg width="20" height="15" xmlns="http://www.w3.org/2000/svg">
              <line
                x1="0"
                y1="9"
                x2="20"
                y2="9"
                stroke="#3E8635"
                strokeWidth="4"
                strokeDasharray="6"
              />
            </svg>
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">{t`Adding`}</PFDescriptionListDescription>
        </PFDescriptionListGroup>
        <PFDescriptionListGroup className="awx-legend__description-list-group">
          <DescriptionListTerm>
            <svg width="20" height="15" xmlns="http://www.w3.org/2000/svg">
              <line
                x1="0"
                y1="9"
                x2="20"
                y2="9"
                stroke="#C9190B"
                strokeWidth="4"
                strokeDasharray="6"
              />
            </svg>
          </DescriptionListTerm>
          <PFDescriptionListDescription className="awx-legend__description-list-description">{t`Removing`}</PFDescriptionListDescription>
        </PFDescriptionListGroup>
      </PFDescriptionList>
    </div>
  );
}

export default Legend;
