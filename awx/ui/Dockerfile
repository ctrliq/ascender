FROM node:22-alpine
ARG NPMRC_FILE=.npmrc
ENV NPMRC_FILE=${NPMRC_FILE}
ARG TARGET='https://awx:8043'
ENV TARGET=${TARGET}
ENV CI=true
WORKDIR /ui
# The three dotfiles this used to add, .eslintignore, .eslintrc.json and
# .linguirc, have not existed since the flat eslint config and lingui.config.js
# replaced them, so the build has been failing on the first of them.
ADD eslint.config.mjs eslint.config.mjs
ADD lingui.config.js lingui.config.js
ADD jsconfig.json jsconfig.json
ADD vite.config.mjs vite.config.mjs
ADD index.html index.html
ADD config config
ADD public public
ADD package.json package.json
ADD package-lock.json package-lock.json
COPY ${NPMRC_FILE} .npmrc
RUN npm ci && npm cache clean --force
ADD src src
EXPOSE 3001
CMD [ "npm", "start" ]
