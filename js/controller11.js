angular.module('copayApp.controllers').controller('backupController',
  function($rootScope, $scope, $timeout, $log, $state, $compile, go, lodash, profileService, gettext, bwcService, bwsError) {

    var self = this;
    var fc = profileService.focusedClient;
    var customWords = [];

    function init() {
      $scope.passphrase = '';
      resetAllButtons();
      customWords = [];
      self.step = 1;
      self.deleted = false;
      self.credentialsEncrypted = false;
      self.selectComplete = false;
      self.backupError = false;
    }

    init();

    if (fc.credentials && !fc.credentials.mnemonicEncrypted && !fc.credentials.mnemonic)
      self.deleted = true;

    if (fc.isPrivKeyEncrypted() && !self.deleted) {
      self.credentialsEncrypted = true;
      passwordRequest();
    } else {
      if (!self.deleted)
        initWords();
    }

    self.goToStep = function(n) {
      self.step = n;
      if (self.step == 1)
        init();
      if (self.step == 3 && !self.mnemonicHasPassphrase)
        self.step++;
      if (self.step == 4) {
        confirm();
      }
    }

    function initWords() {
      var words = fc.getMnemonic();
      self.xPrivKey = fc.credentials.xPrivKey;
      profileService.lockFC();
      self.mnemonicWords = words.split(/[\u3000\s]+/);
      self.shuffledMnemonicWords = lodash.sortBy(self.mnemonicWords);;
      self.mnemonicHasPassphrase = fc.mnemonicHasPassphrase();
      self.useIdeograms = words.indexOf("\u3000") >= 0;
    };

    self.toggle = function() {
      self.error = "";

      if (self.credentialsEncrypted)
        passwordRequest();

      $timeout(function() {
        $scope.$apply();
      }, 1);
    };

    function passwordRequest() {
      try {
        initWords();
      } catch (e) {
        if (e.message && e.message.match(/encrypted/) && fc.isPrivKeyEncrypted()) {

          $timeout(function() {
            $scope.$apply();
          }, 1);

          profileService.unlockFC(function(err) {
            if (err) {
              self.error = bwsError.msg(err, gettext('Could not decrypt'));
              $log.warn('Error decrypting credentials:', self.error); //TODO
              return;
            }

            self.credentialsEncrypted = false;
            initWords();

            $timeout(function() {
              $scope.$apply();
            }, 1);
          });
        }
      }
    }

    function resetAllButtons() {
      document.getElementById('addWord').innerHTML = '';
      var nodes = document.getElementById("buttons").getElementsByTagName('button');
      lodash.each(nodes, function(n) {
        document.getElementById(n.id).disabled = false;
      });
    }

    self.enableButton = function(word) {
      document.getElementById(word).disabled = false;
      lodash.remove(customWords, function(v) {
        return v == word;
      });
    }

    self.disableButton = function(index, word) {
      var element = {
        index: index,
        word: word
      };
      document.getElementById(index + word).disabled = true;
      customWords.push(element);
      self.addButton(index, word);
    }

    self.addButton = function(index, word) {
      var btnhtml = '<button class="button radius tiny words" ng-disabled="wordsC.disableButtons"' +
        'data-ng-click="wordsC.removeButton($event)" id="_' + index + word + '" > ' + word + ' </button>';
      var temp = $compile(btnhtml)($scope);
      angular.element(document.getElementById('addWord')).append(temp);
      self.shouldContinue();
    }

    self.removeButton = function(event) {
      var id = (event.target.id);
      document.getElementById(id).remove();
      self.enableButton(id.substring(1));
      lodash.remove(customWords, function(d) {
        return d.index == id.substring(1, 3);
      });
      self.shouldContinue();
    }

    self.shouldContinue = function() {
      if (customWords.length == 12)
        self.selectComplete = true;
      else
        self.selectComplete = false;
    }

    function confirm() {
      self.backupError = false;

      var walletClient = bwcService.getClient();
      var separator = self.useIdeograms ? '\u3000' : ' ';
      var customSentence = lodash.pluck(customWords, 'word').join(separator);
      var passphrase = $scope.passphrase || '';

      try {
        walletClient.seedFromMnemonic(customSentence, {
          network: fc.credentials.network,
          passphrase: passphrase,
          account: fc.credentials.account
        })
      } catch (err) {
        return backupError(err);
      }

      if (walletClient.credentials.xPrivKey != self.xPrivKey) {
        return backupError('Private key mismatch');
      }

      $rootScope.$emit('Local/BackupDone');
    }

    function backupError(err) {
      $log.debug('Failed to verify backup: ', err);
      self.backupError = true;

      $timeout(function() {
        $scope.$apply();
      }, 1);
    };
  });

'use strict';

angular.module('copayApp.controllers').controller('buyGlideraController', 
  function($scope, $timeout, $modal, profileService, addressService, glideraService, bwsError, lodash, isChromeApp, animationService) {
    
    var self = this;
    this.show2faCodeInput = null;
    this.error = null;
    this.success = null;
    this.loading = null; 

    window.ignoreMobilePause = true;

    var otherWallets = function(testnet) {
      var network = testnet ? 'testnet' : 'livenet';
      return lodash.filter(profileService.getWallets(network), function(w) {
        return w.network == network;
      });
    };

    this.init = function(testnet) {
      self.otherWallets = otherWallets(testnet);
      // Choose focused wallet
      try {
        var currentWalletId = profileService.focusedClient.credentials.walletId;
        lodash.find(self.otherWallets, function(w) {
          if (w.id == currentWalletId) {
            $timeout(function() {
              self.selectedWalletId = w.id;
              self.selectedWalletName = w.name;
              $scope.$apply();
            }, 100);
          }
        });
      } catch(e) {
        $log.debug(e);
      };
    };

    $scope.openWalletsModal = function(wallets) {
      self.error = null;
      self.selectedWalletId = null;
      self.selectedWalletName = null;
      var ModalInstanceCtrl = function($scope, $modalInstance) {
        $scope.type = 'BUY';
        $scope.wallets = wallets;
        $scope.noColor = true;
        $scope.cancel = function() {
          $modalInstance.dismiss('cancel');
        };

        $scope.selectWallet = function(walletId, walletName) {
          if (!profileService.getClient(walletId).isComplete()) {
            self.error = bwsError.msg({'code': 'WALLET_NOT_COMPLETE'}, 'Could not choose the wallet');
            $modalInstance.dismiss('cancel');
            return;
          }
          $modalInstance.close({
            'walletId': walletId, 
            'walletName': walletName, 
          });
        };
      };

      var modalInstance = $modal.open({
        templateUrl: 'views/modals/glidera-wallets.html',
          windowClass: animationService.modalAnimated.slideUp,
          controller: ModalInstanceCtrl,
      });

      modalInstance.result.finally(function() {
        var m = angular.element(document.getElementsByClassName('reveal-modal'));
        m.addClass(animationService.modalAnimated.slideOutDown);
      });

      modalInstance.result.then(function(obj) {
        $timeout(function() {
          self.selectedWalletId = obj.walletId;
          self.selectedWalletName = obj.walletName;
          $scope.$apply();
        }, 100);
      });
    };

    this.getBuyPrice = function(token, price) {
      var self = this;
      this.error = null;
      if (!price || (price && !price.qty && !price.fiat)) {
        this.buyPrice = null;
        return;
      }
      this.gettingBuyPrice = true;
      glideraService.buyPrice(token, price, function(err, buyPrice) {
        self.gettingBuyPrice = false;
        if (err) {
          self.error = 'Could not get exchange information. Please, try again.';
        }
        else {
          self.buyPrice = buyPrice;
        }
      });     
    };

    this.get2faCode = function(token) {
      var self = this;
      this.loading = 'Sending 2FA code...';
      $timeout(function() {
        glideraService.get2faCode(token, function(err, sent) {
          self.loading = null;
          if (err) {
            self.error = 'Could not send confirmation code to your phone';
          }
          else {
            self.error = null;
            self.show2faCodeInput = sent;
          }
        });
      }, 100);
    };

    this.sendRequest = function(token, permissions, twoFaCode) {
      var self = this;
      self.error = null;
      self.loading = 'Buying bitcoin...';
      $timeout(function() {
        addressService.getAddress(self.selectedWalletId, false, function(err, walletAddr) {
          if (err) {
            self.error = bwsError.cb(err, 'Could not create address');
            return;
          }
          var data = {
            destinationAddress: walletAddr,
            qty: self.buyPrice.qty,
            priceUuid: self.buyPrice.priceUuid,
            useCurrentPrice: false,
            ip: null 
          };
          glideraService.buy(token, twoFaCode, data, function(err, data) {
            self.loading = null;
            if (err) {
              self.error = err;
            }
            else {
              self.success = data;
              $scope.$emit('Local/GlideraTx');
            }
          });
        });
      }, 100);
    };

  });

'use strict';

angular.module('copayApp.controllers').controller('copayersController',
  function($scope, $rootScope, $timeout, $log, $modal, profileService, go, notification, isCordova, gettext, gettextCatalog, animationService) {
    var self = this;

    var delete_msg = gettextCatalog.getString('Are you sure you want to delete this wallet?');
    var accept_msg = gettextCatalog.getString('Accept');
    var cancel_msg = gettextCatalog.getString('Cancel');
    var confirm_msg = gettextCatalog.getString('Confirm');

    self.init = function() {
      var fc = profileService.focusedClient;
      if (fc.isComplete()) {
        $log.debug('Wallet Complete...redirecting')
        go.walletHome();
        return;
      }
      self.loading = false;
      self.isCordova = isCordova;
    };

    var _modalDeleteWallet = function() {
      var ModalInstanceCtrl = function($scope, $modalInstance, gettext) {
        $scope.title = delete_msg;
        $scope.loading = false;

        $scope.ok = function() {
          $scope.loading = true;
          $modalInstance.close(accept_msg);

        };
        $scope.cancel = function() {
          $modalInstance.dismiss(cancel_msg);
        };
      };

      var modalInstance = $modal.open({
        templateUrl: 'views/modals/confirmation.html',
        windowClass: animationService.modalAnimated.slideUp,
        controller: ModalInstanceCtrl
      });

      modalInstance.result.finally(function() {
        var m = angular.element(document.getElementsByClassName('reveal-modal'));
        m.addClass(animationService.modalAnimated.slideOutDown);
      });

      modalInstance.result.then(function(ok) {
        if (ok) {
          _deleteWallet();
        }
      });
    };

    var _deleteWallet = function() {
      var fc = profileService.focusedClient;
      $timeout(function() {
        var fc = profileService.focusedClient;
        var walletName = fc.credentials.walletName;

        profileService.deleteWalletFC({}, function(err) {
          if (err) {
            this.error = err.message || err;
            console.log(err);
            $timeout(function() {
              $scope.$digest();
            });
          } else {
            go.walletHome();
            $timeout(function() {
              notification.success(gettextCatalog.getString('Success'), gettextCatalog.getString('The wallet "{{walletName}}" was deleted', {walletName: walletName}));
            });
          }
        });
      }, 100);
    };

    self.deleteWallet = function() {
      var fc = profileService.focusedClient;
      if (isCordova) {
        navigator.notification.confirm(
          delete_msg,
          function(buttonIndex) {
            if (buttonIndex == 1) {
              _deleteWallet();
            }
          },
          confirm_msg, [accept_msg, cancel_msg]
        );
      } else {
        _modalDeleteWallet();
      }
    };

    self.copySecret = function(secret) {
      if (isCordova) {
        window.cordova.plugins.clipboard.copy(secret);
        window.plugins.toast.showShortCenter(gettextCatalog.getString('Copied to clipboard'));
      }
    };

    self.shareSecret = function(secret) {
      if (isCordova) {
        if (isMobile.Android() || isMobile.Windows()) {
          window.ignoreMobilePause = true;
        }
        var message = gettextCatalog.getString('Join my Copay wallet. Here is the invitation code: {{secret}} You can download Copay for your phone or desktop at https://copay.io', {secret: secret});
        window.plugins.socialsharing.share(message, gettextCatalog.getString('Invitation to share a Copay Wallet'), null, null);
      }
    };

  });

'use strict';

angular.module('copayApp.controllers').controller('createController',
  function($scope, $rootScope, $location, $timeout, $log, lodash, go, profileService, configService, isCordova, gettext, ledger, trezor, isMobile, isChromeApp, isDevel, derivationPathHelper) {

    var self = this;
    var defaults = configService.getDefaults();
    this.isWindowsPhoneApp = isMobile.Windows() && isCordova;
    $scope.account = 1;

    /* For compressed keys, m*73 + n*34 <= 496 */
    var COPAYER_PAIR_LIMITS = {
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 4,
      6: 4,
      7: 3,
      8: 3,
      9: 2,
      10: 2,
      11: 1,
      12: 1,
    };

    var defaults = configService.getDefaults();
    $scope.bwsurl = defaults.bws.url;
    $scope.derivationPath = derivationPathHelper.default;

    // ng-repeat defined number of times instead of repeating over array?
    this.getNumber = function(num) {
      return new Array(num);
    }

    var updateRCSelect = function(n) {
      $scope.totalCopayers = n;
      var maxReq = COPAYER_PAIR_LIMITS[n];
      self.RCValues = lodash.range(1, maxReq + 1);
      $scope.requiredCopayers = Math.min(parseInt(n / 2 + 1), maxReq);
    };

    var updateSeedSourceSelect = function(n) {

      self.seedOptions = [{
        id: 'new',
        label: gettext('New Random Seed'),
      }, {
        id: 'set',
        label: gettext('Specify Seed...'),
      }];
      $scope.seedSource = self.seedOptions[0];

      if (n > 1 && isChromeApp)
        self.seedOptions.push({
          id: 'ledger',
          label: 'Ledger Hardware Wallet',
        });

      if (isChromeApp || isDevel) {
        self.seedOptions.push({
          id: 'trezor',
          label: 'Trezor Hardware Wallet',
        });
      }
    };

    this.TCValues = lodash.range(2, defaults.limits.totalCopayers + 1);
    $scope.totalCopayers = defaults.wallet.totalCopayers;

    this.setTotalCopayers = function(tc) {
      updateRCSelect(tc);
      updateSeedSourceSelect(tc);
      self.seedSourceId = $scope.seedSource.id;
    };


    this.setSeedSource = function(src) {
      self.seedSourceId = $scope.seedSource.id;

      $timeout(function() {
        $rootScope.$apply();
      });
    };

    this.create = function(form) {
      if (form && form.$invalid) {
        this.error = gettext('Please enter the required fields');
        return;
      }

      var opts = {
        m: $scope.requiredCopayers,
        n: $scope.totalCopayers,
        name: form.walletName.$modelValue,
        myName: $scope.totalCopayers > 1 ? form.myName.$modelValue : null,
        networkName: form.isTestnet.$modelValue ? 'testnet' : 'livenet',
        bwsurl: $scope.bwsurl,
      };
      var setSeed = self.seedSourceId == 'set';
      if (setSeed) {

        var words = form.privateKey.$modelValue || '';
        if (words.indexOf(' ') == -1 && words.indexOf('prv') == 1 && words.length > 108) {
          opts.extendedPrivateKey = words;
        } else {
          opts.mnemonic = words;
        }
        opts.passphrase = form.passphrase.$modelValue;

        var pathData = derivationPathHelper.parse($scope.derivationPath);
        if (!pathData) {
          this.error = gettext('Invalid derivation path');
          return;
        }

        opts.account = pathData.account;
        opts.networkName = pathData.networkName;
        opts.derivationStrategy = pathData.derivationStrategy;

      } else {
        opts.passphrase = form.createPassphrase.$modelValue;
      }

      if (setSeed && !opts.mnemonic && !opts.extendedPrivateKey) {
        this.error = gettext('Please enter the wallet seed');
        return;
      }

      if (self.seedSourceId == 'ledger' || self.seedSourceId == 'trezor') {
        var account = $scope.account;
        if (!account || account < 1) {
          this.error = gettext('Invalid account number');
          return;
        }

        if ( self.seedSourceId == 'trezor')
          account = account - 1;

        opts.account = account;
        self.hwWallet = self.seedSourceId == 'ledger' ? 'Ledger' : 'Trezor';
        var src = self.seedSourceId == 'ledger' ? ledger : trezor;

        src.getInfoForNewWallet(opts.n > 1, account, function(err, lopts) {
          self.hwWallet = false;
          if (err) {
            self.error = err;
            $scope.$apply();
            return;
          }
          opts = lodash.assign(lopts, opts);
          self._create(opts);
        });
      } else {
        self._create(opts);
      }
    };

    this._create = function(opts) {
      self.loading = true;
      $timeout(function() {
        profileService.createWallet(opts, function(err, walletId) {
          self.loading = false;
          if (err) {
            $log.warn(err);
            self.error = err;
            $timeout(function() {
              $rootScope.$apply();
            });
            return;
          }

        });
      }, 100);
    }

    this.formFocus = function(what) {
      if (!this.isWindowsPhoneApp) return

      if (what && what == 'my-name') {
        this.hideWalletName = true;
        this.hideTabs = true;
      } else if (what && what == 'wallet-name') {
        this.hideTabs = true;
      } else {
        this.hideWalletName = false;
        this.hideTabs = false;
      }
      $timeout(function() {
        $rootScope.$digest();
      }, 1);
    };

    $scope.$on("$destroy", function() {
      $rootScope.hideWalletNavigation = false;
    });

    updateSeedSourceSelect(1);
    self.setSeedSource('new');
  });

'use strict';

angular.module('copayApp.controllers').controller('DevLoginController', function($scope, $rootScope, $routeParams, identityService) {

  var mail = $routeParams.mail;
  var password = $routeParams.password;

  var form = {};
  form.email = {};
  form.password = {};
  form.email.$modelValue = mail;
  form.password.$modelValue = password;

  identityService.open($scope, form);

});

'use strict';

angular.module('copayApp.controllers').controller('disclaimerController',
  function($scope, $timeout, $log, profileService, isCordova, storageService, applicationService, gettextCatalog, uxLanguage, go) {
    var self = this;
    self.tries = 0;

    var create = function(noWallet) {
      $scope.creatingProfile = true;
      profileService.create({
        noWallet: noWallet
      }, function(err) {

        if (err) {
          $log.warn(err);
          $scope.error = err;
          $scope.$apply();
          $timeout(function() {
            $log.warn('Retrying to create profile......');
            if (self.tries == 3) {
              self.tries == 0;
              create(true);
            } else {
              self.tries += 1;
              create(false);
            }
          }, 3000);
        } else {
          $scope.error = "";
          $scope.creatingProfile = false;
        }
      });
    };

    this.init = function() {
      self.lang = uxLanguage.currentLanguage;
      storageService.getProfile(function(err, profile) {
        if (!profile) create(false);
        else $scope.creatingProfile = false;

        //compatible
        profileService.isDisclaimerAccepted(function(val) {
          if (val) go.walletHome();
        });
      });
    };
  });

'use strict';

angular.module('copayApp.controllers').controller('exportController',
  function($rootScope, $scope, $timeout, $log, backupService, storageService, profileService, isMobile, notification, go, gettext, gettextCatalog) {
    var self = this;

    self.error = null;
    self.success = null;
    $scope.metaData = true;
    var fc = profileService.focusedClient;
    self.isEncrypted = fc.isPrivKeyEncrypted();

    self.downloadWalletBackup = function() {
      self.getMetaData($scope.metaData, function(err, txsFromLocal, localAddressBook) {
        if (err) {
          self.error = true;
          return;
        }
        var opts = {
          noSign: $scope.noSign,
          historyCache: txsFromLocal,
          addressBook: localAddressBook
        };

        backupService.walletDownload(self.password, opts, function(err) {
          if (err) {
            self.error = true;
            return;
          }

          $rootScope.$emit('Local/BackupDone');
          notification.success(gettext('Success'), gettext('Encrypted export file saved'));
          go.walletHome();
        });
      });
    };

    self.getMetaData = function(metaData, cb) {
      if (metaData == false) return cb();
      self.getHistoryCache(function(err, txsFromLocal) {
        if (err) return cb(err);

        self.getAddressbook(function(err, localAddressBook) {
          if (err) return cb(err);

          return cb(null, txsFromLocal, localAddressBook)
        });
      });
    }

    self.getHistoryCache = function(cb) {
      storageService.getTxHistory(fc.credentials.walletId, function(err, txs) {
        if (err) return cb(err);

        var localTxs = [];

        try {
          localTxs = JSON.parse(txs);
        } catch (ex) {
          $log.warn(ex);
        }
        if (!localTxs[0]) return cb(null, null);

        return cb(null, localTxs);
      });
    }

    self.getAddressbook = function(cb) {
      storageService.getAddressbook(fc.credentials.network, function(err, addressBook) {
        if (err) return cb(err);

        var localAddressBook = [];
        try {
          localAddressBook = JSON.parse(addressBook);
        } catch (ex) {
          $log.warn(ex);
        }

        return cb(null, localAddressBook);
      });
    }

    self.getBackup = function(cb) {
      self.getMetaData($scope.metaData, function(err, txsFromLocal, localAddressBook) {
        if (err) {
          self.error = true;
          return cb(null);
        }
        var opts = {
          noSign: $scope.noSign,
          historyCache: txsFromLocal,
          addressBook: localAddressBook
        };

        var ew = backupService.walletExport(self.password, opts);
        if (!ew) {
          self.error = true;
        } else {
          self.error = false;
          $rootScope.$emit('Local/BackupDone');
        }
        return cb(ew);
      });
    }

    self.viewWalletBackup = function() {
      var self = this;
      $timeout(function() {
        self.getBackup(function(backup) {
          var ew = backup;
          if (!ew) return;
          self.backupWalletPlainText = ew;
        });
      }, 100);
    };

    self.copyWalletBackup = function() {
      self.getBackup(function(backup) {
        var ew = backup;
        if (!ew) return;
        window.cordova.plugins.clipboard.copy(ew);
        window.plugins.toast.showShortCenter(gettextCatalog.getString('Copied to clipboard'));
      });
    };

    self.sendWalletBackup = function() {
      var fc = profileService.focusedClient;
      if (isMobile.Android() || isMobile.Windows()) {
        window.ignoreMobilePause = true;
      }
      window.plugins.toast.showShortCenter(gettextCatalog.getString('Preparing backup...'));
      var name = (fc.credentials.walletName || fc.credentials.walletId);
      if (fc.alias) {
        name = fc.alias + ' [' + name + ']';
      }
      self.getBackup(function(backup) {
        var ew = backup;
        if (!ew) return;

        if ($scope.noSign)
          name = name + '(No Private Key)';

        var properties = {
          subject: 'Copay Wallet Backup: ' + name,
          body: 'Here is the encrypted backup of the wallet ' + name + ': \n\n' + ew + '\n\n To import this backup, copy all text between {...}, including the symbols {}',
          isHtml: false
        };
        window.plugin.email.open(properties);
      });
    };

  });

'use strict';

angular.module('copayApp.controllers').controller('glideraController', 
  function($rootScope, $scope, $timeout, $modal, profileService, configService, storageService, glideraService, isChromeApp, animationService, lodash) {

    window.ignoreMobilePause = true;

    this.getAuthenticateUrl = function() {
      return glideraService.getOauthCodeUrl();
    };

    this.submitOauthCode = function(code) {
      var self = this;
      var glideraTestnet = configService.getSync().glidera.testnet;
      var network = glideraTestnet ? 'testnet' : 'livenet';
      this.loading = true;
      this.error = null;
      $timeout(function() {
        glideraService.getToken(code, function(err, data) {
          self.loading = null;
          if (err) {
            self.error = err;
            $timeout(function() {
                $scope.$apply();
              }, 100);
          }
          else if (data && data.access_token) {
            storageService.setGlideraToken(network, data.access_token, function() {
              $scope.$emit('Local/GlideraUpdated', data.access_token);
              $timeout(function() {
                $scope.$apply();
              }, 100);
            });
          }
        });
      }, 100);
    };

    this.openTxModal = function(token, tx) {
      $rootScope.modalOpened = true;
      var self = this;
      var config = configService.getSync().wallet.settings;
      var fc = profileService.focusedClient;
      var ModalInstanceCtrl = function($scope, $modalInstance) {
        $scope.tx = tx;
        $scope.settings = config;
        $scope.color = fc.backgroundColor;
        $scope.noColor = true;

        glideraService.getTransaction(token, tx.transactionUuid, function(error, tx) {
          $scope.tx = tx;
        });

        $scope.cancel = lodash.debounce(function() {
          $modalInstance.dismiss('cancel');
        }, 0, 1000);

      };

      var modalInstance = $modal.open({
        templateUrl: 'views/modals/glidera-tx-details.html',
          windowClass: animationService.modalAnimated.slideRight,
          controller: ModalInstanceCtrl,
      });

      var disableCloseModal = $rootScope.$on('closeModal', function() {
        modalInstance.dismiss('cancel');
      });

      modalInstance.result.finally(function() {
        $rootScope.modalOpened = false;
        disableCloseModal();
        var m = angular.element(document.getElementsByClassName('reveal-modal'));
        m.addClass(animationService.modalAnimated.slideOutRight);
      });
    };

  });

'use strict';
angular.module('copayApp.controllers').controller('glideraUriController',
  function($scope, $stateParams, $timeout, profileService, configService, glideraService, storageService, go) { 

    this.submitOauthCode = function(code) {
      var self = this;
      var glideraTestnet = configService.getSync().glidera.testnet;
      var network = glideraTestnet ? 'testnet' : 'livenet';
      this.loading = true;
      this.error = null;
      $timeout(function() {
        glideraService.getToken(code, function(err, data) {
          self.loading = null;
          if (err) {
            self.error = err;
            $timeout(function() {
                $scope.$apply();
              }, 100);
          }
          else if (data && data.access_token) {
            storageService.setGlideraToken(network, data.access_token, function() {
              $scope.$emit('Local/GlideraUpdated', data.access_token);
              $timeout(function() {
                go.path('glidera');
                $scope.$apply();
              }, 100);
            });
          }
        });
      }, 100);
    };

    this.checkCode = function() {
      this.code = $stateParams.code;
      this.submitOauthCode(this.code);
    };

  });

'use strict';

angular.module('copayApp.controllers').controller('importController',
  function($scope, $rootScope, $location, $timeout, $log, profileService, configService, notification, go, sjcl, gettext, lodash, ledger, trezor, isChromeApp, isDevel, derivationPathHelper) {

    var self = this;
    var reader = new FileReader();
    var defaults = configService.getDefaults();
    $scope.bwsurl = defaults.bws.url;
    $scope.derivationPath = derivationPathHelper.default;
    $scope.account = 1;

    window.ignoreMobilePause = true;
    $scope.$on('$destroy', function() {
      $timeout(function() {
        window.ignoreMobilePause = false;
      }, 100);
    });

    var updateSeedSourceSelect = function() {
      self.seedOptions = [];

      if (isChromeApp) {
        self.seedOptions.push({
          id: 'ledger',
          label: 'Ledger Hardware Wallet',
        });
      }

      if (isChromeApp || isDevel) {
        self.seedOptions.push({
          id: 'trezor',
          label: 'Trezor Hardware Wallet',
        });
        $scope.seedSource = self.seedOptions[0];
      }
    };



    this.setType = function(type) {
      $scope.type = type;
      this.error = null;
      $timeout(function() {
        $rootScope.$apply();
      });
    };

    var _importBlob = function(str, opts) {
      var str2, err;
      try {
        str2 = sjcl.decrypt(self.password, str);
      } catch (e) {
        err = gettext('Could not decrypt file, check your password');
        $log.warn(e);
      };

      if (err) {
        self.error = err;
        $timeout(function() {
          $rootScope.$apply();
        });
        return;
      }

      self.loading = true;
      opts.compressed = null;
      opts.password = null;

      $timeout(function() {
        profileService.importWallet(str2, opts, function(err, walletId) {
          self.loading = false;
          if (err) {
            self.error = err;
          } else {
            $rootScope.$emit('Local/WalletImported', walletId);
            notification.success(gettext('Success'), gettext('Your wallet has been imported correctly'));
          }
        });
      }, 100);
    };

    var _importExtendedPrivateKey = function(xPrivKey, opts) {
      self.loading = true;

      $timeout(function() {
        profileService.importExtendedPrivateKey(xPrivKey, opts, function(err, walletId) {
          self.loading = false;
          if (err) {
            self.error = err;
            return $timeout(function() {
              $scope.$apply();
            });
          }
          $rootScope.$emit('Local/WalletImported', walletId);
          notification.success(gettext('Success'), gettext('Your wallet has been imported correctly'));
        });
      }, 100);
    };

    var _importMnemonic = function(words, opts) {
      self.loading = true;

      $timeout(function() {
        profileService.importMnemonic(words, opts, function(err, walletId) {
          self.loading = false;
          if (err) {
            self.error = err;
            return $timeout(function() {
              $scope.$apply();
            });
          }
          $rootScope.$emit('Local/WalletImported', walletId);
          notification.success(gettext('Success'), gettext('Your wallet has been imported correctly'));
        });
      }, 100);
    };

    $scope.getFile = function() {
      // If we use onloadend, we need to check the readyState.
      reader.onloadend = function(evt) {
        if (evt.target.readyState == FileReader.DONE) { // DONE == 2
          var opts = {};
          opts.bwsurl = $scope.bwsurl;
          _importBlob(evt.target.result, opts);
        }
      }
    };

    this.importBlob = function(form) {
      if (form.$invalid) {
        this.error = gettext('There is an error in the form');

        $timeout(function() {
          $scope.$apply();
        });
        return;
      }

      var backupFile = $scope.file;
      var backupText = form.backupText.$modelValue;
      var password = form.password.$modelValue;

      if (!backupFile && !backupText) {
        this.error = gettext('Please, select your backup file');
        $timeout(function() {
          $scope.$apply();
        });

        return;
      }

      if (backupFile) {
        reader.readAsBinaryString(backupFile);
      } else {
        var opts = {};
        opts.bwsurl = $scope.bwsurl;
        _importBlob(backupText, opts);
      }
    };

    this.importMnemonic = function(form) {
      if (form.$invalid) {
        this.error = gettext('There is an error in the form');

        $timeout(function() {
          $scope.$apply();
        });
        return;
      }

      var opts = {};
      if ($scope.bwsurl)
        opts.bwsurl = $scope.bwsurl;

      var passphrase = form.passphrase.$modelValue;
      var words = form.words.$modelValue;
      this.error = null;

      if (!words) {
        this.error = gettext('Please enter the seed words');
      } else if (words.indexOf('xprv') == 0 || words.indexOf('tprv') == 0) {
        return _importExtendedPrivateKey(words, opts);
      } else {
        var wordList = words.split(/[\u3000\s]+/);

        if ((wordList.length % 3) != 0)
          this.error = gettext('Wrong number of seed words:') + wordList.length;
      }

      if (this.error) {
        $timeout(function() {
          $scope.$apply();
        });
        return;
      }

      opts.passphrase = form.passphrase.$modelValue || null;

      var pathData = derivationPathHelper.parse($scope.derivationPath);
      if (!pathData) {
        this.error = gettext('Invalid derivation path');
        return;
      }
      opts.account = pathData.account;
      opts.networkName = pathData.networkName;
      opts.derivationStrategy = pathData.derivationStrategy;


      _importMnemonic(words, opts);
    };

    this.importTrezor = function(account, isMultisig) {
      var self = this;
      trezor.getInfoForNewWallet(isMultisig, account, function(err, lopts) {
        self.hwWallet = false;
        if (err) {
          self.error = err;
          $scope.$apply();
          return;
        }

        lopts.externalSource = 'trezor';
        lopts.bwsurl = $scope.bwsurl;
        self.loading = true;
        $log.debug('Import opts', lopts);

        profileService.importExtendedPublicKey(lopts, function(err, walletId) {
          self.loading = false;
          if (err) {
            self.error = err;
            return $timeout(function() {
              $scope.$apply();
            });
          }
          $rootScope.$emit('Local/WalletImported', walletId);
          notification.success(gettext('Success'), gettext('Your wallet has been imported correctly'));
          go.walletHome();
        });
      }, 100);
    };

    this.importHW = function(form) {
      if (form.$invalid || $scope.account < 0 ) {
        this.error = gettext('There is an error in the form');
        $timeout(function() {
          $scope.$apply();
        });
        return;
      }
      this.error = '';

      var account = + $scope.account;
      
      if (self.seedSourceId == 'trezor') {
        if ( account < 1) {
          this.error = gettext('Invalid account number');
          return;
        }
        account = account - 1;
      }
      var isMultisig = form.isMultisig.$modelValue;

      switch (self.seedSourceId) {
        case ('ledger'):
          self.hwWallet = 'Ledger';
          self.importLedger(account);
          break;
        case ('trezor'):
          self.hwWallet = 'Trezor';
          self.importTrezor(account, isMultisig);
          break;
        default:
          throw ('Error: bad source id');
      };
    };

    this.setSeedSource = function() {
      if (!$scope.seedSource) return;
      self.seedSourceId = $scope.seedSource.id;

      $timeout(function() {
        $rootScope.$apply();
      });
    };

    this.importLedger = function(account) {
      var self = this;
      ledger.getInfoForNewWallet(true, account, function(err, lopts) {
        self.hwWallet = false;
        if (err) {
          self.error = err;
          $scope.$apply();
          return;
        }

        lopts.externalSource = 'ledger';
        lopts.bwsurl = $scope.bwsurl;
        self.loading = true;
        $log.debug('Import opts', lopts);

        profileService.importExtendedPublicKey(lopts, function(err, walletId) {
          self.loading = false;
          if (err) {
            self.error = err;
            return $timeout(function() {
              $scope.$apply();
            });
          }
          $rootScope.$emit('Local/WalletImported', walletId);
          notification.success(gettext('Success'), gettext('Your wallet has been imported correctly'));
        });
      }, 100);
    };

    updateSeedSourceSelect();
    self.setSeedSource('new');
  });

'use strict';

angular.module('copayApp.controllers').controller('importLegacyController',
  function($rootScope, $scope, $log, $timeout, notification, legacyImportService, profileService, go, lodash, bitcore, gettext, gettextCatalog) {

    var self = this;
    self.messages = [];
    self.fromCloud = true;
    self.server = "https://insight.bitpay.com:443/api/email";


    $rootScope.$on('Local/ImportStatusUpdate', function(event, status) {
      $timeout(function() {
        $log.debug(status);

        self.messages.unshift({
          message: status,
        });

        var op = 1;
        lodash.each(self.messages, function(m) {
          if (op < 0.1) op = 0.1;
          m.opacity = op;
          op = op - 0.15;
        });
      }, 100);
    });

    self.scan = function(ids) {
      $log.debug('### Scaning: ' + ids)
      var i = 0;
      lodash.each(ids, function(id) {
        $rootScope.$emit('Local/WalletImported', id);
        if (++i == ids.length) {
          go.walletHome();
        };
      });
    };


    self.import = function(form) {
      var username = form.username.$modelValue;
      var password = form.password.$modelValue;
      var serverURL = form.server.$modelValue;
      var fromCloud = form.fromCloud.$modelValue;

      self.error = null;
      self.importing = true;
      $timeout(function() {
        legacyImportService.import(username, password, serverURL, fromCloud, function(err, ids, toScanIds) {
          if (err || !ids || !ids.length) {
            self.importing = false;
            self.error = err || gettext('Failed to import wallets');
            return;
          }

          notification.success( gettextCatalog.getString('{{len}} wallets imported. Funds scanning in progress. Hold on to see updated balance', {len: ids.length}));
          self.scan(toScanIds);
        });
      }, 100);
    };
    // TODO destroy event...
  });

'use strict';

angular.module('copayApp.controllers').controller('indexController', function($rootScope, $scope, $log, $filter, $timeout, lodash, go, profileService, configService, isCordova, rateService, storageService, addressService, gettext, gettextCatalog, amMoment, nodeWebkit, addonManager, feeService, isChromeApp, bwsError, txFormatService, uxLanguage, $state, glideraService, isMobile, addressbookService) {
  var self = this;
  var SOFT_CONFIRMATION_LIMIT = 12;
  self.isCordova = isCordova;
  self.isChromeApp = isChromeApp;
  self.isSafari = isMobile.Safari();
  self.onGoingProcess = {};
  self.historyShowLimit = 10;
  self.updatingTxHistory = {};
  self.prevState = 'walletHome';

  function strip(number) {
    return (parseFloat(number.toPrecision(12)));
  };

  self.goHome = function() {
    go.walletHome();
  };

  self.menu = [{
    'title': gettext('Receive'),
    'icon': {false:'icon-receive', true: 'icon-receive-active'},
    'link': 'receive'
  }, {
    'title': gettext('Activity'),
    'icon': {false:'icon-activity',true: 'icon-activity-active'},
    'link': 'walletHome'
  }, {
    'title': gettext('Send'),
    'icon': {false:'icon-send', true: 'icon-send-active'},
    'link': 'send'
  }];

  self.addonViews = addonManager.addonViews();
  self.menu = self.menu.concat(addonManager.addonMenuItems());
  self.menuItemSize = self.menu.length > 4 ? 2 : 4;
  self.txTemplateUrl = addonManager.txTemplateUrl() || 'views/includes/transaction.html';

  self.tab = 'walletHome';

  self.feeOpts = feeService.feeOpts;

  self.setOngoingProcess = function(processName, isOn) {
    $log.debug('onGoingProcess', processName, isOn);
    self[processName] = isOn;
    self.onGoingProcess[processName] = isOn;

    var name;
    self.anyOnGoingProcess = lodash.any(self.onGoingProcess, function(isOn, processName) {
      if (isOn)
        name = name || processName;
      return isOn;
    });
    // The first one
    self.onGoingProcessName = name;
    $timeout(function() {
      $rootScope.$apply();
    });
  };

  self.setFocusedWallet = function() {
    var fc = profileService.focusedClient;
    if (!fc) return;

    // loading full wallet
    self.loadingWallet = true;

    // Clean status
    self.totalBalanceSat = null;
    self.lockedBalanceSat = null;
    self.availableBalanceSat = null;
    self.pendingAmount = null;
    self.spendUnconfirmed = null;

    self.totalBalanceStr = null;
    self.availableBalanceStr = null;
    self.lockedBalanceStr = null;

    self.alternativeBalanceAvailable = false;
    self.totalBalanceAlternative = null;

    self.currentFeeLevel = null;
    self.notAuthorized = false;
    self.txHistory = [];
    self.completeHistory = [];
    self.txProgress = 0;
    self.historyShowShowAll = false;
    self.balanceByAddress = null;
    self.pendingTxProposalsCountForUs = null;
    self.setSpendUnconfirmed();

    $timeout(function() {
      $rootScope.$apply();
      self.hasProfile = true;
      self.noFocusedWallet = false;
      self.onGoingProcess = {};

      // Credentials Shortcuts
      self.m = fc.credentials.m;
      self.n = fc.credentials.n;
      self.network = fc.credentials.network;
      self.copayerId = fc.credentials.copayerId;
      self.copayerName = fc.credentials.copayerName;
      self.requiresMultipleSignatures = fc.credentials.m > 1;
      self.isShared = fc.credentials.n > 1;
      self.walletName = fc.credentials.walletName;
      self.walletId = fc.credentials.walletId;
      self.isComplete = fc.isComplete();
      self.canSign = fc.canSign();
      self.isPrivKeyExternal = fc.isPrivKeyExternal();
      self.isPrivKeyEncrypted = fc.isPrivKeyEncrypted();
      self.externalSource = fc.getPrivKeyExternalSourceName();
      self.account = fc.credentials.account;

      if (self.externalSource == 'trezor')
        self.account++;

      self.txps = [];
      self.copayers = [];
      self.updateColor();
      self.updateAlias();
      self.setAddressbook();

      self.initGlidera();

      self.setCustomBWSFlag();
      if (fc.isPrivKeyExternal()) {
        self.needsBackup = false;
        self.openWallet();
      } else {
        storageService.getBackupFlag(self.walletId, function(err, val) {
          if (!fc.credentials.mnemonic)
            self.needsBackup = false;
          else
            self.needsBackup = self.network == 'testnet' ? false : !val;
          self.openWallet();
        });
      }
    });
  };

  self.setCustomBWSFlag = function() {
    var defaults = configService.getDefaults();
    var config = configService.getSync();

    self.usingCustomBWS = config.bwsFor && config.bwsFor[self.walletId] && (config.bwsFor[self.walletId] != defaults.bws.url);
  };

  self.acceptDisclaimer = function() {
    var profile = profileService.profile;
    if (profile) profile.disclaimerAccepted = true;
    self.disclaimerAccepted = true;
    profileService.setDisclaimerAccepted(function(err) {
      if (err) $log.error(err);
      go.walletHome();
    });
  };

  self.isDisclaimerAccepted = function() {
    if (self.disclaimerAccepted == true) {
      go.walletHome();
      return;
    }
    profileService.isDisclaimerAccepted(function(v) {
      if (v) {
        self.acceptDisclaimer();
      } else go.path('disclaimer');
    });
  };

  self.setTab = function(tab, reset, tries, switchState) {
    tries = tries || 0;

    // check if the whole menu item passed
    if (typeof tab == 'object') {
      if (tab.open) {
        if (tab.link) {
          self.tab = tab.link;
        }
        tab.open();
        return;
      } else {
        return self.setTab(tab.link, reset, tries, switchState);
      }
    }
    if (self.tab === tab && !reset)
      return;

    if (!document.getElementById('menu-' + tab) && ++tries < 5) {
      return $timeout(function() {
        self.setTab(tab, reset, tries, switchState);
      }, 300);
    }

    if (!self.tab || !$state.is('walletHome'))
      self.tab = 'walletHome';

    var changeTab = function() {
      if (document.getElementById(self.tab)) {
        document.getElementById(self.tab).className = 'tab-out tab-view ' + self.tab;
        var old = document.getElementById('menu-' + self.tab);
        if (old) {
          old.className = '';
        }
      }

      if (document.getElementById(tab)) {
        document.getElementById(tab).className = 'tab-in  tab-view ' + tab;
        var newe = document.getElementById('menu-' + tab);
        if (newe) {
          newe.className = 'active';
        }
      }

      self.tab = tab;
      $rootScope.$emit('Local/TabChanged', tab);
    };

    if (switchState && !$state.is('walletHome')) {
      go.path('walletHome', function() {
        changeTab();
      });
      return;
    }

    changeTab();
  };


  self._updateRemotePreferencesFor = function(clients, prefs, cb) {
    var client = clients.shift();

    if (!client)
      return cb();

    $log.debug('Saving remote preferences', client.credentials.walletName, prefs);
    client.savePreferences(prefs, function(err) {
      // we ignore errors here
      if (err) $log.warn(err);

      self._updateRemotePreferencesFor(clients, prefs, cb);
    });
  };


  self.updateRemotePreferences = function(opts, cb) {
    var prefs = opts.preferences || {};
    var fc = profileService.focusedClient;

    // Update this JIC.
    var config = configService.getSync().wallet.settings;

    //prefs.email  (may come from arguments)
    prefs.language = self.defaultLanguageIsoCode;
    prefs.unit = config.unitCode;

    var clients = [];
    if (opts.saveAll) {
      clients = lodash.values(profileService.walletClients);
    } else {
      clients = [fc];
    };

    self._updateRemotePreferencesFor(clients, prefs, function(err) {
      if (err) return cb(err);
      if (!fc) return cb();

      fc.getPreferences(function(err, preferences) {
        if (err) {
          return cb(err);
        }
        self.preferences = preferences;
        return cb();
      });
    });
  };

  var _walletStatusHash = function(walletStatus) {
    var bal;
    if (walletStatus) {
      bal = walletStatus.balance.totalAmount;
    } else {
      bal = self.totalBalanceSat;
    }
    return bal;
  };

  self.updateAll = function(opts, initStatusHash, tries) {
    tries = tries || 0;
    opts = opts || {};

    if (opts.untilItChanges && lodash.isUndefined(initStatusHash)) {
      initStatusHash = _walletStatusHash();
      $log.debug('Updating status until it changes. initStatusHash:' + initStatusHash)
    }
    var get = function(cb) {
      if (opts.walletStatus)
        return cb(null, opts.walletStatus);
      else {
        self.updateError = false;
        return fc.getStatus({ twoStep : true }, function(err, ret) {
          if (err) {
            self.updateError = bwsError.msg(err, gettext('Could not update Wallet'));
          } else {
            if (!opts.quiet)
              self.setOngoingProcess('scanning', ret.wallet.scanStatus == 'running');
          }
          return cb(err, ret);
        });
      }
    };

    var fc = profileService.focusedClient;
    if (!fc) return;

    $timeout(function() {

      if (!opts.quiet)
        self.setOngoingProcess('updatingStatus', true);

      $log.debug('Updating Status:', fc.credentials.walletName, tries);
      get(function(err, walletStatus) {
        var currentStatusHash = _walletStatusHash(walletStatus);
        $log.debug('Status update. hash:' + currentStatusHash + ' Try:' + tries);
        if (!err && opts.untilItChanges && initStatusHash == currentStatusHash && tries < 7) {
          return $timeout(function() {
            $log.debug('Retrying update... Try:' + tries)
            return self.updateAll({
              walletStatus: null,
              untilItChanges: true,
              triggerTxUpdate: opts.triggerTxUpdate,
            }, initStatusHash, ++tries);
          }, 1400 * tries);
        }
        if (!opts.quiet)
          self.setOngoingProcess('updatingStatus', false);

        if (err) {
          self.handleError(err);
          return;
        }
        $log.debug('Wallet Status:', walletStatus);
        self.setPendingTxps(walletStatus.pendingTxps);
        self.setFeesOpts();

        // Status Shortcuts
        self.walletName = walletStatus.wallet.name;
        self.walletSecret = walletStatus.wallet.secret;
        self.walletStatus = walletStatus.wallet.status;
        self.walletScanStatus = walletStatus.wallet.scanStatus;
        self.copayers = walletStatus.wallet.copayers;
        self.preferences = walletStatus.preferences;
        self.setBalance(walletStatus.balance);
        self.otherWallets = lodash.filter(profileService.getWallets(self.network), function(w) {
          return w.id != self.walletId;
        });

        // Notify external addons or plugins
        $rootScope.$emit('Local/BalanceUpdated', walletStatus.balance);

        $rootScope.$apply();

        if (opts.triggerTxUpdate) {
          $timeout(function() {
            self.debounceUpdateHistory();
          }, 1);
        }
      });
    });
  };

  self.setSpendUnconfirmed = function(spendUnconfirmed) {
    self.spendUnconfirmed = spendUnconfirmed || configService.getSync().wallet.spendUnconfirmed;
  };

  self.setFeeAndSendMax = function(cb) {

    self.feeToSendMaxStr = null;
    self.availableMaxBalance = null;
    self.currentFeePerKb = null;

    // Set Send max
    if (self.currentFeeLevel && self.totalBytesToSendMax) {
      feeService.getCurrentFeeValue(self.currentFeeLevel, function(err, feePerKb) {

        // KB to send max
        var feeToSendMaxSat = parseInt(((self.totalBytesToSendMax * feePerKb) / 1000.).toFixed(0));
        self.currentFeePerKb = feePerKb;

        if (self.availableBalanceSat > feeToSendMaxSat) {
          self.availableMaxBalance = strip((self.availableBalanceSat - feeToSendMaxSat) * self.satToUnit);
          self.feeToSendMaxStr = profileService.formatAmount(feeToSendMaxSat) + ' ' + self.unitName;
        }
          
        if (cb) return cb(self.currentFeePerKb, self.availableMaxBalance, self.feeToSendMaxStr);
      });
    }

  };

  self.setCurrentFeeLevel = function(level) {
    self.currentFeeLevel = level || configService.getSync().wallet.settings.feeLevel || 'normal';
    self.setFeeAndSendMax();
  };


  self.setFeesOpts = function() {
    var fc = profileService.focusedClient;
    if (!fc) return;
    $timeout(function() {
      feeService.getFeeLevels(function(levels) {
        self.feeLevels = levels;
        $rootScope.$apply();
      });
    });
  };

  self.updateBalance = function() {
    var fc = profileService.focusedClient;
    $timeout(function() {
      self.setOngoingProcess('updatingBalance', true);
      $log.debug('Updating Balance');
      fc.getBalance(function(err, balance) {
        self.setOngoingProcess('updatingBalance', false);
        if (err) {
          self.handleError(err);
          return;
        }
        $log.debug('Wallet Balance:', balance);
        self.setBalance(balance);
      });
    });
  };

  self.updatePendingTxps = function() {
    var fc = profileService.focusedClient;
    $timeout(function() {
      self.setOngoingProcess('updatingPendingTxps', true);
      $log.debug('Updating PendingTxps');
      fc.getTxProposals({}, function(err, txps) {
        self.setOngoingProcess('updatingPendingTxps', false);
        if (err) {
          self.handleError(err);
        } else {
          $log.debug('Wallet PendingTxps:', txps);
          self.setPendingTxps(txps);
        }
        $rootScope.$apply();
      });
    });
  };

  // This handles errors from BWS/index with are nomally
  // trigger from async events (like updates).
  // Debounce function avoids multiple popups
  var _handleError = function(err) {
    $log.warn('Client ERROR: ', err);
    if (err.code === 'NOT_AUTHORIZED') {
      self.notAuthorized = true;
      go.walletHome();
    } else if (err.code === 'NOT_FOUND') {
      self.showErrorPopup(gettext('Could not access Wallet Service: Not found'));
    } else {
      var msg = ""
      $scope.$emit('Local/ClientError', (err.error ? err.error : err));
      var msg = bwsError.msg(err, gettext('Error at Wallet Service'));
      self.showErrorPopup(msg);
    }
  };

  self.handleError = lodash.debounce(_handleError, 1000);

  self.openWallet = function() {
    var fc = profileService.focusedClient;
    $timeout(function() {
      $rootScope.$apply();
      self.setOngoingProcess('openingWallet', true);
      self.updateError = false;
      fc.openWallet(function(err, walletStatus) {
        self.setOngoingProcess('openingWallet', false);
        if (err) {
          self.updateError = true;
          self.handleError(err);
          return;
        }
        $log.debug('Wallet Opened');
        self.updateAll(lodash.isObject(walletStatus) ? {
          walletStatus: walletStatus
        } : null);
        $rootScope.$apply();
      });
    });
  };

  self.setPendingTxps = function(txps) {
    self.pendingTxProposalsCountForUs = 0;
    var now = Math.floor(Date.now() / 1000);

    /* Uncomment to test multiple outputs */
    /*
    var txp = {
      message: 'test multi-output',
      fee: 1000,
      createdOn: new Date() / 1000,
      type: 'multiple_output',
      outputs: []
    };
    function addOutput(n) {
      txp.outputs.push({
        amount: 600,
        toAddress: '2N8bhEwbKtMvR2jqMRcTCQqzHP6zXGToXcK',
        message: 'output #' + (Number(n) + 1)
      });
    };
    lodash.times(150, addOutput);
    txps.push(txp);
    */

    lodash.each(txps, function(tx) {

      tx = txFormatService.processTx(tx);

      // no future transactions...
      if (tx.createdOn > now)
        tx.createdOn = now;

      var action = lodash.find(tx.actions, {
        copayerId: self.copayerId
      });

      if (!action && tx.status == 'pending') {
        tx.pendingForUs = true;
      }

      if (action && action.type == 'accept') {
        tx.statusForUs = 'accepted';
      } else if (action && action.type == 'reject') {
        tx.statusForUs = 'rejected';
      } else {
        tx.statusForUs = 'pending';
      }

      if (!tx.deleteLockTime)
        tx.canBeRemoved = true;

      if (tx.creatorId != self.copayerId) {
        self.pendingTxProposalsCountForUs = self.pendingTxProposalsCountForUs + 1;
      }
      addonManager.formatPendingTxp(tx);
    });
    self.txps = txps;
  };

  var SAFE_CONFIRMATIONS = 6;

  self.processNewTxs = function(txs) {
    var config = configService.getSync().wallet.settings;
    var now = Math.floor(Date.now() / 1000);
    var txHistoryUnique = {};
    var ret = [];
    self.hasUnsafeConfirmed = false;

    lodash.each(txs, function(tx) {
      tx = txFormatService.processTx(tx);

      // no future transactions...
      if (tx.time > now)
        tx.time = now;

      if (tx.confirmations >= SAFE_CONFIRMATIONS) {
        tx.safeConfirmed = SAFE_CONFIRMATIONS + '+';
      } else {
        tx.safeConfirmed = false;
        self.hasUnsafeConfirmed = true;
      }

      if (!txHistoryUnique[tx.txid]) {
        ret.push(tx);
        txHistoryUnique[tx.txid] = true;
      } else {
        $log.debug('Ignoring duplicate TX in history: ' + tx.txid)
      }
    });

    return ret;
  };

  self.updateAlias = function() {
    var config = configService.getSync();
    config.aliasFor = config.aliasFor || {};
    self.alias = config.aliasFor[self.walletId];
    var fc = profileService.focusedClient;
    fc.alias = self.alias;
  };

  self.updateColor = function() {
    var config = configService.getSync();
    config.colorFor = config.colorFor || {};
    self.backgroundColor = config.colorFor[self.walletId] || '#4A90E2';
    var fc = profileService.focusedClient;
    fc.backgroundColor = self.backgroundColor;
    if (isCordova && StatusBar.isVisible) {
      StatusBar.backgroundColorByHexString(fc.backgroundColor);
    }
  };

  self.setBalance = function(balance) {
    if (!balance) return;
    var config = configService.getSync().wallet.settings;
    var COIN = 1e8;


    // Address with Balance
    self.balanceByAddress = balance.byAddress;

    // Spend unconfirmed funds
    if (self.spendUnconfirmed) {
      self.totalBalanceSat = balance.totalAmount;
      self.lockedBalanceSat = balance.lockedAmount;
      self.availableBalanceSat = balance.availableAmount;
      self.totalBytesToSendMax = balance.totalBytesToSendMax;
      self.pendingAmount = null;
    } else {
      self.totalBalanceSat = balance.totalConfirmedAmount;
      self.lockedBalanceSat = balance.lockedConfirmedAmount;
      self.availableBalanceSat = balance.availableConfirmedAmount;
      self.totalBytesToSendMax = balance.totalBytesToSendConfirmedMax;
      self.pendingAmount = balance.totalAmount - balance.totalConfirmedAmount;
    }

    // Selected unit
    self.unitToSatoshi = config.unitToSatoshi;
    self.satToUnit = 1 / self.unitToSatoshi;
    self.unitName = config.unitName;

    //STR
    self.totalBalanceStr = profileService.formatAmount(self.totalBalanceSat) + ' ' + self.unitName;
    self.lockedBalanceStr = profileService.formatAmount(self.lockedBalanceSat) + ' ' + self.unitName;
    self.availableBalanceStr = profileService.formatAmount(self.availableBalanceSat) + ' ' + self.unitName;

    if (self.pendingAmount) {
      self.pendingAmountStr = profileService.formatAmount(self.pendingAmount) + ' ' + self.unitName;
    } else {
      self.pendingAmountStr = null;
    }

    self.alternativeName = config.alternativeName;
    self.alternativeIsoCode = config.alternativeIsoCode;

    // Set fee level and max value to send all
    self.setCurrentFeeLevel();

    // Check address
    addressService.isUsed(self.walletId, balance.byAddress, function(err, used) {
      if (used) {
        $log.debug('Address used. Creating new');
        $rootScope.$emit('Local/NeedNewAddress');
      }
    });

    rateService.whenAvailable(function() {

      var totalBalanceAlternative = rateService.toFiat(self.totalBalanceSat, self.alternativeIsoCode);
      var lockedBalanceAlternative = rateService.toFiat(self.lockedBalanceSat, self.alternativeIsoCode);
      var alternativeConversionRate = rateService.toFiat(100000000, self.alternativeIsoCode);

      self.totalBalanceAlternative = $filter('noFractionNumber')(totalBalanceAlternative, 2);
      self.lockedBalanceAlternative = $filter('noFractionNumber')(lockedBalanceAlternative, 2);
      self.alternativeConversionRate = $filter('noFractionNumber')(alternativeConversionRate, 2);

      self.alternativeBalanceAvailable = true;

      self.isRateAvailable = true;
      $rootScope.$apply();
    });

    if (!rateService.isAvailable()) {
      $rootScope.$apply();
    }
  };

  this.csvHistory = function() {

    function saveFile(name, data) {
      var chooser = document.querySelector(name);
      chooser.addEventListener("change", function(evt) {
        var fs = require('fs');
        fs.writeFile(this.value, data, function(err) {
          if (err) {
            $log.debug(err);
          }
        });
      }, false);
      chooser.click();
    }

    function formatDate(date) {
      var dateObj = new Date(date);
      if (!dateObj) {
        $log.debug('Error formating a date');
        return 'DateError'
      }
      if (!dateObj.toJSON()) {
        return '';
      }

      return dateObj.toJSON();
    }

    function formatString(str) {
      if (!str) return '';

      if (str.indexOf('"') !== -1) {
        //replace all
        str = str.replace(new RegExp('"', 'g'), '\'');
      }

      //escaping commas
      str = '\"' + str + '\"';

      return str;
    }

    var step = 6;
    var unique = {};

    function getHistory(cb) {
      storageService.getTxHistory(c.walletId, function(err, txs) {
        if (err) return cb(err);

        var txsFromLocal = [];
        try {
          txsFromLocal = JSON.parse(txs);
        } catch (ex) {
          $log.warn(ex);
        }

        allTxs.push(txsFromLocal);
        return cb(null, lodash.flatten(allTxs));
      });
    }

    if (isCordova) {
      $log.info('CSV generation not available in mobile');
      return;
    }
    var isNode = nodeWebkit.isDefined();
    var fc = profileService.focusedClient;
    var c = fc.credentials;
    if (!fc.isComplete()) return;
    var self = this;
    var allTxs = [];

    $log.debug('Generating CSV from History');
    self.setOngoingProcess('generatingCSV', true);

    $timeout(function() {
      getHistory(function(err, txs) {
        self.setOngoingProcess('generatingCSV', false);
        if (err) {
          self.handleError(err);
        } else {
          $log.debug('Wallet Transaction History:', txs);

          self.satToUnit = 1 / self.unitToSatoshi;
          var data = txs;
          var satToBtc = 1 / 100000000;
          var filename = 'Copay-' + (self.alias || self.walletName) + '.csv';
          var csvContent = '';

          if (!isNode) csvContent = 'data:text/csv;charset=utf-8,';
          csvContent += 'Date,Destination,Note,Amount,Currency,Txid,Creator,Copayers\n';

          var _amount, _note, _copayers, _creator;
          var dataString;
          data.forEach(function(it, index) {
            var amount = it.amount;

            if (it.action == 'moved')
              amount = 0;

            _copayers = '';
            _creator = '';

            if (it.actions && it.actions.length > 1) {
              for (var i = 0; i < it.actions.length; i++) {
                _copayers += it.actions[i].copayerName + ':' + it.actions[i].type + ' - ';
              }
              _creator = (it.creatorName && it.creatorName != 'undefined') ? it.creatorName : '';
            }
            _copayers = formatString(_copayers);
            _creator = formatString(_creator);
            _amount = (it.action == 'sent' ? '-' : '') + (amount * satToBtc).toFixed(8);
            _note = formatString((it.message ? it.message : ''));

            if (it.action == 'moved')
              _note += ' Moved:' + (it.amount * satToBtc).toFixed(8)

            dataString = formatDate(it.time * 1000) + ',' + formatString(it.addressTo) + ',' + _note + ',' + _amount + ',BTC,' + it.txid + ',' + _creator + ',' + _copayers;
            csvContent += dataString + "\n";

            if (it.fees && (it.action == 'moved' || it.action == 'sent')) {
              var _fee = (it.fees * satToBtc).toFixed(8)
              csvContent += formatDate(it.time * 1000) + ',Bitcoin Network Fees,, -' + _fee + ',BTC,,,' + "\n";
            }
          });

          if (isNode) {
            saveFile('#export_file', csvContent);
          } else {
            var encodedUri = encodeURI(csvContent);
            var link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", filename);
            link.click();
          }
        }
        $rootScope.$apply();
      });
    });
  };

  self.removeSoftConfirmedTx = function(txs) {
    return lodash.map(txs, function(tx) {
      if (tx.confirmations >= SOFT_CONFIRMATION_LIMIT)
        return tx;
    });
  }

  self.getConfirmedTxs = function(walletId, cb) {

    storageService.getTxHistory(walletId, function(err, txs) {
      if (err) return cb(err);

      var localTxs = [];

      if (!txs) {
        return cb(null, localTxs);
      }

      try {
        localTxs = JSON.parse(txs);
      } catch (ex) {
        $log.warn(ex);
      }
      return cb(null, lodash.compact(self.removeSoftConfirmedTx(localTxs)));
    });
  }

  self.updateLocalTxHistory = function(client, cb) {
    var requestLimit = 6;
    var walletId = client.credentials.walletId;
    var config = configService.getSync().wallet.settings;

    var fixTxsUnit = function(txs) {
      if (!txs || !txs[0]) return;

      var cacheUnit = txs[0].amountStr.split(' ')[1];

      if (cacheUnit == config.unitName)
        return;

      var name = ' ' + config.unitName;

      $log.debug('Fixing Tx Cache Unit to:' + name)
      lodash.each(txs, function(tx) {

        tx.amountStr = profileService.formatAmount(tx.amount, config.unitName) + name;
        tx.feeStr = profileService.formatAmount(tx.fees, config.unitName) + name;
      });
    };

    self.getConfirmedTxs(walletId, function(err, txsFromLocal) {
      if (err) return cb(err);
      var endingTxid = txsFromLocal[0] ? txsFromLocal[0].txid : null;

      fixTxsUnit(txsFromLocal);

      function getNewTxs(newTxs, skip, i_cb) {
        self.getTxsFromServer(client, skip, endingTxid, requestLimit, function(err, res, shouldContinue) {
          if (err) return i_cb(err);

          newTxs = newTxs.concat(lodash.compact(res));
          skip = skip + requestLimit;

          $log.debug('Syncing TXs. Got:' + newTxs.length + ' Skip:' + skip, ' EndingTxid:', endingTxid, ' Continue:', shouldContinue);

          if (!shouldContinue) {
            newTxs = self.processNewTxs(newTxs);
            $log.debug('Finish Sync: New Txs: ' + newTxs.length);
            return i_cb(null, newTxs);
          }

          if (walletId == profileService.focusedClient.credentials.walletId)
            self.txProgress = newTxs.length;

          $timeout(function() {
            $rootScope.$apply();
          });
          getNewTxs(newTxs, skip, i_cb);
        });
      };

      getNewTxs([], 0, function(err, txs) {
        if (err) return cb(err);

        var newHistory = lodash.compact(txs.concat(txsFromLocal));
        $log.debug('Tx History synced. Total Txs: ' + newHistory.length);

        if (walletId == profileService.focusedClient.credentials.walletId) {
          self.completeHistory = newHistory;
          self.txHistory = newHistory.slice(0, self.historyShowLimit);
          self.historyShowShowAll = newHistory.length >= self.historyShowLimit;
        }

        return storageService.setTxHistory(JSON.stringify(newHistory), walletId, function() {
          return cb();
        });
      });
    });
  }
  self.showAllHistory = function() {
    self.historyShowShowAll = false;
    self.historyRendering = true;
    $timeout(function() {
      $rootScope.$apply();
      $timeout(function() {
        self.historyRendering = false;
        self.txHistory = self.completeHistory;
      }, 100);
    }, 100);
  };

  self.getTxsFromServer = function(client, skip, endingTxid, limit, cb) {
    var res = [];

    client.getTxHistory({
      skip: skip,
      limit: limit
    }, function(err, txsFromServer) {
      if (err) return cb(err);

      if (!txsFromServer.length)
        return cb();

      var res = lodash.takeWhile(txsFromServer, function(tx) {
        return tx.txid != endingTxid;
      });

      return cb(null, res, res.length == limit);
    });
  };

  self.updateHistory = function() {
    var fc = profileService.focusedClient;
    if (!fc) return;
    var walletId = fc.credentials.walletId;

    if (!fc.isComplete() || self.updatingTxHistory[walletId]) return;

    $log.debug('Updating Transaction History');
    self.txHistoryError = false;
    self.updatingTxHistory[walletId] = true;

    $timeout(function() {
      self.updateLocalTxHistory(fc, function(err) {
        self.updatingTxHistory[walletId] = false;
        self.loadingWallet = false;
        self.txProgress = 0;
        if (err)
          self.txHistoryError = true;

        $timeout(function() {
          self.newTx = false
        }, 1000);

        $rootScope.$apply();
      });
    });
  };

  self.debounceUpdateHistory = lodash.debounce(function() {
    self.updateHistory();
  }, 1000);

  self.throttledUpdateHistory = lodash.throttle(function() {
    self.updateHistory();
  }, 10000);

  self.showErrorPopup = function(msg, cb) {
    $log.warn('Showing err popup:' + msg);
    self.showAlert = {
      msg: msg,
      close: function() {
        self.showAlert = null;
        if (cb) return cb();
      },
    };
    $timeout(function() {
      $rootScope.$apply();
    });
  };

  self.recreate = function(cb) {
    var fc = profileService.focusedClient;
    self.setOngoingProcess('recreating', true);
    fc.recreateWallet(function(err) {
      self.notAuthorized = false;
      self.setOngoingProcess('recreating', false);

      if (err) {
        self.handleError(err);
        $rootScope.$apply();
        return;
      }

      profileService.setWalletClients();
      self.startScan(self.walletId);
    });
  };

  self.openMenu = function() {
    if (!self.disclaimerAccepted) return;
    go.swipe(true);
  };

  self.closeMenu = function() {
    go.swipe();
  };

  self.retryScan = function() {
    var self = this;
    self.startScan(self.walletId);
  }

  self.startScan = function(walletId) {
    $log.debug('Scanning wallet ' + walletId);
    var c = profileService.walletClients[walletId];
    if (!c.isComplete()) return;

    if (self.walletId == walletId)
      self.setOngoingProcess('scanning', true);

    c.startScan({
      includeCopayerBranches: true,
    }, function(err) {
      if (err && self.walletId == walletId) {
        self.setOngoingProcess('scanning', false);
        self.handleError(err);
        $rootScope.$apply();
      }
    });
  };

  self.setUxLanguage = function() {
    uxLanguage.update(function(lang) {
      var userLang = lang;
      self.defaultLanguageIsoCode = userLang;
      self.defaultLanguageName = uxLanguage.getName(userLang);
    });
  };

  self.initGlidera = function(accessToken) {
    self.glideraEnabled = configService.getSync().glidera.enabled;
    self.glideraTestnet = configService.getSync().glidera.testnet;
    var network = self.glideraTestnet ? 'testnet' : 'livenet';

    self.glideraToken = null;
    self.glideraError = null;
    self.glideraPermissions = null;
    self.glideraEmail = null;
    self.glideraPersonalInfo = null;
    self.glideraTxs = null;
    self.glideraStatus = null;

    if (!self.glideraEnabled) return;

    glideraService.setCredentials(network);

    var getToken = function(cb) {
      if (accessToken) {
        cb(null, accessToken);
      } else {
        storageService.getGlideraToken(network, cb);
      }
    };

    getToken(function(err, accessToken) {
      if (err || !accessToken) return;
      else {
        self.glideraLoading = 'Connecting to Glidera...';
        glideraService.getAccessTokenPermissions(accessToken, function(err, p) {
          self.glideraLoading = null;
          if (err) {
            self.glideraError = err;
          } else {
            self.glideraToken = accessToken;
            self.glideraPermissions = p;
            self.updateGlidera({
              fullUpdate: true
            });
          }
        });
      }
    });
  };

  self.updateGlidera = function(opts) {
    if (!self.glideraToken || !self.glideraPermissions) return;
    var accessToken = self.glideraToken;
    var permissions = self.glideraPermissions;

    opts = opts || {};

    glideraService.getStatus(accessToken, function(err, data) {
      self.glideraStatus = data;
    });

    glideraService.getLimits(accessToken, function(err, limits) {
      self.glideraLimits = limits;
    });

    if (permissions.transaction_history) {
      self.glideraLoadingHistory = 'Getting Glidera transactions...';
      glideraService.getTransactions(accessToken, function(err, data) {
        self.glideraLoadingHistory = null;
        self.glideraTxs = data;
      });
    }

    if (permissions.view_email_address && opts.fullUpdate) {
      self.glideraLoadingEmail = 'Getting Glidera Email...';
      glideraService.getEmail(accessToken, function(err, data) {
        self.glideraLoadingEmail = null;
        self.glideraEmail = data.email;
      });
    }
    if (permissions.personal_info && opts.fullUpdate) {
      self.glideraLoadingPersonalInfo = 'Getting Glidera Personal Information...';
      glideraService.getPersonalInfo(accessToken, function(err, data) {
        self.glideraLoadingPersonalInfo = null;
        self.glideraPersonalInfo = data;
      });
    }

  };

  self.setAddressbook = function(ab) {
    if (ab) {
      self.addressbook = ab;
      return;
    }

    addressbookService.list(function(err, ab) {
      if (err) {
        $log.error('Error getting the addressbook');
        return;
      }
      self.addressbook = ab;
    });
  };

  $rootScope.$on('$stateChangeSuccess', function(ev, to, toParams, from, fromParams) {
    self.prevState = from.name || 'walletHome';
    self.tab = 'walletHome';
  });

  $rootScope.$on('Local/ClearHistory', function(event) {
    $log.debug('The wallet transaction history has been deleted');
    self.txHistory = self.completeHistory = [];
    self.debounceUpdateHistory();
  });

  $rootScope.$on('Local/AddressbookUpdated', function(event, ab) {
    self.setAddressbook(ab);
  });

  // UX event handlers
  $rootScope.$on('Local/ColorUpdated', function(event) {
    self.updateColor();
    $timeout(function() {
      $rootScope.$apply();
    });
  });

  $rootScope.$on('Local/AliasUpdated', function(event) {
    self.updateAlias();
    $timeout(function() {
      $rootScope.$apply();
    });
  });

  $rootScope.$on('Local/SpendUnconfirmedUpdated', function(event, spendUnconfirmed) {
    self.setSpendUnconfirmed(spendUnconfirmed);
    self.updateAll();
  });

  $rootScope.$on('Local/FeeLevelUpdated', function(event, level) {
    self.setCurrentFeeLevel(level);
  });

  $rootScope.$on('Local/SetFeeSendMax', function(event, cb) {
    self.setFeeAndSendMax(cb);
  });

  $rootScope.$on('Local/ProfileBound', function() {
    storageService.getRemotePrefsStoredFlag(function(err, val) {
      if (err || val) return;
      self.updateRemotePreferences({
        saveAll: true
      }, function() {
        $log.debug('Remote preferences saved')
        storageService.setRemotePrefsStoredFlag(function() {});
      });
    });
  });

  $rootScope.$on('Local/LanguageSettingUpdated', function() {
    self.setUxLanguage(function() {
      self.updateRemotePreferences({
        saveAll: true
      }, function() {
        $log.debug('Remote preferences saved')
      });
    });
  });

  $rootScope.$on('Local/GlideraUpdated', function(event, accessToken) {
    self.initGlidera(accessToken);
  });

  $rootScope.$on('Local/GlideraTx', function(event, accessToken, permissions) {
    self.updateGlidera();
  });

  $rootScope.$on('Local/GlideraError', function(event) {
    self.debouncedUpdate();
  });

  $rootScope.$on('Local/UnitSettingUpdated', function(event) {
    self.updateAll({
      triggerTxUpdate: true,
    });
    self.updateRemotePreferences({
      saveAll: true
    }, function() {
      $log.debug('Remote preferences saved')
    });
  });

  $rootScope.$on('Local/EmailSettingUpdated', function(event, email, cb) {
    self.updateRemotePreferences({
      preferences: {
        email: email || null
      },
    }, cb);
  });

  $rootScope.$on('Local/WalletCompleted', function(event) {
    self.setFocusedWallet();
    go.walletHome();
  });

  self.debouncedUpdate = lodash.throttle(function() {
    self.updateAll({
      quiet: true
    });
    self.debounceUpdateHistory();
  }, 4000, {
    leading: false,
    trailing: true
  });

  $rootScope.$on('Local/Resume', function(event) {
    $log.debug('### Resume event');
    self.isDisclaimerAccepted();
    self.debouncedUpdate();
  });

  $rootScope.$on('Local/BackupDone', function(event, walletId) {
    self.needsBackup = false;
    $log.debug('Backup done');
    storageService.setBackupFlag(walletId || self.walletId, function(err) {
      $log.debug('Backup done stored');
    });
  });

  $rootScope.$on('Local/DeviceError', function(event, err) {
    self.showErrorPopup(err, function() {
      if (self.isCordova && navigator && navigator.app) {
        navigator.app.exitApp();
      }
    });
  });

  $rootScope.$on('Local/WalletImported', function(event, walletId) {
    self.needsBackup = false;
    storageService.setBackupFlag(walletId, function() {
      $log.debug('Backup done stored');
      addressService.expireAddress(walletId, function(err) {
        $timeout(function() {
          self.txHistory = self.completeHistory = [];
          storageService.removeTxHistory(walletId, function() {
            self.startScan(walletId);
          });
        }, 500);
      });
    });
  });

  $rootScope.$on('NewIncomingTx', function() {
    self.newTx = true;
    self.updateAll({
      walletStatus: null,
      untilItChanges: true,
      triggerTxUpdate: true,
    });
  });


  $rootScope.$on('NewBlock', function() {
    if (self.glideraEnabled) {
      $timeout(function() {
        self.updateGlidera();
      });
    }
    if (self.pendingAmount) {
      self.updateAll({
        walletStatus: null,
        untilItChanges: null,
        triggerTxUpdate: true,
      });
    } else if (self.hasUnsafeConfirmed) {
      $log.debug('Wallet has transactions with few confirmations. Updating.')
      if (self.network == 'testnet') {
        self.throttledUpdateHistory();
      } else {
        self.debounceUpdateHistory();
      }
    }
  });

  $rootScope.$on('BalanceUpdated', function(e, n) {
    self.setBalance(n.data);
  });

  $rootScope.$on('NewOutgoingTx', function() {
    self.newTx = true;
    self.updateAll({
      walletStatus: null,
      untilItChanges: true,
      triggerTxUpdate: true,
    });
  });

  lodash.each(['NewTxProposal', 'TxProposalFinallyRejected', 'TxProposalRemoved', 'NewOutgoingTxByThirdParty',
    'Local/NewTxProposal', 'Local/TxProposalAction', 'Local/GlideraTx'
  ], function(eventName) {
    $rootScope.$on(eventName, function(event, untilItChanges) {
      self.newTx = eventName == 'Local/TxProposalAction' && untilItChanges;
      self.updateAll({
        walletStatus: null,
        untilItChanges: untilItChanges,
        triggerTxUpdate: true,
      });
    });
  });

  $rootScope.$on('ScanFinished', function() {
    $log.debug('Scan Finished. Updating history');
    storageService.removeTxHistory(self.walletId, function() {
      self.updateAll({
        walletStatus: null,
        triggerTxUpdate: true,
      });
    });
  });

  lodash.each(['TxProposalRejectedBy', 'TxProposalAcceptedBy'], function(eventName) {
    $rootScope.$on(eventName, function() {
      var f = function() {
        if (self.updatingStatus) {
          return $timeout(f, 200);
        };
        self.updatePendingTxps();
      };
      f();
    });
  });

  $rootScope.$on('Local/NoWallets', function(event) {

    $timeout(function() {
      self.hasProfile = true;
      self.noFocusedWallet = true;
      self.isComplete = null;
      self.walletName = null;
      self.setUxLanguage(function() {});
      profileService.isDisclaimerAccepted(function(v) {
        if (v) {
          go.path('import');
        }
      });
    });
  });

  $rootScope.$on('Local/NewFocusedWallet', function() {
    self.setUxLanguage(function() {});
    self.setFocusedWallet();
    self.debounceUpdateHistory();
    self.isDisclaimerAccepted();
    storageService.getCleanAndScanAddresses(function(err, walletId) {
      if (walletId && profileService.walletClients[walletId]) {
        $log.debug('Clear last address cache and Scan ', walletId);
        addressService.expireAddress(walletId, function(err) {
          self.startScan(walletId);
        });
        storageService.removeCleanAndScanAddresses(function() {});
      }
    });
  });

  $rootScope.$on('Local/SetTab', function(event, tab, reset) {
    self.setTab(tab, reset);
  });

  $rootScope.$on('Local/RequestTouchid', function(event, cb) {
    window.plugins.touchid.verifyFingerprint(
      gettextCatalog.getString('Scan your fingerprint please'),
      function(msg) {
        // OK
        return cb();
      },
      function(msg) {
        // ERROR
        return cb(gettext('Invalid Touch ID'));
      }
    );
  });

  $rootScope.$on('Local/NeedsPassword', function(event, isSetup, cb) {
    self.askPassword = {
      isSetup: isSetup,
      callback: function(err, pass) {
        self.askPassword = null;
        return cb(err, pass);
      },
    };
  });

  lodash.each(['NewCopayer', 'CopayerUpdated'], function(eventName) {
    $rootScope.$on(eventName, function() {
      // Re try to open wallet (will triggers)
      self.setFocusedWallet();
    });
  });

  $rootScope.$on('Local/NewEncryptionSetting', function() {
    var fc = profileService.focusedClient;
    self.isPrivKeyEncrypted = fc.isPrivKeyEncrypted();
    $timeout(function() {
      $rootScope.$apply();
    });
  });
 
});

'use strict';

angular.module('copayApp.controllers').controller('joinController',
  function($scope, $rootScope, $timeout, go, notification, profileService, configService, isCordova, storageService, applicationService, $modal, gettext, lodash, ledger, trezor, isChromeApp, isDevel,derivationPathHelper) {

    var self = this;
    var defaults = configService.getDefaults();
    $scope.bwsurl = defaults.bws.url;
    $scope.derivationPath = derivationPathHelper.default;
    $scope.account = 1;

    this.onQrCodeScanned = function(data) {
      $scope.secret = data;
      $scope.joinForm.secret.$setViewValue(data);
      $scope.joinForm.secret.$render();
    };


    var updateSeedSourceSelect = function() {
      self.seedOptions = [{
        id: 'new',
        label: gettext('New Random Seed'),
      }, {
        id: 'set',
        label: gettext('Specify Seed...'),
      }];
      $scope.seedSource = self.seedOptions[0];


      if (isChromeApp) {
        self.seedOptions.push({
          id: 'ledger',
          label: 'Ledger Hardware Wallet',
        });
      }

      if (isChromeApp || isDevel) {
        self.seedOptions.push({
          id: 'trezor',
          label: 'Trezor Hardware Wallet',
        });
      }
    };

    this.setSeedSource = function(src) {
      self.seedSourceId = $scope.seedSource.id;

      $timeout(function() {
        $rootScope.$apply();
      });
    };

    this.join = function(form) {
      if (form && form.$invalid) {
        self.error = gettext('Please enter the required fields');
        return;
      }

      var opts = {
        secret: form.secret.$modelValue,
        myName: form.myName.$modelValue,
        bwsurl: $scope.bwsurl,
      }

      var setSeed = self.seedSourceId =='set';
      if (setSeed) {
        var words = form.privateKey.$modelValue;
        if (words.indexOf(' ') == -1 && words.indexOf('prv') == 1 && words.length > 108) {
          opts.extendedPrivateKey = words;
        } else {
          opts.mnemonic = words;
        }
        opts.passphrase = form.passphrase.$modelValue;

        var pathData = derivationPathHelper.parse($scope.derivationPath);
        if (!pathData) {
          this.error = gettext('Invalid derivation path');
          return;
        }
        opts.account = pathData.account;
        opts.networkName = pathData.networkName;
        opts.derivationStrategy = pathData.derivationStrategy;
      } else {
        opts.passphrase = form.createPassphrase.$modelValue;
      }

      if (setSeed && !opts.mnemonic && !opts.extendedPrivateKey) {
        this.error = gettext('Please enter the wallet seed');
        return;
      }

      if (self.seedSourceId == 'ledger' || self.seedSourceId == 'trezor') {
        var account = $scope.account;
        if (!account || account < 1) {
          this.error = gettext('Invalid account number');
          return;
        }

        if ( self.seedSourceId == 'trezor')
          account = account - 1;

        opts.account =  account;
        self.hwWallet = self.seedSourceId == 'ledger' ? 'Ledger' : 'Trezor';
        var src = self.seedSourceId == 'ledger' ? ledger : trezor;

        src.getInfoForNewWallet(true, account, function(err, lopts) {
          self.hwWallet = false;
          if (err) {
            self.error = err;
            $scope.$apply();
            return;
          }
          opts = lodash.assign(lopts, opts);
          self._join(opts);
        });
      } else {
        self._join(opts);
      }
    };

    this._join = function(opts) {
      self.loading = true;
      $timeout(function() {
        profileService.joinWallet(opts, function(err) {
          if (err) {
            self.loading = false;
            self.error = err;
            $rootScope.$apply();
            return;
          }

        });
      }, 100);
    };

    updateSeedSourceSelect();
    self.setSeedSource('new');
  });

angular.module('copayApp.controllers').controller('paperWalletController',
  function($scope, $http, $timeout, $log, configService, profileService, go, addressService, txStatus, bitcore) {
    var self = this;
    var fc = profileService.focusedClient;
    var rawTx;

    self.onQrCodeScanned = function(data) {
      $scope.inputData = data;
      self.onData(data);
    }

    self.onData = function(data) {
      self.error = '';
      self.scannedKey = data;
      self.isPkEncrypted = (data.charAt(0) == '6');
    }

    self._scanFunds = function(cb) {
      function getPrivateKey(scannedKey, isPkEncrypted, passphrase, cb) {
        if (!isPkEncrypted) return cb(null, scannedKey);
        fc.decryptBIP38PrivateKey(scannedKey, passphrase, null, cb);
      };

      function getBalance(privateKey, cb) {
        fc.getBalanceFromPrivateKey(privateKey, cb);
      };

      function checkPrivateKey(privateKey) {
        try {
          new bitcore.PrivateKey(privateKey, 'livenet');
        } catch (err) {
          return false;
        }
        return true;
      }

      getPrivateKey(self.scannedKey, self.isPkEncrypted, $scope.passphrase, function(err, privateKey) {
        if (err) return cb(err);
        if (!checkPrivateKey(privateKey)) return cb(new Error('Invalid private key'));

        getBalance(privateKey, function(err, balance) {
          if (err) return cb(err);
          return cb(null, privateKey, balance);
        });
      });
    }

    self.scanFunds = function() {
      self.scanning = true;
      self.privateKey = '';
      self.balanceSat = 0;
      self.error = '';

      $timeout(function() {
        self._scanFunds(function(err, privateKey, balance) {
          self.scanning = false;
          if (err) {
            $log.error(err);
            self.error = err.message || err.toString();
          } else {
            self.privateKey = privateKey;
            self.balanceSat = balance;
            var config = configService.getSync().wallet.settings;
            self.balance = profileService.formatAmount(balance) + ' ' + config.unitName;
          }

          $scope.$apply();
        });
      }, 100);
    }

    self._sweepWallet = function(cb) {
      addressService.getAddress(fc.credentials.walletId, true, function(err, destinationAddress) {
        if (err) return cb(err);

        fc.buildTxFromPrivateKey(self.privateKey, destinationAddress, null, function(err, tx) {
          if (err) return cb(err);

          fc.broadcastRawTx({
            rawTx: tx.serialize(),
            network: 'livenet'
          }, function(err, txid) {
            if (err) return cb(err);
            return cb(null, destinationAddress, txid);
          });
        });
      });
    };

    self.sweepWallet = function() {
      self.sending = true;
      self.error = '';

      $timeout(function() {
        self._sweepWallet(function(err, destinationAddress, txid) {
          self.sending = false;

          if (err) {
            self.error = err.message || err.toString();
            $log.error(err);
          } else {
            txStatus.notify({
              status: 'broadcasted'
            }, function() {
              go.walletHome();
            });
          }

          $scope.$apply();
        });
      }, 100);
    }
  });

'use strict';

angular.module('copayApp.controllers').controller('passwordController',
  function($rootScope, $scope, $timeout, profileService, notification, go, gettext) {

    var self = this;

    var pass1;

    self.isVerification = false;

    document.getElementById("passwordInput").focus();

    self.close = function(cb) {
      return cb('No password given');
    };

    self.set = function(isSetup, cb) {
      self.error = false;

      if (isSetup && !self.isVerification) {
        document.getElementById("passwordInput").focus();
        self.isVerification = true;
        pass1 = self.password;
        self.password = null;
        $timeout(function() {
          $rootScope.$apply();
        })
        return;
      }
      if (isSetup) {
        if (pass1 != self.password) {
          self.error = gettext('Passwords do not match');
          self.isVerification = false;
          self.password = null;
          pass1 = null;

          return;
        }
      }
      return cb(null, self.password);
    };

  });
'use strict';
angular.module('copayApp.controllers').controller('paymentUriController',
  function($rootScope, $stateParams, $location, $timeout, profileService, configService, lodash, bitcore, go) {

    function strip(number) {
      return (parseFloat(number.toPrecision(12)));
    };

    // Build bitcoinURI with querystring
    this.checkBitcoinUri = function() {
      var query = [];
      angular.forEach($location.search(), function(value, key) {
        query.push(key + "=" + value);
      });
      var queryString = query ? query.join("&") : null;
      this.bitcoinURI = $stateParams.data + (queryString ? '?' + queryString : '');

      var URI = bitcore.URI;
      var isUriValid = URI.isValid(this.bitcoinURI);
      if (!URI.isValid(this.bitcoinURI)) {
        this.error = true;
        return;
      }
      var uri = new URI(this.bitcoinURI);

      if (uri && uri.address) {
        var config = configService.getSync().wallet.settings;
        var unitToSatoshi = config.unitToSatoshi;
        var satToUnit = 1 / unitToSatoshi;
        var unitName = config.unitName;

        if (uri.amount) {
          uri.amount = strip(uri.amount * satToUnit) + ' ' + unitName;
        }
        uri.network = uri.address.network.name;
        this.uri = uri;
      }
    };

    this.getWallets = function(network) {
      return profileService.getWallets(network);
    };

    this.selectWallet = function(wid) {
      var self = this;
      if (wid != profileService.focusedClient.credentials.walletId) {
        profileService.setAndStoreFocus(wid, function() {});
      }
      $timeout(function() {
        $rootScope.$emit('paymentUri', self.bitcoinURI);
      }, 1000);
    };
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesController',
  function($scope, $rootScope, $timeout, $log, configService, profileService) {

    var fc = profileService.focusedClient;
    $scope.deleted = false;
    if (fc.credentials && !fc.credentials.mnemonicEncrypted && !fc.credentials.mnemonic) {
      $scope.deleted = true;
    }

    this.init = function() {
      var config = configService.getSync();
      var fc = profileService.focusedClient;
      if (fc) {
        $scope.encrypt = fc.hasPrivKeyEncrypted();
        this.externalSource = fc.getPrivKeyExternalSourceName() == 'ledger' ? "Ledger" : null;
        // TODO externalAccount
        //this.externalIndex = fc.getExternalIndex();
      }

      if (window.touchidAvailable) {
        var walletId = fc.credentials.walletId;
        this.touchidAvailable = true;
        config.touchIdFor = config.touchIdFor || {};
        $scope.touchid = config.touchIdFor[walletId];
      }
    };

    var unwatchEncrypt = $scope.$watch('encrypt', function(val) {
      var fc = profileService.focusedClient;
      if (!fc) return;

      if (val && !fc.hasPrivKeyEncrypted()) {
        $rootScope.$emit('Local/NeedsPassword', true, function(err, password) {
          if (err || !password) {
            $scope.encrypt = false;
            return;
          }
          profileService.setPrivateKeyEncryptionFC(password, function() {
            $rootScope.$emit('Local/NewEncryptionSetting');
            $scope.encrypt = true;
          });
        });
      } else {
        if (!val && fc.hasPrivKeyEncrypted()) {
          profileService.unlockFC(function(err) {
            if (err) {
              $scope.encrypt = true;
              return;
            }
            profileService.disablePrivateKeyEncryptionFC(function(err) {
              $rootScope.$emit('Local/NewEncryptionSetting');
              if (err) {
                $scope.encrypt = true;
                $log.error(err);
                return;
              }
              $scope.encrypt = false;
            });
          });
        }
      }
    });

    var unwatchRequestTouchid = $scope.$watch('touchid', function(newVal, oldVal) {
      if (newVal == oldVal || $scope.touchidError) {
        $scope.touchidError = false;
        return;
      }
      var walletId = profileService.focusedClient.credentials.walletId;

      var opts = {
        touchIdFor: {}
      };
      opts.touchIdFor[walletId] = newVal;

      $rootScope.$emit('Local/RequestTouchid', function(err) {
        if (err) {
          $log.debug(err);
          $timeout(function() {
            $scope.touchidError = true;
            $scope.touchid = oldVal;
          }, 100);
        } else {
          configService.set(opts, function(err) {
            if (err) {
              $log.debug(err);
              $scope.touchidError = true;
              $scope.touchid = oldVal;
            }
          });
        }
      });
    });

    $scope.$on('$destroy', function() {
      unwatchEncrypt();
      unwatchRequestTouchid();
    });
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesAbout',
  function() {});

'use strict';

angular.module('copayApp.controllers').controller('preferencesAdvancedController',
  function($scope) {

  });
'use strict';

angular.module('copayApp.controllers').controller('preferencesAliasController',
  function($scope, $timeout, configService, profileService, go) {
    var config = configService.getSync();
    var fc = profileService.focusedClient;
    var walletId = fc.credentials.walletId;

    var config = configService.getSync();
    config.aliasFor = config.aliasFor || {};
    this.alias = config.aliasFor[walletId] || fc.credentials.walletName;

    this.save = function() {
      var self = this;
      var opts = {
        aliasFor: {}
      };
      opts.aliasFor[walletId] = self.alias;

      configService.set(opts, function(err) {
        if (err) {
          $scope.$emit('Local/DeviceError', err);
          return;
        }
        $scope.$emit('Local/AliasUpdated');
        $timeout(function(){
          go.path('preferences');
        }, 50);
      });

    };
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesAltCurrencyController',
  function($scope, $timeout, $log, configService, rateService, lodash, go) {
    this.hideAdv = true;
    this.hidePriv = true;
    this.hideSecret = true;
    this.error = null;
    this.success = null;

    var config = configService.getSync();

    this.selectedAlternative = {
      name: config.wallet.settings.alternativeName,
      isoCode: config.wallet.settings.alternativeIsoCode
    };

    this.alternativeOpts = [this.selectedAlternative]; //default value

    var self = this;
    rateService.whenAvailable(function() {
      self.alternativeOpts = rateService.listAlternatives();
      lodash.remove(self.alternativeOpts, function(n) {
        return n.isoCode == 'BTC';
      });

      for (var ii in self.alternativeOpts) {
        if (config.wallet.settings.alternativeIsoCode === self.alternativeOpts[ii].isoCode) {
          self.selectedAlternative = self.alternativeOpts[ii];
        }
      }
      $scope.$digest();
    });


    this.save = function(newAltCurrency) {
      var opts = {
        wallet: {
          settings: {
            alternativeName: newAltCurrency.name,
            alternativeIsoCode: newAltCurrency.isoCode,
          }
        }
      };
      this.selectedAlternative = {
        name: newAltCurrency.name,
        isoCode: newAltCurrency.isoCode,
      };

      configService.set(opts, function(err) {
        if (err) $log.warn(err);
        go.preferencesGlobal();
        $scope.$emit('Local/UnitSettingUpdated');
        $timeout(function() {
          $scope.$apply();
        }, 100);
      });
    };


  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesBwsUrlController',
  function($scope, $log, configService, go, applicationService, profileService, storageService) {
    this.error = null;
    this.success = null;

    var fc = profileService.focusedClient;
    var walletId = fc.credentials.walletId;
    var defaults = configService.getDefaults();
    var config = configService.getSync();

    this.bwsurl = (config.bwsFor && config.bwsFor[walletId]) || defaults.bws.url;

    this.resetDefaultUrl = function() {
      this.bwsurl = defaults.bws.url;
    };

    this.save = function() {

      var bws;
      switch (this.bwsurl) {
        case 'prod':
        case 'production':
          bws = 'https://bws.bitpay.com/bws/api'
          break;
        case 'sta':
        case 'staging':
          bws = 'https://bws-staging.b-pay.net/bws/api'
          break;
        case 'loc':
        case 'local':
          bws = 'http://localhost:3232/bws/api'
          break;
      };
      if (bws) {
        $log.info('Using BWS URL Alias to ' + bws);
        this.bwsurl = bws;
      }

      var opts = {
        bwsFor: {}
      };
      opts.bwsFor[walletId] = this.bwsurl;

      configService.set(opts, function(err) {
        if (err) console.log(err);
        storageService.setCleanAndScanAddresses(walletId, function() {
          applicationService.restart();
        });
      });
    };
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesColorController',
  function($scope, $timeout, $log, configService, profileService, go) {
    var config = configService.getSync();
    this.colorOpts = [
      '#DD4B39',
      '#F38F12',
      '#FAA77F',
      '#D0B136',
      '#9EDD72',
      '#77DADA',
      '#4A90E2',
      '#484ED3',
      '#9B59B6',
      '#E856EF',
      '#FF599E',
      '#7A8C9E',
    ];

    var fc = profileService.focusedClient;
    var walletId = fc.credentials.walletId;

    var config = configService.getSync();
    config.colorFor = config.colorFor || {};
    this.color = config.colorFor[walletId] || '#4A90E2';

    this.save = function(color) {
      var self = this;
      var opts = {
        colorFor: {}
      };
      opts.colorFor[walletId] = color;

      configService.set(opts, function(err) {
        if (err) $log.warn(err);
        go.preferences();
        $scope.$emit('Local/ColorUpdated');
        $timeout(function() {
          $scope.$apply();
        }, 100);
      });

    };
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesDeleteWalletController',
  function($scope, $rootScope, $filter, $timeout, $modal, $log, storageService, notification, profileService, isCordova, go, gettext, gettextCatalog, animationService) {
    this.isCordova = isCordova;
    this.error = null;

    var delete_msg = gettextCatalog.getString('Are you sure you want to delete this wallet?');
    var accept_msg = gettextCatalog.getString('Accept');
    var cancel_msg = gettextCatalog.getString('Cancel');
    var confirm_msg = gettextCatalog.getString('Confirm');

    var _modalDeleteWallet = function() {
      var ModalInstanceCtrl = function($scope, $modalInstance, gettext) {
        $scope.title = delete_msg;
        $scope.loading = false;

        $scope.ok = function() {
          $scope.loading = true;
          $modalInstance.close(accept_msg);

        };
        $scope.cancel = function() {
          $modalInstance.dismiss(cancel_msg);
        };
      };

      var modalInstance = $modal.open({
        templateUrl: 'views/modals/confirmation.html',
        windowClass: animationService.modalAnimated.slideUp,
        controller: ModalInstanceCtrl
      });

      modalInstance.result.finally(function() {
        var m = angular.element(document.getElementsByClassName('reveal-modal'));
        m.addClass(animationService.modalAnimated.slideOutDown);
      });

      modalInstance.result.then(function(ok) {
        if (ok) {
          _deleteWallet();
        }
      });
    };

    var _deleteWallet = function() {
      var fc = profileService.focusedClient;
      var name = fc.credentials.walletName;
      var walletName = (fc.alias || '') + ' [' + name + ']';
      var self = this;

      profileService.deleteWalletFC({}, function(err) {
        if (err) {
          self.error = err.message || err;
        } else {
          notification.success(gettextCatalog.getString('Success'), gettextCatalog.getString('The wallet "{{walletName}}" was deleted', {
            walletName: walletName
          }));
        }
      });
    };

    this.deleteWallet = function() {
      if (isCordova) {
        navigator.notification.confirm(
          delete_msg,
          function(buttonIndex) {
            if (buttonIndex == 1) {
              _deleteWallet();
            }
          },
          confirm_msg, [accept_msg, cancel_msg]
        );
      } else {
        _modalDeleteWallet();
      }
    };
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesDeleteWordsController',
  function(confirmDialog, notification, profileService, go, gettext) {
    var self = this;
    var fc = profileService.focusedClient;
    var msg = gettext('Are you sure you want to delete the backup words?');
    var successMsg = gettext('Backup words deleted');

    if (fc.credentials && !fc.credentials.mnemonicEncrypted && !fc.credentials.mnemonic)
      self.deleted = true;

    self.delete = function() {
      confirmDialog.show(msg,
        function(ok) {
          if (ok) {
            fc.clearMnemonic();
            profileService.updateCredentialsFC(function() {
              notification.success(successMsg);
              go.walletHome();
            });
          }
        });
    };

  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesEmailController',
  function($scope, go, profileService, gettext, $log) {
    this.save = function(form) {
      var self = this;
      this.error = null;

      var fc = profileService.focusedClient;
      this.saving = true;
      $scope.$emit('Local/EmailSettingUpdated', self.email, function() {
        self.saving = false;
        go.path('preferences');
      });
    };
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesFeeController',
  function($rootScope, configService) {

    this.save = function(newFee) {
      var opts = {
        wallet: {
          settings: {
            feeLevel: newFee
          }
        }
      };
      $rootScope.$emit('Local/FeeLevelUpdated', newFee);

      configService.set(opts, function(err) {
        if (err) $log.debug(err);
      });

    };
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesGlideraController', 
  function($scope, $modal, $timeout, profileService, applicationService, glideraService, storageService, isChromeApp, animationService) {

    this.getEmail = function(token) {
      var self = this;
      glideraService.getEmail(token, function(error, data) {
        self.email = data;
      });
    };

    this.getPersonalInfo = function(token) {
      var self = this;
      glideraService.getPersonalInfo(token, function(error, info) {
        self.personalInfo = info;
      });
    };

    this.getStatus = function(token) {
      var self = this;
      glideraService.getStatus(token, function(error, data) {
        self.status = data;
      });
    };

    this.getLimits = function(token) {
      var self = this;
      glideraService.getLimits(token, function(error, limits) {
        self.limits = limits;
      });
    };

    this.revokeToken = function(testnet) {
      var network = testnet ? 'testnet' : 'livenet';
      var ModalInstanceCtrl = function($scope, $modalInstance) {
        $scope.ok = function() {
          $modalInstance.close(true);
        };
        $scope.cancel = function() {
          $modalInstance.dismiss();
        };
      };

      var modalInstance = $modal.open({
        templateUrl: 'views/modals/glidera-confirmation.html',
        windowClass: animationService.modalAnimated.slideRight,
        controller: ModalInstanceCtrl
      });

      modalInstance.result.then(function(ok) {
        if (ok) {
          storageService.removeGlideraToken(network, function() {
            $timeout(function() {
              applicationService.restart();
            }, 100);
          });
        }
      });

      modalInstance.result.finally(function() {
        var m = angular.element(document.getElementsByClassName('reveal-modal'));
        m.addClass(animationService.modalAnimated.slideOutRight);
      });
    };

  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesGlobalController',
  function($scope, $rootScope, $log, configService, uxLanguage) {
    
    this.init = function() {
      var config = configService.getSync();
      this.unitName = config.wallet.settings.unitName;
      this.currentLanguageName = uxLanguage.getCurrentLanguageName();
      this.selectedAlternative = {
        name: config.wallet.settings.alternativeName,
        isoCode: config.wallet.settings.alternativeIsoCode
      }; 
      $scope.spendUnconfirmed = config.wallet.spendUnconfirmed;
      $scope.glideraEnabled = config.glidera.enabled;
      $scope.glideraTestnet = config.glidera.testnet;
    };

    var unwatchSpendUnconfirmed = $scope.$watch('spendUnconfirmed', function(newVal, oldVal) {
      if (newVal == oldVal) return;
      var opts = {
        wallet: {
          spendUnconfirmed: newVal
        }
      };
      configService.set(opts, function(err) {
        $rootScope.$emit('Local/SpendUnconfirmedUpdated', newVal);
        if (err) $log.debug(err);
      });
    });

    var unwatchGlideraEnabled = $scope.$watch('glideraEnabled', function(newVal, oldVal) {
      if (newVal == oldVal) return;
      var opts = {
        glidera: {
          enabled: newVal
        }
      };
      configService.set(opts, function(err) {
        $rootScope.$emit('Local/GlideraUpdated');
        if (err) $log.debug(err);
      });
    });

    var unwatchGlideraTestnet = $scope.$watch('glideraTestnet', function(newVal, oldVal) {
      if (newVal == oldVal) return;
      var opts = {
        glidera: {
          testnet: newVal
        }
      };
      configService.set(opts, function(err) {
        $rootScope.$emit('Local/GlideraUpdated');
        if (err) $log.debug(err);
      });
    });

    $scope.$on('$destroy', function() {
      unwatchSpendUnconfirmed();
      unwatchGlideraEnabled();
      unwatchGlideraTestnet();
    });
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesHistory',
  function($scope, $log, $timeout, storageService, go, profileService) {
    var fc = profileService.focusedClient;
    var c = fc.credentials;

    this.clearTransactionHistory = function() {
      storageService.removeTxHistory(c.walletId, function(err) {
        if (err) {
          $log.error(err);
          return;
        }
        $scope.$emit('Local/ClearHistory');

        $timeout(function() {
          go.walletHome();
        }, 100);
      });
    }
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesInformation',
  function($scope, $log, $timeout, isMobile, gettextCatalog, lodash, profileService, storageService, go) {
    var base = 'xpub';
    var fc = profileService.focusedClient;
    var c = fc.credentials;

    this.init = function() {
      var basePath = c.getBaseAddressDerivationPath();

      $scope.walletName = c.walletName;
      $scope.walletId = c.walletId;
      $scope.network = c.network;
      $scope.addressType = c.addressType || 'P2SH';
      $scope.derivationStrategy = c.derivationStrategy || 'BIP45';
      $scope.basePath = basePath;
      $scope.M = c.m;
      $scope.N = c.n;
      $scope.pubKeys = lodash.pluck(c.publicKeyRing, 'xPubKey');
      $scope.addrs = null;

      fc.getMainAddresses({
        doNotVerify: true
      }, function(err, addrs) {
        if (err) {
          $log.warn(err);
          return;
        };
        var last10 = [],
          i = 0,
          e = addrs.pop();
        while (i++ < 10 && e) {
          e.path = base + e.path.substring(1);
          last10.push(e);
          e = addrs.pop();
        }
        $scope.addrs = last10;
        $timeout(function() {
          $scope.$apply();
        });

      });
    };

    this.sendAddrs = function() {
      var self = this;

      if (isMobile.Android() || isMobile.Windows()) {
        window.ignoreMobilePause = true;
      }

      self.loading = true;

      function formatDate(ts) {
        var dateObj = new Date(ts * 1000);
        if (!dateObj) {
          $log.debug('Error formating a date');
          return 'DateError';
        }
        if (!dateObj.toJSON()) {
          return '';
        }
        return dateObj.toJSON();
      };

      $timeout(function() {
        fc.getMainAddresses({
          doNotVerify: true
        }, function(err, addrs) {
          self.loading = false;
          if (err) {
            $log.warn(err);
            return;
          };

          var body = 'Copay Wallet "' + $scope.walletName + '" Addresses\n  Only Main Addresses are  shown.\n\n';
          body += "\n";
          body += addrs.map(function(v) {
            return ('* ' + v.address + ' ' + base + v.path.substring(1) + ' ' + formatDate(v.createdOn));
          }).join("\n");

          var properties = {
            subject: 'Copay Addresses',
            body: body,
            isHtml: false
          };
          window.plugin.email.open(properties);

          $timeout(function() {
            $scope.$apply();
          }, 1000);
        });
      }, 100);
    };

  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesLanguageController',
  function($scope, $log, $timeout, configService, uxLanguage, go) {

    this.availableLanguages = uxLanguage.getLanguages();

    this.save = function(newLang) {

      var opts = {
        wallet: {
          settings: {
            defaultLanguage: newLang
          }
        }
      };

      configService.set(opts, function(err) {
        if (err) $log.warn(err);
        go.preferencesGlobal();
        $scope.$emit('Local/LanguageSettingUpdated');
        $timeout(function() {
          $scope.$apply();
        }, 100);
      });
    };
  });

'use strict';

angular.module('copayApp.controllers').controller('preferencesLogs',
function(historicLog) {
  this.logs = historicLog.get();

  this.sendLogs = function() {
    var body = 'Copay Session Logs\n Be careful, this could contain sensitive private data\n\n';
    body += '\n\n';
    body += this.logs.map(function(v) {
      return v.msg;
    }).join('\n');

    var properties = {
      subject: 'Copay Logs',
      body: body,
      isHtml: false
    };
    window.plugin.email.open(properties);
  };
});

'use strict';

angular.module('copayApp.controllers').controller('preferencesUnitController',
  function($scope, $timeout, $log, configService, go) {
    var config = configService.getSync();
    this.unitName = config.wallet.settings.unitName;
    this.unitOpts = [
      // TODO : add Satoshis to bitcore-wallet-client formatAmount()
      // {
      //     name: 'Satoshis (100,000,000 satoshis = 1BTC)',
      //     shortName: 'SAT',
      //     value: 1,
      //     decimals: 0,
      //     code: 'sat',
      //   }, 
      {
        name: 'bits (1,000,000 bits = 1BTC)',
        shortName: 'bits',
        value: 100,
        decimals: 2,
        code: 'bit',
      }
      // TODO : add mBTC to bitcore-wallet-client formatAmount()
      // ,{
      //   name: 'mBTC (1,000 mBTC = 1BTC)',
      //   shortName: 'mBTC',
      //   value: 100000,
      //   decimals: 5,
      //   code: 'mbtc',
      // }
      , {
        name: 'BTC',
        shortName: 'BTC',
        value: 100000000,
        decimals: 8,
        code: 'btc',
      }
    ];

    this.save = function(newUnit) {
      var opts = {
        wallet: {
          settings: {
            unitName: newUnit.shortName,
            unitToSatoshi: newUnit.value,
            unitDecimals: newUnit.decimals,
            unitCode: newUnit.code,
          }
        }
      };
      this.unitName = newUnit.shortName;

      configService.set(opts, function(err) {
        if (err) $log.warn(err);
        go.preferencesGlobal();
        $scope.$emit('Local/UnitSettingUpdated');
        $timeout(function() {
          $scope.$apply();
        }, 100);
      });

    };
  });

'use strict';

angular.module('copayApp.controllers').controller('sellGlideraController', 
  function($scope, $timeout, $log, $modal, configService, profileService, addressService, feeService, glideraService, bwsError, lodash, isChromeApp, animationService) {

    var self = this;
    var config = configService.getSync();
    this.data = {};
    this.show2faCodeInput = null;
    this.success = null;
    this.error = null;
    this.loading = null;
    this.currentSpendUnconfirmed = config.wallet.spendUnconfirmed;
    this.currentFeeLevel = config.wallet.settings.feeLevel || 'normal';
    var fc;

    window.ignoreMobilePause = true;

    var otherWallets = function(testnet) {
      var network = testnet ? 'testnet' : 'livenet';
      return lodash.filter(profileService.getWallets(network), function(w) {
        return w.network == network && w.m == 1;
      });
    };

    this.init = function(testnet) {
      self.otherWallets = otherWallets(testnet);
      // Choose focused wallet
      try {
        var currentWalletId = profileService.focusedClient.credentials.walletId;
        lodash.find(self.otherWallets, function(w) {
          if (w.id == currentWalletId) {
            $timeout(function() {
              self.selectedWalletId = w.id;
              self.selectedWalletName = w.name;
              fc = profileService.getClient(w.id);
              $scope.$apply();
            }, 100);
          }
        });
      } catch(e) {
        $log.debug(e);
      };
    };

    $scope.openWalletsModal = function(wallets) {
      self.error = null;
      self.selectedWalletId = null;
      self.selectedWalletName = null;
      var ModalInstanceCtrl = function($scope, $modalInstance) {
        $scope.type = 'SELL';
        $scope.wallets = wallets;
        $scope.noColor = true;
        $scope.cancel = function() {
          $modalInstance.dismiss('cancel');
        };

        $scope.selectWallet = function(walletId, walletName) {
          if (!profileService.getClient(walletId).isComplete()) {
            self.error = bwsError.msg({'code': 'WALLET_NOT_COMPLETE'}, 'Could not choose the wallet');
            $modalInstance.dismiss('cancel');
            return;
          }
          $modalInstance.close({
            'walletId': walletId, 
            'walletName': walletName,
          });
        };
      };

      var modalInstance = $modal.open({
        templateUrl: 'views/modals/glidera-wallets.html',
          windowClass: animationService.modalAnimated.slideUp,
          controller: ModalInstanceCtrl,
      });

      modalInstance.result.finally(function() {
        var m = angular.element(document.getElementsByClassName('reveal-modal'));
        m.addClass(animationService.modalAnimated.slideOutDown);
      });

      modalInstance.result.then(function(obj) {
        $timeout(function() {
          self.selectedWalletId = obj.walletId;
          self.selectedWalletName = obj.walletName;
          fc = profileService.getClient(obj.walletId);
          $scope.$apply();
        }, 100);
      });
    };

    this.getSellPrice = function(token, price) {
      var self = this;
      this.error = null;
      if (!price || (price && !price.qty && !price.fiat)) {
        this.sellPrice = null;
        return;
      }
      this.gettingSellPrice = true;
      glideraService.sellPrice(token, price, function(err, sellPrice) {
        self.gettingSellPrice = false;
        if (err) {
          self.error = 'Could not get exchange information. Please, try again.';
        }
        else {
          self.error = null;
          self.sellPrice = sellPrice;
        }
      });     
    };

    this.get2faCode = function(token) {
      var self = this;
      this.loading = 'Sending 2FA code...';
      $timeout(function() {
        glideraService.get2faCode(token, function(err, sent) {
          self.loading = null;
          if (err) {
            self.error = 'Could not send confirmation code to your phone';
          }
          else {
            self.show2faCodeInput = sent;
          }
        });
      }, 100);
    };

    this.createTx = function(token, permissions, twoFaCode) {
      var self = this;
      self.error = null;

      this.loading = 'Selling Bitcoin...';
      $timeout(function() {
        addressService.getAddress(fc.credentials.walletId, null, function(err, refundAddress) {
          if (!refundAddress) {
            self.loading = null;
            self.error = bwsError.msg(err, 'Could not create address');
            return;
          }
          glideraService.getSellAddress(token, function(error, sellAddress) {
            if (!sellAddress) {
              self.loading = null;
              self.error = 'Could not get the destination bitcoin address';
              return;
            }
            var amount = parseInt((self.sellPrice.qty * 100000000).toFixed(0));

            feeService.getCurrentFeeValue(self.currentFeeLevel, function(err, feePerKb) {
              if (err) $log.debug(err);
              fc.sendTxProposal({
                toAddress: sellAddress,
                amount: amount,
                message: 'Glidera transaction',
                customData: {'glideraToken': token},
                payProUrl: null,
                feePerKb: feePerKb,
                excludeUnconfirmedUtxos: self.currentSpendUnconfirmed ? false : true
              }, function(err, txp) {
                if (err) {
                  profileService.lockFC();
                  $log.error(err);
                  $timeout(function() {
                    self.loading = null;
                    self.error = bwsError.msg(err, 'Error');
                  }, 1);
                  return;
                }

                if (!fc.canSign()) {
                  self.loading = null;
                  $log.info('No signing proposal: No private key');
                  return;
                }

                _signTx(txp, function(err, txp, rawTx) {
                  profileService.lockFC();
                  if (err) {
                    self.loading = null;
                    self.error = err;
                    $scope.$apply();
                  }
                  else {
                    var data = {
                      refundAddress: refundAddress,
                      signedTransaction: rawTx,
                      priceUuid: self.sellPrice.priceUuid,
                      useCurrentPrice: self.sellPrice.priceUuid ? false : true,
                      ip: null 
                    };
                    glideraService.sell(token, twoFaCode, data, function(err, data) {
                      self.loading = null;
                      if (err) {
                        self.error = err;
                        fc.removeTxProposal(txp, function(err, txpb) {
                          $timeout(function() {
                            $scope.$emit('Local/GlideraError');
                          }, 100);
                        });
                      }
                      else {
                        self.success = data;
                        $scope.$emit('Local/GlideraTx');
                      }
                    });
                  }
                });
              });
            });
          });
        });

      }, 100);
    
    };

    var _signTx = function(txp, cb) {
      var self = this;
      fc.signTxProposal(txp, function(err, signedTx) {
        profileService.lockFC();
        if (err) {
          err = bwsError.msg(err, 'Could not accept payment');
          return cb(err);
        }
        else {
          if (signedTx.status == 'accepted') {
            return cb(null, txp, signedTx.raw);

          } else {
            return cb('The transaction could not be signed');
          }
        }
      });
    };

  });

'use strict';

angular.module('copayApp.controllers').controller('sidebarController',
  function($rootScope, $timeout, lodash, profileService, configService, go, isMobile, isCordova) {
    var self = this;
    self.isWindowsPhoneApp = isMobile.Windows() && isCordova;
    self.walletSelection = false;

    // wallet list change
    $rootScope.$on('Local/WalletListUpdated', function(event) {
      self.walletSelection = false;
      self.setWallets();
    });

    $rootScope.$on('Local/ColorUpdated', function(event) {
      self.setWallets();
    });

    $rootScope.$on('Local/AliasUpdated', function(event) {
      self.setWallets();
    });


    self.signout = function() {
      profileService.signout();
    };

    self.switchWallet = function(selectedWalletId, currentWalletId) {
      if (selectedWalletId == currentWalletId) return;
      self.walletSelection = false;
      profileService.setAndStoreFocus(selectedWalletId, function() {});
    };

    self.toggleWalletSelection = function() {
      self.walletSelection = !self.walletSelection;
      if (!self.walletSelection) return;
      self.setWallets();
    };

    self.setWallets = function() {
      if (!profileService.profile) return;

      var config = configService.getSync();
      config.colorFor = config.colorFor || {};
      config.aliasFor = config.aliasFor || {};

      // Sanitize empty wallets (fixed in BWC 1.8.1, and auto fixed when wallets completes)
      var credentials = lodash.filter(profileService.profile.credentials, 'walletName');
      var ret = lodash.map(credentials, function(c) {
        return {
          m: c.m,
          n: c.n,
          name: config.aliasFor[c.walletId] || c.walletName,
          id: c.walletId,
          color: config.colorFor[c.walletId] || '#4A90E2',
        };
      });

      self.wallets = lodash.sortBy(ret, 'name');
    };

    self.setWallets();

  });

'use strict';

angular.module('copayApp.controllers').controller('termOfUseController',
  function($scope, uxLanguage) {

    $scope.lang = uxLanguage.currentLanguage;

  });

'use strict';

angular.module('copayApp.controllers').controller('topbarController', function(go) { 

  this.goHome = function() {
    go.walletHome();
  };

  this.goPreferences = function() {
    go.preferences();
  };

});

'use strict';

angular.module('copayApp.controllers').controller('versionController', function() {
  this.version = window.version;
  this.commitHash = window.commitHash;
});

'use strict';

angular.module('copayApp.controllers').controller('walletHomeController', function($scope, $rootScope, $timeout, $filter, $modal, $log, notification, txStatus, isCordova, isMobile, profileService, lodash, configService, rateService, storageService, bitcore, isChromeApp, gettext, gettextCatalog, nodeWebkit, addressService, ledger, bwsError, confirmDialog, txFormatService, animationService, addressbookService, go, feeService) {

  var self = this;
  window.ignoreMobilePause = false;
  $rootScope.hideMenuBar = false;
  $rootScope.wpInputFocused = false;
  var config = configService.getSync();
  var configWallet = config.wallet;

  // INIT
  var walletSettings = configWallet.settings;
  this.unitToSatoshi = walletSettings.unitToSatoshi;
  this.satToUnit = 1 / this.unitToSatoshi;
  this.unitName = walletSettings.unitName;
  this.alternativeIsoCode = walletSettings.alternativeIsoCode;
  this.alternativeName = walletSettings.alternativeName;
  this.alternativeAmount = 0;
  this.unitDecimals = walletSettings.unitDecimals;
  this.isCordova = isCordova;
  this.addresses = [];
  this.isMobile = isMobile.any();
  this.isWindowsPhoneApp = isMobile.Windows() && isCordova;
  this.blockUx = false;
  this.isRateAvailable = false;
  this.showScanner = false;
  this.addr = {};
  this.lockedCurrentFeePerKb = null;

  var disableScannerListener = $rootScope.$on('dataScanned', function(event, data) {
    self.setForm(data);
    $rootScope.$emit('Local/SetTab', 'send');

    var form = $scope.sendForm;
    if (form.address.$invalid && !self.blockUx) {
      self.resetForm();
      self.error = gettext('Could not recognize a valid Bitcoin QR Code');
    }
  });

  var disablePaymentUriListener = $rootScope.$on('paymentUri', function(event, uri) {
    $rootScope.$emit('Local/SetTab', 'send');
    $timeout(function() {
      self.setForm(uri);
    }, 100);
  });

  var disableAddrListener = $rootScope.$on('Local/NeedNewAddress', function() {
    self.setAddress(true);
  });

  var disableFocusListener = $rootScope.$on('Local/NewFocusedWallet', function() {
    self.addr = {};
    self.resetForm();
  });

  var disableResumeListener = $rootScope.$on('Local/Resume', function() {
    // This is needed then the apps go to sleep
    self.bindTouchDown();
  });

  var disableTabListener = $rootScope.$on('Local/TabChanged', function(e, tab) {
    // This will slow down switch, do not add things here!
    switch (tab) {
      case 'receive':
        // just to be sure we have an address
        self.setAddress();
        break;
      case 'send':
        self.resetError();
    };
  });

  var disableOngoingProcessListener = $rootScope.$on('Addon/OngoingProcess', function(e, name) {
    self.setOngoingProcess(name);
  });

  $scope.$on('$destroy', function() {
    disableAddrListener();
    disableScannerListener();
    disablePaymentUriListener();
    disableTabListener();
    disableFocusListener();
    disableResumeListener();
    disableOngoingProcessListener();
    $rootScope.hideMenuBar = false;
  });

  var requestTouchid = function(cb) {
    var fc = profileService.focusedClient;
    config.touchIdFor = config.touchIdFor || {};
    if (window.touchidAvailable && config.touchIdFor[fc.credentials.walletId]) {
      $rootScope.$emit('Local/RequestTouchid', cb);
    } else {
      return cb();
    }
  };

  this.onQrCodeScanned = function(data) {
    if (data) go.send();
    $rootScope.$emit('dataScanned', data);
  };

  rateService.whenAvailable(function() {
    self.isRateAvailable = true;
    $rootScope.$digest();
  });

  var accept_msg = gettextCatalog.getString('Accept');
  var cancel_msg = gettextCatalog.getString('Cancel');
  var confirm_msg = gettextCatalog.getString('Confirm');

  this.openDestinationAddressModal = function(wallets, address) {
    $rootScope.modalOpened = true;
    var fc = profileService.focusedClient;
    self.lockAddress = false;
    self._address = null;

    var ModalInstanceCtrl = function($scope, $modalInstance) {
      $scope.wallets = wallets;
      $scope.editAddressbook = false;
      $scope.addAddressbookEntry = false;
      $scope.selectedAddressbook = {};
      $scope.newAddress = address;
      $scope.walletName = fc.credentials.walletName;
      $scope.color = fc.backgroundColor;
      $scope.addressbook = {
        'address': ($scope.newAddress || ''),
        'label': ''
      };

      $scope.beforeQrCodeScann = function() {
        $scope.error = null;
        $scope.addAddressbookEntry = true;
        $scope.editAddressbook = false;
      };

      $scope.onQrCodeScanned = function(data, addressbookForm) {
        $timeout(function() {
          var form = addressbookForm;
          if (data && form) {
            data = data.replace('bitcoin:', '');
            form.address.$setViewValue(data);
            form.address.$isValid = true;
            form.address.$render();
          }
          $scope.$digest();
        }, 100);
      };

      $scope.selectAddressbook = function(addr) {
        $modalInstance.close(addr);
      };

      $scope.toggleEditAddressbook = function() {
        $scope.editAddressbook = !$scope.editAddressbook;
        $scope.selectedAddressbook = {};
        $scope.addAddressbookEntry = false;
      };

      $scope.toggleSelectAddressbook = function(addr) {
        $scope.selectedAddressbook[addr] = $scope.selectedAddressbook[addr] ? false : true;
      };

      $scope.toggleAddAddressbookEntry = function() {
        $scope.error = null;
        $scope.addressbook = {
          'address': ($scope.newAddress || ''),
          'label': ''
        };
        $scope.addAddressbookEntry = !$scope.addAddressbookEntry;
      };

      $scope.list = function() {
        $scope.error = null;
        addressbookService.list(function(err, ab) {
          if (err) {
            $scope.error = err;
            return;
          }
          $scope.list = ab;
        });
      };

      $scope.add = function(addressbook) {
        $scope.error = null;
        $timeout(function() {
          addressbookService.add(addressbook, function(err, ab) {
            if (err) {
              $scope.error = err;
              return;
            }
            $rootScope.$emit('Local/AddressbookUpdated', ab);
            $scope.list = ab;
            $scope.editAddressbook = true;
            $scope.toggleEditAddressbook();
            $scope.$digest();
          });
        }, 100);
      };

      $scope.remove = function(addr) {
        $scope.error = null;
        $timeout(function() {
          addressbookService.remove(addr, function(err, ab) {
            if (err) {
              $scope.error = err;
              return;
            }
            $rootScope.$emit('Local/AddressbookUpdated', ab);
            $scope.list = ab;
            $scope.$digest();
          });
        }, 100);
      };

      $scope.cancel = function() {
        $modalInstance.dismiss('cancel');
      };

      $scope.selectWallet = function(walletId, walletName) {
        $scope.gettingAddress = true;
        $scope.selectedWalletName = walletName;
        $timeout(function() {
          $scope.$apply();
        });
        addressService.getAddress(walletId, false, function(err, addr) {
          $scope.gettingAddress = false;

          if (err) {
            self.error = err;
            $modalInstance.dismiss('cancel');
            return;
          }

          $modalInstance.close(addr);
        });
      };
    };

    var modalInstance = $modal.open({
      templateUrl: 'views/modals/destination-address.html',
      windowClass: animationService.modalAnimated.slideUp,
      controller: ModalInstanceCtrl,
    });

    var disableCloseModal = $rootScope.$on('closeModal', function() {
      modalInstance.dismiss('cancel');
    });

    modalInstance.result.finally(function() {
      $rootScope.modalOpened = false;
      disableCloseModal();
      var m = angular.element(document.getElementsByClassName('reveal-modal'));
      m.addClass(animationService.modalAnimated.slideOutDown);
    });

    modalInstance.result.then(function(addr) {
      if (addr) {
        self.setForm(addr);
      }
    });
  };

  var GLIDERA_LOCK_TIME = 6 * 60 * 60;
  // isGlidera flag is a security mesure so glidera status is not
  // only determined by the tx.message
  this.openTxpModal = function(tx, copayers, isGlidera) {
    $rootScope.modalOpened = true;
    var fc = profileService.focusedClient;
    var refreshUntilItChanges = false;
    var currentSpendUnconfirmed = configWallet.spendUnconfirmed;
    var ModalInstanceCtrl = function($scope, $modalInstance) {
      $scope.error = null;
      $scope.copayers = copayers
      $scope.copayerId = fc.credentials.copayerId;
      $scope.canSign = fc.canSign() || fc.isPrivKeyExternal();
      $scope.loading = null;
      $scope.color = fc.backgroundColor;
      $scope.isShared = fc.credentials.n > 1;

      // ToDo: use tx.customData instead of tx.message
      if (tx.message === 'Glidera transaction' && isGlidera) {
        tx.isGlidera = true;
        if (tx.canBeRemoved) {
          tx.canBeRemoved = (Date.now() / 1000 - (tx.ts || tx.createdOn)) > GLIDERA_LOCK_TIME;
        }
      }
      $scope.tx = tx;

      refreshUntilItChanges = false;
      $scope.currentSpendUnconfirmed = currentSpendUnconfirmed;

      $scope.getShortNetworkName = function() {
        return fc.credentials.networkName.substring(0, 4);
      };
      lodash.each(['TxProposalRejectedBy', 'TxProposalAcceptedBy', 'transactionProposalRemoved', 'TxProposalRemoved', 'NewOutgoingTx', 'UpdateTx'], function(eventName) {
        $rootScope.$on(eventName, function() {
          fc.getTx($scope.tx.id, function(err, tx) {
            if (err) {

              if (err.code && err.code == 'TX_NOT_FOUND' &&
                (eventName == 'transactionProposalRemoved' || eventName == 'TxProposalRemoved')) {
                $scope.tx.removed = true;
                $scope.tx.canBeRemoved = false;
                $scope.tx.pendingForUs = false;
                $scope.$apply();
                return;
              }
              return;
            }

            var action = lodash.find(tx.actions, {
              copayerId: fc.credentials.copayerId
            });
            $scope.tx = txFormatService.processTx(tx);
            if (!action && tx.status == 'pending')
              $scope.tx.pendingForUs = true;
            $scope.updateCopayerList();
            $scope.$apply();
          });
        });
      });

      $scope.updateCopayerList = function() {
        lodash.map($scope.copayers, function(cp) {
          lodash.each($scope.tx.actions, function(ac) {
            if (cp.id == ac.copayerId) {
              cp.action = ac.type;
            }
          });
        });
      };

      $scope.sign = function(txp) {
        var fc = profileService.focusedClient;

        if (!fc.canSign() && !fc.isPrivKeyExternal())
          return;

        if (fc.isPrivKeyEncrypted()) {
          profileService.unlockFC(function(err) {
            if (err) {
              $scope.error = bwsError.msg(err);
              return;
            }
            return $scope.sign(txp);
          });
          return;
        };

        self._setOngoingForSigning();
        $scope.loading = true;
        $scope.error = null;
        $timeout(function() {
          requestTouchid(function(err) {
            if (err) {
              self.setOngoingProcess();
              $scope.loading = false;
              profileService.lockFC();
              $scope.error = err;
              $scope.$digest();
              return;
            }

            profileService.signTxProposal(txp, function(err, txpsi) {
              self.setOngoingProcess();
              if (err) {
                $scope.$emit('UpdateTx');
                $scope.loading = false;
                $scope.error = bwsError.msg(err, gettextCatalog.getString('Could not accept payment'));
                $scope.$digest();
              } else {
                //if txp has required signatures then broadcast it
                var txpHasRequiredSignatures = txpsi.status == 'accepted';
                if (txpHasRequiredSignatures) {
                  self.setOngoingProcess(gettextCatalog.getString('Broadcasting transaction'));
                  $scope.loading = true;
                  fc.broadcastTxProposal(txpsi, function(err, txpsb, memo) {
                    self.setOngoingProcess();
                    $scope.loading = false;
                    if (err) {
                      $scope.$emit('UpdateTx');
                      $scope.error = bwsError.msg(err, gettextCatalog.getString('Could not broadcast payment'));
                      $scope.$digest();
                    } else {
                      $log.debug('Transaction signed and broadcasted')
                      if (memo)
                        $log.info(memo);

                      refreshUntilItChanges = true;
                      $modalInstance.close(txpsb);
                    }
                  });
                } else {
                  $scope.loading = false;
                  $modalInstance.close(txpsi);
                }
              }
            });
          });
        }, 100);
      };

      $scope.reject = function(txp) {
        self.setOngoingProcess(gettextCatalog.getString('Rejecting payment'));
        $scope.loading = true;
        $scope.error = null;
        $timeout(function() {
          fc.rejectTxProposal(txp, null, function(err, txpr) {
            self.setOngoingProcess();
            $scope.loading = false;
            if (err) {
              $scope.$emit('UpdateTx');
              $scope.error = bwsError.msg(err, gettextCatalog.getString('Could not reject payment'));
              $scope.$digest();
            } else {
              $modalInstance.close(txpr);
            }
          });
        }, 100);
      };


      $scope.remove = function(txp) {
        self.setOngoingProcess(gettextCatalog.getString('Deleting payment'));
        $scope.loading = true;
        $scope.error = null;
        $timeout(function() {
          fc.removeTxProposal(txp, function(err, txpb) {
            self.setOngoingProcess();
            $scope.loading = false;

            // Hacky: request tries to parse an empty response
            if (err && !(err.message && err.message.match(/Unexpected/))) {
              $scope.$emit('UpdateTx');
              $scope.error = bwsError.msg(err, gettextCatalog.getString('Could not delete payment proposal'));
              $scope.$digest();
              return;
            }
            $modalInstance.close();
          });
        }, 100);
      };

      $scope.broadcast = function(txp) {
        self.setOngoingProcess(gettextCatalog.getString('Broadcasting Payment'));
        $scope.loading = true;
        $scope.error = null;
        $timeout(function() {
          fc.broadcastTxProposal(txp, function(err, txpb, memo) {
            self.setOngoingProcess();
            $scope.loading = false;
            if (err) {
              $scope.error = bwsError.msg(err, gettextCatalog.getString('Could not broadcast payment'));
              $scope.$digest();
            } else {

              if (memo)
                $log.info(memo);

              refreshUntilItChanges = true;
              $modalInstance.close(txpb);
            }
          });
        }, 100);
      };

      $scope.copyAddress = function(addr) {
        if (!addr) return;
        self.copyAddress(addr);
      };

      $scope.cancel = lodash.debounce(function() {
        $modalInstance.dismiss('cancel');
      }, 0, 1000);
    };

    var modalInstance = $modal.open({
      templateUrl: 'views/modals/txp-details.html',
      windowClass: animationService.modalAnimated.slideRight,
      controller: ModalInstanceCtrl,
    });

    var disableCloseModal = $rootScope.$on('closeModal', function() {
      modalInstance.dismiss('cancel');
    });

    modalInstance.result.finally(function() {
      $rootScope.modalOpened = false;
      disableCloseModal();
      var m = angular.element(document.getElementsByClassName('reveal-modal'));
      m.addClass(animationService.modalAnimated.slideOutRight);
    });

    modalInstance.result.then(function(txp) {
      self.setOngoingProcess();
      if (txp) {
        txStatus.notify(txp, function() {
          $scope.$emit('Local/TxProposalAction', refreshUntilItChanges);
        });
      } else {
        $timeout(function() {
          $scope.$emit('Local/TxProposalAction', refreshUntilItChanges);
        }, 100);
      }
    });

  };

  this.setAddress = function(forceNew) {
    self.addrError = null;
    var fc = profileService.focusedClient;
    if (!fc)
      return;

    // Address already set?
    if (!forceNew && self.addr[fc.credentials.walletId]) {
      return;
    }

    self.generatingAddress = true;
    $timeout(function() {
      addressService.getAddress(fc.credentials.walletId, forceNew, function(err, addr) {
        self.generatingAddress = false;

        if (err) {
          self.addrError = err;
        } else {
          if (addr)
            self.addr[fc.credentials.walletId] = addr;
        }

        $scope.$digest();
      });
    });
  };

  this.copyAddress = function(addr) {
    if (isCordova) {
      window.cordova.plugins.clipboard.copy(addr);
      window.plugins.toast.showShortCenter(gettextCatalog.getString('Copied to clipboard'));
    } else if (nodeWebkit.isDefined()) {
      nodeWebkit.writeToClipboard(addr);
    }
  };

  this.shareAddress = function(addr) {
    if (isCordova) {
      if (isMobile.Android() || isMobile.Windows()) {
        window.ignoreMobilePause = true;
      }
      window.plugins.socialsharing.share('bitcoin:' + addr, null, null, null);
    }
  };

  this.openCustomizedAmountModal = function(addr) {
    $rootScope.modalOpened = true;
    var self = this;
    var fc = profileService.focusedClient;
    var ModalInstanceCtrl = function($scope, $modalInstance) {
      $scope.addr = addr;
      $scope.color = fc.backgroundColor;
      $scope.unitName = self.unitName;
      $scope.alternativeAmount = self.alternativeAmount;
      $scope.alternativeName = self.alternativeName;
      $scope.alternativeIsoCode = self.alternativeIsoCode;
      $scope.isRateAvailable = self.isRateAvailable;
      $scope.unitToSatoshi = self.unitToSatoshi;
      $scope.unitDecimals = self.unitDecimals;
      var satToUnit = 1 / self.unitToSatoshi;
      $scope.showAlternative = false;
      $scope.isCordova = isCordova;

      Object.defineProperty($scope,
        "_customAlternative", {
          get: function() {
            return $scope.customAlternative;
          },
          set: function(newValue) {
            $scope.customAlternative = newValue;
            if (typeof(newValue) === 'number' && $scope.isRateAvailable) {
              $scope.customAmount = parseFloat((rateService.fromFiat(newValue, $scope.alternativeIsoCode) * satToUnit).toFixed($scope.unitDecimals), 10);
            } else {
              $scope.customAmount = null;
            }
          },
          enumerable: true,
          configurable: true
        });

      Object.defineProperty($scope,
        "_customAmount", {
          get: function() {
            return $scope.customAmount;
          },
          set: function(newValue) {
            $scope.customAmount = newValue;
            if (typeof(newValue) === 'number' && $scope.isRateAvailable) {
              $scope.customAlternative = parseFloat((rateService.toFiat(newValue * $scope.unitToSatoshi, $scope.alternativeIsoCode)).toFixed(2), 10);
            } else {
              $scope.customAlternative = null;
            }
            $scope.alternativeAmount = $scope.customAlternative;
          },
          enumerable: true,
          configurable: true
        });

      $scope.submitForm = function(form) {
        var satToBtc = 1 / 100000000;
        var amount = form.amount.$modelValue;
        var amountSat = parseInt((amount * $scope.unitToSatoshi).toFixed(0));
        $timeout(function() {
          $scope.customizedAmountUnit = amount + ' ' + $scope.unitName;
          $scope.customizedAlternativeUnit = $filter('noFractionNumber')(form.alternative.$modelValue, 2) + ' ' + $scope.alternativeIsoCode;
          if ($scope.unitName == 'bits') {
            amount = (amountSat * satToBtc).toFixed(8);
          }
          $scope.customizedAmountBtc = amount;
        }, 1);
      };

      $scope.toggleAlternative = function() {
        $scope.showAlternative = !$scope.showAlternative;
      };

      $scope.shareAddress = function(uri) {
        if (isCordova) {
          if (isMobile.Android() || isMobile.Windows()) {
            window.ignoreMobilePause = true;
          }
          window.plugins.socialsharing.share(uri, null, null, null);
        }
      };

      $scope.cancel = function() {
        $modalInstance.dismiss('cancel');
      };
    };

    var modalInstance = $modal.open({
      templateUrl: 'views/modals/customized-amount.html',
      windowClass: animationService.modalAnimated.slideUp,
      controller: ModalInstanceCtrl,
    });

    var disableCloseModal = $rootScope.$on('closeModal', function() {
      modalInstance.dismiss('cancel');
    });

    modalInstance.result.finally(function() {
      $rootScope.modalOpened = false;
      disableCloseModal();
      var m = angular.element(document.getElementsByClassName('reveal-modal'));
      m.addClass(animationService.modalAnimated.slideOutDown);
    });
  };

  // Send 

  this.canShowAlternative = function() {
    return $scope.showAlternative;
  };

  this.showAlternative = function() {
    $scope.showAlternative = true;
  };

  this.hideAlternative = function() {
    $scope.showAlternative = false;
  };

  this.resetError = function() {
    this.error = this.success = null;
  };

  this.bindTouchDown = function(tries) {
    var self = this;
    tries = tries || 0;
    if (tries > 5) return;
    var e = document.getElementById('menu-walletHome');
    if (!e) return $timeout(function() {
      self.bindTouchDown(++tries);
    }, 500);

    // on touchdown elements
    $log.debug('Binding touchstart elements...');
    ['hamburger', 'menu-walletHome', 'menu-send', 'menu-receive'].forEach(function(id) {
      var e = document.getElementById(id);
      if (e) e.addEventListener('touchstart', function() {
        try {
          event.preventDefault();
        } catch (e) {};
        angular.element(e).triggerHandler('click');
      }, true);
    });
  }

  this.hideMenuBar = lodash.debounce(function(hide) {
    if (hide) {
      $rootScope.hideMenuBar = true;
      this.bindTouchDown();
    } else {
      $rootScope.hideMenuBar = false;
    }
    $rootScope.$digest();
  }, 100);


  this.formFocus = function(what) {
    if (isCordova && !this.isWindowsPhoneApp) {
      this.hideMenuBar(what);
    }
    if (!this.isWindowsPhoneApp) return

    if (!what) {
      this.hideAddress = false;
      this.hideAmount = false;

    } else {
      if (what == 'amount') {
        this.hideAddress = true;
      } else if (what == 'msg') {
        this.hideAddress = true;
        this.hideAmount = true;
      }
    }
    $timeout(function() {
      $rootScope.$digest();
    }, 1);
  };

  this.setSendFormInputs = function() {
    var unitToSat = this.unitToSatoshi;
    var satToUnit = 1 / unitToSat;
    /**
     * Setting the two related amounts as properties prevents an infinite
     * recursion for watches while preserving the original angular updates
     *
     */
    Object.defineProperty($scope,
      "_alternative", {
        get: function() {
          return $scope.__alternative;
        },
        set: function(newValue) {
          $scope.__alternative = newValue;
          if (typeof(newValue) === 'number' && self.isRateAvailable) {
            $scope._amount = parseFloat((rateService.fromFiat(newValue, self.alternativeIsoCode) * satToUnit).toFixed(self.unitDecimals), 10);
          } else {
            $scope.__amount = null;
          }
        },
        enumerable: true,
        configurable: true
      });
    Object.defineProperty($scope,
      "_amount", {
        get: function() {
          return $scope.__amount;
        },
        set: function(newValue) {
          $scope.__amount = newValue;
          if (typeof(newValue) === 'number' && self.isRateAvailable) {
            $scope.__alternative = parseFloat((rateService.toFiat(newValue * self.unitToSatoshi, self.alternativeIsoCode)).toFixed(2), 10);
          } else {
            $scope.__alternative = null;
          }
          self.alternativeAmount = $scope.__alternative;
          self.resetError();
        },
        enumerable: true,
        configurable: true
      });

    Object.defineProperty($scope,
      "_address", {
        get: function() {
          return $scope.__address;
        },
        set: function(newValue) {
          $scope.__address = self.onAddressChange(newValue);
          if ($scope.sendForm && $scope.sendForm.address.$valid) {
            self.lockAddress = true;
          }
        },
        enumerable: true,
        configurable: true
      });

    var fc = profileService.focusedClient;
    // ToDo: use a credential's (or fc's) function for this
    this.hideNote = !fc.credentials.sharedEncryptingKey;
  };

  this.setSendError = function(err) {
    var fc = profileService.focusedClient;
    var prefix =
      fc.credentials.m > 1 ? gettextCatalog.getString('Could not create payment proposal') : gettextCatalog.getString('Could not send payment');

    this.error = bwsError.msg(err, prefix);

    $timeout(function() {
      $scope.$digest();
    }, 1);
  };


  this.setOngoingProcess = function(name) {
    var self = this;
    self.blockUx = !!name;

    if (isCordova) {
      if (name) {
        window.plugins.spinnerDialog.hide();
        window.plugins.spinnerDialog.show(null, name + '...', true);
      } else {
        window.plugins.spinnerDialog.hide();
      }
    } else {
      self.onGoingProcess = name;
      $timeout(function() {
        $rootScope.$apply();
      });
    };
  };

  this.submitForm = function() {
    var fc = profileService.focusedClient;
    var unitToSat = this.unitToSatoshi;
    var currentSpendUnconfirmed = configWallet.spendUnconfirmed;
    var currentFeeLevel = walletSettings.feeLevel || 'normal';

    if (isCordova && this.isWindowsPhoneApp) {
      this.hideAddress = false;
      this.hideAmount = false;
    }

    var form = $scope.sendForm;
    if (form.$invalid) {
      this.error = gettext('Unable to send transaction proposal');
      return;
    }

    if (fc.isPrivKeyEncrypted()) {
      profileService.unlockFC(function(err) {
        if (err) return self.setSendError(err);
        return self.submitForm();
      });
      return;
    };

    var comment = form.comment.$modelValue;

    // ToDo: use a credential's (or fc's) function for this
    if (comment && !fc.credentials.sharedEncryptingKey) {
      var msg = 'Could not add message to imported wallet without shared encrypting key';
      $log.warn(msg);
      return self.setSendError(gettext(msg));
    }

    var getFee = function(cb) {
      if (self.lockedCurrentFeePerKb) {
        cb(null, self.lockedCurrentFeePerKb);
      } else {
        feeService.getCurrentFeeValue(currentFeeLevel, cb);
      }
    };

    self.setOngoingProcess(gettextCatalog.getString('Creating transaction'));
    $timeout(function() {
      var paypro = self._paypro;
      var address, amount;

      address = form.address.$modelValue;
      amount = parseInt((form.amount.$modelValue * unitToSat).toFixed(0));

      requestTouchid(function(err) {
        if (err) {
          profileService.lockFC();
          self.setOngoingProcess();
          self.error = err;
          $timeout(function() {
            $scope.$digest();
          }, 1);
          return;
        }

        getFee(function(err, feePerKb) {
          if (err) $log.debug(err);
          fc.sendTxProposal({
            toAddress: address,
            amount: amount,
            message: comment,
            payProUrl: paypro ? paypro.url : null,
            feePerKb: feePerKb,
            excludeUnconfirmedUtxos: currentSpendUnconfirmed ? false : true
          }, function(err, txp) {
            if (err) {
              self.setOngoingProcess();
              profileService.lockFC();
              return self.setSendError(err);
            }

            if (!fc.canSign() && !fc.isPrivKeyExternal()) {
              $log.info('No signing proposal: No private key')
              self.setOngoingProcess();
              self.resetForm();
              txStatus.notify(txp, function() {
                return $scope.$emit('Local/TxProposalAction');
              });
              return;
            }

            self.signAndBroadcast(txp, function(err) {
              self.setOngoingProcess();
              self.resetForm();
              if (err) {
                self.error = err.message ? err.message : gettext('The payment was created but could not be completed. Please try again from home screen');
                $scope.$emit('Local/TxProposalAction');
                $timeout(function() {
                  $scope.$digest();
                }, 1);
              } else go.walletHome();
            });
          });
        });
      });
    }, 100);
  };

  this._setOngoingForSigning = function() {
    var fc = profileService.focusedClient;

    if (fc.isPrivKeyExternal() && fc.getPrivKeyExternalSourceName() == 'ledger') {
      self.setOngoingProcess(gettextCatalog.getString('Requesting Ledger Wallet to sign'));
    } else {
      self.setOngoingProcess(gettextCatalog.getString('Signing payment'));
    }
  };

  this.signAndBroadcast = function(txp, cb) {
    var fc = profileService.focusedClient;

    this._setOngoingForSigning();
    profileService.signTxProposal(txp, function(err, signedTx) {
      self.setOngoingProcess();
      if (err) {
        if (!lodash.isObject(err)) {
          err = { message: err};
        }
        err.message = bwsError.msg(err, gettextCatalog.getString('The payment was created but could not be signed. Please try again from home screen'));
        return cb(err);
      }

      if (signedTx.status == 'accepted') {
        self.setOngoingProcess(gettextCatalog.getString('Broadcasting transaction'));
        fc.broadcastTxProposal(signedTx, function(err, btx, memo) {
          self.setOngoingProcess();
          if (err) {
            err.message = bwsError.msg(err, gettextCatalog.getString('The payment was signed but could not be broadcasted. Please try again from home screen'));
            return cb(err);
          }
          if (memo)
            $log.info(memo);

          txStatus.notify(btx, function() {
            $scope.$emit('Local/TxProposalAction', true);
            return cb();
          });
        });
      } else {
        self.setOngoingProcess();
        txStatus.notify(signedTx, function() {
          $scope.$emit('Local/TxProposalAction');
          return cb();
        });
      }
    });
  };

  this.setForm = function(to, amount, comment) {
    var form = $scope.sendForm;
    if (to) {
      form.address.$setViewValue(to);
      form.address.$isValid = true;
      form.address.$render();
      this.lockAddress = true;
    }

    if (amount) {
      form.amount.$setViewValue("" + amount);
      form.amount.$isValid = true;
      form.amount.$render();
      this.lockAmount = true;
    }

    if (comment) {
      form.comment.$setViewValue(comment);
      form.comment.$isValid = true;
      form.comment.$render();
    }
  };



  this.resetForm = function() {
    this.resetError();
    this._paypro = null;
    this.lockedCurrentFeePerKb = null;

    this.lockAddress = false;
    this.lockAmount = false;

    this._amount = this._address = null;

    var form = $scope.sendForm;

    if (form && form.amount) {
      form.amount.$pristine = true;
      form.amount.$setViewValue('');
      form.amount.$render();

      form.comment.$setViewValue('');
      form.comment.$render();
      form.$setPristine();

      if (form.address) {
        form.address.$pristine = true;
        form.address.$setViewValue('');
        form.address.$render();
      }
    }
    $timeout(function() {
      $rootScope.$digest();
    }, 1);
  };

  this.openPPModal = function(paypro) {
    $rootScope.modalOpened = true;
    var ModalInstanceCtrl = function($scope, $modalInstance) {
      var fc = profileService.focusedClient;
      var satToUnit = 1 / self.unitToSatoshi;
      $scope.paypro = paypro;
      $scope.alternative = self.alternativeAmount;
      $scope.alternativeIsoCode = self.alternativeIsoCode;
      $scope.isRateAvailable = self.isRateAvailable;
      $scope.unitTotal = (paypro.amount * satToUnit).toFixed(self.unitDecimals);
      $scope.unitName = self.unitName;
      $scope.color = fc.backgroundColor;

      $scope.cancel = function() {
        $modalInstance.dismiss('cancel');
      };
    };
    var modalInstance = $modal.open({
      templateUrl: 'views/modals/paypro.html',
      windowClass: animationService.modalAnimated.slideUp,
      controller: ModalInstanceCtrl,
    });

    var disableCloseModal = $rootScope.$on('closeModal', function() {
      modalInstance.dismiss('cancel');
    });

    modalInstance.result.finally(function() {
      $rootScope.modalOpened = false;
      disableCloseModal();
      var m = angular.element(document.getElementsByClassName('reveal-modal'));
      m.addClass(animationService.modalAnimated.slideOutDown);
    });
  };

  this.setFromPayPro = function(uri, cb) {
    if (!cb) cb = function() {};

    var fc = profileService.focusedClient;
    if (isChromeApp) {
      this.error = gettext('Payment Protocol not supported on Chrome App');
      return cb(true);
    }

    var satToUnit = 1 / this.unitToSatoshi;
    var self = this;
    /// Get information of payment if using Payment Protocol
    self.setOngoingProcess(gettextCatalog.getString('Fetching Payment Information'));

    $log.debug('Fetch PayPro Request...', uri);
    $timeout(function() {
      fc.fetchPayPro({
        payProUrl: uri,
      }, function(err, paypro) {
        self.setOngoingProcess();

        if (err) {
          $log.warn('Could not fetch payment request:', err);
          self.resetForm();
          var msg = err.toString();
          if (msg.match('HTTP')) {
            msg = gettext('Could not fetch payment information');
          }
          self.error = msg;
          $timeout(function() {
            $rootScope.$digest();
          }, 1);
          return cb(true);
        }

        if (!paypro.verified) {
          self.resetForm();
          $log.warn('Failed to verified payment protocol signatured');
          self.error = gettext('Payment Protocol Invalid');
          $timeout(function() {
            $rootScope.$digest();
          }, 1);
          return cb(true);
        }

        self._paypro = paypro;
        self.setForm(paypro.toAddress, (paypro.amount * satToUnit).toFixed(self.unitDecimals), paypro.memo);
        return cb();
      });
    }, 1);
  };

  this.setFromUri = function(uri) {
    var self = this;

    function sanitizeUri(uri) {
      // Fixes when a region uses comma to separate decimals
      var regex = /[\?\&]amount=(\d+([\,\.]\d+)?)/i;
      var match = regex.exec(uri);
      if (!match || match.length === 0) {
        return uri;
      }
      var value = match[0].replace(',', '.');
      var newUri = uri.replace(regex, value);
      return newUri;
    };

    var satToUnit = 1 / this.unitToSatoshi;

    // URI extensions for Payment Protocol with non-backwards-compatible request
    if ((/^bitcoin:\?r=[\w+]/).exec(uri)) {
      uri = decodeURIComponent(uri.replace('bitcoin:?r=', ''));
      this.setFromPayPro(uri, function(err) {
        if (err) {
          return err;
        }
      });
    } else {
      uri = sanitizeUri(uri);

      if (!bitcore.URI.isValid(uri)) {
        return uri;
      }
      var parsed = new bitcore.URI(uri);

      var addr = parsed.address ? parsed.address.toString() : '';
      var message = parsed.message;

      var amount = parsed.amount ?
        (parsed.amount.toFixed(0) * satToUnit).toFixed(this.unitDecimals) : 0;


      if (parsed.r) {
        this.setFromPayPro(parsed.r, function(err) {
          if (err && addr && amount) {
            self.setForm(addr, amount, message);
            return addr;
          }
        });
      } else {
        this.setForm(addr, amount, message);
        return addr;
      }
    }

  };

  this.onAddressChange = function(value) {
    this.resetError();
    if (!value) return '';

    if (this._paypro)
      return value;

    if (value.indexOf('bitcoin:') === 0) {
      return this.setFromUri(value);
    } else if (/^https?:\/\//.test(value)) {
      return this.setFromPayPro(value);
    } else {
      return value;
    }
  };

  // History 

  function strip(number) {
    return (parseFloat(number.toPrecision(12)));
  }

  this.getUnitName = function() {
    return this.unitName;
  };

  this.getAlternativeIsoCode = function() {
    return this.alternativeIsoCode;
  };

  this.openTxModal = function(btx) {
    $rootScope.modalOpened = true;
    var self = this;
    var fc = profileService.focusedClient;
    var ModalInstanceCtrl = function($scope, $modalInstance) {
      $scope.btx = btx;
      $scope.settings = walletSettings;
      $scope.color = fc.backgroundColor;
      $scope.copayerId = fc.credentials.copayerId;
      $scope.isShared = fc.credentials.n > 1;

      $scope.getAmount = function(amount) {
        return self.getAmount(amount);
      };

      $scope.getUnitName = function() {
        return self.getUnitName();
      };

      $scope.getShortNetworkName = function() {
        var n = fc.credentials.network;
        return n.substring(0, 4);
      };

      $scope.copyAddress = function(addr) {
        if (!addr) return;
        self.copyAddress(addr);
      };

      $scope.cancel = lodash.debounce(function() {
        $modalInstance.dismiss('cancel');
      }, 0, 1000);

    };

    var modalInstance = $modal.open({
      templateUrl: 'views/modals/tx-details.html',
      windowClass: animationService.modalAnimated.slideRight,
      controller: ModalInstanceCtrl,
    });

    var disableCloseModal = $rootScope.$on('closeModal', function() {
      modalInstance.dismiss('cancel');
    });

    modalInstance.result.finally(function() {
      $rootScope.modalOpened = false;
      disableCloseModal();
      var m = angular.element(document.getElementsByClassName('reveal-modal'));
      m.addClass(animationService.modalAnimated.slideOutRight);
    });
  };

  this.hasAction = function(actions, action) {
    return actions.hasOwnProperty('create');
  };

  this._doSendAll = function(amount) {
    this.setForm(null, amount, null);
  };

  this.sendAll = function() {
    var self = this;
    self.error = null;
    self.setOngoingProcess(gettextCatalog.getString('Calculating fee'));
    $rootScope.$emit('Local/SetFeeSendMax', function(currentFeePerKb, availableMaxBalance, feeToSendMaxStr) {
      self.setOngoingProcess();
      if (lodash.isNull(currentFeePerKb)) {
        self.error = gettext('Could not calculate fee');
        $scope.$apply();
        return;
      }
      self.lockedCurrentFeePerKb = currentFeePerKb;
      var msg = gettextCatalog.getString("{{fee}} will be deducted for bitcoin networking fees", {
        fee: feeToSendMaxStr
      });

      $scope.$apply();
      confirmDialog.show(msg, function(confirmed) {
        if (confirmed) {
          self._doSendAll(availableMaxBalance);
        } else {
          self.resetForm();
        }
      });
    });
  };

  /* Start setup */

  this.bindTouchDown();
  if (profileService.focusedClient) {
    this.setAddress();
    this.setSendFormInputs();
  }
});
