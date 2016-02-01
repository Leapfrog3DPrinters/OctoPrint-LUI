$(function() {
  function FilamentViewModel(parameters) {
    var self = this;
    
    self.loginState = parameters[0];
    self.settings = parameters[1];
    self.flyout = parameters[2];
    self.printerState = parameters[3];

    self.leftMaterial = ko.observable(undefined);
    self.rightMaterial = ko.observable(undefined);

    self.leftFilamentAmount = ko.observable(undefined);
    self.rightFilamentAmount = ko.observable(undefined);


    self.showFilamentChangeFlyout =function () {
        self.flyout.showFlyout('filament')
        .done(function (){
          console.log("filament clicked");
        });
    };

    self.fromCurrentData = function(data) {
        self._processStateData(data.state);
    };

    self.fromHistoryData = function(data) {
        self._processStateData(data.state);
    };

    self._processStateData = function(data) {

    };

    self.onBeforeBinding = function () {
        self.leftMaterial(self.settings.temperature_profiles()[1]);
        self.rightMaterial(self.settings.temperature_profiles()[0]);
    };

    self.onStartUp = function () {
        // Something with loading defaults
    };

  }

  OCTOPRINT_VIEWMODELS.push([
    FilamentViewModel,
    ["loginStateViewModel","settingsViewModel","flyoutViewModel","printerStateViewModel"],
    ["#filament_status", "#filament_flyout"]
  ]);

});