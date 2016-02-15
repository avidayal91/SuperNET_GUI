//conversion.js
var Convert = {};

/**
 * Convert a binary string to his hexadecimal representation
 * @param {String} src binary string
 * @static
 * @returns {String} hexadecimal representation
 */
Convert.stringToHex = function(src) {
  var r = "";
  var hexes = new Array("0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f");
  for (var i = 0; i < src.length; i++) {
    r += hexes[src.charCodeAt(i) >> 4] + hexes[src.charCodeAt(i) & 0xf];
  }
  return r;
}

/**
 * Convert an hexadecimal string to its binary representation
 * @param {String} src hexadecimal string
 * @static
 * @return {Array} byte array
 * @throws {InvalidString} if the string isn't properly formatted
 */
Convert.hexToBin = function(src) {
  var result = "";
  var digits = "0123456789ABCDEF";
  if ((src.length % 2) != 0) {
    throw "Invalid string";
  }
  src = src.toUpperCase();
  for (var i = 0; i < src.length; i += 2) {
    var x1 = digits.indexOf(src.charAt(i));
    if (x1 < 0) {
      return "";
    }
    var x2 = digits.indexOf(src.charAt(i + 1));
    if (x2 < 0) {
      return "";
    }
    result += String.fromCharCode((x1 << 4) + x2);
  }
  return result;
}

/**
 * Convert a double digit hexadecimal number to an integer
 * @static
 * @param {String} data buffer containing the digit to parse
 * @param {Number} offset offset to the digit (default is 0)
 * @returns {Number} converted digit
 */
Convert.readHexDigit = function(data, offset) {
  var digits = '0123456789ABCDEF';
  if (typeof offset == "undefined") {
    offset = 0;
  }
  return (digits.indexOf(data.substring(offset, offset + 1).toUpperCase()) << 4) + (digits.indexOf(data.substring(offset + 1, offset + 2).toUpperCase()));
}

/**
 * Convert a number to a two digits hexadecimal string (deprecated)
 * @static
 * @param {Number} number number to convert
 * @returns {String} converted number
 */
Convert.toHexDigit = function(number) {
  var digits = '0123456789abcdef';
  return digits.charAt(number >> 4) + digits.charAt(number & 0x0F);
}

/**
 * Convert a number to a two digits hexadecimal string (similar to toHexDigit)
 * @static
 * @param {Number} number number to convert
 * @returns {String} converted number
 */
Convert.toHexByte = function(number) {
  return Convert.toHexDigit(number);
}

/**
 * Convert a BCD number to a two digits hexadecimal string
 * @static
 * @param {Number} number number to convert
 * @returns {String} converted number
 */
Convert.toHexByteBCD = function(numberBCD) {
  var number = ((numberBCD / 10) * 16) + (numberBCD % 10);
  return Convert.toHexDigit(number);
}


/**
 * Convert a number to an hexadecimal short number
 * @static
 * @param {Number} number number to convert
 * @returns {String} converted number
 */
Convert.toHexShort = function(number) {
  return Convert.toHexDigit((number >> 8) & 0xff) + Convert.toHexDigit(number & 0xff);
}

/**
 * Convert a number to an hexadecimal int number
 * @static
 * @param {Number} number number to convert
 * @returns {String} converted number
 */
Convert.toHexInt = function(number) {
  return Convert.toHexDigit((number >> 24) & 0xff) + Convert.toHexDigit((number >> 16) & 0xff) +
    Convert.toHexDigit((number >> 8) & 0xff) + Convert.toHexDigit(number & 0xff);
}

//conversion.js--

//bytestring


var GP = {};
GP.ASCII = 1;
GP.HEX = 5;

/**
 * @class GPScript ByteString implementation
 * @param {String} value initial value
 * @param {HEX|ASCII} encoding encoding to use
 * @property {Number} length length of the ByteString
 * @constructs
 */
var ByteString = function(value, encoding) {
  this.encoding = encoding;
  this.hasBuffer = (typeof Buffer != 'undefined');
  if (this.hasBuffer && (value instanceof Buffer)) {
    this.value = value;
    this.encoding = GP.HEX;
  } else {
    switch (encoding) {
      case GP.HEX:
        if (!this.hasBuffer) {
          this.value = Convert.hexToBin(value);
        } else {
          this.value = new Buffer(value, 'hex');
        }
        break;

      case GP.ASCII:
        if (!this.hasBuffer) {
          this.value = value;
        } else {
          this.value = new Buffer(value, 'ascii');
        }
        break;

      default:
        throw "Invalid arguments";
    }
  }
  this.length = this.value.length;
}

/**
 * Retrieve the byte value at the given index
 * @param {Number} index index
 * @returns {Number} byte value
 */
ByteString.prototype.byteAt = function(index) {
  if (arguments.length < 1) {
    throw "Argument missing";
  }
  if (typeof index != "number") {
    throw "Invalid index";
  }
  if ((index < 0) || (index >= this.value.length)) {
    throw "Invalid index offset";
  }
  if (!this.hasBuffer) {
    return Convert.readHexDigit(Convert.stringToHex(this.value.substring(index, index + 1)));
  } else {
    return this.value[index];
  }
}

/**
 * Retrieve a subset of the ByteString
 * @param {Number} offset offset to start at
 * @param {Number} [count] size of the target ByteString (default : use the remaining length)
 * @returns {ByteString} subset of the original ByteString
 */
ByteString.prototype.bytes = function(offset, count) {
  var result;
  if (arguments.length < 1) {
    throw "Argument missing";
  }
  if (typeof offset != "number") {
    throw "Invalid offset";
  }
  //if ((offset < 0) || (offset >= this.value.length)) {
  if (offset < 0) {
    throw "Invalid offset";
  }
  if (typeof count == "number") {
    if (count < 0) {
      throw "Invalid count";
    }
    if (!this.hasBuffer) {
      result = new ByteString(this.value.substring(offset, offset + count), GP.ASCII);
    } else {
      result = new Buffer(count);
      this.value.copy(result, 0, offset, offset + count);
    }
  } else
  if (typeof count == "undefined") {
    if (!this.hasBuffer) {
      result = new ByteString(this.value.substring(offset), GP.ASCII);
    } else {
      result = new Buffer(this.value.length - offset);
      this.value.copy(result, 0, offset, this.value.length);
    }
  } else {
    throw "Invalid count";
  }
  if (!this.hasBuffer) {
    result.encoding = this.encoding;
    return result;
  } else {
    return new ByteString(result, GP.HEX);
  }
}

/**
 * Appends two ByteString
 * @param {ByteString} target ByteString to append
 * @returns {ByteString} result of the concatenation
 */
ByteString.prototype.concat = function(target) {
  if (arguments.length < 1) {
    throw "Not enough arguments";
  }
  if (!(target instanceof ByteString)) {
    throw "Invalid argument";
  }
  if (!this.hasBuffer) {
    var result = this.value + target.value;
    var x = new ByteString(result, GP.ASCII);
    x.encoding = this.encoding;
    return x;
  } else {
    var result = Buffer.concat([this.value, target.value]);
    return new ByteString(result, GP.HEX);
  }
}

/**
 * Check if two ByteString are equal
 * @param {ByteString} target ByteString to check against
 * @returns {Boolean} true if the two ByteString are equal
 */
ByteString.prototype.equals = function(target) {
  if (arguments.length < 1) {
    throw "Not enough arguments";
  }
  if (!(target instanceof ByteString)) {
    throw "Invalid argument";
  }
  if (!this.hasBuffer) {
    return (this.value == target.value);
  } else {
    return Buffer.equals(this.value, target.value);
  }
}


/**
 * Convert the ByteString to a String using the given encoding
 * @param {HEX|ASCII|UTF8|BASE64|CN} encoding encoding to use
 * @return {String} converted content
 */
ByteString.prototype.toString = function(encoding) {
  var targetEncoding = this.encoding;
  if (arguments.length >= 1) {
    if (typeof encoding != "number") {
      throw "Invalid encoding";
    }
    switch (encoding) {
      case GP.HEX:
      case GP.ASCII:
        targetEncoding = encoding;
        break;

      default:
        throw "Unsupported arguments";
    }
    targetEncoding = encoding;
  }
  switch (targetEncoding) {
    case GP.HEX:
      if (!this.hasBuffer) {
        return Convert.stringToHex(this.value);
      } else {
        return this.value.toString('hex');
      }
    case GP.ASCII:
      if (!this.hasBuffer) {
        return this.value;
      } else {
        return this.value.toString();
      }
    default:
      throw "Unsupported";
  }
}

ByteString.prototype.toStringIE = function(encoding) {
  return this.toString(encoding);
}

ByteString.prototype.toBuffer = function() {
  return this.value;
}

//bytestring--

//ratestring


'use strict';

//var util = require('util');
//var _ = require('lodash');
//var log = require('../util/log');
//var preconditions = require('preconditions').singleton();
//var request = require('request');

/*
  This class lets interfaces with BitPay's exchange rate API.
*/

var RateService = function(opts) {
  var self = this;

  opts = opts || {};
  self.httprequest = opts.httprequest; // || request;
  self.lodash = opts.lodash;

  self.SAT_TO_BTC = 1 / 1e8;
  self.BTC_TO_SAT = 1e8;
  self.UNAVAILABLE_ERROR = 'Service is not available - check for service.isAvailable() or use service.whenAvailable()';
  self.UNSUPPORTED_CURRENCY_ERROR = 'Currency not supported';

  self._url = opts.url || 'https://insight.bitpay.com:443/api/rates';

  self._isAvailable = false;
  self._rates = {};
  self._alternatives = [];
  self._queued = [];

  self._fetchCurrencies();
};


var _instance;
RateService.singleton = function(opts) {
  if (!_instance) {
    _instance = new RateService(opts);
  }
  return _instance;
};

RateService.prototype._fetchCurrencies = function() {
  var self = this;

  var backoffSeconds = 5;
  var updateFrequencySeconds = 5 * 60;
  var rateServiceUrl = 'https://bitpay.com/api/rates';

  var retrieve = function() {
    //log.info('Fetching exchange rates');
    self.httprequest.get(rateServiceUrl).success(function(res) {
      self.lodash.each(res, function(currency) {
        self._rates[currency.code] = currency.rate;
        self._alternatives.push({
          name: currency.name,
          isoCode: currency.code,
          rate: currency.rate
        });
      });
      self._isAvailable = true;
      self.lodash.each(self._queued, function(callback) {
        setTimeout(callback, 1);
      });
      setTimeout(retrieve, updateFrequencySeconds * 1000);
    }).error(function(err) {
      //log.debug('Error fetching exchange rates', err);
      setTimeout(function() {
        backoffSeconds *= 1.5;
        retrieve();
      }, backoffSeconds * 1000);
      return;
    });

  };

  retrieve();
};

RateService.prototype.getRate = function(code) {
  return this._rates[code];
};

RateService.prototype.getHistoricRate = function(code, date, cb) {
  var self = this;

  self.httprequest.get(self._url + '/' + code + '?ts=' + date)
    .success(function(body) {
      return cb(null, body.rate)
    })
    .error(function(err) {
      return cb(err)
    });

};

RateService.prototype.getHistoricRates = function(code, dates, cb) {
  var self = this;

  var tsList = dates.join(',');

  self.httprequest.get(self._url + '/' + code + '?ts=' + tsList)
    .success(function(body) {
      if (!self.lodash.isArray(body)) {
        body = [{
          ts: dates[0],
          rate: body.rate
        }];
      }
      return cb(null, body);
    })
    .error(function(err) {
      return cb(err)
    });
};

RateService.prototype.getAlternatives = function() {
  return this._alternatives;
};

RateService.prototype.isAvailable = function() {
  return this._isAvailable;
};

RateService.prototype.whenAvailable = function(callback) {
  if (this.isAvailable()) {
    setTimeout(callback, 1);
  } else {
    this._queued.push(callback);
  }
};

RateService.prototype.toFiat = function(satoshis, code) {
  if (!this.isAvailable()) {
    return null;
  }

  return satoshis * this.SAT_TO_BTC * this.getRate(code);
};

RateService.prototype.toFiatHistoric = function(satoshis, code, date, cb) {
  var self = this;

  self.getHistoricRate(code, date, function(err, rate) {
    if (err) return cb(err);
    return cb(null, satoshis * self.SAT_TO_BTC * rate);
  });
};

RateService.prototype.fromFiat = function(amount, code) {
  if (!this.isAvailable()) {
    return null;
  }
  return amount / this.getRate(code) * this.BTC_TO_SAT;
};

RateService.prototype.listAlternatives = function() {
  var self = this;
  if (!this.isAvailable()) {
    return [];
  }

  return self.lodash.map(this.getAlternatives(), function(item) {
    return {
      name: item.name,
      isoCode: item.isoCode
    }
  });
};

angular.module('copayApp.services').factory('rateService', function($http, lodash) {
  // var cfg = _.extend(config.rates, {
  //   httprequest: $http
  // });

  var cfg = {
    httprequest: $http,
    lodash: lodash
  };
  return RateService.singleton(cfg);
});

//ratestring--