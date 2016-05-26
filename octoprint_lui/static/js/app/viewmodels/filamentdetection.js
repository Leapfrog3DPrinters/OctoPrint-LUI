$(function () {
    function FilamentDetectionViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.flyout = parameters[2];
        self.printerState = parameters[3];
        self.temperatureState = parameters[4];
        self.filament = parameters[5];

        self.showFilamentDetectionFlyout = function (tool) {

            self.filament.tool(tool);
            self.filament.loadedFilamentAmount(self.filament.getFilamentAmount(tool));

            //TODO: Fix, material is empty at this point
            profile = self.filament.filaments().find(function (x) { return x.tool() === tool }).material;

            self.filament.selectedTemperatureProfile(profile);

            $('.fd_step').removeClass('active');
            $('#filament_depleted').addClass('active');

            self.flyout.showFlyout('filament_detection')
            .always(function () {
                // If this closes we need to reset stuff
                self.filament.filamentLoadProgress(0);
                self.filament.filamentInProgress(false);
            })
            .done(function () {
                self.filament.changeFilamentDone();
            })
            .fail(function () {
                self.filament.changeFilamentCancel();
            });
        }

        self.startSwapFilamentWizard = function () {
            self.filament.filamentInProgress(true);
            self.filament.changeFilament(self.filament.tool());
            self.filament.showUnload();

            $('.fd_step').removeClass('active');
            $('#fd_filament_swap_wizard').addClass('active');

            $('#fd-swap-load-unload').addClass('active');
            $('#fd-swap-info').removeClass('active')

            $('.fd_swap_process_step').removeClass('active');
            $('#fd_unload_filament').addClass('active');
            $('#fd_unload_cmd').removeClass('disabled');
        }

        self.startPurgeWizard = function()
        {

        }

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
            }
        }
    };

    OCTOPRINT_VIEWMODELS.push([
        FilamentDetectionViewModel,
        ["loginStateViewModel", "settingsViewModel", "flyoutViewModel", "printerStateViewModel", "temperatureViewModel", "filamentViewModel"],
        ["#filament_detection_flyout"]
    ]);

});
