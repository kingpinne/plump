const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Låt Metro titta på monorepots rot
config.watchFolders = [workspaceRoot];

// Säkerställ att moduler resolvas från rätt node_modules
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
  ],
  disableHierarchicalLookup: true,
};

module.exports = config;
