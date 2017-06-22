$(function () {
    function NavigationViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.flyout = parameters[1];
        self.printerState = parameters[2];
        self.settings = parameters[3];
        self.system = parameters[4];

        self.allViewModels = [];

        self.numUpdates = ko.observable(0);

        self.isLocalLocked = ko.observable(false);
        self.givenLockCode = ko.observable(undefined);
        self.triesTimeout = ko.observable(false);
        self.invalidUnlockTimer = ko.observable(0);

        var unlockTries = 3;

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
        };

        self.lock = function () {
            if(self.flyout.isFlyoutOpen("login")){
                self.flyout.closeFlyout();
            }
            sendToApi("printer/security/local_lock/lock");
        };

        self.unlock = function (code) {
            //TODO: Confirm code before unlocking
            sendToApi("printer/security/local_lock/check_code",{
                givenCode: code,
                isLocal: IS_LOCAL
            });
            self.givenLockCode(undefined);
            return;
        };

        self.startInvalidUnlockTimer = function () {
            sendToApi('printer/security/local_lock/invalid_unlock');
        };

        //TODO: Remove!
        self.doDebuggingAction = function ()  {
            sendToApi("printer/debugging_action");
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
                            self.settings.sendAutoShutdownStatus(true);
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

            // Wait for the opening transition to complete
            // Don't rely on transitionend here, functionality is too critical
            window.setTimeout(function () {
                callViewModels(self.allViewModels, "onSettingsShown");
                callViewModels(self.allViewModels, "on" + settingsTopic + "SettingsShown");
            }, 300);

            return self.flyout.showFlyout(topic + '_settings', blocking, high_priority)
                .done(function () {
                    // Only save if flyout has been accepted
                    window.setTimeout(function () {
                        self.settings.saveData();
                    }, 300);
                })
                .always(function () {

                    // Wait for the closing transition to complete
                    window.setTimeout(function () {
                        callViewModels(self.allViewModels, "onSettingsHidden");
                        callViewModels(self.allViewModels, "on" + settingsTopic + "SettingsHidden");
                    }, 300);
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
                        callViewModels(self.allViewModels, "onShutdownOrDisconnectFlyout");
                        break;
                    case "local_lock_locked":
                        self.flyout.showFlyout("locallock", true);
                        break;
                    case "local_lock_unlocked":
                        if(messageData.is_local == IS_LOCAL){
                            self.flyout.closeFlyout("locallock");
                        }
                        break;
                    case "local_invalid_unlock_timer":
                        if (!$('#locallock_flyout').hasClass('active')) {
                            self.flyout.showFlyout("locallock", true);
                        }
                        self.invalidUnlockTimer(messageData.timer);
                        self.triesTimeout(true);
                        break;
                    case "local_invalid_unlock_reset":
                        self.triesTimeout(false);
                        self.invalidUnlockTimer(0);
                        unlockTries = 3;
                        break;
                    case "local_lock_wrong_code":
                        if(messageData.is_local == IS_LOCAL) {
                            $.notify({title: gettext("Wrong code"), text: gettext("The code is not correct")}, "error");
                            if (unlockTries > 1) {
                                unlockTries--;
                            } else {
                                self.startInvalidUnlockTimer();
                                self.triesTimeout(true);
                                self.invalidUnlockTimer(30);
                            }
                        }
                        break;
                }
            }
        }

        self.onAllBound = function (allViewModels) {
            self.allViewModels = allViewModels;
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        NavigationViewModel,
        ["loginStateViewModel", "flyoutViewModel", "printerStateViewModel", "settingsViewModel", "systemViewModel"],
        ["#header", "#settings", "#auto_shutdown_flyout", "#printer_error_flyout", "#startup_flyout", "#locallock_flyout_content"]
    ]);
});
