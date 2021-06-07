const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);
const fs = require('fs');
const app = require('../../../app');

const models = require('../../../models');
const fixtures = require('pow-mongoose-fixtures');
const stubAuth0Sessions = require('../../support/stubAuth0Sessions');

/**
 * `mock-fs` stubs the entire file system. So if a module hasn't
 * already been `require`d the tests will fail because the
 * module doesn't exist in the mocked file system. `ejs` and
 * `iconv-lite/encodings` are required here to solve that
 * problem.
 */
const mock = require('mock-fs');
const mockAndUnmock = require('../../support/mockAndUnmock')(mock);

describe('sudo/landing page', () => {

  let agent, lanny, browser;

  beforeEach(done => {
    browser = new Browser({ waitDuration: '30s', loadCss: false });
    //browser.debug();
    fixtures.load(__dirname + '/../../fixtures/agents.js', models.mongoose, err => {
      models.Agent.findOne({ email: 'daniel@example.com' }).then(results => {
        agent = results;
        models.Agent.findOne({ email: 'lanny@example.com' }).then(results => {
          lanny = results;
          browser.visit('/', err => {
            if (err) return done.fail(err);
            browser.assert.success();
            done();
          });
        }).catch(error => {
          done.fail(error);
        });
      }).catch(error => {
        done.fail(error);
      });
    });
  });

  afterEach(done => {
    mock.restore();
    models.mongoose.connection.db.dropDatabase().then((err, result) => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  describe('authenticated', () => {

    describe('unauthorized (non-sudo)', () => {
      beforeEach(done => {
        // This and the login/logout cycle writes the agent's Auth0 profile to the database
        stubAuth0Sessions(lanny.email, DOMAIN, err => {
          if (err) done.fail(err);

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();

            done();
          });
        });
      });

      afterEach(done => {
        mock.restore();
        models.mongoose.connection.db.dropDatabase().then((err, result) => {
          done();
        }).catch(err => {
          done.fail(err);
        });
      });

      it('does not display an Admin link in the menu bar', done => {
        browser.assert.elements('a[href="/agent/admin"]', 0);
        browser.visit('/', (err) => {
          if (err) return done.fail(err);
          browser.assert.elements('a[href="/agent/admin"]', 0);
          done();
        });
      });
    });

    describe('authorized (sudo)', () => {
      beforeEach(done => {
        stubAuth0Sessions(process.env.SUDO, DOMAIN, err => {
          if (err) done.fail(err);

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();

            done();
          });
        });
      });

      afterEach(done => {
        mock.restore();
        models.mongoose.connection.db.dropDatabase().then((err, result) => {
          done();
        }).catch(err => {
          done.fail(err);
        });
      });

      it('displays an Admin link in the menu bar', done => {
        browser.assert.text('a[href="/agent/admin"]', 'Admin');
        browser.visit('/', (err) => {
          if (err) return done.fail(err);
          browser.assert.text('a[href="/agent/admin"]', 'Admin');
          done();
        });
      });
    });
  });
});
