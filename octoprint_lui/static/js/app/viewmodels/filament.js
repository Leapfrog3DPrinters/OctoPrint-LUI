$(function() {
  function FilamentViewModel(parameters) {
    var self = this;
    
    self.loginState = parameters[0];
    self.settings = parameters[1];
    self.flyout = parameters[2];
    self.printerState = parameters[3];

    self.leftMaterial = ko.observable(undefined);
    self.rightMaterial = ko.observable(undefined);

    self.leftFilamentAmount = ko.computed(function(){
        if (self.printerState.filament()[1] !== undefined)
            return formatFilament(self.printerState.filament()[1]["data"]()["length"]);
    });
    self.rightFilamentAmount = ko.computed(function(){
        if (self.printerState.filament()[1] !== undefined)
            return formatFilament(self.printerState.filament()[0]["data"]()["length"]);
    });


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

    self.startLoading = function(tool) {
        self.sendApi({
            command: "start_loading", 
            tool: tool});
    };

    self.stopLoading = function() {
        self.sendApi({
            command: "stop_loading"});
    };

    self.sendApi = function(data) {
      $.ajax({
          url: API_BASEURL + "plugin/lui",
          type: "POST",
          dataType: "json",
          contentType: "application/json; charset=UTF-8",
          data: JSON.stringify(data)
      });
    };

  }

  OCTOPRINT_VIEWMODELS.push([
    FilamentViewModel,
    ["loginStateViewModel","settingsViewModel","flyoutViewModel","printerStateViewModel"],
    ["#filament_status", "#filament_flyout"]
  ]);

});