// The `Timer` class lets you easily measure durations of time
// consisting of multiple segments. Uses the nanosecond-resolution
// `process.hrtime()`.
//
// Call the `start()` and `stop()` methods appropriately, then call
// `totalMs()` to get the total duration for all segments.
"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Timer = (function () {
  function Timer(id) {
    _classCallCheck(this, Timer);

    this.id = id;
    this.running = false;
    this._totalMs = 0;
  }

  _createClass(Timer, [{
    key: "start",
    value: function start() {
      if (this.running) {
        throw new Error("can't start a running timer: " + this.id);
      }

      this._startHrTime = process.hrtime();
      this.running = true;
    }
  }, {
    key: "stop",
    value: function stop() {
      if (!this.running) {
        throw new Error("can't stop a stopped timer: " + this.id);
      }

      var durationHrtime = process.hrtime(this._startHrTime);
      this._totalMs += durationHrtime[0] * 1000 + durationHrtime[1] / 1000000;

      delete this._startHrTime;
      this.running = false;
    }
  }, {
    key: "totalMs",
    value: function totalMs() {
      return this._totalMs;
    }
  }]);

  return Timer;
})();

;

module.exports = Timer;