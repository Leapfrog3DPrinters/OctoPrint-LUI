$(function () {
    function rgbwViewModel(parameters) {
        var self = this;
        //TODO: Function not ready. Pure testing.
        self.flyout = parameters[0];
        self.printerState = parameters[1];
        self.settings = parameters[2];
        self.toolInfo = parameters[3];
        self.filament = parameters[4];
        self.navigation = parameters[5];
        self.introView = parameters[6];
        self.allViewModels = [];
        
        self.color.red = ko.observable(undefined);
        self.color.green = ko.observable(undefined);
        self.color.blue = ko.observable(undefined);
        self.color.white = ko.observable(undefined);

        self.editColorVisible = false;
        self.editColor = function (name) {
            self.editColorVisible = true;
            
        }

    ADDITIONAL_VIEWMODELS.push([
        rgbwViewModel,
        ["flyoutViewModel", "printerStateViewModel", "settingsViewModel", "filamentViewModel", "navigationViewModel", "introViewModel"],
        ["#rgbw_flyout_content","#rgbw_flyout"]
    ]);
}});
