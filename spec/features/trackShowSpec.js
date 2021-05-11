const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../app');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');

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

describe('trackShowSpec', () => {
  let browser, agent, lanny;

  beforeEach(done => {
    delete process.env.SUDO;

    browser = new Browser({ waitDuration: '30s', loadCss: false });
    //browser.debug();
    fixtures.load(__dirname + '/../fixtures/agents.js', models.mongoose, err => {
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
      stubAuth0Sessions(agent.email, DOMAIN, err => {
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

            models.Agent.findOne({ email: 'daniel@example.com' }).then(results => {
              agent = results;

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

    afterEach(() => {
      mock.restore();
    });

    describe('authorized', () => {
      it('executes the wave audio visualizer client-side script', done => {
        let executed = false;
        // See foobar404/wave dependency
        let re = new RegExp('bundle\.iife\.js');

        browser.on('evaluated', (code, result, filename) => {
          if (re.test(filename)) {
            executed = true;
          }
        });

        browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
          if (err) return done.fail(err);
          expect(executed).toBe(true);
          done();
        });
      });

      describe('owner', () => {
        it('can click and view his own track', done => {
          browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}`});
          browser.assert.element(`.track figure figcaption a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`);
          browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
            if (err) return done.fail(err);
            browser.assert.success();

            browser.assert.element('article.post section.track figure figcaption h2');
            browser.assert.element('article.post section.track figure figcaption a');
            browser.assert.element('article.post section.track canvas#visualizer');
            browser.assert.element('article.post section.track figure audio ');
            browser.assert.element('article.post section.track-controls');

            browser.assert.element(`article.post header img.avatar[src="${agent.get('picture')}"]`);
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
          browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
            if (err) return done.fail(err);
            browser.assert.success();

            browser.assert.element('article.post section.track figure figcaption h2 span#track-name-field[contenteditable="true"]');
            browser.assert.element('article.post section.track figure figcaption h2 .editable-field-control');

            done();
          });
        });

        it('receives an editable track transcript field', done => {
          browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
            if (err) return done.fail(err);
            browser.assert.success();
            browser.assert.element('article.post section.track figure #track-transcript-field');
            browser.assert.attribute('article.post section.track figure #track-transcript-field', 'disabled', null);
            browser.assert.element('article.post section.track figure h3 .editable-field-control');
            done();
          });
        });
      });

      describe('sudo', () => {

         beforeEach(done => {
           process.env.SUDO = agent.email;

           agent.canRead.pop();
           agent.save().then(obj => {
             agent = obj;
             expect(agent.canRead.length).toEqual(0);
             done();
           }).catch(err => {
             done.fail(err);
           });
         });

        it('view a track', done => {
          browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
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
          browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
            if (err) return done.fail(err);
            browser.assert.success();

            browser.assert.element('article.post section.track figure figcaption h2 span#track-name-field[contenteditable="true"]');
            browser.assert.element('article.post section.track figure figcaption h2 .editable-field-control');
            done();
          });
        });

        it('receives an editable transcript field', done => {
          browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
            if (err) return done.fail(err);
            browser.assert.success();

            browser.assert.element('article.post section.track figure #track-transcript-field');
            browser.assert.attribute('article.post section.track figure #track-transcript-field', 'disabled', null);
            browser.assert.element('article.post section.track figure h3 .editable-field-control');
            done();
          });
        });
      });

      describe('canRead agent', () => {
        it('can view a track to which he has permission to read', done => {
          expect(agent.canRead.length).toEqual(1);
          expect(agent.canRead[0]).toEqual(lanny._id);

          browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
            if (err) return done.fail(err);
            browser.assert.success();
            browser.assert.element(`audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`);
            browser.assert.elements('.delete-track-form', 0);
            done();
          });
        });

        it('receives a non-editable track name field and does not display controls', done => {
          browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
            if (err) return done.fail(err);
            browser.assert.success();

            browser.assert.element('article.post section.track figure figcaption h2 span#track-name-field[contenteditable="false"]');
          browser.assert.element('article.post section.track figure figcaption h2 .editable-field-control[style="display:none;"]');
            done();
          });
        });

        it('receives a non-editable transcript field', done => {
          browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
            if (err) return done.fail(err);
            browser.assert.success();

            browser.assert.element('article.post section.track figure #track-transcript-field');
            browser.assert.attribute('article.post section.track figure #track-transcript-field', 'disabled', '');
            browser.assert.element('article.post section.track figure h3 .editable-field-control[style="display:none;"]');
            done();
          });
        });
      });
    });

    describe('unauthorized', () => {
      beforeEach(done => {
        // No permissions
        agent.canRead.pop();
        agent.save().then(agent => {
          expect(agent.canRead.length).toEqual(0);
          done();
        }).catch(error => {
          done.fail(error);
        });
      });

      it('does not allow an agent to view an album for which he has not been granted access', done => {
        browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
          if (err) return done.fail(err);
          browser.assert.redirected();
          browser.assert.url({ pathname: '/'});
          browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
          done();
        });
      });

      it('allows an agent to view a published track', done => {
        // Unpublished
        browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.url({ pathname: '/'});
          browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');

          // Published in setup above
          browser.visit(`/track/${lanny.getAgentDirectory()}/lanny2.ogg`, err => {
            if (err) return done.fail(err);

            browser.assert.elements('.alert.alert-danger', 0);
            browser.assert.element(`audio[src="/uploads/${lanny.getAgentDirectory()}/lanny2.ogg"]`);
            browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny2.ogg` });
            done();
          });
        });
      });

      it('does not display track editor controls', done => {
        // Published in setup above
        browser.visit(`/track/${lanny.getAgentDirectory()}/lanny2.ogg`, err => {
          if (err) return done.fail(err);

          // Name edit
          browser.assert.element('article.post section.track figure figcaption h2 span#track-name-field[contenteditable="false"]');
          browser.assert.element('article.post section.track figure figcaption h2 .editable-field-control[style="display:none;"]');

          // Transcript edit
          browser.assert.element('article.post section.track figure #track-transcript-field');
          browser.assert.attribute('article.post section.track figure #track-transcript-field', 'disabled', '');
          browser.assert.element('article.post section.track figure h3 .editable-field-control[style="display:none;"]');

          done();
        });
      });
    });
  });

  describe('unauthenticated', () => {
    it('redirects home (which is where the login form is located)', done => {
      browser.visit(`/track/${agent.getAgentDirectory()}/track2.ogg`, err => {
        if (err) return done.fail(err);
        browser.assert.redirected();
        browser.assert.url({ pathname: '/'});
        browser.assert.text('.alert.alert-danger', 'You need to login first');
        done();
      });
    });
  });
});
