$(function() {
    function UsersViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];

        self.reservedUsernames = [];

        // initialize list helper
        self.listHelper = new ItemListHelper(
            "users",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {
                
            },
            "name",
            [],
            [],
            CONFIG_USERSPERPAGE
        );

        self.emptyUser = {name: "", admin: false, active: false};

        self.currentUser = ko.observable(self.emptyUser);

        self.editorUsername = ko.observable(undefined);
        self.editorPassword = ko.observable(undefined);
        self.editorRepeatedPassword = ko.observable(undefined);
        self.editorApikey = ko.observable(undefined);
        self.editorAdmin = ko.observable(undefined);
        self.editorActive = ko.observable(undefined);

        self.addUserDialog = undefined;
        self.editUserDialog = undefined;
        self.userList = undefined;
        self.changePasswordDialog = undefined;

        self.currentUser.subscribe(function(newValue) {
            if (newValue === undefined) {
                self.editorUsername(undefined);
                self.editorAdmin(undefined);
                self.editorActive(undefined);
                self.editorApikey(undefined);
            } else {
                self.editorUsername(newValue.name);
                self.editorAdmin(newValue.admin);
                self.editorActive(newValue.active);
                self.editorApikey(newValue.apikey);
            }
            self.editorPassword(undefined);
            self.editorRepeatedPassword(undefined);
        });

        self.editorPasswordMismatch = ko.computed(function() {
            return self.editorPassword() != self.editorRepeatedPassword();
        });

        self.noPassword = ko.computed(function () {
            return self.editorPassword() == "" || self.editorPassword() === undefined;
        });

        self.noUsername = ko.computed(function () {
            return self.editorUsername() == "" || self.editorUsername() === undefined;
        })

        self.requestData = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            OctoPrint.simpleApiGet('lui', {
                success: function(data)
                {
                    self.reservedUsernames = data.reserved_usernames;

                    OctoPrint.users.list().done(self.fromResponse);
                }
            });
        };

        self.fromResponse = function(response) {
            
            self.listHelper.updateItems(response.users.filter(function(user) 
            {
                //Only return users not in the reserved username list
                return self.reservedUsernames.find(function (f) { return f.toLowerCase() == user.name.toLowerCase() } ) === undefined
            }));
        };

        self.hideAddUserDialog = function () {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.currentUser(undefined);
            self.editorActive(false);
            self.userList.removeClass("disabled");
            self.addUserDialog.addClass("hide");
        };

        self.showAddUserDialog = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.currentUser(undefined);
            self.editorActive(true);
            self.userList.addClass("disabled");
            self.addUserDialog.removeClass("hide");
        };

        self.confirmAddUser = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            var user = {
                name: self.editorUsername(),
                password: self.editorPassword(),
                admin: self.editorAdmin(),
                active: self.editorActive()
            };

            self.addUser(user)
                .done(function() {
                    // close dialog
                    self.currentUser(undefined);
                    self.userList.removeClass("disabled");
                    self.addUserDialog.toggleClass("hide");
                });
        };

        self.showEditUserDialog = function(user) {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.currentUser(user);
            self.userList.addClass("disabled");
            self.editUserDialog.removeClass("hide");
        };

        self.confirmEditUser = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            var user = self.currentUser();
            user.active = self.editorActive();
            user.admin = self.editorAdmin();

            self.updateUser(user)
                .done(function() {
                    // close dialog
                    self.currentUser(undefined);
                    self.editUserDialog.removeClass("hide");
                });
        };

        self.hideChangePasswordDialog = function (user) {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.currentUser(undefined);
            self.userList.removeClass("disabled");
            self.changePasswordDialog.addClass("hide");
        };

        self.showChangePasswordDialog = function(user) {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.currentUser(user);
            self.userList.addClass("disabled");
            self.changePasswordDialog.removeClass("hide");
        };

        self.confirmChangePassword = function() {
            if (!CONFIG_ACCESS_CONTROL) return;
            var pw = self.editorPassword();
            if (pw !== undefined && pw != "") {
                self.updatePassword(self.currentUser().name, pw)
                    .done(function () {
                        var user = self.currentUser();
                        user.admin = self.editorAdmin();

                        self.updateUser(user).done(function () {
                            // close dialog
                            self.currentUser(undefined);
                            self.userList.removeClass("disabled");
                            self.changePasswordDialog.addClass("hide");
                        });

                    });
            }
            else
            {
                var user = self.currentUser();
                user.admin = self.editorAdmin();

                self.updateUser(user).done(function () {
                    // close dialog
                    self.currentUser(undefined);
                    self.userList.removeClass("disabled");
                    self.changePasswordDialog.addClass("hide");
                });
            }
        };

        self.confirmGenerateApikey = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.generateApikey(self.currentUser().name)
                .done(function(response) {
                    self._updateApikey(response.apikey);
                });
        };

        self.confirmDeleteApikey = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.deleteApikey(self.currentUser().name)
                .done(function() {
                    self._updateApikey(undefined);
                });
        };

        self._updateApikey = function(apikey) {
            self.editorApikey(apikey);
            self.requestData();
        };

        //~~ Framework

        self.onStartup = function() {
            self.addUserDialog = $("#settings-usersDialogAddUser");
            self.editUserDialog = $("#settings-usersDialogEditUser");
            self.userList = $("#user-list");
            self.changePasswordDialog = $("#settings-usersDialogChangePassword");
        };

        //~~ API calls

        self.addUser = function(user) {
            if (!user) {
                throw OctoPrint.InvalidArgumentError("user must be set");
            }
            
            if (self.reservedUsernames.find(function (f) { return f.toLowerCase() == user.name.toLowerCase() })) {
                // we do not allow to delete any of the reserved users
                $.notify({
                    title: gettext("Not possible"),
                    text: gettext("You cannot add a user with this username.")
                },
                    "error"
                );
                return $.Deferred().reject("You cannot add a user with this username").promise();
            }

            return OctoPrint.users.add(user)
            .done(
                self.fromResponse,
                $.notify({
                    title: gettext("User Created"),
                    text: _.sprintf(gettext('You have created "%(username)s"'), {username: user.name})},
                    "success"
                )
            );

        };

        self.removeUser = function(user) {
            if (!user) {
                throw OctoPrint.InvalidArgumentError("user must be set");
            }

            if (user.name == self.loginState.username()) {
                // we do not allow to delete ourselves
                $.notify({
                    title: gettext("Not possible"),
                    text: gettext("You may not delete your own account.")},
                    "error"
                );
                return $.Deferred().reject("You may not delete your own account").promise();
            }

            if (self.reservedUsernames.find(function (f) { return f.toLowerCase() == user.name.toLowerCase() }))
            {
                // we do not allow to delete any of the reserved users
                $.notify({
                    title: gettext("Not possible"),
                    text: gettext("You may not delete this reserved account.")
                },
                    "error"
                );
                return $.Deferred().reject("You may not delete this reserved account").promise();
            }

            return OctoPrint.users.delete(user.name)
                .done(
                    self.fromResponse,
                    $.notify({
                        title: gettext("User Deleted"),
                        text: _.sprintf(gettext('You have deleted "%(username)s"'), {username: user.name})},
                        "success"
                    )
                );

        };

        self.updateUser = function(user) {
            if (!user) {
                throw OctoPrint.InvalidArgumentError("user must be set");
            }

            return OctoPrint.users.update(user.name, user.active, user.admin)
                .done(self.fromResponse);
        };

        self.updatePassword = function(username, password) {
            return OctoPrint.users.changePassword(username, password);
        };

        self.generateApikey = function(username) {
            return OctoPrint.users.generateApiKey(username);
        };

        self.deleteApikey = function(username) {
            return OctoPrint.users.resetApiKey(username);
        };

        self.onUserLoggedIn = function(user) {
            if (user.admin) {
                self.requestData();
            }
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        UsersViewModel,
        ["loginStateViewModel"],
        []
    ]);
});
