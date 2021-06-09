const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const fs = require('fs');
const app = require('../../../app');
const request = require('supertest');
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../../models');

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

describe('sudo trackEditSpec', () => {
  let browser, agent, lanny;

  beforeEach(done => {
    browser = new Browser({ waitDuration: '30s', loadCss: true });
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

    describe('as tested with zombie', () => {

      describe('authorized', () => {

        describe('root\'s own resource', () => {

          beforeEach(done => {
            browser.clickLink('Tracks', err => {
              if (err) done.fail(err);

              browser.clickLink(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`, (err) => {
                if (err) done.fail(err);
                browser.assert.success();
                done();
              });
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
              // See Puppeteer behavioural tests below...
              //
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
                    browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}/root1.ogg` });
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
                      browser.assert.style('.post .track figure figcaption h2 i#cancel-edit-track-name', 'display', 'none');
                      browser.assert.style('.post .track figure figcaption h2 i#save-track-name', 'display', 'none');
                      browser.assert.style('.post .track figure figcaption h2 i#edit-track-name', 'display', '');
                      browser.assert.text('#track-name-field', 'Austin Powers');

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

              it('resets the field value when focus is lost and then regained', done => {
                browser.assert.text('.post .track figure figcaption h2 span#track-name-field', '');
                browser.document.getElementById('track-name-field').innerHTML = 'Austin Powers';
                browser.assert.text('.post .track figure figcaption h2 span#track-name-field', 'Austin Powers');

                browser.focus('body');
                browser.click('#track-name-field', err => {
                  browser.assert.text('.post .track figure figcaption h2 span#track-name-field', 'Austin Powers');

                  browser.focus('body');
                  browser.click('#track-name-field', err => {
                    browser.assert.text('.post .track figure figcaption h2 span#track-name-field', 'Austin Powers');

                    browser.click('i#cancel-edit-track-name', err => {
                      if (err) return done.fail(err);

                      browser.assert.text('.post .track figure figcaption h2 span#track-name-field', '');
                      done();
                    });
                  });
                });
              });
            });
          });

          describe('edit transcript field', () => {

            describe('interface', () => {

              it('has an edit button', () => {
                browser.assert.element('.post .track figure h3 i#edit-track-transcript');
              });

              it('reveals cancel and save buttons when editing', done => {
                browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', 'none');
                browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', 'none');
                browser.click('i#edit-track-transcript', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', '');
                  done();
                });
              });

              it('hides the edit button when editing', done => {
                browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', '');
                browser.click('i#edit-track-transcript', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', 'none');
                  done();
                });
              });

              it('reveals cancel and save buttons when field is given focus via direct click', done => {
                browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', 'none');
                browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', 'none');
                browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', '');

                // 2021-5-7
                // Clicking works in tests, but not in real life.
                // Focus works in real life, but not in tests.
                browser.click('#track-transcript-field', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', 'none');
                  done();
                });
              });
            });

            describe('successfully', () => {

              it('lands in the correct spot and displays a friendly message', done => {
                browser.document.getElementById('track-transcript-field').innerHTML = 'Groovy, baby! Yeah!';
                browser.assert.text('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                browser.click('i#save-track-transcript', err => {
                  if (err) return done.fail(err);

                  // Let the Javascript execute
                  setTimeout(function(){
                    browser.assert.url({ pathname: `/track/${root.getAgentDirectory()}/root1.ogg` });
                    browser.assert.text('.alert.alert-success', 'Track updated');
                    done();
                  }, 300);
                });
              });

              it('updates the interface', done => {
                browser.click('i#edit-track-transcript', err => {
                  if (err) return done.fail(err);

                  browser.assert.text('#track-transcript-field', '');
                  browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', 'none');

                  browser.document.getElementById('track-transcript-field').innerHTML = 'Groovy, baby! Yeah!';
                  browser.assert.text('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                  browser.click('i#save-track-transcript', err => {
                    if (err) return done.fail(err);

                    setTimeout(function(){
                      browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', 'none');
                      browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', 'none');
                      browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', '');
                      browser.assert.text('#track-transcript-field', 'Groovy, baby! Yeah!');

                      done();
                    }, 300);
                  });
                });
              });
            });

            describe('cancelled', () => {

              beforeEach(done => {
                browser.click('i#edit-track-transcript', err => {
                  if (err) return done.fail(err);
                  done();
                });
              });

              it('resets the value', done => {
                browser.assert.input('.post .track figure #track-transcript-field', '');
                browser.document.getElementById('track-transcript-field').value = 'Groovy, baby! Yeah!';
                browser.assert.input('#track-transcript-field', 'Groovy, baby! Yeah!');

                browser.click('i#cancel-edit-track-transcript', err => {
                  if (err) return done.fail(err);

                  browser.assert.text('.post .track figure #track-transcript-field', '');
                  done();
                });
              });

              it('resets the field value when focus is lost and then regained', done => {
                browser.assert.text('.post .track figure #track-transcript-field', '');
                browser.document.getElementById('track-transcript-field').innerHTML = 'Groovy, baby! Yeah!';
                browser.assert.input('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                browser.focus('body');
                browser.click('#track-transcript-field', err => {
                  browser.assert.input('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                  browser.focus('body');
                  browser.click('#track-transcript-field', err => {
                    browser.assert.input('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                    browser.click('i#cancel-edit-track-transcript', err => {
                      if (err) return done.fail(err);

                      browser.assert.input('.post .track figure #track-transcript-field', '');
                      done();
                    });
                  });
                });
              });

              it('resets the interface', done => {
                browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', '');
                browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', 'none');
                browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', '');

                browser.click('i#cancel-edit-track-transcript', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', 'none');
                  browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', 'none');

                  done();
                });
              });
            });
          });
        });

        describe('regular agent resource', () => {

          beforeEach(done => {
            //browser.visit(`/track/${lanny.getAgentDirectory()}/lanny1.ogg`, err => {
            browser.clickLink(lanny.getAgentDirectory(), err => {
              if (err) done.fail(err);
              browser.assert.success();

              browser.clickLink(`a[href="/track/${lanny.getAgentDirectory()}/lanny1.ogg"]`, err => {
                if (err) done.fail(err);
                browser.assert.success();

                done();
              });
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
            });

            describe('successfully', () => {
              it('lands in the correct spot and displays a friendly message', done => {
                browser.document.getElementById('track-name-field').innerHTML = 'Austin Powers';
                browser.assert.text('.post .track figure figcaption h2 span#track-name-field', 'Austin Powers');

                browser.click('i#save-track-name', err => {
                  if (err) return done.fail(err);

                  // Let the Javascript execute
                  setTimeout(function(){
                    browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
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

          describe('edit transcript field', () => {

            describe('interface', () => {

              it('has an edit button', () => {
                browser.assert.element('.post .track figure h3 i#edit-track-transcript');
              });

              it('reveals cancel and save buttons when editing', done => {
                browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', 'none');
                browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', 'none');
                browser.click('i#edit-track-transcript', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', '');
                  done();
                });
              });

              it('hides the edit button when editing', done => {
                browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', '');
                browser.click('i#edit-track-transcript', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', 'none');
                  done();
                });
              });

              it('reveals cancel and save buttons when field is given focus via direct click', done => {
                browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', 'none');
                browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', 'none');
                browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', '');

                // 2021-5-7
                // Clicking works in tests, but not in real life.
                // Focus works in real life, but not in tests.
                browser.click('#track-transcript-field', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', 'none');
                  done();
                });
              });
            });

            // See puppeteer block for DB update test.
            // PATCHing with zombie leaves an empty request body
            describe('successfully', () => {

              it('lands in the correct spot and displays a friendly message', done => {
                browser.document.getElementById('track-transcript-field').innerHTML = 'Groovy, baby! Yeah!';
                browser.assert.text('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                browser.click('i#save-track-transcript', err => {
                  if (err) return done.fail(err);

                  // Let the Javascript execute
                  setTimeout(function(){
                    browser.assert.url({ pathname: `/track/${lanny.getAgentDirectory()}/lanny1.ogg` });
                    browser.assert.text('.alert.alert-success', 'Track updated');
                    done();
                  }, 300);
                });
              });

              it('updates the interface', done => {
                browser.click('i#edit-track-transcript', err => {
                  if (err) return done.fail(err);

                  browser.assert.text('#track-transcript-field', '');
                  browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', 'none');

                  browser.document.getElementById('track-transcript-field').innerHTML = 'Groovy, baby! Yeah!';
                  browser.assert.text('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                  browser.click('i#save-track-transcript', err => {
                    if (err) return done.fail(err);

                    setTimeout(function(){
                      browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', 'none');
                      browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', 'none');
                      browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', '');
                      browser.assert.text('#track-transcript-field', 'Groovy, baby! Yeah!');

                      done();
                    }, 300);
                  });
                });
              });
            });

            describe('cancelled', () => {

              beforeEach(done => {
                browser.click('i#edit-track-transcript', err => {
                  if (err) return done.fail(err);
                  done();
                });
              });

              it('resets the value', done => {
                browser.assert.input('.post .track figure #track-transcript-field', '');
                browser.document.getElementById('track-transcript-field').innerHTML = 'Groovy, baby! Yeah!';
                browser.assert.input('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                browser.click('i#cancel-edit-track-transcript', err => {
                  if (err) return done.fail(err);

                  browser.assert.input('.post .track figure #track-transcript-field', '');
                  done();
                });
              });

              it('resets the field value when focus is lost and then regained', done => {
                browser.assert.input('.post .track figure #track-transcript-field', '');
                browser.document.getElementById('track-transcript-field').innerHTML = 'Groovy, baby! Yeah!';
                browser.assert.input('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                browser.focus('body');
                browser.click('#track-transcript-field', err => {
                  browser.assert.input('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                  browser.focus('body');
                  browser.click('#track-transcript-field', err => {
                    browser.assert.input('.post .track figure #track-transcript-field', 'Groovy, baby! Yeah!');

                    browser.click('i#cancel-edit-track-transcript', err => {
                      if (err) return done.fail(err);

                      browser.assert.input('.post .track figure #track-transcript-field', '');
                      done();
                    });
                  });
                });
              });

              it('resets the interface', done => {
                browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', '');
                browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', 'none');
                browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', '');

                browser.click('i#cancel-edit-track-transcript', err => {
                  if (err) return done.fail(err);

                  browser.assert.style('.post .track figure h3 i#edit-track-transcript', 'display', '');
                  browser.assert.style('.post .track figure h3 i#save-track-transcript', 'display', 'none');
                  browser.assert.style('.post .track figure h3 i#cancel-edit-track-transcript', 'display', 'none');

                  done();
                });
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
      beforeEach(async () => {

        try {
          puppetBrowser = await puppeteer.launch({
            headless: true,
            executablePath: puppeteer.executablePath(),
          });
          page = await puppetBrowser.newPage();
          page.on('console', msg => console.log('PAGE LOG:', msg.text().toString()));


          expect(process.env.SUDO).toBeDefined();
          let stubSessions = new Promise((resolve, reject) => {
            stubAuth0Sessions(process.env.SUDO, `localhost:${PORT}`, err => {
              if (err) return reject(err);
              resolve();
            });
          });
          await stubSessions.then();

          /**
           * Auth0 mock
           */
          useNock(page, [`https://${process.env.AUTH0_DOMAIN}`]);

          await page.goto(APP_URL);

          await page.waitForSelector('#login-link');
          await page.click('#login-link');
          await page.waitForTimeout(200);

          await page.waitForSelector(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`);
          await page.click(`a[href="/track/${root.getAgentDirectory()}/root1.ogg"]`);
          await page.waitForTimeout(200);
        } catch (e) {
          console.log(e);
        }
      });

      afterEach(async () => {
        await puppetBrowser.close();
      });

      describe('edit name field', () => {

        it('updates the database', async ()=> {
          const filePath = `uploads/${root.getAgentDirectory()}/root1.ogg`;
          //await models.Track.findOne({ path: filePath }).then(async track => {
          let track = await models.Track.findOne({ path: filePath });
          expect(track.name).toEqual('');

          page.type('#track-name-field', 'Austin Powers');
          await page.waitForTimeout(100);

          await page.click('i#save-track-name');
          await page.waitForTimeout(200);

          track = await models.Track.findOne({ path: filePath });
          expect(track.name).toEqual('Austin Powers');
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
          const filePath = `uploads/${root.getAgentDirectory()}/root1.ogg`;
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
          const filePath = `uploads/${root.getAgentDirectory()}/root1.ogg`;
          models.Track.findOne({ path: filePath }).then(async track => {
            expect(track.name).toEqual('');

            await page.click('i#edit-track-name');
            await page.waitForTimeout(200);

            // If it's not focussed on the correct `contenteditable` field, this test fails
            let focussed = await page.evaluateHandle(() => document.activeElement);
            focussed.type('Austin Powers');

            await page.waitForTimeout(100);

            page.keyboard.press('Enter').then(async () => {

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

        /**
         * 2021-5-10
         *
         * Remember! Zombie fetch PATCH doesn't have anything in the body of the
         * request. That's why I'm using puppeteer here
         */
        it('displays change on subsequent visit', async () => {
          await page.click('i#edit-track-name');
          await page.waitForTimeout(200);

          // If it's not focussed on the correct `contenteditable` field, this test fails
          let focussed = await page.evaluateHandle(() => document.activeElement);
          focussed.type('Austin Powers');

          await page.waitForTimeout(100);

          await page.click('i#save-track-name');

          await page.waitForTimeout(200);

          let element = await page.$("#track-name-field");
          let text = await page.evaluate(element => element.textContent, element);
          expect(text).toEqual('Austin Powers');

          // Reload
          await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });

          element = await page.$("#track-name-field");
          text = await page.evaluate(element => element.textContent, element);
          expect(text).toEqual('Austin Powers');
        });

        it('resets internal cancel change values', async () => {
          //
          // Write and save the transcript
          //
          await page.click('i#edit-track-name');
          await page.waitForTimeout(200);

          let focussed = await page.evaluateHandle(() => document.activeElement);
          focussed.type('Austin Powers');
          await page.waitForTimeout(100);
          await page.click('i#save-track-name');
          await page.waitForTimeout(200);

          let element = await page.$("#track-name-field");
          let text = await page.evaluate(element => element.textContent, element);
          expect(text).toEqual('Austin Powers');

          //
          // Update and save the transcript
          //
          await page.click('i#edit-track-name');
          await page.waitForTimeout(200);

          focussed = await page.evaluateHandle(() => document.activeElement);
          focussed.type('That guy from Shrek is ');
          await page.waitForTimeout(100);
          await page.click('i#save-track-name');
          await page.waitForTimeout(200);

          element = await page.$("#track-name-field");
          text = await page.evaluate(element => element.textContent, element);
          expect(text).toEqual('That guy from Shrek is Austin Powers');

          //
          // Update and cancel the changes to the transcript
          //
          await page.click('i#edit-track-name');
          await page.waitForTimeout(200);

          focussed = await page.evaluateHandle(() => document.activeElement);
          focussed.type('Yo!');

          await page.click('i#cancel-edit-track-name');

          element = await page.$("#track-name-field");
          text = await page.evaluate(element => element.textContent, element);
          expect(text).toEqual('That guy from Shrek is Austin Powers');
        });
      });

      describe('edit transcript field', () => {
        it('updates the database', done => {
          const filePath = `uploads/${root.getAgentDirectory()}/root1.ogg`;
          models.Track.findOne({ path: filePath }).then(async track => {
            expect(track.transcript).toEqual('');

            await page.click('i#edit-track-name');
            await page.waitForTimeout(200);

            page.type('#track-transcript-field', 'Groovy, baby! Yeah!');
            await page.waitForTimeout(200);

            page.click('i#save-track-transcript').then(async () => {

              await page.waitForTimeout(200);

              models.Track.findOne({ path: filePath }).then(track => {
                expect(track.transcript).toEqual('Groovy, baby! Yeah!');
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

        it('displays change on subsequent visit', async () => {
          await page.click('i#edit-track-transcript');
          await page.waitForTimeout(200);

          // If it's not focussed on the correct `contenteditable` field, this test fails
          let focussed = await page.evaluateHandle(() => document.activeElement);
          focussed.type('Groovy, baby! Yeah!');

          await page.waitForTimeout(100);

          await page.click('i#save-track-transcript');

          await page.waitForTimeout(200);

          let element = await page.$("#track-transcript-field");
          //let text = await page.evaluate(element => element.textContent, element);
          let text = await page.evaluate(element => element.value, element);
          expect(text).toEqual('Groovy, baby! Yeah!');

          // Reload
          await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });

          element = await page.$("#track-transcript-field");
          //text = await page.evaluate(element => element.textContent, element);
          text = await page.evaluate(element => element.value, element);
          expect(text.trim()).toEqual('Groovy, baby! Yeah!');
        });

        it('resets internal cancel change values', async () => {
          //
          // Write and save the transcript
          //
          await page.click('i#edit-track-transcript');
          await page.waitForTimeout(200);

          let focussed = await page.evaluateHandle(() => document.activeElement);
          focussed.type('Groovy, baby! Yeah!');
          await page.waitForTimeout(100);
          await page.click('i#save-track-transcript');
          await page.waitForTimeout(200);

          let element = await page.$("#track-transcript-field");
          let text = await page.evaluate(element => element.value, element);
          expect(text).toEqual('Groovy, baby! Yeah!');

          //
          // Update and save the transcript
          //
          await page.click('i#edit-track-transcript');
          await page.waitForTimeout(200);

          focussed = await page.evaluateHandle(() => document.activeElement);
          focussed.type(' Shagadelic!');
          await page.waitForTimeout(100);
          await page.click('i#save-track-transcript');
          await page.waitForTimeout(200);

          element = await page.$("#track-transcript-field");
          text = await page.evaluate(element => element.value, element);
          expect(text).toEqual('Groovy, baby! Yeah! Shagadelic!');

          //
          // Update and cancel the changes to the transcript
          //
          await page.click('i#edit-track-transcript');
          await page.waitForTimeout(200);

          focussed = await page.evaluateHandle(() => document.activeElement);
          focussed.type('One million dollars!');

          await page.click('i#cancel-edit-track-transcript');

          element = await page.$("#track-transcript-field");
          text = await page.evaluate(element => element.value, element);
          expect(text).toEqual('Groovy, baby! Yeah! Shagadelic!');

          await page.waitForTimeout(100);
        });

        it('displays change on subsequent visit', async () => {
          await page.click('i#edit-track-transcript');
          await page.waitForTimeout(200);

          // If it's not focussed on the correct `contenteditable` field, this test fails
          let focussed = await page.evaluateHandle(() => document.activeElement);
          focussed.type('Groovy, baby! Yeah!');

          await page.waitForTimeout(100);

          await page.click('i#save-track-transcript');

          await page.waitForTimeout(200);

          let element = await page.$("#track-transcript-field");
          let text = await page.evaluate(element => element.value, element);
          expect(text).toEqual('Groovy, baby! Yeah!');

          // Reload
          await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });

          element = await page.$("#track-transcript-field");
          text = await page.evaluate(element => element.value, element);
          expect(text).toMatch('Groovy, baby! Yeah!');
        });

        it('does not submit on Enter keypress', done => {
          const filePath = `uploads/${root.getAgentDirectory()}/root1.ogg`;
          models.Track.findOne({ path: filePath }).then(async track => {
            expect(track.name).toEqual('');

            await page.click('i#edit-track-transcript');
            await page.waitForTimeout(200);

            // If it's not focussed on the correct `contenteditable` field, this test fails
            let focussed = await page.evaluateHandle(() => document.activeElement);
            focussed.type('Groovy, baby! Yeah!');

            await page.waitForTimeout(100);

            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(200);

            models.Track.findOne({ path: filePath }).then(track => {
              expect(track.name).toEqual('');
              done();
            }).catch(err => {
              done.fail(err);
            });
          }).catch(err => {
            done.fail(err);
          });
        });

        it('submits on ctrl-s keypress', done => {
          const filePath = `uploads/${root.getAgentDirectory()}/root1.ogg`;
          models.Track.findOne({ path: filePath }).then(async track => {
            expect(track.name).toEqual('');

            await page.click('i#edit-track-transcript');
            await page.waitForTimeout(200);

            let focussed = await page.evaluateHandle(() => document.activeElement);
            focussed.type('Groovy, baby! Yeah...');

            await page.waitForTimeout(100);

            await page.keyboard.down('Control');
            await page.keyboard.press('KeyS');

            await page.waitForTimeout(200);

            models.Track.findOne({ path: filePath }).then(track => {
              expect(track.transcript).toEqual('Groovy, baby! Yeah...');

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

  describe('unauthenticated', () => {
    it('does not allow editing a track', done => {
      request(app)
        .patch(`/track/${agent.getAgentDirectory()}/track2.ogg`)
        .set('Accept', 'application/json')
        .send({
          name: 'Austin Powers',
          transcript: 'Groovy, baby! Yeah...'
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
