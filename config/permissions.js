/**
 * These permissions must match those configured for the API at Auth0
 */
module.exports = {
  // Create
  create: {
    agents: 'create:agents',
    organizations: 'create:organizations',
    teams: 'create:teams',
    teamMembers: 'create:team-member',
  },
  // Read
  read: {
    agents: 'read:agents',
    organizations: 'read:organizations',
    teams: 'read:teams',
    organizationMembers: 'read:organization-member',
    teamMembers: 'read:team-member',
  },
  // Update
  update: {
    agents: 'update:agents',
    organizations: 'update:organizations',
    teams: 'update:teams',
  },
  // Delete
  'delete': {
    agents: 'delete:agents',
    organizations: 'delete:organizations',
    teams: 'delete:teams',
    organizationMembers: 'delete:organization-member',
    teamMembers: 'delete:team-member',
  },
  add: {
    organizationMembers: 'add:organization-member',
  }
}

