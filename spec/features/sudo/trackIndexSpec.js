const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../../app');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../../models');
const jwt = require('jsonwebtoken');

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

describe('sudo trackIndexSpec', () => {
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
    models.mongoose.connection.db.dropDatabase().then(result => {
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

        mockAndUnmock({
          [`uploads/${agent.getAgentDirectory()}`]: {
            'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
            'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
            'track3.ogg': fs.readFileSync('spec/files/troll.ogg'),
          },
          'public/tracks/uploads': {}
        });

        const tracks = [
          { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id },
          { path: `uploads/${agent.getAgentDirectory()}/track2.ogg`, recordist: agent._id },
          { path: `uploads/${agent.getAgentDirectory()}/track3.ogg`, recordist: agent._id },
        ];
        models.Track.create(tracks).then(results => {

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
    
                      done();
                    });
                  });
                });
              });
            });
          });
        }).catch(err => {
          done.fail(err);
        });
      });
    });

    afterEach(() => {
      mock.restore();
    });

    describe('authorized', () => {

      beforeEach(done => {
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

      it('displays an add-track form', done => {
        browser.clickLink(agent.getAgentDirectory(), err => {
          if (err) return done.fail(err);

          browser.assert.success();
          browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}`});
          browser.assert.elements('.deep-link', 2);
          browser.assert.element('form[action="/track"][method="post"]');
          browser.assert.element('input[id="tracks-input"][type="file"][accept="audio/*"]');
          browser.assert.text('label[for="tracks-input"]', 'Upload audio file');
          browser.assert.element('label[for="tracks-input"] img[src="/images/file-upload.png"]');
          done();
        });
      });

      it('allows sudo to view another agent\'s album', done => {
        browser.clickLink(agent.getAgentDirectory(), err => {
          if (err) return done.fail(err);

          browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}`});
          browser.assert.elements('article.post section.track figure figcaption a', 3);
          browser.assert.elements('article.post section.track figure audio ', 3);
          browser.assert.elements('article.post section.track-controls', 3);

          done();
        });
      });

      it('creates an agent directory if it does not exist already', done => {
        models.Agent.findOne({ email: 'troy@example.com' }).then(troy => {
 
          expect(fs.existsSync(`uploads/${troy.getAgentDirectory()}`)).toBe(false);
          browser.clickLink(`${troy.getAgentDirectory()}`, err => {
            if (err) return done.fail(err);
            browser.assert.success();
            expect(fs.existsSync(`uploads/${troy.getAgentDirectory()}`)).toBe(true);
            done();
          });
        }).catch(err => {
          done.fail(err);
        });
      });
    });

    describe('unauthorized', () => {

      beforeEach(done => {
        stubAuth0Sessions(agent.email, DOMAIN, err => {
          if (err) return done.fail(err);

          // Need a new session
          browser.visit('/', function(err) {
            if (err) return done.fail(err);

            // Login sudo agent agent
            browser.clickLink('Login', err => {
              if (err) done.fail(err);
              browser.assert.success();

              done();
            });
          });
        });
      });

      it('does not allow an agent to view an album for which he has not been granted access', done => {
        models.Agent.findOne({ email: 'troy@example.com' }).then(function(troy) {
          expect(agent.canRead.length).toEqual(1);
          expect(agent.canRead[0]).not.toEqual(troy._id);

          browser.visit(`/track/${troy.getAgentDirectory()}`, function(err) {
            if (err) return done.fail(err);
            browser.assert.redirected();
            browser.assert.url({ pathname: '/'});
            browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
            done();
          });
        }).catch(function(error) {
          done.fail(error);
        });
      });
    });
  });
});
