$(function () {
    function SetupViewModel(parameters) {
        var self = this;

        self.flyout = parameters[0];

        self.languageSet = ko.observable(false);
        self.connectionSet = ko.observable(false);



    }

    OCTOPRINT_VIEWMODELS.push([
        SetupViewModel,
        ["flyoutViewModel"],
        ["#setup_settings_flyout_content"]
    ]);
});