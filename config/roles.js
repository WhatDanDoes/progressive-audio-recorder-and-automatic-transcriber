/**
 * As with those set in `./permissions.js`, these roles must match those
 * configured for the API at Auth0
 */
const scope = require('./permissions');

module.exports = {
  sudo: [
    scope.create.agents, scope.read.agents, scope.update.agents, scope.delete.agents,
    scope.create.organizations, scope.read.organizations, scope.update.organizations, scope.delete.organizations,
    scope.add.organizationMembers, scope.read.organizationMembers, scope.delete.organizationMembers,
    scope.create.teams, scope.read.teams, scope.update.teams, scope.delete.teams,
    scope.create.teamMembers, scope.read.teamMembers, scope.delete.teamMembers,
  ],
  organizer: [
    scope.create.organizations, scope.read.organizations, scope.update.organizations, scope.delete.organizations,
    scope.add.organizationMembers, scope.delete.organizationMembers,
  ],
  viewer: [
    scope.create.teamMembers, scope.delete.teamMembers,
    scope.create.teams, scope.read.teams, scope.update.teams, scope.delete.teams,
    scope.read.agents, scope.update.agents,
    scope.read.organizations,
  ],
};
