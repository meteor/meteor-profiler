var getrusage = require('getrusage');

// The `Timer` class lets you easily measure durations of time
// consisting of multiple segments. Uses the nanosecond-resolution
// `process.hrtime()`.
//
// Call the `start()` and `stop()` methods appropriately, then call
// `totalMs()` to get the total duration for all segments.
class Timer {
  // @param onStopped {Function(durationMs)}
  constructor(id, onStopped) {
    this.id = id;
    this.running = false;
    this._totalMs = 0;
    this._onStopped = onStopped;
  }

  start() {
    if (this.id === '["analyze oplog entry"]') {
      console.trace("start");
    }

    if (this.running) {
      throw new Error("can't start a running timer: " + this.id);
    }

    this._startCPUTimeMs = getrusage.getcputime();
    this.running = true;
  }

  stop() {
    if (this.id === '["analyze oplog entry"]') {
      console.trace("stop");
    }

    if (!this.running) {
      throw new Error("can't stop a stopped timer: " + this.id);
    }

    var durationCPUTimeMs = 1000 * (getrusage.getcputime() - this._startCPUTimeMs);
    this._onStopped(durationCPUTimeMs);

    delete this._startCPUTimeMs;
    this.running = false;
  }
};

module.exports = Timer;
