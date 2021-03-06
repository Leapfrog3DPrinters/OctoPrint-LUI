$(function () {
    function LoginStateViewModel(parameters) {
        var self = this;

        self.flyout = parameters[0];

        self.loginUser = ko.observable();
        self.loginPass = ko.observable();
        self.loginRemember = ko.observable(false);

        self.loggedIn = ko.observable(false);
        self.username = ko.observable(undefined);
        self.isAdmin = ko.observable(false);
        self.isUser = ko.observable(false);

        self.allViewModels = undefined;

        self.currentUser = ko.observable(undefined);

        self.elementUsernameInput = undefined;
        self.elementPasswordInput = undefined;
        self.elementLoginButton = undefined;

        self.userMenuText = ko.computed(function () {
            if (self.loggedIn()) {
                return self.username();
            } else {
                return gettext("Login");
            }
        });

        self.reloadUser = function () {
            if (self.currentUser() == undefined) {
                return;
            }

            OctoPrint.users.get(self.currentUser().name)
                .done(self.fromResponse);
        };

        self.requestData = function () {
            // TODO: Maybe move this somewhere else, so it's not executed in parallel with other requests (which may 'corrupt' the cookie)
            OctoPrint.browser.passiveLogin()
                .done(self.fromResponse);
        };

        self.fromResponse = function(response) {
            if (response && response.name) {
                self.loggedIn(true);
                self.username(response.name);
                self.isUser(response.user);
                self.isAdmin(response.admin);

                self.currentUser(response);

                callViewModels(self.allViewModels, "onUserLoggedIn", [response]);
            } else {
                self.loggedIn(false);
                self.username(undefined);
                self.isUser(false);
                self.isAdmin(false);

                self.currentUser(undefined);

                callViewModels(self.allViewModels, "onUserLoggedOut");
            }
        };

        self.login = function(u, p, r) {
            var username = u || self.loginUser();
            var password = p || self.loginPass();
            var remember = (r != undefined ? r : self.loginRemember());

            self.loginUser("");
            self.loginPass("");
            self.loginRemember(false);

            return OctoPrint.browser.login(username, password, remember)
                .done(function(response) {
                    $.notify({title: gettext("Login successful"), text: _.sprintf(gettext('You are now logged in as "%(username)s"'), {username: response.name})}, "success");
                    self.fromResponse(response);
                    self.flyout.closeFlyoutAccept();
                })
                .fail(function () {
                    $.notify({title: gettext("Login failed"), text: gettext("User unknown or wrong password")}, "error");
                });
        };

        self.logout = function () {
            OctoPrint.browser.logout()
                .done(function(response) {
                    $.notify({title: gettext("Logout successful"), text: gettext("You are now logged out")}, "success");
                    self.fromResponse(response);
                    self.flyout.closeFlyoutAccept();
                });
        };

        self.loginOrOut = function () {
            if (!self.loggedIn()) {
                self.login();
            }
            else {
                self.logout();
            }
        };

        self.onAllBound = function(allViewModels) {
            self.allViewModels = allViewModels;
        };

        self.onStartupComplete = self.onServerConnect = function () {
            if (self.allViewModels == undefined) return;
            self.requestData();
        };


    }

    OCTOPRINT_VIEWMODELS.push([
        LoginStateViewModel,
        ["flyoutViewModel"],
        []
    ]);
});
