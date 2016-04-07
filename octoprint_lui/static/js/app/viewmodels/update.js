$(function() {
  function UpdateViewModel(parameters) {
    var self = this;
    
    self.loginState = parameters[0];
    self.system = parameters[1];

    self.fromResponse = function(data) {
      console.log(data);
    }

    self.requestData = function () {
      OctoPrint.simpleApiGet('lui', {
        success: self.fromResponse
      });
    }

    self.onSettingsShown = function () {
      self.requestData();
    }

  }

  OCTOPRINT_VIEWMODELS.push([
    UpdateViewModel,
    ["loginStateViewModel", "systemViewModel"],
    ['#update']
  ]);

});