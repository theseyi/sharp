'use strict';

var fs = require('fs');

var async = require('async');
var assert = require('assert');
var Benchmark = require('benchmark');
var semver = require('semver');

// Contenders
var gm = require('gm');
var imagemagick = require('imagemagick');
var jimp = require('jimp');
var sharp = require('../../');
var imagemagickNative;
try {
  imagemagickNative = require('imagemagick-native');
} catch (err) {
  console.log('Excluding imagemagick-native');
}
var lwip;
try {
  lwip = require('lwip');
} catch (err) {
  console.log('Excluding lwip');
}

var fixtures = require('../fixtures');

var width = 720;
var height = 480;

// Disable libvips cache to ensure tests are as fair as they can be
sharp.cache(false);
// Enable use of SIMD
sharp.simd(true);

async.series({
  'jpeg': function(callback) {
    var inputJpgBuffer = fs.readFileSync(fixtures.inputJpg);
    var jpegSuite = new Benchmark.Suite('jpeg');
    // jimp
    jpegSuite.add('jimp-buffer-buffer', {
      defer: true,
      fn: function(deferred) {
        new jimp(inputJpgBuffer, function(err) {
          if (err) {
            throw err;
          } else {
            this
              .resize(width, height)
              .quality(80)
              .getBuffer(jimp.MIME_JPEG, function (err) {
                if (err) {
                  throw err;
                } else {
                  deferred.resolve();
                }
              });
          }
        });
      }
    }).add('jimp-file-file', {
      defer: true,
      fn: function(deferred) {
        new jimp(fixtures.inputJpg, function(err) {
          if (err) {
            throw err;
          } else {
            this
              .resize(width, height)
              .quality(80)
              .write(fixtures.outputJpg, function (err) {
                if (err) {
                  throw err;
                } else {
                  deferred.resolve();
                }
              });
          }
        });
      }
    });
    // lwip
    if (typeof lwip !== 'undefined') {
      jpegSuite.add('lwip-file-file', {
        defer: true,
        fn: function(deferred) {
          lwip.open(fixtures.inputJpg, function (err, image) {
            if (err) {
              throw err;
            }
            image.resize(width, height, 'lanczos', function (err, image) {
              if (err) {
                throw err;
              }
              image.writeFile(fixtures.outputJpg, {quality: 80}, function (err) {
                if (err) {
                  throw err;
                }
                deferred.resolve();
              });
            });
          });
        }
      }).add('lwip-buffer-buffer', {
        defer: true,
        fn: function(deferred) {
          lwip.open(inputJpgBuffer, 'jpg', function (err, image) {
            if (err) {
              throw err;
            }
            image.resize(width, height, 'lanczos', function (err, image) {
              if (err) {
                throw err;
              }
              image.toBuffer('jpg', {quality: 80}, function (err, buffer) {
                if (err) {
                  throw err;
                }
                assert.notStrictEqual(null, buffer);
                deferred.resolve();
              });
            });
          });
        }
      });
    }
    // imagemagick
    jpegSuite.add('imagemagick-file-file', {
      defer: true,
      fn: function(deferred) {
        imagemagick.resize({
          srcPath: fixtures.inputJpg,
          dstPath: fixtures.outputJpg,
          quality: 0.8,
          width: width,
          height: height,
          format: 'jpg',
          filter: 'Lanczos'
        }, function(err) {
          if (err) {
            throw err;
          } else {
            deferred.resolve();
          }
        });
      }
    });
    // imagemagick-native
    if (typeof imagemagickNative !== 'undefined') {
      jpegSuite.add('imagemagick-native-buffer-buffer', {
        defer: true,
        fn: function(deferred) {
          imagemagickNative.convert({
            srcData: inputJpgBuffer,
            quality: 80,
            width: width,
            height: height,
            format: 'JPEG',
            filter: 'Lanczos'
          }, function (err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
        }
      });
    }
    // gm
    jpegSuite.add('gm-buffer-file', {
      defer: true,
      fn: function(deferred) {
        gm(inputJpgBuffer)
          .resize(width, height)
          .filter('Lanczos')
          .quality(80)
          .write(fixtures.outputJpg, function (err) {
            if (err) {
              throw err;
            } else {
              deferred.resolve();
            }
          });
      }
    }).add('gm-buffer-buffer', {
      defer: true,
      fn: function(deferred) {
        gm(inputJpgBuffer)
          .resize(width, height)
          .filter('Lanczos')
          .quality(80)
          .toBuffer(function (err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('gm-file-file', {
      defer: true,
      fn: function(deferred) {
        gm(fixtures.inputJpg)
          .resize(width, height)
          .filter('Lanczos')
          .quality(80)
          .write(fixtures.outputJpg, function (err) {
            if (err) {
              throw err;
            } else {
              deferred.resolve();
            }
          });
      }
    }).add('gm-file-buffer', {
      defer: true,
      fn: function(deferred) {
        gm(fixtures.inputJpg)
          .resize(width, height)
          .filter('Lanczos')
          .quality(80)
          .toBuffer(function (err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    });
    // sharp
    jpegSuite.add('sharp-buffer-file', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .toFile(fixtures.outputJpg, function(err) {
            if (err) {
              throw err;
            } else {
              deferred.resolve();
            }
          });
      }
    }).add('sharp-buffer-buffer', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-file-file', {
      defer: true,
      fn: function(deferred) {
        sharp(fixtures.inputJpg)
          .resize(width, height)
          .toFile(fixtures.outputJpg, function(err) {
            if (err) {
              throw err;
            } else {
              deferred.resolve();
            }
          });
      }
    }).add('sharp-stream-stream', {
      defer: true,
      fn: function(deferred) {
        var readable = fs.createReadStream(fixtures.inputJpg);
        var writable = fs.createWriteStream(fixtures.outputJpg);
        writable.on('finish', function() {
          deferred.resolve();
        });
        var pipeline = sharp()
          .resize(width, height);
        readable.pipe(pipeline).pipe(writable);
      }
    }).add('sharp-file-buffer', {
      defer: true,
      fn: function(deferred) {
        sharp(fixtures.inputJpg)
          .resize(width, height)
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-promise', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .toBuffer()
          .then(function(buffer) {
            assert.notStrictEqual(null, buffer);
            deferred.resolve();
          });
      }
    }).on('cycle', function(event) {
      console.log('jpeg ' + String(event.target));
    }).on('complete', function() {
      callback(null, this.filter('fastest').map('name'));
    }).run();
  },
  // Effect of applying operations
  operations: function(callback) {
    var inputJpgBuffer = fs.readFileSync(fixtures.inputJpg);
    var operationsSuite = new Benchmark.Suite('operations');
    operationsSuite.add('sharp-sharpen-mild', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .sharpen()
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-sharpen-radius', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .sharpen(3, 1, 3)
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-blur-mild', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .blur()
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-blur-radius', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .blur(3)
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-gamma', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .gamma()
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-normalise', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .normalise()
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-greyscale', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .greyscale()
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-greyscale-gamma', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .gamma()
          .greyscale()
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-progressive', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .progressive()
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-without-chroma-subsampling', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height)
          .withoutChromaSubsampling()
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-rotate', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .rotate(90)
          .resize(width, height)
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-without-simd', {
      defer: true,
      fn: function(deferred) {
        sharp.simd(false);
        sharp(inputJpgBuffer)
          .resize(width, height)
          .toBuffer(function(err, buffer) {
            sharp.simd(true);
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-sequentialRead', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .sequentialRead()
          .resize(width, height)
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).on('cycle', function(event) {
      console.log('operations ' + String(event.target));
    }).on('complete', function() {
      callback(null, this.filter('fastest').map('name'));
    }).run();
  },
  // Comparitive speed of kernels
  kernels: function(callback) {
    var inputJpgBuffer = fs.readFileSync(fixtures.inputJpg);
    (new Benchmark.Suite('kernels')).add('sharp-cubic', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height, { kernel: 'cubic' })
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-lanczos2', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height, { kernel: 'lanczos2' })
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-lanczos3', {
      defer: true,
      fn: function(deferred) {
        sharp(inputJpgBuffer)
          .resize(width, height, { kernel: 'lanczos3' })
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).on('cycle', function(event) {
      console.log('kernels ' + String(event.target));
    }).on('complete', function() {
      callback(null, this.filter('fastest').map('name'));
    }).run();
  },
  // PNG
  png: function(callback) {
    var inputPngBuffer = fs.readFileSync(fixtures.inputPng);
    var pngSuite = new Benchmark.Suite('png');
    // jimp
    pngSuite.add('jimp-buffer-buffer', {
      defer: true,
      fn: function(deferred) {
        new jimp(inputPngBuffer, function(err) {
          if (err) {
            throw err;
          } else {
            this
              .resize(width, height)
              .getBuffer(jimp.MIME_PNG, function (err) {
                if (err) {
                  throw err;
                } else {
                  deferred.resolve();
                }
              });
          }
        });
      }
    }).add('jimp-file-file', {
      defer: true,
      fn: function(deferred) {
        new jimp(fixtures.inputPng, function(err) {
          if (err) {
            throw err;
          } else {
            this
              .resize(width, height)
              .write(fixtures.outputPng, function (err) {
                if (err) {
                  throw err;
                } else {
                  deferred.resolve();
                }
              });
          }
        });
      }
    });
    // lwip
    if (typeof lwip !== 'undefined') {
      pngSuite.add('lwip-buffer-buffer', {
        defer: true,
        fn: function(deferred) {
          lwip.open(inputPngBuffer, 'png', function (err, image) {
            if (err) {
              throw err;
            }
            image.resize(width, height, 'lanczos', function (err, image) {
              if (err) {
                throw err;
              }
              image.toBuffer('png', function (err, buffer) {
                if (err) {
                  throw err;
                }
                assert.notStrictEqual(null, buffer);
                deferred.resolve();
              });
            });
          });
        }
      });
    }
    // imagemagick
    pngSuite.add('imagemagick-file-file', {
      defer: true,
      fn: function(deferred) {
        imagemagick.resize({
          srcPath: fixtures.inputPng,
          dstPath: fixtures.outputPng,
          width: width,
          height: height,
          filter: 'Lanczos'
        }, function(err) {
          if (err) {
            throw err;
          } else {
            deferred.resolve();
          }
        });
      }
    });
    // imagemagick-native
    if (typeof imagemagickNative !== 'undefined') {
      pngSuite.add('imagemagick-native-buffer-buffer', {
        defer: true,
        fn: function(deferred) {
          imagemagickNative.convert({
            srcData: inputPngBuffer,
            width: width,
            height: height,
            format: 'PNG',
            filter: 'Lanczos'
          });
          deferred.resolve();
        }
      });
    }
    // gm
    pngSuite.add('gm-file-file', {
      defer: true,
      fn: function(deferred) {
        gm(fixtures.inputPng)
          .resize(width, height)
          .filter('Lanczos')
          .write(fixtures.outputPng, function (err) {
            if (err) {
              throw err;
            } else {
              deferred.resolve();
            }
          });
      }
    }).add('gm-file-buffer', {
      defer: true,
      fn: function(deferred) {
        gm(fixtures.inputPng)
          .resize(width, height)
          .filter('Lanczos')
          .toBuffer(function (err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    });
    // sharp
    pngSuite.add('sharp-buffer-file', {
      defer: true,
      fn: function(deferred) {
        sharp(inputPngBuffer)
          .resize(width, height)
          .toFile(fixtures.outputPng, function(err) {
            if (err) {
              throw err;
            } else {
              deferred.resolve();
            }
          });
      }
    }).add('sharp-buffer-buffer', {
      defer: true,
      fn: function(deferred) {
        sharp(inputPngBuffer)
          .resize(width, height)
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-file-file', {
      defer: true,
      fn: function(deferred) {
        sharp(fixtures.inputPng)
          .resize(width, height)
          .toFile(fixtures.outputPng, function(err) {
            if (err) {
              throw err;
            } else {
              deferred.resolve();
            }
          });
      }
    }).add('sharp-file-buffer', {
      defer: true,
      fn: function(deferred) {
        sharp(fixtures.inputPng)
          .resize(width, height)
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-progressive', {
      defer: true,
      fn: function(deferred) {
        sharp(inputPngBuffer)
          .resize(width, height)
          .progressive()
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-withoutAdaptiveFiltering', {
      defer: true,
      fn: function(deferred) {
        sharp(inputPngBuffer)
          .resize(width, height)
          .withoutAdaptiveFiltering()
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    });
    pngSuite.on('cycle', function(event) {
      console.log(' png ' + String(event.target));
    }).on('complete', function() {
      callback(null, this.filter('fastest').map('name'));
    }).run();
  },
  // WebP
  webp: function(callback) {
    var inputWebPBuffer = fs.readFileSync(fixtures.inputWebP);
    (new Benchmark.Suite('webp')).add('sharp-buffer-file', {
      defer: true,
      fn: function(deferred) {
        sharp(inputWebPBuffer)
          .resize(width, height)
          .toFile(fixtures.outputWebP, function(err) {
            if (err) {
              throw err;
            } else {
              deferred.resolve();
            }
          });
      }
    }).add('sharp-buffer-buffer', {
      defer: true,
      fn: function(deferred) {
        sharp(inputWebPBuffer)
          .resize(width, height)
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).add('sharp-file-file', {
      defer: true,
      fn: function(deferred) {
        sharp(fixtures.inputWebP)
          .resize(width, height)
          .toFile(fixtures.outputWebP, function(err) {
            if (err) {
              throw err;
            } else {
              deferred.resolve();
            }
          });
      }
    }).add('sharp-file-buffer', {
      defer: true,
      fn: function(deferred) {
        sharp(fixtures.inputWebp)
          .resize(width, height)
          .toBuffer(function(err, buffer) {
            if (err) {
              throw err;
            } else {
              assert.notStrictEqual(null, buffer);
              deferred.resolve();
            }
          });
      }
    }).on('cycle', function(event) {
      console.log('webp ' + String(event.target));
    }).on('complete', function() {
      callback(null, this.filter('fastest').map('name'));
    }).run();
  }
}, function(err, results) {
  assert(!err, err);
  Object.keys(results).forEach(function(format) {
    if (results[format].toString().substr(0, 5) !== 'sharp') {
      console.log('sharp was slower than ' + results[format] + ' for ' + format);
    }
  });
  console.dir(sharp.cache());
});
