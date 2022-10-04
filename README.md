progressive-audio-recorder-and-automatic-transcriber
====================================================

`node`/`express` backend for receiving audio collected by a remote device. Currently wired to leverage Flashlight's English-language automatic speech recognition as employed in this [tutorial](https://colab.research.google.com/github/flashlight/flashlight/blob/master/flashlight/app/asr/tutorial/notebooks/InferenceAndAlignmentCTC.ipynb).

The `paraat` application may be considered a _hard fork_ of the [auth0-photo-server](https://github.com/WhatDanDoes/auth0-photo-server), though the repository was never actually forked.

## Basic Functionality

This is a Progressive Web Application. It uses audio when available and defaults to simple file upload when not. Upon audio upload completion, the file is found in the agent's personal album, whereupon it may be _deleted_ or _published_ to the public library. Authenticated agents can _like_, comment, or flag audio tracks. Currently, only one agent may post to the public audio wall. This functionality may be deployed via Auth0 (continued below...)

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

Run server:

```
npm start
```

## Production

In the application directory:

```
cd progressive-audio-recorder-and-automatic-transcriber
cp .env.example .env # <- don't forget to configure
NODE_ENV=production npm install
```

The _Dockerized_ production is meant to be deployed behind an `nginx-proxy`/`lets-encrypt` combo:

```
docker-compose -f docker-compose.prod.yml up -d
```

### Database Operations

Connect to DB container like this:

```
docker-compose -f docker-compose.prod.yml exec mongo mongo progressive_audio_recorder_production
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

# Flashlight

Configuring Flashlight is still a finicky thing. Directions will fill-out as deployments are repeated.

## SSH Setup

Flashlight commands are requested via SSH within this container. As such, keys are required:

```
# 2021-6-21 https://unix.stackexchange.com/a/135090/61705
< /dev/zero | ssh-keygen -q -N "" -f ./.ssh/id_rsa
```

Flashlight and `paraat` share the same `.ssh` volume. Authorize the key so that `paraat` can call `ssh` without a password:

```
cat .ssh/id_rsa.pub >> .ssh/authorized_keys
```

## Test

```
docker-compose stop && docker-compose up --build -d && docker exec -it -w /root flashlight bats tests
```

## Development

```
docker-compose up -d
```

## Production

```
docker-compose -f docker-compose.flashlight.yml up -d
```

# Allosaurus

The Allosaurus configuration is adapted wherever possible from the Flashlight deployment. This makes it likewise finicky.

## SSH Setup

Allosaurus commands are requested via SSH within this container. As such, keys are required:

```
# 2021-6-21 https://unix.stackexchange.com/a/135090/61705
< /dev/zero | ssh-keygen -q -N "" -f ./.ssh/id_rsa
```

Allosaurus and `paraat` share the same `.ssh` volume. Authorize the key so that `paraat` can call `ssh` without a password:

```
cat .ssh/id_rsa.pub >> .ssh/authorized_keys
```

## Hands-on Testing

Build the container:

```
docker build --file Dockerfile-allosaurus -t allosaurus .
```

Login to container:

```
docker run -it allosaurus
```

Execute tests:

```
bats tests
```

## Test

```
docker-compose -f docker-compose.test-allosaurus.yml stop && docker-compose -f docker-compose.test-allosaurus.yml up --build -d && docker exec -it -w /root allosaurus bats tests
```

## Production

```
docker-compose -f docker-compose.allosaurus.yml up -d
```


