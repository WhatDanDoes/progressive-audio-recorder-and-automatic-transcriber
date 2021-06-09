'use strict';

const fixtures = require('pow-mongoose-fixtures');
const models = require('../../../models');

const app = require('../../../app');
const request = require('supertest');

const fs = require('fs');
const mkdirp = require('mkdirp');

const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

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


// For when system resources are scarce
jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('sudo Flagging a track', () => {

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

  describe('from show view', () => {

    describe('authenticated', () => {

      let root;
      beforeEach(done => {
        expect(process.env.SUDO).toBeDefined();
        stubAuth0Sessions(process.env.SUDO, DOMAIN, err => {
          if (err) return done.fail(err);

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();

            browser.clickLink('Admin', function(err) {
              if (err) return done.fail(err);
              browser.assert.success();

              models.Agent.findOne({ email: process.env.SUDO }).then(results => {
                root = results;

                mockAndUnmock({
                  [`uploads/${agent.getAgentDirectory()}`]: {
                    'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'track3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  [`uploads/${lanny.getAgentDirectory()}`]: {
                    'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'lanny3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  [`uploads/${root.getAgentDirectory()}`]: {
                    'root1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'root2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'root3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  'public/tracks/uploads': {}
                });

                const tracks = [
                  { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id },
                  { path: `uploads/${agent.getAgentDirectory()}/track2.ogg`, recordist: agent._id },
                  { path: `uploads/${agent.getAgentDirectory()}/track3.ogg`, recordist: agent._id },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`, recordist: lanny._id },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny2.ogg`, recordist: lanny._id },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny3.ogg`, recordist: lanny._id },
                  { path: `uploads/${root.getAgentDirectory()}/root1.ogg`, recordist: root._id },
                  { path: `uploads/${root.getAgentDirectory()}/root2.ogg`, recordist: root._id },
                  { path: `uploads/${root.getAgentDirectory()}/root3.ogg`, recordist: root._id },
                ];
                models.Track.create(tracks).then(results => {
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              }).catch(err => {
                done.fail(err);
              });
            });
          });
        });
      });

      afterEach(() => {
        mock.restore();
      });

      it('renders a form to allow root to flag a track', done => {
        browser.clickLink('Tracks', err => {
          if (err) return done.fail(err);
          browser.clickLink(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`, err => {
            if (err) return done.fail(err);
            browser.assert.success();
            browser.assert.element('.flag-track-form');
            browser.assert.element(`form[action="/track/${root.getAgentDirectory()}/root1.ogg/flag?_method=PATCH"][method="post"]`);
            done();
          });
        });
      });

      describe('flagging', () => {

        describe('root\'s own resource', () => {
          beforeEach(done => {
            browser.clickLink('Tracks', err => {
              if (err) return done.fail(err);
              browser.clickLink(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`, err => {
                if (err) return done.fail(err);
                browser.assert.success();
                done();
              });
            });
          });

          it('redirects to the referer if the flag is successful', done => {
            browser.pressButton('button[aria-label="Flag"]', err => {
              if (err) return done.fail(err);
              browser.assert.success();
              browser.assert.text('.alert.alert-success', 'Track flagged');
              browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}` });
              done();
            });
          });

          it('adds root to list of flaggers and sets flagged attribute', done => {
            models.Track.find({ path: `uploads/${root.getAgentDirectory()}/root1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].flagged).toBe(false);
              expect(tracks[0].flaggers).toEqual([]);

              browser.pressButton('button[aria-label="Flag"]', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.find({ path: `uploads/${root.getAgentDirectory()}/root1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].flagged).toBe(true);
                  expect(tracks[0].flaggers).toEqual([root._id]);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          /**
           * root can deflag his own track
           */
          it('disables the Publish button on the flagged track', done => {
            browser.visit(`/track/${root.getAgentDirectory()}`, err => {
              if (err) return done.fail(err);
              browser.assert.element(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`)
              browser.assert.element(`form[action="/track/${root.getAgentDirectory()}/root1.ogg"][method="post"] button.publish-track[aria-label="Publish"]`);

              browser.clickLink(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`, err => {
                if (err) return done.fail(err);

                browser.pressButton('button[aria-label="Flag"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.element(`form[action="/track/${root.getAgentDirectory()}/root1.ogg/flag?_method=PATCH"][method="post"] button.publish-track[aria-label="Deflag"]`);
                  done();
                });
              });
            });
          });

          it('allows root to view the flagged track', done => {
            browser.pressButton('button[aria-label="Flag"]', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              browser.visit(`/track/${root.getAgentDirectory()}/root1.ogg`, err => {
                if (err) return done.fail(err);

                browser.assert.text('.alert.alert-danger', 'Track flagged');
                browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}/root1.ogg` });
                done();
              });
            });
          });
        });

        describe('non-sudo resource', () => {
          beforeEach(done => {
            browser.clickLink(lanny.getAgentDirectory(), err => {
              if (err) return done.fail(err);
              browser.clickLink(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`, err => {
                if (err) return done.fail(err);
                browser.assert.success();
                done();
              });
            });
          });

          it('shows a flag button', () => {
            browser.assert.element('.flag-track-form');
          });

          it('adds root to list of flaggers and sets flagged attribute', done => {
            models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].flagged).toBe(false);
              expect(tracks[0].flaggers).toEqual([]);

              browser.pressButton('button[aria-label="Flag"]', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].flagged).toBe(true);
                  expect(tracks[0].flaggers).toEqual([root._id]);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          it('does not display the flagged track on the referer page', done => {
            browser.visit(`/track/${lanny.getAgentDirectory()}`, err => {
              if (err) return done.fail(err);
              browser.assert.element(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`)

              browser.clickLink(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`, err => {
                if (err) return done.fail(err);

                browser.pressButton('button[aria-label="Flag"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.elements(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`, 0)
                  done();
                });
              });
            });
          });

          it('allows root to view the flagged track', done => {
            browser.pressButton('button[aria-label="Flag"]', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
                if (err) return done.fail(err);

                browser.assert.text('.alert.alert-danger', 'Track flagged');
                browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
                done();
              });
            });
          });
        });

        describe('Flagged resources page', () => {
          beforeEach(done => {
            browser.clickLink(lanny.getAgentDirectory(), err => {
              if (err) return done.fail(err);
              browser.clickLink(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`, err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.pressButton('button[aria-label="Flag"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  done();
                });
              });
            });
          });

          it('shows a link', () => {
            browser.assert.element('a[href="/track/flagged"]');
          });

          it('renders flagged resources with management UI', done => {
            browser.visit('/track/flagged', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              browser.assert.elements('section.track audio', 1);
              browser.assert.element(`.track audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`);
              browser.assert.element(`.track a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`);
              browser.assert.element(`form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/flag?_method=PATCH"][method="post"]`);
              browser.assert.element(`form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg?_method=DELETE"]`);
              done();
            });
          });

          describe('deflagging', () => {

            it('restores track to owner\'s page', done => {
              browser.visit(`/track/${lanny.getAgentDirectory()}`, (err) => {
                if (err) return done.fail(err);

                browser.assert.elements(`.track figure audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`, 0);

                browser.visit('/track/flagged', err => {
                  if (err) return done.fail(err);
                  browser.assert.element(`form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/flag?_method=PATCH"][method="post"] button.publish-track[aria-label="Deflag"]`);

                  browser.pressButton('button[aria-label="Deflag"]', err => {
                    if (err) return done.fail(err);
                    browser.assert.success();

                    browser.visit(`/track/${lanny.getAgentDirectory()}`, (err) => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      browser.assert.elements(`.track figure audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`);
                      done();
                    });
                  });
                });
              });
            });

            it('does allow sudo to flag again', done => {
              browser.clickLink('Flagged', err => {
                if (err) return done.fail(err);
                browser.assert.element(`form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/flag?_method=PATCH"][method="post"] button.publish-track[aria-label="Deflag"]`);

                browser.pressButton('button[aria-label="Deflag"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
                    if (err) return done.fail(err);
                    browser.assert.element(`.track figure audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`);

                    browser.pressButton('button[aria-label="Flag"]', err => {
                      if (err) return done.fail(err);
                      browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}` });

                      browser.assert.text('.alert.alert-success', 'Track flagged');
                      browser.assert.elements(`.track figure audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`, 0);

                      browser.visit('/track/flagged', err => {
                        if (err) return done.fail(err);
                        browser.assert.success();

                        browser.assert.element(`form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/flag?_method=PATCH"][method="post"] button.publish-track[aria-label="Deflag"]`);

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

  describe('from index view', () => {

    describe('authenticated', () => {

      let root;
      beforeEach(done => {
        expect(process.env.SUDO).toBeDefined();
        stubAuth0Sessions(process.env.SUDO, DOMAIN, err => {
          if (err) return done.fail(err);

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();

            browser.clickLink('Admin', function(err) {
              if (err) return done.fail(err);
              browser.assert.success();

              models.Agent.findOne({ email: process.env.SUDO }).then(results => {
                root = results;

                mockAndUnmock({
                  [`uploads/${agent.getAgentDirectory()}`]: {
                    'track1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'track2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'track3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  [`uploads/${lanny.getAgentDirectory()}`]: {
                    'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'lanny3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  [`uploads/${root.getAgentDirectory()}`]: {
                    'root1.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'root2.ogg': fs.readFileSync('spec/files/troll.ogg'),
                    'root3.ogg': fs.readFileSync('spec/files/troll.ogg'),
                  },
                  'public/tracks/uploads': {}
                });

                const tracks = [
                  { path: `uploads/${agent.getAgentDirectory()}/track1.ogg`, recordist: agent._id, published: new Date() },
                  { path: `uploads/${agent.getAgentDirectory()}/track2.ogg`, recordist: agent._id, published: new Date() },
                  { path: `uploads/${agent.getAgentDirectory()}/track3.ogg`, recordist: agent._id },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`, recordist: lanny._id, published: new Date() },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny2.ogg`, recordist: lanny._id, published: new Date() },
                  { path: `uploads/${lanny.getAgentDirectory()}/lanny3.ogg`, recordist: lanny._id },
                  { path: `uploads/${root.getAgentDirectory()}/root1.ogg`, recordist: root._id },
                  { path: `uploads/${root.getAgentDirectory()}/root2.ogg`, recordist: root._id },
                  { path: `uploads/${root.getAgentDirectory()}/root3.ogg`, recordist: root._id },
                ];
                models.Track.create(tracks).then(results => {
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              }).catch(err => {
                done.fail(err);
              });
            });
          });
        });
      });

      afterEach(() => {
        mock.restore();
      });

      it('renders forms to allow an agent to flag tracks', done => {
        browser.visit('/', err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.elements('.flag-track-form', 4);
          browser.assert.elements('button.flag-track', 4);
          done();
        });
      });

      describe('flagging', () => {
        beforeEach(done => {
          browser.visit('/', err => {
            if (err) return done.fail(err);
            browser.assert.success();
            done();
          });
        });

        it('redirects to home if the flag is successful', done => {
          //
          // Careful here... this is pressing the first button. There are four Flag buttons
          //
          // If this flakes out somehow, remember this:
          //   browser.document.forms[0].submit();
          //
          // 2020-10-2 https://stackoverflow.com/a/40264336/1356582
          //

          browser.pressButton('button[aria-label="Flag"]', err => {
            if (err) return done.fail(err);
            browser.assert.success();
            browser.assert.text('.alert.alert-success', 'Track flagged');
            browser.assert.url({ pathname: '/' });
            done();
          });
        });

        it('adds agent to list of flaggers and sets flagged attribute', done => {
          models.Track.find({}).sort({updatedAt: 'desc'}).then(tracks => {
            expect(tracks.length).toEqual(9);
            expect(tracks[0].flagged).toBe(false);
            expect(tracks[0].flaggers).toEqual([]);

            browser.pressButton('button[aria-label="Flag"]', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              models.Track.find({}).sort({updatedAt: 'desc'}).then(tracks => {
                expect(tracks.length).toEqual(9);
                expect(tracks[0].flagged).toBe(true);
                expect(tracks[0].flaggers).toEqual([root._id]);

                done();
              }).catch(err => {
                done.fail(err);
              });
            });
          }).catch(err => {
            done.fail(err);
          });
        });

        it('does not display the flagged track on the referer page', done => {
          // Need to know what's at the top of the roll
          models.Track.find({ published: { '$ne': null } }).sort({ published: 'desc' }).then(tracks => {

            browser.assert.url('/');
            browser.assert.element(`a[href="/${tracks[0].path.replace('uploads', 'track')}"]`)
            browser.pressButton('button[aria-label="Flag"]', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              browser.assert.url('/');
              browser.assert.elements(`a[href="/${tracks[0].path.replace('uploads', 'track')}"]`, 0)
              done();
            });

          }).catch(err => {
            done.fail(err);
          });
        });

        describe('Flagged resources page', () => {
          let track;
          beforeEach(done => {
            models.Track.find({ published: { '$ne': null } }).sort({ published: 'desc' }).populate('recordist').then(tracks => {
              track = tracks[0];

              browser.visit('/', err => {
                if (err) return done.fail(err);

                browser.pressButton('button[aria-label="Flag"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.clickLink('Flagged', err => {
                    if (err) return done.fail(err);
                    browser.assert.success();

                    done();
                  });
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          it('allows de-flagging the track', done => {
            models.Track.find({ path: track.path }).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].flagged).toBe(true);
              expect(tracks[0].flaggers).toEqual([root._id]);

              browser.pressButton('button[aria-label="Deflag"]', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.find({ path: track.path }).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].flagged).toBe(false);
                  expect(tracks[0].flaggers).toEqual([root._id]);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          it('is allowed to view flagged tracks', done => {
            browser.visit(`/${track.path.replace('uploads', 'track')}`, err => {
              if (err) return done.fail(err);
              browser.assert.success();
              browser.assert.text('.alert.alert-danger', 'Track flagged');
              browser.assert.url({ pathname: `/${track.path.replace('uploads', 'track')}` });
              done();
            });
          });

          it('renders flagged resources with management UI', () => {
            browser.assert.elements('section.track audio', 1);
            browser.assert.element(`.track audio[src="/${track.path}"]`);
            browser.assert.element(`.track a[href="/${track.path.replace('uploads', 'track')}"]`);
            browser.assert.element(`form[action="/${track.path.replace('uploads', 'track')}/flag?_method=PATCH"][method="post"]`);
            browser.assert.element(`form[action="/${track.path.replace('uploads', 'track')}?_method=DELETE"]`);
          });

          describe('deflagging', () => {
            it('shows track on landing page', done => {
              browser.visit('/', (err) => {
                if (err) return done.fail(err);

                browser.assert.elements(`.track a[href="/${track.path.replace('uploads', 'track')}"] img[src="/${track.path}"]`, 0);

                browser.visit('/track/flagged', err => {
                  if (err) return done.fail(err);
                  browser.assert.element(`form[action="/${track.path.replace('uploads', 'track')}/flag?_method=PATCH"][method="post"] button.publish-track[aria-label="Deflag"]`);

                  browser.pressButton('button[aria-label="Deflag"]', err => {
                    if (err) return done.fail(err);
                    browser.assert.success();

                    browser.visit('/', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      browser.assert.element(`.track audio[src="/${track.path}"]`);
                      browser.assert.element(`.track a[href="/${track.path.replace('uploads', 'track')}"]`);
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
