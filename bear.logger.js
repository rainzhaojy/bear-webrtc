/**
 * @Copyright 2015 Cisco Systems Inc. All rights reserved.
 *
 * @author Rain Zhao
 * @version 1.0
 * @date 4/20/15
 *
 * comments
 */

var bear = (function(bear) {

    var Logger = bear.Logger = function (appTraceCb) {
        if (appTraceCb
            && typeof appTraceCb.log === 'function'
            && typeof appTraceCb.info === 'function'
            && typeof appTraceCb.warn === 'function'
            && typeof appTraceCb.error === 'function') {
            this.traceCb = appTraceCb;
        }
    };

    Logger.prototype._getLogPrefix = function() {
        var date = new Date();
        var timestamp = date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() + "." + date.getMilliseconds();
        var err = new Error();
        var callstack = err.stack.split("\n");
        /**
         callstack is an array, looks like:
         [0] Error,
         [1] _getLogPrefix(),
         [2] _log(),
         [3] log() or info() or warn() or error()
         [4] yourMethod()
         so the array[4] is your method line, like below:
         at yourMethodName (http://localhost:63342/bear/web/TSP-Server/examples/broadcast2.html:38:9)
         */
        var caller = callstack[4];
        var str = caller.slice(0, caller.lastIndexOf(':'));
        var filename = str.slice(str.lastIndexOf('/') + 1, str.lastIndexOf(':'));
        var lineNum = str.slice(str.lastIndexOf(':') + 1, str.length);
        str = str.slice(0, str.lastIndexOf(' '));
        var funcName = str.slice(str.lastIndexOf(' ') + 1, str.length);

        var prefix = '[' + timestamp + ']' + ' [' + filename + ':' + lineNum + ']' + ' [' + funcName + ']';
        return prefix;
    }

    Logger.prototype._log = function (type, args) {
        if (!args.length) {
            return;
        }

        if (this.traceCb) {
            this.traceCb[type].apply(this.traceCb, args);
        } else {
            //use default logger
            var prefix = this._getLogPrefix();
            args = Array.prototype.slice.apply(args);
            args.unshift(prefix);
            Function.apply.call(console[type], console, args);
        }
    };

    Logger.prototype.log = function () {
        this._log("log", arguments);
    };

    Logger.prototype.info = function () {
        this._log("info", arguments);
    };

    Logger.prototype.warn = function () {
        this._log("warn", arguments);
    };

    Logger.prototype.error = function () {
        this._log("error", arguments);
    };

    return bear;
})(bear || {});

if (typeof exports !== 'undefined') {
    exports.Logger = bear.Logger;
}