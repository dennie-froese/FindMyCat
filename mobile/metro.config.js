const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Hardening: Strip verbose debug and info console statements in production builds
// to prevent accidental PII / GPS coordinate leakage in device system logs.
// console.error and console.warn are preserved for crash reporting and diagnostics.
config.transformer.minifierConfig = {
  ...config.transformer.minifierConfig,
  compress: {
    ...config.transformer.minifierConfig?.compress,
    pure_funcs: ['console.log', 'console.debug', 'console.info'],
  },
};

module.exports = config;
