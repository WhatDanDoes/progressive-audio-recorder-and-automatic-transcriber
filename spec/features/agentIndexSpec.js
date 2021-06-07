const Browser = require('zombie');

const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';

Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../app');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');
const stubAuth0Sessions = require('../support/stubAuth0Sessions');

const nock = require('nock');
const _profile = require('../fixtures/sample-auth0-profile-response');

/**
 * `mock-fs` stubs the entire file system. So if a module hasn't
 * already been `require`d the tests will fail because the
 * module doesn't exist in the mocked file system. `ejs` and
 * `iconv-lite/encodings` are required here to solve that
 * problem.
 */
const mock = require('mock-fs');
const mockAndUnmock = require('../support/mockAndUnmock')(mock);

describe('agentIndexSpec', () => {

  let browser, agent, lanny;
  beforeEach(function(done) {
    browser = new Browser({ waitDuration: '30s', loadCss: false });
    //browser.debug();
    fixtures.load(__dirname + '/../fixtures/agents.js', models.mongoose, function(err) {
      models.Agent.findOne({ email: 'daniel@example.com' }).then(function(results) {
        agent = results;
        models.Agent.findOne({ email: 'lanny@example.com' }).then(function(results) {
          lanny = results;
          browser.visit('/', function(err) {
            if (err) return done.fail(err);
            browser.assert.success();
            done();
          });
        }).catch(function(error) {
          done.fail(error);
        });
      }).catch(function(error) {
        done.fail(error);
      });
    });
  });

  afterEach(function(done) {
    models.mongoose.connection.db.dropDatabase().then(function(err, result) {
      done();
    }).catch(function(err) {
      done.fail(err);
    });
  });

  describe('authenticated', () => {

    let accessToken;
    beforeEach(done => {
      stubAuth0Sessions(agent.email, DOMAIN, (err, stuff) => {
        if (err) return done.fail(err);
        ({ accessToken} = stuff);
        done();
      });
    });

    it('serves up the authenticated page', done => {
      browser.clickLink('Login', (err) => {
        if (err) return done.fail(err);
        browser.assert.element('a[href="/logout"]');
        done();
      });
    });

    describe('authorized', () => {

      beforeEach(done => {
        mockAndUnmock({
          [`uploads/${agent.getAgentDirectory()}`]: {
            'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
            'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
            'track3.ogg': fs.readFileSync('spec/files/troll.ogg'),
          },
          'public/tracks/uploads': {}
        });

        browser.clickLink('Login', err => {
          if (err) done.fail(err);
          browser.assert.success();

          done();
        });
      });

      afterEach(() => {
        mock.restore();
      });

      describe('with Identity API access', () => {

        let identityAgentScope;
        beforeEach(() => {
          identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
            .get('/agent')
            .reply(200, {..._profile, email: agent.email, user_metadata: { favourite_fish: 'Cod' } });
        });

        describe('interface', () => {
          beforeEach(done => {
            browser.clickLink('Profile', function(err) {
              if (err) return done.fail(err);
              browser.assert.success();

              models.Agent.findOne({ email: 'daniel@example.com' }).then(function(results) {
                agent = results;
                done();
              }).catch(err => {
                done.fail(err);
              });
            });
          });

          it('allows an agent to view his own profile', () => {
            browser.assert.url({ pathname: '/agent'});
            browser.assert.text('h2', `Hello, ${agent.get('nickname')}!`);
            browser.assert.element(`article.post header img.avatar[src="${agent.get('picture')}"]`);
            browser.assert.text(`article.post header aside div`, agent.email);
            browser.assert.text(`article.post header aside time`, `Last active: ${agent.updatedAt}`);
          });

          it('shows a list of albums the agent can read', () => {
            expect(agent.canRead.length).toEqual(1);
            expect(agent.canRead[0]).toEqual(lanny._id);
            browser.assert.elements('.album-link a', 2);
            browser.assert.link('.album-link a', lanny.getAgentDirectory(), `/track/${lanny.getAgentDirectory()}`);
            browser.assert.link('.album-link a', agent.getAgentDirectory(), `/track/${agent.getAgentDirectory()}`);
          });

          it('lets the agent click and view a link he can read', done => {
            browser.clickLink(lanny.getAgentDirectory(), function(err) {
              if (err) return done.fail(err);
              browser.assert.success();
              browser.assert.url({ path: `/track/${lanny.getAgentDirectory()}` });
              done();
            });
          });
        });

        describe('server', () => {
          it('calls the Identity endpoint', done => {
            browser.clickLink('Profile', function(err) {
              if (err) return done.fail(err);
              browser.assert.success();
              expect(identityAgentScope.isDone()).toBe(true);
              done();
            });
          });

          it('updates the database', done => {
            models.Agent.findOne({ email: agent.email }).then(agent => {
              expect(agent._doc.user_metadata).toBeUndefined();

              browser.clickLink('Profile', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Agent.findOne({ email: agent.email }).then(agent => {
                  expect(agent._doc.user_metadata.favourite_fish).toEqual('Cod');

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });
        });
      });

      describe('without Identity API access', () => {

        describe('no API configured', () => {

          let apiUrl;
          beforeAll(() => {
            apiUrl = process.env.IDENTITY_API;
            delete process.env.IDENTITY_API;
          });

          afterAll(() => {
            process.env.IDENTITY_API = apiUrl;
          });

          let identityAgentScope;
          beforeEach(() => {
            expect(process.env.IDENTITY_API).toBeUndefined();

            identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
              .get('/agent')
              .reply(200, {..._profile, email: agent.email, user_metadata: { favourite_fish: 'Cod' } });
          });

          describe('interface', () => {
            beforeEach(done => {
              browser.clickLink('Profile', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();
                models.Agent.findOne({ email: 'daniel@example.com' }).then(function(results) {
                  agent = results;
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            });

            it('allows an agent to view his own profile', () => {
              browser.assert.url({ pathname: '/agent'});
              browser.assert.text('h2', `Hello, ${agent.get('nickname')}!`);
              browser.assert.element(`article.post header img.avatar[src="${agent.get('picture')}"]`);
              browser.assert.text(`article.post header aside div`, agent.email);
              browser.assert.text(`article.post header aside time`, `Last active: ${agent.updatedAt}`);
            });

            it('shows a list of albums the agent can read', () => {
              expect(agent.canRead.length).toEqual(1);
              expect(agent.canRead[0]).toEqual(lanny._id);
              browser.assert.elements('.album-link a', 2);
              browser.assert.link('.album-link a', lanny.getAgentDirectory(), `/track/${lanny.getAgentDirectory()}`);
              browser.assert.link('.album-link a', agent.getAgentDirectory(), `/track/${agent.getAgentDirectory()}`);
            });

            it('lets the agent click and view a link he can read', done => {
              browser.clickLink(lanny.getAgentDirectory(), function(err) {
                if (err) return done.fail(err);
                browser.assert.success();
                browser.assert.url({ path: `/track/${lanny.getAgentDirectory()}` });
                done();
              });
            });
          });

          describe('server', () => {
            it('does not call the Identity endpoint', done => {
              browser.clickLink('Profile', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();
                expect(identityAgentScope.isDone()).toBe(false);
                done();
              });
            });

            it('does not update the database', done => {
              models.Agent.findOne({ email: agent.email }).then(agent => {
                expect(agent._doc.user_metadata).toBeUndefined();

                browser.clickLink('Profile', function(err) {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  models.Agent.findOne({ email: agent.email }).then(agent => {
                    expect(agent._doc.user_metadata).toBeUndefined();
                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
              }).catch(err => {
                done.fail(err);
              });
            });
          });
        });

        describe('API returns error', () => {
          let identityAgentScope;
          beforeEach(() => {
            expect(process.env.IDENTITY_API).toBeDefined();

            identityAgentScope = nock(`https://${process.env.IDENTITY_API}`, { reqheaders: { authorization: `Bearer ${accessToken}`} })
              .get('/agent')
              .reply(404, { message: 'That dinnae exist' });
          });

          describe('interface', () => {
            beforeEach(done => {
              browser.clickLink('Profile', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();
                models.Agent.findOne({ email: 'daniel@example.com' }).then(function(results) {
                  agent = results;
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            });

            it('allows an agent to view his own profile', () => {
              browser.assert.url({ pathname: '/agent'});
              browser.assert.text('h2', `Hello, ${agent.get('nickname')}!`);
              browser.assert.element(`article.post header img.avatar[src="${agent.get('picture')}"]`);
              browser.assert.text(`article.post header aside div`, agent.email);
              browser.assert.text(`article.post header aside time`, `Last active: ${agent.updatedAt}`);
            });

            it('shows a friendly warning', () => {
              browser.assert.text('.alert.alert-danger', 'Could not sync with Identity. Cached data shown.');
            });

            it('shows a list of albums the agent can read', () => {
              expect(agent.canRead.length).toEqual(1);
              expect(agent.canRead[0]).toEqual(lanny._id);
              browser.assert.elements('.album-link a', 2);
              browser.assert.link('.album-link a', lanny.getAgentDirectory(), `/track/${lanny.getAgentDirectory()}`);
              browser.assert.link('.album-link a', agent.getAgentDirectory(), `/track/${agent.getAgentDirectory()}`);
            });

            it('lets the agent click and view a link he can read', done => {
              browser.clickLink(lanny.getAgentDirectory(), function(err) {
                if (err) return done.fail(err);
                browser.assert.success();
                browser.assert.url({ path: `/track/${lanny.getAgentDirectory()}` });
                done();
              });
            });
          });

          describe('server', () => {
            it('calls the Identity endpoint', done => {
              browser.clickLink('Profile', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();
                expect(identityAgentScope.isDone()).toBe(true);
                done();
              });
            });

            it('does not update the database', done => {
              models.Agent.findOne({ email: agent.email }).then(agent => {
                expect(agent._doc.user_metadata).toBeUndefined();

                browser.clickLink('Profile', function(err) {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  models.Agent.findOne({ email: agent.email }).then(agent => {
                    expect(agent._doc.user_metadata).toBeUndefined();
                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
              }).catch(err => {
                done.fail(err);
              });
            });
          });
        });
      });
    });
  });

  describe('unauthenticated', () => {
    it('redirects home (which is where the login form is located)', done => {
      browser.visit('/agent', function(err) {
        if (err) return done.fail(err);
        browser.assert.redirected();
        browser.assert.url({ pathname: '/'});
        browser.assert.text('.alert.alert-danger', 'You need to login first');
        done();
      });
    });
  });
});
