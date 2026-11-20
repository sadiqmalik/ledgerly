// Who is making the current request. Set by the session middleware and read by the repository,
// so history and trash entries record the actor without changing every method signature.
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

const runAs = (actor, fn) => storage.run(actor, fn);
const currentActor = () => storage.getStore() || null;

module.exports = { runAs, currentActor };
