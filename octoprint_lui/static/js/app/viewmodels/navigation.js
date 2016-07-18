$(function() {
    function NavigationViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.usersettings = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];

        self.showLoginFlyout = function (){
            self.usersettings.show();  
            self.flyout.showFlyout('login')
                .done(function () {
                })
            };
        }

        self.onUserLoggedOut = function() {
            location.reload();
        }

        //TODO: Remove!
        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            OctoPrint.postJson(url, data);
        };

        //TODO: Remove!
        self.doDebuggingAction = function()
        {
            self._sendApi({
                command: "trigger_debugging_action"
            });
        }

    OCTOPRINT_VIEWMODELS.push([
        NavigationViewModel,
        ["loginStateViewModel", "userSettingsViewModel", "flyoutViewModel", "printerStateViewModel"],
        ["#header"]
    ]);
});
