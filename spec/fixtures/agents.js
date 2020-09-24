'use strict';

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const bcrypt = require('bcrypt');

/**
 * These fixtures don't play nice with the 
 * `unique` quality modified on arrays by
 * `mongoose-unique-array`. These agents
 * can't have duplicate IDs in their canRead
 * fields for some reason.
 */
const danId = new ObjectId();
const troyId = new ObjectId();
const lannyId = new ObjectId();

exports.Agent = {
  dan: {
    _id: danId,
    email: 'daniel@example.com',
    password: 'secret',
    canRead: [lannyId],
  },
  troy: {
    _id: troyId,
    email: 'troy@example.com',
    password: 'topsecret',
    canRead: [danId],
  },
  lanny: {
    _id: lannyId,
    email: 'lanny@example.com',
    password: 'supersecret',
    canRead: [troyId],
  }
};
