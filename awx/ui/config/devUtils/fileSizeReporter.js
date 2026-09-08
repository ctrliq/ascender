/**
 * Adapted from react-dev-utils (create-react-app).
 * Copyright (c) 2015-present, Facebook, Inc. MIT licensed.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { stripVTControlCharacters: stripAnsi } = require('util');
const colors = require('./colors');

function canReadAsset(asset) {
  return /\.(js|css)$/.test(asset);
}

function gzipSize(contents) {
  return zlib.gzipSync(contents, { level: 9 }).length;
}

// 1536 -> "1.5 KB"; negative values keep their sign so size deltas read well.
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  const sign = bytes < 0 ? '-' : '';
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 100) / 100;
  return `${sign}${rounded} ${units[unit]}`;
}

// Prints a detailed summary of build files.
function printFileSizesAfterBuild(
  webpackStats,
  previousSizeMap,
  buildFolder,
  maxBundleGzipSize,
  maxChunkGzipSize
) {
  const root = previousSizeMap.root;
  const sizes = previousSizeMap.sizes;
  const assets = (webpackStats.stats || [webpackStats])
    .map((stats) =>
      stats
        .toJson({ all: false, assets: true })
        .assets.filter((asset) => canReadAsset(asset.name))
        .map((asset) => {
          const fileContents = fs.readFileSync(path.join(root, asset.name));
          const size = gzipSize(fileContents);
          const previousSize = sizes[removeFileNameHash(root, asset.name)];
          const difference = getDifferenceLabel(size, previousSize);
          return {
            folder: path.join(
              path.basename(buildFolder),
              path.dirname(asset.name)
            ),
            name: path.basename(asset.name),
            size: size,
            sizeLabel:
              formatSize(size) + (difference ? ' (' + difference + ')' : ''),
          };
        })
    )
    .reduce((single, all) => all.concat(single), []);
  assets.sort((a, b) => b.size - a.size);
  const longestSizeLabelLength = Math.max.apply(
    null,
    assets.map((a) => stripAnsi(a.sizeLabel).length)
  );
  let suggestBundleSplitting = false;
  assets.forEach((asset) => {
    let sizeLabel = asset.sizeLabel;
    const sizeLength = stripAnsi(sizeLabel).length;
    if (sizeLength < longestSizeLabelLength) {
      sizeLabel += ' '.repeat(longestSizeLabelLength - sizeLength);
    }
    const isMainBundle = asset.name.indexOf('main.') === 0;
    const maxRecommendedSize = isMainBundle
      ? maxBundleGzipSize
      : maxChunkGzipSize;
    const isLarge = maxRecommendedSize && asset.size > maxRecommendedSize;
    if (isLarge && path.extname(asset.name) === '.js') {
      suggestBundleSplitting = true;
    }
    console.log(
      '  ' +
        (isLarge ? colors.yellow(sizeLabel) : sizeLabel) +
        '  ' +
        colors.dim(asset.folder + path.sep) +
        colors.cyan(asset.name)
    );
  });
  if (suggestBundleSplitting) {
    console.log();
    console.log(
      colors.yellow('The bundle size is significantly larger than recommended.')
    );
    console.log(
      colors.yellow(
        'Consider reducing it with code splitting: https://goo.gl/9VhYWB'
      )
    );
    console.log(
      colors.yellow(
        'You can also analyze the project dependencies: https://goo.gl/LeUzfb'
      )
    );
  }
}

function removeFileNameHash(buildFolder, fileName) {
  return fileName
    .replace(buildFolder, '')
    .replace(/\\/g, '/')
    .replace(
      /\/?(.*)(\.[0-9a-f]+)(\.chunk)?(\.js|\.css)/,
      (match, p1, p2, p3, p4) => p1 + p4
    );
}

// Input: 1024, 2048
// Output: "(+1 KB)"
function getDifferenceLabel(currentSize, previousSize) {
  const FIFTY_KILOBYTES = 1024 * 50;
  const difference = currentSize - previousSize;
  const fileSize = !Number.isNaN(difference) ? formatSize(difference) : 0;
  if (difference >= FIFTY_KILOBYTES) {
    return colors.red('+' + fileSize);
  } else if (difference < FIFTY_KILOBYTES && difference > 0) {
    return colors.yellow('+' + fileSize);
  } else if (difference < 0) {
    return colors.green(fileSize);
  } else {
    return '';
  }
}

// Records the gzipped size of every JS/CSS asset in a previous build so the
// report after this build can show how each file changed.
function measureFileSizesBeforeBuild(buildFolder) {
  const sizes = {};
  let fileNames = [];
  try {
    fileNames = fs
      .readdirSync(buildFolder, { recursive: true })
      .map((name) => path.join(buildFolder, name));
  } catch (err) {
    // No previous build to compare against.
  }
  fileNames.filter(canReadAsset).forEach((fileName) => {
    let contents;
    try {
      contents = fs.readFileSync(fileName);
    } catch (err) {
      return;
    }
    sizes[removeFileNameHash(buildFolder, fileName)] = gzipSize(contents);
  });
  return { root: buildFolder, sizes };
}

module.exports = {
  measureFileSizesBeforeBuild: measureFileSizesBeforeBuild,
  printFileSizesAfterBuild: printFileSizesAfterBuild,
};
