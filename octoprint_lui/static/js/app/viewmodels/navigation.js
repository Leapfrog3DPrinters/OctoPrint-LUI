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
                .fail(function() {console.log("Close or Overlay")})
                .always(function() {console.log("Always Login")});
            };
        }

        self.onUserLoggedOut = function() {
            location.reload();
        }

    OCTOPRINT_VIEWMODELS.push([
        NavigationViewModel,
        ["loginStateViewModel", "userSettingsViewModel", "flyoutViewModel", "printerStateViewModel"],
        ["#header"]
    ]);
});
