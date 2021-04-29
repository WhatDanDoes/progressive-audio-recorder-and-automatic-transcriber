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

const Blob = require('node-blob');


describe('track mobile upload', () => {

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
    },
  };

  /**
   * Attached to the window global scope...
   */
  let mediaRecorderStopSpy, mediaRecorderStartSpy;
  class MediaRecorderMock {
    constructor(stream, options = null) {
      this.stream = stream;
      this.options = options;
      this.stop = mediaRecorderStopSpy;
      this.start = mediaRecorderStartSpy;
    }
  }

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
            'uploads': mock.directory({})
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

    it('executes the mic.js client-side script when logged in', done => {
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
      let re = new RegExp('mic\.js');
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
          if (err) return done.fail(err);
          expect(executed).toBe(true);
          done();
        });
      });
    });

    it('executes the wave audio visualizer client-side script when logged in', done => {
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
      // See foobar404/wave dependency
      let re = new RegExp('bundle\.iife\.js');
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
          if (err) return done.fail(err);
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
            browser.assert.element('#tracks-form');
            browser.assert.element('#tracks-form[action="/track"]');
            browser.assert.element('#tracks-form[action="/track"] #tracks-input[type="file"]');
            browser.assert.elements('#mic-button', 0);
            done();
          });
        });
      });
    });

    describe('no mic available', () => {
      it('displays the basic file upload form', done => {
        /**
         * Mock browser MediaDevices interface
         */
        const mediaDevices = {
          enumerateDevices: () => {
            return new Promise((resolve, reject) => {
              resolve([{
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

        Browser.extend(function(browser) {
          browser.on('response', (req, res) => {
            if (browser.window) {
              browser.window.navigator.mediaDevices = {
                ...mediaDevices,
                enumerateDevices: () => {
                  return new Promise((resolve, reject) => {
                    resolve([{
                      deviceId: "",
                      groupId: "somecrazyvideoinputgroupid",
                      kind: "videoinput",
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
            browser.assert.element('#tracks-form');
            browser.assert.elements('#mic-button', 0);
            done();
          });
        });
      });
    });

    describe('mic available', () => {

      let mediaDevices;
      beforeEach(() => {
        mediaDevices = {..._mediaDevices};
      });

      it('displays the progressive, Javascript-driven browser mic launcher', done => {
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
            browser.assert.element('#mic-button');
            browser.assert.elements('#tracks-form', 0);
            done();
          });
        });
      });

      describe('access', () => {

        let browser;
        beforeEach(done => {
          spyOn(mediaDevices, 'getUserMedia').and.callThrough();

          /**
           * Mock browser MediaDevices interface and MediaRecorder
           */
          Browser.extend(function(browser) {
            browser.on('response', (req, res) => {
              if (browser.window) {
                browser.window.MediaRecorder = MediaRecorderMock;
                browser.window.navigator.mediaDevices = mediaDevices;
              }
            });
          });

          browser = new Browser();
          browser.visit('/', err => {
            if (err) return done.fail(err);

            browser.clickLink('Login', err => {
              if (err) return done.fail(err);
              browser.assert.element('#mic-button');
              browser.assert.elements('#tracks-form', 0);
              done();
            });
          });
        });

        it('requests the appropriate media access permissions ', done => {
          browser.click('#mic-button').then(res => {
            expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
              audio: true,
            });
            done();
          }).catch(err => {
            done.fail(err);
          });
        });

        /**
         * If mic access is blocked, there will be no active stream
         */
        describe('not granted', () => {
          beforeEach(() => {
            mediaDevices.getUserMedia = () => {
              return new Promise((resolve, reject) => {
                reject('Mic access denied!');
              });
            };
          });

          it('reverts to the basic track upload form', done => {
            browser.click('#mic-button').then(res => {

              browser.assert.element('#tracks-form');
              browser.assert.elements('#mic-button', 0);

              done();
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        /**
         * If mic access is granted, there will be an active stream
         */
        describe('granted', () => {
          beforeEach(() => {
            mediaRecorderStartSpy = jasmine.createSpy('start');

            mediaDevices.getUserMedia = () => {
              return new Promise((resolve, reject) => {
                resolve('Mic access allowed. Streaming!');
              });
            };
          });

          it('reveals the mic markup with audio capture controls', done => {
            browser.click('#mic-button').then(res => {
              browser.assert.style('div#mic', 'display', 'block');

              browser.assert.element('div#mic nav#listener');
              browser.assert.style('div#mic nav#listener', 'display', 'block');

              browser.assert.element('div#mic nav#listener button#send');
              browser.assert.style('div#mic nav#listener button#send', 'display', 'block');
              browser.assert.element('div#mic nav#listener button#cancel');
              browser.assert.style('div#mic nav#listener button#cancel', 'display', 'block');

              browser.assert.element('div#mic canvas#visualizer');
              browser.assert.style('div#mic canvas#visualizer', 'display', 'block');

              done();
            }).catch(err => {
              done.fail(err);
            });
          });

          it('starts recording immediately', done => {
            expect(mediaRecorderStartSpy.calls.count()).toEqual(0);
            browser.click('#mic-button').then(res => {
              expect(mediaRecorderStartSpy.calls.count()).toEqual(1);
              done();
            }).catch(err => {
              done.fail(err);
            });
          });

          describe('#listener controls', () => {

            let mediaTrackStopSpy, streamRemoveTrackSpy;
            beforeEach(done => {
              mediaRecorderStopSpy = jasmine.createSpy('stop');
              mediaTrackStopSpy = jasmine.createSpy('stop');
              streamRemoveTrackSpy = jasmine.createSpy('removeTrack');

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
                      dummy: 'This device has at least two mics!',
                      removeTrack: streamRemoveTrackSpy,
                      getTracks: () => [
                        {
                          stop: mediaTrackStopSpy
                        },
                        {
                          stop: mediaTrackStopSpy
                        }
                      ]
                    });
                  });
                }
              };

              browser.reload(err => {
                if (err) return done.fail(err);

                browser.click('#mic-button').then(res => {
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            });

            describe('#cancel button', () => {

              it('hides the mic app', done => {
                browser.assert.style('div#mic', 'display', 'block');
                browser.assert.style('#send', 'display', 'block');
                browser.assert.style('#cancel', 'display', 'block');
                browser.assert.style('#visualizer', 'display', 'block');

                browser.click('#cancel').then(res => {
                  browser.assert.style('div#mic', 'display', 'none');
                  browser.assert.style('#send', 'display', 'none');
                  browser.assert.style('#cancel', 'display', 'none');
                  browser.assert.style('#visualizer', 'display', 'none');
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              it('stops the media recorder', done => {
                expect(mediaRecorderStopSpy.calls.count()).toEqual(0);
                browser.click('#cancel').then(res => {
                  expect(mediaRecorderStopSpy.calls.count()).toEqual(1);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              it('removes existing tracks', done => {
                expect(streamRemoveTrackSpy.calls.count()).toEqual(0);
                browser.click('#cancel').then(res => {
                  expect(streamRemoveTrackSpy.calls.count()).toEqual(2);
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              it('stops any existing streams', done => {
                expect(mediaTrackStopSpy.calls.count()).toEqual(0);
                browser.click('#cancel').then(res => {
                  expect(mediaTrackStopSpy.calls.count()).toEqual(2);
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            });

            describe('#send button', () => {

              describe('as tested with zombie.js', () => {
                /**
                 * 2021-4-16
                 *
                 * See the puppeteer block for the corresponding test.
                 * This makes sure spinner appears and the sender controls
                 * disappear.
                 *
                 * Puppeteer makes sure the mic and its artefacts are
                 * hidden.
                 */
                it('displays a spinner and hides the sender controls', done => {
                  browser.assert.style('div#mic', 'display', 'block');
                  browser.assert.style('#send', 'display', 'block');
                  browser.assert.style('#cancel', 'display', 'block');

                  browser.click('#send').then(res => {
                    browser.assert.style('#spinner', 'display', 'block');
                    browser.assert.style('#send', 'display', 'none');
                    browser.assert.style('#cancel', 'display', 'none');
                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
              });

              describe('as tested with puppeteer', () => {

                const APP_URL = `http://localhost:${PORT}`;
                const puppeteer = require('puppeteer');
                const useNock = require('nock-puppeteer');
                const path = require('path');

                let puppetBrowser, page;
                beforeEach(async done => {

                  try {
                    puppetBrowser = await puppeteer.launch({
                      headless: false,
                      args: [
                        '--use-fake-ui-for-media-stream',
                        '--use-fake-device-for-media-stream',
                        `--use-file-for-fake-audio-capture=${path.resolve('spec/files/troll.wav')}`
                      ],
                      executablePath: puppeteer.executablePath(),
                    });
                    page = await puppetBrowser.newPage();
                    page.on('console', msg => console.log('PAGE LOG:', msg.text().toString()));

                    useNock(page, [`https://${process.env.AUTH0_DOMAIN}`]);

                    stubAuth0Sessions(agent.email,`localhost:${PORT}` , async err => {
                      if (err) return done.fail(err);

                      await page.goto(APP_URL);

                      let link = await page.waitForSelector('#login-link');
                      await page.click('#login-link');
                      await page.waitForSelector('#mic-button');

//                      // Make sure the audio is playing
//                      page.evaluate(async () => {
//                        return new Promise((resolve, reject) => {
////                          const player = document.getElementById('player');
////
////                          player.onplay = async () => {
////                            resolve();
////                          };
//                        });
//                      }).then(async() => {
//                        await page.waitForSelector('#send');
//                        done();
//                      });

                      expect(await page.$('#mic-button')).toBeTruthy();
                      expect(await page.$('#tracks-form')).toBeFalsy();

                    // Open the mic app
                    await page.click('#mic-button');
                    await page.waitForTimeout(500);

//                      await page.click('#mic-button');
//                      await page.waitForSelector('#send');
                      done();
                    });
                  } catch (e) {
                    console.log(e);
                  }
                });

                afterEach(async () => {
                  await puppetBrowser.close();
                });

                describe('#send button', () => {
                  it('displays a friendly message upon successful receipt of file', async () => {
                    let redirected = false;

                    page.on('response', response => {
                      const status = response.status()
                      if ((status >= 300) && (status <= 399)) {
                        redirected = true;
                      }
                    });

                    await page.waitForSelector('#send');
                    await page.click('#send');

                    await page.waitForSelector('.alert.alert-success');
                    expect(page.url()).toEqual(`${APP_URL}/track/${agent.getAgentDirectory()}`);
                    expect(redirected).toBe(true);
                  });

                  it('hides the mic interface', async done => {
                    let micIsVisible = await page.$eval('div#mic', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
                    expect(micIsVisible).toBe(true);

                    await page.waitForSelector('div#mic', { visible: true });
                    page.click('#send').then(async () => {
                      await page.waitForSelector('.alert.alert-success');
                      await page.waitForSelector('div#mic');

                      micIsVisible = await page.$eval('div#mic', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
                      expect(micIsVisible).toBe(false);

                      done();
                    });
                  });

                  it('writes the file to the disk on agent\'s first access', done => {
                    fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                      if (err) {
                        return done.fail(err);
                      }
                      expect(files.length).toEqual(0);

                      page.click('#send').then(async () => {
                        await page.waitForSelector('.alert.alert-success');
                        await page.waitForSelector('div#mic');

                        fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                          if (err) {
                            return done.fail(err);
                          }
                          expect(files.length).toEqual(1);
                          done();
                        });
                      });
                    });
                  });

                  it('creates a database record', done => {
                    models.Track.find({}).then(tracks => {
                      expect(tracks.length).toEqual(0);

                      page.click('#send').then(async () => {
                        await page.waitForSelector('.alert.alert-success');
                        await page.waitForSelector('div#mic');

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

                  it('lands in the right spot with an updated track list', async done => {
                    let posts = await page.$$('.post');
                    expect(posts.length).toEqual(0);
                    page.click('#send').then(async () => {
                      await page.waitForSelector('.alert.alert-success');
                      await page.waitForSelector('div#mic');

                      expect(page.url()).toEqual(`${APP_URL}/track/${agent.getAgentDirectory()}`);

                      posts = await page.$$('.post');
                      expect(posts.length).toEqual(1);

                      done();
                    }).catch(err => {
                      done.fail(err);
                    });
                  });

                  /**
                   * 2021-4-16
                   *
                   * Testing spinners has always proven weirdly challenging.
                   *
                   * As with other frameworks, the tests execute so quickly
                   * that the spinner never renders. This tests to make sure
                   * the spinner and mic disappear after an upload.
                   *
                   * There's a test in the zombie block for the intermediary
                   * spinner/sender button behaviour.
                   *
                   * 2021-4-29
                   *
                   * Note to self: zombie fell short because it can't send
                   * a file via fetch.
                   */
                  it('reveals and hides a progress spinner', async () => {
                    let micIsVisible = await page.$eval('div#mic', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
                    expect(micIsVisible).toBe(true);

                    let spinnerIsVisible = await page.$eval('#spinner', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
                    expect(spinnerIsVisible).toBe(false);

                    await page.click('#send');

                    await page.waitForSelector('.alert.alert-success');
                    await page.waitForSelector('div#mic');

                    spinnerIsVisible = await page.$eval('#spinner', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
                    expect(spinnerIsVisible).toBe(false);

                    micIsVisible = await page.$eval('div#mic', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
                    expect(micIsVisible).toBe(false);
                  });
                });
              });
            });


//            describe('#reverse-camera button', () => {
//              describe('exists', () => {
//
//                let mediaTrackStopSpy, streamRemoveTrackSpy;
//                beforeEach(done => {
//                  mediaTrackStopSpy = jasmine.createSpy('stop');
//                  streamRemoveTrackSpy = jasmine.createSpy('removeTrack');
//
//                  mediaDevices = {
//                    ..._mediaDevices,
//                    enumerateDevices: () => {
//                      return new Promise((resolve, reject) => {
//                        resolve([
//                          {
//                            deviceId: "",
//                            groupId: "someaudioinputgroupid",
//                            kind: "audioinput",
//                            label: ""
//                          },
//                          {
//                            deviceId: "",
//                            groupId: "default",
//                            kind: "audiooutput",
//                            label: ""
//                          },
//                          {
//                            deviceId: "",
//                            groupId: "somecrazyvideoinputgroupid",
//                            kind: "videoinput",
//                            label: ""
//                          },
//                          {
//                            deviceId: "",
//                            groupId: "somefrontviewcrazyvideoinputgroupid",
//                            kind: "videoinput",
//                            label: ""
//                          }
//                        ]);
//                      });
//                    },
//                    getUserMedia: () => {
//                      return new Promise((resolve, reject) => {
//                        resolve({
//                          dummy: 'This device has at least two mics!',
//                          removeTrack: streamRemoveTrackSpy,
//                          getTracks: () => [
//                            {
//                              stop: mediaTrackStopSpy
//                            },
//                            {
//                              stop: mediaTrackStopSpy
//                            }
//                          ]
//                        });
//                      });
//                    }
//                  };
//
//                  browser.reload(err => {
//                    if (err) return done.fail(err);
//                    done();
//                  });
//                });
//
//                it('displays a reverse-camera button', done => {
//                  browser.click('#camera-button').then(res => {
//                    browser.assert.element('div#camera nav#listener button#reverse-camera');
//                    browser.assert.style('div#mic nav#listener button#reverse-camera', 'display', 'block');
//
//                    done();
//                  }).catch(err => {
//                    done.fail(err);
//                  });
//                });
//
//                /**
//                 * 2021-3-26
//                 *
//                 * This makes it so the app doesn't freeze in Android Chrome.
//                 *
//                 * See https://github.com/twilio/twilio-video-app-react/issues/355#issuecomment-780368725
//                 */
//                it('removes existing tracks', done => {
//                  expect(streamRemoveTrackSpy.calls.count()).toEqual(0);
//                  browser.click('#mic-button').then(res => {
//                    browser.click('#reverse-camera').then(res => {
//                      expect(streamRemoveTrackSpy.calls.count()).toEqual(2);
//                      done();
//                    }).catch(err => {
//                      done.fail(err);
//                    });
//                  }).catch(err => {
//                    done.fail(err);
//                  });
//                });
//
//                it('stops any existing streams', done => {
//                  expect(mediaTrackStopSpy.calls.count()).toEqual(0);
//                  browser.click('#mic-button').then(res => {
//                    browser.click('#reverse-camera').then(res => {
//                      expect(mediaTrackStopSpy.calls.count()).toEqual(2);
//                      done();
//                    }).catch(err => {
//                      done.fail(err);
//                    });
//                  }).catch(err => {
//                    done.fail(err);
//                  });
//                });
//
//                /**
//                 * 2021-3-24
//                 *
//                 * Briefly considered reorganizing client side javascript with
//                 * exports in order to make this more testable. It added a bunch
//                 * of complications, especially concerning low browser adoption.
//                 *
//                 * I just need to prove the right method is being called. I'll
//                 * set an `aria-label` to determine the call and its parameters.
//                 * And thus, _behavioural_ testing wins the day.
//                 *
//                 * ... didn't see the `capture` attribute!
//                 */
//                it('toggles the video constraint and restarts the stream', done => {
//                  browser.click('#mic-button').then(res => {
//                    browser.click('#reverse-camera').then(res => {
//                      browser.assert.element('div#mic nav#listener button#reverse-camera[aria-label="user"][capture="user"]');
//                      browser.assert.attribute('div#mic nav#listener button#reverse-camera', 'aria-label', 'user');
//                      browser.assert.attribute('div#mic nav#listener button#reverse-camera', 'capture', 'user');
//
//                      browser.click('#reverse-mic').then(res => {
//                        browser.assert.element('div#camera nav#listener button#reverse-camera[aria-label="environment"][capture="environment"]');
//                        browser.assert.attribute('div#mic nav#listener button#reverse-camera', 'aria-label', 'environment');
//                        browser.assert.attribute('div#mic nav#listener button#reverse-camera', 'capture', 'environment');
//
//                        browser.click('#reverse-camera').then(res => {
//                          browser.assert.element('div#mic nav#listener button#reverse-camera[aria-label="user"][capture="user"]');
//                          browser.assert.attribute('div#mic nav#listener button#reverse-camera', 'aria-label', 'user');
//                          browser.assert.attribute('div#mic nav#listener button#reverse-camera', 'capture', 'user');
//
//                          done();
//                        }).catch(err => {
//                          done.fail(err);
//                        });
//                      }).catch(err => {
//                        done.fail(err);
//                      });
//                    }).catch(err => {
//                      done.fail(err);
//                    });
//                  }).catch(err => {
//                    done.fail(err);
//                  });
//                });
//              });
//
//              describe('does not exist', () => {
//                beforeEach(done => {
//                  browser.reload(err => {
//                    if (err) return done.fail(err);
//                    done();
//                  });
//                });
//
//                it('does not display a reverse-camera button', done => {
//                  browser.click('#mic-button').then(res => {
//                    browser.assert.element('div#mic nav#listener button#reverse-camera');
//                    browser.assert.style('div#mic nav#listener button#reverse-camera', 'display', 'none');
//
//                    done();
//                  }).catch(err => {
//                    done.fail(err);
//                  });
//                });
//              });
//            });

//            describe('#capture button', () => {
//              let mediaTrackStopSpy, streamRemoveTrackSpy, drawImageSpy, canvas;
//              beforeEach(done => {
//                mediaTrackStopSpy = jasmine.createSpy('stop');
//                streamRemoveTrackSpy = jasmine.createSpy('removeTrack');
//
//                // Need to make sure the track is drawn on the visualizer canvas
//                drawImageSpy = jasmine.createSpy('drawImage');
//                canvas = {
//                  style: {},
//                  getContext: (dim) => {
//                    return {
//                      drawImage: drawImageSpy
//                    };
//                  },
//                  toBlob: (done) => {
//                    fs.readFile(`spec/files/troll.ogg`, (err, fileData) => {
//                      if (err) return done.fail(err);
//
//                      /**
//                       * 2021-3-30
//                       *
//                       * There are some notes on related matters on the _sender
//                       * controls_ block below. This is left here temporarily
//                       * for reference (node buffers aren't the same as
//                       * Javascript buffers).
//                       *
//                       * This may become relevant again...
//                       */
//                      const arrayBuffer = new Uint8Array(fileData).buffer;
//                      const blob = new Blob([arrayBuffer], { type: 'track/jpeg' });
//
//                      done(blob);
//                    });
//                  }
//                };
//
//                mediaDevices = {
//                  ..._mediaDevices,
//                  getUserMedia: () => {
//                    return new Promise((resolve, reject) => {
//                      resolve({
//                        dummy: 'This device has one mic!',
//                        removeTrack: streamRemoveTrackSpy,
//                        getTracks: () => [
//                          {
//                            stop: mediaTrackStopSpy
//                          }
//                        ],
//                      });
//                    });
//                  },
//                };
//
//                /**
//                 * Mock browser MediaDevices interface
//                 */
//                Browser.extend(function(browser) {
//                  browser.on('response', (req, res) => {
//                    if (browser.window) {
//                      browser.window.navigator.mediaDevices = mediaDevices;
//                    }
//                  });
//
//                  /**
//                   * This is all for the purpose of ensuring `drawImage` is called on
//                   * the `canvas` element.
//                   *
//                   * I don't know why each `getElementId` call has to be explicitly
//                   * stubbed. Jasmine barfs if you don't...
//                   */
//                  browser.on('loaded', (req, res) => {
//                    spyOn(browser.document, 'getElementById')
//                      .withArgs('tracks-input').and.callThrough()
//                      .withArgs('tracks-form').and.callThrough()
//                      .withArgs('mic-button').and.callThrough()
//                      .withArgs('mic').and.callThrough()
//                      // This is the relevant spy
//                      .withArgs('visualizer').and.returnValue(canvas)
//                      .withArgs('listener').and.callThrough()
//                      .withArgs('sender').and.callThrough()
//                      .withArgs('spinner').and.callThrough()
//                      .withArgs('cancel').and.callThrough()
//                      .withArgs('send').and.callThrough()
//                      .withArgs('player').and.callThrough()
//                      .withArgs('capture').and.callThrough()
//                      .withArgs('reverse-camera').and.callThrough()
//                      .withArgs('go-back').and.callThrough();
//                  });
//                });
//
//                stubAuth0Sessions(agent.email, DOMAIN, err => {
//                  if (err) done.fail(err);
//
//                  browser = new Browser({ waitDuration: 30000 });
//                  browser.visit('/', err => {
//                    if (err) return done.fail(err);
//
//                    browser.clickLink('Login', err => {
//                      if (err) return done.fail(err);
//                      browser.assert.element('#mic-button');
//                      browser.assert.elements('#tracks-form', 0);
//
//                      browser.click('#mic-button').then(res => {
//                        done();
//                      }).catch(err => {
//                        done.fail(err);
//                      });
//                    });
//                  });
//                });
//              });
//
//              it('hides the mic and reveals the visualizer interface', done => {
//                browser.assert.style('div#mic', 'display', 'block');
//
//                browser.assert.element(`div#mic video#player`);
//                browser.assert.style('div#mic video#player', 'display', 'block');
//
//                browser.assert.element('div#mic nav#listener');
//                browser.assert.element('div#mic nav#listener button#reverse-camera');
//                browser.assert.element('div#mic nav#listener button#capture');
//                browser.assert.element('div#mic nav#listener button#go-back');
//                browser.assert.style('div#mic nav#listener', 'display', 'block');
//
//                browser.assert.element('div#mic nav#sender');
//                browser.assert.element('div#mic nav#sender button#send');
//                browser.assert.element('div#mic nav#sender button#cancel');
//                browser.assert.style('div#mic nav#sender', 'display', 'none');
//
//                browser.assert.element(`div#mic canvas#visualizer`);
//                //
//                // The canvas element is stubbed out. Using `browser.assert`
//                // (as below) won't work in this case. Testing the `canvas`
//                // object is the next best thing.
//                //
//                //browser.assert.style('div#mic canvas#visualizer', 'display', 'none');
//                expect(canvas.style.display).toEqual('none');
//
//                browser.click('#capture').then(res => {
//                  browser.assert.style('div#mic', 'display', 'block');
//
//                  browser.assert.element(`div#mic video#player`);
//                  browser.assert.style('div#mic video#player', 'display', 'none');
//
//                  browser.assert.element('div#mic nav#listener');
//                  browser.assert.style('div#mic nav#listener', 'display', 'none');
//
//                  browser.assert.element('div#mic nav#sender');
//                  browser.assert.element('div#mic nav#sender button#send');
//                  browser.assert.element('div#mic nav#sender button#cancel');
//                  browser.assert.style('div#mic nav#sender', 'display', 'block');
//
//                  // See note above...
//                  //browser.assert.style('div#mic canvas#visualizer', 'display', 'block');
//                  //browser.assert.element(`div#mic canvas#visualizer[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);
//                  expect(canvas.style.display).toEqual('block');
//                  expect(canvas.style.display).toEqual('block');
//                  expect(canvas.width).toEqual(browser.query("video#player").videoWidth);
//                  expect(canvas.height).toEqual(browser.query("video#player").videoHeight);
//
//                  done();
//                }).catch(err => {
//                  done.fail(err);
//                });
//              });
//
//              it('draws the mic track to the canvas before stopping media tracks and streams', done => {
//                browser.click('#capture').then(res => {
//                  expect(drawImageSpy).toHaveBeenCalled();
//                  expect(drawImageSpy).toHaveBeenCalledBefore(streamRemoveTrackSpy);
//                  expect(drawImageSpy).toHaveBeenCalledBefore(mediaTrackStopSpy);
//                  done();
//                }).catch(err => {
//                  done.fail(err);
//                });
//              });
//
//              it('removes the existing tracks', done => {
//                expect(streamRemoveTrackSpy.calls.count()).toEqual(0);
//                browser.click('#capture').then(res => {
//                  expect(streamRemoveTrackSpy.calls.count()).toEqual(1);
//                  done();
//                }).catch(err => {
//                  done.fail(err);
//                });
//              });
//
//              it('stops the existing media streams', done => {
//                expect(mediaTrackStopSpy.calls.count()).toEqual(0);
//                browser.click('#capture').then(res => {
//                  expect(mediaTrackStopSpy.calls.count()).toEqual(1);
//                  done();
//                }).catch(err => {
//                  done.fail(err);
//                });
//              });
//
//              /**
//               * 2021-3-30
//               *
//               * Whoa! Zombie JS is not currently able to upload files via the
//               * `FormData` interface. As such, certain functionality cannot be
//               * tested with Zombie JS.
//               *
//               * https://github.com/assaf/zombie/issues/685
//               * https://github.com/assaf/zombie/blob/e6cf0f81368349392f433c7b5122fb568b9b30b0/src/fetch.js#L104
//               *
//               * The untestable situations are left as comments. See how the
//               * puppeteer tests fill in these gaps.
//               */
//              describe('#sender controls', () => {
//                describe('as tested with zombie.js', () => {
//                  beforeEach(done => {
//                    browser.click('#capture').then(res => {
//                      done();
//                    }).catch(err => {
//                      done.fail(err);
//                    });
//                  });
//
//                  describe('#send button', () => {
//                    // See above.
//                    //it('displays a friendly message upon successful receipt of file', done => {
//                    //  browser.click('#send').then(res => {
//                    //    browser.assert.redirected();
//                    //    browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}` });
//                    //    browser.assert.text('.alert.alert-success', 'Track received');
//                    //    done();
//                    //  }).catch(err => {
//                    //    done.fail(err);
//                    //  });
//                    //});
//
//                    /**
//                     * 2021-4-16
//                     *
//                     * See the puppeteer block for the corresponding test.
//                     * This makes sure spinner appears and the sender controls
//                     * disappear.
//                     *
//                     * Puppeteer makes sure the mic and its artefacts are
//                     * hidden.
//                     */
//                    it('displays a spinner and hides the sender controls', done => {
//                      browser.assert.style('div#mic', 'display', 'block');
//                      browser.assert.style('#send', 'display', '');
//                      browser.assert.style('#cancel', 'display', '');
//
//                      browser.click('#send').then(res => {
//                        browser.assert.style('#spinner', 'display', 'block');
//                        browser.assert.style('#send', 'display', 'none');
//                        browser.assert.style('#cancel', 'display', 'none');
//                        done();
//                      }).catch(err => {
//                        done.fail(err);
//                      });
//                    });
//
//                    // See above.
//                    //it('writes the file to the disk on agent\'s first access', done => {
//                    //  fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//                    //    if (err) {
//                    //      return done.fail(err);
//                    //    }
//                    //    expect(files.length).toEqual(0);
//                    //    browser.click('#send').then(res => {
//                    //      setTimeout(() => {
//                    //        fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//                    //          if (err) {
//                    //            return done.fail(err);
//                    //          }
//                    //          expect(files.length).toEqual(1);
//                    //          done();
//                    //      });
//                    //      }, 1000);
//                    //    }).catch(err => {
//                    //      done.fail(err);
//                    //    });
//                    //  });
//                    //});
//
//                    // See above.
//                    //it('creates a database record', done => {
//                    //  models.Track.find({}).then(tracks => {
//                    //    expect(tracks.length).toEqual(0);
//                    //    browser.click('#send').then(res => {
//                    //      models.Track.find({}).then(tracks => {
//                    //        expect(tracks.length).toEqual(1);
//                    //        expect(tracks[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);
//                    //        done();
//                    //      }).catch(err => {
//                    //        done.fail(err);
//                    //      });
//                    //    }).catch(err => {
//                    //      done.fail(err);
//                    //    });
//                    //  }).catch(err => {
//                    //    done.fail(err);
//                    //  });
//                    //});
//
//                    // See above.
//                    //it('lands in the right spot with an updated track list', done => {
//                    //  done.fail();
//                    //});
//
//                    // See above.
//                    //it('reveals a progress spinner', done => {
//                    //  done.fail();
//                    //});
//                  });
//
//                  describe('#cancel button', () => {
//                    it('returns to the mic interface', done => {
//                      browser.assert.style('div#mic', 'display', 'block');
//
//                      browser.assert.element(`div#mic video#player`);
//                      browser.assert.style('div#mic video#player', 'display', 'none');
//
//                      browser.assert.element('div#mic nav#listener');
//                      browser.assert.style('div#mic nav#listener', 'display', 'none');
//
//                      browser.assert.element('div#mic nav#sender');
//                      browser.assert.element('div#mic nav#sender button#send');
//                      browser.assert.element('div#mic nav#sender button#cancel'); browser.assert.style('div#mic nav#sender', 'display', 'block');
//
//                      //
//                      // The canvas element is stubbed out. Using `browser.assert`
//                      // (as below) won't work in this case. Testing the `canvas`
//                      // object is the next best thing.
//                      //
//                      //browser.assert.style('div#mic canvas#visualizer', 'display', 'block');
//                      //browser.assert.element(`div#mic canvas#visualizer[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);
//                      expect(canvas.style.display).toEqual('block');
//                      expect(canvas.width).toEqual(browser.query("video#player").videoWidth);
//                      expect(canvas.height).toEqual(browser.query("video#player").videoHeight);
//
//                      browser.click('#cancel').then(res => {
//                        browser.assert.style('div#mic', 'display', 'block');
//
//                        browser.assert.element(`div#mic video#player`);
//                        browser.assert.style('div#mic video#player', 'display', 'block');
//
//                        browser.assert.element('div#mic nav#listener');
//                        browser.assert.element('div#mic nav#listener button#reverse-camera');
//                        browser.assert.element('div#camera nav#listener button#capture');
//                        browser.assert.element('div#mic nav#listener button#go-back');
//                        browser.assert.style('div#mic nav#listener', 'display', 'block');
//
//                        browser.assert.element('div#mic nav#sender');
//                        browser.assert.element('div#mic nav#sender button#send');
//                        browser.assert.element('div#mic nav#sender button#cancel');
//                        browser.assert.style('div#mic nav#sender', 'display', 'none');
//
//                        browser.assert.element(`div#mic canvas#visualizer`);
//
//                        // See note above...
//                        //browser.assert.style('div#mic canvas#visualizer', 'display', 'none');
//                        expect(canvas.style.display).toEqual('none');
//
//                        done();
//                      }).catch(err => {
//                        done.fail(err);
//                      });
//                    });
//                  });
//                });
//
//                describe('as tested with puppeteer', () => {
//
//                  const APP_URL = `http://localhost:${PORT}`;
//                  const puppeteer = require('puppeteer');
//                  // The `default` reference is temporary until `nock-puppeteer`
//                  // 1.0.6 is released
//                  const useNock = require('nock-puppeteer').default;
//                  const path = require('path');
//
//                  let puppetBrowser, page;
//                  beforeEach(async (done) => {
//
//                    try {
//                      puppetBrowser = await puppeteer.launch({
//                        headless: true,
//                        args: [
//                          '--use-fake-ui-for-media-stream',
//                          '--use-fake-device-for-media-stream',
//                          `--use-file-for-fake-video-capture=${path.resolve('spec/files/bus.mjpeg')}`
//                        ],
//                        /**
//                         * 2021-4-15
//                         *
//                         * Okay, this is weird...
//                         *
//                         * Though puppeteer knows where the local chromium
//                         * browser is located, it will not be able to find
//                         * it unless this property is set explicitly.
//                         *
//                         * https://github.com/puppeteer/puppeteer/issues/807
//                         * https://github.com/puppeteer/puppeteer/issues/679
//                         * https://github.com/puppeteer/puppeteer/issues/5403
//                         */
//                        executablePath: puppeteer.executablePath(),
//                      });
//                      page = await puppetBrowser.newPage();
//                      page.on('console', msg => console.log('PAGE LOG:', msg.text().toString()));
//                      useNock(page, [`https://${process.env.AUTH0_DOMAIN}`]);
//
//                      stubAuth0Sessions(agent.email,`localhost:${PORT}` , async err => {
//                        if (err) return done.fail(err);
//
//                        await page.goto(APP_URL);
//
//                        let link = await page.waitForSelector('#login-link');
//                        await page.click('#login-link');
//                        await page.waitForSelector('#mic-button');
//
//                        // Make sure the video is playing
//                        page.evaluate(async () => {
//                          return new Promise((resolve, reject) => {
//                            const player = document.getElementById('player');
//
//                            player.onplay = async () => {
//                              resolve();
//                            };
//                          });
//                        }).then(async() => {
//                          await page.waitForSelector('#capture');
//                          await page.click('#capture');
//                          await page.waitForSelector('#send');
//                          done();
//                        });
//
//                        expect(await page.$('#mic-button')).toBeTruthy();
//                        expect(await page.$('#tracks-form')).toBeFalsy();
//
//                        // Open the mic app
//                        await page.click('#mic-button');
//                      });
//                    } catch (e) {
//                      console.log(e);
//                    }
//                  });
//
//                  afterEach(async () => {
//                    await puppetBrowser.close();
//                  });
//
//                  describe('#send button', () => {
//                    // See above.
//                    it('displays a friendly message upon successful receipt of file', async () => {
//                      let redirected = false;
//                      page.on('response', response => {
//                        const status = response.status()
//                        if ((status >= 300) && (status <= 399)) {
//                          redirected = true;
//                        }
//                      });
//
//                      await page.click('#send');
//                      await page.waitForSelector('.alert.alert-success');
//                      expect(page.url()).toEqual(`${APP_URL}/track/${agent.getAgentDirectory()}`);
//                      expect(redirected).toBe(true);
//                    });
//
//                    it('hides the mic interface', async done => {
//                      let micIsVisible = await page.$eval('div#mic', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
//                      expect(micIsVisible).toBe(true);
//
//                      await page.waitForSelector('div#mic', { visible: true });
//                      page.click('#send').then(async () => {
//                        await page.waitForSelector('.alert.alert-success');
//                        await page.waitForSelector('div#mic');
//
//                        micIsVisible = await page.$eval('div#mic', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
//                        expect(micIsVisible).toBe(false);
//
//                        done();
//                      });
//                    });
//
//                    // See above.
//                    it('writes the file to the disk on agent\'s first access', done => {
//                      fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//                        if (err) {
//                          return done.fail(err);
//                        }
//                        expect(files.length).toEqual(0);
//
//                        page.click('#send').then(async () => {
//                          await page.waitForSelector('.alert.alert-success');
//                          await page.waitForSelector('div#mic');
//
//                          fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//                            if (err) {
//                              return done.fail(err);
//                            }
//                            expect(files.length).toEqual(1);
//                            done();
//                          });
//                        });
//                      });
//                    });
//
//                    // See above.
//                    it('creates a database record', done => {
//                      models.Track.find({}).then(tracks => {
//                        expect(tracks.length).toEqual(0);
//
//                        page.click('#send').then(async () => {
//                          await page.waitForSelector('.alert.alert-success');
//                          await page.waitForSelector('div#mic');
//
//                          models.Track.find({}).then(tracks => {
//                            expect(tracks.length).toEqual(1);
//                            expect(tracks[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);
//                            done();
//                          }).catch(err => {
//                            done.fail(err);
//                          });
//                        }).catch(err => {
//                          done.fail(err);
//                        });
//                      }).catch(err => {
//                        done.fail(err);
//                      });
//                    });
//
//                    // See above.
//                    it('lands in the right spot with an updated track list', async done => {
//                      let posts = await page.$$('.post');
//                      expect(posts.length).toEqual(0);
//                      page.click('#send').then(async () => {
//                        await page.waitForSelector('.alert.alert-success');
//                        await page.waitForSelector('div#mic');
//
//                        expect(page.url()).toEqual(`${APP_URL}/track/${agent.getAgentDirectory()}`);
//
//                        posts = await page.$$('.post');
//                        expect(posts.length).toEqual(1);
//
//                        done();
//                      }).catch(err => {
//                        done.fail(err);
//                      });
//                    });
//
//                    /**
//                     * 2021-4-16
//                     *
//                     * Testing spinners has always proven weirdly challenging.
//                     *
//                     * As with other frameworks, the tests execute so quickly
//                     * that the spinner never renders. This tests to make sure
//                     * the spinner and mic disappear after an upload.
//                     *
//                     * There's a test in the zombie block for the intermediary
//                     * spinner/sender button behaviour.
//                     */
//                    it('reveals and hides a progress spinner', async () => {
//                      let micIsVisible = await page.$eval('div#mic', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
//                      expect(micIsVisible).toBe(true);
//
//                      let spinnerIsVisible = await page.$eval('#spinner', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
//                      expect(spinnerIsVisible).toBe(false);
//
//                      await page.click('#send');
//
//                      await page.waitForSelector('.alert.alert-success');
//                      await page.waitForSelector('div#mic');
//
//                      spinnerIsVisible = await page.$eval('#spinner', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
//                      expect(spinnerIsVisible).toBe(false);
//
//                      micIsVisible = await page.$eval('div#mic', e => window.getComputedStyle(e).getPropertyValue('display') !== 'none');
//                      expect(micIsVisible).toBe(false);
//                    });
//                  });
//                });
//              });
//            });

//            describe('#go-back button', () => {
//
//              let mediaTrackStopSpy, streamRemoveTrackSpy;
//              beforeEach(done => {
//                mediaTrackStopSpy = jasmine.createSpy('stop');
//                streamRemoveTrackSpy = jasmine.createSpy('removeTrack');
//
//                mediaDevices = {
//                  ..._mediaDevices,
//                  getUserMedia: () => {
//                    return new Promise((resolve, reject) => {
//                      resolve({
//                        dummy: 'This device has at least two mics!',
//                        removeTrack: streamRemoveTrackSpy,
//                        getTracks: () => [
//                          {
//                            stop: mediaTrackStopSpy
//                          }
//                        ]
//                      });
//                    });
//                  }
//                };
//
//                browser.reload(err => {
//                  if (err) return done.fail(err);
//
//                  browser.click('#mic-button').then(res => {
//                    done();
//                  }).catch(err => {
//                    done.fail(err);
//                  });
//                });
//              });
//
//              it('does not display the mic', done => {
//                browser.assert.element('div#mic');
//                browser.assert.style('div#mic', 'display', 'block');
//                browser.click('#go-back').then(res => {
//                  browser.assert.style('div#mic', 'display', 'none');
//                  done();
//                }).catch(err => {
//                  done.fail(err);
//                });
//              });
//
//              it('removes the existing tracks', done => {
//                expect(streamRemoveTrackSpy.calls.count()).toEqual(0);
//                browser.click('#go-back').then(res => {
//                  expect(streamRemoveTrackSpy.calls.count()).toEqual(1);
//                  done();
//                }).catch(err => {
//                  done.fail(err);
//                });
//              });
//
//              it('stops the existing streams', done => {
//                expect(mediaTrackStopSpy.calls.count()).toEqual(0);
//                browser.click('#go-back').then(res => {
//                  expect(mediaTrackStopSpy.calls.count()).toEqual(1);
//                  done();
//                }).catch(err => {
//                  done.fail(err);
//                });
//              });
//            });
          });
        });
      });
    });
  });
});
