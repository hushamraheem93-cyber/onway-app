const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const localPath = path.resolve(__dirname, ".local");
const localBlockPattern = new RegExp(
  "^" + localPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*"
);

const existingBlockList = config.resolver.blockList;
if (Array.isArray(existingBlockList)) {
  config.resolver.blockList = [...existingBlockList, localBlockPattern];
} else if (existingBlockList instanceof RegExp) {
  config.resolver.blockList = [existingBlockList, localBlockPattern];
} else {
  config.resolver.blockList = [localBlockPattern];
}

module.exports = config;
