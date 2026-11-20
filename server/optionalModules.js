// Optional server modules, registered by createRepo (repos) and createApi (routes).
// Ledgerly ships none by default. A module is a repo factory (db => repo) and/or a route registrar (app, { repo, env }).
module.exports = {
  repos: {},
  routes: []
};
