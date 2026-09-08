/**
 * Adapted from react-dev-utils (create-react-app).
 * Copyright (c) 2015-present, Facebook, Inc. MIT licensed.
 */

'use strict';

const net = require('net');
const os = require('os');
const readline = require('readline/promises');
const colors = require('./colors');
const clearConsole = require('./clearConsole');
const formatWebpackMessages = require('./formatWebpackMessages');

const isInteractive = process.stdout.isTTY;

// First non-loopback IPv4 address, used for the "On Your Network" URL.
function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && (iface.family === 'IPv4' || iface.family === 4)) {
        return iface.address;
      }
    }
  }
  return undefined;
}

function formatUrl(protocol, hostname, port, pathname) {
  const host = hostname.includes(':') ? `[${hostname}]` : hostname;
  return `${protocol}://${host}:${port}${pathname}`;
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  let prettyHost = host;
  let lanUrlForConfig;
  let lanUrlForTerminal;
  if (isUnspecifiedHost) {
    prettyHost = 'localhost';
    lanUrlForConfig = getLanAddress();
    // Only advertise private-network addresses.
    // https://en.wikipedia.org/wiki/Private_network#Private_IPv4_address_spaces
    if (
      lanUrlForConfig &&
      /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
        lanUrlForConfig
      )
    ) {
      lanUrlForTerminal = formatUrl(
        protocol,
        lanUrlForConfig,
        colors.bold(port),
        pathname
      );
    } else {
      lanUrlForConfig = undefined;
    }
  }
  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal: formatUrl(
      protocol,
      prettyHost,
      colors.bold(port),
      pathname
    ),
    localUrlForBrowser: formatUrl(protocol, prettyHost, port, pathname),
  };
}

function printInstructions(appName, urls) {
  console.log();
  console.log(`You can now view ${colors.bold(appName)} in the browser.`);
  console.log();

  if (urls.lanUrlForTerminal) {
    console.log(
      `  ${colors.bold('Local:')}            ${urls.localUrlForTerminal}`
    );
    console.log(
      `  ${colors.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`
    );
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }

  console.log();
  console.log('Note that the development build is not optimized.');
  console.log(
    `To create a production build, use ${colors.cyan('npm run build')}.`
  );
  console.log();
}

function createCompiler({ appName, config, urls, webpack }) {
  // "Compiler" is a low-level interface to webpack.
  // It lets us listen to some events and provide our own custom messages.
  let compiler;
  try {
    compiler = webpack(config);
  } catch (err) {
    console.log(colors.red('Failed to compile.'));
    console.log();
    console.log(err.message || err);
    console.log();
    process.exit(1);
  }

  // "invalid" event fires when you have changed a file, and webpack is
  // recompiling a bundle. WebpackDevServer takes care to pause serving the
  // bundle, so if you refresh, it'll wait instead of serving the old one.
  // "invalid" is short for "bundle invalidated", it doesn't imply any errors.
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });

  let isFirstCompile = true;

  // "done" event fires when webpack has finished recompiling the bundle.
  // Whether or not you have warnings or errors, you will get this event.
  compiler.hooks.done.tap('done', (stats) => {
    if (isInteractive) {
      clearConsole();
    }

    // We have switched off the default webpack output in WebpackDevServer
    // options so we are going to "massage" the warnings and errors and present
    // them in a readable focused way.
    // We only construct the warnings and errors for speed:
    // https://github.com/facebook/create-react-app/issues/4492#issuecomment-421959548
    const statsData = stats.toJson({
      all: false,
      warnings: true,
      errors: true,
    });

    const messages = formatWebpackMessages(statsData);
    const isSuccessful = !messages.errors.length && !messages.warnings.length;
    if (isSuccessful) {
      console.log(colors.green('Compiled successfully!'));
    }
    if (isSuccessful && (isInteractive || isFirstCompile)) {
      printInstructions(appName, urls);
    }
    isFirstCompile = false;

    // If errors exist, only show errors.
    if (messages.errors.length) {
      // Only keep the first error. Others are often indicative
      // of the same problem, but confuse the reader with noise.
      if (messages.errors.length > 1) {
        messages.errors.length = 1;
      }
      console.log(colors.red('Failed to compile.\n'));
      console.log(messages.errors.join('\n\n'));
      return;
    }

    // Show warnings if no errors were found.
    if (messages.warnings.length) {
      console.log(colors.yellow('Compiled with warnings.\n'));
      console.log(messages.warnings.join('\n\n'));

      // Teach some ESLint tricks.
      console.log(
        '\nSearch for the ' +
          colors.underline(colors.yellow('keywords')) +
          ' to learn more about each warning.'
      );
      console.log(
        'To ignore, add ' +
          colors.cyan('// eslint-disable-next-line') +
          ' to the line before.\n'
      );
    }
  });

  return compiler;
}

// Resolves true when nothing is bound to host:port. Rejects for failures other
// than the port being taken so a bad HOST surfaces instead of looping.
function isPortFree(host, port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(false);
      } else {
        reject(err);
      }
    });
    server.listen({ host, port }, () => server.close(() => resolve(true)));
  });
}

async function findFreePort(host, startPort) {
  for (let port = startPort; port <= 65535; port += 1) {
    if (await isPortFree(host, port)) {
      return port;
    }
  }
  throw new Error(`Could not find an open port at ${colors.bold(host)}.`);
}

async function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(`${message} [Y/n] `);
    return !/^\s*n/i.test(answer);
  } finally {
    rl.close();
  }
}

// Resolves to the port to use, or null when the default port is taken and the
// user declined (or could not be asked) to use another one.
async function choosePort(host, defaultPort) {
  if (await isPortFree(host, defaultPort)) {
    return defaultPort;
  }
  const needsRoot =
    process.platform !== 'win32' &&
    defaultPort < 1024 &&
    typeof process.getuid === 'function' &&
    process.getuid() !== 0;
  const message = needsRoot
    ? 'Admin permissions are required to run a server on a port below 1024.'
    : `Something is already running on port ${defaultPort}.`;
  if (!isInteractive) {
    console.log(colors.red(message));
    return null;
  }
  const port = await findFreePort(host, needsRoot ? 1024 : defaultPort + 1);
  clearConsole();
  const shouldChangePort = await confirm(
    colors.yellow(message) +
      `\n\nWould you like to run the app on port ${port} instead?`
  );
  return shouldChangePort ? port : null;
}

module.exports = {
  choosePort,
  createCompiler,
  prepareUrls,
};
