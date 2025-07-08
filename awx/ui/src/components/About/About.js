//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//

import React from 'react';
import PropTypes from 'prop-types';
import { msg } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { AboutModal } from '@patternfly/react-core';
import useBrandName from 'hooks/useBrandName';

function About({ version, isOpen, onClose }) {
  const { i18n } = useLingui();
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
  const copyright = i18n._(msg`Copyright`);
  const redHatInc = i18n._(msg`Red Hat, Inc.`);
  const CIQInc = i18n._(msg`Ctrl IQ, Inc.`);

  return (
    <AboutModal
      isOpen={isOpen}
      onClose={onClose}
      productName={brandName}
      trademark=""
      brandImageSrc="static/media/AscenderAuto_logo_h_rev_M.png"
      brandImageAlt={i18n._(msg`Brand Image`)}
      backgroundImageSrc="static/media/CIQ_grayscale_bkgd.jpg"
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
      <div style={{ marginTop: 16, whiteSpace: 'pre-line' }}>
        {copyright} {new Date().getFullYear()} {CIQInc}
        <br />
        {copyright} {new Date().getFullYear()} {redHatInc}
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
