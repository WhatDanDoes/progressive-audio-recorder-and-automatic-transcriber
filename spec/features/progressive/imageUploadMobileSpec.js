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

  /**
   * Boilerplate media devices mock for zombie.
   * Inspired by manual inspection of my desktop browser.
   * Mobile devices typically have at least two `videoinputs`.
   */
  const _mediaDevices = {
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
        browser.on('response', (req, res) => {
          if (browser.window) {
            browser.window.navigator.mediaDevices = _mediaDevices;
          }
        });
      });

      let executed = false;
      let re = new RegExp('camera\.js');
      let browser = new Browser({ loadCss: true });

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
            browser.assert.element('#photos-form[action="/image"]');
            browser.assert.element('#photos-form[action="/image"] #photos-input[type="file"]');
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
              browser.window.navigator.mediaDevices = {
                ...mediaDevices,
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
              };
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

      let mediaDevices;
      beforeEach(() => {
        mediaDevices = {..._mediaDevices};
      });

      it('displays the progressive, Javascript-driven browser camera launcher', done => {
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
            expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
              audio: false,
              video: {
                facingMode: 'environment'
              }
            });
            done();
          }).catch(err => {
            done.fail(err);
          });
        });

        /**
         * If camera access is blocked, there will be no active stream
         */
        describe('not granted', () => {
          beforeEach(() => {
            mediaDevices.getUserMedia = () => {
              return new Promise((resolve, reject) => {
                reject('Camera access denied!');
              });
            };
          });

          it('reverts to the basic image upload form', done => {
            browser.click('#camera-button').then(res => {

              browser.assert.element('#photos-form');
              browser.assert.elements('#camera-button', 0);
              browser.assert.elements('video#player', 0);

              done();
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        /**
         * If camera access is granted, there will be an active stream
         */
        describe('granted', () => {
          beforeEach(() => {
            mediaDevices.getUserMedia = () => {
              return new Promise((resolve, reject) => {
                resolve('Camera access allowed. Streaming!');
              });
            };
          });

          it('reveals the camera markup with picture shooter controls', done => {
            browser.click('#camera-button').then(res => {
              browser.assert.style('div#camera', 'display', 'block');

              browser.assert.element('div#camera video#player');
              browser.assert.style('div#camera video#player', 'display', 'block');

              browser.assert.element('div#camera nav#shooter');
              browser.assert.element('div#camera nav#shooter button#reverse-camera');
              browser.assert.element('div#camera nav#shooter button#capture');
              browser.assert.element('div#camera nav#shooter button#go-back');
              browser.assert.style('div#camera nav#shooter', 'display', 'block');

              browser.assert.element('div#camera nav#sender');
              browser.assert.element('div#camera nav#sender button#send');
              browser.assert.element('div#camera nav#sender button#cancel');
              browser.assert.style('div#camera nav#sender', 'display', 'none');

              browser.assert.element('div#camera canvas#viewer');
              browser.assert.style('div#camera canvas#viewer', 'display', 'none');

              done();
            }).catch(err => {
              done.fail(err);
            });
          });

          describe('#shooter controls', () => {

            describe('#reverse-camera button', () => {
              describe('exists', () => {

                let videoTrackSpy;
                beforeEach(done => {
                  videoTrackSpy = jasmine.createSpy('stop');

                  mediaDevices = {
                    ..._mediaDevices,
                    enumerateDevices: () => {
                      return new Promise((resolve, reject) => {
                        resolve([
                          {
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
                          },
                          {
                            deviceId: "",
                            groupId: "somefrontviewcrazyvideoinputgroupid",
                            kind: "videoinput",
                            label: ""
                          }
                        ]);
                      });
                    },
                    getUserMedia: () => {
                      return new Promise((resolve, reject) => {
                        resolve({
                          dummy: 'This device has at least two cameras!',
                          getVideoTracks: () => [
                            {
                              stop: videoTrackSpy
                            },
                            {
                              stop: videoTrackSpy
                            }
                          ]
                        });
                      });
                    }
                  };

                  browser.reload(err => {
                    if (err) return done.fail(err);
                    done();
                  });
                });

                it('displays a reverse-camera button', done => {
                  browser.click('#camera-button').then(res => {
                    browser.assert.element('div#camera nav#shooter button#reverse-camera');
                    browser.assert.style('div#camera nav#shooter button#reverse-camera', 'display', 'block');

                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });

                it('stops any existing streams', done => {
                  expect(videoTrackSpy.calls.count()).toEqual(0);
                  browser.click('#camera-button').then(res => {
                    browser.click('#reverse-camera').then(res => {
                      expect(videoTrackSpy.calls.count()).toEqual(2);
                      done();
                    }).catch(err => {
                      done.fail(err);
                    });
                  }).catch(err => {
                    done.fail(err);
                  });
                });

                /**
                 * 2021-3-24
                 *
                 * Briefly considered reorganizing client side javascript with
                 * exports in order to make this more testable. It added a bunch
                 * of complications, especially concerning low browser adoption.
                 *
                 * I just need to prove the right method is being called. I'll
                 * set an `aria-label` to determine the call and its parameters.
                 * And thus, _behavioural_ testing takes the prize.
                 *
                 * ... didn't see the `capture` attribute!
                 */
                it('toggles the video constraint and restarts the camera', done => {
                  browser.click('#camera-button').then(res => {
                    browser.click('#reverse-camera').then(res => {
                      browser.assert.element('div#camera nav#shooter button#reverse-camera[aria-label="user"][capture="user"]');
                      browser.assert.attribute('div#camera nav#shooter button#reverse-camera', 'aria-label', 'user');
                      browser.assert.attribute('div#camera nav#shooter button#reverse-camera', 'capture', 'user');

                      browser.click('#reverse-camera').then(res => {
                        browser.assert.element('div#camera nav#shooter button#reverse-camera[aria-label="environment"][capture="environment"]');
                        browser.assert.attribute('div#camera nav#shooter button#reverse-camera', 'aria-label', 'environment');
                        browser.assert.attribute('div#camera nav#shooter button#reverse-camera', 'capture', 'environment');

                        browser.click('#reverse-camera').then(res => {
                          browser.assert.element('div#camera nav#shooter button#reverse-camera[aria-label="user"][capture="user"]');
                          browser.assert.attribute('div#camera nav#shooter button#reverse-camera', 'aria-label', 'user');
                          browser.assert.attribute('div#camera nav#shooter button#reverse-camera', 'capture', 'user');

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
                });
              });

              describe('does not exist', () => {
                beforeEach(done => {
                  browser.reload(err => {
                    if (err) return done.fail(err);
                    done();
                  });
                });

                it('does not display a reverse-camera button', done => {
                  browser.click('#camera-button').then(res => {
                    browser.assert.element('div#camera nav#shooter button#reverse-camera');
                    browser.assert.style('div#camera nav#shooter button#reverse-camera', 'display', 'none');

                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
              });
            });

            describe('#capture button', () => {
            });

            describe('#go-back button', () => {

              let videoTrackSpy;
              beforeEach(done => {
                videoTrackSpy = jasmine.createSpy('stop');

                mediaDevices = {
                  ..._mediaDevices,
                  getUserMedia: () => {
                    return new Promise((resolve, reject) => {
                      resolve({
                        dummy: 'This device has at least two cameras!',
                        getVideoTracks: () => [
                          {
                            stop: videoTrackSpy
                          }
                        ]
                      });
                    });
                  }
                };

                browser.reload(err => {
                  if (err) return done.fail(err);

                  browser.click('#camera-button').then(res => {
                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
              });

              it('removes the camera from the display', done => {
                browser.assert.element('div#camera');
                browser.click('#go-back').then(res => {
                  browser.assert.elements('div#camera', 0);
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              it('stops the existing streams', done => {
                expect(videoTrackSpy.calls.count()).toEqual(0);
                browser.click('#go-back').then(res => {
                  expect(videoTrackSpy.calls.count()).toEqual(1);
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              /**
               * 2021-3-25
               *
               * This test was born of a weirdness in Android Chrome.
               * When the camera element is torn down, the background
               * layer persists. It is like a ghost in the DOM. There
               * is no evidence of this persistent layer in dev tools.
               *
               * No similar problem on desktop Chrome.
               */
              it('removes the opaque camera background', done => {
                browser.assert.style('div#camera', 'background-color', 'rgba(0,0,0,0.5)');
                expect(videoTrackSpy.calls.count()).toEqual(0);
                browser.click('#go-back').then(res => {
                  browser.assert.style('div#camera', 'background-color', 'null');
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            });
          });

          describe('#sender controls', () => {
            describe('#send button', () => {
            });

            describe('#cancel button', () => {
            });
          });
        });
      });
    });
  });
});
