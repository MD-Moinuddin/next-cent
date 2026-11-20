const { getDefaultConfig } = require("expo/metro-config");
const { withE2eStub } = require("./metro-e2e");

module.exports = withE2eStub(getDefaultConfig(__dirname));
