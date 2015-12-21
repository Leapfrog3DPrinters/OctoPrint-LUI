$(function() {
  function FilamentViewModel(parameters) {
    var self = this;
    
    self.loginState = parameters[0];
    self.settings = parameters[1];
    self.flyout = parameters[2];
    self.printerState = parameters[3];

    self.isErrorOrClosed = ko.observable(undefined);
    self.isOperational = ko.observable(undefined);
    self.isPrinting = ko.observable(undefined);
    self.isPaused = ko.observable(undefined);
    self.isError = ko.observable(undefined);
    self.isReady = ko.observable(undefined);
    self.isLoading = ko.observable(undefined);


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
        self.isErrorOrClosed(data.flags.closedOrError);
        self.isOperational(data.flags.operational);
        self.isPaused(data.flags.paused);
        self.isPrinting(data.flags.printing);
        self.isError(data.flags.error);
        self.isReady(data.flags.ready);
        self.isLoading(data.flags.loading);
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
    ["#filament", "#filament_flyout"]
  ]);

});