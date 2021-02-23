const fs = require('fs');
const fixtures = require('pow-mongoose-fixtures');

const app = require('../../../app');
const models = require('../../../models');

const mock = require('mock-fs');
const mockAndUnmock = require('../../support/mockAndUnmock')(mock);

// For browser tests
const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);
const stubAuth0Sessions = require('../../support/stubAuth0Sessions');

describe('image mobile upload', () => {

  let agent;

  beforeEach(done => {
    fixtures.load(__dirname + '/../../fixtures/agents.js', models.mongoose, function(err) {
      if (err) {
        return done.fail(err);
      }
      models.Agent.findOne({ email: 'daniel@example.com' }).then(function(results) {
        agent = results;

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
    Browser._extensions = [];
    mock.restore();
    models.mongoose.connection.db.dropDatabase().then(result => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  describe('progressive interface', () => {

    it('executes the camera.js client-side script when logged in', done => {
      /**
       * Zombie JS, being what it is, doesn't have any user media. This is how I
       * mock that functionality for testing
       */
      Browser.extend(function(browser) {
        const mediaDevices = {
          enumerateDevices: () => {
            return new Promise((resolve, reject) => {
              resolve([{
                deviceId: "",
                groupId: "someaudioinputgroupid",
                kind: "audioinput",
                label: ""
              },
              {
                deviceId: "",
                groupId: "default",
                kind: "audiooutput",
                label: ""
              },
              {
                deviceId: "",
                groupId: "somecrazyvideoinputgroupid",
                kind: "videoinput",
                label: ""
              }]);
            });
          },
          getUserMedia: () => { console.log('getting user media!!!'); }
        };

        browser.on('response', (req, res) => {
          if (browser.window) {
            browser.window.navigator.mediaDevices = mediaDevices;
          }
        });
      });

      let executed = false;
      let re = new RegExp('camera\.js');
      let browser = new Browser();

      browser.on('evaluated', (code, result, filename) => {
        if (re.test(filename)) {
          executed = true;
        }
      });

      browser.visit('/', err => {
        if (err) return done.fail(err);
        expect(executed).toBe(false);

        browser.clickLink('Login', err => {
          if (err) done.fail(err);
          expect(executed).toBe(true);
          done();
        });
      });
    });

    describe('no media devices', () => {
      it('displays the basic file upload form', done => {
        let browser = new Browser();
        browser.visit('/', err => {
          if (err) return done.fail(err);

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.element('#photos-form');
            browser.assert.elements('#camera-button', 0);
            done();
          });
        });
      });
    });

    describe('no camera available', () => {
      it('displays the basic file upload form', done => {
        /**
         * Mock browser MediaDevices interface
         */
        const mediaDevices = {
          enumerateDevices: () => {
            return new Promise((resolve, reject) => {
              resolve([{
                deviceId: "",
                groupId: "someaudioinputgroupid",
                kind: "audioinput",
                label: ""
              },
              {
                deviceId: "",
                groupId: "default",
                kind: "audiooutput",
                label: ""
              }]);
            });
          },
          getUserMedia: () => {
            return new Promise((resolve, reject) => {
              resolve('howdy!');
            });
          }
        };

        Browser.extend(function(browser) {
          browser.on('response', (req, res) => {
            if (browser.window) {
              browser.window.navigator.mediaDevices = mediaDevices;
            }
          });
        });

        let browser = new Browser();
        browser.visit('/', err => {
          if (err) return done.fail(err);

          browser.clickLink('Login', err => {
            if (err) return done.fail(err);
            browser.assert.element('#photos-form');
            browser.assert.elements('#camera-button', 0);
            done();
          });
        });
      });
    });

    describe('camera available', () => {

      const mediaDevices = {
        enumerateDevices: () => {
          return new Promise((resolve, reject) => {
            resolve([{
              deviceId: "",
              groupId: "someaudioinputgroupid",
              kind: "audioinput",
              label: ""
            },
            {
              deviceId: "",
              groupId: "default",
              kind: "audiooutput",
              label: ""
            },
            {
              deviceId: "",
              groupId: "somecrazyvideoinputgroupid",
              kind: "videoinput",
              label: ""
            }]);
          });
        },
        getUserMedia: () => {
          return new Promise((resolve, reject) => {
            resolve('howdy!');
          });
        }
      };


      it('displays the progressive, Javascript-driven browser camera', done => {
        /**
         * Mock browser MediaDevices interface
         */
        Browser.extend(function(browser) {
          browser.on('response', (req, res) => {
            if (browser.window) {
              browser.window.navigator.mediaDevices = mediaDevices;
            }
          });
        });

        let browser = new Browser();
        browser.visit('/', err => {
          if (err) return done.fail(err);

          browser.clickLink('Login', err => {
            if (err) return done.fail(err);
            browser.assert.element('#camera-button');
            browser.assert.elements('#photos-form', 0);
            done();
          });
        });
      });

      describe('access', () => {

        let browser;
        beforeEach(done => {
          spyOn(mediaDevices, 'getUserMedia').and.callThrough();

          /**
           * Mock browser MediaDevices interface
           */
          Browser.extend(function(browser) {
            browser.on('response', (req, res) => {
              if (browser.window) {
                browser.window.navigator.mediaDevices = mediaDevices;
              }
            });
          });

          browser = new Browser();
          browser.visit('/', err => {
            if (err) return done.fail(err);

            browser.clickLink('Login', err => {
              if (err) return done.fail(err);
              browser.assert.element('#camera-button');
              browser.assert.elements('#photos-form', 0);
              done();
            });
          });
        });

        it('requests the appropriate media access permissions ', done => {
          browser.click('#camera-button').then(res => {
            expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: false, video: true });
            done();
          }).catch(err => {
            done.fail(err);
          });
        });

        describe('not granted', () => {
          it('reverts to the basic image upload form', done => {
            browser.click('#camera-button').then(res => {
              browser.assert.element('#camera-button');
              browser.assert.elements('#photos-form', 0);
              browser.assert.elements('video#player',0 );

              done();
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('granted', () => {
          it('reveals the video player element', done => {
            browser.click('#camera-button').then(res => {
              browser.assert.element('video#player');
              done();
            }).catch(err => {
              done.fail(err);
            });
          });
        });
      });
    });
  });

  describe('browser with camera access granted', () => {

    let browser, lanny, mediaDevices;

    beforeEach(done => {
      /**
       * Zombie JS, being what it is, doesn't have any user media. This is how I
       * mock that functionality for testing
       */
      mediaDevices = { getUserMedia: () => {  } };
      Browser.extend(function(browser) {
        browser.on('response', (req, res) => {
          if (browser.window) {
            browser.window.navigator.mediaDevices = mediaDevices;
          }
        });
      });

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
            browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
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

//      it('redirects home with a friendly error message', done => {
//        browser.click('docs', 'spec/files/troll.jpg').then(res => {
//          browser.assert.redirected();
//          browser.assert.url({ pathname: '/' });
//          browser.assert.text('.alert.alert-danger', 'You need to login first');
//          done();
//        });
//      });

//      it('does not write a file to the file system', done => {
//        fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//          if (err) {
//            return done.fail(err);
//          }
//          expect(files.length).toEqual(0);
//
//          browser.attach('docs', 'spec/files/troll.jpg').then(res => {
//            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//              if (err) {
//                return done.fail(err);
//              }
//              expect(files.length).toEqual(0);
//              done();
//            });
//          });
//        });
//      });
//
//      it('does not create a database record', done => {
//        models.Image.find({}).then(images => {
//          expect(images.length).toEqual(0);
//          browser.attach('docs', 'spec/files/troll.jpg').then(res => {
//            models.Image.find({}).then(images => {
//              expect(images.length).toEqual(0);
//              done();
//            }).catch(err => {
//              done.fail(err);
//            });
//          });
//        }).catch(err => {
//          done.fail(err);
//        });
//      });
    });

    describe('authenticated access', () => {
//      it('displays a friendly message upon successful receipt of file', done => {
//        browser.attach('docs', 'spec/files/troll.jpg').then(res => {
//          browser.assert.redirected();
//          browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
//          browser.assert.text('.alert.alert-success', 'Image received');
//          done();
//        }).catch(err => {
//          done.fail(err);
//        });
//      });

//      it('writes the file to the disk on agent\'s first access', done => {
//        fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//          if (err) {
//            return done.fail(err);
//          }
//          expect(files.length).toEqual(0);
//
//          browser.attach('docs', 'spec/files/troll.jpg').then(res => {
//
//            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//
//              if (err) {
//                return done.fail(err);
//              }
//              expect(files.length).toEqual(1);
//
//              done();
//            });
//          }).catch(err => {
//            done.fail(err);
//          });
//        });
//      });
//
//      // 2021-2-22
//      //
//      // This actually meant to test multiple file uploads in one action.
//      // Currently attaching a file to the `input` triggers an immediate
//      // `submit`, which makes attaching more than one file impossible.
//      //
//      // Noted here so that it can be revisited as progressive app features
//      // continue to take shape
//      //
//      it('writes multiple attached files to disk', done => {
//
//        fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//          if (err) {
//            return done.fail(err);
//          }
//          expect(files.length).toEqual(0);
//
//          browser.attach('docs', 'spec/files/troll.jpg').then(res => {
//
//            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//
//              if (err) {
//                return done.fail(err);
//              }
//              expect(files.length).toEqual(1);
//
//              browser.attach('docs', 'spec/files/troll.png').then(res => {
//
//                fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//
//                  if (err) {
//                    return done.fail(err);
//                  }
//                  expect(files.length).toEqual(2);
//
//                  done();
//                });
//              }).catch(err => {
//                done.fail(err);
//              });
//            });
//          }).catch(err => {
//            done.fail(err);
//          });
//        });
//      });
//
//      it('creates a database record', done => {
//        models.Image.find({}).then(images => {
//          expect(images.length).toEqual(0);
//
//          browser.attach('docs', 'spec/files/troll.png').then(res => {
//            models.Image.find({}).then(images => {
//              expect(images.length).toEqual(1);
//              expect(images[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);
//
//              done();
//            }).catch(err => {
//              done.fail(err);
//            });
//          }).catch(err => {
//            done.fail(err);
//          });
//        }).catch(err => {
//          done.fail(err);
//        });
//      });
//
//      it('writes a database record for each attached file', done => {
//        models.Image.find({}).then(images => {
//          expect(images.length).toEqual(0);
//
//          browser.attach('docs', 'spec/files/troll.jpg').then(res => {
//            models.Image.find({}).then(images => {
//              expect(images.length).toEqual(1);
//              expect(images[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);
//
//              browser.attach('docs', 'spec/files/troll.png').then(res => {
//                models.Image.find({}).then(images => {
//                  expect(images.length).toEqual(2);
//                  expect(images[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);
//                  expect(images[1].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);
//
//                  done();
//                }).catch(err => {
//                  done.fail(err);
//                });
//              }).catch(err => {
//                done.fail(err);
//              });
//            }).catch(err => {
//              done.fail(err);
//            });
//          }).catch(err => {
//            done.fail(err);
//          });
//        }).catch(err => {
//          done.fail(err);
//        });
//      });
    });
  });

  describe('browser with camera access denied', () => {
  });
});
