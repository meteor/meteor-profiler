// The `Timer` class lets you easily measure durations of time
// consisting of multiple segments. Uses the nanosecond-resolution
// `process.hrtime()`.
//
// Call the `start()` and `stop()` methods appropriately, then call
// `totalMs()` to get the total duration for all segments.
class Timer {
  constructor(id) {
    this.id = id;
    this.running = false;
    this._totalMs = 0;
  }

  start() {
    if (this.running) {
      throw new Error("can't start a running timer");
    }

    this._startHrTime = process.hrtime();
    this.running = true;
  }

  stop() {
    if (!this.running) {
      throw new Error("can't stop a stopped timer");
    }

    var durationHrtime = process.hrtime(this._startHrTime);
    this._totalMs += durationHrtime[0] * 1000 + durationHrtime[1] / 1000000;

    delete this._startHrTime;
    this.running = false;
  }

  totalMs() {
    return this._totalMs;
  }
};

exports.Timer = Timer;
