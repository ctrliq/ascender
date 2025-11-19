/* eslint i18next/no-literal-string: "off" */
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import {
  Button as PFButton,
  DescriptionList as PFDescriptionList,
  DescriptionListTerm,
  DescriptionListGroup as PFDescriptionListGroup,
  DescriptionListDescription as PFDescriptionListDescription,
  Divider,
  TextContent,
  Text as PFText,
  TextVariants,
} from '@patternfly/react-core';

import {
  LucideIconTriangleAlert,
  LucideIconCheck,
  LucideIconClock,
  LucideIconPlus,
  LucideIconMinus,
} from '@ctrliq/quantic-react';

const Wrapper = styled.div`
  position: absolute;
  left: 0;
  padding: var(--quantic-spacing-4) var(--quantic-spacing-6);
  min-width: 150px;
  background-color: var(--quantic-bg-secondary);
  border-radius: var(--quantic-radius-md);
  overflow: auto;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--quantic-spacing-3);
`;

const Button = styled(PFButton)`
  &&& {
    width: var(--quantic-spacing-5);
    height: var(--quantic-spacing-5);
    border-radius: var(--quantic-radius-sm);
    padding: 0;
    font-size: 10px;
    background-color: var(--quantic-bg-tertiary);
    line-height: 1;
    color: var(--quantic-text-primary);
  }
`;
const DescriptionListDescription = styled(PFDescriptionListDescription)`
  font-size: 11px;
`;
const DescriptionList = styled(PFDescriptionList)`
  gap: 7px;
`;
const DescriptionListGroup = styled(PFDescriptionListGroup)`
  align-items: center;

  .pf-c-button__icon.pf-m-start {
    margin-right: 0;
    vertical-align: middle;
  }
`;
const Text = styled(PFText)`
  margin: 10px 0 5px;
`;

function Legend() {
  const { t } = useLingui();
  return (
    <Wrapper className="legend" data-cy="legend">
      <TextContent>
        <Text
          component={TextVariants.small}
          style={{ fontWeight: 'bold', marginTop: 0 }}
        >
          {t`Legend`}
        </Text>
        <Divider component="div" />
        <Text component={TextVariants.small}>{t`Node types`}</Text>
      </TextContent>
      <DescriptionList isHorizontal isFluid>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <Button isSmall>C</Button>
          </DescriptionListTerm>
          <DescriptionListDescription>
            {t`Control node`}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <Button variant="primary" isSmall>
              Ex
            </Button>
          </DescriptionListTerm>
          <DescriptionListDescription>
            {t`Execution node`}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <Button variant="primary" isSmall>
              Hy
            </Button>
          </DescriptionListTerm>
          <DescriptionListDescription>
            {t`Hybrid node`}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <Button variant="primary" isSmall>
              h
            </Button>
          </DescriptionListTerm>
          <DescriptionListDescription>{t`Hop node`}</DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>
      <TextContent>
        <Text component={TextVariants.small}>{t`Node state types`}</Text>
      </TextContent>
      <DescriptionList isHorizontal isFluid>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <Button
              icon={<LucideIconCheck size={16} />}
              isSmall
              style={{ backgroundColor: 'var(--quantic-color-brand-500)' }}
            />
          </DescriptionListTerm>
          <DescriptionListDescription>{t`Ready`}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <Button
              icon={<LucideIconClock size={16} />}
              isSmall
              style={{ backgroundColor: 'var(--quantic-color-gray-blue-500)' }}
            />
          </DescriptionListTerm>
          <DescriptionListDescription>
            {t`Installed`}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <Button
              icon={<LucideIconPlus size={16} />}
              isSmall
              style={{ backgroundColor: 'var(--quantic-bg-tertiary)' }}
            />
          </DescriptionListTerm>
          <DescriptionListDescription>
            {t`Provisioning`}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <Button
              icon={<LucideIconMinus size={16} />}
              isSmall
              style={{ backgroundColor: 'var(--quantic-bg-tertiary)' }}
            />
          </DescriptionListTerm>
          <DescriptionListDescription>
            {t`Deprovisioning`}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <Button
              icon={<LucideIconTriangleAlert size={16} />}
              isSmall
              style={{ backgroundColor: 'var(--quantic-color-error-700)' }}
            />
          </DescriptionListTerm>
          <DescriptionListDescription>{t`Error`}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
              <circle
                r="9"
                cx="10"
                cy="10"
                fill="transparent"
                strokeWidth="1px"
                stroke="#ccc"
              />
              <text
                x="10"
                y="10"
                textAnchor="middle"
                dominantBaseline="central"
                fill="currentColor"
                fontSize="11px"
                fontFamily="inherit"
                fontWeight="400"
              >
                C
              </text>
            </svg>
          </DescriptionListTerm>
          <DescriptionListDescription>{t`Enabled`}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
              <circle
                r="9"
                cx="10"
                cy="10"
                fill="transparent"
                strokeDasharray="5"
                strokeWidth="1px"
                stroke="#ccc"
              />
              <text
                x="10"
                y="10"
                textAnchor="middle"
                dominantBaseline="central"
                fill="currentColor"
                fontSize="11px"
                fontFamily="inherit"
                fontWeight="400"
              >
                C
              </text>
            </svg>
          </DescriptionListTerm>
          <DescriptionListDescription>{t`Disabled`}</DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>
      <TextContent>
        <Text component={TextVariants.small}>{t`Link state types`}</Text>
      </TextContent>
      <DescriptionList isHorizontal isFluid>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <svg width="20" height="15" xmlns="http://www.w3.org/2000/svg">
              <line
                x1="0"
                y1="9"
                x2="20"
                y2="9"
                stroke="var(--quantic-bg-tertiary)"
                strokeWidth="4"
              />
            </svg>
          </DescriptionListTerm>
          <DescriptionListDescription>
            {t`Established`}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <svg width="20" height="15" xmlns="http://www.w3.org/2000/svg">
              <line
                x1="0"
                y1="9"
                x2="20"
                y2="9"
                stroke="var(--quantic-color-brand-500)"
                strokeWidth="4"
                strokeDasharray="6"
              />
            </svg>
          </DescriptionListTerm>
          <DescriptionListDescription>{t`Adding`}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>
            <svg width="20" height="15" xmlns="http://www.w3.org/2000/svg">
              <line
                x1="0"
                y1="9"
                x2="20"
                y2="9"
                stroke="var(--quantic-color-error-700)"
                strokeWidth="4"
                strokeDasharray="6"
              />
            </svg>
          </DescriptionListTerm>
          <DescriptionListDescription>{t`Removing`}</DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>
    </Wrapper>
  );
}

export default Legend;
