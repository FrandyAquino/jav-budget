// Jest environment for the Supabase integration tests: jest-expo's native
// environment, plus Node's real networking saved before Expo's setup replaces
// `fetch` with its native-module stub (expo/build/winter/fetch).
const { TestEnvironment } = require("jest-expo/src/preset/nativeEnvironment");

class NetworkEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.global.__nodeFetch = globalThis.fetch.bind(globalThis);
  }
}
module.exports = NetworkEnvironment;
module.exports.TestEnvironment = NetworkEnvironment;
