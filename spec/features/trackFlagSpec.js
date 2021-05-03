'use strict';

const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');

const app = require('../../app');
const request = require('supertest');

const fs = require('fs');
const mkdirp = require('mkdirp');

const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

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


// For when system resources are scarce
jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('Flagging a track', () => {

  let browser, agent, lanny;

  beforeEach(done => {
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

  describe('unauthenticated', () => {
    it('does not allow flagging a track', done => {
      request(app)
        .patch(`/track/${agent.getAgentDirectory()}/track2.ogg/flag`)
        .end((err, res) => {
          if (err) return done.fail(err);
          expect(res.status).toEqual(302);
          expect(res.header.location).toEqual('/');
          done();
        });
    });

    it('doesn\'t allow viewing flagged resources', done => {
      browser.visit('/track/flagged', err => {
        if (err) return done.fail(err);
        browser.assert.success();

        browser.assert.url('/');
        browser.assert.text('.alert.alert-danger', 'You need to login first');
        done();
      });
    });
  });

  describe('from show view', () => {

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
            [`uploads/${lanny.getAgentDirectory()}`]: {
              'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'lanny3.ogg': fs.readFileSync('spec/files/troll.ogg'),
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
          ];
          models.Track.create(tracks).then(results => {

            browser.clickLink('Login', err => {
              if (err) done.fail(err);
              browser.assert.success();
              done();
            });
          }).catch(err => {
            done.fail(err);
          });
        });
      });

      afterEach(() => {
        mock.restore();
      });

      it('renders a form to allow an agent to flag a track', done => {
        browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.element('.flag-track-form');
          browser.assert.element(`form[action="/track/${agent.getAgentDirectory()}/track1.ogg/flag?_method=PATCH"][method="post"]`);
          done();
        });
      });

      describe('flagging', () => {
        describe('owner resource', () => {
          beforeEach(done => {
            browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('redirects to the referer if the flag is successful', done => {
            browser.pressButton('Flag post', err => {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-success', 'Track flagged');
              browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
              done();
            });
          });

          it('adds agent to list of flaggers and sets flagged attribute', done => {
            models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].flagged).toBe(false);
              expect(tracks[0].flaggers).toEqual([]);

              browser.pressButton('Flag post', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.find({ path: `uploads/${agent.getAgentDirectory()}/track1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].flagged).toBe(true);
                  expect(tracks[0].flaggers).toEqual([agent._id]);

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
           * Take note:
           *
           * Until broader administrative privileges can be established, a resource
           * owner will be able to un-flag his own track outside of sudo mode
           */
          it('disables the Publish button on the flagged track', done => {
            browser.visit(`/track/${agent.getAgentDirectory()}`, err => {
              if (err) return done.fail(err);
              browser.assert.element(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`)
              browser.assert.text(`form[action="/track/${agent.getAgentDirectory()}/track1.ogg"][method="post"] button.publish-track`, 'Publish');

              browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
                if (err) return done.fail(err);

                browser.pressButton('Flag post', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.elements(`form[action="/track/${agent.getAgentDirectory()}/track1.ogg/flag?_method=PATCH"][method="post"] button.publish-track`, 'Deflag');
                  done();
                });
              });
            });
          });

          it('redirects to the referer if the track is flagged', done => {
            browser.pressButton('Flag post', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              browser.visit(`/track/${agent.getAgentDirectory()}/track1.ogg`, err => {
                if (err) return done.fail(err);

                browser.assert.text('.alert.alert-danger', 'Track flagged');
                browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
                done();
              });
            });
          });
        });

        describe('readable resource', () => {
          beforeEach(done => {
            browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('shows a flag button', () => {
            browser.assert.element('.flag-track-form');
          });

          it('adds agent to list of flaggers and sets flagged attribute', done => {
            models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].flagged).toBe(false);
              expect(tracks[0].flaggers).toEqual([]);

              browser.pressButton('Flag post', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].flagged).toBe(true);
                  expect(tracks[0].flaggers).toEqual([agent._id]);

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

                browser.pressButton('Flag post', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.elements(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`, 0)
                  done();
                });
              });
            });
          });

          it('redirects to the referer if the track is flagged', done => {
            browser.pressButton('Flag post', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
                if (err) return done.fail(err);

                browser.assert.text('.alert.alert-danger', 'Track flagged');
                browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}` });
                done();
              });
            });
          });
        });

        describe('unauthorized resource', () => {
          let troy;
          beforeEach(done => {
            models.Agent.findOne({ email: 'troy@example.com' }).then(result => {
              troy = result;

              expect(agent.canRead.length).toEqual(1);
              expect(agent.canRead[0]).not.toEqual(troy._id);

              mkdirp(`uploads/${troy.getAgentDirectory()}`, err => {
                fs.writeFileSync(`uploads/${troy.getAgentDirectory()}/troy1.ogg`, fs.readFileSync('spec/files/troll.ogg'));

                const tracks = [
                  { path: `uploads/${troy.getAgentDirectory()}/troy1.ogg`, recordist: troy._id },
                ];
                models.Track.create(tracks).then(results => {

                  browser.visit(`/track/${troy.getAgentDirectory()}/troy1.ogg`, err => {
                    if (err) return done.fail(err);
                    done();
                  });
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(error => {
              done.fail(error);
            });
          });

          it('redirects home', () => {
            browser.assert.redirected();
            browser.assert.url({ pathname: '/'});
            browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
          });

          it('does not modify the database record', done => {
            models.Track.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.ogg`}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].flagged).toBe(false);
              expect(tracks[0].flaggers).toEqual([]);

              request(app)
                .patch(`/track/${troy.getAgentDirectory()}/troy1.ogg/flag`)
                .set('Cookie', browser.cookies)
                .expect(302)
                .end((err, res) => {
                  if (err) return done.fail(err);

                  models.Track.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.ogg`}).then(tracks => {
                    expect(tracks.length).toEqual(1);
                    expect(tracks[0].flagged).toBe(false);
                    expect(tracks[0].flaggers).toEqual([]);

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

        describe('sudo mode', () => {

          beforeEach(done => {
            browser.visit(`/track/${lanny.getAgentDirectory()}`, err => {
              if (err) return done.fail(err);

              browser.clickLink(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`, err => {
                if (err) return done.fail(err);

                browser.pressButton('Flag post', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  done();
                });
              });
            });
          });

          afterEach(() => {
            delete process.env.SUDO;
          });

          describe('not set', () => {
            it('shows a link to flagged resource page', done => {
              browser.visit('/', (err) => {
                browser.assert.elements('a[href="/track/flagged"]', 0);
                done();
              });
            });

            it('doesn\'t allow viewing flagged resources', done => {
              browser.visit('/track/flagged', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.url('/');
                browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
                done();
              });
            });

            it('does not allow de-flagging the track', done => {
              models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                expect(tracks.length).toEqual(1);
                expect(tracks[0].flagged).toBe(true);
                expect(tracks[0].flaggers).toEqual([agent._id]);

                request(app)
                  .patch(`/track/${lanny.getAgentDirectory()}/lanny1.ogg/flag`)
                  .set('Cookie', browser.cookies)
                  .set('Referer', `"/track/${lanny.getAgentDirectory()}/lanny1.ogg"`)
                  .expect(302)
                  .end((err, res) => {
                    if (err) return done.fail(err);

                    models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                      expect(tracks.length).toEqual(1);
                      expect(tracks[0].flagged).toBe(true);
                      expect(tracks[0].flaggers).toEqual([agent._id]);

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

          describe('set', () => {
            describe('non sudo agent', () => {

              beforeEach(() => {
                process.env.SUDO = 'lanny@example.com';
                expect(process.env.SUDO).not.toEqual(agent.email);
              });

              it('does not show a link to flagged resource page', done => {
                browser.visit('/', (err) => {
                  browser.assert.elements('a[href="/track/flagged"]', 0);
                  done();
                });
              });

              it('doesn\'t allow viewing flagged resources', done => {
                browser.assert.elements('a[href="/track/flagged"]', 0);
                browser.visit('/track/flagged', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.url('/');
                  browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
                  done();
                });
              });

              it('does not allow de-flagging the track', done => {
                models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].flagged).toBe(true);
                  expect(tracks[0].flaggers).toEqual([agent._id]);

                  request(app)
                    .patch(`/track/${lanny.getAgentDirectory()}/lanny1.ogg/flag`)
                    .set('Cookie', browser.cookies)
                    .set('Referer', `"/track/${lanny.getAgentDirectory()}/lanny1.ogg"`)
                    .expect(302)
                    .end((err, res) => {
                      if (err) return done.fail(err);

                      models.Track.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`}).then(tracks => {
                        expect(tracks.length).toEqual(1);
                        expect(tracks[0].flagged).toBe(true);
                        expect(tracks[0].flaggers).toEqual([agent._id]);

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

            describe('sudo agent', () => {

              beforeEach(()=> {
                process.env.SUDO = agent.email;
              });

              it('shows a link to flagged resource page', done => {
                browser.visit('/', (err) => {
                  browser.assert.element('a[href="/track/flagged"]');
                  done();
                });
              });

              it('is allowed to view flagged tracks', done => {
                browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, (err) => {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  browser.assert.text('.alert.alert-danger', 'Track flagged');
                  browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
                  done();
                });
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
                it('shows track on owner\'s page', done => {
                  browser.visit(`/track/${lanny.getAgentDirectory()}`, (err) => {
                    if (err) return done.fail(err);

                    browser.assert.elements(`.track figure audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`, 0);

                    browser.visit('/track/flagged', err => {
                      if (err) return done.fail(err);
                      browser.assert.elements(`form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/flag?_method=PATCH"][method="post"] button.publish-track`, 'Deflag');

                      browser.pressButton('Deflag', err => {
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

                it('does not allow track flagger to flag again', done => {
                  browser.visit('/track/flagged', err => {
                    if (err) return done.fail(err);
                    browser.assert.elements(`form[action="/track/${lanny.getAgentDirectory()}/lanny1.ogg/flag?_method=PATCH"][method="post"] button.publish-track`, 'Deflag');

                    browser.pressButton('Deflag', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      process.env.SUDO = 'lanny@example.com';

                      browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
                        if (err) return done.fail(err);
                        browser.assert.element(`.track figure audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`);

                        browser.pressButton('Flag post', err => {
                          if (err) return done.fail(err);
                          browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}` });

                          browser.assert.text('.alert.alert-danger', 'This post has administrative approval');
                          browser.assert.element(`.track figure audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`);

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
  });

  describe('from index view', () => {

    describe('unauthenticated', () => {
      it('does not show the flag button', done => {
        browser.visit('/', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.assert.elements('.flag-track', 0);
          done();
        });
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
            [`uploads/${lanny.getAgentDirectory()}`]: {
              'lanny1.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'lanny2.ogg': fs.readFileSync('spec/files/troll.ogg'),
              'lanny3.ogg': fs.readFileSync('spec/files/troll.ogg'),
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
          ];
          models.Track.create(tracks).then(results => {

            browser.clickLink('Login', err => {
              if (err) done.fail(err);
              browser.assert.success();
              browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
              done();
            });
          }).catch(err => {
            done.fail(err);
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

          browser.pressButton('Flag post', err => {
            if (err) return done.fail(err);
            browser.assert.success();
            browser.assert.text('.alert.alert-success', 'Track flagged');
            browser.assert.url({ pathname: '/' });
            done();
          });
        });

        it('adds agent to list of flaggers and sets flagged attribute', done => {
          models.Track.find({}).sort({updatedAt: 'desc'}).then(tracks => {
            expect(tracks.length).toEqual(6);
            expect(tracks[0].flagged).toBe(false);
            expect(tracks[0].flaggers).toEqual([]);

            browser.pressButton('Flag post', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              models.Track.find({}).sort({updatedAt: 'desc'}).then(tracks => {
                expect(tracks.length).toEqual(6);
                expect(tracks[0].flagged).toBe(true);
                expect(tracks[0].flaggers).toEqual([agent._id]);

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
            browser.pressButton('Flag post', err => {
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

        describe('sudo mode', () => {

          let track;
          beforeEach(done => {
            models.Track.find({ published: { '$ne': null } }).sort({ published: 'desc' }).populate('recordist').then(tracks => {
              track = tracks[0];

              browser.visit('/', err => {
                if (err) return done.fail(err);

                browser.pressButton('Flag post', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  done();
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          afterEach(() => {
            delete process.env.SUDO;
          });

          describe('not set', () => {

            it('doesn\'t allow viewing flagged resources', done => {
              browser.visit('/track/flagged', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                browser.assert.url('/');
                browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
                done();
              });
            });

            it('does not allow de-flagging the track', done => {
              models.Track.find({ path: track.path }).then(tracks => {
                expect(tracks.length).toEqual(1);
                expect(tracks[0].flagged).toBe(true);
                expect(tracks[0].flaggers).toEqual([agent._id]);

                request(app)
                  .patch(`/${track.path.replace('uploads', 'track')}/flag`)
                  .set('Cookie', browser.cookies)
                  .set('Referer', `/${track.path.replace('uploads', 'track')}`)
                  .expect(302)
                  .end((err, res) => {
                    if (err) return done.fail(err);

                    models.Track.find({ path: track.path }).then(tracks => {
                      expect(tracks.length).toEqual(1);
                      expect(tracks[0].flagged).toBe(true);
                      expect(tracks[0].flaggers).toEqual([agent._id]);

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

          describe('set', () => {
            describe('non sudo agent', () => {

              beforeEach(() => {
                process.env.SUDO = 'lanny@example.com';
                expect(process.env.SUDO).not.toEqual(agent.email);
              });

              it('doesn\'t allow viewing flagged resources', done => {
                browser.visit('/track/flagged', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.url('/');
                  browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
                  done();
                });
              });

              it('does not allow de-flagging the track', done => {
                models.Track.find({ path: track.path }).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].flagged).toBe(true);
                  expect(tracks[0].flaggers).toEqual([agent._id]);

                  request(app)
                    .patch(`/${track.path.replace('uploads', 'track')}/flag`)
                    .set('Cookie', browser.cookies)
                    .set('Referer', `/${track.path.replace('uploads', 'track')}`)
                    .expect(302)
                    .end((err, res) => {
                      if (err) return done.fail(err);

                      models.Track.find({ path: track.path }).then(tracks => {
                        expect(tracks.length).toEqual(1);
                        expect(tracks[0].flagged).toBe(true);
                        expect(tracks[0].flaggers).toEqual([agent._id]);

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

            describe('sudo agent', () => {

              beforeEach(() => {
                process.env.SUDO = agent.email;
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

              it('renders flagged resources with management UI', done => {
                browser.visit('/track/flagged', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.elements('section.track audio', 1);
                  browser.assert.element(`.track audio[src="/${track.path}"]`);
                  browser.assert.element(`.track a[href="/${track.path.replace('uploads', 'track')}"]`);
                  browser.assert.element(`form[action="/${track.path.replace('uploads', 'track')}/flag?_method=PATCH"][method="post"]`);
                  browser.assert.element(`form[action="/${track.path.replace('uploads', 'track')}?_method=DELETE"]`);
                  done();
                });
              });

              describe('deflagging', () => {
                it('shows track on landing page', done => {
                  browser.visit('/', (err) => {
                    if (err) return done.fail(err);

                    browser.assert.elements(`.track a[href="/${track.path.replace('uploads', 'track')}"] img[src="/${track.path}"]`, 0);

                    browser.visit('/track/flagged', err => {
                      if (err) return done.fail(err);
                      browser.assert.elements(`form[action="/${track.path.replace('uploads', 'track')}/flag?_method=PATCH"][method="post"] button.publish-track`, 'Deflag');

                      browser.pressButton('Deflag', err => {
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

                it('does not allow track flagger to flag again', done => {
                  browser.visit('/track/flagged', err => {
                    if (err) return done.fail(err);
                    browser.assert.elements(`form[action="/${track.path.replace('uploads', 'track')}flag?_method=PATCH"][method="post"] button.publish-track`, 'Deflag');

                    browser.pressButton('Deflag', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      process.env.SUDO = 'lanny@example.com';

                      browser.visit(`/${track.path.replace('uploads', 'track')}`, err => {
                        if (err) return done.fail(err);
                        //browser.assert.element(`.track img[src="/${track.path}"]`);
                        browser.assert.element(`.track figure audio[src="/${track.path}"]`);

                        browser.pressButton('Flag post', err => {
                          if (err) return done.fail(err);
                          browser.assert.url({ pathname: `/track/${track.recordist.getAgentDirectory()}` });

                          browser.assert.text('.alert.alert-danger', 'This post has administrative approval');
                          browser.assert.element(`.track figure figcaption a[href="/${track.path.replace('uploads', 'track')}"]`);

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
  });
});
