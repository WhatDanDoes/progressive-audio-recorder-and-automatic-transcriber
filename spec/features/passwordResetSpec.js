'use strict';

const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001; 
const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models'); 
const mailer = require('../../mailer');
const app = require('../../app'); 
const request = require('supertest');

const mock = require('mock-fs');
const mockAndUnmock = require('../support/mockAndUnmock')(mock);

Browser.localhost('example.com', PORT);

// For when system resources are scarce
jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('password reset', function() {

  var browser, agent;

  beforeEach(function(done) {
    browser = new Browser({ waitDuration: '30s', loadCss: false });
    //browser.debug();
    fixtures.load(__dirname + '/../fixtures/agents.js', models.mongoose, function(err) {
      models.Agent.findOne().then(function(results) {
        agent = results;
        browser.visit('/', function(err) {
          if (err) done.fail(err);
          browser.assert.success();
          done();
        });
      }).catch(function(error) {
        done.fail(error);
      });
    });
  });

  it('displays the password reset link', function() {
    expect(browser.query("a[href='/reset']")).not.toBeNull();
    browser.assert.text("a[href='/reset']", 'Reset password');
  });

  describe('GET /reset', function() {
    beforeEach(function(done) {
       browser.clickLink('Reset password', function(err) {
        if (err) done.fail(err);
        browser.assert.success();
        done();
      });   
    });

    it('displays a form for resetting a password', function() {
      browser.assert.attribute('#reset-agent-password-form', 'action', '/reset');
      browser.assert.element('#reset-agent-password-form input[name=email]');
      browser.assert.element('#reset-agent-password-form button[type=submit]');
    });

    describe('POST /reset', function() {
      describe('registered agent', function() {
        beforeEach(function(done) {
          expect(agent.resetPasswordToken).toBe(undefined);
          expect(agent.resetPasswordExpires).toBe(undefined);
          browser.fill('email', agent.email);
          browser.pressButton('Reset', function(err) {
            if (err) done.fail(err);
            browser.assert.success();
            done();
          });
        });

        afterEach((done) => {
          mailer.transport.sentMail = [];
          done();
        });
  
        it('displays success message', function(done) {
          browser.assert.text('.alert.alert-success',
                  'An email has been sent to ' + agent.email + ' with further instructions');
          done();
        });

        it('sets reset token and expiry in existing agent document', function(done) {
          models.Agent.findById(agent._id).then(function(results) {
            expect(results.resetPasswordToken).not.toBe(undefined);
            expect(results.resetPasswordToken).not.toBeNull();
            expect(results.resetPasswordExpires).not.toBe(undefined);
            expect(results.resetPasswordExpires).not.toBeNull();
            done();
          }).catch(function(err) {
            done.fail(err);
          });
        });
  
        it('sends an email containing the reset link to the agent', function(done) {
          expect(mailer.transport.sentMail.length).toEqual(1);
          expect(mailer.transport.sentMail[0].data.to).toEqual(agent.email);
          expect(mailer.transport.sentMail[0].data.from).toEqual(process.env.FROM);
          expect(mailer.transport.sentMail[0].data.subject).toEqual('Accountant Password Reset');
          models.Agent.findById(agent._id).then(function(agent) {
            expect(mailer.transport.sentMail[0].data.text).
              toContain('https://example.com/reset/' + agent.resetPasswordToken);
            done();
          }).catch(function(err) {
            done.fail(err);
          });
        });

        describe('GET /reset/:token', () => {

          beforeEach((done) => {
            models.Agent.findById(agent._id).then(function(results) {
              agent = results;
              browser.visit('/reset/' + agent.resetPasswordToken, function(err) {
                if (err) done.fail(err);
                browser.assert.success();
                done();
              });
            }).catch(function(err) {
              done.fail(err);
            });
          });

          it('displays the form to reset the password', function() {
            browser.assert.attribute('#reset-password-form', 'action',
                    '/reset/' + agent.resetPasswordToken + '?_method=PATCH');
            browser.assert.element('#reset-password-form input[name=password]');
            browser.assert.element('#reset-password-form input[name=confirm]');
            browser.assert.element('#reset-password-form button[type=submit]');
          });

          it('displays an error if token has expired', (done) => {
            agent.resetPasswordExpires = Date.now() - 3600000; // 1 hour go
            models.Agent.findByIdAndUpdate(agent._id, agent, {new: true}).then((agent) => {
              browser.visit('/reset/' + agent.resetPasswordToken, function(err) {
                if (err) done.fail(err);
                browser.assert.success();
                browser.assert.url({ pathname: '/reset' });
                browser.assert.text('.alert.alert-danger', 'Password reset token is invalid or has expired');
                done();
              });
            }).catch((err) => {
              done.fail(err);
            });
          });

          describe('PATCH /reset/:token', () => {
            beforeEach(function(done) {
              mockAndUnmock({ 
                [`uploads/${agent.getAgentDirectory()}`]: {},
                'public/images/uploads': {}
              });
    
              done();
            });
    
            afterEach(function() {
              mock.restore();
            });


            it('changes agent\'s password', (done) => {
              browser.fill('password', 'newpassword');
              browser.fill('confirm', 'newpassword');
              browser.pressButton('Reset', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();
                browser.assert.url({ pathname: '/' });
                browser.fill('email', agent.email);
                browser.fill('password', 'newpassword')
                browser.pressButton('Login', function(err) {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  done();
                });
              });
            });

            it('displays an error if passwords don\'t match', (done) => {
              browser.fill('password', 'password');
              browser.fill('confirm', 'newpassword')
              browser.pressButton('Reset', function(err) {
                if (err) done.fail(err);
                browser.assert.success();
                browser.assert.url({ pathname: '/reset/' + agent.resetPasswordToken });
                browser.assert.text('.alert.alert-danger', 'Passwords don\'t match');
                done();
              });
            });

            it('redirects if token has expired', (done) => {
              agent.resetPasswordExpires = Date.now() - 3600000; // 1 hour go
              models.Agent.findByIdAndUpdate(agent._id, agent, {new: true}).then((agent) => {
                request(app)
                  .patch('/reset/' + agent.resetPasswordToken)
                  .send({ password: 'newPassword', confirm: 'newPassword' })
                  .expect('Location', /\/reset/)
                  .end(function(err, res) {
                    if (err) done.fail(err);
                    done();        
                  });
              }).catch((err) => {
                done.fail(err);
              });
            });
          });
        });
      });

      describe('unknown agent', function() {
        beforeEach(function(done) {
           browser.fill('email', 'nosuchagent@example.com');
           browser.pressButton('Reset', function(err) {
             if (err) done.fail(err);
             browser.assert.success();
             done();
           });
        }); 

        it('displays error message', function(done) {
          browser.assert.text('.alert.alert-danger', 'No account with that email address has been registered');
          done();
        });

        it('does not send an email', function(done) {
          expect(mailer.transport.sentMail.length).toEqual(0);
          done();
        });
      });
    });
  });
});
