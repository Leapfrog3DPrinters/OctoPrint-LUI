$(function() {
    function SystemViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.flyout = parameters[1];

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
                if (commandSpec.before) commandSpec.before();
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
                    })
                    .always(function(){
                        if (commandSpec.after) commandSpec.after();
                    });
            };

            // Confirmation Dialog
            if (commandSpec.confirm) {
                self.flyout.showConfirmationFlyout(commandSpec.confirm)
                    .done(function(){
                        callback();
                    })
                    .fail(function(){
                        deferred.reject("cancelled", arguments);
                    });
            } else {
                callback();
            }

            return deferred.promise();
        };

        self.systemReboot = function() {
            console.log("System Reboot called")
            var dialog = {'title': 'Reboot system', 'text': 'You are about to reboot the system.', 'question' : 'Do you want to continue?'};
            var command = {'actionSource': 'custom', 'action': 'reboot', 'name': 'Reboot', confirm: dialog};
            self.triggerCommand(command);
        };

        self.systemShutdown = function (confirm) {
            confirm = confirm !== false;

            var dialog = { 'title': 'Shutdown system', 'text': 'You are about to shutdown the system.', 'question': 'Do you want to continue?' };
            var command = { 'actionSource': 'custom', 'action': 'shutdown', 'name': 'Shutdown'}

            if (confirm)
                command.confirm = dialog;

            self.triggerCommand(command);
        };

        self.systemServiceRestart = function() {
            var dialog = {'title': 'Restart system service', 'text': 'You are about to restart the background printer services.', 'question' : 'Do you want to continue?'};
            var command = {'actionSource': 'custom', 'action': 'restart_service', 'name': 'Restart service', confirm: dialog};
            self.triggerCommand(command);
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

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            var messageType = data['type'];
            var messageData = data['data'];

            if (plugin == "lui") {
                switch (messageType) {
                    case "powerbutton_pressed":
                        self.systemShutdown();
                }
            }
        }
    }

    // view model class, parameters for constructor, container to bind to
    ADDITIONAL_VIEWMODELS.push([
        SystemViewModel,
        ["loginStateViewModel", "flyoutViewModel"],
        []
    ]);
});
