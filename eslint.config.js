// Hey Emacs, this is -*- coding: utf-8 -*-

/* eslint-disable @typescript-eslint/no-var-requires */

const config = require('../../utils/configs/base/eslint.config');

module.exports = {
  ...config,
  rules: {
    ...config.rules,
    'no-console': 'off',
    // Consider using eslint-plugin-disable pluggin
    // to disable both react and react-hooks which are pulled
    // by default airbnb config
    'react/static-property-placement': 'off',
    '@typescript-eslint/no-var-requires': 'off',
  },
  settings: {
    ...config.settings,
    react: {
      version: 'latest',
    },
  },
};
