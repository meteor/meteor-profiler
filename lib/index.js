// Tiny profiler
//
// Enable by setting the environment variable `METEOR_PROFILE_SERVER`.
//
// The main entry point is `Profile`, which wraps an existing function
// and returns a new function which, when called, calls the original
// function and profiles it.
//
// before:
//
//     foo: function (a) {
//       return a + this.b;
//     },
//
// after:
//
//     foo: Profile("foo", function (a) {
//       return a + this.b;
//     }),
//
// The advantage of this form is that it doesn't change the
// indentation of the wrapped code, which makes merging changes from
// other code branches easier.
//
// If profiling is disabled (if `METEOR_PROFILE_SERVER` isn't set),
// `Profile` simply returns the original function.
//
// To run a profiling session and print the report, call `Profile.run`:
//
//     var createBundle = function () {
//       Profile.run("bundle", function () {
//         ...code to create the bundle which includes calls to `Profile`.
//       });
//     };
//
// Code is not profiled when called outside of a `Profile.run`, so the
// times in the report only include the time spent inside of the call
// to `Profile.run`.
//
// Sometimes you'll want to use a name for the profile bucket which
// depends on the arguments passed to the function or the value of
// `this`.  In this case you can pass a function for the bucket
// argument, which will be called to get the bucket name.
//
// before:
//     build: function (target) {
//       ... build target ...
//     },
//
// after:
//     build: Profile(
//       function (target) { return "build " + target; },
//       function (target) {
//         ... build target ...
//       }),
//
// But if it's easier, you can use `Profile.time` instead, which
// immediately calls the passed function with no arguments and
// profiles it, and returns what the function returns.
//
//     foo: function (a) {
//       var self = this;
//       return Profile.time("foo", function () {
//         return a + self.b;
//       });
//     },
//
//     build: function (target) {
//       var self = this;
//       self.doSomeSetup();
//       Profile.time("build " + target, function () {
//         ... build target ...
//       });
//       self.doSomeCleanup();
//     },
//
// The disadvantage is that you end up changing the indentation of the
// profiled code, which makes merging branches more painful.  But you
// can profile anywhere in the code; you don't have to just profile at
// function boundaries.
//
// Note profiling code will itself add a bit of execution time.
// If you profile in a tight loop and your total execution time is
// going up, you're probably starting to profile how long it takes to
// profile things :).
//
// If another profile (such as "compile js") is called while the first
// function is currently being profiled, this creates an entry like
// this:
//
//    build client : compile js
//
// which can continue to be nested, e.g.,
//
//    build client : compile js : read source files
//
// The total time reported for a bucket such as "build client" doesn't
// change regardless of whether it has child entries or not.  However,
// if an entry has child entries, it automatically gets an "other"
// entry:
//
//     build client: 400.0
//       compile js: 300.0
//         read source files: 20.0
//         other compile js: 280.0
//       other build client: 100.0
//
// The "other" entry reports how much time was spent in the "build
// client" entry not spent in the other child entries.
//
// The are two reports displayed: the hierarchical report and the
// leaf time report.  The hierarchical report looks like the example
// above and shows how much time was spent in each entry within its
// parent entry.
//
// The primary purpose of the hierarchical report is to be able to see
// where times are unaccounted for.  If you see a lot of time being
// spent in an "other" bucket, and you don't know what it is, you can
// add more profiling to dig deeper.
//
// The leaf time report shows the total time spent within leaf
// buckets.  For example, if if multiple steps have "read source
// files", the leaf time reports shows the total amount of time spent
// in "read source files" across all calls.
//
// Once you see in the hierarchical report that you have a good handle
// on accounting for most of the time, the leaf report shows you which
// buckets are the most expensive.
//
// By only including leaf buckets, the times in the leaf report are
// non-overlapping.  (The total of the times equals the elapsed time
// being profiled).
//
// For example, suppose "A" is profiled for a total time of 200ms, and
// that includes a call to "B" of 150ms:
//
//     B: 150
//     A (without B): 50
//
// and suppose there's another call to "A" which *doesn't* include a
// call to "B":
//
//     A: 300
//
// and there's a call to "B" directly:
//
//     B: 100
//
// All for a total time of 600ms.  In the hierarchical report, this
// looks like:
//
//     A: 500.0
//       B: 150.0
//       other A: 350.0
//     B: 100.0
//
// and in the leaf time report:
//
//     other A: 350.0
//     B: 250.0
//
// In both reports the grand total is 600ms.

'use strict';

var _ = require('underscore');
var Fiber = require('fibers');
var Timer = require('./timer');

var enabled = !!process.env['METEOR_PROFILE_SERVER'];
var filter = ~ ~process.env['METEOR_PROFILE_SERVER'] || 10; // ms

var bucketTimes = {};
// a copy of `bucketTimes`, with additional "other ..."
// leafs. computed by setupReport()
var bucketTimesAndOther = {};

// if this is set to an array, it will collect log lines.
var printToBuffer = null;

var spaces = function spaces(x) {
  var s = '';
  for (var i = 0; i < x; ++i) s += '  ';
  return s;
};

var globalEntry = [];

var running = false;

var start = function start() {
  if (running) {
    throw new Error("Already running");
  }

  bucketTimes = {};
  bucketTimesAndOther = {};
  running = true;
};

var Profile = function Profile(bucketName, f) {
  if (!enabled) return f;

  return function () {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    if (!running) return f.apply(this, args);

    var name;
    if (_.isFunction(bucketName)) name = bucketName.apply(this, args);else name = bucketName;

    var currentEntry;
    if (Fiber.current) {
      currentEntry = Fiber.current.profilerEntry || (Fiber.current.profilerEntry = []);
    } else {
      currentEntry = globalEntry;
    }
    currentEntry.push(name);

    // need to clone so that the `onStopped` closure refers to the
    // value of `currentEntry` at this point of time.
    var timerCurrentEntry = _.clone(currentEntry);
    var timer = new Timer(
    /*id=*/JSON.stringify(currentEntry),
    /*onStopped=*/function (durationMs) {
      increase(timerCurrentEntry, durationMs);
    });

    if (Fiber.current) {
      Fiber.current.timers = Fiber.current.timers || [];
      Fiber.current.timers.push(timer);
    }
    timer.start();

    var err = null;
    try {
      return f.apply(this, args);
    } finally {
      timer.stop();
      if (Fiber.current) {
        var poppedTimer = Fiber.current.timers.pop();
        if (timer !== poppedTimer) {
          console.trace("unexpected timer at top of stack: " + poppedTimer.id + "; expected: " + timer.id);
          process.exit(1);
        }
      }
      currentEntry.pop();
    }
  };
};

var time = function time(bucket, f) {
  return Profile(bucket, f)();
};

var increase = function increase(entry, durationMs) {
  if (!enabled) {
    return;
  }

  if (!_.isArray(entry)) {
    entry = [entry];
  }

  var key = JSON.stringify(entry);
  bucketTimes[key] = (bucketTimes[key] || 0) + durationMs;
};

var entries = null;

var prefix = "| ";

var entryName = function entryName(entry) {
  return _.last(entry);
};

var entryTime = function entryTime(entry) {
  return bucketTimesAndOther[JSON.stringify(entry)];
};

var isTopLevelEntry = function isTopLevelEntry(entry) {
  return entry.length === 1;
};

var topLevelEntries = function topLevelEntries() {
  return _.filter(entries, isTopLevelEntry);
};

var print = function print(indent, text) {
  var line = prefix + spaces(indent * 2) + text;
  if (printToBuffer) {
    printToBuffer.push(line);
  } else {
    console.log(line);
  }
};

var isChild = function isChild(entry1, entry2) {
  return entry2.length === entry1.length + 1 && _.isEqual(entry1, entry2.slice(0, entry1.length));
};

var children = function children(entry1) {
  return _.filter(entries, function (entry2) {
    return isChild(entry1, entry2);
  });
};

var hasChildren = function hasChildren(entry) {
  return children(entry).length !== 0;
};

var isLeaf = function isLeaf(entry) {
  return !hasChildren(entry);
};

var reportOnLeaf = function reportOnLeaf(level, entry) {
  if (entryTime(entry) < filter) return;
  print(level, _.last(entry) + ": " + entryTime(entry).toFixed(1));
};

var otherTime = function otherTime(entry) {
  var total = 0;
  _.each(children(entry), function (child) {
    total += bucketTimes[JSON.stringify(child)];
  });
  return entryTime(entry) - total;
};

var injectOtherTime = function injectOtherTime(entry) {
  var name = "other " + entryName(entry);
  var other = _.clone(entry);
  other.push(name);
  bucketTimesAndOther[JSON.stringify(other)] = otherTime(entry);
  entries.push(other);
};

var reportOnParent = function reportOnParent(level, entry) {
  if (entryTime(entry) < filter) return;
  print(level, entryName(entry) + ": " + entryTime(entry).toFixed(1));
  _.each(children(entry), function (child) {
    reportOn(level + 1, child);
  });
};

var reportOn = function reportOn(level, entry) {
  if (hasChildren(entry)) reportOnParent(level, entry);else reportOnLeaf(level, entry);
};

var reportHierarchy = function reportHierarchy() {
  _.each(topLevelEntries(), function (entry) {
    reportOn(0, entry);
  });
};

var allLeafs = function allLeafs() {
  return _.union(_.map(_.filter(entries, isLeaf), entryName));
};

var leafTotal = function leafTotal(leafName) {
  var total = 0;
  _.each(_.filter(entries, function (entry) {
    return isLeaf(entry) && entryName(entry) === leafName;
  }), function (leaf) {
    total += entryTime(leaf);
  });
  return total;
};

var reportTotals = function reportTotals() {
  var totals = [];
  _.each(allLeafs(), function (leaf) {
    totals.push({ name: leaf, time: leafTotal(leaf) });
  });
  totals.sort(function (a, b) {
    return a.time === b.time ? 0 : a.time > b.time ? -1 : 1;
  });
  var grandTotal = 0;
  _.each(totals, function (total) {
    if (total.time < filter) return;
    print(0, total.name + ": " + total.time.toFixed(1));
    grandTotal += total.time;
  });
  print(0, "Measured CPU: " + grandTotal.toFixed(1));
};

var setupReport = function setupReport() {
  entries = _.map(_.keys(bucketTimes), JSON.parse);
  bucketTimesAndOther = _.clone(bucketTimes);
  _.each(_.filter(entries, hasChildren), function (parent) {
    injectOtherTime(parent);
  });
};

var report = function report() {
  if (!enabled) return;
  running = false;
  reportWithoutStopping();
};

var reportWithoutStopping = function reportWithoutStopping() {
  print(0, '');
  setupReport();
  reportHierarchy();
  print(0, '');
  reportTotals();
};

var run = function run(bucketName, f) {
  start();
  try {
    return time(bucketName, f);
  } finally {
    report();
  }
};

var stop = function stop() {
  if (!running) {
    throw new Error("not running");
  }

  printToBuffer = [];
  report();
  running = false;
  var result = printToBuffer.join("\n");
  printToBuffer = null;
  return result;
};

Profile.time = time;
Profile.run = run;
Profile.start = start;
Profile.stop = stop;
Profile.increase = increase;

exports.Profile = Profile;