basic-photo-server
==================

`node`/`express` backend for receiving photos sent by the [BasicPhotoEconomizer](https://github.com/WhatDanDoes/basic-photo-economizer) (my first `react-native` Android app).

## Setup

```
cp .env.example .env
npm install
```

## Test

Start a MongoDB development server:

```
docker run --name dev-mongo -p 27017:27017 -d mongo
```

I use `jasmine` and `zombie` for testing. These are included in the package's development dependencies.

Run all the tests:

```
npm test
```

Run one set of tests:

```
NODE_ENV=test node_modules/.bin/jasmine spec/models/agentSpec.js
```

## Development

Start a MongoDB development server:

```
docker run --name dev-mongo -p 27017:27017 -d mongo
```

Once created, you can start and stop the container like this:

```
docker stop dev-mongo
docker start dev-mongo
```

Seed database:

```
node seed.js
```

Start `maildev`:

```
docker run -d --name maildev -p 1080:80 -p 25:25 -p 587:587 djfarrelly/maildev
```

Run server:

```
npm start
```

## Production

In the application directory:

```
cd basic-photo-server 
NODE_ENV=production npm install
```

The _Dockerized_ production is meant to be deployed behind an `nginx-proxy`/`lets-encrypt` combo:

```
docker-compose -f docker-compose.prod.yml up -d
```

Seed database:

```
docker-compose -f docker-compose.prod.yml run --rm node node seed.js NODE_ENV=production
```

### Database Operations

Connect to DB container like this:

```
docker-compose -f docker-compose.prod.yml exec mongo mongo basic_photo_server_production
```

Show databases:

```
show dbs
```

Use database:

```
use accountant_production
```

Show collections:

```
show collections
```

#### Give an agent album reading permission

```
db.agents.update({ email: 'daniel@example.com' }, { $push: { "canRead": db.agents.findOne({ email: 'lyndsay@example.com' })._id } })
```



