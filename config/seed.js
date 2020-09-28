const models = require('../models');

models.sequelize.sync({force: true}).then(() => {
  console.log('DB synced. Rock and/or roll!');
  process.exit(0);
}).catch(err => {
  console.error(err);
});
