"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var getrusage = require('getrusage');

// The `Timer` class lets you easily measure durations of time
// consisting of multiple segments. Uses the nanosecond-resolution
// `process.hrtime()`.
//
// Call the `start()` and `stop()` methods appropriately, then call
// `totalMs()` to get the total duration for all segments.

var Timer = (function () {
  // @param onStopped {Function(durationMs)}

  function Timer(id, onStopped) {
    _classCallCheck(this, Timer);

    this.id = id;
    this.running = false;
    this._totalMs = 0;
    this._onStopped = onStopped;
  }

  _createClass(Timer, [{
    key: "start",
    value: function start() {
      if (this.running) {
        console.trace("can't start a running timer: " + this.id);
        process.exit(1);
      }

      this._startCPUTimeSecs = getrusage.getcputime();
      this.running = true;
    }
  }, {
    key: "stop",
    value: function stop() {
      if (!this.running) {
        console.trace("can't stop a stopped timer: " + this.id);
        process.exit(1);
      }

      var durationCPUTimeMs = 1000 * (getrusage.getcputime() - this._startCPUTimeSecs);
      this._onStopped(durationCPUTimeMs);

      delete this._startCPUTimeSecs;
      this.running = false;
    }
  }]);

  return Timer;
})();

;

module.exports = Timer;