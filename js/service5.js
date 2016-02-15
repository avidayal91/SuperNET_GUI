
'use strict';

angular.module('copayApp.services').service('addonManager', function (lodash) {
  var addons = [];

  this.registerAddon = function (addonSpec) {
    addons.push(addonSpec);
  };

  this.addonMenuItems = function () {
    return lodash.map(addons, function (addonSpec) {
      return addonSpec.menuItem;
    });
  };

  this.addonViews = function () {
    return lodash.map(addons, function (addonSpec) {
      return addonSpec.view;
    });
  };

  this.formatPendingTxp = function (txp) {
    lodash.each(addons, function (addon) {
      if (addon.formatPendingTxp) {
        addon.formatPendingTxp(txp);
      }
    });
  };

  this.txTemplateUrl = function() {
    var addon = lodash.find(addons, 'txTemplateUrl');
    return addon ? addon.txTemplateUrl() : null;
  }
});

'use strict';
'use strict';
angular.module('copayApp.services')
  .factory('addressService', function(storageService, profileService, $log, $timeout, lodash, bwsError, gettextCatalog) {
    var root = {};


    root.expireAddress = function(walletId,cb) {
      $log.debug('Cleaning Address ' + walletId );
      storageService.clearLastAddress(walletId, function(err) {
        return cb(err);
      });
    };

    root.isUsed = function(walletId, byAddress, cb) {
      storageService.getLastAddress(walletId, function(err, addr) {
        var used = lodash.find(byAddress, {
          address: addr
        });
        return cb(null, used);
      });
    };

    root._createAddress = function(walletId, cb) {
      var client = profileService.getClient(walletId);

      $log.debug('Creating address for wallet:', walletId);

      client.createAddress({}, function(err, addr) {
        if (err) {
          var prefix = gettextCatalog.getString('Could not create address');
          if (err.error && err.error.match(/locked/gi)) {
            $log.debug(err.error);
            return $timeout(function() {
              root._createAddress(walletId, cb);
            }, 5000);
          } else if (err.code && err.code == 'MAIN_ADDRESS_GAP_REACHED') {
            $log.warn(err.message);
            prefix = null;
            client.getMainAddresses({reverse: true, limit : 1}, function(err, addr) {
              if (err) return cb(err);
              return cb(null, addr[0].address);
            });
          }
          return bwsError.cb(err, prefix, cb);
        }
        return cb(null, addr.address);
      });
    };

    root.getAddress = function(walletId, forceNew, cb) {

      var firstStep;
      if (forceNew) {
        firstStep = storageService.clearLastAddress;
      } else {
        firstStep = function(walletId, cb) {
          return cb();
        };
      }

      firstStep(walletId, function(err) {
        if (err) return cb(err);

        storageService.getLastAddress(walletId, function(err, addr) {
          if (err) return cb(err);

          if (addr) return cb(null, addr);

          root._createAddress(walletId, function(err, addr) {
            if (err) return cb(err);
            storageService.storeLastAddress(walletId, addr, function() {
              if (err) return cb(err);
              return cb(null, addr);
            });
          });
        });
      });
    };

    return root;
  });

'use strict';

angular.module('copayApp.services').factory('addressbookService', function(storageService, profileService) {
  var root = {};

  root.getLabel = function(addr, cb) {
    var fc = profileService.focusedClient;
    storageService.getAddressbook(fc.credentials.network, function(err, ab) {
      if (!ab) return cb();
      ab = JSON.parse(ab);
      if (ab[addr]) return cb(ab[addr]);
      else return cb();
    });
  };

  root.list = function(cb) {
    var fc = profileService.focusedClient;
    storageService.getAddressbook(fc.credentials.network, function(err, ab) {
      if (err) return cb('Could not get the Addressbook');
      if (ab) ab = JSON.parse(ab);
      return cb(err, ab);
    });
  };

  root.add = function(entry, cb) {
    var fc = profileService.focusedClient;
    root.list(function(err, ab) {
      if (err) return cb(err);
      if (!ab) ab = {};
      if (ab[entry.address]) return cb('Entry already exist');
      ab[entry.address] = entry.label;
      storageService.setAddressbook(fc.credentials.network, JSON.stringify(ab), function(err, ab) {
        if (err) return cb('Error adding new entry');
        root.list(function(err, ab) {
          return cb(err, ab);
        });
      });
    });
  };
  
  root.remove = function(addr, cb) {
    var fc = profileService.focusedClient;
    root.list(function(err, ab) {
      if (err) return cb(err);
      if (!ab) return;
      if (!ab[addr]) return cb('Entry does not exist');
      delete ab[addr];
      storageService.setAddressbook(fc.credentials.network, JSON.stringify(ab), function(err) {
        if (err) return cb('Error deleting entry');
        root.list(function(err, ab) {
          return cb(err, ab);
        });
      });
    }); 
  };

  root.removeAll = function() {
    var fc = profileService.focusedClient;
    storageService.removeAddressbook(fc.credentials.network, function(err) {
      if (err) return cb('Error deleting addressbook');
      return cb();
    });
  };

  return root;
});

'use strict';

angular.module('copayApp.services').factory('animationService', function(isCordova) {
  var root = {};

  var cachedTransitionState, cachedBackPanel;

  // DISABLE ANIMATION ON DESKTOP
  root.modalAnimated = {
    slideUp: isCordova ? 'full animated slideInUp' : 'full',
    slideRight: isCordova ? 'full animated slideInRight' : 'full',
    slideOutDown: isCordova ? 'slideOutDown' : 'hideModal',
    slideOutRight: isCordova ? 'slideOutRight' : 'hideModal',
  };

  var pageWeight = {
    walletHome: 0,
    copayers: -1,
    cordova: -1,
    payment: -1,
    uriglidera: -1,

    preferences: 11,
    preferencesGlobal: 11,
    glidera: 11,
    preferencesColor: 12,
    backup: 12,
    preferencesAdvanced: 12,
    buyGlidera: 12,
    sellGlidera: 12,
    preferencesGlidera: 12,
    about: 12,
    delete: 13,
    preferencesLanguage: 12,
    preferencesUnit: 12,
    preferencesFee: 12,
    preferencesAltCurrency: 12,
    preferencesBwsUrl: 13,
    preferencesHistory: 13,
    preferencesAlias: 12,
    preferencesEmail: 12,
    export: 13,
    paperWallet: 13,
    logs: 13,
    information: 13,
    termOfUse: 13,
    translators: 13,
    add: 11,
    create: 12,
    join: 12,
    import: 12,
    importLegacy: 13
  };

  function cleanUpLater(e, e2) {
    var cleanedUp = false,
      timeoutID;
    var cleanUp = function() {
      if (cleanedUp) return;
      cleanedUp = true;
      e2.parentNode.removeChild(e2);
      e2.innerHTML = "";
      e.className = '';
      cachedBackPanel = null;
      cachedTransitionState = '';
      if (timeoutID) {
        timeoutID = null;
        window.clearTimeout(timeoutID);
      }
    };
    e.addEventListener("animationend", cleanUp, true);
    e2.addEventListener("animationend", cleanUp, true);
    e.addEventListener("webkitAnimationEnd", cleanUp, true);
    e2.addEventListener("webkitAnimationEnd", cleanUp, true);
    timeoutID = setTimeout(cleanUp, 500);
  };

  root.transitionAnimated = function(fromState, toState, event) {

    if (isaosp)
      return true;

    // Animation in progress?
    var x = document.getElementById('mainSectionDup');
    if (x && !cachedTransitionState) {
      console.log('Anim in progress');
      return true;
    }

    var fromName = fromState.name;
    var toName = toState.name;
    if (!fromName || !toName)
      return true;

    var fromWeight = pageWeight[fromName];
    var toWeight = pageWeight[toName];


    var entering = null,
      leaving = null;

    // Horizontal Slide Animation?
    if (isCordova && fromWeight && toWeight) {
      if (fromWeight > toWeight) {
        leaving = 'CslideOutRight';
      } else {
        entering = 'CslideInRight';
      }

      // Vertical Slide Animation?
    } else if (isCordova && fromName && fromWeight >= 0 && toWeight >= 0) {
      if (toWeight) {
        entering = 'CslideInUp';

      } else {
        leaving = 'CslideOutDown';
      }

      // no Animation  ?
    } else {
      return true;
    }

    var e = document.getElementById('mainSection');


    var desiredTransitionState = (fromName || '-') + ':' + (toName || '-');

    if (desiredTransitionState == cachedTransitionState) {
      e.className = entering || '';
      cachedBackPanel.className = leaving || '';
      cleanUpLater(e, cachedBackPanel);
      //console.log('USing animation', cachedTransitionState);
      return true;
    } else {
      var sc;
      // Keep prefDiv scroll
      var contentDiv = e.getElementsByClassName('content');
      if (contentDiv && contentDiv[0])
        sc = contentDiv[0].scrollTop;

      cachedBackPanel = e.cloneNode(true);
      cachedBackPanel.id = 'mainSectionDup';
      var c = document.getElementById('sectionContainer');
      c.appendChild(cachedBackPanel);

      if (sc)
        cachedBackPanel.getElementsByClassName('content')[0].scrollTop = sc;

      cachedTransitionState = desiredTransitionState;
      return false;
    }
  }

  return root;
});

'use strict';
angular.module('copayApp.services')
  .factory('applicationService', function($rootScope, $timeout, isCordova, isChromeApp, nodeWebkit, go) {
    var root = {};

    root.restart = function() {
      var hashIndex = window.location.href.indexOf('#/');
      if (isCordova) {
        window.location = window.location.href.substr(0, hashIndex);
        $timeout(function() {
          $rootScope.$digest();
        }, 1);

      } else {
        // Go home reloading the application
        if (isChromeApp) {
          chrome.runtime.reload();
        } else if (nodeWebkit.isDefined()) {
          go.walletHome();
          $timeout(function() {
            var win = require('nw.gui').Window.get();
            win.reload(3);
            //or
            win.reloadDev();
          }, 100);
        } else {
          window.location = window.location.href.substr(0, hashIndex);
        }
      }
    };

    return root;
  });

'use strict';
angular.module('copayApp.services')
  .factory('backupService', function backupServiceFactory($log, $timeout, profileService, sjcl) {

    var root = {};

    var _download = function(ew, filename, cb) {
      var NewBlob = function(data, datatype) {
        var out;

        try {
          out = new Blob([data], {
            type: datatype
          });
          $log.debug("case 1");
        } catch (e) {
          window.BlobBuilder = window.BlobBuilder ||
            window.WebKitBlobBuilder ||
            window.MozBlobBuilder ||
            window.MSBlobBuilder;

          if (e.name == 'TypeError' && window.BlobBuilder) {
            var bb = new BlobBuilder();
            bb.append(data);
            out = bb.getBlob(datatype);
            $log.debug("case 2");
          } else if (e.name == "InvalidStateError") {
            // InvalidStateError (tested on FF13 WinXP)
            out = new Blob([data], {
              type: datatype
            });
            $log.debug("case 3");
          } else {
            // We're screwed, blob constructor unsupported entirely   
            $log.debug("Errore");
          }
        }
        return out;
      };

      var a = document.createElement("a");
      document.body.appendChild(a);
      a.style.display = "none";

      var blob = new NewBlob(ew, 'text/plain;charset=utf-8');
      var url = window.URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      a.click();
      $timeout(function() {
        window.URL.revokeObjectURL(url);
      }, 250);
      return cb();
    };

    root.addMetadata = function(b, opts) {

      b = JSON.parse(b);
      if (opts.historyCache) b.historyCache = opts.historyCache;
      if (opts.addressBook) b.addressBook = opts.addressBook;
      return JSON.stringify(b);
    }

    root.walletExport = function(password, opts) {
      if (!password) {
        return null;
      }
      var fc = profileService.focusedClient;
      try {
        opts = opts || {};
        var b = fc.export(opts);
        if (opts.historyCache || opts.addressBook) b = root.addMetadata(b, opts);

        var e = sjcl.encrypt(password, b, {
          iter: 10000
        });
        return e;
      } catch (err) {
        $log.debug('Error exporting wallet: ', err);
        return null;
      };
    };

    root.walletDownload = function(password, opts, cb) {
      var fc = profileService.focusedClient;
      var ew = root.walletExport(password, opts);
      if (!ew) return cb('Could not create backup');

      var walletName = (fc.alias || '') + (fc.alias ? '-' : '') + fc.credentials.walletName;
      if (opts.noSign) walletName = walletName + '-noSign'
      var filename = walletName + '-Copaybackup.aes.json';
      _download(ew, filename, cb)
    };
    return root;
  });
'use strict';
angular.module('copayApp.services')
  .factory('bitcore', function bitcoreFactory(bwcService) {
    var bitcore = bwcService.getBitcore();
    return bitcore;
  });

'use strict';
angular.module('copayApp.services')
  .factory('bwsError', function bwcErrorService($log, gettextCatalog) {
    var root = {};

    root.msg = function(err, prefix) {
      var body = '';
      prefix = prefix || '';

      if (err && err.code) {
        switch (err.code) {
          case 'CONNECTION_ERROR':
            body = gettextCatalog.getString('Network connection error');
            break;
          case 'NOT_FOUND':
            body = gettextCatalog.getString('Wallet service not found');
            break;
          case 'BAD_SIGNATURES':
            body = gettextCatalog.getString('Signatures rejected by server');
            break;
          case 'COPAYER_DATA_MISMATCH':
            body = gettextCatalog.getString('Copayer data mismatch');
            break;
          case 'COPAYER_IN_WALLET':
            body = gettextCatalog.getString('Copayer already in this wallet');
            break;
          case 'COPAYER_REGISTERED':
            body = gettextCatalog.getString('Key already associated with an existing wallet');
            break;
          case 'COPAYER_VOTED':
            body = gettextCatalog.getString('Copayer already voted on this spend proposal');
            break;
          case 'DUST_AMOUNT':
            body = gettextCatalog.getString('Amount below dust threshold');
            break;
          case 'INCORRECT_ADDRESS_NETWORK':
            body = gettextCatalog.getString('Incorrect address network');
            break;
          case 'INSUFFICIENT_FUNDS':
            body = gettextCatalog.getString('Insufficient funds');
            break;
          case 'INSUFFICIENT_FUNDS_FOR_FEE':
            body = gettextCatalog.getString('Insufficient funds for fee');
            break;
          case 'INVALID_ADDRESS':
            body = gettextCatalog.getString('Invalid address');
            break;
          case 'LOCKED_FUNDS':
            body = gettextCatalog.getString('Funds are locked by pending spend proposals');
            break;
          case 'NOT_AUTHORIZED':
            body = gettextCatalog.getString('Not authorized');
            break;
          case 'TX_ALREADY_BROADCASTED':
            body = gettextCatalog.getString('Transaction already broadcasted');
            break;
          case 'TX_CANNOT_CREATE':
            body = gettextCatalog.getString('Locktime in effect. Please wait to create a new spend proposal');
            break;
          case 'TX_CANNOT_REMOVE':
            body = gettextCatalog.getString('Locktime in effect. Please wait to remove this spend proposal');
            break;
          case 'TX_NOT_ACCEPTED':
            body = gettextCatalog.getString('Spend proposal is not accepted');
            break;
          case 'TX_NOT_FOUND':
            body = gettextCatalog.getString('Spend proposal not found');
            break;
          case 'TX_NOT_PENDING':
            body = gettextCatalog.getString('The spend proposal is not pending');
            break;
          case 'UPGRADE_NEEDED':
            body = gettextCatalog.getString('Please upgrade Copay to perform this action');
            break;
          case 'WALLET_ALREADY_EXISTS':
            body = gettextCatalog.getString('Wallet already exists');
            break;
          case 'WALLET_FULL':
            body = gettextCatalog.getString('Wallet is full');
            break;
          case 'WALLET_NOT_COMPLETE':
            body = gettextCatalog.getString('Wallet is not complete');
            break;
          case 'WALLET_NOT_FOUND':
            body = gettextCatalog.getString('Wallet not found');
            break;
          case 'SERVER_COMPROMISED':
            body = gettextCatalog.getString('Server response could not be verified');
            break;
          case 'WALLET_DOES_NOT_EXIST':
            body = gettextCatalog.getString('Wallet not registed at the Wallet Service. Recreate it from "Create Wallet" using "Advanced Options" to set your seed');
            break;
          case 'INVALID_BACKUP':
            body = gettextCatalog.getString('Wallet seed is invalid');
            break;
          case 'MAIN_ADDRESS_GAP_REACHED':
            body = gettextCatalog.getString('Empty addresses limit reached. New addresses cannot be generated.');
            break;
          case 'WALLET_LOCKED':
            body = gettextCatalog.getString('Wallet is locked');
            break;

          case 'ERROR':
            body = (err.message || err.error);
            break;

          default:
            $log.warn('Unknown error type:', err.code);
            body = err.message || err.code;
            break;
        }
      } else if (err.message) {
        body = gettextCatalog.getString(err.message);
      } else {
        body = gettextCatalog.getString(err);
      }

      var msg = prefix + (body ? (prefix ? ': ' : '') + body : '');
      return msg;
    };

    root.cb = function(err, prefix, cb) {
      return cb(root.msg(err, prefix))
    };

    return root;
  });

'use strict';

angular.module('copayApp.services').factory('configService', function(storageService, lodash, $log) {
  var root = {};

  var defaultConfig = {
    // wallet limits
    limits: {
      totalCopayers: 6,
      mPlusN: 100,
    },

    // Bitcore wallet service URL
    bws: {
      url: 'https://bws.bitpay.com/bws/api',
    },

    // wallet default config
    wallet: {
      requiredCopayers: 2,
      totalCopayers: 3,
      spendUnconfirmed: true,
      reconnectDelay: 5000,
      idleDurationMin: 4,
      settings: {
        unitName: 'bits',
        unitToSatoshi: 100,
        unitDecimals: 2,
        unitCode: 'bit',
        alternativeName: 'US Dollar',
        alternativeIsoCode: 'USD',
      }
    },

    // External services
    glidera: {
      enabled: true,
      testnet: false
    },

    rates: {
      url: 'https://insight.bitpay.com:443/api/rates',
    },
  };

  var configCache = null;


  root.getSync = function() {
    if (!configCache)
      throw new Error('configService#getSync called when cache is not initialized');

    return configCache;
  };

  root.get = function(cb) {

    storageService.getConfig(function(err, localConfig) {
      if (localConfig) {
        configCache = JSON.parse(localConfig);

        //these ifs are to avoid migration problems
        if (!configCache.bws) {
          configCache.bws = defaultConfig.bws;
        }
        if (!configCache.wallet) {
          configCache.wallet = defaultConfig.wallet;
        }
        if (!configCache.wallet.settings.unitCode) {
          configCache.wallet.settings.unitCode = defaultConfig.wallet.settings.unitCode;
        }
        if (!configCache.glidera) {
          configCache.glidera = defaultConfig.glidera; 
        }

      } else {
        configCache = lodash.clone(defaultConfig);
      };

      // Glidera
      // Disabled for testnet
      configCache.glidera.testnet = false;

      $log.debug('Preferences read:', configCache)
      return cb(err, configCache);
    });
  };

  root.set = function(newOpts, cb) {
    var config = lodash.clone(defaultConfig);
    storageService.getConfig(function(err, oldOpts) {
      if (lodash.isString(oldOpts)) {
        oldOpts = JSON.parse(oldOpts);
      }
      if (lodash.isString(config)) {
        config = JSON.parse(config);
      }
      if (lodash.isString(newOpts)) {
        newOpts = JSON.parse(newOpts);
      }
      lodash.merge(config, oldOpts, newOpts);
      configCache = config;

      storageService.storeConfig(JSON.stringify(config), cb);
    });
  };

  root.reset = function(cb) {
    configCache = lodash.clone(defaultConfig);
    storageService.removeConfig(cb);
  };

  root.getDefaults = function() {
    return lodash.clone(defaultConfig);
  };


  return root;
});


'use strict';

angular.module('copayApp.services').factory('confirmDialog', function($log, $timeout, profileService, configService, gettextCatalog, isCordova, isChromeApp) {
  var root = {};


  var acceptMsg = gettextCatalog.getString('Accept');
  var cancelMsg = gettextCatalog.getString('Cancel');
  var confirmMsg = gettextCatalog.getString('Confirm');

  root.show = function(msg, cb) {
    if (isCordova) { 
      navigator.notification.confirm(
        msg,
        function(buttonIndex) {
          if (buttonIndex == 1) {
            $timeout(function() {
              return cb(true);
            }, 1);
          } else {
            return cb(false);
          }
        },
        confirmMsg, [acceptMsg, cancelMsg]
      );
    } else if (isChromeApp) {
      // No feedback, alert/confirm not supported.
      return cb(true);
    } else {
      return cb(confirm(msg));
    }
  };

  return root;
});


'use strict';

angular.module('copayApp.services').factory('derivationPathHelper', function(lodash) {
  var root = {};

  root.default = "m/44'/0'/0'"
  root.parse = function(str) {
    var arr = str.split('/');

    var ret = {};

    if (arr[0] != 'm')
      return false;

    switch (arr[1]) {
      case "44'":
        ret.derivationStrategy = 'BIP44';
        break;
      case "48'":
        ret.derivationStrategy = 'BIP48';
        break;
      default:
        return false;
    };

    switch (arr[2]) {
      case "0'":
        ret.networkName = 'livenet';
        break;
      case "1'":
        ret.networkName = 'testnet';
        break;
      default:
        return false;
    };

    var match = arr[3].match(/(\d+)'/);
    if (!match)
      return false;
    ret.account = + match[1]

    return ret;
  };

  return root;
});

'use strict';

angular.module('copayApp.services').factory('feeService', function($log, profileService, configService, gettextCatalog, lodash) {
  var root = {};

  // Constant fee options to translate
  root.feeOpts = {
    priority: gettextCatalog.getString('Priority'),
    normal: gettextCatalog.getString('Normal'),
    economy: gettextCatalog.getString('Economy')
  };

  root.getCurrentFeeValue = function(currentSendFeeLevel, cb) { 
    var fc = profileService.focusedClient;
    var config = configService.getSync().wallet.settings;
    var feeLevel = currentSendFeeLevel || config.feeLevel || 'normal';
    // static fee
    var fee = 10000;
    fc.getFeeLevels(fc.credentials.network, function(err, levels) {
      if (err) {
        return cb({message: 'Could not get dynamic fee. Using static 10000sat'}, fee);
      }
      else {
        fee = lodash.find(levels, { level: feeLevel }).feePerKB;
        $log.debug('Dynamic fee: ' + feeLevel + ' ' + fee +  ' SAT');
        return cb(null, fee); 
      }
    });
  }; 

  root.getFeeLevels = function(cb) { 
    var fc = profileService.focusedClient;
    var config = configService.getSync().wallet.settings;
    var unitName = config.unitName;

    fc.getFeeLevels('livenet', function(errLivenet, levelsLivenet) {
      fc.getFeeLevels('testnet', function(errTestnet, levelsTestnet) {
        if (errLivenet || errTestnet) $log.debug('Could not get dynamic fee');
        else {
          for (var i = 0; i < 3; i++) {
            levelsLivenet[i]['feePerKBUnit'] = profileService.formatAmount(levelsLivenet[i].feePerKB) + ' ' + unitName;
            levelsTestnet[i]['feePerKBUnit'] = profileService.formatAmount(levelsTestnet[i].feePerKB) + ' ' + unitName;
          }
        }

        return cb({
          'livenet': levelsLivenet,
          'testnet': levelsTestnet
        });
      });
    });
  };

  return root;
});

'use strict';

angular.module('copayApp.services')
  .factory('fileStorageService', function(lodash, $log) {
    var root = {},
      _fs, _dir;

    root.init = function(cb) {
      if (_dir) return cb(null, _fs, _dir);

      function onFileSystemSuccess(fileSystem) {
        console.log('File system started: ', fileSystem.name, fileSystem.root.name);
        _fs = fileSystem;
        root.getDir(function(err, newDir) {
          if (err || !newDir.nativeURL) return cb(err);
          _dir = newDir
          $log.debug("Got main dir:", _dir.nativeURL);
          return cb(null, _fs, _dir);
        });
      }

      function fail(evt) {
        var msg = 'Could not init file system: ' + evt.target.error.code;
        console.log(msg);
        return cb(msg);
      };

      window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, onFileSystemSuccess, fail);
    };

    root.get = function(k, cb) {
      root.init(function(err, fs, dir) {
        if (err) return cb(err);
        dir.getFile(k, {
          create: false,
        }, function(fileEntry) {
          if (!fileEntry) return cb();
          fileEntry.file(function(file) {
            var reader = new FileReader();

            reader.onloadend = function(e) {
              return cb(null, this.result)
            }

            reader.readAsText(file);
          });
        }, function(err) {
          // Not found
          if (err.code == 1) return cb();
          else return cb(err);
        });
      })
    };

    root.set = function(k, v, cb) {
      root.init(function(err, fs, dir) {
        if (err) return cb(err);
        dir.getFile(k, {
          create: true,
        }, function(fileEntry) {
          // Create a FileWriter object for our FileEntry (log.txt).
          fileEntry.createWriter(function(fileWriter) {

            fileWriter.onwriteend = function(e) {
              console.log('Write completed.');
              return cb();
            };

            fileWriter.onerror = function(e) {
              var err = e.error ? e.error : JSON.stringify(e);
              console.log('Write failed: ' + err);
              return cb('Fail to write:' + err);
            };

            if (lodash.isObject(v))
              v = JSON.stringify(v);

            if (!lodash.isString(v)) {
              v = v.toString();
            }

            $log.debug('Writing:', k, v);
            fileWriter.write(v);

          }, cb);
        });
      });
    };


    // See https://github.com/apache/cordova-plugin-file/#where-to-store-files
    root.getDir = function(cb) {
      if (!cordova.file) {
        return cb('Could not write on device storage');
      }

      var url = cordova.file.dataDirectory;
      // This could be needed for windows
      // if (cordova.file === undefined) {
      //   url = 'ms-appdata:///local/';
      window.resolveLocalFileSystemURL(url, function(dir) {
        return cb(null, dir);
      }, function(err) {
        $log.warn(err);
        return cb(err || 'Could not resolve filesystem:' + url);
      });
    };

    root.remove = function(k, cb) {
      root.init(function(err, fs, dir) {
        if (err) return cb(err);
        dir.getFile(k, {
          create: false,
        }, function(fileEntry) {
          // Create a FileWriter object for our FileEntry (log.txt).
          fileEntry.remove(function() {
            console.log('File removed.');
            return cb();
          }, cb, cb);
        });
      });
    };

    /**
     * Same as setItem, but fails if an item already exists
     */
    root.create = function(name, value, callback) {
      root.get(name,
        function(err, data) {
          if (data) {
            return callback('EEXISTS');
          } else {
            return root.set(name, value, callback);
          }
        });
    };

    return root;
  });

'use strict';

angular.module('copayApp.services').factory('glideraService', function($http, $log, isCordova) {
  var root = {};
  var credentials = {};

  root.setCredentials = function(network) {
    if (network == 'testnet') {
      credentials.HOST = 'https://sandbox.glidera.io';
      if (isCordova) {
        credentials.REDIRECT_URI = 'bitcoin://glidera';
        credentials.CLIENT_ID = 'dfc56e4336e32bb8ba46dde34f3d7d6d';
        credentials.CLIENT_SECRET = '5eb679058f6c7eb81123162323d4fba5';
      }
      else {
        credentials.REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
        credentials.CLIENT_ID = '9915b6ffa6dc3baffb87135ed3873d49';
        credentials.CLIENT_SECRET = 'd74eda05b9c6a228fd5c85cfbd0eb7eb';
      }
    }
    else {
      credentials.HOST = 'https://glidera.io';
      if (isCordova) {
        credentials.REDIRECT_URI = 'bitcoin://glidera';
        credentials.CLIENT_ID = '9c8023f0ac0128235b7b27a6f2610c83';
        credentials.CLIENT_SECRET = '30431511407b47f25a83bffd72881d55';
      }
      else {
        credentials.REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
        credentials.CLIENT_ID = '8a9e8a9cf155db430c1ea6c7889afed1';
        credentials.CLIENT_SECRET = '24ddec578f38d5488bfe13601933c05f';
      }
    };
  };

  root.getOauthCodeUrl = function() {
    return credentials.HOST 
      + '/oauth2/auth?response_type=code&client_id=' 
      + credentials.CLIENT_ID 
      + '&redirect_uri='
      + credentials.REDIRECT_URI;
  };

  root.getToken = function(code, cb) {
    var req = {
      method: 'POST',
      url: credentials.HOST + '/api/v1/oauth/token',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      data: { 
        grant_type : 'authorization_code',
        code: code,
        client_id : credentials.CLIENT_ID,
        client_secret: credentials.CLIENT_SECRET,
        redirect_uri: credentials.REDIRECT_URI
      }
    };

    $http(req).then(function(data) {
      $log.info('Glidera Authorization Access Token: SUCCESS');
      return cb(null, data.data); 
    }, function(data) {
      $log.error('Glidera Authorization Access Token: ERROR ' + data.statusText);
      return cb('Glidera Authorization Access Token: ERROR ' + data.statusText);
    });
  };

  var _get = function(endpoint, token) {
    return {
      method: 'GET',
      url: credentials.HOST + '/api/v1' + endpoint,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    };
  };

  root.getAccessTokenPermissions = function(token, cb) {
    if (!token) return cb('Invalid Token');
    $http(_get('/oauth/token', token)).then(function(data) {
      $log.info('Glidera Access Token Permissions: SUCCESS');
      return cb(null, data.data);
    }, function(data) {
      $log.error('Glidera Access Token Permissions: ERROR ' + data.statusText);
      return cb('Glidera Access Token Permissions: ERROR ' + data.statusText);
    });
  };

  root.getEmail = function(token, cb) {
    if (!token) return cb('Invalid Token');
    $http(_get('/user/email', token)).then(function(data) {
      $log.info('Glidera Get Email: SUCCESS');
      return cb(null, data.data);
    }, function(data) {
      $log.error('Glidera Get Email: ERROR ' + data.statusText);
      return cb('Glidera Get Email: ERROR ' + data.statusText);
    });
  };

  root.getPersonalInfo = function(token, cb) {
    if (!token) return cb('Invalid Token');
    $http(_get('/user/personalinfo', token)).then(function(data) {
      $log.info('Glidera Get Personal Info: SUCCESS');
      return cb(null, data.data);
    }, function(data) {
      $log.error('Glidera Get Personal Info: ERROR ' + data.statusText);
      return cb('Glidera Get Personal Info: ERROR ' + data.statusText);
    });
  };

  root.getStatus = function(token, cb) {
    if (!token) return cb('Invalid Token');
    $http(_get('/user/status', token)).then(function(data) {
      $log.info('Glidera User Status: SUCCESS');
      return cb(null, data.data);
    }, function(data) {
      $log.error('Glidera User Status: ERROR ' + data.statusText);
      return cb('Glidera User Status: ERROR ' + data.statusText);
    });
  };

  root.getLimits = function(token, cb) {
    if (!token) return cb('Invalid Token');
    $http(_get('/user/limits', token)).then(function(data) {
      $log.info('Glidera Transaction Limits: SUCCESS');
      return cb(null, data.data);
    }, function(data) {
      $log.error('Glidera Transaction Limits: ERROR ' + data.statusText);
      return cb('Glidera Transaction Limits: ERROR ' + data.statusText);
    });
  };

  root.getTransactions = function(token, cb) {
    if (!token) return cb('Invalid Token');
    $http(_get('/transaction', token)).then(function(data) {
      $log.info('Glidera Transactions: SUCCESS');
      return cb(null, data.data.transactions);
    }, function(data) {
      $log.error('Glidera Transactions: ERROR ' + data.statusText);
      return cb('Glidera Transactions: ERROR ' + data.statusText);
    });
  };

  root.getTransaction = function(token, txid, cb) {
    if (!token) return cb('Invalid Token');
    if (!txid) return cb('TxId required');
    $http(_get('/transaction/' + txid, token)).then(function(data) {
      $log.info('Glidera Transaction: SUCCESS');
      return cb(null, data.data);
    }, function(data) {
      $log.error('Glidera Transaction: ERROR ' + data.statusText);
      return cb('Glidera Transaction: ERROR ' + data.statusText);
    });
  };

  root.getSellAddress = function(token, cb) {
    if (!token) return cb('Invalid Token');
    $http(_get('/user/create_sell_address', token)).then(function(data) {
      $log.info('Glidera Create Sell Address: SUCCESS');
      return cb(null, data.data.sellAddress);
    }, function(data) {
      $log.error('Glidera Create Sell Address: ERROR ' + data.statusText);
      return cb('Glidera Create Sell Address: ERROR ' + data.statusText);
    });
  };

  root.get2faCode = function(token, cb) {
    if (!token) return cb('Invalid Token');
    $http(_get('/authentication/get2faCode', token)).then(function(data) {
      $log.info('Glidera Sent 2FA code by SMS: SUCCESS');
      return cb(null, data.status == 200 ? true : false);
    }, function(data) {
      $log.error('Glidera Sent 2FA code by SMS: ERROR ' + data.statusText);
      return cb('Glidera Sent 2FA code by SMS: ERROR ' + data.statusText);
    });
  };

  var _post = function(endpoint, token, twoFaCode, data) {
    return {
      method: 'POST',
      url: credentials.HOST + '/api/v1' + endpoint,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token,
        '2FA_CODE': twoFaCode
      },
      data: data
    };
  };

  root.sellPrice = function(token, price, cb) {
    var data = {
      qty: price.qty,
      fiat: price.fiat
    };
    $http(_post('/prices/sell', token, null, data)).then(function(data) {
      $log.info('Glidera Sell Price: SUCCESS');
      return cb(null, data.data); 
    }, function(data) {
      $log.error('Glidera Sell Price: ERROR ' + data.statusText);
      return cb('Glidera Sell Price: ERROR ' + data.statusText);
    });
  }; 

  root.sell = function(token, twoFaCode, data, cb) {
    var data = {
      refundAddress: data.refundAddress,
      signedTransaction: data.signedTransaction,
      priceUuid: data.priceUuid,
      useCurrentPrice: data.useCurrentPrice,
      ip: data.ip
    };
    $http(_post('/sell', token, twoFaCode, data)).then(function(data) {
      $log.info('Glidera Sell: SUCCESS');
      return cb(null, data.data); 
    }, function(data) {
      $log.error('Glidera Sell Request: ERROR ' + data.statusText);
      return cb('Glidera Sell Request: ERROR ' + data.statusText);
    });
  };

  root.buyPrice = function(token, price, cb) {
    var data = {
      qty: price.qty,
      fiat: price.fiat
    };
    $http(_post('/prices/buy', token, null, data)).then(function(data) {
      $log.info('Glidera Buy Price: SUCCESS');
      return cb(null, data.data); 
    }, function(data) {
      $log.error('Glidera Buy Price: ERROR ' + data.statusText);
      return cb('Glidera Buy Price: ERROR ' + data.statusText);
    });
  };

  root.buy = function(token, twoFaCode, data, cb) {
    var data = {
      destinationAddress: data.destinationAddress,
      qty: data.qty,
      priceUuid: data.priceUuid,
      useCurrentPrice: data.useCurrentPrice,
      ip: data.ip
    };
    $http(_post('/buy', token, twoFaCode, data)).then(function(data) {
      $log.info('Glidera Buy: SUCCESS');
      return cb(null, data.data); 
    }, function(data) {
      $log.error('Glidera Buy Request: ERROR ' + data.statusText);
      return cb('Glidera Buy Request: ERROR ' + data.statusText);
    });
  };

  return root;

});

'use strict';

angular.module('copayApp.services').factory('go', function($window, $rootScope, $location, $state, $timeout, profileService, nodeWebkit) {
  var root = {};

  var hideSidebars = function() {
    if (typeof document === 'undefined')
      return;

    var elem = document.getElementById('off-canvas-wrap');
    elem.className = 'off-canvas-wrap';
  };

  var toggleSidebar = function(invert) {
    if (typeof document === 'undefined')
      return;

    var elem = document.getElementById('off-canvas-wrap');
    var leftbarActive = elem.className.indexOf('move-right') >= 0;

    if (invert) {
      if (profileService.profile && !$rootScope.hideNavigation) {
        elem.className = 'off-canvas-wrap move-right';
      }
    } else {
      if (leftbarActive) {
        hideSidebars();
      }
    }
  };

  root.openExternalLink = function(url, target) {
    if (nodeWebkit.isDefined()) {
      nodeWebkit.openExternalLink(url);
    } else {
      target = target || '_blank';
      var ref = window.open(url, target, 'location=no');
    }
  };

  root.path = function(path, cb) {
    $state.transitionTo(path)
      .then(function() {
        if (cb) return cb();
      }, function() {
        if (cb) return cb('animation in progress');
      });
    hideSidebars();
  };

  root.swipe = function(invert) {
    toggleSidebar(invert);
  };

  root.walletHome = function(delayed) {
    var fc = profileService.focusedClient;
    if (fc && !fc.isComplete()) {
      root.path('copayers');
    } else {
      root.path('walletHome', function() {
        $rootScope.$emit('Local/SetTab', 'walletHome', true);
      });
    }
  };


  root.send = function() {
    root.path('walletHome', function() {
      $rootScope.$emit('Local/SetTab', 'send');
    });
  };

  root.addWallet = function() {
    $state.go('add');
  };

  root.preferences = function() {
    $state.go('preferences');
  };

  root.preferencesGlobal = function() {
    $state.go('preferencesGlobal');
  };

  root.reload = function() {
    $state.reload();
  };


  // Global go. This should be in a better place TODO
  // We dont do a 'go' directive, to use the benefits of ng-touch with ng-click
  $rootScope.go = function(path) {
    root.path(path);
  };

  $rootScope.openExternalLink = function(url, target) {
    root.openExternalLink(url, target);
  };



  return root;
});

'use strict';
var logs = [];
angular.module('copayApp.services')
  .factory('historicLog', function historicLog() {
    var root = {};

    root.add = function(level, msg) {
      logs.push({
        level: level,
        msg: msg,
      });
    };

    root.get = function() {
      return logs;
    };

    return root;
  });

'use strict';

angular.module('copayApp.services')
  .factory('hwWallet', function($log,  bwcService) {
    var root = {};

    // Ledger magic number to get xPub without user confirmation
    root.ENTROPY_INDEX_PATH = "0xb11e/";
    root.UNISIG_ROOTPATH = 44;
    root.MULTISIG_ROOTPATH = 48;
    root.LIVENET_PATH = 0;

    root._err = function(data) {
      var msg = 'Hardware Wallet Error: ' + (data.error || data.message || 'unknown');
      $log.warn(msg);
      return msg;
    };


    root.getRootPath = function(device, isMultisig, account) {
      if (!isMultisig) return root.UNISIG_ROOTPATH;

      // Compat
      if (device == 'ledger' && account ==0) return root.UNISIG_ROOTPATH;

      return root.MULTISIG_ROOTPATH;
    };

    root.getAddressPath = function(device, isMultisig, account) {
      return root.getRootPath(device,isMultisig,account) + "'/" + root.LIVENET_PATH + "'/" + account + "'";
    }

    root.getEntropyPath = function(device, isMultisig, account) {
      var path;

      // Old ledger wallet compat
      if (device == 'ledger' && account == 0)
        return root.ENTROPY_INDEX_PATH  + "0'";

      return root.ENTROPY_INDEX_PATH + root.getRootPath(device,isMultisig,account) + "'/" + account + "'";
    };

    root.pubKeyToEntropySource = function(xPubKey) {
      var b = bwcService.getBitcore();
      var x = b.HDPublicKey(xPubKey);
      return x.publicKey.toString();
    };

    return root;
  });

'use strict';

angular.module('copayApp.services').factory('isChromeApp', function(nodeWebkit) {
  return !!(window.chrome && chrome.runtime && chrome.runtime.id && !nodeWebkit.isDefined());
});

'use strict';

angular.module('copayApp.services').value('isCordova',  window.cordova ? true : false);

'use strict';

angular.module('copayApp.services').factory('isDevel', function(nodeWebkit, isChromeApp, isMobile) {
  return !isMobile.any() && !isChromeApp && !nodeWebkit.isDefined();
});

'use strict';

// Detect mobile devices
var isMobile = {
  Android: function() {
    return !!navigator.userAgent.match(/Android/i);
  },
  BlackBerry: function() {
    return !!navigator.userAgent.match(/BlackBerry/i);
  },
  iOS: function() {
    return !!navigator.userAgent.match(/iPhone|iPad|iPod/i);
  },
  Opera: function() {
    return !!navigator.userAgent.match(/Opera Mini/i);
  },
  Windows: function() {
    return !!navigator.userAgent.match(/IEMobile/i);
  },
  Safari: function() {
    return Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0;
  },
  any: function() {
    return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
  }
};


angular.module('copayApp.services').value('isMobile', isMobile);

'use strict';

angular.module('copayApp.services')
  .factory('ledger', function($log, bwcService, gettext, hwWallet) {
    var root = {};
    var LEDGER_CHROME_ID = "kkdpmhnladdopljabkgpacgpliggeeaf";

    root.callbacks = {};
    root.hasSession = function() {
      root._message({
        command: "has_session"
      });
    }

    root.getEntropySource = function(isMultisig, account, callback) {
      root.getXPubKey(hwWallet.getEntropyPath('ledger', isMultisig, account), function(data) {
        if (!data.success) 
          return callback(hwWallet._err(data));
        
        return callback(null,  hwWallet.pubKeyToEntropySource(data.xpubkey));
      });
    };

    root.getXPubKey = function(path, callback) {
      $log.debug('Ledger deriving xPub path:', path);
      root.callbacks["get_xpubkey"] = callback;
      root._messageAfterSession({
        command: "get_xpubkey",
        path: path
      })
    };


    root.getInfoForNewWallet = function(isMultisig, account, callback) {
      var opts = {};
      root.getEntropySource(isMultisig, account, function(err, entropySource) {
        if (err) return callback(err);

        opts.entropySource = entropySource;
        root.getXPubKey(hwWallet.getAddressPath('ledger', isMultisig, account), function(data) {
          if (!data.success) {
            $log.warn(data.message);
            return callback(data);
          }
          opts.extendedPublicKey = data.xpubkey;
          opts.externalSource = 'ledger';
          opts.account = account;

          // Old ledger compat
          opts.derivationStrategy = account ? 'BIP48' : 'BIP44';
          return callback(null, opts);
        });
      });
    };

    root._signP2SH = function(txp, account, isMultisig, callback) {
      root.callbacks["sign_p2sh"] = callback;
      var redeemScripts = [];
      var paths = [];
      var tx = bwcService.buildTx(txp);
      for (var i = 0; i < tx.inputs.length; i++) {
        redeemScripts.push(new ByteString(tx.inputs[i].redeemScript.toBuffer().toString('hex'), GP.HEX).toString());
        paths.push(hwWallet.getAddressPath('ledger', isMultisig, account) + txp.inputs[i].path.substring(1));
      }
      var splitTransaction = root._splitTransaction(new ByteString(tx.toString(), GP.HEX));
      var inputs = [];
      for (var i = 0; i < splitTransaction.inputs.length; i++) {
        var input = splitTransaction.inputs[i];
        inputs.push([
          root._reverseBytestring(input.prevout.bytes(0, 32)).toString(),
          root._reverseBytestring(input.prevout.bytes(32)).toString()
        ]);
      }
      $log.debug('Ledger signing  paths:', paths);
      root._messageAfterSession({
        command: "sign_p2sh",
        inputs: inputs,
        scripts: redeemScripts,
        outputs_number: splitTransaction.outputs.length,
        outputs_script: splitTransaction.outputScript.toString(),
        paths: paths
      });
    };

    root.signTx = function(txp, account, callback) {

      // TODO Compat
      var isMultisig = true;
      if (txp.addressType == 'P2PKH') {
        var msg = 'P2PKH wallets are not supported with ledger';
        $log.error(msg);
        return callback(msg);
      } else {
        root._signP2SH(txp, account, isMultisig, callback);
      }
    }

    root._message = function(data) {
      chrome.runtime.sendMessage(
        LEDGER_CHROME_ID, {
          request: data
        },
        function(response) {
          root._callback(response);
        }
      );
    }

    root._messageAfterSession = function(data) {
      root._after_session = data;
      root._message({
        command: "launch"
      });
      root._should_poll_session = true;
      root._do_poll_session();
    }

    root._do_poll_session = function() {
      root.hasSession();
      if (root._should_poll_session) {
        setTimeout(root._do_poll_session, 500);
      }
    }

    root._callback = function(data) {
      if (typeof data == "object") {
        if (data.command == "has_session" && data.success) {
          root._message(root._after_session);
          root._after_session = null;
          root._should_poll_session = false;
        } else if (typeof root.callbacks[data.command] == "function") {
          root.callbacks[data.command](data);
        }
      } else {
        root._should_poll_session = false;
        Object.keys(root.callbacks).forEach(function(key) {
          root.callbacks[key]({
            success: false,
            message: gettext("The Ledger Chrome application is not installed"),
          });
        });
      }
    }

    root._splitTransaction = function(transaction) {
      var result = {};
      var inputs = [];
      var outputs = [];
      var offset = 0;
      var version = transaction.bytes(offset, 4);
      offset += 4;
      var varint = root._getVarint(transaction, offset);
      var numberInputs = varint[0];
      offset += varint[1];
      for (var i = 0; i < numberInputs; i++) {
        var input = {};
        input['prevout'] = transaction.bytes(offset, 36);
        offset += 36;
        varint = root._getVarint(transaction, offset);
        offset += varint[1];
        input['script'] = transaction.bytes(offset, varint[0]);
        offset += varint[0];
        input['sequence'] = transaction.bytes(offset, 4);
        offset += 4;
        inputs.push(input);
      }
      varint = root._getVarint(transaction, offset);
      var numberOutputs = varint[0];
      offset += varint[1];
      var outputStartOffset = offset;
      for (var i = 0; i < numberOutputs; i++) {
        var output = {};
        output['amount'] = transaction.bytes(offset, 8);
        offset += 8;
        varint = root._getVarint(transaction, offset);
        offset += varint[1];
        output['script'] = transaction.bytes(offset, varint[0]);
        offset += varint[0];
        outputs.push(output);
      }
      var locktime = transaction.bytes(offset, 4);
      result['version'] = version;
      result['inputs'] = inputs;
      result['outputs'] = outputs;
      result['locktime'] = locktime;
      result['outputScript'] = transaction.bytes(outputStartOffset, offset - outputStartOffset);
      return result;
    }

    root._getVarint = function(data, offset) {
      if (data.byteAt(offset) < 0xfd) {
        return [data.byteAt(offset), 1];
      }
      if (data.byteAt(offset) == 0xfd) {
        return [((data.byteAt(offset + 2) << 8) + data.byteAt(offset + 1)), 3];
      }
      if (data.byteAt(offset) == 0xfe) {
        return [((data.byteAt(offset + 4) << 24) + (data.byteAt(offset + 3) << 16) +
          (data.byteAt(offset + 2) << 8) + data.byteAt(offset + 1)), 5];
      }
    }

    root._reverseBytestring = function(x) {
      var res = "";
      for (var i = x.length - 1; i >= 0; i--) {
        res += Convert.toHexByte(x.byteAt(i));
      }
      return new ByteString(res, GP.HEX);
    }

    return root;
  });


'use strict';
angular.module('copayApp.services')
  .factory('legacyImportService', function($rootScope, $log, $timeout, $http, lodash, bitcore, bwcService, sjcl, profileService, isChromeApp) {

    var root = {};
    var wc = bwcService.getClient();

    root.getKeyForEmail = function(email) {
      var hash = bitcore.crypto.Hash.sha256ripemd160(new bitcore.deps.Buffer(email)).toString('hex');
      $log.debug('Storage key:' + hash);
      return 'profile::' + hash;
    };

    root.getKeyForWallet = function(id) {
      return 'wallet::' + id;
    };

    root._importOne = function(user, pass, walletId, get, cb) {
      get(root.getKeyForWallet(walletId), function(err, blob) {
        if (err) {
          $log.warn('Could not fetch wallet: ' + walletId + ":" + err);
          return cb('Could not fetch ' + walletId);
        }
        profileService.importLegacyWallet(user, pass, blob, cb);
      });
    };


    root._doImport = function(user, pass, get, cb) {
      var self = this;
      get(root.getKeyForEmail(user), function(err, p) {
        if (err || !p)
          return cb(err || ('Could not find profile for ' + user));


        var ids = wc.getWalletIdsFromOldCopay(user, pass, p);
        if (!ids)
          return cb('Could not find wallets on the profile');

        $rootScope.$emit('Local/ImportStatusUpdate',
          'Found ' + ids.length + ' wallets to import:' + ids.join());

        $log.info('Importing Wallet Ids:', ids);

        var i = 0;
        var okIds = [];
        var toScanIds = [];
        lodash.each(ids, function(walletId) {
          $timeout(function() {
            $rootScope.$emit('Local/ImportStatusUpdate',
              'Importing wallet ' + walletId + ' ... ');

            self._importOne(user, pass, walletId, get, function(err, id, name, existed) {
              if (err) {
                $rootScope.$emit('Local/ImportStatusUpdate',
                  'Failed to import wallet ' + (name || walletId));
              } else {
                okIds.push(walletId);
                $rootScope.$emit('Local/ImportStatusUpdate',
                  'Wallet ' + id + '[' + name + '] imported successfully');

                if (!existed) {
                  $log.info('Wallet ' + walletId + ' was created. need to be scanned');
                  toScanIds.push(id);
                }
              }

              if (++i == ids.length) {
                return cb(null, okIds, toScanIds);
              }
            });
          }, 100);
        });
      });
    };

    root.import = function(user, pass, serverURL, fromCloud, cb) {

      var insightGet = function(key, cb) {


        var kdfbinary = function(password, salt, iterations, length) {
          iterations = iterations || defaultIterations;
          length = length || 512;
          salt = sjcl.codec.base64.toBits(salt || defaultSalt);

          var hash = sjcl.hash.sha256.hash(sjcl.hash.sha256.hash(password));
          var prff = function(key) {
            return new sjcl.misc.hmac(hash, sjcl.hash.sha1);
          };

          return sjcl.misc.pbkdf2(hash, salt, iterations, length, prff);
        };

        var salt = 'jBbYTj8zTrOt6V';
        var iter = 1000;
        var SEPARATOR = '|';

        var kdfb = kdfbinary(pass + SEPARATOR + user, salt, iter);
        var kdfb64 = sjcl.codec.base64.fromBits(kdfb);


        var keyBuf = new bitcore.deps.Buffer(kdfb64);
        var passphrase = bitcore.crypto.Hash.sha256sha256(keyBuf).toString('base64');
        var authHeader = new bitcore.deps.Buffer(user + ':' + passphrase).toString('base64');
        var retrieveUrl = serverURL + '/retrieve';
        var getParams = {
          method: 'GET',
          url: retrieveUrl + '?key=' + encodeURIComponent(key) + '&rand=' + Math.random(),
          headers: {
            'Authorization': authHeader,
          },
        };
        $log.debug('Insight GET', getParams);

        $http(getParams)
          .success(function(data) {
            data = JSON.stringify(data);
            $log.info('Fetch from insight OK:' + getParams.url);
            return cb(null, data);
          })
          .error(function() {
            $log.warn('Failed to fetch from insight');
            return cb('PNOTFOUND: Profile not found');
          });
      };

      var localStorageGet = function(key, cb) {
        if (isChromeApp) {
          chrome.storage.local.get(key,
            function(data) {
              return cb(null, data[key]);
            });
        } else {
          var v = localStorage.getItem(key);
          return cb(null, v);
        }
      };

      var get = fromCloud ? insightGet : localStorageGet;

      root._doImport(user, pass, get, cb);
    };

    return root;
  });

'use strict';

angular.module('copayApp.services')
  .factory('localStorageService', function(isChromeApp, nodeWebkit, $timeout) {
    var root = {};
    var ls = ((typeof window.localStorage !== "undefined") ? window.localStorage : null);

    if (isChromeApp && !nodeWebkit.isDefined() && !ls) {
      ls = localStorage = chrome.storage.local;
      window.localStorage = chrome.storage.local;
    }

    if (!ls)
      throw new Error('localstorage not available');

    root.get = function(k, cb) {
      if (isChromeApp && !nodeWebkit.isDefined()) {
        chrome.storage.local.get(k,
          function(data) {
            //TODO check for errors
            return cb(null, data[k]);
          });
      } else {
        return cb(null, ls.getItem(k));
      }
    };

    /**
     * Same as setItem, but fails if an item already exists
     */
    root.create = function(name, value, callback) {
      root.get(name,
        function(err, data) {
          if (data) {
            return callback('EEXISTS');
          } else {
            return root.set(name, value, callback);
          }
        });
    };

    root.set = function(k, v, cb) {
      if (isChromeApp && !nodeWebkit.isDefined()) {
        var obj = {};
        obj[k] = v;

        chrome.storage.local.set(obj, cb);
      } else {
        ls.setItem(k, v);
        return cb();
      }

    };

    root.remove = function(k, cb) {
      if (isChromeApp && !nodeWebkit.isDefined()) {
        chrome.storage.local.remove(k, cb);
      } else {
        ls.removeItem(k);
        return cb();
      }

    };

    return root;
  });

'use strict';
angular.module('copayApp.services')
  .factory('logHeader', function($log, isChromeApp, isCordova, nodeWebkit) {
    $log.info('Starting Copay v' + window.version + ' #' + window.commitHash);
    $log.info('Client: isCordova:', isCordova, 'isChromeApp:', isChromeApp, 'isNodeWebkit:', nodeWebkit.isDefined());
    $log.info('Navigator:', navigator.userAgent);
    return {};
  });

'use strict';

angular.module('copayApp.services').factory('nodeWebkit', function nodeWebkitFactory() {
  var root = {};

  var isNodeWebkit = function() {
    var isNode = (typeof process !== "undefined" && typeof require !== "undefined");
    if(isNode) {
      try {
        return (typeof require('nw.gui') !== "undefined");
      } catch(e) {
        return false;
      }
    }
  };

  root.isDefined = function() {
    return isNodeWebkit();
  };

  root.readFromClipboard = function() {
    if (!isNodeWebkit()) return;
    var gui = require('nw.gui');
    var clipboard = gui.Clipboard.get();
    return clipboard.get();
  };

  root.writeToClipboard = function(text) {
    if (!isNodeWebkit()) return;
    var gui = require('nw.gui');
    var clipboard = gui.Clipboard.get();
    return clipboard.set(text);
  };

  root.openExternalLink = function(url) {
    if (!isNodeWebkit()) return;
    var gui = require('nw.gui');
    return gui.Shell.openExternal(url);
  };

  return root;
});

'use strict';

angular.module('copayApp.services').
factory('notification', ['$timeout',
  function($timeout) {

    var notifications = [];

    /*
    ls.getItem('notifications', function(err, data) {
      if (data) {
        notifications = JSON.parse(data);
      }
    });
    */

    var queue = [];
    var settings = {
      info: {
        duration: 6000,
        enabled: true
      },
      funds: {
        duration: 7000,
        enabled: true
      },
      version: {
        duration: 60000,
        enabled: true
      },
      warning: {
        duration: 7000,
        enabled: true
      },
      error: {
        duration: 7000,
        enabled: true
      },
      success: {
        duration: 5000,
        enabled: true
      },
      progress: {
        duration: 0,
        enabled: true
      },
      custom: {
        duration: 35000,
        enabled: true
      },
      details: true,
      localStorage: false,
      html5Mode: false,
      html5DefaultIcon: 'img/favicon.ico'
    };

    function html5Notify(icon, title, content, ondisplay, onclose) {
      if (window.webkitNotifications && window.webkitNotifications.checkPermission() === 0) {
        if (!icon) {
          icon = 'img/favicon.ico';
        }
        var noti = window.webkitNotifications.createNotification(icon, title, content);
        if (typeof ondisplay === 'function') {
          noti.ondisplay = ondisplay;
        }
        if (typeof onclose === 'function') {
          noti.onclose = onclose;
        }
        noti.show();
      } else {
        settings.html5Mode = false;
      }
    }


    return {

      /* ========== SETTINGS RELATED METHODS =============*/

      disableHtml5Mode: function() {
        settings.html5Mode = false;
      },

      disableType: function(notificationType) {
        settings[notificationType].enabled = false;
      },

      enableHtml5Mode: function() {
        // settings.html5Mode = true;
        settings.html5Mode = this.requestHtml5ModePermissions();
      },

      enableType: function(notificationType) {
        settings[notificationType].enabled = true;
      },

      getSettings: function() {
        return settings;
      },

      toggleType: function(notificationType) {
        settings[notificationType].enabled = !settings[notificationType].enabled;
      },

      toggleHtml5Mode: function() {
        settings.html5Mode = !settings.html5Mode;
      },

      requestHtml5ModePermissions: function() {
        if (window.webkitNotifications) {
          if (window.webkitNotifications.checkPermission() === 0) {
            return true;
          } else {
            window.webkitNotifications.requestPermission(function() {
              if (window.webkitNotifications.checkPermission() === 0) {
                settings.html5Mode = true;
              } else {
                settings.html5Mode = false;
              }
            });
            return false;
          }
        } else {
          return false;
        }
      },


      /* ============ QUERYING RELATED METHODS ============*/

      getAll: function() {
        // Returns all notifications that are currently stored
        return notifications;
      },

      getQueue: function() {
        return queue;
      },

      /* ============== NOTIFICATION METHODS ==============*/

      info: function(title, content, userData) {
        return this.awesomeNotify('info', 'fi-info', title, content, userData);
      },

      funds: function(title, content, userData) {
        return this.awesomeNotify('funds', 'icon-receive', title, content, userData);
      },

      version: function(title, content, severe) {
        return this.awesomeNotify('version', severe ? 'fi-alert' : 'fi-flag', title, content);
      },

      error: function(title, content, userData) {
        return this.awesomeNotify('error', 'fi-x', title, content, userData);
      },

      success: function(title, content, userData) {
        return this.awesomeNotify('success', 'fi-check', title, content, userData);
      },

      warning: function(title, content, userData) {
        return this.awesomeNotify('warning', 'fi-alert', title, content, userData);
      },

      new: function(title, content, userData) {
        return this.awesomeNotify('warning', 'fi-plus', title, content, userData);
      },

      sent: function(title, content, userData) {
        return this.awesomeNotify('warning', 'icon-paperplane', title, content, userData);
      },

      awesomeNotify: function(type, icon, title, content, userData) {
        /**
         * Supposed to wrap the makeNotification method for drawing icons using font-awesome
         * rather than an image.
         *
         * Need to find out how I'm going to make the API take either an image
         * resource, or a font-awesome icon and then display either of them.
         * Also should probably provide some bits of color, could do the coloring
         * through classes.
         */
        // image = '<i class="icon-' + image + '"></i>';
        return this.makeNotification(type, false, icon, title, content, userData);
      },

      notify: function(image, title, content, userData) {
        // Wraps the makeNotification method for displaying notifications with images
        // rather than icons
        return this.makeNotification('custom', image, true, title, content, userData);
      },

      makeNotification: function(type, image, icon, title, content, userData) {
        var notification = {
          'type': type,
          'image': image,
          'icon': icon,
          'title': title,
          'content': content,
          'timestamp': +new Date(),
          'userData': userData
        };

        notifications.push(notification);

        if (settings.html5Mode) {
          html5Notify(image, title, content, function() {
            // inner on display function
          }, function() {
            // inner on close function
          });
        }

        //this is done because html5Notify() changes the variable settings.html5Mode
        if (!settings.html5Mode) {
          queue.push(notification);
          $timeout(function removeFromQueueTimeout() {
            queue.splice(queue.indexOf(notification), 1);
          }, settings[type].duration);
        }

        // Mobile notification
        if (window && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate([200, 100, 200]);
        };

        if (document.hidden && (type == 'info' || type == 'funds')) {
          new window.Notification(title, {
            body: content,
            icon: 'img/notification.png'
          });
        }

        this.save();
        return notification;
      },


      /* ============ PERSISTENCE METHODS ============ */

      save: function() {
        // Save all the notifications into localStorage
        if (settings.localStorage) {
          localStorage.setItem('notifications', JSON.stringify(notifications));
        }
      },

      restore: function() {
        // Load all notifications from localStorage
      },

      clear: function() {
        notifications = [];
        this.save();
      }

    };
  }
]).directive('notifications', function(notification, $compile) {
  /**
   *
   * It should also parse the arguments passed to it that specify
   * its position on the screen like "bottom right" and apply those
   * positions as a class to the container element
   *
   * Finally, the directive should have its own controller for
   * handling all of the notifications from the notification service
   */
  function link(scope, element, attrs) {
    var position = attrs.notifications;
    position = position.split(' ');
    element.addClass('dr-notification-container');
    for (var i = 0; i < position.length; i++) {
      element.addClass(position[i]);
    }
  }

  return {
    restrict: 'A',
    scope: {},
    templateUrl: 'views/includes/notifications.html',
    link: link,
    controller: ['$scope',
      function NotificationsCtrl($scope) {
        $scope.queue = notification.getQueue();

        $scope.removeNotification = function(noti) {
          $scope.queue.splice($scope.queue.indexOf(noti), 1);
        };
      }
    ]

  };
});

'use strict';
angular.module('copayApp.services')
  .factory('notificationService', function profileServiceFactory($filter, notification, lodash, configService, gettext) {

    var root = {};

    var groupingTime = 5000;
    var lastNotificationOnWallet = {};

    root.getLast = function(walletId) {
      var last = lastNotificationOnWallet[walletId];
      if (!last) return null;

      return Date.now() - last.ts < groupingTime ? last : null;
    };

    root.storeLast = function(notificationData, walletId) {

      if (notificationData.type == 'NewAddress')
        return;

      lastNotificationOnWallet[walletId] = {
        creatorId: notificationData.creatorId,
        type: notificationData.type,
        ts: Date.now(),
      };
    };

    root.shouldSkip = function(notificationData, last) {
      if (!last) return false;

      // rules...
      if (last.type === 'NewTxProposal'
          && notificationData.type === 'TxProposalAcceptedBy')
        return true;

      if (last.type === 'TxProposalFinallyAccepted'
          && notificationData.type === 'NewOutgoingTx')
        return true;

      if (last.type === 'TxProposalRejectedBy'
          && notificationData.type === 'TxProposalFinallyRejected')
        return true;

      return false;
    };


    root.newBWCNotification = function(notificationData, walletId, walletName) {
      var last = root.getLast(walletId);
      root.storeLast(notificationData, walletId);

      if (root.shouldSkip(notificationData, last))
        return;

      var config = configService.getSync();
      config.colorFor = config.colorFor || {};
      var color = config.colorFor[walletId] || '#7A8C9E';
      var name = config.aliasFor[walletId] || walletName;

      switch (notificationData.type) {
        case 'NewTxProposal':
          notification.new(gettext('New Payment Proposal'),
            name, {color: color} );
          break;
        case 'TxProposalAcceptedBy':
          notification.success(gettext('Payment Proposal Signed by Copayer'),
            name, {color: color} );
          break;
        case 'TxProposalRejectedBy':
          notification.error(gettext('Payment Proposal Rejected by Copayer'),
            name, {color: color} );
          break;
        case 'TxProposalFinallyRejected':
          notification.error(gettext('Payment Proposal Rejected'),
            name, {color: color} );
          break;
        case 'NewOutgoingTx':
          notification.sent(gettext('Payment Sent'),
            name, {color: color} );
          break;
        case 'NewIncomingTx':
          notification.funds(gettext('Funds received'),
            name, {color: color} );
          break;
        case 'ScanFinished':
          notification.success(gettext('Scan Finished'),
            name, {color: color} );
          break;

        case 'NewCopayer':
          // No UX notification
          break;
        case 'BalanceUpdated':
          // No UX notification
          break;
      }
    };

    return root;
  });

'use strict';
angular.module('copayApp.services')
  .factory('profileService', function profileServiceFactory($rootScope, $location, $timeout, $filter, $log, lodash, storageService, bwcService, configService, notificationService, isChromeApp, isCordova, gettext, gettextCatalog, nodeWebkit, bwsError, uxLanguage, ledger, bitcore, trezor) {

    var root = {};

    var FOREGROUND_UPDATE_PERIOD = 5;
    var BACKGROUND_UPDATE_PERIOD = 30;

    root.profile = null;
    root.focusedClient = null;
    root.walletClients = {};

    root.Utils = bwcService.getUtils();
    root.formatAmount = function(amount) {
      var config = configService.getSync().wallet.settings;
      if (config.unitCode == 'sat') return amount;

      //TODO : now only works for english, specify opts to change thousand separator and decimal separator
      return this.Utils.formatAmount(amount, config.unitCode);
    };

    root._setFocus = function(walletId, cb) {
      $log.debug('Set focus:', walletId);

      // Set local object
      if (walletId)
        root.focusedClient = root.walletClients[walletId];
      else
        root.focusedClient = [];

      if (lodash.isEmpty(root.focusedClient)) {
        root.focusedClient = root.walletClients[lodash.keys(root.walletClients)[0]];
      }

      // Still nothing?
      if (lodash.isEmpty(root.focusedClient)) {
        $rootScope.$emit('Local/NoWallets');
      } else {
        $rootScope.$emit('Local/NewFocusedWallet');

        // Set update period
        lodash.each(root.walletClients, function(client, id) {
          client.setNotificationsInterval(BACKGROUND_UPDATE_PERIOD);
        });
        root.focusedClient.setNotificationsInterval(FOREGROUND_UPDATE_PERIOD);
      }

      return cb();
    };

    root.setAndStoreFocus = function(walletId, cb) {
      root._setFocus(walletId, function() {
        storageService.storeFocusedWalletId(walletId, cb);
      });
    };

    root.setBaseURL = function(walletId) {
      var config = configService.getSync();
      var defaults = configService.getDefaults();

      bwcService.setBaseUrl((config.bwsFor && config.bwsFor[walletId]) || defaults.bws.url);
      bwcService.setTransports(['polling']);
    }

    root.setWalletClient = function(credentials) {
      if (root.walletClients[credentials.walletId] &&
        root.walletClients[credentials.walletId].started) {
        return;
      }

      root.setBaseURL(credentials.walletId);

      var client = bwcService.getClient(JSON.stringify(credentials));
      root.walletClients[credentials.walletId] = client;
      client.removeAllListeners();

      client.on('notification', function(n) {
        $log.debug('BWC Notification:', n);
        notificationService.newBWCNotification(n,
          client.credentials.walletId, client.credentials.walletName);

        if (root.focusedClient.credentials.walletId == client.credentials.walletId) {
          $rootScope.$emit(n.type, n);
        } else {
          $rootScope.$apply();
        }
      });

      client.on('walletCompleted', function() {
        $log.debug('Wallet completed');

        root.updateCredentialsFC(function() {
          $rootScope.$emit('Local/WalletCompleted')
        });

      });

      root.walletClients[credentials.walletId].started = true;
      root.walletClients[credentials.walletId].doNotVerifyPayPro = isChromeApp;

      client.initialize({}, function(err) {
        if (err) {
          $log.error('Could not init notifications err:', err);
          return;
        }
        client.setNotificationsInterval(BACKGROUND_UPDATE_PERIOD);
      });
    }

    root.setWalletClients = function() {
      var credentials = root.profile.credentials;
      lodash.each(credentials, function(credentials) {
        root.setWalletClient(credentials);
      });
      $rootScope.$emit('Local/WalletListUpdated');
    };

    root.bindProfile = function(profile, cb) {
      root.profile = profile;
      
      configService.get(function(err) {
        $log.debug('Preferences read');
        if (err) return cb(err);
        root.setWalletClients();
        storageService.getFocusedWalletId(function(err, focusedWalletId) {
          if (err) return cb(err);
          root._setFocus(focusedWalletId, function() {
            $rootScope.$emit('Local/ProfileBound');
            root.isDisclaimerAccepted(function(val) {
              if (!val) { 
                return cb(new Error('NONAGREEDDISCLAIMER: Non agreed disclaimer'));
              }
              else {
                return cb();
              }
            });
          });
        });
      });
        
    };

    root.loadAndBindProfile = function(cb) { 
      storageService.getProfile(function(err, profile) {
        if (err) {
          $rootScope.$emit('Local/DeviceError', err);
          return cb(err);
        }
        if (!profile) {
          // Migration??
          storageService.tryToMigrate(function(err, migratedProfile) {
            if (err) return cb(err);
            if (!migratedProfile)
              return cb(new Error('NOPROFILE: No profile'));

            profile = migratedProfile;
            return root.bindProfile(profile, cb);
          })
        } else {
          $log.debug('Profile read');
          return root.bindProfile(profile, cb);
        }
      });
    };

    root._seedWallet = function(opts, cb) {
      opts = opts || {};
      if (opts.bwsurl)
        bwcService.setBaseUrl(opts.bwsurl);

      var walletClient = bwcService.getClient();
      var network = opts.networkName || 'livenet';


      if (opts.mnemonic) {
        try {
          opts.mnemonic = root._normalizeMnemonic(opts.mnemonic);
          walletClient.seedFromMnemonic(opts.mnemonic, {
            network: network,
            passphrase: opts.passphrase,
            account: opts.account || 0,
            derivationStrategy: opts.derivationStrategy || 'BIP44',
          });

        } catch (ex) {
          $log.info(ex);
          return cb(gettext('Could not create: Invalid wallet seed'));
        }
      } else if (opts.extendedPrivateKey) {
        try {
          walletClient.seedFromExtendedPrivateKey(opts.extendedPrivateKey);
        } catch (ex) {
          $log.warn(ex);
          return cb(gettext('Could not create using the specified extended private key'));
        }
      } else if (opts.extendedPublicKey) {
        try {
          walletClient.seedFromExtendedPublicKey(opts.extendedPublicKey, opts.externalSource, opts.entropySource, {
            account: opts.account || 0,
            derivationStrategy: opts.derivationStrategy || 'BIP44',
          });
        } catch (ex) {
          $log.warn("Creating wallet from Extended Public Key Arg:", ex, opts);
          return cb(gettext('Could not create using the specified extended public key'));
        }
      } else {
        var lang = uxLanguage.getCurrentLanguage();
        try {
          walletClient.seedFromRandomWithMnemonic({
            network: network,
            passphrase: opts.passphrase,
            language: lang,
            account: 0,
          });
        } catch (e) {
          $log.info('Error creating seed: ' + e.message);
          if (e.message.indexOf('language') > 0) {
            $log.info('Using default language for mnemonic');
            walletClient.seedFromRandomWithMnemonic({
              network: network,
              passphrase: opts.passphrase,
              account: 0,
            });
          } else {
            return cb(e);
          }
        }
      }
      return cb(null, walletClient);
    };

    root._createNewProfile = function(opts, cb) {

      if (opts.noWallet) {
        return cb(null, Profile.create());
      }

      root._seedWallet({}, function(err, walletClient) {
        if (err) return cb(err);

        var walletName = gettextCatalog.getString('Personal Wallet');
        var me = gettextCatalog.getString('me');
        walletClient.createWallet(walletName, me, 1, 1, {
          network: 'livenet'
        }, function(err) {
          if (err) return bwsError.cb(err, gettext('Error creating wallet'), cb);
          var p = Profile.create({
            credentials: [JSON.parse(walletClient.export())],
          });
          return cb(null, p);
        });
      })
    };

    root.createWallet = function(opts, cb) {
      $log.debug('Creating Wallet:', opts);
      root._seedWallet(opts, function(err, walletClient) {
        if (err) return cb(err);

        walletClient.createWallet(opts.name, opts.myName || 'me', opts.m, opts.n, {
          network: opts.networkName
        }, function(err, secret) {
          if (err) return bwsError.cb(err, gettext('Error creating wallet'), cb);

          root._addWalletClient(walletClient, opts, cb);
        })
      });
    };

    root.joinWallet = function(opts, cb) {
      var walletClient = bwcService.getClient();
      $log.debug('Joining Wallet:', opts);

      try {
        var walletData = bwcService.parseSecret(opts.secret);

        // check if exist
        if (lodash.find(root.profile.credentials, {
            'walletId': walletData.walletId
          })) {
          return cb(gettext('Cannot join the same wallet more that once'));
        }
      } catch (ex) {
        $log.debug(ex);
        return cb(gettext('Bad wallet invitation'));
      }
      opts.networkName = walletData.network;
      $log.debug('Joining Wallet:', opts);

      root._seedWallet(opts, function(err, walletClient) {
        if (err) return cb(err);

        walletClient.joinWallet(opts.secret, opts.myName || 'me', {}, function(err) {
          if (err) return bwsError.cb(err, gettext('Could not join wallet'), cb);
          root._addWalletClient(walletClient, opts, cb);
        });
      });
    };

    root.getClient = function(walletId) {
      return root.walletClients[walletId];
    };

    root.deleteWalletFC = function(opts, cb) {
      var fc = root.focusedClient;
      var walletId = fc.credentials.walletId;
      $log.debug('Deleting Wallet:', fc.credentials.walletName);

      fc.removeAllListeners();
      root.profile.credentials = lodash.reject(root.profile.credentials, {
        walletId: walletId
      });

      delete root.walletClients[walletId];
      root.focusedClient = null;

      storageService.clearLastAddress(walletId, function(err) {
        if (err) $log.warn(err);
      });

      storageService.removeTxHistory(walletId, function(err) {
        if (err) $log.warn(err);
      });

      storageService.clearBackupFlag(walletId, function(err) {
        if (err) $log.warn(err);
      });

      $timeout(function() {
        root.setWalletClients();
        root.setAndStoreFocus(null, function() {
          storageService.storeProfile(root.profile, function(err) {
            if (err) return cb(err);
            return cb();
          });
        });
      });
    };

    root.setMetaData = function(walletClient, addressBook, historyCache, cb) {
      storageService.getAddressbook(walletClient.credentials.network, function(err, localAddressBook) {
        var localAddressBook1 = {};
        try {
          localAddressBook1 = JSON.parse(localAddressBook);
        } catch (ex) {
          $log.warn(ex);
        }
        var mergeAddressBook = lodash.merge(addressBook, localAddressBook1);
        storageService.setAddressbook(walletClient.credentials.network, JSON.stringify(addressBook), function(err) {
          if (err) return cb(err);
          storageService.setTxHistory(JSON.stringify(historyCache), walletClient.credentials.walletId, function(err) {
            if (err) return cb(err);
            return cb(null);
          });
        });
      });
    }

    root._addWalletClient = function(walletClient, opts, cb) {
      var walletId = walletClient.credentials.walletId;

      // check if exist
      var w = lodash.find(root.profile.credentials, {
        'walletId': walletId
      });
      if (w) {
        return cb(gettext('Wallet already in Copay' + ": ") + w.walletName);
      }

      var defaults = configService.getDefaults();
      var bwsFor = {};
      bwsFor[walletId] = opts.bwsurl || defaults.bws.url;

      configService.set({
        bwsFor: bwsFor,
      }, function(err) {
        if (err) console.log(err);

        root.profile.credentials.push(JSON.parse(walletClient.export()));
        root.setWalletClients();


        var handleImport = function(cb) {
          var isImport = opts.mnemonic || opts.externalSource || opts.extendedPrivateKey;

          if (!isImport)
            return cb();

          $rootScope.$emit('Local/BackupDone', walletId);

          if (!walletClient.isComplete())
            return cb();

          storageService.setCleanAndScanAddresses(walletId, cb);
        };

        handleImport(function() {
          root.setAndStoreFocus(walletId, function() {
            storageService.storeProfile(root.profile, function(err) {
              return cb(err, walletId);
            });
          });
        });
      });
    };

    root.importWallet = function(str, opts, cb) {
      if (opts.bwsurl)
        bwcService.setBaseUrl(opts.bwsurl);

      var walletClient = bwcService.getClient();

      $log.debug('Importing Wallet:', opts);
      try {
        walletClient.import(str, {
          compressed: opts.compressed,
          password: opts.password
        });
      } catch (err) {
        return cb(gettext('Could not import. Check input file and password'));
      }

      str = JSON.parse(str);

      var addressBook = str.addressBook || {};
      var historyCache = str.historyCache ||  [];

      root._addWalletClient(walletClient, opts, function(err, walletId) {
        if (err) return cb(err);
        root.setMetaData(walletClient, addressBook, historyCache, function(error) {
          if (error) console.log(error);
          return cb(err, walletId);
        });
      });
    };

    root.importExtendedPrivateKey = function(xPrivKey, opts, cb) {
      if (opts.bwsurl)
        bwcService.setBaseUrl(opts.bwsurl);

      var walletClient = bwcService.getClient();
      $log.debug('Importing Wallet xPrivKey');

      walletClient.importFromExtendedPrivateKey(xPrivKey, function(err) {
        if (err)
          return bwsError.cb(err, gettext('Could not import'), cb);

        root._addWalletClient(walletClient, opts, cb);
      });
    };

    root._normalizeMnemonic = function(words) {
      var isJA = words.indexOf('\u3000') > -1;
      var wordList = words.split(/[\u3000\s]+/);

      return wordList.join(isJA ? '\u3000' : ' ');
    };

    root.importMnemonic = function(words, opts, cb) {
      if (opts.bwsurl)
        bwcService.setBaseUrl(opts.bwsurl);

      var walletClient = bwcService.getClient();

      $log.debug('Importing Wallet Mnemonic');

      words = root._normalizeMnemonic(words);
      walletClient.importFromMnemonic(words, {
        network: opts.networkName,
        passphrase: opts.passphrase,
        account: opts.account || 0,
      }, function(err) {
        if (err)
          return bwsError.cb(err, gettext('Could not import'), cb);

        root._addWalletClient(walletClient, opts, cb);
      });
    };

    root.importExtendedPublicKey = function(opts, cb) {
      if (opts.bwsurl)
        bwcService.setBaseUrl(opts.bwsurl);

      var walletClient = bwcService.getClient();
      $log.debug('Importing Wallet XPubKey');

      walletClient.importFromExtendedPublicKey(opts.extendedPublicKey, opts.externalSource, opts.entropySource, {
        account: opts.account || 0,
        derivationStrategy: opts.derivationStrategy || 'BIP44',
      }, function(err) {
        if (err) {

          // in HW wallets, req key is always the same. They can't addAccess.
          if (err.code == 'NOT_AUTHORIZED')
            err.code = 'WALLET_DOES_NOT_EXIST';

          return bwsError.cb(err, gettext('Could not import'), cb);
        }

        root._addWalletClient(walletClient, opts, cb);
      });
    };

    root.create = function(opts, cb) {
      $log.info('Creating profile');
      var defaults = configService.getDefaults();

      configService.get(function(err) {
        bwcService.setBaseUrl(defaults.bws.url);
        bwcService.setTransports(['polling']);
        root._createNewProfile(opts, function(err, p) {
          if (err) return cb(err);

          root.bindProfile(p, function(err) {
            storageService.storeNewProfile(p, function(err) {
              return cb(err);
            });
          });
        });
      });
    };

    root.setDisclaimerAccepted = function(cb) {
      storageService.getProfile(function(err, profile) {
        profile.disclaimerAccepted = true;
        storageService.storeProfile(profile, function(err) {
          return cb(err);
        });
      });
    };

    root.isDisclaimerAccepted = function(cb) {
      storageService.getProfile(function(err, profile) {
        if (profile && profile.disclaimerAccepted)
          return cb(true);
        else if (profile && !profile.disclaimerAccepted) {
          storageService.getCopayDisclaimerFlag(function(err, val) {
            if (val) {
              profile.disclaimerAccepted = true;
              storageService.storeProfile(profile, function(err) {
                if (err) $log.error(err);
                return cb(true);
              });
            }
            else {
              return cb();
            }
          });
        }
        else {
          return cb();
        }
      });   
    };

    root.importLegacyWallet = function(username, password, blob, cb) {
      var walletClient = bwcService.getClient();

      walletClient.createWalletFromOldCopay(username, password, blob, function(err, existed) {
        if (err) return cb(gettext('Error importing wallet: ') + err);

        if (root.walletClients[walletClient.credentials.walletId]) {
          $log.debug('Wallet:' + walletClient.credentials.walletName + ' already imported');
          return cb(gettext('Wallet Already Imported: ') + walletClient.credentials.walletName);
        };

        $log.debug('Creating Wallet:', walletClient.credentials.walletName);
        root.profile.credentials.push(JSON.parse(walletClient.export()));
        root.setWalletClients();
        root.setAndStoreFocus(walletClient.credentials.walletId, function() {
          storageService.storeProfile(root.profile, function(err) {
            return cb(null, walletClient.credentials.walletId, walletClient.credentials.walletName, existed);
          });
        });
      });
    };

    root.updateCredentialsFC = function(cb) {
      var fc = root.focusedClient;

      var newCredentials = lodash.reject(root.profile.credentials, {
        walletId: fc.credentials.walletId
      });
      newCredentials.push(JSON.parse(fc.export()));
      root.profile.credentials = newCredentials;

      storageService.storeProfile(root.profile, cb);
    };


    root.setPrivateKeyEncryptionFC = function(password, cb) {
      var fc = root.focusedClient;
      $log.debug('Encrypting private key for', fc.credentials.walletName);

      fc.setPrivateKeyEncryption(password);
      root.lockFC();
      root.updateCredentialsFC(function() {
        $log.debug('Wallet encrypted');
        return cb();
      });
    };


    root.disablePrivateKeyEncryptionFC = function(cb) {
      var fc = root.focusedClient;
      $log.debug('Disabling private key encryption for', fc.credentials.walletName);

      try {
        fc.disablePrivateKeyEncryption();
      } catch (e) {
        return cb(e);
      }
      root.updateCredentialsFC(function() {
        $log.debug('Wallet encryption disabled');
        return cb();
      });
    };

    root.lockFC = function() {
      var fc = root.focusedClient;
      try {
        fc.lock();
      } catch (e) {};
    };

    root.unlockFC = function(cb) {
      var fc = root.focusedClient;
      $log.debug('Wallet is encrypted');
      $rootScope.$emit('Local/NeedsPassword', false, function(err2, password) {
        if (err2 || !password) {
          return cb({
            message: (err2 || gettext('Password needed'))
          });
        }
        try {
          fc.unlock(password);
        } catch (e) {
          $log.debug(e);
          return cb({
            message: gettext('Wrong password')
          });
        }
        $timeout(function() {
          if (fc.hasPrivKeyEncrypted()) {
            $log.debug('Locking wallet automatically');
            root.lockFC();
          };
        }, 2000);
        return cb();
      });
    };

    root.getWallets = function(network) {
      if (!root.profile) return [];

      var config = configService.getSync();
      config.colorFor = config.colorFor || {};
      config.aliasFor = config.aliasFor || {};
      var ret = lodash.map(root.profile.credentials, function(c) {
        return {
          m: c.m,
          n: c.n,
          name: config.aliasFor[c.walletId] || c.walletName,
          id: c.walletId,
          network: c.network,
          color: config.colorFor[c.walletId] || '#4A90E2'
        };
      });
      ret = lodash.filter(ret, function(w) {
        return (w.network == network);
      });
      return lodash.sortBy(ret, 'name');
    };

    root._signWithLedger = function(txp, cb) {
      var fc = root.focusedClient;
      $log.info('Requesting Ledger Chrome app to sign the transaction');

      ledger.signTx(txp, fc.credentials.account, function(result) {
        $log.debug('Ledger response', result);
        if (!result.success)
          return cb(result.message || result.error);

        txp.signatures = lodash.map(result.signatures, function(s) {
          return s.substring(0, s.length - 2);
        });
        return fc.signTxProposal(txp, cb);
      });
    };


    root._signWithTrezor = function(txp, cb) {
      var fc = root.focusedClient;
      $log.info('Requesting Trezor  to sign the transaction');

      var xPubKeys = lodash.pluck(fc.credentials.publicKeyRing, 'xPubKey');
      trezor.signTx(xPubKeys, txp, fc.credentials.account, function(err, result) {
        if (err) return cb(err);

        $log.debug('Trezor response', result);
        txp.signatures = result.signatures;
        return fc.signTxProposal(txp, cb);
      });
    };


    root.signTxProposal = function(txp, cb) {
      var fc = root.focusedClient;

      if (fc.isPrivKeyExternal()) {
        switch (fc.getPrivKeyExternalSourceName()) {
          case 'ledger':
            return root._signWithLedger(txp, cb);
          case 'trezor':
            return root._signWithTrezor(txp, cb);
          default:
            var msg = 'Unsupported External Key:' + fc.getPrivKeyExternalSourceName();
            $log.error(msg);
            return cb(msg);
        }
      } else {
        return fc.signTxProposal(txp, function(err, signedTxp) {
          root.lockFC();
          return cb(err, signedTxp);
        });
      }
    };

    return root;
  });

'use strict';
angular.module('copayApp.services')
  .factory('sjcl', function bitcoreFactory(bwcService) {
    var sjcl = bwcService.getSJCL();
    return sjcl;
  });

'use strict';
angular.module('copayApp.services')
  .factory('storageService', function(logHeader, fileStorageService, localStorageService, sjcl, $log, lodash, isCordova) {

    var root = {};

    // File storage is not supported for writting according to 
    // https://github.com/apache/cordova-plugin-file/#supported-platforms
    var shouldUseFileStorage = isCordova && !isMobile.Windows();
    $log.debug('Using file storage:', shouldUseFileStorage);


    var storage = shouldUseFileStorage ? fileStorageService : localStorageService;

    var getUUID = function(cb) {
      // TO SIMULATE MOBILE
      //return cb('hola');
      if (!window || !window.plugins || !window.plugins.uniqueDeviceID)
        return cb(null);

      window.plugins.uniqueDeviceID.get(
        function(uuid) {
          return cb(uuid);
        }, cb);
    };

    var encryptOnMobile = function(text, cb) {

      // UUID encryption is disabled.
      return cb(null, text);
      //
      // getUUID(function(uuid) {
      //   if (uuid) {
      //     $log.debug('Encrypting profile');
      //     text = sjcl.encrypt(uuid, text);
      //   }
      //   return cb(null, text);
      // });
    };


    var decryptOnMobile = function(text, cb) {
      var json;
      try {
        json = JSON.parse(text);
      } catch (e) {};

      if (!json) return cb('Could not access storage')

      if (!json.iter || !json.ct) {
        $log.debug('Profile is not encrypted');
        return cb(null, text);
      }

      $log.debug('Profile is encrypted');
      getUUID(function(uuid) {
        $log.debug('Device UUID:' + uuid);
        if (!uuid)
          return cb('Could not decrypt storage: could not get device ID');

        try {
          text = sjcl.decrypt(uuid, text);

          $log.info('Migrating to unencrypted profile');
          return storage.set('profile', text, function(err) {
            return cb(err, text);
          });
        } catch (e) {
          $log.warn('Decrypt error: ', e);
          return cb('Could not decrypt storage: device ID mismatch');
        };
        return cb(null, text);
      });
    };



    root.tryToMigrate = function(cb) {
      if (!shouldUseFileStorage) return cb();

      localStorageService.get('profile', function(err, str) {
        if (err) return cb(err);
        if (!str) return cb();

        $log.info('Starting Migration profile to File storage...');

        fileStorageService.create('profile', str, function(err) {
          if (err) cb(err);
          $log.info('Profile Migrated successfully');

          localStorageService.get('config', function(err, c) {
            if (err) return cb(err);
            if (!c) return root.getProfile(cb);

            fileStorageService.create('config', c, function(err) {

              if (err) {
                $log.info('Error migrating config: ignoring', err);
                return root.getProfile(cb);
              }
              $log.info('Config Migrated successfully');
              return root.getProfile(cb);
            });
          });
        });
      });
    };

    root.storeNewProfile = function(profile, cb) {
      encryptOnMobile(profile.toObj(), function(err, x) {
        storage.create('profile', x, cb);
      });
    };

    root.storeProfile = function(profile, cb) {
      encryptOnMobile(profile.toObj(), function(err, x) {
        storage.set('profile', x, cb);
      });
    };

    root.getProfile = function(cb) {
      storage.get('profile', function(err, str) {
        if (err || !str)
          return cb(err);

        decryptOnMobile(str, function(err, str) {
          if (err) return cb(err);
          var p, err;
          try {
            p = Profile.fromString(str);
          } catch (e) {
            $log.debug('Could not read profile:', e);
            err = new Error('Could not read profile:' + p);
          }
          return cb(err, p);
        });
      });
    };

    root.deleteProfile = function(cb) {
      storage.remove('profile', cb);
    };

    root.storeFocusedWalletId = function(id, cb) {
      storage.set('focusedWalletId', id || '', cb);
    };

    root.getFocusedWalletId = function(cb) {
      storage.get('focusedWalletId', cb);
    };

    root.getLastAddress = function(walletId, cb) {
      storage.get('lastAddress-' + walletId, cb);
    };

    root.storeLastAddress = function(walletId, address, cb) {
      storage.set('lastAddress-' + walletId, address, cb);
    };

    root.clearLastAddress = function(walletId, cb) {
      storage.remove('lastAddress-' + walletId, cb);
    };

    root.setBackupFlag = function(walletId, cb) {
      storage.set('backup-' + walletId, Date.now(), cb);
    };

    root.getBackupFlag = function(walletId, cb) {
      storage.get('backup-' + walletId, cb);
    };

    root.clearBackupFlag = function(walletId, cb) {
      storage.remove('backup-' + walletId, cb);
    };

    root.setCleanAndScanAddresses = function(walletId, cb) {
      storage.set('CleanAndScanAddresses', walletId, cb);
    };

    root.getCleanAndScanAddresses = function(cb) {
      storage.get('CleanAndScanAddresses', cb);
    };

    root.removeCleanAndScanAddresses = function(cb) {
      storage.remove('CleanAndScanAddresses', cb);
    };

    root.getConfig = function(cb) {
      storage.get('config', cb);
    };

    root.storeConfig = function(val, cb) {
      $log.debug('Storing Preferences', val);
      storage.set('config', val, cb);
    };

    root.clearConfig = function(cb) {
      storage.remove('config', cb);
    };

    //for compatibility
    root.getCopayDisclaimerFlag = function(cb) {
      storage.get('agreeDisclaimer', cb);
    };

    root.setRemotePrefsStoredFlag = function(cb) {
      storage.set('remotePrefStored', true, cb);
    };

    root.getRemotePrefsStoredFlag = function(cb) {
      storage.get('remotePrefStored', cb);
    };

    root.setGlideraToken = function(network, token, cb) {
      storage.set('glideraToken-' + network, token, cb);
    };

    root.getGlideraToken = function(network, cb) {
      storage.get('glideraToken-' + network, cb);
    };

    root.removeGlideraToken = function(network, cb) {
      storage.remove('glideraToken-' + network, cb);
    };

    root.setAddressbook = function(network, addressbook, cb) {
      storage.set('addressbook-' + network, addressbook, cb);
    };

    root.getAddressbook = function(network, cb) {
      storage.get('addressbook-' + network, cb);
    };

    root.removeAddressbook = function(network, cb) {
      storage.remove('addressbook-' + network, cb);
    };

    root.setTxHistory = function(txs, walletId, cb) {
      storage.set('txsHistory-' + walletId, txs, cb);
    }

    root.getTxHistory = function(walletId, cb) {
      storage.get('txsHistory-' + walletId, cb);
    }

    root.removeTxHistory = function(walletId, cb) {
      storage.remove('txsHistory-' + walletId, cb);
    }

    return root;
  });

'use strict';

/*  
 * This is a modification from https://github.com/angular/angular.js/blob/master/src/ngTouch/swipe.js
 */


angular.module('copayApp.services')
  .factory('$swipe', [
  function() {
    // The total distance in any direction before we make the call on swipe vs. scroll.
    var MOVE_BUFFER_RADIUS = 10;

    var POINTER_EVENTS = {
      'touch': {
        start: 'touchstart',
        move: 'touchmove',
        end: 'touchend',
        cancel: 'touchcancel'
      }
    };

    function getCoordinates(event) {
      var originalEvent = event.originalEvent || event;
      var touches = originalEvent.touches && originalEvent.touches.length ? originalEvent.touches : [originalEvent];
      var e = (originalEvent.changedTouches && originalEvent.changedTouches[0]) || touches[0];

      return {
        x: e.clientX,
        y: e.clientY
      };
    }

    function getEvents(pointerTypes, eventType) {
      var res = [];
      angular.forEach(pointerTypes, function(pointerType) {
        var eventName = POINTER_EVENTS[pointerType][eventType];
        if (eventName) {
          res.push(eventName);
        }
      });
      return res.join(' ');
    }

    return {
      /**
       * @ngdoc method
       * @name $swipe#bind
       *
       * @description
       * The main method of `$swipe`. It takes an element to be watched for swipe motions, and an
       * object containing event handlers.
       * The pointer types that should be used can be specified via the optional
       * third argument, which is an array of strings `'mouse'` and `'touch'`. By default,
       * `$swipe` will listen for `mouse` and `touch` events.
       *
       * The four events are `start`, `move`, `end`, and `cancel`. `start`, `move`, and `end`
       * receive as a parameter a coordinates object of the form `{ x: 150, y: 310 }`.
       *
       * `start` is called on either `mousedown` or `touchstart`. After this event, `$swipe` is
       * watching for `touchmove` or `mousemove` events. These events are ignored until the total
       * distance moved in either dimension exceeds a small threshold.
       *
       * Once this threshold is exceeded, either the horizontal or vertical delta is greater.
       * - If the horizontal distance is greater, this is a swipe and `move` and `end` events follow.
       * - If the vertical distance is greater, this is a scroll, and we let the browser take over.
       *   A `cancel` event is sent.
       *
       * `move` is called on `mousemove` and `touchmove` after the above logic has determined that
       * a swipe is in progress.
       *
       * `end` is called when a swipe is successfully completed with a `touchend` or `mouseup`.
       *
       * `cancel` is called either on a `touchcancel` from the browser, or when we begin scrolling
       * as described above.
       *
       */
      bind: function(element, eventHandlers, pointerTypes) {
        // Absolute total movement, used to control swipe vs. scroll.
        var totalX, totalY;
        // Coordinates of the start position.
        var startCoords;
        // Last event's position.
        var lastPos;
        // Whether a swipe is active.
        var active = false;

        pointerTypes = pointerTypes || ['touch'];
        element.on(getEvents(pointerTypes, 'start'), function(event) {
          startCoords = getCoordinates(event);
          active = true;
          totalX = 0;
          totalY = 0;
          lastPos = startCoords;
          eventHandlers['start'] && eventHandlers['start'](startCoords, event);
        });
        var events = getEvents(pointerTypes, 'cancel');
        if (events) {
          element.on(events, function(event) {
            active = false;
            eventHandlers['cancel'] && eventHandlers['cancel'](event);
          });
        }

        element.on(getEvents(pointerTypes, 'move'), function(event) {
          if (!active) return;

          // Android will send a touchcancel if it thinks we're starting to scroll.
          // So when the total distance (+ or - or both) exceeds 10px in either direction,
          // we either:
          // - On totalX > totalY, we send preventDefault() and treat this as a swipe.
          // - On totalY > totalX, we let the browser handle it as a scroll.

          if (!startCoords) return;
          var coords = getCoordinates(event);

          totalX += Math.abs(coords.x - lastPos.x);
          totalY += Math.abs(coords.y - lastPos.y);

          lastPos = coords;

          if (totalX < MOVE_BUFFER_RADIUS && totalY < MOVE_BUFFER_RADIUS) {
            return;
          }

          // One of totalX or totalY has exceeded the buffer, so decide on swipe vs. scroll.
          if (totalY > totalX) {
            // Allow native scrolling to take over.
            active = false;
            eventHandlers['cancel'] && eventHandlers['cancel'](event);
            return;
          } else {

            // Prevent the browser from scrolling.
            event.preventDefault();
            eventHandlers['move'] && eventHandlers['move'](coords, event);
          }
        });

        element.on(getEvents(pointerTypes, 'end'), function(event) {
          if (!active) return;
          active = false;
          eventHandlers['end'] && eventHandlers['end'](getCoordinates(event), event);
        });
      }
    };
  }
]);



'use strict';

angular.module('copayApp.services')
  .factory('trezor', function($log, $timeout, gettext, lodash, bitcore, hwWallet) {
    var root = {};

    var SETTLE_TIME = 3000;
    root.callbacks = {};

    root.getEntropySource = function(isMultisig, account, callback) {
      root.getXPubKey(hwWallet.getEntropyPath('trezor', isMultisig, account), function(data) {
        if (!data.success) 
          return callback(hwWallet._err(data));
        
        return callback(null,  hwWallet.pubKeyToEntropySource(data.xpubkey));
      });
    };


    root.getXPubKey = function(path, callback) {
      $log.debug('TREZOR deriving xPub path:', path);
      TrezorConnect.getXPubKey(path, callback);
    };


    root.getInfoForNewWallet = function(isMultisig, account, callback) {
      var opts = {};
      root.getEntropySource(isMultisig, account, function(err, data) {
        if (err) return callback(err);
        opts.entropySource = data;
        $log.debug('Waiting TREZOR to settle...');
        $timeout(function() {

          root.getXPubKey(hwWallet.getAddressPath('trezor', isMultisig, account), function(data) {
            if (!data.success)
              return callback(hwWallet._err(data));

            opts.extendedPublicKey = data.xpubkey;
            opts.externalSource = 'trezor';
            opts.account = account;

            if (isMultisig)
              opts.derivationStrategy = 'BIP48';

            return callback(null, opts);
          });
        }, SETTLE_TIME);
      });
    };

    root._orderPubKeys = function(xPub, np) {
      var xPubKeys = lodash.clone(xPub);
      var path = lodash.clone(np);
      path.unshift('m');
      path = path.join('/');

      var keys = lodash.map(xPubKeys, function(x) {
        var pub = (new bitcore.HDPublicKey(x)).derive(path).publicKey;
        return {
          xpub: x,
          pub: pub.toString('hex'),
        };
      });

      var sorted = lodash.sortBy(keys, function(x) {
        return x.pub;
      });

      return lodash.pluck(sorted, 'xpub');
    };

    root.signTx = function(xPubKeys, txp, account, callback) {

      var inputs = [],
        outputs = [];
      var tmpOutputs = [];

      if (txp.type != 'simple')
        return callback('Only TXPs type SIMPLE are supported in TREZOR');

      var toScriptType = 'PAYTOADDRESS';
      if (txp.toAddress.charAt(0) == '2' || txp.toAddress.charAt(0) == '3')
        toScriptType = 'PAYTOSCRIPTHASH';


      // Add to
      tmpOutputs.push({
        address: txp.toAddress,
        amount: txp.amount,
        script_type: toScriptType,
      });



      if (txp.addressType == 'P2PKH') {

        $log.debug("Trezor signing uni-sig p2pkh. Account:", account);

        var inAmount = 0;
        inputs = lodash.map(txp.inputs, function(i) {
          $log.debug("Trezor TX input path:", i.path);
          var pathArr = i.path.split('/');
          var n = [hwWallet.UNISIG_ROOTPATH | 0x80000000, 0 | 0x80000000, account | 0x80000000, parseInt(pathArr[1]), parseInt(pathArr[2])];
          inAmount += i.satoshis;
          return {
            address_n: n,
            prev_index: i.vout,
            prev_hash: i.txid,
          };
        });

        var change = inAmount - txp.fee - txp.amount;
        if (change > 0) {
          $log.debug("Trezor TX change path:", txp.changeAddress.path);
          var pathArr = txp.changeAddress.path.split('/');
          var n = [hwWallet.UNISIG_ROOTPATH | 0x80000000, 0 | 0x80000000, account | 0x80000000, parseInt(pathArr[1]), parseInt(pathArr[2])];

          tmpOutputs.push({
            address_n: n,
            amount: change,
            script_type: 'PAYTOADDRESS'
          });
        }

      } else {

        // P2SH Wallet, multisig wallet
        var inAmount = 0;
        $log.debug("Trezor signing multi-sig p2sh. Account:", account);

        var sigs = xPubKeys.map(function(v) {
          return '';
        });


        inputs = lodash.map(txp.inputs, function(i) {
          $log.debug("Trezor TX input path:", i.path);
          var pathArr = i.path.split('/');
          var n = [hwWallet.MULTISIG_ROOTPATH | 0x80000000, 0 | 0x80000000, account | 0x80000000, parseInt(pathArr[1]), parseInt(pathArr[2])];
          var np = n.slice(3);

          inAmount += i.satoshis;

          var orderedPubKeys = root._orderPubKeys(xPubKeys, np);
          var pubkeys = lodash(orderedPubKeys.map(function(v) {
            return {
              node: v,
              address_n: np,
            };
          }));

          return {
            address_n: n,
            prev_index: i.vout,
            prev_hash: i.txid,
            script_type: 'SPENDMULTISIG',
            multisig: {
              pubkeys: pubkeys,
              signatures: sigs,
              m: txp.requiredSignatures,
            }
          };
        });

        var change = inAmount - txp.fee - txp.amount;
        if (change > 0) {
          $log.debug("Trezor TX change path:", txp.changeAddress.path);
          var pathArr = txp.changeAddress.path.split('/');
          var n = [hwWallet.MULTISIG_ROOTPATH | 0x80000000, 0 | 0x80000000, account | 0x80000000, parseInt(pathArr[1]), parseInt(pathArr[2])];
          var np = n.slice(3);

          var orderedPubKeys = root._orderPubKeys(xPubKeys, np);
          var pubkeys = lodash(orderedPubKeys.map(function(v) {
            return {
              node: v,
              address_n: np,
            };
          }));

          tmpOutputs.push({
            address_n: n,
            amount: change,
            script_type: 'PAYTOMULTISIG',
            multisig: {
              pubkeys: pubkeys,
              signatures: sigs,
              m: txp.requiredSignatures,
            }
          });
        }
      }

      // Shuffle outputs for improved privacy
      if (tmpOutputs.length > 1) {
        outputs = new Array(tmpOutputs.length);
        lodash.each(txp.outputOrder, function(order) {
          outputs[order] = tmpOutputs.shift();
        });

        if (tmpOutputs.length)
          return cb("Error creating transaction: tmpOutput order");
      } else {
        outputs = tmpOutputs;
      }

      // Prevents: Uncaught DataCloneError: Failed to execute 'postMessage' on 'Window': An object could not be cloned.
      inputs = JSON.parse(JSON.stringify(inputs));
      outputs = JSON.parse(JSON.stringify(outputs));

      $log.debug('Signing with TREZOR', inputs, outputs);
      TrezorConnect.signTx(inputs, outputs, function(res) {
        if (!res.success)
          return callback(hwWallet._err(res));

        callback(null, res);
      });
    };

    return root;
  });

'use strict';

angular.module('copayApp.services').factory('txFormatService', function(profileService, rateService, configService, lodash) {
  var root = {};

  var formatAmountStr = function(amount) {
    if (!amount) return;
    var config = configService.getSync().wallet.settings;
    return profileService.formatAmount(amount) + ' ' + config.unitName;
  };

  var formatAlternativeStr = function(amount) {
    if (!amount) return;
    var config = configService.getSync().wallet.settings;
    return (rateService.toFiat(amount, config.alternativeIsoCode) ? rateService.toFiat(amount, config.alternativeIsoCode).toFixed(2) : 'N/A') + ' ' + config.alternativeIsoCode;
  };

  var formatFeeStr = function(fee) {
    if (!fee) return;
    var config = configService.getSync().wallet.settings;
    return profileService.formatAmount(fee) + ' ' + config.unitName;
  };

  root.processTx = function(tx) {
    if (!tx) return; 

    var outputs = lodash.isArray(tx.outputs) ? tx.outputs.length : 0;
    if (outputs && tx.action != 'received') {
      if ((tx.type && tx.type == 'multiple_output') || (tx.proposalType && tx.proposalType == 'multiple_output')) {
        tx.hasMultiplesOutputs = true;
        tx.recipientCount = outputs;
      }
      tx.amount = lodash.reduce(tx.outputs, function(total, o) {
        o.amountStr = formatAmountStr(o.amount);
        o.alternativeAmountStr = formatAlternativeStr(o.amount);
        return total + o.amount;
      }, 0);
    }

    tx.amountStr = formatAmountStr(tx.amount);
    tx.alternativeAmountStr = formatAlternativeStr(tx.amount);
    tx.feeStr = formatFeeStr(tx.fee || tx.fees);

    return tx;
  };

  return root;
});

'use strict';

angular.module('copayApp.services').factory('txStatus', function($modal, lodash, profileService, $timeout, txFormatService, isCordova) {
  var root = {};

  root.notify = function(txp, cb) {
    var fc = profileService.focusedClient;
    var status = txp.status;
    var type;
    var INMEDIATE_SECS = 10;

    if (status == 'broadcasted') {
      type = 'broadcasted';
    } else {

      var n = txp.actions.length;
      var action = lodash.find(txp.actions, {
        copayerId: fc.credentials.copayerId
      });

      if (!action)  {
        type = 'created';
      } else if (action.type == 'accept') {
        // created and accepted at the same time?
        if ( n == 1 && action.createdOn - txp.createdOn < INMEDIATE_SECS ) {
          type = 'created';
        } else {
          type = 'accepted';
        }
      } else if (action.type == 'reject') {
        type = 'rejected';
      } else {
        throw new Error('Unknown type:' + type);
      }
    }

    openModal(type, txp, cb);
  };

  root._templateUrl = function(type, txp) {
    return 'views/modals/tx-status.html';
  };

  var openModal = function(type, txp, cb) {
    var fc = profileService.focusedClient;
    var ModalInstanceCtrl = function($scope, $modalInstance) {
      $scope.type = type;
      $scope.tx = txFormatService.processTx(txp);
      $scope.color = fc.backgroundColor;
      if (isCordova && StatusBar.isVisible) {
        StatusBar.hide();
      }
      $scope.cancel = function() {
        $modalInstance.dismiss('cancel');
      };
      if (cb) $timeout(cb, 100);
    };
    var modalInstance = $modal.open({
      templateUrl: root._templateUrl(type, txp),
      windowClass: 'popup-tx-status full',
      controller: ModalInstanceCtrl,
    });

    modalInstance.result.finally(function() {
      if (isCordova && !StatusBar.isVisible) {
        StatusBar.show();
      }
      var m = angular.element(document.getElementsByClassName('reveal-modal'));
      m.addClass('hideModal');
    });
  };

  return root;
});

'use strict';

var UriHandler = function() {};

UriHandler.prototype.register = function() {
  var base = window.location.origin + '/';
  var url = base + '#/uri-payment/%s';

  if(navigator.registerProtocolHandler) {
    //navigator.registerProtocolHandler('bitcoin', url, 'Copay');
  }
};

angular.module('copayApp.services').value('uriHandler', new UriHandler());

'use strict';
angular.module('copayApp.services')
  .factory('uxLanguage', function languageService($log, lodash, gettextCatalog, amMoment, configService) {
    var root = {};

    root.availableLanguages = [{
      name: 'English',
      isoCode: 'en',
    }, {
      name: 'Français',
      isoCode: 'fr',
    }, {
      name: 'Deutsch',
      isoCode: 'de',
    }, {
      name: 'Español',
      isoCode: 'es',
    }, {
      name: '日本語',
      isoCode: 'ja',
      useIdeograms: true,
    }, {
      name: 'Pусский',
      isoCode: 'ru',
    }];

    root.currentLanguage = null;

    root._detect = function(cb) {

      var userLang, androidLang;
      if (navigator && navigator.globalization) {

        navigator.globalization.getPreferredLanguage(function(preferedLanguage) {
          // works for iOS and Android 4.x
          userLang = preferedLanguage.value;
          userLang = userLang ? (userLang.split('-', 1)[0] || 'en') : 'en';
          // Set only available languages
          userLang = root.isAvailableLanguage(userLang);
          return cb(userLang);
        });
      } else {
        // Auto-detect browser language
        userLang = navigator.userLanguage || navigator.language;
        userLang = userLang ? (userLang.split('-', 1)[0] || 'en') : 'en';
        // Set only available languages
        userLang = root.isAvailableLanguage(userLang);
        return cb(userLang);
      }
    };

    root.isAvailableLanguage = function(userLang) {
      return lodash.find(root.availableLanguages, {
        'isoCode': userLang
      }) ? userLang : 'en';
    };

    root._set = function(lang) {
      $log.debug('Setting default language: ' + lang);
      gettextCatalog.setCurrentLanguage(lang);
      amMoment.changeLocale(lang);
      root.currentLanguage = lang;
    };

    root.getCurrentLanguage = function() {
      return root.currentLanguage;
    };

    root.getCurrentLanguageName = function() {
      return root.getName(root.currentLanguage);
    };

    root.getCurrentLanguageInfo = function() {
      return lodash.find(root.availableLanguages, {
        'isoCode': root.currentLanguage
      });
    };

    root.getLanguages = function() {
      return root.availableLanguages;
    };

    root.init = function() {
      root._detect(function(lang) {
        root._set(lang);
      });
    };

    root.update = function(cb) {
      var userLang = configService.getSync().wallet.settings.defaultLanguage;

      if (!userLang) {

        root._detect(function(lang) {
          userLang = lang;

          if (userLang != root.currentLanguage) {
            root._set(lang);
          }
          return cb(userLang);
        });
      } else {
        if (userLang != root.currentLanguage) {
          root._set(userLang);
        }
        return cb(userLang);
      }
    };

    root.getName = function(lang) {
      return lodash.result(lodash.find(root.availableLanguages, {
        'isoCode': lang
      }), 'name');
    };

    return root;
  });

'use strict';
