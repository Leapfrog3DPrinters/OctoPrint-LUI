$(function() {
    function NavigationViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.usersettings = parameters[2];
        self.flyout = parameters[3];

        self.showLoginFlyout = function (){
            self.usersettings.show();  
            self.flyout.showFlyout('login')
                .done(function () {
                    if (!self.loginState.loggedIn()) {
                        self.loginState.login();
                        console.log("Logged In");
                    }
                    else {
                        self.loginState.logout();
                        console.log("Logged Out");
                    }
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
        ["loginStateViewModel", "settingsViewModel", "userSettingsViewModel", "flyoutViewModel"],
        ["#header"]
    ]);
});
