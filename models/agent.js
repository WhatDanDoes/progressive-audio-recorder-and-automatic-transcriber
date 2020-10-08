'use strict';

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
    canRead: [{ type: Schema.Types.ObjectId, ref: 'Agent' }],
  }, {
    timestamps: true,
    strict: false
  });

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


  return AgentSchema;
};

