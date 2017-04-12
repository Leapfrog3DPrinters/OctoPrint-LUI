$(function () {
    function ConnectionViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.printerProfiles = parameters[2];
        self.printerState = parameters[3];

        self.printerProfiles.profiles.items.subscribe(function () {
            var allProfiles = self.printerProfiles.profiles.items();

            var printerOptions = [];
            _.each(allProfiles, function(profile) {
                printerOptions.push({id: profile.id, name: profile.name});
            });
            self.printerOptions(printerOptions);
        });

        self.printerProfiles.currentProfile.subscribe(function () {
            self.selectedPrinter(self.printerProfiles.currentProfile());
        });

        self.portOptions = ko.observableArray(undefined);
        self.baudrateOptions = ko.observableArray(undefined);
        self.printerOptions = ko.observableArray(undefined);
        self.selectedPort = ko.observable(undefined);
        self.selectedBaudrate = ko.observable(undefined);
        self.selectedPrinter = ko.observable(undefined);
        self.saveSettings = ko.observable(undefined);
        self.autoconnect = ko.observable(undefined);

        self.buttonText = ko.computed(function () {
            if (self.printerState.isErrorOrClosed())
                return gettext("Connect");
            else
                return gettext("Disconnect");
        });

        self.previousIsOperational = undefined;

        self.requestData = function () {
            OctoPrint.connection.getSettings()
                .done(self.fromResponse);
        };

        self.fromResponse = function(response) {
            var ports = response.options.ports;
            var baudrates = response.options.baudrates;
            var portPreference = response.options.portPreference;
            var baudratePreference = response.options.baudratePreference;
            var printerPreference = response.options.printerProfilePreference;
            var printerProfiles = response.options.printerProfiles;

            self.portOptions(ports);
            self.baudrateOptions(baudrates);

            if (!self.selectedPort() && ports && ports.indexOf(portPreference) >= 0)
                self.selectedPort(portPreference);
            if (!self.selectedBaudrate() && baudrates && baudrates.indexOf(baudratePreference) >= 0)
                self.selectedBaudrate(baudratePreference);
            if (!self.selectedPrinter() && printerProfiles && printerProfiles.indexOf(printerPreference) >= 0)
                self.selectedPrinter(printerPreference);

            self.saveSettings(false);
        };

        self.connect = function () {
            if (self.printerState.isErrorOrClosed()) {
                var data = {
                    "port": self.selectedPort() || "AUTO",
                    "baudrate": self.selectedBaudrate() || 0,
                    "printerProfile": self.selectedPrinter(),
                    "autoconnect": self.settings.serial_autoconnect()
                };

                if (self.saveSettings())
                    data["save"] = true;

                OctoPrint.connection.connect(data)
                    .done(function () {
                    });
            } else {
                self.requestData();
                sendToApi("printer/notify_intended_disconnect").always(function () {
                    OctoPrint.connection.disconnect();
                });
            }
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        ConnectionViewModel,
        ["loginStateViewModel", "settingsViewModel", "printerProfilesViewModel", "printerStateViewModel"],
        "#connection_settings_flyout_content"
    ]);
});
