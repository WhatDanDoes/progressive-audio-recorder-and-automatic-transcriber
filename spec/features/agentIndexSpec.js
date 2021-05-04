const Browser = require('zombie');

const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';

Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../app');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');
const jwt = require('jsonwebtoken');
const stubAuth0Sessions = require('../support/stubAuth0Sessions');

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

    beforeEach(done => {
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
          [`uploads/${agent.getAgentDirectory()}`]: {
            'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
            'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
            'track3.ogg': fs.readFileSync('spec/files/troll.ogg'),
          },
          'public/tracks/uploads': {}
        });

        // 2021-4-26 Is the explicit type of device relevant now that I'm interested in media inputs?
        browser.headers = {'user-agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G960F Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.84 Mobile Safari/537.36'};

        browser.clickLink('Login', err => {
          if (err) done.fail(err);
          browser.assert.success();


          // Don't stub out `jwt` too early. The Auth0 mocks need it!
          spyOn(jwt, 'sign').and.returnValue('somejwtstring');

          browser.clickLink('Profile', function(err) {
            if (err) return done.fail(err);
            browser.assert.success();
            done();
          });
        });
      });

      afterEach(() => {
        mock.restore();
      });

      it('allows an agent to view his own profile', () => {
        browser.assert.url({ pathname: '/agent'});
        browser.assert.text('h2', `Hello, ${agent.email}`);
      });

      it('displays an add-track form', () => {
        browser.assert.elements('.deep-link', 2);
        browser.assert.element('form[action="/track"][method="post"]');
        browser.assert.element('input[id="tracks-input"][type="file"][accept="audio/*"]');
        browser.assert.text('label[for="tracks-input"]', 'Upload audio file');
        browser.assert.element('label[for="tracks-input"] img[src="/images/file-upload.png"]');
      });

      it('shows a list of albums the agent can read', () => {
        expect(agent.canRead.length).toEqual(1);
        expect(agent.canRead[0]).toEqual(lanny._id);
        browser.assert.elements('.agent a', 2);
        browser.assert.link('.agent a', lanny.getAgentDirectory(), `/track/${lanny.getAgentDirectory()}`);
        browser.assert.link('.agent a', agent.getAgentDirectory(), `/track/${agent.getAgentDirectory()}`);
      });

      it('lets the agent click and view a link he can read', done => {
        browser.clickLink(lanny.getAgentDirectory(), function(err) {
          if (err) return done.fail(err);
          browser.assert.success();
          done();
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
