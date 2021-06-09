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
            browser.pressButton('button[aria-label="Flag"]', err => {
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

              browser.pressButton('button[aria-label="Flag"]', err => {
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

          it('does not display a Publish button on the flagged track', done => {
            browser.visit(`/track/${agent.getAgentDirectory()}`, err => {
              if (err) return done.fail(err);
              browser.assert.element(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`)
              browser.assert.elements(`button.publish-track[aria-label="Publish"]`, 0);

              browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, err => {
                if (err) return done.fail(err);

                browser.pressButton('button[aria-label="Flag"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.elements(`button.publish-track[aria-label="Deflag"]`, 0);
                  browser.assert.elements(`button.publish-track[aria-label="Publish"]`, 0);
                  done();
                });
              });
            });
          });

          it('redirects to the referer if the track is flagged', done => {
            browser.pressButton('button[aria-label="Flag"]', err => {
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

              browser.pressButton('button[aria-label="Flag"]', err => {
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

                browser.pressButton('button[aria-label="Flag"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.elements(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`, 0)
                  done();
                });
              });
            });
          });

          it('redirects to the referer if the track is flagged', done => {
            browser.pressButton('button[aria-label="Flag"]', err => {
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

          it('does not allow track flagger to flag again', done => {
            browser.pressButton('button[aria-label="Flag"]', err => {
              if (err) return done.fail(err);
              browser.assert.success();

              models.Track.findOneAndUpdate({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg` }, { flagged: false }, { new: true }).then(track => {
                expect(track.flagged).toBe(false);
                expect(track.flaggers.length).toEqual(1);

                browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
                  if (err) return done.fail(err);
                  browser.assert.element(`.track figure audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`);

                  browser.pressButton('button[aria-label="Flag"]', err => {
                    if (err) return done.fail(err);
                    browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}` });

                    browser.assert.text('.alert.alert-danger', 'This post has administrative approval');
                    browser.assert.element(`.track figure audio[src="/uploads/${lanny.getAgentDirectory()}/lanny1.ogg"]`);

                    done();
                  });
                });
              }).catch(err => {
                done.fail(err);
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

        describe('Flagged resource page', () => {

          beforeEach(done => {
            browser.visit(`/track/${lanny.getAgentDirectory()}`, err => {
              if (err) return done.fail(err);

              browser.clickLink(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`, err => {
                if (err) return done.fail(err);

                browser.pressButton('button[aria-label="Flag"]', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  done();
                });
              });
            });
          });

          it('does not show a link', done => {
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

      describe('agent canRead resource', () => {

        beforeEach(done => {
          expect(agent.canRead.length).toEqual(1);
          expect(agent.canRead[0]).toEqual(lanny._id);
          done();
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
              expect(tracks.length).toEqual(6);
              expect(tracks[0].flagged).toBe(false);
              expect(tracks[0].flaggers).toEqual([]);

              browser.pressButton('button[aria-label="Flag"]', err => {
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

          describe('Flagged resource page', () => {

            let track;
            beforeEach(done => {
              models.Track.find({ published: { '$ne': null } }).sort({ published: 'desc' }).populate('recordist').then(tracks => {
                track = tracks[0];

                browser.visit('/', err => {
                  if (err) return done.fail(err);

                  browser.pressButton('button[aria-label="Flag"]', err => {
                    if (err) return done.fail(err);
                    browser.assert.success();

                    done();
                  });
                });
              }).catch(err => {
                done.fail(err);
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
        });
      });

      describe('agent has no special access to resource', () => {

        beforeEach(done => {
          agent.canRead.pop();
          agent.save().then(obj => {
            agent = obj;
            expect(agent.canRead.length).toEqual(0);
            done();
          }).catch(err => {
            done.fail(err);
          });
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
            models.Track.deleteMany({}).then(res => {
              const tracks = [
                { path: `uploads/${lanny.getAgentDirectory()}/lanny1.ogg`, recordist: lanny._id, published: new Date() },
              ];
              models.Track.create(tracks).then(results => {

                browser.visit('/', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  browser.assert.url({ pathname: '/' });
                  browser.assert.element('.flag-track-form');
                  browser.assert.element('button.flag-track');

                  done();
                });
              }).catch(err => {
                done.fail(err);
              });
            }).catch(err => {
              done.fail(err);
            });
          });

          it('redirects to home if the flag is successful', done => {
            //
            // Careful here...
            //
            // I made sure there is only one track to flag
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
              expect(tracks.length).toEqual(1);
              expect(tracks[0].flagged).toBe(false);
              expect(tracks[0].flaggers).toEqual([]);

              browser.pressButton('button[aria-label="Flag"]', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Track.find({}).sort({updatedAt: 'desc'}).then(tracks => {
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
        });
      });
    });
  });
});
