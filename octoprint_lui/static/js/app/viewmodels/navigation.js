$(function () {
    function NavigationViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.usersettings = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.settings = parameters[4];


        self.showLoginFlyout = function ()  {
            self.usersettings.show();
            self.flyout.showFlyout('login');
        }

        //TODO: Remove!
        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            OctoPrint.postJson(url, data);
        }

        //TODO: Remove!
        self.doDebuggingAction = function ()  {
            self._sendApi({
                command: "trigger_debugging_action"
            });
        }

        self.onStartup = function()
        {
            $('.network-status a').click(function ()  { self.settings.showSettingsTopic('wireless') });
        }

    }

    OCTOPRINT_VIEWMODELS.push([
        NavigationViewModel,
        ["loginStateViewModel", "userSettingsViewModel", "flyoutViewModel", "printerStateViewModel", "settingsViewModel"],
        ["#header"]
    ]);
});
