const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The driver and guardian web share the Santiago date/turn calculation.
config.watchFolders = [path.resolve(__dirname, '../../shared')];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../../node_modules'),
];
module.exports = config;
