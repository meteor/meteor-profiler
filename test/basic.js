var Profile = require("../lib/index.js").Profile;

describe("Profile.run", function () {
  it("works for the most basic case", function () {
    Profile.run("one second", function () {
      var start = new Date;
      while ((new Date - start) < 1000) {}
    });
  });
});
