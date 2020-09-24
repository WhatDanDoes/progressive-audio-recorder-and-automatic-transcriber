'use strict';

const bcrypt = require('bcrypt');

module.exports = function(mongoose) {
  const Schema = mongoose.Schema;
  const arrayUniquePlugin = require('mongoose-unique-array');

  const AgentSchema = new Schema({
    email: {
      type: String,
      trim: true,
      required: [true, 'No email supplied'],
      unique: true,
      empty: [false, 'No email supplied'],
      validate: {
        isAsync: true,
        validator: function(v, cb) {
          if (!this.isNew) return cb();
          this.model('Agent').count({ email: v }).then(count => {
            cb(!count);
          });
        },
        message: 'That email is already registered'
      }
    },
    password: {
      type: String,
      trim: true,
      required: [true, 'No password supplied'],
      empty: [false, 'No password supplied'],
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    canRead: [{ type: Schema.Types.ObjectId, ref: 'Agent', unique: true }],
  }, {
    timestamps: true
  });

  const saltRounds = 10;

  AgentSchema.pre('save', function(next) {
    // Check if document is new or a new password has been set
    if (this.isNew || this.isModified('password')) {
      // Saving reference to this because of changing scopes
      const document = this;
      bcrypt.hash(document.password, saltRounds,
        function(err, hashedPassword) {
        if (err) {
          next(err);
        }
        else {
          document.password = hashedPassword;
          next();
        }
      });
    } else {
      next();
    }
  });

  AgentSchema.statics.validPassword = function(password, hash, done, agent) {
    bcrypt.compare(password, hash, function(err, isMatch) {
      if (err) console.log(err);
      if (isMatch) {
        return done(null, agent);
      } else {
        return done(null, false);
      }
    });
  };

  AgentSchema.methods.getAgentDirectory = function() {
    let parts = this.email.split('@');
    return `${parts[1]}/${parts[0]}` ;
  };

  AgentSchema.methods.getReadables = function(done) {
    this.populate('canRead', (err, agent) => {
      if (err) {
        return done(err);
      }
      let readables = agent.canRead.map(a => a.getAgentDirectory());
      readables.push(this.getAgentDirectory());
      done(null, readables);
    });
  };


  AgentSchema.plugin(arrayUniquePlugin);
  return AgentSchema;
};

