$(function() {
  function UpdateViewModel(parameters) {
    var self = this;
    
    self.loginState = parameters[0];
    self.system = parameters[1];

    self.updateinfo = ko.observableArray([]);


    self.getUpdateText = function(data) {
      if (data.update()) {
        return "Update"
      } else {
        return "Up-to-date"
      }
    }

    self.getUpdateIcon = function(data) {
      if (data.update()) {
        return "fa-refresh"
      } else {
        return "fa-check"
      }
    }

    self.getUpdateButtonClass = function(data) {
      if (data.update()) {
        return ""
      } else {
        return "ok-button disabled"
      }
    } 

    self.sendSystemCommand = function(data) {
      command = {'actionSource': 'custom', 'action': data.action(), 'name': data.name()};
      self.system.triggerCommand(command);
    }

    self.fromResponse = function(data) {
      var info = ko.mapping.fromJS(data.update);
      self.updateinfo(info());
    }

    self.requestData = function () {
      OctoPrint.simpleApiGet('lui', {
        success: self.fromResponse
      });
    }

    self.onSettingsShown = function () {
      self.requestData();
    }

    self.onBeforeBinding = function () {
      self.requestData();
    }

  }

  OCTOPRINT_VIEWMODELS.push([
    UpdateViewModel,
    ["loginStateViewModel", "systemViewModel"],
    ['#update']
  ]);

});