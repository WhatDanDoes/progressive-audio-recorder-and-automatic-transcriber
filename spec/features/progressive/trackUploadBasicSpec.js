const fs = require('fs');
const fixtures = require('pow-mongoose-fixtures');

const app = require('../../../app');
const models = require('../../../models');

const mock = require('mock-fs');
const mockAndUnmock = require('../../support/mockAndUnmock')(mock);

const jwt = require('jsonwebtoken');

// For browser tests
const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);
const stubAuth0Sessions = require('../../support/stubAuth0Sessions');

describe('track upload basic', () => {

  let agent, token;

  beforeEach(done => {
    fixtures.load(__dirname + '/../../fixtures/agents.js', models.mongoose, function(err) {
      if (err) {
        return done.fail(err);
      }
      models.Agent.findOne({ email: 'daniel@example.com' }).then(function(results) {
        agent = results;
        token = jwt.sign({ email: agent.email }, process.env.SECRET, { expiresIn: '1h' });

        // Stubbing way up here because required files get mocked out otherwise
        stubAuth0Sessions(agent.email, DOMAIN, err => {
          if (err) done.fail(err);

          mockAndUnmock({
            'uploads': mock.directory({}),
          });

          done();
        });

      }).catch(error => {
        done.fail(error);
      });
    });
  });

  afterEach(done => {
    mock.restore();
    models.mongoose.connection.db.dropDatabase().then(result => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  describe('browser', () => {
    let browser, lanny;

    beforeEach(done => {

      browser = new Browser({ waitDuration: '30s', loadCss: false });
      //browser.debug();

      models.Agent.findOne({ email: 'lanny@example.com' }).then(results => {
        lanny = results;
        browser.visit('/', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();
            browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
            done();
          });
        });
      }).catch(error => {
        done.fail(error);
      });
    });

    describe('unauthenticated access', () => {
      beforeEach(done => {
        // Expire all sessions
        models.db.collection('sessions').updateMany({}, { $currentDate: {expires: true} }).then(result => {
          done();
        }).catch(err => {
          done.fail(err);
        });
      });

      it('redirects home with a friendly error message', done => {
        // Attaching a file fires the `submit` event. No need to click anything
        browser.attach('docs', 'spec/files/troll.ogg').then(res => {
          browser.assert.redirected();
          browser.assert.url({ pathname: '/' });
          browser.assert.text('.alert.alert-danger', 'You need to login first');
          done();
        });
      });

      it('does not write a file to the file system', done => {
        fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
          if (err) {
            return done.fail(err);
          }
          expect(files.length).toEqual(0);

          browser.attach('docs', 'spec/files/troll.ogg').then(res => {
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
              if (err) {
                return done.fail(err);
              }
              expect(files.length).toEqual(0);
              done();
            });
          });
        });
      });

      it('does not create a database record', done => {
        models.Track.find({}).then(tracks => {
          expect(tracks.length).toEqual(0);
          browser.attach('docs', 'spec/files/troll.ogg').then(res => {
            models.Track.find({}).then(tracks => {
              expect(tracks.length).toEqual(0);
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

    describe('authenticated access', () => {
      it('displays a friendly message upon successful receipt of file', done => {
        browser.attach('docs', 'spec/files/troll.ogg').then(res => {
          browser.assert.redirected();
          browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
          browser.assert.text('.alert.alert-success', 'Track received');
          done();
        }).catch(err => {
          done.fail(err);
        });
      });

      it('writes the file to the disk on agent\'s first access', done => {
        fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
          if (err) {
            return done.fail(err);
          }
          expect(files.length).toEqual(0);

          browser.attach('docs', 'spec/files/troll.ogg').then(res => {

            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {

              if (err) {
                return done.fail(err);
              }
              expect(files.length).toEqual(1);

              done();
            });
          }).catch(err => {
            done.fail(err);
          });
        });
      });

      // 2021-2-22
      //
      // This actually meant to test multiple file uploads in one action.
      // Currently attaching a file to the `input` triggers an immediate
      // `submit`, which makes attaching more than one file impossible.
      //
      // Noted here so that it can be revisited as progressive app features
      // continue to take shape
      //
      it('writes multiple attached files to disk', done => {

        fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
          if (err) {
            return done.fail(err);
          }
          expect(files.length).toEqual(0);

          browser.attach('docs', 'spec/files/troll.ogg').then(res => {

            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {

              if (err) {
                return done.fail(err);
              }
              expect(files.length).toEqual(1);

              browser.attach('docs', 'spec/files/troll.png').then(res => {

                fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {

                  if (err) {
                    return done.fail(err);
                  }
                  expect(files.length).toEqual(2);

                  done();
                });
              }).catch(err => {
                done.fail(err);
              });
            });
          }).catch(err => {
            done.fail(err);
          });
        });
      });

      it('creates a database record', done => {
        models.Track.find({}).then(tracks => {
          expect(tracks.length).toEqual(0);

          browser.attach('docs', 'spec/files/troll.png').then(res => {
            models.Track.find({}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);

              done();
            }).catch(err => {
              done.fail(err);
            });
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      it('writes a database record for each attached file', done => {
        models.Track.find({}).then(tracks => {
          expect(tracks.length).toEqual(0);

          browser.attach('docs', 'spec/files/troll.ogg').then(res => {
            models.Track.find({}).then(tracks => {
              expect(tracks.length).toEqual(1);
              expect(tracks[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);

              browser.attach('docs', 'spec/files/troll.png').then(res => {
                models.Track.find({}).then(tracks => {
                  expect(tracks.length).toEqual(2);
                  expect(tracks[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);
                  expect(tracks[1].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              }).catch(err => {
                done.fail(err);
              });
            }).catch(err => {
              done.fail(err);
            });
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      describe('Flashlight ASR', () => {
        const child_process = require('child_process');

        let _asrCommand, asrSpyReturnValue;
        beforeEach(() => {
          asrSpyReturnValue = 'behold the power of automatic speech recognition';
          _asrCommand = process.env.ASR_COMMAND;

          spyOn(child_process, 'exec').and.callFake(function(command, done) {
            return done(null, asrSpyReturnValue);
          });
        });

        afterEach(() => {
          process.env.ASR_COMMAND = _asrCommand;
        });

        describe('not enabled', () => {

          beforeEach(() => {
            delete process.env.ASR_COMMAND;
            expect(process.env.ASR_COMMAND).toBeUndefined();
          });

          it('does not call upon ASR rig', done => {
            browser.attach('docs', 'spec/files/troll.ogg').then(res => {
              expect(child_process.exec.calls.count()).toEqual(0);
              done();
            }).catch(err => {
              done.fail(err);
            });
          });

          it('leaves the track\'s transcript property empty', done => {
            browser.attach('docs', 'spec/files/troll.ogg').then(res => {
              models.Track.find({}).then(tracks => {
                expect(tracks.length).toEqual(1);
                expect(tracks[0].transcript).toEqual('');

                done();
              }).catch(err => {
                done.fail(err);
              });
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('enabled', () => {

          beforeEach(() => {
            if (!process.env.ASR_COMMAND) {
              process.env.ASR_COMMAND = './some-asr-command --to --be --executed';
            };
            expect(process.env.ASR_COMMAND).toBeDefined();
          });

          // Attaching a file immediately triggers the upload. Cannot test more than one file here.
          // See the corresponding API test
          it('calls upon ASR rig to attempt inference on one file', done => {
            browser.attach('docs', 'spec/files/troll.ogg').then(res => {
              expect(child_process.exec.calls.count()).toEqual(1);
              done();
            }).catch(err => {
              done.fail(err);
            });
          });

          it('sets the track\'s transcript property to that returned by the inference', done => {
            browser.attach('docs', 'spec/files/troll.ogg').then(res => {
              models.Track.find({}).then(tracks => {
                expect(tracks.length).toEqual(1);
                expect(tracks[0].transcript).toEqual(asrSpyReturnValue);

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
  });
});
