const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../app');
const request = require('supertest');
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

describe('trackEditSpec', () => {
  let browser, agent, lanny;

  beforeEach(done => {
    delete process.env.SUDO;

    browser = new Browser({ waitDuration: '30s', loadCss: true });
    //browser.debug();
    fixtures.load(__dirname + '/../fixtures/agents.js', models.mongoose, err => {
      models.Agent.findOne({ email: 'daniel@example.com' }).then(results => {
        agent = results;
        models.Agent.findOne({ email: 'lanny@example.com' }).then(results => {
          lanny = results;
          done();
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
          done();
        }).catch(err => {
          done.fail(err);
        });
      });
    });

    afterEach(() => {
      mock.restore();
    });

    describe('as tested with zombie', () => {

      beforeEach(done => {
        browser.visit('/', err => {
          if (err) return done.fail(err);
          browser.assert.success();

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
        });
      });

      afterEach(() => {
        mock.restore();
      });

      describe('authorized', () => {

        describe('owner', () => {

          beforeEach(done => {
            browser.clickLink(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`, (err) => {
              if (err) done.fail(err);
              browser.assert.success();
              done();
            });
          });

          describe('edit name field', () => {

            describe('interface', () => {

              it('has an edit button', () => {
                browser.assert.element('.post .track figure figcaption h2 i#edit-track-name');
              });

              it('reveals cancel and save buttons when editing', done => {
                browser.assert.style('.post .track figure figcaption h2 i#cancel-edit-track-name', 'display', 'none');
                browser.assert.style('.post .track figure figcaption h2 i#save-track-name', 'display', 'none');
                browser.click('i#edit-track-name', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure figcaption h2 i#cancel-edit-track-name', 'display', '');
                  browser.assert.style('.post .track figure figcaption h2 i#save-track-name', 'display', '');
                  done();
                });
              });

              it('hides the edit button when editing', done => {
                browser.assert.style('.post .track figure figcaption h2 i#edit-track-name', 'display', '');
                browser.click('i#edit-track-name', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure figcaption h2 i#edit-track-name', 'display', 'none');
                  done();
                });
              });

              it('reveals cancel and save buttons when field is given focus via direct click', done => {
                browser.assert.style('.post .track figure figcaption h2 i#cancel-edit-track-name', 'display', 'none');
                browser.assert.style('.post .track figure figcaption h2 i#save-track-name', 'display', 'none');
                browser.assert.style('.post .track figure figcaption h2 i#edit-track-name', 'display', '');

                // 2021-5-7
                // Clicking works in tests, but not in real life.
                // Focus works in real life, but not in tests.
                browser.click('#track-name-field', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure figcaption h2 i#cancel-edit-track-name', 'display', '');
                  browser.assert.style('.post .track figure figcaption h2 i#save-track-name', 'display', '');
                  browser.assert.style('.post .track figure figcaption h2 i#edit-track-name', 'display', 'none');
                  done();
                });
              });

              // 2021-5-6
              // Might need puppeteer to test this...
              // Zombie doesn't seem to recognize focus given to contenteditable elements
              //
              // 2021-5-7
              // Puppeteer behavioural tests below
              //
              //fit('gives focus to name field when editing', done => {
              //it('gives focus to name field when editing', done => {
              //  browser.assert.hasFocus(null);
              //  browser.assert.hasFocus('body');
              //  browser.click('i#edit-track-name', err => {
              //    if (err) return done.fail(err);
              //    setTimeout(function(){
              //      console.log(browser.document.activeElement);
              //      browser.assert.hasFocus('#track-name-field');
              //      done();
              //    }, 500);
              //  });
              //});
            });

            describe('successfully', () => {

              it('lands in the correct spot and displays a friendly message', done => {
                browser.document.getElementById('track-name-field').innerHTML = 'Austin Powers';
                browser.assert.text('.post .track figure figcaption h2 span#track-name-field', 'Austin Powers');

                browser.click('i#save-track-name', err => {
                  if (err) return done.fail(err);

                  // Let the Javascript execute
                  setTimeout(function(){
                    browser.assert.url({ pathname: `/track/${agent.getAgentDirectory()}/track1.ogg` });
                    browser.assert.text('.alert.alert-success', 'Track updated');
                    done();
                  }, 300);
                });
              });

              it('updates the interface', done => {
                browser.click('i#edit-track-name', err => {
                  if (err) return done.fail(err);

                  browser.assert.text('#track-name-field', '');
                  browser.assert.style('.post .track figure figcaption h2 i#cancel-edit-track-name', 'display', '');
                  browser.assert.style('.post .track figure figcaption h2 i#save-track-name', 'display', '');
                  browser.assert.style('.post .track figure figcaption h2 i#edit-track-name', 'display', 'none');

                  browser.document.getElementById('track-name-field').innerHTML = 'Austin Powers';
                  browser.assert.text('.post .track figure figcaption h2 span#track-name-field', 'Austin Powers');

                  browser.click('i#save-track-name', err => {
                    if (err) return done.fail(err);

                    setTimeout(function(){
                      browser.assert.text('#track-name-field', 'Austin Powers');
                      browser.assert.style('.post .track figure figcaption h2 i#cancel-edit-track-name', 'display', 'none');
                      browser.assert.style('.post .track figure figcaption h2 i#save-track-name', 'display', 'none');
                      browser.assert.style('.post .track figure figcaption h2 i#edit-track-name', 'display', '');

                      done();
                    }, 300);
                  });
                });
              });


            });

            describe('cancelled', () => {

              beforeEach(done => {
                browser.click('i#edit-track-name', err => {
                  if (err) return done.fail(err);
                  done();
                });
              });

              it('resets the interface', done => {
                browser.assert.style('.post .track figure figcaption h2 i#save-track-name', 'display', '');
                browser.assert.style('.post .track figure figcaption h2 i#edit-track-name', 'display', 'none');
                browser.assert.style('.post .track figure figcaption h2 i#cancel-edit-track-name', 'display', '');

                browser.click('i#cancel-edit-track-name', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure figcaption h2 i#edit-track-name', 'display', '');
                  browser.assert.style('.post .track figure figcaption h2 i#save-track-name', 'display', 'none');
                  browser.assert.style('.post .track figure figcaption h2 i#cancel-edit-track-name', 'display', 'none');

                  done();
                });
              });

              it('resets the value', done => {
                browser.assert.text('.post .track figure figcaption h2 span#track-name-field', '');
                browser.document.getElementById('track-name-field').innerHTML = 'Austin Powers';
                browser.assert.text('.post .track figure figcaption h2 span#track-name-field', 'Austin Powers');

                browser.click('i#cancel-edit-track-name', err => {
                  if (err) return done.fail(err);

                  browser.assert.text('.post .track figure figcaption h2 span#track-name-field', '');
                  done();
                });
              });
            });
          });

          describe('edit transcription field', () => {

            describe('interface', () => {

              it('has an edit button', done => {
                done.fail();
              });

              it('reveals a cancel button when editing', done => {
                done.fail();
              });

              it('reveals a save button when editing', done => {
                done.fail();
              });

              it('does not submit on Enter keypress', done => {
                done.fail();
              });

              it('submits on ctrl-s keypress', done => {
                done.fail();
              });

              it('reveals cancel and save buttons when field is given focus via direct click', done => {
                done.fail();
              });
            });

            describe('successfully', () => {

              it('lands in the correct spot', done => {
                done.fail();
              });

              it('updates the interface', done => {
                done.fail();
              });

              it('updates the database', done => {
                done.fail();
              });
            });

            describe('cancelled', () => {

              it('lands in the correct spot', done => {
                done.fail();
              });

              it('resets the value', done => {
                done.fail();
              });

              it('does not touch the database', done => {
                done.fail();
              });
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

          describe('edit name field', () => {

            describe('interface', () => {

              it('has an edit button', done => {
                done.fail();
              });

              it('reveals a cancel button when editing', done => {
                done.fail();
              });

              it('reveals a save button when editing', done => {
                done.fail();
              });
            });

            describe('successfully', () => {

              it('lands in the correct spot', done => {
                done.fail();
              });

              it('updates the interface', done => {
                done.fail();
              });

              it('updates the database', done => {
                done.fail();
              });
            });

            describe('cancelled', () => {

              it('lands in the correct spot', done => {
                done.fail();
              });

              it('resets the value', done => {
                done.fail();
              });

              it('does not touch the database', done => {
                done.fail();
              });
            });
          });

          describe('edit transcription field', () => {

            describe('interface', () => {

              it('has an edit button', done => {
                done.fail();
              });

              it('reveals a cancel button when editing', done => {
                done.fail();
              });

              it('reveals a save button when editing', done => {
                done.fail();
              });
            });

            describe('successfully', () => {

              it('lands in the correct spot', done => {
                done.fail();
              });

              it('updates the interface', done => {
                done.fail();
              });

              it('updates the database', done => {
                done.fail();
              });
            });

            describe('cancelled', () => {

              it('lands in the correct spot', done => {
                done.fail();
              });

              it('resets the value', done => {
                done.fail();
              });

              it('does not touch the database', done => {
                done.fail();
              });
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

        describe('canRead agent', () => {

          describe('edit name field', () => {

            it('responds with forbidden', done => {
              request(app)
                .patch(`/track/${lanny.getAgentDirectory()}/lanny2.ogg`)
                .set('Cookie', browser.cookies)
                .set('Accept', 'application/json')
                .send({
                  name: 'Austin Powers',
                })
                .expect(403)
                .end((err, res) => {
                  if (err) return done.fail(err);

                  expect(res.body.message).toEqual('You are not authorized to access that resource');
                  done();
                });
            });
          });

          describe('edit transcription field', () => {

            it('responds with forbidden', done => {
              request(app)
                .patch(`/track/${lanny.getAgentDirectory()}/lanny2.ogg`)
                .set('Cookie', browser.cookies)
                .set('Accept', 'application/json')
                .send({
                  transcription: 'Groovy, baby! Yeah...'
                })
                .expect(403)
                .end((err, res) => {
                  if (err) return done.fail(err);

                  expect(res.body.message).toEqual('You are not authorized to access that resource');
                  done();
                });
            });
          });
        });
      });
    });

    /**
     * 2021-5-7
     *
     * Zombie fell short in a couple of ways...
     *
     * First weird problem: there is an empty body when sending a PATCH request
     * with fetch in zombie. It works fine with PUT, but then the verb
     * semantics is completely destroyed.
     *
     * There is also the issue of testing focus... it doesn't seem as though
     * zombie can assert focus on a `contenteditable` element.
     */
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
            executablePath: puppeteer.executablePath(),
          });
          page = await puppetBrowser.newPage();
          page.on('console', msg => console.log('PAGE LOG:', msg.text().toString()));

          useNock(page, [`https://${process.env.AUTH0_DOMAIN}`]);

          stubAuth0Sessions(agent.email,`localhost:${PORT}` , async err => {
            if (err) return done.fail(err);

            await page.goto(APP_URL);

            await page.waitForSelector('#login-link');
            await page.click('#login-link');
            await page.waitForTimeout(200);

            await page.waitForSelector(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`);
            await page.click(`a[href="/track/${agent.getAgentDirectory()}/track1.ogg"]`);
            await page.waitForTimeout(200);

            done();
          });
        } catch (e) {
          console.log(e);
        }
      });

      afterEach(async () => {
        await puppetBrowser.close();
      });

      it('updates the database', done => {
        const filePath = `uploads/${agent.getAgentDirectory()}/track1.ogg`;
        models.Track.findOne({ path: filePath }).then(async track => {
          expect(track.name).toEqual('');

          page.type('#track-name-field', 'Austin Powers');
          await page.waitForTimeout(100);

          page.click('i#save-track-name').then(async () => {

            await page.waitForTimeout(200);

            models.Track.findOne({ path: filePath }).then(track => {
              expect(track.name).toEqual('Austin Powers');
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

      /**
       * 2021-5-7
       *
       * Another weirdly difficult problem with my current test tools...
       *
       * This is purely behaviourly tested. I have found no simple way
       * to match the `document.activeElement` with a queried element.
       *
       * This test breaks if focus isn't set in the track show view js.
       */
      it('gives focus to name field when editing', async done => {
        const filePath = `uploads/${agent.getAgentDirectory()}/track1.ogg`;
        models.Track.findOne({ path: filePath }).then(async track => {
          expect(track.name).toEqual('');

          await page.click('i#edit-track-name');
          await page.waitForTimeout(200);

          // If it's not focussed on the correct `contenteditable` field, this test fails
          let focussed = await page.evaluateHandle(() => document.activeElement);
          focussed.type('Austin Powers');

          await page.waitForTimeout(100);

          page.click('i#save-track-name').then(async () => {

            await page.waitForTimeout(200);

            models.Track.findOne({ path: filePath }).then(track => {
              // If this is an '' string, it's because focus was not given to the element
              expect(track.name).toEqual('Austin Powers');
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


      it('submits on Enter keypress', done => {
        done.fail();
      });
    });
  });

  describe('unauthenticated', () => {
    it('does not allow editing a track', done => {
      request(app)
        .patch(`/track/${agent.getAgentDirectory()}/track2.ogg`)
        .set('Accept', 'application/json')
        .send({
          name: 'Austin Powers',
          transcription: 'Groovy, baby! Yeah...'
        })
        .expect(401)
        .end((err, res) => {
          if (err) return done.fail(err);

          expect(res.body.message).toEqual('You are not logged in');
          done();
        });
    });
  });
});
