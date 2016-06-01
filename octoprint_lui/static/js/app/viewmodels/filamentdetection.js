$(function () {
    function FilamentDetectionViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.temperatureState = parameters[4];
        self.filament = parameters[5];

        self.temperatureSafetyTimerValue = ko.observable(undefined);

        self.temperatureSafetyTimerText = ko.pureComputed(function () {
            return formatDuration(self.temperatureSafetyTimerValue());
        });

        self.temperatureSafetyTimerPercentage = ko.pureComputed(function () {
            return (self.temperatureSafetyTimerValue() / 900) * 100;
        });

        self.showFilamentDetectionFlyout = function (tool) {

            self.filament.tool(tool);
            self.filament.loadedFilamentAmount(self.filament.getFilamentAmount(tool));

            $('.fd_step').removeClass('active');
            $('#filament_depleted').addClass('active');

            self.flyout.showFlyout('filament_detection', true)
            .always(function () {
                // If this closes we need to reset stuff
                self.filament.filamentLoadProgress(0);
                self.filament.filamentInProgress(false);
            });
        }

        self.startSwapFilamentWizard = function () {
            self._cancelTempSafetyTimer();
            self.filament.filamentInProgress(true);
            self.filament.changeFilament(self.filament.tool());
            self.filament.showUnload();

            fd_slider.noUiSlider.set(330)

            $('.fd_step').removeClass('active');
            $('#fd_filament_swap_wizard').addClass('active');

           // $('#fd-swap-load-unload').addClass('active');
           // $('#fd-swap-info').removeClass('active')

            // $('.fd_swap_process_step').removeClass('active');
            // $('#fd_unload_filament').addClass('active');
           // $('#fd_unload_cmd').removeClass('disabled');
        }

        self.startPurgeWizard = function()
        {
            self._cancelTempSafetyTimer();
            $('.fd_step').removeClass('active');
            $('#fd_filament_swap_wizard').addClass('active');
            $('.fd_swap_process_step').removeClass('active');
            $('#fd_finished_filament').addClass('active');
        }

        self.cancelFilamentDetection = function()
        {
            self.flyout.showConfirmationFlyout({
                title: 'Cancel print',
                text: '',
                question: 'Are you sure you want to cancel your print?'
            })
                .done(function () {
                    //Cancel print
                    self._cancelFilamentDetectionApi();
                    self.requestData();
                });
           
        }

        self._cancelFilamentDetectionApi = function()
        {
            self._sendApi({
                command: "filament_detection_cancel"
            });
        }

        self._cancelTempSafetyTimer = function()
        {
            self._sendApi({
                command: "temperature_safety_timer_cancel"
            });
        }

        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            OctoPrint.postJson(url, data);
        };

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            console.log(data);

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

    OCTOPRINT_VIEWMODELS.push([
        FilamentDetectionViewModel,
        ["loginStateViewModel", "settingsViewModel", "flyoutViewModel", "printerStateViewModel", "temperatureViewModel", "filamentViewModel"],
        ["#filament_detection_flyout"]
    ]);

});
