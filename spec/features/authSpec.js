const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;

const app = require('../../app');
const request = require('supertest-session');

const nock = require('nock');

const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const models = require('../../models');

describe('authSpec', () => {

  /**
   * 2019-11-13
   * Sample tokens taken from:
   *
   * https://auth0.com/docs/api-auth/tutorials/adoption/api-tokens
   */
  const _identity = require('../fixtures/sample-auth0-identity-token');
  const _access = require('../fixtures/sample-auth0-access-token');
  const _profile = require('../fixtures/sample-auth0-profile-response');

  // Auth0 defined scopes and roles
  const scope = require('../../config/permissions');
  const apiScope = require('../../config/apiPermissions');
  const roles = require('../../config/roles');

  let pub, prv, keystore;
  beforeAll(done => {
    require('../support/setupKeystore').then(keyStuff => {
      ({ pub, prv, keystore } = keyStuff);
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  let auth0Scope, state, nonce;
  beforeEach(done => {

    /**
     * This is called when `/login` is hit. The session is
     * created prior to redirect.
     */
    auth0Scope = nock(`https://${process.env.AUTH0_DOMAIN}`)
      .get(/authorize*/)
      .reply(302, (uri, body) => {
        uri = uri.replace('/authorize?', '');
        const parsed = querystring.parse(uri);
        state = parsed.state;
        nonce = parsed.nonce;
      });

    done();
  });

  afterEach(function(done) {
    models.mongoose.connection.db.dropDatabase().then(function(result) {
      nock.cleanAll();
      done();
    }).catch(function(err) {
      done.fail(err);
    });
  });

  describe('/login', () => {
    it('redirects to Auth0 login endpoint', done => {
      request(app)
        .get('/login')
        .expect(302)
        .end(function(err, res) {
          if (err) return done.fail(err);
          expect(res.headers.location).toMatch(process.env.AUTH0_DOMAIN);
          done();
        });
    });

    it('starts a session', done => {
      const session = request(app);
      expect(session.cookies.length).toEqual(0);
      session
        .get('/login')
        .expect(302)
        .end(function(err, res) {
          if (err) return done.fail(err);
          expect(session.cookies.length).toEqual(1);
          done();
        });
    });

    it('sets maximum cookie age to one hour', done => {
      const session = request(app);
      session
        .get('/login')
        .expect(302)
        .end(function(err, res) {
          if (err) return done.fail(err);
          expect(session.cookies.length).toEqual(1);
          expect(session.cookies[0].expiration_date <= Date.now() + 1000 * 60 * 60).toBe(true);
          done();
        });
    });

    it('calls the /authorize endpoint', done => {
      request(app)
        .get('/login')
        .redirects()
        .end(function(err, res) {
          if (err) return done.fail(err);
          expect(auth0Scope.isDone()).toBe(true);
          done();
        });
    });
  });

  /**
   * Called upon successful third-party permission granting.
   * The code is exchanged for an authorization token. Then
   * `/userinfo` is hit
   */
  describe('/callback', () => {
    let identityAgentScope, accessToken;

    let session, oauthTokenScope, userInfoScope, auth0UserAssignRolesScope, auth0GetRolesScope;
    // Added for when agent info is requested immediately after authentication
    let anotherOauthTokenScope, userReadScope;
    beforeEach(done => {

      /**
       * `/userinfo` mock
       */
      userInfoScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
        .get(/userinfo/)
        .reply(200, _identity);

      /**
       * This sets the cookie before the Auth0 redirects take over
       */
      session = request(app);
      session
        .get('/login')
        .redirects()
        .end(function(err, res) {
          if (err) return done.fail(err);
          auth0Scope.isDone()

          /**
           * `/oauth/token` mock
           *
           * This is called when first authenticating
           */
          accessToken = jwt.sign({..._access,
                                  permissions: [scope.read.agents]},
                                  prv, { algorithm: 'RS256', header: { kid: keystore.all()[0].kid } })
          oauthTokenScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
            .post(/oauth\/token/, {
                                    'grant_type': 'authorization_code',
                                    'redirect_uri': /\/callback/,
                                    'client_id': process.env.AUTH0_CLIENT_ID,
                                    'client_secret': process.env.AUTH0_CLIENT_SECRET,
                                    'code': 'AUTHORIZATION_CODE'
                                  })
            .reply(200, {
              'access_token': accessToken,
              'refresh_token': 'SOME_MADE_UP_REFRESH_TOKEN',
              'id_token': jwt.sign({..._identity,
                                      aud: process.env.AUTH0_CLIENT_ID,
                                      iat: Math.floor(Date.now() / 1000) - (60 * 60),
                                      nonce: nonce },
                                   prv, { algorithm: 'RS256', header: { kid: keystore.all()[0].kid } })
            });

          /**
           * This is called when the agent has authenticated and silid
           * needs to retreive the non-OIDC-compliant metadata, etc.
           */
          const anotherAccessToken = jwt.sign({..._access, scope: [apiScope.read.users]},
                                        prv, { algorithm: 'RS256', header: { kid: keystore.all()[0].kid } })
          anotherOauthTokenScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
            .post(/oauth\/token/, {
                                    'grant_type': 'client_credentials',
                                    'client_id': process.env.AUTH0_CLIENT_ID,
                                    'client_secret': process.env.AUTH0_CLIENT_SECRET,
                                    'audience': `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
                                    'scope': apiScope.read.users
                                  })
            .reply(200, {
              'access_token': anotherAccessToken,
              'token_type': 'Bearer',
            });

          /**
           * The token retrieved above is used to get the
           * non-OIDC-compliant metadata, etc.
           */
          userReadScope = nock(`https://${process.env.AUTH0_DOMAIN}`, { reqheaders: { authorization: `Bearer ${anotherAccessToken}`} })
            .get(/api\/v2\/users\/.+/)
            .query({})
            .reply(200, _profile);

          done();
        });
    });

    describe('with Identity API access', () => {

      beforeEach(() => {
        /**
         * Identity provides access to Auth0 metadata
         */
        identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
          .get('/agent')
          .reply(200, {..._profile, user_metadata: { favourite_fish: 'Cod' } });
      });

      it('calls the `/oauth/token` endpoint', done => {
        session
          .get(`/callback?code=AUTHORIZATION_CODE&state=${state}`)
          .expect(302)
          .end(function(err, res) {
            if (err) return done.fail(err);
            expect(oauthTokenScope.isDone()).toBe(true);
            done();
          });
      });

      it('calls the `/userinfo` endpoint', done => {
        session
          .get(`/callback?code=AUTHORIZATION_CODE&state=${state}`)
          .expect(302)
          .end(function(err, res) {
            if (err) return done.fail(err);
            expect(userInfoScope.isDone()).toBe(true);
            done();
          });
      });

      it('redirects home', done => {
        session
          .get(`/callback?code=AUTHORIZATION_CODE&state=${state}`)
          .expect(302)
          .end(function(err, res) {
            if (err) return done.fail(err);
            expect(res.headers.location).toEqual('/track/example.com/someguy');
            done();
          });
      });

      it('calls the Identity API\'s /agent endpoint to retrieve full Auth0 profile', done => {
        session
          .get(`/callback?code=AUTHORIZATION_CODE&state=${state}`)
          .redirects()
          .end(function(err, res) {
            if (err) return done.fail(err);

            expect(identityAgentScope.isDone()).toBe(true);
            done();
          });
      });

      describe('database', () => {
        it('adds a new agent record if none exists', done => {
          models.Agent.find().then(results => {
            expect(results.length).toEqual(0);

            session
              .get(`/callback?code=AUTHORIZATION_CODE&state=${state}`)
              .expect(302)
              .end(function(err, res) {
                if (err) return done.fail(err);

                models.Agent.find().then(results => {
                  expect(results.length).toEqual(1);
                  expect(results[0].email).toEqual(_profile.email);
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
          }).catch(err => {
            done.fail(err);
          });
        });

        it('updates existing agent record', done => {
          models.Agent.create({ email: _profile.email }).then(result => {
            expect(result.email).toEqual(_profile.email);
            expect(result.user_metadata).not.toBeDefined();

            session
              .get(`/callback?code=AUTHORIZATION_CODE&state=${state}`)
              .expect(302)
              .end(function(err, res) {
                if (err) return done.fail(err);

                models.Agent.find().then(results => {
                  expect(results.length).toEqual(1);
                  expect(results[0].email).toEqual(_profile.email);

                  // Note the `._doc`. Agent is a non _strict_ model
                  expect(results[0]._doc.user_metadata).toBeDefined();
                  expect(results[0]._doc.user_metadata.favourite_fish).toEqual('Cod');

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
          }).catch(err => {
            done.fail(err);
          });
        });

        it('doesn\'t save the access token', done => {
          session
            .get(`/callback?code=AUTHORIZATION_CODE&state=${state}`)
            .expect(302)
            .end(function(err, res) {
              if (err) return done.fail(err);

              models.Agent.find().then(results => {
                expect(results.length).toEqual(1);
                expect(results[0].access_token).not.toBeDefined();
                expect(results[0]._doc.access_token).not.toBeDefined();

                expect(identityAgentScope.isDone()).toBe(true);

                done();
              }).catch(err => {
                done.fail(err);
              });
            });
        });
      });

      describe('/logout', () => {

        let ssoScope;
        beforeEach(done => {
          /**
           * Redirect client to Auth0 `/logout` after silid session is cleared
           */
          ssoScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
            .get('/v2/logout')
            .query({
              returnTo: `${process.env.SINGLE_SIGN_OUT_DOMAIN}?returnTo=${process.env.SERVER_DOMAIN}`
            })
            .reply(302, {}, { 'Location': process.env.SERVER_DOMAIN });
          done();
        });

        it('redirects home and clears the session', done => {
          expect(session.cookies.length).toEqual(1);
          session
            .get('/logout')
            .expect(302)
            .end(function(err, res) {
              if (err) return done.fail(err);
              expect(session.cookies.length).toEqual(0);
              done();
            });
        });

        it('redirects to the Auth0 SSO /logout endpoint and sets redirect query string', done => {
          session
            .get('/logout')
            .expect(302)
            .end(function(err, res) {
              if (err) return done.fail(err);
              const loc = new URL(res.header.location);
              expect(loc.origin).toMatch(`https://${process.env.AUTH0_DOMAIN}`);
              expect(loc.hostname).toMatch(process.env.AUTH0_DOMAIN);
              expect(loc.pathname).toMatch('/v2/logout');
              //
              // If `client_id` is not set the Auth0 server returns the
              // agent to the first Allowed Logout URLs set in the Dashboard
              //
              // https://auth0.com/docs/api/authentication#logout
              //
              expect(loc.searchParams.get('client_id')).toBe(null);
              expect(loc.searchParams.get('returnTo')).toEqual(`${process.env.SINGLE_SIGN_OUT_DOMAIN}?returnTo=${process.env.SERVER_DOMAIN}`);
              done();
            });
        });
      });
    });

    // See Browser tests for behaviourals below
    describe('without Identity API access', () => {
      beforeEach(() => {
      });

      it('does not call Identity if URL endpoint is not configured', done => {
        const _api = process.env.IDENTITY_API;
        delete process.env.IDENTITY_API;

        identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
          .get('/agent')
          .reply(200, {..._profile, user_metadata: { favourite_fish: 'Cod' } });

        session
          .get(`/callback?code=AUTHORIZATION_CODE&state=${state}`)
          .expect(302)
          .end(function(err, res) {
            if (err) return done.fail(err);

            expect(identityAgentScope.isDone()).toBe(false);

            process.env.IDENTITY_API = _api;

            done();
          });
      });

      describe('database', () => {
        it('doesn\'t clobber existing user_metadata if Identity returns error', done => {
          models.Agent.create({ email: _profile.email, user_metadata: { favourite_fish: 'Cod' } }).then(result => {
            expect(result.email).toEqual(_profile.email);
            expect(result.user_metadata.favourite_fish).toEqual('Cod');

            identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
              .get('/agent')
              .reply(400, {..._profile, user_metadata: { favourite_fish: 'Salmon' } });

            session
              .get(`/callback?code=AUTHORIZATION_CODE&state=${state}`)
              .expect(302)
              .end(function(err, res) {
                if (err) return done.fail(err);

                models.Agent.find().then(results => {
                  expect(results.length).toEqual(1);
                  expect(results[0].email).toEqual(_profile.email);
                  expect(results[0]._doc.user_metadata).toBeDefined();
                  expect(results[0]._doc.user_metadata.favourite_fish).toEqual('Cod');

                  expect(identityAgentScope.isDone()).toBe(true);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
          }).catch(err => {
            done.fail(err);
          });
        });

        it('doesn\'t save the access token', done => {
          identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
            .get('/agent')
            .reply(400, {..._profile, user_metadata: { favourite_fish: 'Salmon' } });

          session
            .get(`/callback?code=AUTHORIZATION_CODE&state=${state}`)
            .expect(302)
            .end(function(err, res) {
              if (err) return done.fail(err);

              models.Agent.find().then(results => {
                expect(results.length).toEqual(1);
                expect(results[0].access_token).not.toBeDefined();
                expect(results[0]._doc.access_token).not.toBeDefined();

                expect(identityAgentScope.isDone()).toBe(true);

                done();
              }).catch(err => {
                done.fail(err);
              });
            });
        });
      });
    });
  });

  describe('Browser', () => {
    // Setup and configure zombie browser
    const Browser = require('zombie');
    Browser.localhost('example.com', PORT);

    let browser;
    beforeEach(() => {
      browser = new Browser({ waitDuration: '30s', loadCss: false });
    });

    it('displays the correct interface', done => {
      browser.visit('/', (err) => {
        browser.assert.element('a[href="/login"]');
        browser.assert.elements('a[href="/logout"]', 0);
        done();
      });
    });

    it('sets a cookie', done => {
      expect(browser.cookies.length).toEqual(0);
      browser.visit('/', (err) => {
        if (err) return done.fail(err);
        expect(browser.cookies.length).toEqual(1);
        done();
      });
    });

    describe('Login', () => {

      let loginScope, oauthTokenScope, userInfoScope;
      let identityAgentScope, accessToken;
      beforeEach(done => {
        nock.cleanAll();

        /**
         * This is called when `/login` is hit.
         */
        let identity, identityToken;

        /**
         * `/oauth/token` mock
         */
        accessToken = jwt.sign({..._access,
                                permissions: [scope.read.agents]},
                                prv, { algorithm: 'RS256', header: { kid: keystore.all()[0].kid } });

        auth0Scope = nock(`https://${process.env.AUTH0_DOMAIN}`)
          .get(/authorize*/)
          .reply((uri, body, next) => {
            uri = uri.replace('/authorize?', '');
            const parsed = querystring.parse(uri);
            state = parsed.state;
            nonce = parsed.nonce;

            identity = {..._identity,
                           aud: process.env.AUTH0_CLIENT_ID,
                           iat: Math.floor(Date.now() / 1000) - (60 * 60),
                           nonce: nonce }
            identityToken = jwt.sign(identity, prv, { algorithm: 'RS256', header: { kid: keystore.all()[0].kid } })

            /**
             * `/userinfo` mock
             */
            userInfoScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
              .get(/userinfo/)
              .reply(200, identity);

            oauthTokenScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
              .post(/oauth\/token/, {
                                      'grant_type': 'authorization_code',
                                      'redirect_uri': /\/callback/,
                                      'client_id': process.env.AUTH0_CLIENT_ID,
                                      'client_secret': process.env.AUTH0_CLIENT_SECRET,
                                      'code': 'AUTHORIZATION_CODE'
                                    })
              .reply(200, {
                'access_token': accessToken,
                'refresh_token': 'SOME_MADE_UP_REFRESH_TOKEN',
                'id_token': identityToken
              });

            /**
             * This is called when the agent has authenticated and silid
             * needs to retreive the non-OIDC-compliant metadata, etc.
             */
            const anotherAccessToken = jwt.sign({..._access, scope: [apiScope.read.users]},
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
                'access_token': anotherAccessToken,
                'token_type': 'Bearer',
              });

            /**
             * The token retrieved above is used to get the
             * non-OIDC-compliant metadata, etc.
             */
            const userReadScope = nock(`https://${process.env.AUTH0_DOMAIN}`, { reqheaders: { authorization: `Bearer ${anotherAccessToken}`} })
              .get(/api\/v2\/users\/.+/)
              .query({})
              .reply(200, _profile);

            next(null, [302, {}, { 'Location': `https://${process.env.AUTH0_DOMAIN}/login` }]);
          });

        /**
         * `/login` mock
         */
        loginScope = nock(`https://${process.env.AUTH0_DOMAIN}`)
          .get(/login/)
          .reply((uri, body, next) => {
            next(null, [302, {}, { 'Location': `http://example.com/callback?code=AUTHORIZATION_CODE&state=${state}` }]);
          });

        browser.visit('/', (err) => {
          if (err) return done.fail(err);
          done();
        });
      });

      describe('with Identity API access', () => {

        beforeEach(() => {
          /**
           * Identity provides access to Auth0 metadata
           */
          expect(accessToken).toBeDefined();
          identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
            .get('/agent')
            .reply(200, {..._profile, user_metadata: { favourite_fish: 'Cod' } });
        });

        it('serves up the page', done => {
          browser.clickLink('Login', (err) => {
            if (err) return done.fail(err);
            browser.assert.element('a[href="/logout"]');
            done();
          });
        });

        // This is not testing the client side app
        describe('Logout', () => {
          beforeEach(done => {
            // Clear Auth0 SSO session cookies
            nock(`https://${process.env.AUTH0_DOMAIN}`)
              .get('/v2/logout')
              .query({
                returnTo: `${process.env.SINGLE_SIGN_OUT_DOMAIN}?returnTo=${process.env.SERVER_DOMAIN}`
              })
              .reply(302, {}, { 'Location': process.env.SERVER_DOMAIN });

            browser.clickLink('Login', (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('displays the correct interface', done => {
            browser.clickLink('Logout', (err) => {
              if (err) return done.fail(err);
              browser.assert.elements('a[href="/login"]');
              browser.assert.elements('a[href="/logout"]', 0);
              done();
            });
          });
        });
      });

      describe('without Identity API access', () => {
        beforeEach(() => {
          expect(accessToken).toBeDefined();
        });

        it('gives a friendly warning if Identity URL endpoint is not configured', done => {
          const _api = process.env.IDENTITY_API;
          delete process.env.IDENTITY_API;

          identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
            .get('/agent')
            .reply(200, {..._profile, user_metadata: { favourite_fish: 'Cod' } });


          browser.clickLink('Login', (err) => {
            if (err) return done.fail(err);
            browser.assert.success();

            browser.assert.text('.alert.alert-danger', 'Identity API not configured');
            expect(identityAgentScope.isDone()).toBe(false);

            // Reset
            process.env.IDENTITY_API = _api;

            done();
          });
        });

        it('gives a friendly warning if Identity endpoint rejects token provided', done => {
          identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
            .get('/agent')
            .reply(401, { message: 'Get lost' });

          browser.clickLink('Login', (err) => {
            if (err) return done.fail(err);
            browser.assert.success();

            expect(identityAgentScope.isDone()).toBe(true);
            browser.assert.text('.alert.alert-danger', 'Identity API authorization failed');

            done();
          });
        });

        it('gives a friendly warning if Identity API server is down', done => {
          identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
            .get('/agent')
            .reply(500, { message: 'Oh no!' });

          browser.clickLink('Login', (err) => {
            if (err) return done.fail(err);
            browser.assert.success();

            browser.assert.text('.alert.alert-danger', 'Identity API is down');
            expect(identityAgentScope.isDone()).toBe(true);

            done();
          });
        });
      });
    });
  });
});
