auth0-photo-server
==================

`node`/`express` backend for receiving photos sent by the [basic-photo-economizer](https://github.com/WhatDanDoes/basic-photo-economizer) (my first `react-native` Android app).

The `auth0-photo-server` may be considered a _hard fork_ of the [basic-photo-server](https://github.com/WhatDanDoes/basic-photo-server), though the repository was never actually forked. This project is motivated by the need to determine how to properly leverage the service provided by the [SIL Identity](https://silid.languagetechnology.org) app. While the _basic_ version of the photo server allows for traditional email-password authentication, this version will provide access to anyone who can authenticate against a recognized third-party authority (only Gmail, for the moment). In turn, the app organizer (i.e., me) will be able to decide the level at which an authenticated agent may operate.

This is a living document. It will change over time. In pursuing the goals of this project, third-party developers who wish to incorporated their software into the SIL ecosystem will have this project as an example from which to work.

## Basic Functionality

This is a web application _augmented_ by a native Android photo-taking app. Photos taken with the `basic-photo-economizer` are reduced in size for transmission (e.g., from 5MB to about 400kB, typically). Upon submission, the economized photo can be found in the agent's personal photo album, whereupon it may be _deleted_ or _published_ to the public photo roll. Though a cool proof-of-concept, this augmented web application meets few expectations of a contemporary photo-sharing platform (e.g., there's nothing crediting the photographer on the main roll, and nothing to allow a photo to be flagged or removed). This short-comings will be addressed as the app incorporates Identity services.

## Auth0 Enhanced Functionality (in progress)

The Identity platform handles authentication and basic organization structuring. The `auth0-photo-server` is ideally suited to consume the services it currently offers and will likely reveal shortcomings in the process. At the time of writing, agents with varying permission levels can create _teams_ and arrange those under _organizational_ umbrellas. This by itself mirrors the expectation that an agent might invite others to contribute to a photo album, or be granted permission to publish photos to the public roll.

The most currently deployment can be found at https://wycliffe.photos.

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
NODE_ENV=test npx jasmine spec/features/agentIndexSpec.js
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

Run server:

```
npm start
```

## Production

In the application directory:

```
cd auth0-photo-server
cp .env.example .env # <- don't forget to configure
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
docker-compose -f docker-compose.prod.yml exec mongo mongo auth0_photo_server_production
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



