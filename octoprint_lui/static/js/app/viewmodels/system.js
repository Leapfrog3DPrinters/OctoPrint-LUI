$(function() {
    function SystemViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];

        self.lastCommandResponse = undefined;
        self.systemActions = ko.observableArray([]);

        self.requestData = function() {
            self.requestCommandData();
        };

        self.requestCommandData = function() {
            if (!self.loginState.isAdmin()) {
                return $.Deferred().reject().promise();
            }

            return OctoPrint.system.getCommands()
                .done(self.fromCommandResponse);
        };

        self.fromCommandResponse = function(response) {
            var actions = [];
            if (response.core && response.core.length) {
                _.each(response.core, function(data) {
                    var action = _.extend({}, data);
                    action.actionSource = "core";
                    actions.push(action);
                });
                actions.push({action: "divider"});
            }
            _.each(response.custom, function(data) {
                var action = _.extend({}, data);
                action.actionSource = "custom";
                actions.push(action);
            });
            self.lastCommandResponse = response;
            self.systemActions(actions);
        };

        self.triggerCommand = function(commandSpec) {
            var deferred = $.Deferred();

            var callback = function() {
                OctoPrint.system.executeCommand(commandSpec.actionSource, commandSpec.action)
                    .done(function() {
                        $.notify({
                            title: "Success",
                            text: _.sprintf(gettext("The command \"%(command)s\" executed successfully"), {command: commandSpec.name})},
                            "success"
                        );
                        deferred.resolve(["success", arguments]);
                    })
                    .fail(function(jqXHR, textStatus, errorThrown) {
                        if (!commandSpec.hasOwnProperty("ignore") || !commandSpec.ignore) {
                            // jqXHR.responseText
                            $.notify({
                                title: "Error",
                                text: _.sprintf(gettext('The command "%(command)s" could not be executed. Please check logs.'), {command: commandSpec.name})},
                                "error"
                            );
                            deferred.reject(["error", arguments]);
                        } else {
                            deferred.resolve(["ignored", arguments]);
                        }
                    });
            };

            // Out for now, no confirmation dialog yet.
            // if (commandSpec.confirm) {
            //     showConfirmationDialog({
            //         message: commandSpec.confirm,
            //         onproceed: function() {
            //             callback();
            //         },
            //         oncancel: function() {
            //             deferred.reject("cancelled", arguments);
            //         }
            //     });
            // } else {
                callback();
            // }

            return deferred.promise();
        };

        self.onUserLoggedIn = function(user) {
            if (user.admin) {
                self.requestData();
            } else {
                self.onUserLoggedOut();
            }
        };

        self.onUserLoggedOut = function() {
            self.lastCommandResponse = undefined;
            self.systemActions([]);
        };

        self.onEventSettingsUpdated = function() {
            if (self.loginState.isAdmin()) {
                self.requestData();
            }
        };
    }

    // view model class, parameters for constructor, container to bind to
    ADDITIONAL_VIEWMODELS.push([
        SystemViewModel,
        ["loginStateViewModel"],
        []
    ]);
});
