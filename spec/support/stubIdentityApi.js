const nock = require('nock');
const _profile = require('../fixtures/sample-auth0-profile-response');

/**
 * This module needs to be called after `stubAuth0Sessions`. It is complementary,
 * as Identity also depends upon Auth0
 *
 * @param string
 * @param string
 * @param function
 *
 */
module.exports = function(email, accessToken, done) {
  /**
   * Identity provides access to Auth0 metadata
   */
  const identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
    .get('/agent')
    .reply(200, {..._profile, email: email });

  // Mocks initialized
  done(null, {identityAgentScope});
};
