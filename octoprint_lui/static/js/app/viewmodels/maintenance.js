$(function() {
    function MaintenanceViewModel(parameters) {
        var self = this;

        self.flyout = parameters[0];
        self.printerState = parameters[1];
        self.settings = parameters[2];


        self.sendJogCommand = function (axis, multiplier, distance) {
            if (typeof distance === "undefined")
                distance = $('#jog_distance button.active').data('distance');
            if (self.settings.printerProfiles.currentProfileData() && self.settings.printerProfiles.currentProfileData()["axes"] && self.settings.printerProfiles.currentProfileData()["axes"][axis] && self.settings.printerProfiles.currentProfileData()["axes"][axis]["inverted"]()) {
                multiplier *= -1;
            }

            var data = {};
            data[axis] = distance * multiplier;
            OctoPrint.printer.jog(data);
        };

        self.filamentLoadPosition = function () {

            var text = "You are about to move the printer to the maintenance position.";
            var question = "Do want to continue?";
            var title = "Maintenance position"
            var dialog = {'title': title, 'text': text, 'question' : question};

            self.flyout.showConfirmationFlyout(dialog)
                .done(function(){
                    self.moveToFilamentLoadPosition();
                });
        };

        self.cleanBedPosition = function () {

            var text = "You are about to move the printer to the clean bed position. This move will home all axis! Make sure there is no print on the bed.";
            var question = "Do want to continue?";
            var title = "Clean bed position"
            var dialog = {'title': title, 'text': text, 'question' : question};

            self.flyout.showConfirmationFlyout(dialog)
                .done(function(){
                    self.moveToMaintenancePosition();
                });
        };

        self.sendHomeCommand = function (axis) {
            OctoPrint.printer.home(axis);
        };

        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            OctoPrint.postJson(url, data);
        };

        self.moveToMaintenancePosition = function() {
            self._sendApi({
                command: 'move_to_maintenance_position'
            });
        };

        self.moveToFilamentLoadPosition = function() {
            self._sendApi({
                command: 'move_to_filament_load_position'
            });
        };

        self.startZoffset = function () {
            self.flyout.closeFlyoutAccept();
            self.flyout.showFlyout('zoffset');
        };

        self.startLevelBed = function ()
        {
            var text = "You are about to start the bed leveling sequence. This move will home all axis! Make sure there is no print on the bed.";
            var question = "Do want to continue?";
            var title = "Level bed"
            var dialog = { 'title': title, 'text': text, 'question': question };

            self.flyout.showConfirmationFlyout(dialog)
                .done(function () {
                    self.settings.sendCustomCommand({ type: 'command', command: 'G32', name: 'Level bed' });
                });
        }


    }
    // This is how our plugin registers itself with the application, by adding some configuration
    // information to the global variable ADDITIONAL_VIEWMODELS
    ADDITIONAL_VIEWMODELS.push([
        // This is the constructor to call for instantiating the plugin
        MaintenanceViewModel,

        // This is a list of dependencies to inject into the plugin, the order which you request
        // here is the order in which the dependencies will be injected into your view model upon
        // instantiation via the parameters argument
        ["flyoutViewModel", "printerStateViewModel", "settingsViewModel"],

        // Finally, this is the list of all elements we want this view model to be bound to.
        ["#maintenance_settings_flyout_content"]
    ]);
});
