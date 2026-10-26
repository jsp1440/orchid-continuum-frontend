const deny = () => { throw new Error('NETWORK_FORBIDDEN_IN_OFFLINE_VALIDATION'); };
globalThis.fetch = deny;
for (const name of ['http', 'https']) {
  const module = require('node:' + name);
  module.request = deny;
  module.get = deny;
}
