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

                // Probably won't use two mics at the same time...
                it('removes the existing tracks', done => {
                  expect(streamRemoveTrackSpy.calls.count()).toEqual(0);
                  browser.click('#send').then(res => {
                    expect(streamRemoveTrackSpy.calls.count()).toEqual(2);
                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });

                it('stops the existing media streams', done => {
                  expect(mediaTrackStopSpy.calls.count()).toEqual(0);
                  browser.click('#send').then(res => {
                    expect(mediaTrackStopSpy.calls.count()).toEqual(2);
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
                      headless: true,
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
          });
        });
      });
    });
  });
});
