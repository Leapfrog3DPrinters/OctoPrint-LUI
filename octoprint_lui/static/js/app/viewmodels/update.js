$(function() {
  function UpdateViewModel(parameters) {
    var self = this;
    
    self.loginState = parameters[0];
    self.system = parameters[1];

    self.updateinfo = ko.observableArray([]);
    self.updating = ko.observable(false);
    self.update_needed = ko.observable(false);

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

    self.sendUpdateCommand = function(data) {

      var text = "You are about to update a component of the User Interface.";
      var question = "Do want to update " + data.name() + "?";
      var title = "Update: " + data.name()
      var dialog = {'title': title, 'text': text, 'question' : question};

      var command = {'actionSource': 'custom', 'action': data.action(), 'name': data.name(), confirm: dialog};
        self.system.triggerCommand(command)
            .done(function(){
              self.system.systemReboot();
            });
    };

    self.fromResponse = function(data) {
      var info = ko.mapping.fromJS(data.update);
      self.update_needed(!_.every(info(), function(i){return !i.update()}));
      console.log(self.update_needed());
      self.updateinfo(info());
    }

    self.requestData = function () {
      OctoPrint.simpleApiGet('lui', {
        success: self.fromResponse
      });
    }

    self.refreshUpdateInfo = function () {
      self.updating(true);
      $('#update_spinner').addClass('fa-spin');
      var data = {
        command: "refresh_update_info"
      };
      var url = OctoPrint.getSimpleApiUrl('lui');
      OctoPrint.postJson(url, data);
      setTimeout(function(){
        self.requestData();
        self.updating(false);
        $('#update_spinner').removeClass('fa-spin');
      }, 10000);
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
    ['#update', '#update_icon']
  ]);

});