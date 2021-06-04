const Browser = require('zombie');

const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';

Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../../app');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../../models');
const stubAuth0Sessions = require('../../support/stubAuth0Sessions');
const nock = require('nock');

/**
 * `mock-fs` stubs the entire file system. So if a module hasn't
 * already been `require`d the tests will fail because the
 * module doesn't exist in the mocked file system. `ejs` and
 * `iconv-lite/encodings` are required here to solve that
 * problem.
 */
const mock = require('mock-fs');
const mockAndUnmock = require('../../support/mockAndUnmock')(mock);

describe('sudo agentIndexSpec', () => {

  let browser, agent, lanny;
  beforeEach(function(done) {
    browser = new Browser({ waitDuration: '30s', loadCss: false });
    //browser.debug();
    fixtures.load(__dirname + '/../../fixtures/agents.js', models.mongoose, function(err) {
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

    beforeEach(done => {
      expect(process.env.SUDO).not.toEqual(agent.email);
      stubAuth0Sessions(agent.email, DOMAIN, err => {
        if (err) return done.fail(err);
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
//          [`uploads/${agent.getAgentDirectory()}`]: {
//            'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
//            'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
//            'track3.ogg': fs.readFileSync('spec/files/troll.ogg'),
//          },
          'public/tracks/uploads': {}
        });

        // Login first agent
        browser.clickLink('Login', err => {
          if (err) done.fail(err);
          browser.assert.success();

          browser.clickLink('Logout', err => {
            if (err) done.fail(err);
            browser.assert.success();

            expect(process.env.SUDO).not.toEqual(lanny.email);
            stubAuth0Sessions(lanny.email, DOMAIN, err => {
              if (err) return done.fail(err);

              // Need a new session
              browser.visit('/', function(err) {
                if (err) return done.fail(err);

                // Login another agent
                browser.clickLink('Login', err => {
                  if (err) done.fail(err);
                  browser.assert.success();

                  browser.clickLink('Logout', err => {
                    if (err) done.fail(err);
                    browser.assert.success();

                    expect(process.env.SUDO).toBeDefined();
                    stubAuth0Sessions(process.env.SUDO, DOMAIN, err => {
                      if (err) return done.fail(err);

                      // Need a new session
                      browser.visit('/', function(err) {
                        if (err) return done.fail(err);

                        // Login sudo agent agent
                        browser.clickLink('Login', err => {
                          if (err) done.fail(err);
                          browser.assert.success();

                          browser.clickLink('Admin', function(err) {
                            if (err) return done.fail(err);
                            browser.assert.success();
                            done();
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });

      afterEach(() => {
        mock.restore();
      });

      it('shows a list of agents sorted by latest login', done => {
        models.Agent.find({}).sort({ updatedAt: 'desc'}).then(agents => {
          // Subject agent not listed
          expect(agents.length).toEqual(4);
          expect(agents[0].email).toEqual(process.env.SUDO);
          browser.assert.elements(`.agent a[href="/track/${agents[0].getAgentDirectory()}"]`, 0);

          browser.assert.elements('.agent a', 3);
          browser.assert.text(`.agent a[href="/track/${agents[1].getAgentDirectory()}"]`, agents[1].getAgentDirectory());
          browser.assert.text(`.agent a[href="/track/${agents[2].getAgentDirectory()}"]`, agents[2].getAgentDirectory());
          browser.assert.text(`.agent a[href="/track/${agents[3].getAgentDirectory()}"]`, agents[3].getAgentDirectory());

          done();
        }).catch(err => {
          done.fail(err);
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
