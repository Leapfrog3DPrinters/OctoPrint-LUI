$(function () {
    function MaintenanceViewModel(parameters) {
        var self = this;

        self.flyout = parameters[0];
        self.printerState = parameters[1];
        self.settings = parameters[2];
        self.temperatures = parameters[3];
        self.filament = parameters[4];
        self.navigation = parameters[5];

        self.poweringUpInfo = null;
        self.movingToMaintenancePositionInfo = null;

        self.getPurgeButtonContents = function (tool) {
            switch (tool) {
                case 'tool0':
                    return '<i class="fa fa-arrow-down"></i>' + gettext('Purge right');
                case 'tool1':
                    return '<i class="fa fa-arrow-down"></i>' + gettext('Purge left');
            }
        };

        self.headMaintenancePosition = function () {

            var text = gettext("You are about to move the printer to the maintenance position. This will turn off the power of the printer temporarily, shutting down the LED lights with it. ");
            var question = gettext("Do you want to continue?");
            var title = gettext("Maintenance position");
            var dialog = {'title': title, 'text': text, 'question' : question};

            self.flyout.showConfirmationFlyout(dialog, true)
                .done(function ()  {
                    self.moveToHeadMaintenancePosition();
                });
        };

        self.cleanBedPosition = function ()  {

            var text = gettext("You are about to move the printer to the clean bed position. This move will home all axis! Make sure there is no print on the bed.");
            var question = gettext("Do want to continue?");
            var title = gettext("Clean bed position");
            var dialog = {'title': title, 'text': text, 'question' : question};

            self.flyout.showConfirmationFlyout(dialog, true)
                .done(function(){
                    self.moveToCleanBedPosition();

                    self.flyout.showInfo(gettext('Maintenance position'), gettext('Press OK when you are done with cleaning the bed. This will home the printer.'), false, self.afterMaintenance);
                });
        };

        self.afterHeadMaintenance = function () {
            sendToApi("maintenance/head/swap/finish");
        };

        self.afterMaintenance = function()
        {
            OctoPrint.printer.home(['x', 'y']);
        };

        self.calibrateExtruders = function ()  {
            self.flyout.showFlyout('extrudercalibration', true);
        };

        self.calibrateBed = function()
        {
            self.flyout.showFlyout('bedcalibration', true);
        };

        self.sendHomeCommand = function (axis) {
            OctoPrint.printer.home(axis);
        };

        self.moveToCleanBedPosition = function () {
            sendToApi("maintenance/bed/clean/start").done(function ()  {
                $.notify({ title: gettext("Clean bed"), text: gettext("The printer is moving towards the clean bed position.") }, "success");
            });
        };

        self.moveToHeadMaintenancePosition = function (skipHeatCheck) {
            //TODO: Include temperature check
            var tools = self.temperatures.tools();

            if (!skipHeatCheck &&
                (tools[0]["actual"]() >= 50 || tools[1]["actual"]() >= 50))
            {
                var text = gettext("One of the print heads has not cooled down yet. Print head maintenance may cause serious injury. It is adviced to wait for the print heads to cool down.");
                var question = gettext("Are you sure you want to continue?");
                var title = gettext("Clean bed position")
                var dialog = { 'title': title, 'text': text, 'question': question };

                self.flyout.showConfirmationFlyout(dialog, true)
                .done(function () {
                    self.moveToHeadMaintenancePosition(true); // Retry, but skip heat check
                });

                return;
            }

            // From here only executed if temperatures are < 50, or heat check is ignored
            sendToApi("maintenance/head/swap/start");

            self.movingToMaintenancePositionInfo = self.flyout.showInfo(gettext("Maintenance position"), gettext("The printhead is moving towards the maintenance position."), true);
        };

        self.completeHeadMaintenance = function()
        {
            if (self.movingToMaintenancePositionInfo !== undefined) {
                self.flyout.closeInfo(self.movingToMaintenancePositionInfo);
                self.flyout.showInfo(gettext('Maintenance position'), gettext('Press OK when you are done with the print head maintenance. This will home the printer.'), false, self.afterHeadMaintenance);
                self.movingToMaintenancePositionInfo = undefined;
            }

        };

        self.beginPurgeWizard = function (tool)
        {
            if (self.filament.getFilamentMaterial(tool) == "None")
                return;

            var text = gettext("You are about to move the printer to the filament load position.");
            var question = gettext("Do want to continue?");
            var title = gettext("Purge nozzle");
            var dialog = { 'title': title, 'text': text, 'question': question };

            self.flyout.showConfirmationFlyout(dialog)
                .done(function ()  {
                    self.filament.showFilamentChangeFlyout(tool, true);
                });
        };

        self.setFilamentAmount = function () {
            self.filament.requestData();
            self.flyout.showFlyout('filament_override')
        };

        self.logFiles = function ()
        {
            self.navigation.showSettingsTopic('logs');
        };

        self.onSettingsShown = function () {
            $('#maintenance_control').addClass('active');
            $('#maintenance_filament').removeClass('active');

        };

        // Handle plugin messages
        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            switch (messageType) {

                case "head_in_maintenance_position":
                    self.completeHeadMaintenance();
                    break;
                case "powering_up_after_maintenance":
                    var title = gettext("Reconnecting to printer");
                    var message = gettext("Please wait while the printer is being reconnected. Note that the printer will home automatically.");
                    self.poweringUpInfo = self.flyout.showInfo(title, message, true);
                    break;
                case "is_homed":
                    if (self.poweringUpInfo != undefined) {
                        self.flyout.closeInfo(self.poweringUpInfo);
                    }
                    break;
            }
        }
    }
    ADDITIONAL_VIEWMODELS.push([
        MaintenanceViewModel,
        ["flyoutViewModel", "printerStateViewModel", "settingsViewModel", "temperatureViewModel", "filamentViewModel", "navigationViewModel"],
        ["#maintenance_settings_flyout_content"]
    ]);
});
