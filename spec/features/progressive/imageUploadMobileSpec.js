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
                facingMode: 'environment',
                width: { ideal: 4096 },
                height: { ideal: 2160 }
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

              browser.assert.element(`div#camera video#player[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);
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

              browser.assert.element(`div#camera canvas#viewer[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);
              browser.assert.style('div#camera canvas#viewer', 'display', 'none');

              done();
            }).catch(err => {
              done.fail(err);
            });
          });

          describe('#shooter controls', () => {

            describe('#reverse-camera button', () => {
              describe('exists', () => {

                let mediaTrackStopSpy, streamRemoveTrackSpy;
                beforeEach(done => {
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
                          dummy: 'This device has at least two cameras!',
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

                /**
                 * 2021-3-26
                 *
                 * This makes it so the app doesn't freeze in Android Chrome.
                 *
                 * See https://github.com/twilio/twilio-video-app-react/issues/355#issuecomment-780368725
                 */
                it('removes existing tracks', done => {
                  expect(streamRemoveTrackSpy.calls.count()).toEqual(0);
                  browser.click('#camera-button').then(res => {
                    browser.click('#reverse-camera').then(res => {
                      expect(streamRemoveTrackSpy.calls.count()).toEqual(2);
                      done();
                    }).catch(err => {
                      done.fail(err);
                    });
                  }).catch(err => {
                    done.fail(err);
                  });
                });

                it('stops any existing streams', done => {
                  expect(mediaTrackStopSpy.calls.count()).toEqual(0);
                  browser.click('#camera-button').then(res => {
                    browser.click('#reverse-camera').then(res => {
                      expect(mediaTrackStopSpy.calls.count()).toEqual(2);
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
                 * And thus, _behavioural_ testing wins the day.
                 *
                 * ... didn't see the `capture` attribute!
                 */
                it('toggles the video constraint and restarts the stream', done => {
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
              let mediaTrackStopSpy, streamRemoveTrackSpy, drawImageSpy, canvas;
              beforeEach(done => {
                mediaTrackStopSpy = jasmine.createSpy('stop');
                streamRemoveTrackSpy = jasmine.createSpy('removeTrack');

                // Need to make sure the image is drawn on the viewer canvas
                drawImageSpy = jasmine.createSpy('drawImage');
                canvas = {
                  style: {},
                  getContext: (dim) => {
                    return {
                      drawImage: drawImageSpy
                    };
                  },
                  toBlob: (done) => {
                    fs.readFile(`spec/files/troll.jpg`, (err, fileData) => {
                      if (err) return done.fail(err);

                      /**
                       * 2021-3-30
                       *
                       * There are some notes on related matters on the _sender
                       * controls_ block below. This is left here temporarily
                       * for reference (node buffers aren't the same as
                       * Javascript buffers).
                       *
                       * This may become relevant again...
                       */
                      const arrayBuffer = new Uint8Array(fileData).buffer;
                      const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });

                      done(blob);
                    });
                  }
                };

                mediaDevices = {
                  ..._mediaDevices,
                  getUserMedia: () => {
                    return new Promise((resolve, reject) => {
                      resolve({
                        dummy: 'This device has at least two cameras!',
                        removeTrack: streamRemoveTrackSpy,
                        getTracks: () => [
                          {
                            stop: mediaTrackStopSpy
                          }
                        ]
                      });
                    });
                  }
                };

                /**
                 * Mock browser MediaDevices interface
                 */
                Browser.extend(function(browser) {
                  browser.on('response', (req, res) => {
                    if (browser.window) {
                      browser.window.navigator.mediaDevices = mediaDevices;
                    }
                  });

                  /**
                   * This is all for the purpose of ensuring `drawImage` is called on
                   * the `canvas` element.
                   *
                   * I don't know why each `getElementId` call has to be explicitly
                   * stubbed. Jasmine barfs if you don't...
                   */
                  browser.on('loaded', (req, res) => {
                    spyOn(browser.document, 'getElementById')
                      .withArgs('photos-input').and.callThrough()
                      .withArgs('photos-form').and.callThrough()
                      .withArgs('camera-button').and.callThrough()
                      .withArgs('camera').and.callThrough()
                      // This is the relevant spy
                      .withArgs('viewer').and.returnValue(canvas)
                      .withArgs('shooter').and.callThrough()
                      .withArgs('sender').and.callThrough()
                      .withArgs('cancel').and.callThrough()
                      .withArgs('send').and.callThrough()
                      .withArgs('player').and.callThrough()
                      .withArgs('capture').and.callThrough()
                      .withArgs('reverse-camera').and.callThrough()
                      .withArgs('go-back').and.callThrough();
                  });
                });

                stubAuth0Sessions(agent.email, DOMAIN, err => {
                  if (err) done.fail(err);

                  browser = new Browser();
                  browser.visit('/', err => {
                    if (err) return done.fail(err);

                    browser.clickLink('Login', err => {
                      if (err) return done.fail(err);
                      browser.assert.element('#camera-button');
                      browser.assert.elements('#photos-form', 0);

                      browser.click('#camera-button').then(res => {
                        done();
                      }).catch(err => {
                        done.fail(err);
                      });
                    });
                  });
                });
              });

              it('hides the camera and reveals the viewer interface', done => {
                browser.assert.style('div#camera', 'display', 'block');

                browser.assert.element(`div#camera video#player[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);
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

                browser.assert.element(`div#camera canvas#viewer[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);
                //
                // The canvas element is stubbed out. Using `browser.assert`
                // (as below) won't work in this case. Testing the `canvas`
                // object is the next best thing.
                //
                //browser.assert.style('div#camera canvas#viewer', 'display', 'none');
                expect(canvas.style.display).toEqual('none');

                browser.click('#capture').then(res => {
                  browser.assert.style('div#camera', 'display', 'block');

                  browser.assert.element(`div#camera video#player[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);
                  browser.assert.style('div#camera video#player', 'display', 'none');

                  browser.assert.element('div#camera nav#shooter');
                  browser.assert.style('div#camera nav#shooter', 'display', 'none');

                  browser.assert.element('div#camera nav#sender');
                  browser.assert.element('div#camera nav#sender button#send');
                  browser.assert.element('div#camera nav#sender button#cancel');
                  browser.assert.style('div#camera nav#sender', 'display', 'block');

                  // See note above...
                  //browser.assert.style('div#camera canvas#viewer', 'display', 'block');
                  expect(canvas.style.display).toEqual('block');
                  browser.assert.element(`div#camera canvas#viewer[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              it('draws the camera image to the canvas before stopping media tracks and streams', done => {
                browser.click('#capture').then(res => {
                  expect(drawImageSpy).toHaveBeenCalled();
                  expect(drawImageSpy).toHaveBeenCalledBefore(streamRemoveTrackSpy);
                  expect(drawImageSpy).toHaveBeenCalledBefore(mediaTrackStopSpy);
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              it('removes the existing tracks', done => {
                expect(streamRemoveTrackSpy.calls.count()).toEqual(0);
                browser.click('#capture').then(res => {
                  expect(streamRemoveTrackSpy.calls.count()).toEqual(1);
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              it('stops the existing media streams', done => {
                expect(mediaTrackStopSpy.calls.count()).toEqual(0);
                browser.click('#capture').then(res => {
                  expect(mediaTrackStopSpy.calls.count()).toEqual(1);
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              /**
               * 2021-3-30
               *
               * Whoa! Zombie JS is not currently able to upload files via the
               * `FormData` interface. As such, certain functionality cannot be
               * tested with Zombie JS.
               *
               * The problematic tests are sketched in for future reference, as
               * I suspect something like Puppeteer may be more suitable for
               * these purposes.
               */
              describe('#sender controls', () => {
                beforeEach(done => {
                  browser.click('#capture').then(res => {
                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });

                describe('#send button', () => {
                  // See above.
                  //it('displays a friendly message upon successful receipt of file', done => {
                  //  browser.click('#send').then(res => {
                  //    browser.assert.redirected();
                  //    browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
                  //    browser.assert.text('.alert.alert-success', 'Image received');
                  //    done();
                  //  }).catch(err => {
                  //    done.fail(err);
                  //  });
                  //});

                  it('hides the camera interface', done => {
                    browser.assert.style('div#camera', 'display', 'block');
                    browser.click('#send').then(res => {
                      // client-side Javascript needs a bit of time. Zombie doesn't wait
                      setTimeout(() => {
                        browser.assert.style('div#camera', 'display', 'none');
                        done();
                      }, 200);
                    }).catch(err => {
                      done.fail(err);
                    });
                  });

                  // See above.
                  //it('writes the file to the disk on agent\'s first access', done => {
                  //  fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                  //    if (err) {
                  //      return done.fail(err);
                  //    }
                  //    expect(files.length).toEqual(0);

                  //    browser.click('#send').then(res => {

                  //      setTimeout(() => {
                  //        fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {

                  //          if (err) {
                  //            return done.fail(err);
                  //          }
                  //          expect(files.length).toEqual(1);

                  //          done();
                  //      });
                  //      }, 1000);
                  //    }).catch(err => {
                  //      done.fail(err);
                  //    });
                  //  });
                  //});

                  // See above.
                  //it('creates a database record', done => {
                  //  models.Image.find({}).then(images => {
                  //    expect(images.length).toEqual(0);

                  //    browser.click('#send').then(res => {
                  //      models.Image.find({}).then(images => {
                  //        expect(images.length).toEqual(1);
                  //        expect(images[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);

                  //        done();
                  //      }).catch(err => {
                  //        done.fail(err);
                  //      });
                  //    }).catch(err => {
                  //      done.fail(err);
                  //    });
                  //  }).catch(err => {
                  //    done.fail(err);
                  //  });
                  //});

                  // See above.
                  //it('lands in the right spot with an updated image list', done => {
                  //  done.fail();
                  //});
                });

                describe('#cancel button', () => {
                  it('returns to the camera interface', done => {
                    browser.assert.style('div#camera', 'display', 'block');

                    browser.assert.element(`div#camera video#player[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);
                    browser.assert.style('div#camera video#player', 'display', 'none');

                    browser.assert.element('div#camera nav#shooter');
                    browser.assert.style('div#camera nav#shooter', 'display', 'none');

                    browser.assert.element('div#camera nav#sender');
                    browser.assert.element('div#camera nav#sender button#send'); browser.assert.element('div#camera nav#sender button#cancel'); browser.assert.style('div#camera nav#sender', 'display', 'block');

                    //
                    // The canvas element is stubbed out. Using `browser.assert`
                    // (as below) won't work in this case. Testing the `canvas`
                    // object is the next best thing.
                    //
                    //browser.assert.style('div#camera canvas#viewer', 'display', 'block');
                    expect(canvas.style.display).toEqual('block');
                    browser.assert.element(`div#camera canvas#viewer[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);

                    browser.click('#cancel').then(res => {
                      browser.assert.style('div#camera', 'display', 'block');

                      browser.assert.element(`div#camera video#player[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);
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

                      browser.assert.element(`div#camera canvas#viewer[width="${browser.window.innerWidth}"][height="${browser.window.innerHeight}"]`);

                      // See note above...
                      //browser.assert.style('div#camera canvas#viewer', 'display', 'none');
                      expect(canvas.style.display).toEqual('none');

                      done();
                    }).catch(err => {
                      done.fail(err);
                    });
                  });
                });
              });
            });

            describe('#go-back button', () => {

              let mediaTrackStopSpy, streamRemoveTrackSpy;
              beforeEach(done => {
                mediaTrackStopSpy = jasmine.createSpy('stop');
                streamRemoveTrackSpy = jasmine.createSpy('removeTrack');

                mediaDevices = {
                  ..._mediaDevices,
                  getUserMedia: () => {
                    return new Promise((resolve, reject) => {
                      resolve({
                        dummy: 'This device has at least two cameras!',
                        removeTrack: streamRemoveTrackSpy,
                        getTracks: () => [
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

                  browser.click('#camera-button').then(res => {
                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
              });

              it('does not display the camera', done => {
                browser.assert.element('div#camera');
                browser.assert.style('div#camera', 'display', 'block');
                browser.click('#go-back').then(res => {
                  browser.assert.style('div#camera', 'display', 'none');
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              it('removes the existing tracks', done => {
                expect(streamRemoveTrackSpy.calls.count()).toEqual(0);
                browser.click('#go-back').then(res => {
                  expect(streamRemoveTrackSpy.calls.count()).toEqual(1);
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });

              it('stops the existing streams', done => {
                expect(mediaTrackStopSpy.calls.count()).toEqual(0);
                browser.click('#go-back').then(res => {
                  expect(mediaTrackStopSpy.calls.count()).toEqual(1);
                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            });
          });
        });
      });
    });
  });
});
