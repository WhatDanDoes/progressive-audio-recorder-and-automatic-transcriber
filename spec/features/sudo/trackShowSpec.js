const Browser = require('zombie');
const request = require('supertest');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../../app');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../../models');

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

describe('sudo trackShowSpec', () => {
  let browser, agent, lanny;

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
    models.mongoose.connection.db.dropDatabase().then((err, result) => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  describe('authenticated', () => {
    beforeEach(done => {
      expect(process.env.SUDO).toBeDefined();
      stubAuth0Sessions(process.env.SUDO, DOMAIN, err => {
        if (err) done.fail(err);

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
          { path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`, recordist: lanny._id },
          { path: `uploads/${lanny.getAgentDirectory()}/lanny2.ogg`, recordist: lanny._id, published: new Date() },
        ];
        models.Track.create(tracks).then(results => {

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();

            browser.clickLink('Admin', err => {
              if (err) done.fail(err);
              done();
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
        browser.clickLink(lanny.getAgentDirectory(), err => {
          if (err) done.fail(err);
          browser.assert.success();

          done();
        });
      });

      it('view a track', done => {
        browser.clickLink('lanny1.ogg', err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg`});

          browser.assert.element('article.post section.track figure figcaption h2');
          browser.assert.element('article.post section.track figure figcaption a');
          browser.assert.element('article.post section.track canvas#visualizer');
          browser.assert.element('article.post section.track figure audio ');
          browser.assert.element('article.post section.track-controls');

          browser.assert.element('article.post header img.avatar');
          browser.assert.element('article.post header aside div');
          browser.assert.element('article.post header aside time');
          browser.assert.element('article.post header span.post-menu');
          browser.assert.element('article.post section.feedback-controls');
          browser.assert.element('article.post section.feedback-controls i.like-button');
          browser.assert.element('.delete-track-form');
          browser.assert.element('.publish-track-form');

          done();
        });
      });

      it('receives an editable track name field', done => {
        browser.clickLink('lanny1.ogg', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.assert.element('article.post section.track figure figcaption h2 span#track-name-field[contenteditable="true"]');
          browser.assert.element('article.post section.track figure figcaption h2 .editable-field-control');
          done();
        });
      });

      it('receives an editable transcript field', done => {
        browser.clickLink('lanny1.ogg', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.assert.element('article.post section.track figure #track-transcript-field');
          browser.assert.attribute('article.post section.track figure #track-transcript-field', 'disabled', null);
          browser.assert.element('article.post section.track figure h3 .editable-field-control');
          done();
        });
      });

      it('is able to listen to the track', done => {
        request(app)
          .post(`/uploads/${lanny.getAgentDirectory()}/lanny1.ogg`)
          .set('Cookie', browser.cookies)
          .expect(200)
          .end((err, res) => {
            if (err) return done.fail(err);
  
            done();
          });
      });
    });
  });
});
