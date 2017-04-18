$(function ()  {
    function FilamentDetectionViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.toolInfo = parameters[4];
        self.filament = parameters[5];

        self.temperatureSafetyTimerValue = ko.observable(undefined);

        self.temperatureSafetyTimerText = ko.pureComputed(function ()  {
            return formatDuration(self.temperatureSafetyTimerValue());
        });

        self.temperatureSafetyTimerPercentage = ko.pureComputed(function ()  {
            return (self.temperatureSafetyTimerValue() / 900) * 100;
        });

        self.showFilamentDetectionFlyout = function (tool) {

            self.filament.tool(tool);
            self.filament.loadedFilamentAmount(self.filament.getFilamentAmount(tool));

            $('.fd_step').removeClass('active');
            $('#filament_depleted').addClass('active');

            self.flyout.showFlyout('filament_detection', true)
                .done(function ()  {
                    self.filament.finishChangeFilament();
                    self._finishFilamentDetectionApi();
                    console.log('Filament detection flyout accepted');
                })
                .fail(function ()  {
                    self.filament.cancelChangeFilament();
                })
                .always(function ()  {
                    // If this closes we need to reset stuff
                    self.filament.filamentLoadProgress(0);
                    self.filament.filamentInProgress(false);
                });
        }

        self.startSwapFilamentWizard = function ()  {
            self._stopTempSafetyTimer();
            self.filament.filamentInProgress(true);
            self.filament.showUnload();

            fd_slider.noUiSlider.set(FILAMENT_ROLL_LENGTH)

            $('.fd_step').removeClass('active');
            $('#fd_filament_swap_wizard').addClass('active'); 
        }

        self.startPurgeWizard = function()
        {
            self._stopTempSafetyTimer();

            $('.fd_step').removeClass('active');
            $('#fd_filament_swap_wizard').addClass('active');
            $('.fd_swap_process_step').removeClass('active');
           
            //Will also load correct view (either heating or purge)
            self.filament.loadFilament('filament-detection-purge');
        }

        self.showFilamentDetectionWizardComplete = function()
        {
            $('.fd_step').removeClass('active');
            $('#filament_detection_wizard_complete').addClass('active');
        }

        self.completeFilamentDetection = function()
        {
            self.flyout.closeFlyoutAccept();
        }

        self.cancelFilamentDetection = function()
        {
            self.flyout.showConfirmationFlyout({
                title: gettext('Cancel print'),
                text: '',
                question: gettext('Are you sure you want to cancel your print?')
            })
                .done(function ()  {
                    //Cancel print
                    self._stopTempSafetyTimer();
                    self._cancelFilamentDetectionApi();
                    self.filament.requestData();
                });
           
        }

        self._stopTempSafetyTimer = function () {
            sendToApi("filament/" + self.filament.tool() + "/detection/stop_timer");
        }

        self._finishFilamentDetectionApi = function ()  {
            sendToApi("filament/" + self.filament.tool() + "/detection/finish");
        }

        self._cancelFilamentDetectionApi = function () {
            sendToApi("filament/" + self.filament.tool() + "/detection/cancel");
        }

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            var messageData = data['data'];
            switch (messageType) {
                case "filament_action_detected":
                    self.showFilamentDetectionFlyout(messageData['tool']);
                    break;
                case "temperature_safety":
                    self.temperatureSafetyTimerValue(messageData['timer']);
                    break;
            }
        }
    };

    if (FILAMENT_DETECTION) {
        OCTOPRINT_VIEWMODELS.push([
            FilamentDetectionViewModel,
            ["loginStateViewModel", "settingsViewModel", "flyoutViewModel", "printerStateViewModel", "toolInfoViewModel", "filamentViewModel"],
            ["#filament_detection_flyout"]
        ]);
    }
});
