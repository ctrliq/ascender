FROM node:22-alpine
ARG NPMRC_FILE=.npmrc
ENV NPMRC_FILE=${NPMRC_FILE}
ARG TARGET='https://awx:8043'
ENV TARGET=${TARGET}
ENV CI=true
WORKDIR /ui
ADD .eslintignore .eslintignore
ADD .eslintrc.json .eslintrc.json
ADD .linguirc .linguirc
ADD jsconfig.json jsconfig.json
ADD public public
ADD package.json package.json
ADD pnpm-lock.yaml pnpm-lock.yaml
COPY ${NPMRC_FILE} .npmrc
# Installs the exact pnpm version pinned (and hash-verified) via the
# packageManager field in package.json, rather than duplicating the version
# in this Dockerfile where it could drift out of sync.
RUN corepack enable && corepack install && pnpm install --frozen-lockfile
ADD src src
EXPOSE 3001
CMD [ "pnpm", "start" ]
