$(function () {
    function NavigationViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.flyout = parameters[1];
        self.printerState = parameters[2];
        self.settings = parameters[3];
        self.system = parameters[4];

        self.numUpdates = ko.observable(0);

        self.isLocalLocked = ko.observable(false);

        self.showLoginFlyout = function ()  {
            self.flyout.showFlyout('login');
        }

        self.setOverlay = function () {
            var flyouts = self.flyout.flyouts();
            var isFlyoutOpen = self.flyout.warnings().length > 0 || self.flyout.infos().length > 0 || self.flyout.flyouts().length > 0 ||
                $('#confirmation_flyout').hasClass('active') || $(self.flyout.template_flyout).hasClass('active');

            if (isFlyoutOpen || self.isLocalLocked())
                $('.overlay').addClass('active');
            else
                $('.overlay').removeClass('active');
        }
        
        self.lock = function()
        {
            //TODO: Notify and lock backend
            self.isLocalLocked(true);
        }

        self.unlock = function (code) {
            //TODO: Confirm code before unlocking
            self.isLocalLocked(false);
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

        self.showMaintenanceFlyout = function () {
            self.showSettingsTopic('maintenance', true)
        }

        self.showLogsFlyout = function () {
            self.showSettingsTopic('logs', true)
        }

        self.requestServiceRestart = function (confirm)
        {
            if(confirm)
            {
                self.flyout.showConfirmationFlyout({ 
                    'title': gettext('Restart system service'), 
                    'text': gettext('You are about to restart the background printer services.'), 
                    'question': gettext('Do you want to continue?')
                }).done(self.system.systemServiceRestart);
            }
            else
            {
                self.system.systemServiceRestart();
            }
        }

        self.requestSystemReboot = function (confirm)
        {
            if (confirm)
            {
                self.flyout.showConfirmationFlyout({
                    'title': gettext('Reboot printer'),
                    'text': gettext('You are about to reboot the printer.'),
                    'question': gettext('Do you want to continue?')
                }).done(self.system.systemReboot);
            }
            else
            {
                self.system.systemReboot();
            }
        }

        self.requestSystemShutdown = function (confirm) {
            confirm = confirm !== false;

            if (confirm) {
                if (self.printerState.isPrinting() && !self.settings.autoShutdown()) {
                    self.flyout.showFlyout('shutdown_confirmation')
                        .done(function () {
                            // Enable auto-shutdown
                            self.settings.autoShutdown(true);
                            self.settings.sendAutoShutdownStatus();
                        });
                }
                else {
                    self.flyout.showConfirmationFlyout({
                        'title': gettext('Shutdown printer'),
                        'text': gettext('You are about to shutdown the printer.'),
                        'question': gettext('Do you want to continue?')
                    }).done(self.system.systemShutdown);
                }
            }
            else {
                // Shutdown immediately
                self.system.systemShutdown();
            }
        };

        self.showSettingsTopic = function (topic, blocking, high_priority) {
            var settingsTopic = capitalize(topic);
            callViewModels(self.allViewModels, "onSettingsShown");
            callViewModels(self.allViewModels, "on" + settingsTopic + "SettingsShown");

            return self.flyout.showFlyout(topic + '_settings', blocking, high_priority)
                .done(function () {
                    self.settings.saveData();
                })
                .always(function () {
                    callViewModels(self.allViewModels, "onSettingsHidden");
                });
        };

        self.onStartup = function()
        {
            $('.network-status a').click(function () { self.showSettingsTopic('wireless') });

            self.isLocalLocked.subscribe(self.setOverlay);
            self.flyout.warnings.subscribe(self.setOverlay);
            self.flyout.infos.subscribe(self.setOverlay);
            self.flyout.flyouts.subscribe(self.setOverlay);
            self.flyout.confirmation_title.subscribe(self.setOverlay);
        }

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            var messageType = data['type'];
            var messageData = data['data'];

            if (plugin == "lui") {
                switch (messageType) {
                    case "powerbutton_pressed":
                        self.requestSystemShutdown();
                }
            }
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        NavigationViewModel,
        ["loginStateViewModel", "flyoutViewModel", "printerStateViewModel", "settingsViewModel", "systemViewModel"],
        ["#header", "#settings", "#auto_shutdown_flyout", "#printer_error_flyout", "#startup_flyout", "#locallock-unlock-container"]
    ]);
});
