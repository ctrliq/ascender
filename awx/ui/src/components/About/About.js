//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//

import React from 'react';
import PropTypes from 'prop-types';
import { useLingui } from '@lingui/react/macro';
import { AboutModal } from '@patternfly/react-core';
import useBrandName from 'hooks/useBrandName';

function About({ version, isOpen, onClose }) {
  const { t } = useLingui();
  const brandName = useBrandName();

  const createSpeechBubble = () => {
    let text = '';
    if (typeof brandName === 'string' && brandName.length > 0) {
      text =
        brandName.indexOf('AWX') === -1
          ? `${brandName} Controller ${version}`
          : `${brandName} ${version}`;
    }

    let top = '';
    let bottom = '';

    for (let i = 0; i < text.length; i++) {
      top += '_';
      bottom += '-';
    }

    top = ` __${top}__ \n`;
    text = `<  ${text}  >\n`;
    bottom = ` --${bottom}-- `;

    return top + text + bottom;
  };

  const speechBubble = createSpeechBubble();
  const copyright = t`Copyright`;
  const redHatInc = t`Red Hat, Inc.`;
  const CIQInc = t`Ctrl IQ, Inc.`;
  const currentyear = new Date().getFullYear();
  return (
    <AboutModal
      isOpen={isOpen}
      onClose={onClose}
      productName={brandName}
      trademark=""
      brandImageSrc="static/media/Ascender_logo.svg"
      brandImageAlt={t`Brand Image`}
    >
      <pre>
        {speechBubble}
        {`
          \\
          \\   ^__^
              (oo)\\_______
              (__)      A )\\
                  ||----w |
                  ||     ||
                    `}
      </pre>
      <div style={{ marginTop: 16 }}>
        {copyright} {currentyear} {CIQInc}
        <br />
        {copyright} {currentyear} {redHatInc}
      </div>
    </AboutModal>
  );
}

About.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  version: PropTypes.string,
};

About.defaultProps = {
  isOpen: false,
  version: null,
};

export default About;
