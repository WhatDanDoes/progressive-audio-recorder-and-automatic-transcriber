const app = require('../../app');
const request = require('supertest-session');
const nock = require('nock');

const roles = require('../../config/roles');

/**
 * 2019-11-13
 * Sample tokens taken from:
 *
 * https://auth0.com/docs/api-auth/tutorials/adoption/api-tokens
 *
 * For the moment, it doesn't seem to matter that all authenticated
 * agents are using the same access token for testing purposes.
 */
const _access = require('../fixtures/sample-auth0-access-token');
_access.iss = `https://${process.env.AUTH0_DOMAIN}/`;
const _identity = require('../fixtures/sample-auth0-identity-token');
_identity.iss = `https://${process.env.AUTH0_DOMAIN}/`;
const scope = require('../../config/permissions');
const apiScope = require('../../config/apiPermissions');
const _profile = require('../fixtures/sample-auth0-profile-response');

const jwt = require('jsonwebtoken');
const jose = require('node-jose');
const pem2jwk = require('pem-jwk').pem2jwk
const NodeRSA = require('node-rsa');
const querystring = require('querystring');

module.exports = function(email, zombieDomain, done) {

  // Note to future self: this will probably muck things up if I
  // try to stub any other services
  nock.cleanAll();

  require('./setupKeystore').then(singleton => {
    let { pub, prv, keystore } = singleton.keyStuff;

    /**
     * This is called when `/login` is hit.
     */
    let identity, identityToken;
    const auth0Scope = nock(`https://${process.env.AUTH0_DOMAIN}`)
      .get(/authorize*/)
      .reply((uri, body, next) => {
        uri = uri.replace('/authorize?', '');
        const parsed = querystring.parse(uri);
        state = parsed.state;
        nonce = parsed.nonce;

        identity = {..._identity,
                       email: email,
                       aud: process.env.AUTH0_CLIENT_ID,
                       iat: Math.floor(Date.now() / 1000) - (60 * 60),
                       nonce: nonce }
        identityToken = jwt.sign(identity, prv, { algorithm: 'RS256', header: { kid: keystore.all()[0].kid } })

        /**
         * `/userinfo` mock
         */
        const userInfoScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
          .get(/userinfo/)
          .reply(200, identity);

        /**
         * `/oauth/token` mock
         */
        const oauthTokenScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
          .post(/oauth\/token/, {
                                  'grant_type': 'authorization_code',
                                  'redirect_uri': /\/callback/,
                                  'client_id': process.env.AUTH0_CLIENT_ID,
                                  'client_secret': process.env.AUTH0_CLIENT_SECRET,
                                  'code': 'AUTHORIZATION_CODE'
                                })
          .reply(200, {
            'access_token': jwt.sign({..._access,
                                      permissions: [scope.read.agents]},
                                     prv, { algorithm: 'RS256', header: { kid: keystore.all()[0].kid } }),
            'refresh_token': 'SOME_MADE_UP_REFRESH_TOKEN',
            'id_token': identityToken
          });

        /**
         * This is called when the agent has authenticated and silid
         * needs to retreive the non-OIDC-compliant metadata, etc.
         */
        const accessToken = jwt.sign({..._access, scope: [apiScope.read.users]},
                                      prv, { algorithm: 'RS256', header: { kid: keystore.all()[0].kid } })
        const anotherOauthTokenScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
          .post(/oauth\/token/, {
                                  'grant_type': 'client_credentials',
                                  'client_id': process.env.AUTH0_CLIENT_ID,
                                  'client_secret': process.env.AUTH0_CLIENT_SECRET,
                                  'audience': `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
                                  'scope': apiScope.read.users
                                })
          .reply(200, {
            'access_token': accessToken,
            'token_type': 'Bearer',
          });

        /**
         * The token retrieved above is used to get the
         * non-OIDC-compliant metadata, etc.
         */
        const userReadScope = nock(`https://${process.env.AUTH0_DOMAIN}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
          .get(/api\/v2\/users\/.+/)
          .query({})
          .reply(200, _profile);


        next(null, [302, {}, { 'Location': `https://${process.env.AUTH0_DOMAIN}/login` }]);
      });

    /**
     * `/login` mock
     */
    const loginScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
      .get(/login/)
      .reply((uri, body, next) => {
        next(null, [302, {}, { 'Location': `http://${zombieDomain}/callback?code=AUTHORIZATION_CODE&state=${state}` }]);
      });

    /**
     * `/logout` mock
     */
    const logoutScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
      .get(/\/v2\/logout\?.+/)
      .reply((uri, body, next) => {
        const parsed = querystring.parse(uri);
        next(null, [302, {}, { 'Location': parsed.returnTo || process.env.SERVER_DOMAIN }]);
      });


    // Mocks initialized
    done(null, {pub, prv, keystore});

  }).catch(err => {
    console.error(err);
  });
};
